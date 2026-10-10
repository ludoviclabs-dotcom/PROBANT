import { z } from "zod";
import { cents } from "@/lib/canonical-model/money";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, type EvidenceLink, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";
import { PV_EVENT_TYPES, PV_TREATMENTS, PV_TYPES, type ProvisionEventType, type ProvisionSourceType, type ProvisionTreatment } from "./provision-population";
import { PV_AMOUNT_STATUSES, PV_MOVEMENT_KINDS, PV_PIECE_KINDS, PV_RUBRICS, type ProvisionAmountStatus, type ProvisionMovementKind, type ProvisionPieceKind, type ProvisionRubric } from "./provision-contract";
import { parseEuroCell } from "./stock-sources";

/**
 * Qualified sources of the provisions and commitments register (Mission 16). The pivot column (`columns.amount`) carries
 * euros with two decimals at most: the opening provision of the register, a movement, an estimate, a ledger closing
 * balance, a published annex amount, or the page count of a piece. Every other column is named explicitly.
 */
export { PV_TYPES, type ProvisionSourceType };
export const PV_BASES = { pv_register: "register", pv_movements: "movements", pv_estimates: "estimates", pv_ledger: "ledger", pv_annex: "annex", pv_support: "support" } as const;
export const PV_SOURCE_LABELS: Record<ProvisionSourceType, string> = {
  pv_register: "Registre des risques et engagements (événements ouverts, nouveaux et clos, avec ou sans écriture)",
  pv_movements: "Mouvements de provisions de l’exercice (dotations, utilisations, reprises)",
  pv_estimates: "Estimations documentées et scénarios (hypothèse retenue, pièce, auteur)",
  pv_ledger: "Grand livre : soldes d’ouverture et de clôture des comptes de provisions (15)",
  pv_annex: "Annexe : informations publiées (provisions, passifs éventuels, engagements)",
  pv_support: "Pièces citables (contrats, dossiers de risque, correspondances, décisions)",
};
export const PV_REQUIRED: ProvisionSourceType[] = ["pv_register", "pv_ledger"];
const ROW_LIMITS: Record<ProvisionSourceType, number> = { pv_register: 5000, pv_movements: 20000, pv_estimates: 20000, pv_ledger: 500, pv_annex: 5000, pv_support: 5000 };
const name = z.string().trim().min(1).max(200);
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const COLUMN_KEYS = ["eventColumn", "typeColumn", "treatmentColumn", "closedColumn", "accountColumn", "declaredClosingColumn", "commitmentColumn", "obligationColumn", "counterpartyColumn", "methodColumn", "authorColumn",
  "decisionColumn", "decisionPieceColumn", "decisionDateColumn", "confidentialColumn", "labelColumn", "kindColumn", "pieceColumn", "justificationColumn", "scenarioColumn", "retainedColumn", "appreciationColumn",
  "openingColumn", "rubricColumn", "amountStatusColumn"] as const;
type ColumnKey = typeof COLUMN_KEYS[number];
export const provisionMappingSchema = z.object({
  version: z.literal("provisions-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: name, amount: name, date: name }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.literal(1), currency: z.literal("EUR"),
  provisions: z.object({ basis: z.enum(["register", "movements", "estimates", "ledger", "annex", "support"]),
    ...Object.fromEntries(COLUMN_KEYS.map(k => [k, name.optional()])) as Record<ColumnKey, z.ZodOptional<typeof name>>,
    // Movements only: the period the journal covers, declared by the preparer at import and versioned with the mapping.
    coverageFrom: civil.optional(), coverageTo: civil.optional() }).strict(),
}).strict();
export type ProvisionMapping = z.infer<typeof provisionMappingSchema>;
export function isProvisionMapping(mapping: ImportMapping): boolean { return provisionMappingSchema.safeParse(mapping).success; }
/** Columns each source must name explicitly; nothing is guessed from a header label. */
export const PV_REQUIRED_COLUMNS: Record<ProvisionSourceType, (ColumnKey | "coverageFrom" | "coverageTo")[]> = {
  pv_register: ["typeColumn", "treatmentColumn", "closedColumn", "accountColumn", "declaredClosingColumn", "obligationColumn", "authorColumn", "confidentialColumn", "labelColumn"],
  pv_movements: ["eventColumn", "kindColumn", "accountColumn", "pieceColumn", "coverageFrom", "coverageTo"],
  pv_estimates: ["eventColumn", "scenarioColumn", "retainedColumn", "methodColumn", "authorColumn", "pieceColumn"],
  pv_ledger: ["openingColumn"],
  pv_annex: ["eventColumn", "rubricColumn", "amountStatusColumn"],
  pv_support: ["kindColumn", "confidentialColumn"],
};
/** Columns whose content may be confidential: their value is never echoed in a refusal locator. */
export const PV_SENSITIVE_COLUMNS: ColumnKey[] = ["obligationColumn", "counterpartyColumn", "methodColumn", "decisionColumn", "appreciationColumn", "scenarioColumn", "justificationColumn"];

/** An explicit refusal carrying the physical locator, so the preparer can act on the source. */
export class ProvisionSourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "ProvisionSourceError"; }
}
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const oneOf = <T extends string>(values: readonly T[], raw: string): T | undefined => (values as readonly string[]).includes(norm(raw)) ? norm(raw) as T : undefined;
const YES: Record<string, boolean> = { oui: true, o: true, yes: true, true: true, "1": true, non: false, n: false, no: false, false: false, "0": false };
const cell = (row: SourceRow, column?: string) => column ? row.original[column]?.trim() ?? "" : "";
const part = z.string().trim().min(1).max(120);
const ACCOUNT = /^15\d{1,8}$/;
// The shared civil-date validator: an impossible date such as 2026-02-31 is refused at preview, never normalized.
const isDate = (v: string) => isCivilDate(v);

/** Row-level qualification of one previewed or approved batch; cross-source checks happen in buildProvisionFacts. */
export function assertProvisionBatch(batch: ImportBatch, period: AccountingPeriod) {
  const parsed = provisionMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new ProvisionSourceError("PV_MAPPING_INVALID");
  const m = parsed.data, f = m.provisions, type = batch.document.documentType as ProvisionSourceType;
  if (!PV_TYPES.includes(type) || f.basis !== PV_BASES[type]) throw new ProvisionSourceError("PV_SOURCE_TYPE_INVALID");
  const missing = PV_REQUIRED_COLUMNS[type].find(c => !f[c]);
  if (missing) throw new ProvisionSourceError("PV_COLUMN_REQUIRED", { column: missing });
  if (batch.rows.length > ROW_LIMITS[type]) throw new ProvisionSourceError("PV_ROWS_LIMIT");
  // Every column named by the mapping must exist in the file: a missing column is never read as empty values.
  const header = batch.rows[0] ? Object.keys(batch.rows[0].original) : [];
  const absent = COLUMN_KEYS.map(k => f[k]).filter((c): c is string => !!c).find(c => !header.includes(c));
  if (absent) throw new ProvisionSourceError("PV_COLUMN_NOT_FOUND", { column: absent });
  // The movements journal covers the whole exercise: with it, an event without movement had none; without it, movements stay unknown.
  if (type === "pv_movements" && !(f.coverageFrom === period.startDate && f.coverageTo === period.closingDate)) throw new ProvisionSourceError("PV_COVERAGE_EXERCISE_REQUIRED", { column: "coverageFrom / coverageTo", value: f.coverageFrom + " → " + f.coverageTo });
  const keys = new Set<string>(), sensitive = new Set(PV_SENSITIVE_COLUMNS.map(k => f[k]).filter(Boolean));
  for (const row of batch.rows) {
    const at = (code: string, column?: string) => new ProvisionSourceError(code, { ...row.locator, ...(column ? { column, ...(sensitive.has(column) ? {} : { value: cell(row, column).slice(0, 80) }) } : {}) });
    if (!row.normalized || row.errors.length) throw at("PV_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!part.safeParse(key).success || keys.has(key)) throw at("PV_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    const date = row.normalized.date, amount = cents(row.normalized.amount);
    const euro = (column: string | undefined) => { try { return parseEuroCell(cell(row, column), m.decimal); } catch { throw at("PV_AMOUNT_FORMAT_INVALID", column); } };
    if (type === "pv_register") {
      if (!oneOf(PV_EVENT_TYPES, cell(row, f.typeColumn))) throw at("PV_EVENT_TYPE_INVALID", f.typeColumn);
      const treatment = oneOf(PV_TREATMENTS, cell(row, f.treatmentColumn));
      if (!treatment) throw at("PV_TREATMENT_INVALID", f.treatmentColumn);
      if (date > period.asOfDate) throw at("PV_EVENT_DATE_AFTER_REVIEW", m.columns.date);
      const closed = cell(row, f.closedColumn);
      if (closed && !(isDate(closed) && closed >= date && closed <= period.asOfDate)) throw at("PV_CLOSED_DATE_INVALID", f.closedColumn);
      if (amount < 0n) throw at("PV_AMOUNT_NEGATIVE", m.columns.amount);
      const declared = euro(f.declaredClosingColumn), commitment = euro(f.commitmentColumn), account = cell(row, f.accountColumn);
      if (declared !== null && declared < 0n) throw at("PV_AMOUNT_NEGATIVE", f.declaredClosingColumn);
      if (commitment !== null && commitment < 0n) throw at("PV_AMOUNT_NEGATIVE", f.commitmentColumn);
      // A provision is booked on a provision account (class 15) and states its closing amount and estimation method.
      if (treatment === "provision" && (declared === null || !cell(row, f.methodColumn))) throw at("PV_PROVISION_FIELDS_REQUIRED", declared === null ? f.declaredClosingColumn : f.methodColumn ?? f.treatmentColumn);
      if ((treatment === "provision" || amount !== 0n) && !ACCOUNT.test(account)) throw at("PV_ACCOUNT_REQUIRED", f.accountColumn);
      if (account && !ACCOUNT.test(account)) throw at("PV_ACCOUNT_INVALID", f.accountColumn);
      if (treatment !== "provision" && declared !== null && declared !== 0n) throw at("PV_TREATMENT_PROVISION_INCONSISTENT", f.declaredClosingColumn);
      if (commitment !== null && treatment !== "engagement_hors_bilan") throw at("PV_COMMITMENT_TREATMENT_INVALID", f.commitmentColumn);
      if (!cell(row, f.obligationColumn)) throw at("PV_OBLIGATION_REQUIRED", f.obligationColumn);
      if (!cell(row, f.authorColumn)) throw at("PV_AUTHOR_REQUIRED", f.authorColumn);
      if (!(norm(cell(row, f.confidentialColumn)) in YES)) throw at("PV_CONFIDENTIAL_FLAG_INVALID", f.confidentialColumn);
      if (!cell(row, f.labelColumn)) throw at("PV_LABEL_REQUIRED", f.labelColumn);
      const decisionDate = cell(row, f.decisionDateColumn);
      if (decisionDate && !(isDate(decisionDate) && decisionDate <= period.asOfDate)) throw at("PV_DECISION_DATE_INVALID", f.decisionDateColumn);
      continue;
    }
    if (type === "pv_movements") {
      if (!part.safeParse(cell(row, f.eventColumn)).success) throw at("PV_EVENT_REQUIRED", f.eventColumn);
      if (!oneOf(PV_MOVEMENT_KINDS, cell(row, f.kindColumn))) throw at("PV_MOVEMENT_KIND_INVALID", f.kindColumn);
      if (amount <= 0n) throw at("PV_MOVEMENT_AMOUNT_INVALID", m.columns.amount);
      if (date < period.startDate || date > period.closingDate) throw at("PV_MOVEMENT_OUTSIDE_EXERCISE", m.columns.date);
      if (!ACCOUNT.test(cell(row, f.accountColumn))) throw at("PV_ACCOUNT_INVALID", f.accountColumn);
      continue;
    }
    if (type === "pv_estimates") {
      if (!part.safeParse(cell(row, f.eventColumn)).success) throw at("PV_EVENT_REQUIRED", f.eventColumn);
      if (!cell(row, f.scenarioColumn)) throw at("PV_SCENARIO_REQUIRED", f.scenarioColumn);
      if (!(norm(cell(row, f.retainedColumn)) in YES)) throw at("PV_RETAINED_FLAG_INVALID", f.retainedColumn);
      if (amount < 0n) throw at("PV_AMOUNT_NEGATIVE", m.columns.amount);
      if (date > period.asOfDate) throw at("PV_ESTIMATE_AFTER_REVIEW", m.columns.date);
      if (!cell(row, f.methodColumn)) throw at("PV_ESTIMATE_METHOD_REQUIRED", f.methodColumn);
      if (!cell(row, f.authorColumn)) throw at("PV_AUTHOR_REQUIRED", f.authorColumn);
      // A documented estimate names its piece: without it, the estimate is not documented and is refused here.
      if (!cell(row, f.pieceColumn)) throw at("PV_ESTIMATE_PIECE_REQUIRED", f.pieceColumn);
      continue;
    }
    if (type === "pv_ledger") {
      // The ledger key is the provision account; its pivot column carries the closing credit balance in euros.
      if (!ACCOUNT.test(key)) throw at("PV_LEDGER_ACCOUNT_INVALID", m.columns.key);
      if (date !== period.closingDate) throw at("PV_LEDGER_DATE_CLOSING_REQUIRED", m.columns.date);
      if (euro(f.openingColumn) === null) throw at("PV_LEDGER_OPENING_REQUIRED", f.openingColumn);
      continue;
    }
    if (type === "pv_annex") {
      if (!part.safeParse(cell(row, f.eventColumn)).success) throw at("PV_EVENT_REQUIRED", f.eventColumn);
      if (!oneOf(PV_RUBRICS, cell(row, f.rubricColumn))) throw at("PV_RUBRIC_INVALID", f.rubricColumn);
      const status = oneOf(PV_AMOUNT_STATUSES, cell(row, f.amountStatusColumn));
      if (!status) throw at("PV_AMOUNT_STATUS_INVALID", f.amountStatusColumn);
      // An unquantified or withheld line carries 0 in the pivot column: the published amount is then unknown, never zero.
      if (status !== "publie" && amount !== 0n) throw at("PV_ANNEX_AMOUNT_STATUS_INCONSISTENT", m.columns.amount);
      if (amount < 0n) throw at("PV_AMOUNT_NEGATIVE", m.columns.amount);
      if (date > period.asOfDate) throw at("PV_ANNEX_AFTER_REVIEW", m.columns.date);
      continue;
    }
    // Pieces: the pivot column carries a page count; the label may be confidential.
    if (!oneOf(PV_PIECE_KINDS, cell(row, f.kindColumn))) throw at("PV_PIECE_KIND_INVALID", f.kindColumn);
    if (!(norm(cell(row, f.confidentialColumn)) in YES)) throw at("PV_CONFIDENTIAL_FLAG_INVALID", f.confidentialColumn);
    if (amount < 0n) throw at("PV_AMOUNT_NEGATIVE", m.columns.amount);
    if (date > period.asOfDate) throw at("PV_SUPPORT_AFTER_REVIEW", m.columns.date);
  }
}

export interface PvFact { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; key: string; amountCents: string; date: string; proof: EvidenceLink }
export interface PvEvent extends PvFact { eventId: string; label: string; type: ProvisionEventType; treatment: ProvisionTreatment; closedDate: string | null; account: string | null; declaredClosingCents: string | null;
  commitmentCents: string | null; obligation: string; counterparty: string; method: string; author: string; decision: string; decisionPiece: string; decisionDate: string | null; confidential: boolean }
export interface PvMovement extends PvFact { eventId: string; kind: ProvisionMovementKind; account: string; pieceRef: string; justification: string }
export interface PvEstimate extends PvFact { eventId: string; scenario: string; retained: boolean; method: string; author: string; pieceRef: string; appreciation: string }
export interface PvLedgerLine extends PvFact { account: string; openingCents: string; label: string }
export interface PvAnnexLine extends PvFact { eventId: string; rubric: ProvisionRubric; amountStatus: ProvisionAmountStatus; label: string }
export interface PvSupport extends PvFact { piece: string; kind: ProvisionPieceKind; eventId: string | null; label: string; confidential: boolean }
export interface ProvisionFacts {
  events: PvEvent[]; ledger: PvLedgerLine[];
  /** Null when the source is not approved: movements, estimates and annex stay unknown, never empty. */
  movements: PvMovement[] | null; estimates: PvEstimate[] | null; annex: PvAnnexLine[] | null; supports: PvSupport[] | null;
}
export function provisionProof(batch: ImportBatch, row: SourceRow, runId: string, purpose: string): EvidenceLink {
  return { id: "proof-" + stableSha256({ runId, rowId: row.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose };
}
/** A frozen run is current only if its sources are exactly the current approved provisions heads. */
export function provisionSourcesCurrent(importIds: string[], heads: { document_type: string; import_id: string }[]) {
  if (!importIds.length) return true;
  const current = heads.filter(h => (PV_TYPES as readonly string[]).includes(h.document_type)).map(h => h.import_id).sort(), frozenIds = [...importIds].sort();
  return current.length === frozenIds.length && current.every((x, i) => x === frozenIds[i]);
}

/** Reads the approved sources into typed facts. Cross-source refusals carry their locator; nothing is dropped silently. */
export function buildProvisionFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): ProvisionFacts {
  const count = (type: ProvisionSourceType) => imports.filter(b => b.document.documentType === type).length;
  if (count("pv_register") !== 1 || count("pv_ledger") !== 1 || PV_TYPES.some(t => count(t) > 1) || imports.some(b => !PV_TYPES.includes(b.document.documentType as ProvisionSourceType))) throw new ProvisionSourceError("PV_SOURCES_REQUIRED");
  const facts: ProvisionFacts = { events: [], ledger: [], movements: null, estimates: null, annex: null, supports: null };
  const ordered = [...imports].sort((a, b) => PV_TYPES.indexOf(a.document.documentType as ProvisionSourceType) - PV_TYPES.indexOf(b.document.documentType as ProvisionSourceType));
  for (const batch of ordered) {
    assertScope(scope, batch.scope); assertProvisionBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new ProvisionSourceError("PV_IMPORT_NOT_APPROVED");
    const m = provisionMappingSchema.parse(batch.mapping), f = m.provisions, type = batch.document.documentType as ProvisionSourceType;
    const euro = (row: SourceRow, column?: string) => { const v = parseEuroCell(cell(row, column), m.decimal); return v === null ? null : String(v); };
    if (type === "pv_movements") facts.movements = [];
    if (type === "pv_estimates") facts.estimates = [];
    if (type === "pv_annex") facts.annex = [];
    if (type === "pv_support") facts.supports = [];
    for (const row of batch.rows) {
      const fact = (purpose: string): PvFact => ({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, locator: row.locator,
        key: row.normalized!.key.trim(), amountCents: String(cents(row.normalized!.amount)), date: row.normalized!.date, proof: provisionProof(batch, row, runId, purpose) });
      const event = (column?: string) => {
        const eventId = cell(row, column);
        if (!facts.events.some(e => e.eventId === eventId)) throw new ProvisionSourceError("PV_EVENT_UNKNOWN", { ...row.locator, column, value: eventId.slice(0, 80) });
        return facts.events.find(e => e.eventId === eventId)!;
      };
      if (type === "pv_register") {
        facts.events.push({ ...fact("Événement du registre"), eventId: row.normalized!.key.trim(), label: cell(row, f.labelColumn), type: oneOf(PV_EVENT_TYPES, cell(row, f.typeColumn))!, treatment: oneOf(PV_TREATMENTS, cell(row, f.treatmentColumn))!,
          closedDate: cell(row, f.closedColumn) || null, account: cell(row, f.accountColumn) || null, declaredClosingCents: euro(row, f.declaredClosingColumn), commitmentCents: euro(row, f.commitmentColumn),
          obligation: cell(row, f.obligationColumn), counterparty: cell(row, f.counterpartyColumn), method: cell(row, f.methodColumn), author: cell(row, f.authorColumn), decision: cell(row, f.decisionColumn),
          decisionPiece: cell(row, f.decisionPieceColumn), decisionDate: cell(row, f.decisionDateColumn) || null, confidential: YES[norm(cell(row, f.confidentialColumn))] });
        continue;
      }
      if (type === "pv_ledger") { facts.ledger.push({ ...fact("Solde du grand livre (compte de provisions)"), account: row.normalized!.key.trim(), openingCents: euro(row, f.openingColumn)!, label: cell(row, f.labelColumn) }); continue; }
      if (type === "pv_annex") { facts.annex!.push({ ...fact("Information publiée en annexe"), eventId: cell(row, f.eventColumn), rubric: oneOf(PV_RUBRICS, cell(row, f.rubricColumn))!, amountStatus: oneOf(PV_AMOUNT_STATUSES, cell(row, f.amountStatusColumn))!, label: cell(row, f.labelColumn) }); continue; }
      if (type === "pv_support") { facts.supports!.push({ ...fact("Pièce citable"), piece: row.normalized!.key.trim(), kind: oneOf(PV_PIECE_KINDS, cell(row, f.kindColumn))!, eventId: cell(row, f.eventColumn) || null, label: cell(row, f.labelColumn), confidential: YES[norm(cell(row, f.confidentialColumn))] }); continue; }
      if (type === "pv_movements") {
        const e = event(f.eventColumn), account = cell(row, f.accountColumn);
        // A movement is booked on the account of its event: a reclassification between accounts is not covered by this lot.
        if (e.account !== account) throw new ProvisionSourceError("PV_MOVEMENT_ACCOUNT_MISMATCH", { ...row.locator, column: f.accountColumn, value: account });
        facts.movements!.push({ ...fact("Mouvement de provision"), eventId: e.eventId, kind: oneOf(PV_MOVEMENT_KINDS, cell(row, f.kindColumn))!, account, pieceRef: cell(row, f.pieceColumn), justification: cell(row, f.justificationColumn) });
        continue;
      }
      const e = event(f.eventColumn), retained = YES[norm(cell(row, f.retainedColumn))];
      if (retained && facts.estimates!.some(x => x.eventId === e.eventId && x.retained)) throw new ProvisionSourceError("PV_ESTIMATE_RETAINED_DUPLICATE", { ...row.locator, column: f.retainedColumn });
      facts.estimates!.push({ ...fact("Estimation documentée"), eventId: e.eventId, scenario: cell(row, f.scenarioColumn), retained, method: cell(row, f.methodColumn), author: cell(row, f.authorColumn), pieceRef: cell(row, f.pieceColumn), appreciation: cell(row, f.appreciationColumn) });
    }
  }
  return facts;
}
