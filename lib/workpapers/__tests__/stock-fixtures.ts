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
export const SYSTEM_HEADER = ["Ligne", "Reference", "Site", "Lot", "Unite", "Quantite", "Date", "Statut", "Motif", "Libelle", "Valeur", "Compte"];
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
  ["S001", "REF-A", "ENTREPOT-NORD", "L1", "unite", "100", "2026-12-31", "propre", "", "Vis inox M6", "1200,00", "371000"],
  ["S002", "REF-B", "ENTREPOT-NORD", "", "unite", "120", "2026-12-31", "propre", "", "Gants nitrile", "36,00", "371000"],
  ["S003", "REF-C", "ENTREPOT-NORD", "", "unite", "50", "2026-12-31", "propre", "", "Roulements 6204", "410,00", "371000"],
  ["S004", "REF-D", "ENTREPOT-SUD", "", "unite", "45", "2026-12-31", "propre", "", "Joints toriques", "90,00", "321000"],
  ["S005", "REF-E", "ENTREPOT-SUD", "L7", "unite", "17", "2026-12-31", "propre", "", "Câble 3G1,5", "68,00", "371000"],
  ["S006", "REF-E", "ENTREPOT-NORD", "L7", "unite", "20", "2026-12-31", "propre", "", "Câble 3G1,5", "80,00", "371000"],
  ["S007", "REF-F", "ENTREPOT-NORD", "", "unite", "12", "2026-12-31", "consignation_recue", "", "Pompes doseuses", "1800,00", "371000"],
  ["S008", "REF-H", "ENTREPOT-NORD", "", "unite", "15", "2026-12-31", "propre", "", "Filtres à cartouche", "300,00", "371000"],
  ["S009", "REF-W", "DEPOT-OUEST", "", "unite", "200", "2026-12-31", "propre", "", "Tubes acier", "1000,00", "321000"],
  ["S010", "REF-X", "ENTREPOT-NORD", "", "unite", "5", "2026-12-31", "en_cours", "", "Armoires en montage", "250,00", "331000"],
  ["S011", "REF-Y", "ENTREPOT-SUD", "", "unite", "9", "2026-12-31", "transit", "", "Moteurs expédiés le 30/12", "450,00", "371000"],
  ["S012", "REF-Z", "ENTREPOT-NORD", "", "unite", "3", "2026-12-31", "exclue", "Article retiré du catalogue, hors périmètre fixé par la direction", "Ancien modèle", "30,00", "371000"],
  ["S013", "REF-K", "ENTREPOT-SUD", "", "unite", "60", "2026-12-31", "consignation_deposee", "", "Stock chez le distributeur Delta", "360,00", "371000"],
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
export const COST_HEADER = ["Ligne", "Reference", "Lot", "Unite", "CoutUnitaire", "Date", "Methode", "Piece", "Libelle"];
/** Documented unit costs (sub-lot 2): REF-A at 12,00 gives the recipe's potential difference of −2 × 12 = −24,00 €. REF-H has none. */
export const COST_ROWS = [
  ["K01", "REF-A", "L1", "unite", "12,00", "2026-12-15", "cmp", "FA-501", "Facture fournisseur Alpha"],
  ["K02", "REF-B", "", "unite", "0,30", "2026-12-10", "cmp", "FA-502", "Facture fournisseur Beta"],
  ["K03", "REF-C", "", "unite", "8,00", "2026-11-30", "peps", "FA-503", "Dernières factures (PEPS)"],
  ["K04", "REF-D", "", "unite", "2,00", "2026-12-22", "cmp", "FA-504", "Facture fournisseur Delta"],
  ["K05", "REF-E", "L7", "unite", "4,00", "2026-12-05", "cmp", "FA-505", "Facture fournisseur Epsilon"],
  ["K06", "REF-G", "", "unite", "20,00", "2026-12-18", "identification_specifique", "FA-506", "Facture des capteurs"],
  ["K07", "REF-W", "", "unite", "5,00", "2026-12-01", "cmp", "FA-507", "Facture tubes"],
];
export const LEDGER_HEADER = ["Compte", "Solde", "Date", "Libelle"];
/** Closing ledger of the stock accounts: 371 and 331 framed, 321 differs by +10,00 €, 397 is a depreciation (value review). */
export const LEDGER_ROWS = [
  ["321000", "1100,00", "2026-12-31", "Matières premières"], ["331000", "250,00", "2026-12-31", "Produits en cours"],
  ["371000", "2934,00", "2026-12-31", "Marchandises"], ["397000", "-150,00", "2026-12-31", "Dépréciation des marchandises"],
];
export const ST_CSV: Record<StockSourceType, string> = {
  st_count: csv(COUNT_HEADER, COUNT_ROWS), st_system: csv(SYSTEM_HEADER, SYSTEM_ROWS), st_movements: csv(MOVEMENT_HEADER, MOVEMENT_ROWS), st_support: csv(SUPPORT_HEADER, SUPPORT_ROWS),
  st_costs: csv(COST_HEADER, COST_ROWS), st_ledger: csv(LEDGER_HEADER, LEDGER_ROWS),
};
export const countCsv = (rows: string[][]) => csv(COUNT_HEADER, rows);
/** Short system rows (10 columns) are padded with an empty value and account. */
export const systemCsv = (rows: string[][]) => csv(SYSTEM_HEADER, rows.map(r => r.length === 10 ? [...r, "", ""] : r));
export const costCsv = (rows: string[][]) => csv(COST_HEADER, rows);
export const ledgerCsv = (rows: string[][]) => csv(LEDGER_HEADER, rows);
export const movementCsv = (rows: string[][]) => csv(MOVEMENT_HEADER, rows);
/** Explicit mapping of each synthetic source; the movement coverage is declared by the preparer. */
/** `valued` maps the stated value and account of the system state (sub-lot 2); sub-lot 1 recipes leave them unmapped. */
export function stMapping(type: StockSourceType, coverage = { from: "2026-12-20", to: "2026-12-31" }, valued = false): StockMapping {
  const base = { version: "stocks-1" as const, headerRow: 1, delimiter: ";" as const, decimal: "," as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
  if (type === "st_count") return { ...base, columns: { key: "Ligne", amount: "Quantite", date: "Date" }, stocks: { basis: "count", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", pieceColumn: "Fiche", labelColumn: "Libelle" } };
  if (type === "st_system") return { ...base, columns: { key: "Ligne", amount: "Quantite", date: "Date" }, stocks: { basis: "system", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", reasonColumn: "Motif", labelColumn: "Libelle", ...(valued ? { valueColumn: "Valeur", accountColumn: "Compte" } : {}) } };
  if (type === "st_costs") return { ...base, columns: { key: "Ligne", amount: "CoutUnitaire", date: "Date" }, stocks: { basis: "costs", referenceColumn: "Reference", lotColumn: "Lot", unitColumn: "Unite", methodColumn: "Methode", pieceColumn: "Piece", labelColumn: "Libelle" } };
  if (type === "st_ledger") return { ...base, columns: { key: "Compte", amount: "Solde", date: "Date" }, stocks: { basis: "ledger", labelColumn: "Libelle" } };
  if (type === "st_movements") return { ...base, columns: { key: "Mouvement", amount: "Quantite", date: "Date" }, stocks: { basis: "movements", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", directionColumn: "Sens", pieceColumn: "Piece", labelColumn: "Libelle", coverageFrom: coverage.from, coverageTo: coverage.to } };
  return { ...base, columns: { key: "Piece", amount: "Quantite", date: "Date" }, stocks: { basis: "support", referenceColumn: "Reference", labelColumn: "Libelle" } };
}
