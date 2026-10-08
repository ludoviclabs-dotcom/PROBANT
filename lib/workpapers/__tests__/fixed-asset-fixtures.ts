import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { previewImport, type ImportBatch } from "../imports";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import type { FixedAssetMapping, FixedAssetSourceType } from "../fixed-asset-sources";
import type { FixedAssetDraft } from "../fixed-asset-review";

/**
 * Synthetic recipe only (Mission 10). Amounts in EUR.
 * A-001 : ouverture 100 + entrée 20 − sortie 10, clôture observée 109 → écart −1 ; sortie partielle (recalcul exclu).
 * A-002 : recalcul nominal 60 × 12 / 60 × 12/12 = 12, dotation comptabilisée 12.
 * A-003 : méthode absente. A-004 : en cours, mise en service après la clôture. A-005 : résiduel 50 > coût 45. T-001 : réévalué, exclu.
 */
export const faPeriod = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-03-31", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const faScope: WorkpaperScope = { organizationId: "org-fa-synthetic", dossierId: "33333333-3333-4333-8333-333333333333", periodId: periodId(faPeriod), mode: "real" };
export const faPreparer: Principal = { id: "preparer-fa", grants: [{ scope: faScope, permissions: ["read", "prepare", "download"] }] };
const R = (line: string, amount: string, date: string, asset: string, family: string, table: string, movement: string, status: string, account: string, treatment = "standard", label = "", piece = "", component = "") =>
  [line, amount, date, asset, component, family, table, movement, status, account, treatment, label, piece].join(";");
const REGISTER = ["ligne;montant;date;actif;composant;famille;tableau;mouvement;statut;compte;traitement;libelle;piece",
  R("L01", "100.00", "2024-01-01", "A-001", "Matériel industriel", "brut", "ouverture", "en_service", "2154", "standard", "Presse hydraulique"),
  R("L02", "20.00", "2024-06-15", "A-001", "Matériel industriel", "brut", "entree", "en_service", "2154", "standard", "Presse hydraulique — vérin", "FAC-001"),
  R("L03", "10.00", "2024-09-30", "A-001", "Matériel industriel", "brut", "sortie", "en_service", "2154", "standard", "Presse hydraulique — capot cédé", "CES-001"),
  R("L04", "109.00", "2024-12-31", "A-001", "Matériel industriel", "brut", "cloture", "en_service", "2154", "standard", "Presse hydraulique"),
  R("L05", "30.00", "2024-01-01", "A-001", "Matériel industriel", "amortissement", "ouverture", "en_service", "28154"),
  R("L06", "12.00", "2024-12-31", "A-001", "Matériel industriel", "amortissement", "entree", "en_service", "28154", "standard", "Dotation 2024"),
  R("L07", "2.00", "2024-09-30", "A-001", "Matériel industriel", "amortissement", "sortie", "en_service", "28154", "standard", "Amortissement du capot cédé"),
  R("L08", "40.00", "2024-12-31", "A-001", "Matériel industriel", "amortissement", "cloture", "en_service", "28154"),
  R("L09", "0.00", "2024-01-01", "A-001", "Matériel industriel", "depreciation", "ouverture", "en_service", "2915"),
  R("L10", "0.00", "2024-12-31", "A-001", "Matériel industriel", "depreciation", "cloture", "en_service", "2915"),
  R("L11", "60.00", "2024-01-01", "A-002", "Matériel industriel", "brut", "ouverture", "en_service", "2154", "standard", "Tour numérique"),
  R("L12", "60.00", "2024-12-31", "A-002", "Matériel industriel", "brut", "cloture", "en_service", "2154", "standard", "Tour numérique"),
  R("L13", "12.00", "2024-01-01", "A-002", "Matériel industriel", "amortissement", "ouverture", "en_service", "28154"),
  R("L14", "12.00", "2024-12-31", "A-002", "Matériel industriel", "amortissement", "entree", "en_service", "28154", "standard", "Dotation 2024"),
  R("L15", "24.00", "2024-12-31", "A-002", "Matériel industriel", "amortissement", "cloture", "en_service", "28154"),
  R("L16", "0.00", "2024-01-01", "A-002", "Matériel industriel", "depreciation", "ouverture", "en_service", "2915"),
  R("L17", "0.00", "2024-12-31", "A-002", "Matériel industriel", "depreciation", "cloture", "en_service", "2915"),
  R("L18", "30.00", "2024-01-01", "A-003", "Logiciels", "brut", "ouverture", "en_service", "2051", "standard", "Progiciel de gestion"),
  R("L19", "30.00", "2024-12-31", "A-003", "Logiciels", "brut", "cloture", "en_service", "2051", "standard", "Progiciel de gestion"),
  R("L20", "6.00", "2024-01-01", "A-003", "Logiciels", "amortissement", "ouverture", "en_service", "2805"),
  R("L21", "6.00", "2024-12-31", "A-003", "Logiciels", "amortissement", "entree", "en_service", "2805", "standard", "Dotation 2024"),
  R("L22", "12.00", "2024-12-31", "A-003", "Logiciels", "amortissement", "cloture", "en_service", "2805"),
  R("L23", "0.00", "2024-01-01", "A-003", "Logiciels", "depreciation", "ouverture", "en_service", "2905"),
  R("L24", "0.00", "2024-12-31", "A-003", "Logiciels", "depreciation", "cloture", "en_service", "2905"),
  R("L25", "0.00", "2024-01-01", "A-004", "Matériel industriel", "brut", "ouverture", "en_cours", "2315", "standard", "Ligne de conditionnement"),
  R("L26", "40.00", "2024-11-20", "A-004", "Matériel industriel", "brut", "entree", "en_cours", "2315", "standard", "Ligne de conditionnement — acompte", "FAC-004"),
  R("L27", "40.00", "2024-12-31", "A-004", "Matériel industriel", "brut", "cloture", "en_cours", "2315", "standard", "Ligne de conditionnement"),
  R("L28", "0.00", "2024-01-01", "A-004", "Matériel industriel", "amortissement", "ouverture", "en_cours", "28154"),
  R("L29", "0.00", "2024-12-31", "A-004", "Matériel industriel", "amortissement", "cloture", "en_cours", "28154"),
  R("L30", "0.00", "2024-01-01", "A-004", "Matériel industriel", "depreciation", "ouverture", "en_cours", "2915"),
  R("L31", "0.00", "2024-12-31", "A-004", "Matériel industriel", "depreciation", "cloture", "en_cours", "2915"),
  R("L32", "45.00", "2024-01-01", "A-005", "Matériel industriel", "brut", "ouverture", "en_service", "2154", "standard", "Chariot élévateur"),
  R("L33", "45.00", "2024-12-31", "A-005", "Matériel industriel", "brut", "cloture", "en_service", "2154", "standard", "Chariot élévateur"),
  R("L34", "9.00", "2024-01-01", "A-005", "Matériel industriel", "amortissement", "ouverture", "en_service", "28154"),
  R("L35", "9.00", "2024-12-31", "A-005", "Matériel industriel", "amortissement", "entree", "en_service", "28154", "standard", "Dotation 2024"),
  R("L36", "18.00", "2024-12-31", "A-005", "Matériel industriel", "amortissement", "cloture", "en_service", "28154"),
  R("L37", "0.00", "2024-01-01", "A-005", "Matériel industriel", "depreciation", "ouverture", "en_service", "2915"),
  R("L38", "0.00", "2024-12-31", "A-005", "Matériel industriel", "depreciation", "cloture", "en_service", "2915"),
  R("L39", "500.00", "2024-01-01", "T-001", "Terrains", "brut", "ouverture", "en_service", "211", "reevaluation", "Terrain réévalué"),
  R("L40", "500.00", "2024-12-31", "T-001", "Terrains", "brut", "cloture", "en_service", "211", "reevaluation", "Terrain réévalué"),
].join("\n");
export const FA_CSV: Record<FixedAssetSourceType, string> = {
  fa_register: REGISTER,
  fa_ledger: ["compte;solde;date;tableau;libelle",
    "2154;214.00;2024-12-31;brut;Installations techniques, matériel et outillage",
    "28154;-82.00;2024-12-31;amortissement;Amortissements du matériel industriel",
    "2915;0.00;2024-12-31;depreciation;Dépréciations du matériel industriel",
    "2315;40.00;2024-12-31;brut;Immobilisations corporelles en cours",
    "2051;30.00;2024-12-31;brut;Concessions, logiciels",
    "2805;-12.00;2024-12-31;amortissement;Amortissements des logiciels",
    "2905;0.00;2024-12-31;depreciation;Dépréciations des logiciels",
    "211;500.00;2024-12-31;brut;Terrains"].join("\n"),
  fa_parameters: ["ref;residuel;mise_en_service;actif;composant;methode;duree_mois;prorata_n;prorata_d",
    "P-002;0.00;2022-01-01;A-002;;LIN-2024;60;12;12",
    "P-003;0.00;2023-01-01;A-003;;;60;12;12",
    "P-004;0.00;2025-02-10;A-004;;LIN-2024;120;0;12",
    "P-005;50.00;2023-01-01;A-005;;LIN-2024;60;12;12"].join("\n"),
  fa_support: ["piece;montant;date;actif;composant;nature;libelle",
    "FAC-001;20.00;2024-06-15;A-001;;acquisition;Facture vérin hydraulique",
    "CES-001;10.00;2024-09-30;A-001;;cession;Bon de cession du capot",
    "MES-002;60.00;2022-01-01;A-002;;mise_en_service;PV de mise en service du tour",
    "MES-003;30.00;2023-01-01;A-003;;mise_en_service;PV de recette du progiciel",
    "FAC-004;40.00;2024-11-20;A-004;;acquisition;Facture d’acompte ligne de conditionnement",
    "MES-004;40.00;2025-02-10;A-004;;mise_en_service;PV de mise en service de la ligne",
    "MES-005;45.00;2023-01-01;A-005;;mise_en_service;PV de mise en service du chariot"].join("\n"),
};
const COLUMNS: Record<FixedAssetSourceType, { key: string; amount: string; date: string; fixedAssets: Partial<FixedAssetMapping["fixedAssets"]> }> = {
  fa_register: { key: "ligne", amount: "montant", date: "date", fixedAssets: { basis: "asset_register", assetColumn: "actif", componentColumn: "composant", familyColumn: "famille", tableColumn: "tableau", movementColumn: "mouvement", statusColumn: "statut", accountColumn: "compte", treatmentColumn: "traitement", labelColumn: "libelle", pieceColumn: "piece" } },
  fa_ledger: { key: "compte", amount: "solde", date: "date", fixedAssets: { basis: "ledger_closing", tableColumn: "tableau", labelColumn: "libelle" } },
  fa_parameters: { key: "ref", amount: "residuel", date: "mise_en_service", fixedAssets: { basis: "depreciation_parameters", assetColumn: "actif", componentColumn: "composant", methodColumn: "methode", durationColumn: "duree_mois", prorataNumeratorColumn: "prorata_n", prorataDenominatorColumn: "prorata_d" } },
  fa_support: { key: "piece", amount: "montant", date: "date", fixedAssets: { basis: "movement_support", assetColumn: "actif", componentColumn: "composant", kindColumn: "nature", labelColumn: "libelle" } },
};
export const FA_TYPE_ORDER: FixedAssetSourceType[] = ["fa_register", "fa_ledger", "fa_parameters", "fa_support"];
export function faMapping(type: FixedAssetSourceType, overrides: Partial<FixedAssetMapping> & { fixedAssetOverrides?: Partial<FixedAssetMapping["fixedAssets"]> } = {}): FixedAssetMapping {
  const c = COLUMNS[type], { fixedAssetOverrides, ...rest } = overrides;
  return { version: "fixed-assets-1", headerRow: 1, columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR",
    fixedAssets: { ...c.fixedAssets, ...fixedAssetOverrides } as FixedAssetMapping["fixedAssets"], ...rest };
}
export async function previewFa(type: FixedAssetSourceType, text = FA_CSV[type], mapping = faMapping(type)) {
  return previewImport(new File([text], type + ".csv", { type: "text/csv" }), faScope, mapping, faPreparer, type, "fixed_assets.review");
}
/** Server-side approval shape (as reloaded from PostgreSQL); never produced by a browser. */
export function approveFa(batch: ImportBatch): ImportBatch {
  return { ...batch, approval: { actorId: faPreparer.id, at: "2025-04-01T09:00:00Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } };
}
export async function faSources(texts: Partial<Record<FixedAssetSourceType, string>> = {}, types: FixedAssetSourceType[] = FA_TYPE_ORDER) {
  return Promise.all(types.map(async type => approveFa(await previewFa(type, texts[type] ?? FA_CSV[type]))));
}
export const LINEAR_2024 = { id: "LIN-2024", version: "1", kind: "linear" as const, label: "Linéaire — politique d’amortissement 2024", source: "Politique d’amortissement du client, version 2024 (pièce synthétique)", from: "2024-01-01", to: "2024-12-31", basis: "Coût brut de clôture moins valeur résiduelle documentée" };
export function faDraft(overrides: Partial<FixedAssetDraft> = {}): FixedAssetDraft { return { methods: [LINEAR_2024], ...overrides }; }
