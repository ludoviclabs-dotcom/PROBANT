import { isLegacyValueReview, type StockResult } from "../stock-contract";
import type { StockSourceType } from "../stock-sources";
import { costCsv, countCsv, ledgerCsv, ST_CSV, systemCsv, valueCsv } from "./stock-fixtures";

/**
 * Synthetic dossier of the C08 recipe (value bounds, costs and scope). Every reference and amount is invented. All counts
 * are taken at the closing date in one warehouse, so no intercalary movement is needed. Expected results are computed by
 * hand in docs/recette/c08/RECETTE.md, never by the engine.
 *
 * REF-N  current value 2,00 − 5,00 = −3,00 < cost 10,00, 10 units, nothing booked: economic 130,00, carrying 100,00.
 * REF-P  current value 5,50 < cost 8,00, 40 units, 100,00 already booked.
 * REF-M  hypothesis but no documented cost.            REF-U  hypothesis per carton, cost and quantity per unit.
 * REF-L  lot L1 with its own cost; lot L2 without, falls back on the reference line; one hypothesis for the reference.
 * REF-Q  counted 6 for 10 in the theoretical state.    REF-T  third-party stock carried at 300,00 in account 371.
 * REF-R  documented cost, no hypothesis.               REF-S  neither cost nor hypothesis.
 */
const at = "2026-12-31", site = "ENTREPOT-NORD";
export const C08_COUNT_ROWS = [
  ["C01", "REF-N", site, "", "unite", "10", at, "propre", "FC-08", "Pompes obsolètes"],
  ["C02", "REF-P", site, "", "unite", "40", at, "propre", "FC-08", "Roulements fin de série"],
  ["C03", "REF-M", site, "", "unite", "12", at, "propre", "FC-08", "Joints sans coût"],
  ["C04", "REF-U", site, "", "unite", "8", at, "propre", "FC-08", "Cartouches vendues au carton"],
  ["C05", "REF-L", site, "L1", "unite", "10", at, "propre", "FC-08", "Câble lot 1"],
  ["C06", "REF-L", site, "L2", "unite", "20", at, "propre", "FC-08", "Câble lot 2"],
  ["C07", "REF-Q", site, "", "unite", "6", at, "propre", "FC-08", "Vannes"],
  ["C08", "REF-T", site, "", "unite", "30", at, "tiers", "FC-08", "Palettes du client Gamma"],
  ["C09", "REF-R", site, "", "unite", "5", at, "propre", "FC-08", "Capteurs"],
  ["C10", "REF-S", site, "", "unite", "3", at, "propre", "FC-08", "Flexibles"],
];
export const C08_SYSTEM_ROWS = [
  ["S01", "REF-N", site, "", "unite", "10", at, "propre", "", "Pompes obsolètes", "100,00", "371000", "0,00"],
  ["S02", "REF-P", site, "", "unite", "40", at, "propre", "", "Roulements fin de série", "320,00", "371000", "100,00"],
  ["S03", "REF-M", site, "", "unite", "12", at, "propre", "", "Joints sans coût", "60,00", "371000", "0,00"],
  ["S04", "REF-U", site, "", "unite", "8", at, "propre", "", "Cartouches vendues au carton", "72,00", "371000", "0,00"],
  ["S05", "REF-L", site, "L1", "unite", "10", at, "propre", "", "Câble lot 1", "35,00", "371000", "5,00"],
  ["S06", "REF-L", site, "L2", "unite", "20", at, "propre", "", "Câble lot 2", "80,00", "371000", "20,00"],
  ["S07", "REF-Q", site, "", "unite", "10", at, "propre", "", "Vannes", "50,00", "371000", "0,00"],
  ["S08", "REF-T", site, "", "unite", "30", at, "tiers", "", "Palettes du client Gamma", "300,00", "371000", ""],
  ["S09", "REF-R", site, "", "unite", "5", at, "propre", "", "Capteurs", "35,00", "371000", "0,00"],
  ["S10", "REF-S", site, "", "unite", "3", at, "propre", "", "Flexibles", "15,00", "371000", "0,00"],
];
export const C08_COST_ROWS = [
  ["K01", "REF-N", "", "unite", "10,00", "2026-11-30", "cmp", "FA-N", "Facture pompes"],
  ["K02", "REF-P", "", "unite", "8,00", "2026-12-02", "peps", "FA-P", "Dernières factures roulements"],
  ["K03", "REF-U", "", "unite", "9,00", "2026-12-03", "cmp", "FA-U", "Facture cartouches"],
  ["K04", "REF-L", "L1", "unite", "3,50", "2026-12-04", "identification_specifique", "FA-L1", "Facture du lot 1"],
  ["K05", "REF-L", "", "unite", "4,00", "2026-12-05", "cmp", "FA-L", "Coût moyen de la référence"],
  ["K06", "REF-Q", "", "unite", "5,00", "2026-12-06", "cmp", "FA-Q", "Facture vannes"],
  ["K07", "REF-R", "", "unite", "7,00", "2026-12-07", "cmp", "FA-R", "Facture capteurs"],
];
/** Owned stated values 100 + 320 + 60 + 72 + 35 + 80 + 50 + 35 + 15 = 767,00 ; booked depreciation 100 + 5 + 20 = 125,00. */
export const C08_LEDGER_ROWS = [["371000", "767,00", at, "Marchandises"], ["397000", "-125,00", at, "Dépréciation des marchandises"]];
export const C08_VALUE_ROWS = [
  ["V01", "REF-N", "", "unite", "2,00", "5,00", "2027-01-15", "devis", "DEV-N", "Offre de reprise à 2,00 € l’unité, enlèvement et transport facturés 5,00 € l’unité", "2026-02-10", ""],
  ["V02", "REF-P", "", "unite", "6,00", "0,50", "2027-01-15", "prix_post_cloture", "FV-P", "Ventes de janvier 2027 à 6,00 € l’unité, commission 0,50 €", "", ""],
  ["V03", "REF-M", "", "unite", "3,00", "0,00", "2027-01-15", "tarif", "TAR-M", "Tarif public 2027 des joints", "", ""],
  ["V04", "REF-U", "", "carton", "30,00", "1,00", "2027-01-15", "tarif", "TAR-U", "Tarif au carton de six cartouches", "", ""],
  ["V05", "REF-L", "", "unite", "3,00", "0,00", "2027-01-15", "tarif", "TAR-L", "Tarif du câble, tous lots confondus", "", ""],
  ["V06", "REF-Q", "", "unite", "4,00", "0,00", "2027-01-15", "prix_post_cloture", "FV-Q", "Ventes de janvier 2027 à 4,00 € l’unité", "", ""],
];
export const C08_CSV: Partial<Record<StockSourceType, string>> = {
  st_count: countCsv(C08_COUNT_ROWS), st_system: systemCsv(C08_SYSTEM_ROWS), st_support: ST_CSV.st_support,
  st_costs: costCsv(C08_COST_ROWS), st_ledger: ledgerCsv(C08_LEDGER_ROWS), st_value: valueCsv(C08_VALUE_ROWS),
};
/**
 * Shape a result as rule 1.0.0 wrote it (`stocks-result-2`): unbounded indicative gap on the theoretical quantity, no cost basis,
 * no value populations. Used to prove that such a stored result stays readable and stale.
 */
const omit = <T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> => Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;
export function legacyStockResult(r: StockResult) {
  const v = r.valueReview!;
  if (isLegacyValueReview(v)) return r;
  return { ...r, schemaVersion: "stocks-result-2" as const,
    valuation: { ...r.valuation!, units: r.valuation!.units.map(u => u.cost ? { ...u, cost: omit(u.cost, "basis", "capacity") } : u), totals: omit(r.valuation!.totals, "population") },
    valueReview: { hypothesesProvided: true as const, depreciationMapped: v.depreciationMapped, units: v.units.map(u => ({ unitId: u.unitId,
      hypothesis: u.hypothesis ? omit(u.hypothesis, "uomLabel", "basis") : null, costCents: u.cost?.unitCostCents ?? null, systemQuantity: u.quantity.theoretical,
      // As 1.0.0 computed them: unbounded gap on the theoretical quantity, compared as such with the booked depreciation.
      unitGapCents: u.cost && u.hypothesis && u.economicGapCents !== null ? String(BigInt(u.cost.unitCostCents) > BigInt(u.hypothesis.currentValueCents) ? BigInt(u.cost.unitCostCents) - BigInt(u.hypothesis.currentValueCents) : 0n) : null,
      indicativeGapCents: u.economicGapCents, bookedCents: u.bookedCents,
      differenceCents: u.economicGapCents !== null && u.bookedCents !== null ? String(BigInt(u.economicGapCents) - BigInt(u.bookedCents)) : null, rotation: u.rotation,
      status: u.status === "gap_partial" ? "gap" as const : u.status === "not_in_system" ? "cost_missing" as const : u.status })),
      totals: { reviewed: 6, notReviewed: 3, indicativeGapCents: "26500", bookedCents: v.totals.bookedCents, ledgerDepreciationCents: v.totals.ledgerDepreciationCents, depreciationFramingDifferenceCents: v.totals.depreciationFramingDifferenceCents } } };
}
