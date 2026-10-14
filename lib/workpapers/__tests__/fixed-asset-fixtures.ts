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
  fa_parameters: ["ref;residuel;mise_en_service;actif;composant;methode;duree_mois;prorata_n;prorata_d;debut_segment",
    "P-002;0.00;2022-01-01;A-002;;LIN-2024;60;12;12;",
    "P-003;0.00;2023-01-01;A-003;;;60;12;12;",
    "P-004;0.00;2025-02-10;A-004;;LIN-2024;120;0;12;",
    "P-005;50.00;2023-01-01;A-005;;LIN-2024;60;12;12;"].join("\n"),
  fa_support: ["piece;montant;date;actif;composant;nature;libelle",
    "FAC-001;20.00;2024-06-15;A-001;;acquisition;Facture vérin hydraulique",
    "CES-001;10.00;2024-09-30;A-001;;cession;Bon de cession du capot",
    "MES-002;60.00;2022-01-01;A-002;;mise_en_service;PV de mise en service du tour",
    "MES-003;30.00;2023-01-01;A-003;;mise_en_service;PV de recette du progiciel",
    "FAC-004;40.00;2024-11-20;A-004;;acquisition;Facture d’acompte ligne de conditionnement",
    "MES-004;40.00;2025-02-10;A-004;;mise_en_service;PV de mise en service de la ligne",
    "MES-005;45.00;2023-01-01;A-005;;mise_en_service;PV de mise en service du chariot"].join("\n"),
};
/**
 * C06 synthetic recipe — end of an unchanged linear plan. Exercise 2024, review 31/03/2025, method LIN-2024. EUR.
 * Expected values computed by hand (montant amortissable A = coût − résiduel ; annuité = A × 12 ÷ durée × n ÷ d ; restant R = A − cumul d’ouverture C0 ;
 * fin du plan = mise en service + durée − 1 jour ; dotation attendue = min(annuité, R), 0 si le plan est échu avant le 01/01/2024) :
 * N-01 actif neuf : A 12 000, mise en service 01/04/2024, 60 mois, 9/12 → 1 800 ; fin 31/03/2029 ; comptabilisé 1 800 → écart 0.
 * E-01 déjà amorti à 100 % : A 12 000, C0 12 000, mise en service 01/01/2019 → fin 31/12/2023, plan échu → 0 ; comptabilisé 2 400 → écart +2 400 (l’ancien recalcul donnait 2 400 et masquait l’erreur).
 * L-01 dernière annuité partielle : A 12 000, C0 10 800, mise en service 01/07/2019 → fin 30/06/2024, 6/12 → annuité 1 200 = R 1 200 → 1 200, non plafonnée.
 * L-02 même plan, prorata 12/12 : annuité 2 400 > R 1 200 → plafonnée 1 200 ; comptabilisé 1 200 → écart 0 (l’ancien recalcul donnait 2 400).
 * R-01 résiduel positif : coût 12 000, résiduel 2 000 → A 10 000, C0 7 500, mise en service 01/04/2020 → fin 31/03/2025, 12/12 → 2 000 ; R 2 500.
 * I-01 cumul invalide : A 12 000, C0 13 000 → recalcul bloqué, exception « cumul incohérent », excès 1 000.
 * P-01 début post-clôture : en cours, mise en service 10/02/2025 → non applicable.
 * M-01 méthode modifiée sans base validée : segment révisé déclaré au 01/01/2024 → recalcul bloqué.
 * D-01 dépréciation inscrite (1 000) → base modifiée de manière prospective, recalcul bloqué (la VNC n’est pas la base restante).
 * B-01/TOITURE composant : A 30 000, C0 6 000, 120 mois, 12/12 → 3 000 ; son propre plan.
 * X-01 cession totale dans l’exercice → non applicable.
 * Cadrage : 2154 = 126 000 ; 2315 = 5 000 ; 28154 = −86 700 ; 2915 = −1 000.
 */
const C06_ROWS: [string, string, string, string, string, string, string, string, string, string?][] = [
  // asset, component, family/account suffix, table, movement, amount, date, status, piece, label
  ["N-01", "", "2154", "brut", "ouverture", "0.00", "2024-01-01", "en_service", ""], ["N-01", "", "2154", "brut", "entree", "12000.00", "2024-04-01", "en_service", "FAC-N01"], ["N-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["N-01", "", "28154", "amortissement", "ouverture", "0.00", "2024-01-01", "en_service", ""], ["N-01", "", "28154", "amortissement", "entree", "1800.00", "2024-12-31", "en_service", ""], ["N-01", "", "28154", "amortissement", "cloture", "1800.00", "2024-12-31", "en_service", ""],
  ["E-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["E-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["E-01", "", "28154", "amortissement", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["E-01", "", "28154", "amortissement", "entree", "2400.00", "2024-12-31", "en_service", ""], ["E-01", "", "28154", "amortissement", "cloture", "14400.00", "2024-12-31", "en_service", ""],
  ["L-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["L-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["L-01", "", "28154", "amortissement", "ouverture", "10800.00", "2024-01-01", "en_service", ""], ["L-01", "", "28154", "amortissement", "entree", "1200.00", "2024-12-31", "en_service", ""], ["L-01", "", "28154", "amortissement", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["L-02", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["L-02", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["L-02", "", "28154", "amortissement", "ouverture", "10800.00", "2024-01-01", "en_service", ""], ["L-02", "", "28154", "amortissement", "entree", "1200.00", "2024-12-31", "en_service", ""], ["L-02", "", "28154", "amortissement", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["R-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["R-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["R-01", "", "28154", "amortissement", "ouverture", "7500.00", "2024-01-01", "en_service", ""], ["R-01", "", "28154", "amortissement", "entree", "2000.00", "2024-12-31", "en_service", ""], ["R-01", "", "28154", "amortissement", "cloture", "9500.00", "2024-12-31", "en_service", ""],
  ["I-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["I-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["I-01", "", "28154", "amortissement", "ouverture", "13000.00", "2024-01-01", "en_service", ""], ["I-01", "", "28154", "amortissement", "cloture", "13000.00", "2024-12-31", "en_service", ""],
  ["P-01", "", "2315", "brut", "ouverture", "0.00", "2024-01-01", "en_cours", ""], ["P-01", "", "2315", "brut", "entree", "5000.00", "2024-11-20", "en_cours", "FAC-P01"], ["P-01", "", "2315", "brut", "cloture", "5000.00", "2024-12-31", "en_cours", ""],
  ["P-01", "", "28154", "amortissement", "ouverture", "0.00", "2024-01-01", "en_cours", ""], ["P-01", "", "28154", "amortissement", "cloture", "0.00", "2024-12-31", "en_cours", ""],
  ["M-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["M-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["M-01", "", "28154", "amortissement", "ouverture", "4800.00", "2024-01-01", "en_service", ""], ["M-01", "", "28154", "amortissement", "entree", "3000.00", "2024-12-31", "en_service", ""], ["M-01", "", "28154", "amortissement", "cloture", "7800.00", "2024-12-31", "en_service", ""],
  ["D-01", "", "2154", "brut", "ouverture", "12000.00", "2024-01-01", "en_service", ""], ["D-01", "", "2154", "brut", "cloture", "12000.00", "2024-12-31", "en_service", ""],
  ["D-01", "", "28154", "amortissement", "ouverture", "4800.00", "2024-01-01", "en_service", ""], ["D-01", "", "28154", "amortissement", "entree", "2400.00", "2024-12-31", "en_service", ""], ["D-01", "", "28154", "amortissement", "cloture", "7200.00", "2024-12-31", "en_service", ""],
  ["B-01", "TOITURE", "2154", "brut", "ouverture", "30000.00", "2024-01-01", "en_service", ""], ["B-01", "TOITURE", "2154", "brut", "cloture", "30000.00", "2024-12-31", "en_service", ""],
  ["B-01", "TOITURE", "28154", "amortissement", "ouverture", "6000.00", "2024-01-01", "en_service", ""], ["B-01", "TOITURE", "28154", "amortissement", "entree", "3000.00", "2024-12-31", "en_service", ""], ["B-01", "TOITURE", "28154", "amortissement", "cloture", "9000.00", "2024-12-31", "en_service", ""],
  ["X-01", "", "2154", "brut", "ouverture", "8000.00", "2024-01-01", "sorti", ""], ["X-01", "", "2154", "brut", "sortie", "8000.00", "2024-06-30", "sorti", "CES-X01"], ["X-01", "", "2154", "brut", "cloture", "0.00", "2024-12-31", "sorti", ""],
  ["X-01", "", "28154", "amortissement", "ouverture", "6000.00", "2024-01-01", "sorti", ""], ["X-01", "", "28154", "amortissement", "sortie", "6000.00", "2024-06-30", "sorti", ""], ["X-01", "", "28154", "amortissement", "cloture", "0.00", "2024-12-31", "sorti", ""],
];
const C06_IMPAIRMENT: Record<string, string> = { "D-01": "1000.00" };
const C06_UNITS = [...new Set(C06_ROWS.map(r => r[0] + "|" + r[1]))].map(k => k.split("|"));
const C06_STATUS = (asset: string) => C06_ROWS.find(r => r[0] === asset)![7];
const C06_REGISTER = ["ligne;montant;date;actif;composant;famille;tableau;mouvement;statut;compte;traitement;libelle;piece",
  ...C06_ROWS.map((r, i) => ["C" + String(i + 1).padStart(3, "0"), r[5], r[6], r[0], r[1], "Matériel C06", r[3], r[4], r[7], r[2], "standard", "Recette C06 " + r[0] + (r[1] ? "/" + r[1] : ""), r[8]].join(";")),
  ...C06_UNITS.flatMap(([asset, component], i) => [
    ["CD" + String(2 * i + 1).padStart(3, "0"), C06_IMPAIRMENT[asset] ?? "0.00", "2024-01-01", asset, component, "Matériel C06", "depreciation", "ouverture", C06_STATUS(asset), "2915", "standard", "", ""].join(";"),
    ["CD" + String(2 * i + 2).padStart(3, "0"), C06_IMPAIRMENT[asset] ?? "0.00", "2024-12-31", asset, component, "Matériel C06", "depreciation", "cloture", C06_STATUS(asset), "2915", "standard", "", ""].join(";")]),
].join("\n");
export const FA_C06_CSV: Record<FixedAssetSourceType, string> = {
  fa_register: C06_REGISTER,
  fa_ledger: ["compte;solde;date;tableau;libelle", "2154;126000.00;2024-12-31;brut;Matériel", "2315;5000.00;2024-12-31;brut;Immobilisations en cours",
    "28154;-86700.00;2024-12-31;amortissement;Amortissements du matériel", "2915;-1000.00;2024-12-31;depreciation;Dépréciations du matériel"].join("\n"),
  fa_parameters: ["ref;residuel;mise_en_service;actif;composant;methode;duree_mois;prorata_n;prorata_d;debut_segment",
    "PN-01;0.00;2024-04-01;N-01;;LIN-2024;60;9;12;", "PE-01;0.00;2019-01-01;E-01;;LIN-2024;60;12;12;", "PL-01;0.00;2019-07-01;L-01;;LIN-2024;60;6;12;",
    "PL-02;0.00;2019-07-01;L-02;;LIN-2024;60;12;12;", "PR-01;2000.00;2020-04-01;R-01;;LIN-2024;60;12;12;", "PI-01;0.00;2021-01-01;I-01;;LIN-2024;60;12;12;",
    "PP-01;0.00;2025-02-10;P-01;;LIN-2024;60;0;12;", "PM-01;0.00;2022-01-01;M-01;;LIN-2024;48;12;12;2024-01-01", "PD-01;0.00;2022-01-01;D-01;;LIN-2024;60;12;12;",
    "PB-01;0.00;2022-01-01;B-01;TOITURE;LIN-2024;120;12;12;"].join("\n"),
  fa_support: ["piece;montant;date;actif;composant;nature;libelle",
    "FAC-N01;12000.00;2024-04-01;N-01;;acquisition;Facture N-01", "MES-N01;12000.00;2024-04-01;N-01;;mise_en_service;PV N-01", "MES-E01;12000.00;2019-01-01;E-01;;mise_en_service;PV E-01",
    "MES-L01;12000.00;2019-07-01;L-01;;mise_en_service;PV L-01", "MES-L02;12000.00;2019-07-01;L-02;;mise_en_service;PV L-02", "MES-R01;12000.00;2020-04-01;R-01;;mise_en_service;PV R-01",
    "MES-I01;12000.00;2021-01-01;I-01;;mise_en_service;PV I-01", "FAC-P01;5000.00;2024-11-20;P-01;;acquisition;Facture P-01", "MES-P01;5000.00;2025-02-10;P-01;;mise_en_service;PV P-01",
    "MES-M01;12000.00;2022-01-01;M-01;;mise_en_service;PV M-01", "MES-D01;12000.00;2022-01-01;D-01;;mise_en_service;PV D-01", "MES-B01;30000.00;2022-01-01;B-01;TOITURE;mise_en_service;PV toiture",
    "CES-X01;8000.00;2024-06-30;X-01;;cession;Cession X-01"].join("\n"),
};
const COLUMNS: Record<FixedAssetSourceType, { key: string; amount: string; date: string; fixedAssets: Partial<FixedAssetMapping["fixedAssets"]> }> = {
  fa_register: { key: "ligne", amount: "montant", date: "date", fixedAssets: { basis: "asset_register", assetColumn: "actif", componentColumn: "composant", familyColumn: "famille", tableColumn: "tableau", movementColumn: "mouvement", statusColumn: "statut", accountColumn: "compte", treatmentColumn: "traitement", labelColumn: "libelle", pieceColumn: "piece" } },
  fa_ledger: { key: "compte", amount: "solde", date: "date", fixedAssets: { basis: "ledger_closing", tableColumn: "tableau", labelColumn: "libelle" } },
  fa_parameters: { key: "ref", amount: "residuel", date: "mise_en_service", fixedAssets: { basis: "depreciation_parameters", assetColumn: "actif", componentColumn: "composant", methodColumn: "methode", durationColumn: "duree_mois", prorataNumeratorColumn: "prorata_n", prorataDenominatorColumn: "prorata_d", segmentStartColumn: "debut_segment" } },
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
