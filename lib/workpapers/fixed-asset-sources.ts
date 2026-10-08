import { z } from "zod";
import { cents, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { SourcedAmount } from "./cycle-context";
import { assertScope, frozen, moneySchema, type EvidenceLink, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";

/** Qualified sources of the fixed-asset review (Mission 10). One closed basis per type; one amount per row. */
export const FA_TYPES = ["fa_register", "fa_ledger", "fa_parameters", "fa_support"] as const;
export type FixedAssetSourceType = typeof FA_TYPES[number];
export const FA_BASES = { fa_register: "asset_register", fa_ledger: "ledger_closing", fa_parameters: "depreciation_parameters", fa_support: "movement_support" } as const;
export const FA_SOURCE_LABELS: Record<FixedAssetSourceType, string> = { fa_register: "Registre des immobilisations (mouvements par actif / composant)", fa_ledger: "GL / balance des comptes d’immobilisations à la clôture", fa_parameters: "Paramètres d’amortissement par actif / composant", fa_support: "Pièces d’acquisition, de cession et de mise en service" };
export const FA_REQUIRED: FixedAssetSourceType[] = ["fa_register", "fa_ledger"];
const ROW_LIMITS: Record<FixedAssetSourceType, number> = { fa_register: 6000, fa_ledger: 500, fa_parameters: 2000, fa_support: 4000 };
const id = z.string().trim().min(1).max(200);
export const fixedAssetMappingSchema = z.object({
  version: z.literal("fixed-assets-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
  fixedAssets: z.object({ basis: z.enum(["asset_register", "ledger_closing", "depreciation_parameters", "movement_support"]),
    assetColumn: id.optional(), componentColumn: id.optional(), familyColumn: id.optional(), tableColumn: id.optional(), movementColumn: id.optional(), statusColumn: id.optional(),
    accountColumn: id.optional(), treatmentColumn: id.optional(), methodColumn: id.optional(), durationColumn: id.optional(), prorataNumeratorColumn: id.optional(),
    prorataDenominatorColumn: id.optional(), kindColumn: id.optional(), labelColumn: id.optional(), pieceColumn: id.optional() }).strict(),
}).strict();
export type FixedAssetMapping = z.infer<typeof fixedAssetMappingSchema>;
export function isFixedAssetMapping(mapping: ImportMapping): boolean { return fixedAssetMappingSchema.safeParse(mapping).success; }
/** Columns each source must name explicitly; nothing is guessed from a header label. */
export const FA_REQUIRED_COLUMNS: Record<FixedAssetSourceType, (keyof FixedAssetMapping["fixedAssets"])[]> = {
  fa_register: ["assetColumn", "familyColumn", "tableColumn", "movementColumn", "statusColumn", "accountColumn", "treatmentColumn"],
  fa_ledger: ["tableColumn"],
  fa_parameters: ["assetColumn", "methodColumn", "durationColumn", "prorataNumeratorColumn", "prorataDenominatorColumn"],
  fa_support: ["assetColumn", "kindColumn"],
};

/** An explicit refusal carrying the physical locator, so the preparer can act on the source. */
export class FixedAssetSourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "FixedAssetSourceError"; }
}
export type FaTable = "gross" | "amortization" | "impairment";
export type FaMovement = "opening" | "addition" | "disposal" | "reversal" | "reclassification" | "closing";
export type FaStatus = "in_progress" | "in_service" | "disposed";
export type FaTreatment = "standard" | "credit_bail" | "reevaluation" | "financier" | "devise" | "autre_complexe";
export type FaSupportKind = "acquisition" | "cession" | "mise_en_service";
export const FA_TABLES: FaTable[] = ["gross", "amortization", "impairment"];
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const TABLES: Record<string, FaTable> = { brut: "gross", gross: "gross", valeur_brute: "gross", amortissement: "amortization", amortissements: "amortization", amortization: "amortization", depreciation: "impairment", depreciations: "impairment", impairment: "impairment" };
const MOVEMENTS: Record<string, FaMovement> = { ouverture: "opening", opening: "opening", entree: "addition", addition: "addition", dotation: "addition", sortie: "disposal", disposal: "disposal", reprise: "reversal", reversal: "reversal", reclassement: "reclassification", reclassification: "reclassification", cloture: "closing", closing: "closing" };
const STATUSES: Record<string, FaStatus> = { en_cours: "in_progress", in_progress: "in_progress", en_service: "in_service", in_service: "in_service", sorti: "disposed", disposed: "disposed" };
const TREATMENTS: Record<string, FaTreatment> = { standard: "standard", credit_bail: "credit_bail", reevaluation: "reevaluation", financier: "financier", devise: "devise", autre_complexe: "autre_complexe" };
const KINDS: Record<string, FaSupportKind> = { acquisition: "acquisition", cession: "cession", mise_en_service: "mise_en_service" };
/** Exclusion texts are server constants: an excluded asset is listed with its motive, never silently dropped. */
export const FA_TREATMENT_EXCLUSIONS: Record<Exclude<FaTreatment, "standard">, string> = {
  credit_bail: "Bien pris en crédit-bail ou en location : non couvert par cette procédure.",
  reevaluation: "Actif réévalué : écarts de réévaluation non couverts par cette procédure.",
  financier: "Immobilisation financière : procédure Participations distincte.",
  devise: "Actif suivi en devise : aucune conversion implicite.",
  autre_complexe: "Actif complexe déclaré non couvert par le registre.",
};
export const FA_TABLE_LABELS: Record<FaTable, string> = { gross: "Brut", amortization: "Amortissements", impairment: "Dépréciations" };
export const FA_MOVEMENT_LABELS: Record<FaMovement, string> = { opening: "Ouverture", addition: "Entrées", disposal: "Sorties", reversal: "Reprises", reclassification: "Reclassements", closing: "Clôture" };
export const FA_STATUS_LABELS: Record<FaStatus, string> = { in_progress: "En cours", in_service: "Mis en service", disposed: "Sorti" };
const cell = (row: SourceRow, column?: string) => column ? row.original[column]?.trim() ?? "" : "";
export function unitIdOf(asset: string, component: string) { return component ? asset + "/" + component : asset; }

/** Row-level qualification of one previewed or approved batch; population-level checks happen in buildFixedAssetFacts. */
export function assertFixedAssetBatch(batch: ImportBatch, period: AccountingPeriod) {
  const parsed = fixedAssetMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new FixedAssetSourceError("FA_MAPPING_INVALID");
  const m = parsed.data, f = m.fixedAssets, type = batch.document.documentType as FixedAssetSourceType;
  if (!FA_TYPES.includes(type) || f.basis !== FA_BASES[type]) throw new FixedAssetSourceError("FA_SOURCE_TYPE_INVALID");
  const missing = FA_REQUIRED_COLUMNS[type].find(c => !f[c]);
  if (missing) throw new FixedAssetSourceError("FA_COLUMN_REQUIRED", { column: missing });
  if (batch.rows.length > ROW_LIMITS[type]) throw new FixedAssetSourceError("FA_ROWS_LIMIT");
  const keys = new Set<string>(), endpoints = new Set<string>(), units = new Map<string, { status: string; family: string; treatment: string }>(), accounts = new Map<string, string>(), parameterUnits = new Set<string>();
  for (const row of batch.rows) {
    const at = (code: string, column?: string) => new FixedAssetSourceError(code, { ...row.locator, ...(column ? { column, value: cell(row, column).slice(0, 80) } : {}) });
    if (!row.normalized || row.errors.length) throw at("FA_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!id.safeParse(key).success || keys.has(key)) throw at("FA_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    const date = row.normalized.date, amount = cents(row.normalized.amount);
    if (type === "fa_register" || type === "fa_parameters" || type === "fa_support") {
      if (!id.safeParse(cell(row, f.assetColumn)).success) throw at("FA_ASSET_REQUIRED", f.assetColumn);
    }
    const unit = unitIdOf(cell(row, f.assetColumn), cell(row, f.componentColumn));
    if (type === "fa_register") {
      const table = TABLES[norm(cell(row, f.tableColumn))], movement = MOVEMENTS[norm(cell(row, f.movementColumn))], status = STATUSES[norm(cell(row, f.statusColumn))], treatment = TREATMENTS[norm(cell(row, f.treatmentColumn))];
      const family = cell(row, f.familyColumn), account = cell(row, f.accountColumn);
      if (!id.safeParse(family).success) throw at("FA_FAMILY_REQUIRED", f.familyColumn);
      if (!table) throw at("FA_TABLE_INVALID", f.tableColumn);
      if (!movement) throw at("FA_MOVEMENT_INVALID", f.movementColumn);
      if (!status) throw at("FA_STATUS_INVALID", f.statusColumn);
      if (!treatment) throw at("FA_TREATMENT_INVALID", f.treatmentColumn);
      if (!id.safeParse(account).success) throw at("FA_ACCOUNT_REQUIRED", f.accountColumn);
      if (movement === "reversal" && table !== "impairment") throw at("FA_REVERSAL_TABLE_INVALID", f.movementColumn);
      if (movement === "opening" && date !== period.startDate) throw at("FA_OPENING_DATE_REQUIRED", m.columns.date);
      if (movement === "closing" && date !== period.closingDate) throw at("FA_CLOSING_DATE_REQUIRED", m.columns.date);
      if (date < period.startDate || date > period.closingDate) throw at("FA_MOVEMENT_OUTSIDE_PERIOD", m.columns.date);
      if (movement === "reclassification" ? amount === 0n : amount < 0n) throw at(movement === "reclassification" ? "FA_RECLASSIFICATION_ZERO" : "FA_MOVEMENT_SIGN_INVALID", m.columns.amount);
      if (movement === "opening" || movement === "closing") {
        const endpoint = unit + "\u0000" + table + "\u0000" + movement;
        if (endpoints.has(endpoint)) throw at("FA_ENDPOINT_DUPLICATE", f.movementColumn);
        endpoints.add(endpoint);
      }
      const known = units.get(unit);
      // One asset / component has a single status, family and treatment; a mixed declaration is refused, never resolved by the first line.
      if (known && (known.status !== status || known.family !== family || known.treatment !== treatment)) throw at("FA_UNIT_INCONSISTENT", f.statusColumn);
      units.set(unit, { status, family, treatment });
      const accountKey = unit + "\u0000" + table;
      if (accounts.has(accountKey) && accounts.get(accountKey) !== account) throw at("FA_ACCOUNT_INCONSISTENT", f.accountColumn);
      accounts.set(accountKey, account);
    }
    if (type === "fa_ledger") {
      if (!TABLES[norm(cell(row, f.tableColumn))]) throw at("FA_TABLE_INVALID", f.tableColumn);
      if (date !== period.closingDate) throw at("FA_CLOSING_DATE_REQUIRED", m.columns.date);
    }
    if (type === "fa_parameters") {
      if (amount < 0n) throw at("FA_RESIDUAL_NEGATIVE", m.columns.amount);
      const duration = cell(row, f.durationColumn), n = cell(row, f.prorataNumeratorColumn), d = cell(row, f.prorataDenominatorColumn);
      // An empty duration or prorata stays "source requise" at calculation; a malformed one is refused here.
      if (duration && !(/^[1-9]\d{0,3}$/.test(duration) && Number(duration) <= 1200)) throw at("FA_DURATION_INVALID", f.durationColumn);
      if ((n || d) && !(/^\d{1,6}$/.test(n) && /^[1-9]\d{0,5}$/.test(d) && BigInt(n) <= BigInt(d))) throw at("FA_PRORATA_INVALID", n && !/^\d{1,6}$/.test(n) ? f.prorataNumeratorColumn : f.prorataDenominatorColumn);
      if (parameterUnits.has(unit)) throw at("FA_PARAMETERS_DUPLICATE", f.assetColumn);
      parameterUnits.add(unit);
    }
    if (type === "fa_support") {
      if (!KINDS[norm(cell(row, f.kindColumn))]) throw at("FA_SUPPORT_KIND_INVALID", f.kindColumn);
      if (amount < 0n) throw at("FA_SUPPORT_SIGN_INVALID", m.columns.amount);
      if (date > period.asOfDate) throw at("FA_SUPPORT_AFTER_REVIEW", m.columns.date);
    }
  }
}

export interface FaSourceFact { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; value: SourcedAmount; proof: EvidenceLink }
export interface FaLine extends FaSourceFact { lineId: string; table: FaTable; movement: FaMovement; account: string; pieceRef: string; label: string }
export interface FaParameters extends FaSourceFact { methodRef: string; durationMonths: number | null; prorata: { numerator: string; denominator: string } | null; inServiceDate: string }
export interface FaSupport extends FaSourceFact { pieceId: string; kind: FaSupportKind; label: string }
export interface FaUnitFact {
  unitId: string; assetId: string; componentId: string | null; family: string; status: FaStatus; treatment: FaTreatment; label: string;
  inScope: boolean; exclusionReason: string | null; accounts: Partial<Record<FaTable, string>>; lines: FaLine[];
  parameters: FaParameters | null; supports: FaSupport[];
}
export interface FaLedgerFact extends FaSourceFact { account: string; table: FaTable; label: string }
export interface FixedAssetFacts {
  units: FaUnitFact[]; ledger: FaLedgerFact[];
  /** Document-level proof of the parameters source, used as the evidence of documented methods. */
  parametersDocument: EvidenceLink | null;
}
export function fixedAssetProof(batch: ImportBatch, row: SourceRow, runId: string, purpose: string): EvidenceLink {
  return { id: "proof-" + stableSha256({ runId, rowId: row.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose };
}
/** Grouping used by the population: one item per asset / component of the single register. */
export function registerUnits(batch: ImportBatch) {
  const f = fixedAssetMappingSchema.parse(batch.mapping).fixedAssets, groups = new Map<string, { rowIds: string[]; grossClosing: Money | null }>();
  for (const row of batch.rows) {
    if (!row.normalized || row.errors.length) throw new Error("POPULATION_ROW_INVALID");
    const unit = unitIdOf(cell(row, f.assetColumn), cell(row, f.componentColumn)), group = groups.get(unit) ?? { rowIds: [], grossClosing: null };
    group.rowIds.push(row.id);
    if (TABLES[norm(cell(row, f.tableColumn))] === "gross" && MOVEMENTS[norm(cell(row, f.movementColumn))] === "closing") group.grossClosing = row.normalized.amount;
    groups.set(unit, group);
  }
  return [...groups.entries()].map(([unitId, g]) => ({ unitId, rowIds: g.rowIds.sort(), grossClosing: g.grossClosing }));
}

/** Builds the asset population and its attached facts from the current approved sources. Unknown identities are refused, never dropped. */
export function buildFixedAssetFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): FixedAssetFacts {
  const count = (type: FixedAssetSourceType) => imports.filter(b => b.document.documentType === type).length;
  if (count("fa_register") !== 1 || count("fa_ledger") !== 1 || count("fa_parameters") > 1 || count("fa_support") > 1 || imports.some(b => !FA_TYPES.includes(b.document.documentType as FixedAssetSourceType))) throw new FixedAssetSourceError("FA_SOURCES_REQUIRED");
  const facts: FixedAssetFacts = { units: [], ledger: [], parametersDocument: null };
  const ordered = [...imports].sort((a, b) => FA_TYPES.indexOf(a.document.documentType as FixedAssetSourceType) - FA_TYPES.indexOf(b.document.documentType as FixedAssetSourceType));
  for (const batch of ordered) {
    assertScope(scope, batch.scope); assertFixedAssetBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new FixedAssetSourceError("FA_IMPORT_NOT_APPROVED");
    const f = fixedAssetMappingSchema.parse(batch.mapping).fixedAssets, type = batch.document.documentType as FixedAssetSourceType;
    const fact = (row: SourceRow, purpose: string): FaSourceFact => ({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, locator: row.locator,
      value: { amount: row.normalized!.amount, date: row.normalized!.date, source: row }, proof: fixedAssetProof(batch, row, runId, purpose) });
    const unitOf = (row: SourceRow) => {
      const unitId = unitIdOf(cell(row, f.assetColumn), cell(row, f.componentColumn)), unit = facts.units.find(u => u.unitId === unitId);
      // An asset absent from the register is refused with its physical locator.
      if (!unit) throw new FixedAssetSourceError("FA_ASSET_UNKNOWN", { ...row.locator, column: f.assetColumn + (f.componentColumn ? " / " + f.componentColumn : ""), value: unitId.slice(0, 80) });
      return unit;
    };
    if (type === "fa_parameters") facts.parametersDocument = { id: "proof-" + stableSha256({ runId, document: batch.document.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, precision: "document", status: "verified", purpose: "Paramètres d’amortissement appliquant les méthodes documentées" };
    for (const row of batch.rows) {
      const key = row.normalized!.key.trim();
      if (type === "fa_register") {
        const assetId = cell(row, f.assetColumn), componentId = cell(row, f.componentColumn), unitId = unitIdOf(assetId, componentId), table = TABLES[norm(cell(row, f.tableColumn))], movement = MOVEMENTS[norm(cell(row, f.movementColumn))];
        let unit = facts.units.find(u => u.unitId === unitId);
        if (!unit) {
          const treatment = TREATMENTS[norm(cell(row, f.treatmentColumn))], exclusionReason = treatment === "standard" ? null : FA_TREATMENT_EXCLUSIONS[treatment];
          unit = { unitId, assetId, componentId: componentId || null, family: cell(row, f.familyColumn), status: STATUSES[norm(cell(row, f.statusColumn))], treatment, label: cell(row, f.labelColumn) || unitId,
            inScope: !exclusionReason, exclusionReason, accounts: {}, lines: [], parameters: null, supports: [] };
          facts.units.push(unit);
        }
        unit.accounts[table] = cell(row, f.accountColumn);
        if (!unit.label || unit.label === unitId) unit.label = cell(row, f.labelColumn) || unitId;
        unit.lines.push({ ...fact(row, "Registre — " + FA_TABLE_LABELS[table] + " · " + FA_MOVEMENT_LABELS[movement]), lineId: key, table, movement, account: cell(row, f.accountColumn), pieceRef: cell(row, f.pieceColumn), label: cell(row, f.labelColumn) });
      } else if (type === "fa_ledger") {
        facts.ledger.push({ ...fact(row, "Solde GL à la clôture"), account: key, table: TABLES[norm(cell(row, f.tableColumn))], label: cell(row, f.labelColumn) });
      } else if (type === "fa_parameters") {
        const unit = unitOf(row), duration = cell(row, f.durationColumn), n = cell(row, f.prorataNumeratorColumn), d = cell(row, f.prorataDenominatorColumn);
        unit.parameters = { ...fact(row, "Paramètres d’amortissement"), methodRef: cell(row, f.methodColumn), durationMonths: duration ? Number(duration) : null, prorata: n && d ? { numerator: n, denominator: d } : null, inServiceDate: row.normalized!.date };
      } else {
        unitOf(row).supports.push({ ...fact(row, "Pièce de mouvement"), pieceId: key, kind: KINDS[norm(cell(row, f.kindColumn))], label: cell(row, f.labelColumn) });
      }
    }
  }
  // An account carried by the register for one table must not be declared for another table in the GL: the sign convention depends on it.
  for (const unit of facts.units) for (const table of FA_TABLES) {
    const account = unit.accounts[table], ledger = account ? facts.ledger.find(l => l.account === account) : undefined;
    if (ledger && ledger.table !== table) throw new FixedAssetSourceError("FA_LEDGER_TABLE_MISMATCH", { ...ledger.locator, column: "table", value: account });
  }
  facts.units.sort((a, b) => a.family < b.family ? -1 : a.family > b.family ? 1 : a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);
  return frozen(facts);
}

type FactRef = { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; amount: Money; date: string };
const factRef = (f: FaSourceFact): FactRef => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, locator: f.locator, amount: f.value.amount, date: f.value.date });
/** Browser view of the server facts: amounts, dates and locators only; the browser never recomputes a bridge or a depreciation. */
export function fixedAssetFactsView(facts: FixedAssetFacts) {
  return {
    units: facts.units.map(u => ({ unitId: u.unitId, assetId: u.assetId, componentId: u.componentId, family: u.family, status: u.status, treatment: u.treatment, label: u.label, inScope: u.inScope, exclusionReason: u.exclusionReason, accounts: u.accounts,
      lines: u.lines.map(l => ({ ...factRef(l), lineId: l.lineId, table: l.table, movement: l.movement, account: l.account, pieceRef: l.pieceRef, label: l.label })),
      parameters: u.parameters && { ...factRef(u.parameters), methodRef: u.parameters.methodRef, durationMonths: u.parameters.durationMonths, prorata: u.parameters.prorata, inServiceDate: u.parameters.inServiceDate },
      supports: u.supports.map(s => ({ ...factRef(s), pieceId: s.pieceId, kind: s.kind, label: s.label })) })),
    ledger: facts.ledger.map(l => ({ ...factRef(l), account: l.account, table: l.table, label: l.label })),
  };
}
export type FixedAssetFactsView = ReturnType<typeof fixedAssetFactsView>;
