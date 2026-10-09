import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperScope } from "../model";
import type { StockMapping, StockSourceType } from "../stock-sources";

/**
 * Synthetic stock dossier (Mission 15). Every reference, site and quantity is invented for the recipe; none comes
 * from a real entity. Quantities are counting units; the pivot column `Quantite` carries them (two decimals at most).
 */
export const stPeriod = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR" as const, validation: "provisional" as const } satisfies AccountingPeriod;
export const stScope: WorkpaperScope = { organizationId: "org-st-synthetic", dossierId: "55555555-5555-4555-8555-555555555555", periodId: periodId(stPeriod), mode: "real" };
const csv = (header: string[], rows: string[][]) => [header, ...rows].map(r => r.join(";")).join("\n") + "\n";
export const COUNT_HEADER = ["Ligne", "Reference", "Site", "Lot", "Unite", "Quantite", "Date", "Statut", "Fiche", "Libelle"];
export const SYSTEM_HEADER = ["Ligne", "Reference", "Site", "Lot", "Unite", "Quantite", "Date", "Statut", "Motif", "Libelle"];
export const MOVEMENT_HEADER = ["Mouvement", "Reference", "Site", "Lot", "Unite", "Quantite", "Date", "Sens", "Piece", "Libelle"];
export const SUPPORT_HEADER = ["Piece", "Quantite", "Date", "Reference", "Libelle"];
/** Counted at closing in the north warehouse; counted on 20 December in the south warehouse (roll-forward). */
export const COUNT_ROWS = [
  ["C001", "REF-A", "ENTREPOT-NORD", "L1", "unite", "98", "2026-12-31", "propre", "FC-01", "Vis inox M6"],
  ["C002", "REF-B", "ENTREPOT-NORD", "", "carton", "10", "2026-12-31", "propre", "FC-01", "Gants nitrile"],
  ["C003", "REF-C", "ENTREPOT-NORD", "", "unite", "50", "2026-12-31", "propre", "FC-02", "Roulements 6204"],
  ["C004", "REF-T", "ENTREPOT-NORD", "", "unite", "30", "2026-12-31", "tiers", "FC-02", "Palettes du client Gamma (dépôt)"],
  ["C005", "REF-E", "ENTREPOT-NORD", "L7", "unite", "25", "2026-12-31", "propre", "FC-03", "Câble 3G1,5"],
  ["C006", "REF-F", "ENTREPOT-NORD", "", "unite", "12", "2026-12-31", "propre", "FC-03", "Pompes doseuses"],
  ["C007", "REF-G", "ENTREPOT-NORD", "", "unite", "7", "2026-12-31", "propre", "FC-03", "Capteurs de niveau"],
  ["C101", "REF-D", "ENTREPOT-SUD", "", "unite", "40", "2026-12-20", "propre", "FS-01", "Joints toriques"],
  ["C102", "REF-E", "ENTREPOT-SUD", "L7", "unite", "20", "2026-12-20", "propre", "FS-01", "Câble 3G1,5"],
];
export const SYSTEM_ROWS = [
  ["S001", "REF-A", "ENTREPOT-NORD", "L1", "unite", "100", "2026-12-31", "propre", "", "Vis inox M6"],
  ["S002", "REF-B", "ENTREPOT-NORD", "", "unite", "120", "2026-12-31", "propre", "", "Gants nitrile"],
  ["S003", "REF-C", "ENTREPOT-NORD", "", "unite", "50", "2026-12-31", "propre", "", "Roulements 6204"],
  ["S004", "REF-D", "ENTREPOT-SUD", "", "unite", "45", "2026-12-31", "propre", "", "Joints toriques"],
  ["S005", "REF-E", "ENTREPOT-SUD", "L7", "unite", "17", "2026-12-31", "propre", "", "Câble 3G1,5"],
  ["S006", "REF-E", "ENTREPOT-NORD", "L7", "unite", "20", "2026-12-31", "propre", "", "Câble 3G1,5"],
  ["S007", "REF-F", "ENTREPOT-NORD", "", "unite", "12", "2026-12-31", "consignation_recue", "", "Pompes doseuses"],
  ["S008", "REF-H", "ENTREPOT-NORD", "", "unite", "15", "2026-12-31", "propre", "", "Filtres à cartouche"],
  ["S009", "REF-W", "DEPOT-OUEST", "", "unite", "200", "2026-12-31", "propre", "", "Tubes acier"],
  ["S010", "REF-X", "ENTREPOT-NORD", "", "unite", "5", "2026-12-31", "en_cours", "", "Armoires en montage"],
  ["S011", "REF-Y", "ENTREPOT-SUD", "", "unite", "9", "2026-12-31", "transit", "", "Moteurs expédiés le 30/12"],
  ["S012", "REF-Z", "ENTREPOT-NORD", "", "unite", "3", "2026-12-31", "exclue", "Article retiré du catalogue, hors périmètre fixé par la direction", "Ancien modèle"],
  ["S013", "REF-K", "ENTREPOT-SUD", "", "unite", "60", "2026-12-31", "consignation_deposee", "", "Stock chez le distributeur Delta"],
];
/** Journal of intercalary movements, declared as covering 20 → 31 December. */
export const MOVEMENT_ROWS = [
  ["M001", "REF-D", "ENTREPOT-SUD", "", "unite", "10", "2026-12-22", "entree", "BR-1001", "Réception fournisseur"],
  ["M002", "REF-D", "ENTREPOT-SUD", "", "unite", "5", "2026-12-28", "sortie", "BL-2001", "Livraison client"],
  ["M003", "REF-E", "ENTREPOT-SUD", "L7", "unite", "8", "2026-12-24", "sortie", "BL-2002", "Livraison client"],
  ["M004", "REF-D", "ENTREPOT-SUD", "", "unite", "3", "2026-12-20", "sortie", "BL-2000", "Livraison du jour du comptage"],
];
export const SUPPORT_ROWS = [
  ["INSTR-INV", "0", "2026-12-01", "", "Instructions d’inventaire 2026 : les mouvements du jour du comptage sont saisis avant le comptage"],
  ["BR-1001", "10", "2026-12-22", "REF-D", "Bon de réception REF-D"],
  ["BL-2001", "5", "2026-12-28", "REF-D", "Bon de livraison REF-D"],
  ["BL-2002", "8", "2026-12-24", "REF-E", "Bon de livraison REF-E"],
  ["FC-01", "0", "2026-12-31", "", "Fiche de comptage FC-01 (Entrepôt Nord), signée par deux compteurs"],
];
export const ST_CSV: Record<StockSourceType, string> = {
  st_count: csv(COUNT_HEADER, COUNT_ROWS), st_system: csv(SYSTEM_HEADER, SYSTEM_ROWS), st_movements: csv(MOVEMENT_HEADER, MOVEMENT_ROWS), st_support: csv(SUPPORT_HEADER, SUPPORT_ROWS),
};
export const countCsv = (rows: string[][]) => csv(COUNT_HEADER, rows);
export const systemCsv = (rows: string[][]) => csv(SYSTEM_HEADER, rows);
export const movementCsv = (rows: string[][]) => csv(MOVEMENT_HEADER, rows);
/** Explicit mapping of each synthetic source; the movement coverage is declared by the preparer. */
export function stMapping(type: StockSourceType, coverage = { from: "2026-12-20", to: "2026-12-31" }): StockMapping {
  const base = { version: "stocks-1" as const, headerRow: 1, delimiter: ";" as const, decimal: "," as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
  if (type === "st_count") return { ...base, columns: { key: "Ligne", amount: "Quantite", date: "Date" }, stocks: { basis: "count", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", pieceColumn: "Fiche", labelColumn: "Libelle" } };
  if (type === "st_system") return { ...base, columns: { key: "Ligne", amount: "Quantite", date: "Date" }, stocks: { basis: "system", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", reasonColumn: "Motif", labelColumn: "Libelle" } };
  if (type === "st_movements") return { ...base, columns: { key: "Mouvement", amount: "Quantite", date: "Date" }, stocks: { basis: "movements", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", directionColumn: "Sens", pieceColumn: "Piece", labelColumn: "Libelle", coverageFrom: coverage.from, coverageTo: coverage.to } };
  return { ...base, columns: { key: "Piece", amount: "Quantite", date: "Date" }, stocks: { basis: "support", referenceColumn: "Reference", labelColumn: "Libelle" } };
}
