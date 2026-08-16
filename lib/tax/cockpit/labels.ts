/**
 * Langage utilisateur du cockpit fiscalité (TAX-08).
 *
 * Le wording FR de chaque sortie vient de `docs/tax/TAX_OUTPUT_TAXONOMY.md` :
 * les libellés courts ci-dessous sont la projection « badge » de ce wording,
 * jamais une re-qualification. Interdictions de la taxonomie : « fraude »,
 * « redressement certain », « déclaration conforme », « impôt définitif »,
 * « FEC rejeté » — aucun libellé ni méthodologie du cockpit ne les emploie.
 */
import type {
  EvidenceStrength,
  TaxControlOutcome,
  TaxControlPlanningStatus,
  TaxType,
} from "@/lib/canonical-model";

/** Libellé court d'une sortie de contrôle — les 7 statuts du langage utilisateur. */
export const TAX_OUTCOME_LABEL: Readonly<Record<TaxControlOutcome, string>> = {
  passed: "Vérifié",
  confirmed_non_compliance: "Anomalie confirmée",
  reconciliation_difference: "Incohérence",
  potential_tax_risk: "Risque potentiel",
  missing_information: "Donnée manquante",
  inconclusive: "Non concluant",
  review_recommendation: "Analyse recommandée",
};

/**
 * Ordre d'attention déterministe de TAX_OUTPUT_TAXONOMY.md §« Ordre de
 * présentation » — un ordre d'affichage, pas un ordre de vérité.
 */
export const TAX_OUTCOME_ORDER: readonly TaxControlOutcome[] = [
  "confirmed_non_compliance",
  "missing_information",
  "reconciliation_difference",
  "potential_tax_risk",
  "inconclusive",
  "review_recommendation",
  "passed",
];

/** Ton visuel d'un statut — toujours doublé du libellé texte, jamais couleur seule. */
export const TAX_OUTCOME_TONE: Readonly<
  Record<TaxControlOutcome, "critical" | "warning" | "positive" | "neutral">
> = {
  passed: "positive",
  confirmed_non_compliance: "critical",
  reconciliation_difference: "critical",
  potential_tax_risk: "warning",
  missing_information: "warning",
  inconclusive: "neutral",
  review_recommendation: "neutral",
};

/** Wording long imposé par la taxonomie, affiché dans les détails d'un constat. */
export const TAX_OUTCOME_WORDING: Readonly<Record<TaxControlOutcome, string>> = {
  passed: "Aucun écart relevé par ce contrôle sur les données couvertes.",
  confirmed_non_compliance:
    "Non-conformité confirmée après revue au regard de la référence citée, pour la période couverte.",
  reconciliation_difference: "Écart de rapprochement à analyser entre les deux sources comparées.",
  potential_tax_risk:
    "Risque fiscal potentiel à qualifier ; les éléments disponibles ne permettent pas de conclure à une non-conformité.",
  missing_information: "Information absente du dossier PROBANT : le contrôle ne peut pas conclure.",
  inconclusive: "Contrôle non concluant : une revue ou une donnée plus fiable est nécessaire.",
  review_recommendation: "Revue recommandée, sans constat d'écart ni de non-conformité.",
};

export const TAX_TYPE_LABEL: Readonly<Record<TaxType, string>> = {
  corporate_income_tax: "Impôt sur les sociétés",
  vat: "TVA",
  cfe: "CFE",
  c3s: "C3S",
  cvae: "CVAE",
  payroll_tax: "Taxe sur les salaires",
};

/** Libellé compact pour les axes des matrices et les filtres. */
export const TAX_TYPE_SHORT_LABEL: Readonly<Record<TaxType, string>> = {
  corporate_income_tax: "IS",
  vat: "TVA",
  cfe: "CFE",
  c3s: "C3S",
  cvae: "CVAE",
  payroll_tax: "TS",
};

export const EVIDENCE_STRENGTH_LABEL: Readonly<Record<EvidenceStrength, string>> = {
  direct: "Preuve directe",
  derived: "Preuve dérivée",
  corroborated: "Preuve corroborée",
  insufficient: "Preuve insuffisante",
};

export const PLANNING_STATUS_LABEL: Readonly<Record<TaxControlPlanningStatus, string>> = {
  eligible: "Éligible",
  not_applicable: "Non applicable",
  missing_inputs: "Donnée manquante",
  ready: "Prêt à exécuter",
  running: "En cours",
  concluded: "Conclu",
  inconclusive: "Non concluant",
  failed: "En échec",
};

/** Statut d'un montant calculé/déclaré/comptabilisé (`TaxComputationOutput.status` et affichages). */
export const AMOUNT_STATUS_LABEL: Readonly<Record<"computed" | "declared" | "reviewed", string>> = {
  computed: "Calculé",
  declared: "Déclaré",
  reviewed: "Revu",
};

/**
 * Une sortie « conclut » quand elle énonce un résultat sur les données
 * couvertes ; les trois autres décrivent une impossibilité ou une diligence.
 * Même partition que `outcomeCounts` de la synthèse fiscale.
 */
export const CONCLUSIVE_OUTCOMES: readonly TaxControlOutcome[] = [
  "passed",
  "confirmed_non_compliance",
  "reconciliation_difference",
  "potential_tax_risk",
];

export const NON_CONCLUSIVE_OUTCOMES: readonly TaxControlOutcome[] = [
  "missing_information",
  "inconclusive",
  "review_recommendation",
];

export function isConclusiveOutcome(outcome: TaxControlOutcome): boolean {
  return CONCLUSIVE_OUTCOMES.includes(outcome);
}
