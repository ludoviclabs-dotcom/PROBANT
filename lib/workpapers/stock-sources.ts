import { z } from "zod";
import { cents } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, type EvidenceLink, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";
import { ST_CATEGORIES, ST_TYPES, stockUnitId, type StockCategory, type StockSourceType } from "./stock-population";

/**
 * Qualified sources of the stock sheet (Mission 15, sub-lot 1 « quantités et mouvements »).
 * The tabular parser's pivot column (`columns.amount`) carries a QUANTITY with at most two decimals, held in
 * hundredths of the counting unit: no monetary value is ever derived from it.
 */
export { ST_CATEGORIES, ST_TYPES, stockUnitId, type StockCategory, type StockSourceType };
export const ST_BASES = { st_count: "count", st_system: "system", st_movements: "movements", st_support: "support" } as const;
export const ST_SOURCE_LABELS: Record<StockSourceType, string> = {
  st_count: "Feuilles de comptage (référence, site, lot, unité, quantité comptée, date, propriété)",
  st_system: "État de stock théorique à la clôture (quantité système par référence / site / lot)",
  st_movements: "Journal des mouvements intercalaires (entrées et sorties, période couverte déclarée)",
  st_support: "Pièces citables (instructions d’inventaire, bons de réception et de livraison, confirmations)",
};
export const ST_REQUIRED: StockSourceType[] = ["st_count", "st_system"];
const ROW_LIMITS: Record<StockSourceType, number> = { st_count: 20000, st_system: 20000, st_movements: 40000, st_support: 4000 };
const id = z.string().trim().min(1).max(200);
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const stockMappingSchema = z.object({
  version: z.literal("stocks-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.literal(1), currency: z.literal("EUR"),
  stocks: z.object({ basis: z.enum(["count", "system", "movements", "support"]),
    referenceColumn: id.optional(), siteColumn: id.optional(), lotColumn: id.optional(), unitColumn: id.optional(), categoryColumn: id.optional(),
    reasonColumn: id.optional(), directionColumn: id.optional(), pieceColumn: id.optional(), labelColumn: id.optional(),
    // Movements only: the period the journal covers, declared by the preparer at import and versioned with the mapping.
    coverageFrom: civil.optional(), coverageTo: civil.optional() }).strict(),
}).strict();
export type StockMapping = z.infer<typeof stockMappingSchema>;
export function isStockMapping(mapping: ImportMapping): boolean { return stockMappingSchema.safeParse(mapping).success; }
/** Columns each source must name explicitly; nothing is guessed from a header label. */
export const ST_REQUIRED_COLUMNS: Record<StockSourceType, (keyof StockMapping["stocks"])[]> = {
  st_count: ["referenceColumn", "siteColumn", "unitColumn", "categoryColumn"],
  st_system: ["referenceColumn", "siteColumn", "unitColumn", "categoryColumn"],
  st_movements: ["referenceColumn", "siteColumn", "unitColumn", "directionColumn", "coverageFrom", "coverageTo"],
  st_support: [],
};

/** An explicit refusal carrying the physical locator, so the preparer can act on the source. */
export class StockSourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "StockSourceError"; }
}
export type StockDirection = "in" | "out";
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const CATEGORIES: Record<string, StockCategory> = { propre: "own", own: "own", stock_propre: "own", tiers: "third_party", stock_tiers: "third_party", detenu_pour_tiers: "third_party",
  consignation_recue: "consignment_in", consignment_in: "consignment_in", consignation_deposee: "consignment_out", consignment_out: "consignment_out", depot_chez_tiers: "consignment_out",
  transit: "in_transit", en_transit: "in_transit", in_transit: "in_transit", en_cours: "work_in_progress", encours: "work_in_progress", work_in_progress: "work_in_progress", exclue: "excluded", excluded: "excluded" };
const DIRECTIONS: Record<string, StockDirection> = { entree: "in", entrees: "in", in: "in", reception: "in", sortie: "out", sorties: "out", out: "out", livraison: "out" };
const cell = (row: SourceRow, column?: string) => column ? row.original[column]?.trim() ?? "" : "";
/** Identity parts never contain the separator of the unit identifier. */
const part = z.string().trim().min(1).max(120).refine(v => !v.includes("|"), "Séparateur réservé");

/** Row-level qualification of one previewed or approved batch; population-level checks happen in buildStockFacts. */
export function assertStockBatch(batch: ImportBatch, period: AccountingPeriod) {
  const parsed = stockMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new StockSourceError("ST_MAPPING_INVALID");
  const m = parsed.data, f = m.stocks, type = batch.document.documentType as StockSourceType;
  if (!ST_TYPES.includes(type) || f.basis !== ST_BASES[type]) throw new StockSourceError("ST_SOURCE_TYPE_INVALID");
  const missing = ST_REQUIRED_COLUMNS[type].find(c => !f[c]);
  if (missing) throw new StockSourceError("ST_COLUMN_REQUIRED", { column: missing });
  if (batch.rows.length > ROW_LIMITS[type]) throw new StockSourceError("ST_ROWS_LIMIT");
  if (type === "st_movements" && !(f.coverageFrom! <= f.coverageTo! && f.coverageFrom! >= period.startDate && f.coverageTo! <= period.asOfDate)) throw new StockSourceError("ST_COVERAGE_INVALID", { column: "coverageFrom / coverageTo", value: f.coverageFrom + " → " + f.coverageTo });
  const keys = new Set<string>(), siteDates = new Map<string, string>(), systemUnits = new Set<string>(), units = new Map<string, string>();
  for (const row of batch.rows) {
    const at = (code: string, column?: string) => new StockSourceError(code, { ...row.locator, ...(column ? { column, value: cell(row, column).slice(0, 80) } : {}) });
    if (!row.normalized || row.errors.length) throw at("ST_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!id.safeParse(key).success || keys.has(key)) throw at("ST_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    const date = row.normalized.date, quantity = cents(row.normalized.amount);
    if (type === "st_support") { if (date > period.asOfDate) throw at("ST_SUPPORT_AFTER_REVIEW", m.columns.date); continue; }
    for (const [column, code] of [[f.referenceColumn, "ST_REFERENCE_REQUIRED"], [f.siteColumn, "ST_SITE_REQUIRED"], [f.unitColumn, "ST_UNIT_REQUIRED"]] as const) if (!part.safeParse(cell(row, column)).success) throw at(code, column);
    if (f.lotColumn && cell(row, f.lotColumn) && !part.safeParse(cell(row, f.lotColumn)).success) throw at("ST_LOT_INVALID", f.lotColumn);
    const unit = stockUnitId(cell(row, f.referenceColumn), cell(row, f.siteColumn), cell(row, f.lotColumn)), site = cell(row, f.siteColumn), uom = norm(cell(row, f.unitColumn));
    if (type === "st_count" || type === "st_system") {
      const category = CATEGORIES[norm(cell(row, f.categoryColumn))];
      if (!category) throw at("ST_CATEGORY_INVALID", f.categoryColumn);
      if (quantity < 0n) throw at("ST_QUANTITY_NEGATIVE", m.columns.amount);
      if (type === "st_system" && category === "excluded" && !cell(row, f.reasonColumn).trim()) throw at("ST_EXCLUSION_REASON_REQUIRED", f.reasonColumn ?? f.categoryColumn);
    }
    if (type === "st_count") {
      // A count date outside the exercise or after the review date is refused; one count date per site keeps the roll-forward unambiguous.
      if (date < period.startDate || date > period.asOfDate) throw at("ST_COUNT_DATE_OUTSIDE", m.columns.date);
      if (siteDates.has(site) && siteDates.get(site) !== date) throw at("ST_SITE_COUNT_DATE_MIXED", m.columns.date);
      siteDates.set(site, date);
      // One unit is counted in one counting unit inside a sheet: cartons and units on the same line identity are refused here.
      if (units.has(unit) && units.get(unit) !== uom) throw at("ST_COUNT_UNIT_MIXED", f.unitColumn);
      units.set(unit, uom);
    }
    if (type === "st_system") {
      if (date !== period.closingDate) throw at("ST_SYSTEM_DATE_CLOSING_REQUIRED", m.columns.date);
      if (systemUnits.has(unit)) throw at("ST_SYSTEM_UNIT_DUPLICATE", f.referenceColumn);
      systemUnits.add(unit);
    }
    if (type === "st_movements") {
      if (!DIRECTIONS[norm(cell(row, f.directionColumn))]) throw at("ST_DIRECTION_INVALID", f.directionColumn);
      if (quantity <= 0n) throw at("ST_MOVEMENT_QUANTITY_INVALID", m.columns.amount);
      if (date < f.coverageFrom! || date > f.coverageTo!) throw at("ST_MOVEMENT_OUTSIDE_COVERAGE", m.columns.date);
    }
  }
}

export interface StFact { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; key: string; quantity: string; date: string; proof: EvidenceLink }
export interface StCountLine extends StFact { uom: string; uomLabel: string; category: StockCategory; sheetRef: string; label: string }
export interface StSystemLine extends StFact { uom: string; uomLabel: string; category: StockCategory; reason: string; label: string }
export interface StMovement extends StFact { uom: string; uomLabel: string; direction: StockDirection; pieceRef: string; label: string }
export interface StSupport extends StFact { reference: string; label: string }
export interface StUnitFact { unitId: string; reference: string; site: string; lot: string; label: string; counts: StCountLine[]; system: StSystemLine | null; movements: StMovement[] }
export interface StSiteFact { site: string; countDate: string | null; countLines: number; systemLines: number }
export interface StockFacts {
  units: StUnitFact[]; sites: StSiteFact[]; supports: StSupport[];
  /** Null when no movement journal is approved: intercalary movements stay unknown, never zero. */
  coverage: { from: string; to: string; importId: string; fileName: string } | null;
}
export function stockProof(batch: ImportBatch, row: SourceRow, runId: string, purpose: string): EvidenceLink {
  return { id: "proof-" + stableSha256({ runId, rowId: row.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose };
}
/** A frozen run is current only if its sources are exactly the current approved stock heads. */
export function stockSourcesCurrent(importIds: string[], heads: { document_type: string; import_id: string }[]) {
  if (!importIds.length) return true;
  const current = heads.filter(h => (ST_TYPES as readonly string[]).includes(h.document_type)).map(h => h.import_id).sort(), frozenIds = [...importIds].sort();
  return current.length === frozenIds.length && current.every((x, i) => x === frozenIds[i]);
}

/** Builds the stock units (reference / site / lot) and their attached facts from approved sources. Nothing is dropped silently. */
export function buildStockFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): StockFacts {
  const count = (type: StockSourceType) => imports.filter(b => b.document.documentType === type).length;
  if (count("st_count") !== 1 || count("st_system") !== 1 || count("st_movements") > 1 || count("st_support") > 1 || imports.some(b => !ST_TYPES.includes(b.document.documentType as StockSourceType))) throw new StockSourceError("ST_SOURCES_REQUIRED");
  const facts: StockFacts = { units: [], sites: [], supports: [], coverage: null };
  const unitOf = (reference: string, site: string, lot: string) => {
    const unitId = stockUnitId(reference, site, lot);
    let unit = facts.units.find(u => u.unitId === unitId);
    if (!unit) { unit = { unitId, reference, site, lot, label: "", counts: [], system: null, movements: [] }; facts.units.push(unit); }
    return unit;
  };
  const ordered = [...imports].sort((a, b) => ST_TYPES.indexOf(a.document.documentType as StockSourceType) - ST_TYPES.indexOf(b.document.documentType as StockSourceType));
  for (const batch of ordered) {
    assertScope(scope, batch.scope); assertStockBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new StockSourceError("ST_IMPORT_NOT_APPROVED");
    const f = stockMappingSchema.parse(batch.mapping).stocks, type = batch.document.documentType as StockSourceType;
    if (type === "st_movements") facts.coverage = { from: f.coverageFrom!, to: f.coverageTo!, importId: batch.id, fileName: batch.document.fileName };
    for (const row of batch.rows) {
      const fact = (purpose: string): StFact => ({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, locator: row.locator,
        key: row.normalized!.key.trim(), quantity: String(cents(row.normalized!.amount)), date: row.normalized!.date, proof: stockProof(batch, row, runId, purpose) });
      if (type === "st_support") { facts.supports.push({ ...fact("Pièce citable"), reference: cell(row, f.referenceColumn), label: cell(row, f.labelColumn) }); continue; }
      const unit = unitOf(cell(row, f.referenceColumn), cell(row, f.siteColumn), cell(row, f.lotColumn)), uomLabel = cell(row, f.unitColumn), uom = norm(uomLabel), label = cell(row, f.labelColumn);
      if (label && !unit.label) unit.label = label;
      if (type === "st_count") unit.counts.push({ ...fact("Ligne de comptage"), uom, uomLabel, category: CATEGORIES[norm(cell(row, f.categoryColumn))], sheetRef: cell(row, f.pieceColumn), label });
      else if (type === "st_system") unit.system = { ...fact("Quantité théorique à la clôture"), uom, uomLabel, category: CATEGORIES[norm(cell(row, f.categoryColumn))], reason: cell(row, f.reasonColumn), label };
      else unit.movements.push({ ...fact("Mouvement intercalaire"), uom, uomLabel, direction: DIRECTIONS[norm(cell(row, f.directionColumn))], pieceRef: cell(row, f.pieceColumn), label });
    }
  }
  const sites = new Map<string, StSiteFact>();
  for (const u of facts.units) {
    const s = sites.get(u.site) ?? { site: u.site, countDate: null, countLines: 0, systemLines: 0 };
    s.countLines += u.counts.length; s.systemLines += u.system ? 1 : 0; if (u.counts[0]) s.countDate = u.counts[0].date;
    sites.set(u.site, s);
  }
  facts.sites = [...sites.values()].sort((a, b) => a.site < b.site ? -1 : 1);
  for (const u of facts.units) if (!u.label) u.label = u.reference;
  facts.units.sort((a, b) => a.site < b.site ? -1 : a.site > b.site ? 1 : a.unitId < b.unitId ? -1 : 1);
  return frozen(facts);
}
