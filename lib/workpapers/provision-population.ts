import type { ImportBatch } from "./imports";

/**
 * Population of the provisions and commitments register (Mission 16). Kept free of server-only imports: the shared
 * selection module is also bundled for the browser demonstration.
 */
export const PV_TYPES = ["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_annex", "pv_support"] as const;
export type ProvisionSourceType = typeof PV_TYPES[number];
/** Nature of an event of the register. The list classifies; it never decides a treatment. */
export const PV_EVENT_TYPES = ["litige", "garantie", "restructuration", "fiscal", "social", "environnement", "contrat_deficitaire", "autre_risque", "engagement_donne", "engagement_recu"] as const;
export type ProvisionEventType = typeof PV_EVENT_TYPES[number];
/**
 * Treatment retained BY THE ENTITY, read from the register (PCG art. 321-5, 321-6, 322-4, 322-5, 836-1). The tool records it
 * and compares the documented amounts; it never qualifies an obligation nor decides a treatment.
 */
export const PV_TREATMENTS = ["provision", "passif_eventuel", "engagement_hors_bilan", "passif_non_comptabilise", "aucun"] as const;
export type ProvisionTreatment = typeof PV_TREATMENTS[number];
const cellOf = (row: { original: Record<string, string> }, column?: unknown) => typeof column === "string" ? row.original[column]?.trim() ?? "" : "";

/** Population check used by freezePopulation: exactly one register and one ledger of the validated provisions mapping. */
export function isProvisionPopulation(imports: ImportBatch[]) {
  return imports.filter(b => b.document.documentType === "pv_register").length === 1 && imports.filter(b => b.document.documentType === "pv_ledger").length === 1
    && imports.every(b => (PV_TYPES as readonly string[]).includes(b.document.documentType) && b.mapping.version === "provisions-1" && !!b.mapping.provisions);
}
/**
 * One item per event of the register, including events without any entry. The measure is the opening provision in
 * euros as declared by the register (0 when none was booked): a description of the population, never a tested amount.
 */
export function provisionPopulationItems(imports: ImportBatch[]) {
  const batch = imports.find(b => b.document.documentType === "pv_register")!;
  return batch.rows.map(r => {
    if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
    return { id: r.normalized.key.trim(), rowIds: [r.id], amount: r.normalized.amount };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export const provisionCell = cellOf;
