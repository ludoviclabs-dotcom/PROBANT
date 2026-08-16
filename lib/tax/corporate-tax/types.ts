/**
 * Contrats du moteur d'impot sur les societes (TAX-05).
 *
 * Le moteur propose : il ne qualifie pas. Toute grandeur derivee conserve son
 * signe, son origine, sa version de source et sa preuve. Un retraitement issu
 * d'un numero de compte ou d'un libelle reste un candidat tant qu'une piece ou
 * une decision humaine ne l'a pas confirme.
 */
import type {
  BasisPoints,
  CentAmount,
  EvidenceStrength,
  TaxControlOutcome,
  TaxLimitation,
  TaxSourceRef,
  TaxTraceStep,
} from "@/lib/canonical-model";

/** Categories de retraitement du MVP. Aucune autre n'est produite automatiquement. */
export type CorporateTaxAdjustmentCategory =
  | "accounted_tax"
  | "explicit_non_deductible"
  | "donations_patronage"
  | "provisions"
  | "depreciation"
  | "timing_difference"
  | "unreconciled";

export type CorporateTaxAdjustmentDirection = "reintegration" | "deduction";

/**
 * `confirmed` exige une source normative et une preuve documentaire.
 * `candidate` est une piste de revue : elle n'entre jamais dans le resultat
 * fiscal retenu, seulement dans la fourchette proposee.
 */
export type CorporateTaxAdjustmentStatus = "confirmed" | "candidate";

/**
 * Origine d'une valeur. `ledger` designe une lecture de compte ou de libelle :
 * elle ne peut pas, a elle seule, confirmer un retraitement.
 */
export interface CorporateTaxOrigin {
  readonly kind: "declaration" | "ledger" | "human_review";
  readonly snapshotId: string;
  readonly fieldCode: string | null;
  readonly accountCode: string | null;
  readonly contentHash: string;
}

export interface CorporateTaxAdjustmentLine {
  readonly id: string;
  readonly category: CorporateTaxAdjustmentCategory;
  readonly direction: CorporateTaxAdjustmentDirection;
  readonly status: CorporateTaxAdjustmentStatus;
  readonly label: string;
  /** Magnitude, toujours positive. Le sens est porte par `direction` et `sign`. */
  readonly amountCents: CentAmount;
  /** Effet sur le resultat fiscal : positif en reintegration, negatif en deduction. */
  readonly signedAmountCents: CentAmount;
  readonly sign: "positive" | "negative";
  readonly origin: CorporateTaxOrigin;
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly evidenceRefs: readonly string[];
  readonly evidenceStrength: EvidenceStrength;
}

export type CorporateTaxConditionStatus = "satisfied" | "not_satisfied" | "unknown";

export interface CorporateTaxConditionAssessment {
  readonly code: string;
  readonly label: string;
  readonly profileInput: string;
  readonly status: CorporateTaxConditionStatus;
  /** Valeur reellement lue dans le profil, ou `null` si absente. */
  readonly observedValue: string | null;
  readonly expected: string;
}

/**
 * `unknown` des qu'une seule condition est non renseignee : le taux reduit n'est
 * alors pas applique et l'exercice produit `missing_information`.
 */
export type CorporateTaxEligibilityStatus = "eligible" | "not_eligible" | "unknown" | "not_applicable";

export interface CorporateTaxEligibility {
  readonly status: CorporateTaxEligibilityStatus;
  readonly conditions: readonly CorporateTaxConditionAssessment[];
}

export interface CorporateTaxBracketAllocation {
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly rateBasisPoints: BasisPoints;
  readonly baseCapCents: CentAmount | null;
  readonly allocatedBaseCents: CentAmount;
  readonly taxCents: CentAmount;
  readonly applied: boolean;
  readonly eligibility: CorporateTaxEligibility;
  readonly ruleVersionId: string;
  readonly sourceRefs: readonly TaxSourceRef[];
}

export interface CorporateTaxDeficitOutcome {
  readonly status: "applied" | "none_available" | "not_applicable" | "unknown";
  readonly availableStockCents: CentAmount | null;
  readonly declaredOffsetCents: CentAmount | null;
  /** Plafond legal calcule : franchise + quote-part de la fraction excedentaire. */
  readonly legalCapCents: CentAmount | null;
  readonly appliedOffsetCents: CentAmount;
  readonly remainingStockCents: CentAmount | null;
  readonly sourceRefs: readonly TaxSourceRef[];
}

/** Etapes du chainage, dans l'ordre de presentation impose par la specification. */
export type CorporateTaxStepCode =
  | "accounting_result"
  | "reintegrations_confirmed"
  | "reintegrations_proposed"
  | "deductions_confirmed"
  | "deductions_proposed"
  | "tax_result_before_deficits"
  | "deficits_offset"
  | "taxable_base"
  | "gross_tax";

export interface CorporateTaxWaterfallStep {
  readonly code: CorporateTaxStepCode;
  readonly label: string;
  readonly order: number;
  readonly kind: "base" | "delta" | "subtotal" | "total";
  readonly sign: "positive" | "negative" | "neutral";
  /** Variation portee par l'etape ; nulle pour un sous-total. */
  readonly deltaCents: CentAmount;
  /** Cumul apres application de l'etape. */
  readonly runningTotalCents: CentAmount;
  readonly status: "computed" | "proposed" | "unavailable";
  readonly adjustmentLineIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
}

export interface CorporateTaxWaterfall {
  readonly steps: readonly CorporateTaxWaterfallStep[];
  /** Resultat fiscal en ne retenant que les retraitements confirmes. */
  readonly confirmedTaxResultCents: CentAmount;
  /** Meme chaine en integrant les candidats : borne de revue, jamais un verdict. */
  readonly proposedTaxResultCents: CentAmount;
  readonly currency: "EUR";
}

export type CorporateTaxNoteKind = "method" | "limitation" | "difference" | "prudence";

/**
 * Note explicative attachee au calcul. Une note `method` enonce une regle : elle
 * exige au moins une citation. Une note `prudence` decrit le comportement du
 * moteur et n'en exige pas.
 */
export interface CorporateTaxNote {
  readonly id: string;
  readonly code: string;
  readonly kind: CorporateTaxNoteKind;
  readonly message: string;
  readonly relatedStepCodes: readonly CorporateTaxStepCode[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly noteHash: string;
}

export type CorporateTaxComparisonKey =
  | "declared_tax_result_before_deficits"
  | "declared_deficit_offset"
  | "declared_final_tax_result"
  | "declared_normal_rate_base"
  | "declared_reduced_rate_base"
  | "accounted_tax_charge"
  | "accounted_tax_liability";

export interface CorporateTaxSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxPeriodId: string;
  readonly fiscalYear: number;
  readonly formVintage: number;
  readonly taxType: "corporate_income_tax";
  readonly regime: "standard" | "simplified";
  readonly engineVersion: string;
  readonly calculationVersion: string;
  /** `null` quand aucun bareme n'existe pour l'exercice et le millesime demandes. */
  readonly rateScheduleId: string | null;
  readonly status: "computed" | "blocked";

  readonly accountingResultCents: CentAmount;
  readonly adjustmentLines: readonly CorporateTaxAdjustmentLine[];
  readonly reintegrationsConfirmedCents: CentAmount;
  readonly reintegrationsProposedCents: CentAmount;
  readonly deductionsConfirmedCents: CentAmount;
  readonly deductionsProposedCents: CentAmount;
  readonly taxResultBeforeDeficitsCents: CentAmount;
  readonly deficits: CorporateTaxDeficitOutcome;
  readonly taxableBaseCents: CentAmount;
  readonly brackets: readonly CorporateTaxBracketAllocation[];
  readonly grossTaxCents: CentAmount;
  readonly taxImpactStatus: "not_computed" | "estimated" | "computed" | "reviewed";

  readonly reconciliationLineIds: readonly string[];
  readonly waterfall: CorporateTaxWaterfall;
  readonly notes: readonly CorporateTaxNote[];
  readonly limitations: readonly TaxLimitation[];
  readonly trace: readonly TaxTraceStep[];
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly sourceRefs: readonly TaxSourceRef[];

  readonly createdAt: string;
  readonly createdBy: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}
