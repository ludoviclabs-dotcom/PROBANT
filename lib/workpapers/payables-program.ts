import type { RpneStatus } from "./payables";
export const PAYABLE_TYPES = ["payables_general", "payables_auxiliary", "payables_aged", "purchases_ledger", "payables_invoices", "payables_performance", "payables_recognition", "payables_adjustments", "payables_payments", "payables_support", "cutoff_sales"] as const;
export const PAYABLE_PROCEDURES = ["payables.frame", "payables.purchases", "payables.rpne"] as const;
export type PayableProcedure = typeof PAYABLE_PROCEDURES[number];
export const PAYABLE_LABELS: Record<string, string> = { payables_general: "GL des soldes fournisseurs", payables_auxiliary: "Auxiliaire fournisseurs", payables_aged: "Balance âgée fournisseurs", purchases_ledger: "Écritures d’achats HT", payables_invoices: "Factures d’achats : HT / TVA / TTC", payables_performance: "Réceptions et prestations", payables_recognition: "Recherche comptable par événement", payables_adjustments: "FNP / CCA et absence documentée", payables_payments: "Paiements ultérieurs TTC", payables_support: "Pièces de méthode et de fenêtre", cutoff_sales: "Factures de ventes pour la vue cut-off" };
export const STATUS_LABELS: Record<RpneStatus, string> = { booked_in_period: "Déjà enregistré", existing_accrual: "FNP existante", outside_period_justified: "Hors période justifié", omission_candidate: "Candidat omission", inconclusive: "Non concluant", not_tested: "Non testé / exclu" };
export const PAYABLE_REQUIRED: Record<PayableProcedure, string[]> = { "payables.frame": ["payables_general", "payables_auxiliary", "payables_aged"], "payables.purchases": ["purchases_ledger", "payables_invoices", "payables_performance", "payables_recognition", "payables_adjustments", "payables_support"], "payables.rpne": ["payables_payments", "payables_invoices", "payables_performance", "payables_recognition", "payables_adjustments", "payables_support"] };
export const PAYABLE_OBJECTIVES: Record<PayableProcedure, string> = { "payables.frame": "Cadrage fournisseurs GL / auxiliaire / balance âgée", "payables.purchases": "Achats enregistrés : écriture → facture → prestation", "payables.rpne": "RPNE : paiement → allocation → facture → fait générateur" };

export const PAYABLE_SHORT_LABELS: Record<string, string> = { "payables.frame": "Cadrage fournisseurs", "payables.purchases": "Achats enregistrés", "payables.rpne": "RPNE" };
export function payablesStateLabel(state: string | undefined) {
    const labels: Record<string, string> = { draft: "À préparer", ready: "Prête à exécuter", executed: "Exécutée", awaiting_review: "Revue attendue", changes_requested: "Correction demandée", approved: "Travaux approuvés", locked: "Décision verrouillée", superseded: "Version remplacée", blocked: "Bloquée", failed: "Échec d’exécution" };
    return state ? labels[state] ?? state : "À préparer";
}
export function payablesUnitLabel(unit: string) {
    const labels: Record<string, string> = { purchase_entry: "écritures HT", subsequent_payment: "paiements TTC", row: "lignes", invoice: "factures", third_party: "tiers" };
    return labels[unit] ?? unit;
}
