import { money } from "@/lib/canonical-model/money";
import type { ImportBatch } from "./imports";

/**
 * Population of the stock sheet (Mission 15). Kept free of server-only imports: the shared selection module is also
 * bundled for the browser demonstration.
 */
export const ST_TYPES = ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"] as const;
export type StockSourceType = typeof ST_TYPES[number];
/**
 * Ownership and status of a stock line. Only "own" stock is tested in quantity; the other categories are listed
 * apart with their motive, never added to the entity's own stock and never dropped.
 */
export const ST_CATEGORIES = ["own", "third_party", "consignment_in", "consignment_out", "in_transit", "work_in_progress", "excluded"] as const;
export type StockCategory = typeof ST_CATEGORIES[number];
/** Categories the entity owns (valued in its stock accounts); third-party stock and received consignments are not owned. */
export const ST_OWNED: StockCategory[] = ["own", "consignment_out", "in_transit", "work_in_progress", "excluded"];
/** Unit of test: reference / site / lot (empty lot allowed). The separator is refused inside each part at import. */
export const stockUnitId = (reference: string, site: string, lot: string) => reference.trim() + "|" + site.trim() + "|" + lot.trim();
export const splitStockUnit = (unitId: string) => { const [reference, site, lot] = unitId.split("|"); return { reference, site, lot }; };
const cellOf = (row: { original: Record<string, string> }, column?: string) => column ? row.original[column]?.trim() ?? "" : "";

/** Population check used by freezePopulation: exactly one count and one system state of the validated stock mapping. */
export function isStockPopulation(imports: ImportBatch[]) {
  return imports.filter(b => b.document.documentType === "st_count").length === 1 && imports.filter(b => b.document.documentType === "st_system").length === 1
    && imports.every(b => (ST_TYPES as readonly string[]).includes(b.document.documentType) && b.mapping.version === "stocks-1" && !!b.mapping.stocks);
}
/**
 * One item per reference / site / lot found in the count or in the system state. The measure is a QUANTITY in
 * hundredths of the counting unit (system quantity, or counted quantity when the unit is absent from the system):
 * it is never a monetary amount and is never added across units.
 */
export function stockPopulationItems(imports: ImportBatch[]) {
  const items = new Map<string, { rowIds: string[]; system: bigint | null; counted: bigint }>();
  for (const type of ["st_count", "st_system"] as const) {
    const batch = imports.find(b => b.document.documentType === type)!, f = batch.mapping.stocks!;
    for (const r of batch.rows) {
      if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
      const unit = stockUnitId(cellOf(r, f.referenceColumn), cellOf(r, f.siteColumn), cellOf(r, f.lotColumn)), item = items.get(unit) ?? { rowIds: [], system: null, counted: 0n };
      const quantity = BigInt(r.normalized.amount.amount.replace(".", ""));
      item.rowIds.push(r.id);
      if (type === "st_system") item.system = quantity; else item.counted += quantity;
      items.set(unit, item);
    }
  }
  return [...items.entries()].map(([id, i]) => ({ id, rowIds: i.rowIds.sort(), amount: money(i.system ?? i.counted) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
