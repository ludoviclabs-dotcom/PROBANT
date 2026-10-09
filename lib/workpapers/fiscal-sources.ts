import { z } from "zod";
import type { FecEntry, TaxDocumentSnapshot } from "@/lib/canonical-model";
import { cents, money } from "@/lib/canonical-model/money";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { sha256 } from "@/lib/evidence/hash";
import { parseFec } from "@/lib/fec/parser";
import { readStructuredTaxDocument, type ParsedTaxDocumentInput, type RawTaxFieldInput } from "@/lib/ingestion/tax-document-input";
import { buildTaxDocumentSnapshot, TAX_DOCUMENT_SPECS } from "@/lib/ingestion/tax-document-snapshot";
import type { IngestionDocumentType } from "@/lib/ingestion/types";
import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { createTaxDocumentSnapshot } from "@/lib/tax/canonical";
import { eurosToCents, fecDateToIso } from "@/lib/tax/vat/ledger";
import type { ImportBatch, ImportMapping, ImportReport } from "./imports";
import { frozen, moneySchema, scopeSchema, type SourceDocumentVersion, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

/**
 * Qualified sources of the fiscal sheets (Mission 13). The FEC is read by the existing FEC parser and the
 * declarations by the existing tax document processor: this module stores their output as versioned batches
 * and rebuilds the canonical objects the engines expect. It computes no tax.
 */
export const FX_TABULAR_TYPES = ["fx_invoices", "fx_vat_payments", "fx_support"] as const;
export const FX_DECLARATION_TYPES = ["fx_vat_return", "fx_cit_return"] as const;
export const FX_TYPES = ["fx_fec", ...FX_DECLARATION_TYPES, ...FX_TABULAR_TYPES] as const;
export type FiscalTabularType = typeof FX_TABULAR_TYPES[number];
export type FiscalDeclarationType = typeof FX_DECLARATION_TYPES[number];
export type FiscalSourceType = typeof FX_TYPES[number];
export const FX_SOURCE_LABELS: Record<FiscalSourceType, string> = {
  fx_fec: "FEC / grand livre de l’exercice",
  fx_vat_return: "Déclaration de TVA (CA3 ou CA12), versionnée par période",
  fx_cit_return: "Liasse et déclaration d’IS (2058-A, 2058-B, 2033-B, 2065), versionnées par formulaire",
  fx_invoices: "Inventaire des factures (pièces)",
  fx_vat_payments: "Paiements de TVA au Trésor",
  fx_support: "Pièces justificatives (tableau)",
};
export const FX_PARSERS = { fec: "fiscal-fec-1.0.0", declaration: "fiscal-declaration-1.0.0" } as const;
const MAX_BYTES = 3 * 1024 * 1024, MAX_FEC_LINES = 20_000;
const ROW_LIMITS: Record<FiscalTabularType, number> = { fx_invoices: 20_000, fx_vat_payments: 500, fx_support: 2_000 };
/** Declaration document types accepted per fiscal source; the processor spec gives the tax and the forms. */
export const FX_DECLARATION_DOCUMENTS = {
  fx_vat_return: ["declaration_tva_ca3", "declaration_tva_ca12"],
  fx_cit_return: ["liasse_2050_2059", "liasse_2033", "declaration_2065"],
} as const satisfies Record<FiscalDeclarationType, readonly IngestionDocumentType[]>;
export type FiscalDeclarationDocument = typeof FX_DECLARATION_DOCUMENTS[FiscalDeclarationType][number];

export class FiscalSourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "FiscalSourceError"; }
}

const id = z.string().trim().min(1).max(200);
export const fiscalMappingSchema = z.object({
  version: z.literal("fiscal-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
  fiscal: z.object({ basis: z.enum(["invoices", "payments", "support"]), periodStartColumn: id.optional(), periodEndColumn: id.optional(),
    directionColumn: id.optional(), baseColumn: id.optional(), labelColumn: id.optional() }).strict(),
}).strict();
export type FiscalMapping = z.infer<typeof fiscalMappingSchema>;
const BASES: Record<FiscalTabularType, FiscalMapping["fiscal"]["basis"]> = { fx_invoices: "invoices", fx_vat_payments: "payments", fx_support: "support" };
export const declarationFormSchema = z.object({ documentType: z.enum(["declaration_tva_ca3", "declaration_tva_ca12", "liasse_2050_2059", "liasse_2033", "declaration_2065"]),
  expectedSiren: z.string().regex(/^\d{9}$/).optional() }).strict();
export type DeclarationForm = z.infer<typeof declarationFormSchema>;
const declarationMappingSchema = z.object({ version: z.literal("fiscal-declaration-1"), headerRow: z.literal(1), columns: z.object({ key: z.literal("fieldCode"), amount: z.literal("rawValue"), date: z.literal("periodEnd") }).strict(),
  delimiter: z.literal(";"), decimal: z.literal(","), dateFormat: z.literal("ISO"), sign: z.literal(1), currency: z.literal("EUR"),
  fiscal: z.object({ basis: z.literal("declaration"), documentType: declarationFormSchema.shape.documentType, expectedSiren: z.string().nullable(), schemaVersion: z.string().nullable(), parsedDocumentType: z.string().nullable(),
    formNumber: z.string().nullable(), formVintage: z.number().int().nullable(), siren: z.string().nullable(), periodStart: z.string().nullable(), periodEnd: z.string().nullable(), fiscalYear: z.number().int().nullable(),
    parsedWarnings: z.array(z.string()) }).strict() }).strict();
const fecMappingSchema = z.object({ version: z.literal("fiscal-fec-1"), headerRow: z.literal(1), columns: z.object({ key: z.literal("EcritureNum"), amount: z.literal("Debit-Credit"), date: z.literal("EcritureDate") }).strict(),
  delimiter: z.enum([";", "\t", "|"]), decimal: z.literal(","), dateFormat: z.literal("ISO"), sign: z.literal(1), currency: z.literal("EUR"),
  fiscal: z.object({ basis: z.literal("fec"), variant: z.enum(["debit-credit", "montant-sens"]) }).strict() }).strict();
const cell = (row: SourceRow, col?: string) => col ? row.original[col]?.trim() ?? "" : "";
export function fiscalDate(raw: string, format: "ISO" | "DD/MM/YYYY") {
  const s = raw.trim(), date = format === "ISO" ? s : /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : "";
  return isCivilDate(date) ? date : null;
}
const report = (rows: SourceRow[], blocking: string[], warnings: string[], sourceTotal: ImportReport["sourceTotal"]): ImportReport => ({
  status: blocking.length ? "rejected" : warnings.length ? "accepted_with_warnings" : "accepted", acceptedRows: rows.filter(r => !r.errors.length).length, rejectedRows: rows.filter(r => r.errors.length).length,
  duplicateRows: 0, sourceTotal, normalizedTotal: money(0n), warnings, blocking, calculationAllowed: false });
function seal(scope: WorkpaperScope, document: SourceDocumentVersion, mapping: ImportMapping, rows: SourceRow[], r: ImportReport, parser: string): ImportBatch {
  const mappingHash = stableSha256(mapping), id = `import-${stableSha256({ scope, byteHash: document.byteHash, documentType: document.documentType, mappingHash, parser })}`;
  const base = { id, scope, document, mapping, mappingHash, rows, report: r };
  return frozen({ ...base, previewHash: stableSha256(base) });
}
async function bytesOf(file: File, extensions: string[]) {
  const name = file.name.toLowerCase();
  if (!extensions.some(e => name.endsWith(e))) throw new Error("FX_FILE_FORMAT_UNSUPPORTED");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("UPLOAD_SIZE_INVALID");
  return bytes;
}

// -- FEC ---------------------------------------------------------------------
const FEC_REQUIRED = ["JournalCode", "EcritureNum", "EcritureDate", "CompteNum", "PieceRef", "PieceDate", "EcritureLib"];
/**
 * The FEC is read by the historical FEC parser. Any parse error, missing column, invalid date or unbalanced entry
 * blocks the import: an unreadable amount is never turned into zero.
 */
export async function previewFec(file: File, scope: WorkpaperScope, period: AccountingPeriod, principal: Principal): Promise<ImportBatch> {
  authorize(principal, scope, "prepare"); scopeSchema.parse(scope);
  const bytes = await bytesOf(file, [".txt", ".csv"]);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("FX_FEC_ENCODING_UTF8_REQUIRED"); }
  const parsed = parseFec(text), blocking: string[] = [], warnings: string[] = [];
  if (parsed.entries.length > MAX_FEC_LINES) throw new Error("FX_FEC_LINE_LIMIT");
  const missing = FEC_REQUIRED.filter(c => !parsed.headerColumns.includes(c));
  if (missing.length) blocking.push("FX_FEC_COLUMNS_MISSING:" + missing.join(","));
  if (parsed.variante === "inconnue") blocking.push("FX_FEC_AMOUNT_COLUMNS_MISSING");
  if (parsed.parseErrors.length) blocking.push("FX_FEC_ROWS_REJECTED:" + parsed.parseErrors.slice(0, 5).join(" | "));
  const byteHash = sha256(bytes), documentType = "fx_fec";
  const documentId = `source-${stableSha256({ scope, byteHash, documentType, parser: FX_PARSERS.fec })}`;
  const document: SourceDocumentVersion = { id: documentId, logicalId: documentType, scope, fileName: file.name, format: "csv", documentType, byteHash, storageRef: documentId, sizeBytes: bytes.length, parserVersion: FX_PARSERS.fec };
  const balance = new Map<string, bigint>();
  let outside = 0;
  const rows: SourceRow[] = parsed.entries.map(e => {
    const errors: string[] = [], date = fecDateToIso(e.ecritureDate), pieceDate = e.pieceDate ? fecDateToIso(e.pieceDate) : null;
    if (!date || !isCivilDate(date)) errors.push("FX_FEC_DATE_INVALID");
    if (e.pieceDate && (!pieceDate || !isCivilDate(pieceDate))) errors.push("FX_FEC_PIECE_DATE_INVALID");
    if (!e.journalCode || !e.ecritureNum || !e.compteNum) errors.push("FX_FEC_IDENTIFIER_REQUIRED");
    if (e.debit < 0 || e.credit < 0) errors.push("FX_FEC_NEGATIVE_AMOUNT");
    const debit = BigInt(eurosToCents(e.debit)), credit = BigInt(eurosToCents(e.credit)), key = `${e.journalCode}:${e.ecritureNum}`;
    balance.set(key, (balance.get(key) ?? 0n) + debit - credit);
    if (date && (date < period.startDate || date > period.closingDate)) outside++;
    const original = { JournalCode: e.journalCode, JournalLib: e.journalLib, EcritureNum: e.ecritureNum, EcritureDate: e.ecritureDate, CompteNum: e.compteNum, CompteLib: e.compteLib,
      CompAuxNum: e.compAuxNum, CompAuxLib: e.compAuxLib, PieceRef: e.pieceRef, PieceDate: e.pieceDate, EcritureLib: e.ecritureLib, DebitCents: debit.toString(), CreditCents: credit.toString(),
      EcritureLet: e.ecritureLet, DateLet: e.dateLet, ValidDate: e.validDate };
    // Header is physical line 1; the parser numbers non-empty data lines from 1.
    return { id: `row-${stableSha256({ documentId, line: e.ligne })}`, documentVersionId: documentId, scope, locator: { row: e.ligne + 1 }, original,
      normalized: errors.length ? undefined : { key, amount: money(debit - credit), date: date! }, errors };
  });
  if (rows.some(r => r.errors.length)) blocking.push("REJECTED_ROWS_REQUIRE_CORRECTION");
  if (!rows.length) blocking.push("EMPTY_POPULATION");
  const unbalanced = [...balance.entries()].filter(([, v]) => v !== 0n).map(([k]) => k);
  if (unbalanced.length) blocking.push("FX_FEC_ENTRY_UNBALANCED:" + unbalanced.slice(0, 5).join(","));
  if (outside) warnings.push(`FX_FEC_OUTSIDE_EXERCISE:${outside} ligne(s) hors exercice, exclues de toute période déclarative`);
  const mapping: ImportMapping = { version: "fiscal-fec-1", headerRow: 1, columns: { key: "EcritureNum", amount: "Debit-Credit", date: "EcritureDate" }, delimiter: (parsed.separateur === "|" ? "|" : parsed.separateur === "\t" ? "\t" : ";") as ImportMapping["delimiter"],
    decimal: ",", dateFormat: "ISO", sign: 1, currency: "EUR", fiscal: { basis: "fec", variant: parsed.variante === "montant-sens" ? "montant-sens" : "debit-credit" } } as unknown as ImportMapping;
  return seal(scope, document, mapping, rows, report(rows, blocking, warnings, { kind: "not_applicable", reason: "FEC : débits et crédits équilibrés par écriture" }), FX_PARSERS.fec);
}
/** FEC lines of an approved batch, in the canonical shape the tax engines read. Amounts are exact cents converted back once. */
export function fecEntries(batch: ImportBatch): FecEntry[] {
  if (batch.document.documentType !== "fx_fec" || !fecMappingSchema.safeParse(batch.mapping).success) throw new FiscalSourceError("FX_FEC_SOURCE_INVALID");
  return batch.rows.map(r => {
    if (r.errors.length || !r.normalized) throw new FiscalSourceError("FX_FEC_ROW_INVALID", r.locator);
    const o = r.original, debit = Number(o.DebitCents) / 100, credit = Number(o.CreditCents) / 100;
    return { ligne: (r.locator.row ?? 1) - 1, journalCode: o.JournalCode, journalLib: o.JournalLib, ecritureNum: o.EcritureNum, ecritureDate: o.EcritureDate, compteNum: o.CompteNum, compteLib: o.CompteLib,
      compAuxNum: o.CompAuxNum, compAuxLib: o.CompAuxLib, pieceRef: o.PieceRef, pieceDate: o.PieceDate, ecritureLib: o.EcritureLib, debit, credit, ecritureLet: o.EcritureLet, dateLet: o.DateLet, validDate: o.ValidDate, montant: debit - credit };
  });
}

// -- Declarations --------------------------------------------------------------
export const fiscalDeclarationType = (documentType: FiscalDeclarationDocument): FiscalDeclarationType =>
  TAX_DOCUMENT_SPECS[documentType]?.taxType === "vat" ? "fx_vat_return" : "fx_cit_return";
/** One head per declarative period (VAT) or per form and period (IS): a corrected return replaces the previous version of the same key only. */
export function declarationHeadKey(type: FiscalDeclarationType, formNumber: string, start: string, end: string) {
  return type === "fx_vat_return" ? `fx_vat_return:${start}:${end}` : `fx_cit_return:${formNumber}:${start}:${end}`;
}
type DeclarationMapping = z.infer<typeof declarationMappingSchema>;
function rawField(o: Record<string, string>): RawTaxFieldInput {
  const page = Number(o.page);
  return { code: o.code, rawValue: o.rawValue === "" ? null : o.rawValue, declaredDataType: o.declaredDataType || undefined, page: Number.isSafeInteger(page) && page > 0 ? page : null,
    sheet: o.sheet || null, cell: o.cell || null, box: o.box || null, structuredPath: o.structuredPath || null, formula: o.formula === "true", confidence: Number(o.confidence), extractionMethod: o.extractionMethod === "text_layer" ? "text_layer" : "structured" };
}
function buildFromParsed(scope: WorkpaperScope, documentId: string, byteHash: string, m: DeclarationMapping["fiscal"], parsed: ParsedTaxDocumentInput) {
  return buildTaxDocumentSnapshot({ organizationId: scope.organizationId, dossierId: scope.dossierId, entityId: scope.dossierId, documentId, documentType: m.documentType, parsed, parserWarnings: [],
    metadata: m.expectedSiren ? { expectedSiren: m.expectedSiren } : {}, documentHash: byteHash,
    // Technical, deterministic timestamp: the snapshot is rebuilt identically at preview and at execution.
    createdAt: `${parsed.periodEnd ?? "1970-01-01"}T00:00:00.000Z` });
}
/**
 * A declaration file (PROBANT JSON / CSV / XLSX template of the tax document processor) is normalized by the
 * processor itself. Field-level issues on a published vintage block the import; an unpublished vintage is kept
 * as a piece but its snapshot stays « review_required » and is never read by the engines.
 */
export async function previewDeclaration(file: File, scope: WorkpaperScope, period: AccountingPeriod, form: DeclarationForm, principal: Principal): Promise<ImportBatch> {
  authorize(principal, scope, "prepare"); scopeSchema.parse(scope);
  const declared = declarationFormSchema.parse(form);
  const bytes = await bytesOf(file, [".csv", ".json", ".xlsx"]), name = file.name.toLowerCase();
  const format = name.endsWith(".json") ? "json" : name.endsWith(".xlsx") ? "xlsx" : "csv";
  const type = fiscalDeclarationType(declared.documentType), byteHash = sha256(bytes);
  const documentId = `source-${stableSha256({ scope, byteHash, documentType: type, form: declared.documentType, parser: FX_PARSERS.declaration })}`;
  let parsed: ParsedTaxDocumentInput;
  try { parsed = await readStructuredTaxDocument(new File([new Uint8Array(bytes)], file.name, { type: file.type }), format); }
  catch (error) { throw new Error("FX_DECLARATION_UNREADABLE:" + (error instanceof Error ? error.message : "TAX_DOCUMENT_PARSE_FAILED")); }
  const fiscal = { basis: "declaration" as const, documentType: declared.documentType, expectedSiren: declared.expectedSiren ?? null, schemaVersion: parsed.schemaVersion, parsedDocumentType: parsed.documentType,
    formNumber: parsed.formNumber, formVintage: parsed.formVintage, siren: parsed.siren, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, fiscalYear: parsed.fiscalYear, parsedWarnings: [...parsed.warnings] };
  const built = buildFromParsed(scope, documentId, byteHash, fiscal, parsed);
  const blocking: string[] = [], warnings: string[] = [];
  let logicalId = type + ":incomplete";
  if (built.kind === "metadata_incomplete") blocking.push("FX_DECLARATION_METADATA_INCOMPLETE:" + built.warnings.join(","));
  else {
    const s = built.snapshot, known = !!getTaxFormVintage(s.formNumber, s.formVintage);
    logicalId = declarationHeadKey(type, s.formNumber, built.period.startDate, built.period.endDate);
    // A VAT return ending the day before the exercise is the previous declarative period of its first sheet (carried credit).
    const priorVat = type === "fx_vat_return" && built.period.endDate === dayBefore(period.startDate);
    if (!priorVat && (built.period.startDate < period.startDate || built.period.endDate > period.closingDate)) blocking.push("FX_DECLARATION_PERIOD_OUTSIDE_EXERCISE");
    if (!known) warnings.push(`FX_FORM_VINTAGE_NOT_PUBLISHED:${s.formNumber} ${s.formVintage} — pièce conservée, non lue par le moteur`);
    else if (built.requiresReview) blocking.push("FX_DECLARATION_FIELDS_REQUIRE_CORRECTION:" + built.warnings.join(","));
  }
  const fields = built.kind === "built" ? built.snapshot.fields : [];
  const rows: SourceRow[] = parsed.fields.map((f, index) => {
    const field = fields[index];
    const original: Record<string, string> = { code: f.code, rawValue: f.rawValue ?? "", declaredDataType: f.declaredDataType ?? "", page: f.page ? String(f.page) : "", sheet: f.sheet ?? "", cell: f.cell ?? "", box: f.box ?? "",
      structuredPath: f.structuredPath ?? "", formula: String(f.formula), confidence: String(f.confidence), extractionMethod: f.extractionMethod,
      fieldCode: field?.fieldCode ?? f.code.trim().toUpperCase(), label: field?.label ?? "", processingStatus: field?.processingStatus ?? "needs_manual_review", warnings: (field?.warnings ?? ["DOCUMENT_METADATA_INCOMPLETE"]).join(",") };
    const usable = field && field.usableForAutomatedCalculation && field.dataType === "amount" && field.amountCents !== null;
    return { id: `row-${stableSha256({ documentId, index })}`, documentVersionId: documentId, scope, locator: { ...(f.page ? { page: f.page } : {}), ...(f.cell ? { cell: f.cell } : {}), ...(f.sheet ? { sheet: f.sheet } : {}), zone: `case-${original.fieldCode}` },
      original, normalized: usable ? { key: field.fieldCode, amount: money(BigInt(field.amountCents!)), date: built.kind === "built" ? built.period.endDate : period.closingDate } : undefined, errors: [] };
  });
  if (!rows.length) blocking.push("NO_DECLARATION_FIELD");
  const document: SourceDocumentVersion = { id: documentId, logicalId, scope, fileName: file.name, format: format === "xlsx" ? "xlsx" : "csv", documentType: type, byteHash, storageRef: documentId, sizeBytes: bytes.length, parserVersion: FX_PARSERS.declaration };
  const mapping = { version: "fiscal-declaration-1", headerRow: 1, columns: { key: "fieldCode", amount: "rawValue", date: "periodEnd" }, delimiter: ";", decimal: ",", dateFormat: "ISO", sign: 1, currency: "EUR", fiscal } as unknown as ImportMapping;
  return seal(scope, document, mapping, rows, report(rows, blocking, warnings, { kind: "not_applicable", reason: "Déclaration : cases lues par le processeur fiscal, aucun total sommé" }), FX_PARSERS.declaration);
}
export interface FiscalDeclaration { batch: ImportBatch; snapshot: TaxDocumentSnapshot; formNumber: string; formVintage: number; periodStart: string; periodEnd: string; fiscalYear: number; published: boolean }
/**
 * Rebuilds the canonical snapshot of an approved declaration, bound to the engine period of the run.
 * `active` is kept only for the current head with every field usable; a replaced version is « superseded ».
 */
export function declarationSnapshot(batch: ImportBatch, taxPeriod: { id: string; version: string }, current: boolean, supersedesSnapshotId: string | null = null): FiscalDeclaration {
  const m = declarationMappingSchema.safeParse(batch.mapping);
  if (!m.success || !(FX_DECLARATION_TYPES as readonly string[]).includes(batch.document.documentType)) throw new FiscalSourceError("FX_DECLARATION_SOURCE_INVALID");
  const f = m.data.fiscal;
  const parsed: ParsedTaxDocumentInput = { schemaVersion: f.schemaVersion, documentType: f.parsedDocumentType as ParsedTaxDocumentInput["documentType"], formNumber: f.formNumber, formVintage: f.formVintage,
    siren: f.siren, periodStart: f.periodStart, periodEnd: f.periodEnd, fiscalYear: f.fiscalYear, fields: batch.rows.map(r => rawField(r.original)), warnings: f.parsedWarnings };
  const built = buildFromParsed(batch.scope, batch.document.id, batch.document.byteHash, f, parsed);
  if (built.kind !== "built") throw new FiscalSourceError("FX_DECLARATION_METADATA_INCOMPLETE");
  const s = built.snapshot, published = !!getTaxFormVintage(s.formNumber, s.formVintage);
  const { canonicalJson: _json, snapshotHash: _hash, ...body } = s; void _json; void _hash;
  const snapshot = createTaxDocumentSnapshot({ ...body, taxPeriodId: taxPeriod.id, taxPeriodVersion: taxPeriod.version, supersedesSnapshotId,
    status: !current ? "superseded" : s.status === "active" ? "active" : "review_required" });
  return { batch, snapshot, formNumber: s.formNumber, formVintage: s.formVintage, periodStart: built.period.startDate, periodEnd: built.period.endDate, fiscalYear: built.period.fiscalYear, published };
}

// -- Tabular sources (invoices, payments, support) -------------------------------
const REQUIRED_COLUMNS: Record<FiscalTabularType, (keyof FiscalMapping["fiscal"])[]> = { fx_invoices: [], fx_vat_payments: ["periodStartColumn", "periodEndColumn"], fx_support: ["labelColumn"] };
/** Row-level qualification of a tabular fiscal source: unique keys, dates and the columns its basis requires. */
export function assertFiscalBatch(batch: ImportBatch) {
  const type = batch.document.documentType as FiscalSourceType;
  if (type === "fx_fec") { if (!fecMappingSchema.safeParse(batch.mapping).success) throw new FiscalSourceError("FX_MAPPING_INVALID"); return; }
  if ((FX_DECLARATION_TYPES as readonly string[]).includes(type)) { if (!declarationMappingSchema.safeParse(batch.mapping).success) throw new FiscalSourceError("FX_MAPPING_INVALID"); return; }
  if (!(FX_TABULAR_TYPES as readonly string[]).includes(type)) throw new FiscalSourceError("FX_SOURCE_TYPE_INVALID");
  const parsed = fiscalMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new FiscalSourceError("FX_MAPPING_INVALID");
  const m = parsed.data, f = m.fiscal, t = type as FiscalTabularType;
  if (f.basis !== BASES[t]) throw new FiscalSourceError("FX_SOURCE_TYPE_INVALID");
  const missing = REQUIRED_COLUMNS[t].find(c => !f[c]);
  if (missing) throw new FiscalSourceError("FX_COLUMN_REQUIRED", { column: missing });
  if (batch.rows.length > ROW_LIMITS[t]) throw new FiscalSourceError("FX_ROWS_LIMIT");
  const keys = new Set<string>();
  for (const row of batch.rows) {
    const at = (code: string, col?: string) => new FiscalSourceError(code, { ...row.locator, ...(col ? { column: col, value: cell(row, col).slice(0, 80) } : {}) });
    if (!row.normalized || row.errors.length) throw at("FX_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!id.safeParse(key).success || keys.has(key)) throw at("FX_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    if (t === "fx_vat_payments") {
      if (cents(row.normalized.amount) <= 0n) throw at("FX_PAYMENT_SIGN_INVALID", m.columns.amount);
      const start = fiscalDate(cell(row, f.periodStartColumn), m.dateFormat), end = fiscalDate(cell(row, f.periodEndColumn), m.dateFormat);
      if (!start || !end || end < start) throw at("FX_PAYMENT_PERIOD_INVALID", f.periodStartColumn);
    }
    if (t === "fx_support" && !cell(row, f.labelColumn)) throw at("FX_LABEL_REQUIRED", f.labelColumn);
  }
}
export interface FiscalInvoice { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; ref: string; date: string; vatCents: string; direction: string; baseCents: string | null; label: string }
export interface FiscalPayment { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; ref: string; date: string; amountCents: string; periodStart: string; periodEnd: string; label: string }
const sourceRef = (b: ImportBatch, r: SourceRow) => ({ importId: b.id, rowId: r.id, documentVersionId: b.document.id, fileName: b.document.fileName, locator: r.locator });
export function invoicesOf(batch: ImportBatch): FiscalInvoice[] {
  assertFiscalBatch(batch);
  const f = (batch.mapping as unknown as FiscalMapping).fiscal;
  return batch.rows.map(r => {
    const base = cell(r, f.baseColumn);
    let baseCents: string | null = null;
    if (base) { const n = Number(base.replace(/\s/g, "").replace(",", ".")); if (!Number.isFinite(n)) throw new FiscalSourceError("FX_INVOICE_BASE_INVALID", { ...r.locator, column: f.baseColumn }); baseCents = String(eurosToCents(n)); }
    return { ...sourceRef(batch, r), ref: r.normalized!.key.trim(), date: r.normalized!.date, vatCents: cents(r.normalized!.amount).toString(), direction: cell(r, f.directionColumn), baseCents, label: cell(r, f.labelColumn) };
  });
}
export function paymentsOf(batch: ImportBatch): FiscalPayment[] {
  assertFiscalBatch(batch);
  const m = batch.mapping as unknown as FiscalMapping, f = m.fiscal;
  return batch.rows.map(r => ({ ...sourceRef(batch, r), ref: r.normalized!.key.trim(), date: r.normalized!.date, amountCents: cents(r.normalized!.amount).toString(),
    periodStart: fiscalDate(cell(r, f.periodStartColumn), m.dateFormat)!, periodEnd: fiscalDate(cell(r, f.periodEndColumn), m.dateFormat)!, label: cell(r, f.labelColumn) }));
}

// -- Heads, currency and population ------------------------------------------
export function fiscalHeadKey(batch: ImportBatch) { return batch.document.logicalId; }
/**
 * Heads a VAT run depends on: the FEC, the inventories, the return of its own period and the return of the
 * previous period (credit carried forward). A return for another period never makes the run stale.
 */
export function vatRelevantKeys(start: string, end: string, previous: { start: string; end: string } | null) {
  return ["fx_fec", "fx_invoices", "fx_vat_payments", "fx_support", `fx_vat_return:${start}:${end}`, ...(previous ? [`fx_vat_return:${previous.start}:${previous.end}`] : [])];
}
/** A frozen run is current only if, among the keys it depends on, the current heads are exactly its frozen sources. */
export function fiscalSourcesCurrent(importIds: string[], heads: { document_type: string; import_id: string }[], relevant: (key: string) => boolean) {
  if (!importIds.length) return true;
  const current = heads.filter(h => relevant(h.document_type)).map(h => h.import_id).sort(), frozenIds = [...importIds].sort();
  return current.length === frozenIds.length && current.every((x, i) => x === frozenIds[i]);
}
/** Heads a fiscal run depends on, computed from the current heads (a newly approved previous return is relevant). */
export function fiscalRelevance(run: { fiscalWork?: { tax: "vat" | "cit"; period: { startDate: string; endDate: string } } }, heads: { document_type: string }[]) {
  const w = run.fiscalWork;
  if (!w) return () => false;
  // IS: the FEC, the supporting pieces and every return form of the exercise (2058-A, 2058-B, 2033-B, 2065).
  if (w.tax === "cit") return (key: string) => ["fx_fec", "fx_support"].includes(key) || (key.startsWith("fx_cit_return:") && key.endsWith(`:${w.period.startDate}:${w.period.endDate}`));
  const keys = vatRelevantKeys(w.period.startDate, w.period.endDate, previousVatKey(heads, w.period.startDate, w.period.endDate));
  return (key: string) => keys.includes(key);
}
const dayBefore = (date: string) => new Date(Date.parse(date + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
const months = (start: string, end: string) => (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
/** Previous declarative period of the same length (same frequency) immediately before `start`, if a return exists for it. */
export function previousVatKey(heads: { document_type: string }[], start: string, end: string) {
  const before = dayBefore(start), length = months(start, end);
  const key = heads.map(h => h.document_type).find(k => {
    if (!k.startsWith("fx_vat_return:") || !k.endsWith(":" + before)) return false;
    const [, s, e] = k.split(":");
    return months(s, e) === length;
  });
  if (!key) return null;
  const [, s, e] = key.split(":");
  return { start: s, end: e };
}
export { citPopulationExclusions, citPopulationItems, isFiscalPopulation, vatPopulationExclusions, vatPopulationItems } from "./fiscal-population";
