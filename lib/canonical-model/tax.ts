import type { ControlStage, FindingFamily } from "./finding";

export type TaxType =
  | "corporate_income_tax"
  | "vat"
  | "c3s"
  | "cvae"
  | "cfe"
  | "payroll_tax";

export type TaxControlOutcome =
  | "passed"
  | "confirmed_non_compliance"
  | "reconciliation_difference"
  | "potential_tax_risk"
  | "missing_information"
  | "inconclusive"
  | "review_recommendation";

export type EvidenceStrength =
  | "direct"
  | "derived"
  | "corroborated"
  | "insufficient";

export type TaxCapabilityStatus = "available" | "future" | "non_available";
export type TaxAutomation = "automatic" | "assisted" | "manual" | "unavailable";
export type TaxFrequency = "annual" | "quarterly" | "monthly" | "event_based";

/** Montant monétaire exact. Les schémas runtime imposent un entier sûr. */
export type CentAmount = number;
/** Pourcentage exact en points de base : 10 000 = 100 %. */
export type BasisPoints = number;

export interface TaxSourceRef {
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly locator: string;
}

export interface TaxParameter {
  readonly key: string;
  readonly value: string | number | boolean | null;
  readonly verificationStatus: "verified" | "unverified" | "unknown";
  readonly sourceRefs: readonly string[];
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

export interface TaxEstablishmentLocation {
  readonly establishmentId: string;
  readonly countryCode: string;
  readonly postalCode: string | null;
  readonly municipality: string | null;
  readonly isPrincipal: boolean;
  readonly verificationStatus: "verified" | "unverified" | "unknown";
}

export interface TaxProfile {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly version: string;
  readonly jurisdiction: "FR";
  readonly status: "draft" | "confirmed" | "superseded";
  readonly corporateIncomeTaxRegime:
    | "standard"
    | "simplified"
    | "exempt"
    | "unknown";
  readonly vatRegime:
    | "real_normal"
    | "mini_real"
    | "real_simplified"
    | "franchise"
    | "exempt"
    | "unknown";
  readonly accountingPeriod: {
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly corporateIncomeTaxGroupStatus: "none" | "member" | "parent" | "unknown";
  readonly vatGroupStatus: "none" | "member" | "representative" | "unknown";
  readonly turnoverAmountCents: CentAmount | null;
  readonly capitalPaidStatus: "fully_paid" | "partially_paid" | "unknown";
  readonly ownershipStatus: "known" | "unknown";
  readonly qualifyingIndividualOwnershipBasisPoints: BasisPoints | null;
  readonly vatLiabilityRatioStatus: "known" | "unknown";
  readonly vatLiabilityRatioBasisPoints: BasisPoints | null;
  readonly establishments: readonly TaxEstablishmentLocation[];
  readonly parameters: readonly TaxParameter[];
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly canonicalJson: string;
  readonly contentHash: string;
}

export interface TaxPeriod {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxType: TaxType;
  readonly startDate: string;
  readonly endDate: string;
  readonly fiscalYear: number;
  readonly formVintage: number;
  readonly frequency: TaxFrequency;
  readonly accountingPeriodId: string | null;
  readonly status: "open" | "filed" | "amended" | "closed" | "unknown";
  readonly version: string;
  readonly sourceRefs: readonly string[];
  readonly createdAt: string;
  readonly canonicalJson: string;
  readonly contentHash: string;
}

export interface TaxDeclarationField {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly taxDocumentSnapshotId: string;
  readonly formVintage: number;
  readonly fieldCode: string;
  readonly label: string;
  readonly dataType: "amount" | "date" | "text" | "boolean" | "percentage" | "identifier";
  readonly rawValue: string | null;
  readonly amountCents: CentAmount | null;
  readonly normalizedValue: string | boolean | null;
  readonly percentageBasisPoints: BasisPoints | null;
  readonly unit: "cent" | "date" | "text" | "boolean" | "basis_point" | "identifier";
  readonly sign: "positive" | "negative" | "signed" | "not_applicable";
  /** Empreinte du document source, repetee sur la trace pour la rendre autonome. */
  readonly documentHash: string;
  readonly sourceLocation: {
    readonly page: number | null;
    readonly sheet: string | null;
    readonly cell: string | null;
    readonly box: string | null;
    readonly zone: string | null;
    readonly structuredPath: string | null;
  };
  readonly extractionMethod: "structured" | "text_layer" | "ocr" | "manual";
  readonly parserVersion: string;
  readonly confidence: number;
  readonly processingStatus: "accepted" | "needs_manual_review" | "rejected";
  readonly usableForAutomatedCalculation: boolean;
  readonly reviewStatus: "unreviewed" | "verified" | "rejected" | "not_applicable";
  readonly warnings: readonly string[];
  readonly evidenceStrength: EvidenceStrength;
  readonly fieldHash: string;
}

export interface TaxDocumentSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly logicalDocumentId: string;
  readonly sourceDocumentId: string;
  readonly taxPeriodId: string;
  readonly taxPeriodVersion: string;
  readonly taxType: TaxType;
  readonly documentType: string;
  readonly formNumber: string;
  readonly formVintage: number;
  readonly snapshotVersion: string;
  readonly schemaVersion: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly sourceHash: string;
  readonly fields: readonly TaxDeclarationField[];
  readonly warnings: readonly string[];
  readonly limitationIds: readonly string[];
  readonly supersedesSnapshotId: string | null;
  readonly status: "review_required" | "active" | "superseded" | "rejected";
  readonly createdAt: string;
  readonly createdBy: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}

export interface TaxControlDefinition {
  readonly controlId: string;
  readonly controlVersion: string;
  readonly title: string;
  readonly purpose: string;
  readonly family: FindingFamily;
  readonly domain: "tax";
  readonly taxType: TaxType;
  readonly controlStage: Extract<ControlStage, "tax_review">;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly fiscalYears: readonly number[];
  readonly formVintages: readonly number[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly requiredDocumentTypes: readonly string[];
  readonly requiredFieldCodes: readonly string[];
  readonly allowedOutcomes: readonly TaxControlOutcome[];
  readonly automation: TaxAutomation;
  readonly maximumEvidenceStrength: EvidenceStrength;
  readonly capabilityStatus: TaxCapabilityStatus;
  readonly reviewRequired: boolean;
  readonly definitionHash: string;
}

export interface TaxTraceStep {
  readonly id: string;
  readonly operation: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly canonicalInputHash: string;
}

export interface TaxCoverage {
  readonly applicableControlCount: number;
  readonly executedControlCount: number;
  readonly blockedControlCount: number;
  readonly requiredDocumentCount: number;
  readonly availableDocumentCount: number;
  readonly requiredFieldCount: number;
  readonly usableFieldCount: number;
  readonly verifiedFieldCount: number;
  readonly coveredPeriodIds: readonly string[];
  readonly uncoveredPeriodIds: readonly string[];
  readonly excludedScopes: readonly string[];
}

export interface TaxLimitation {
  readonly id: string;
  readonly code: string;
  readonly scope: "document" | "field" | "control" | "period" | "synthesis";
  readonly capabilityStatus: TaxCapabilityStatus;
  readonly reason: string;
  readonly message: string;
  readonly blockedOutcomes: readonly TaxControlOutcome[];
  readonly requiredInputs: readonly string[];
  readonly relatedIds: readonly string[];
  readonly resolvability: "user_can_supply" | "human_review" | "future_engine" | "not_resolvable";
}

export interface TaxControlExecution {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxPeriodId: string;
  readonly fiscalYear: number;
  readonly formVintage: number;
  readonly executionVersion: string;
  readonly controlId: string;
  readonly controlVersion: string;
  readonly definitionHash: string;
  readonly taxProfileId: string;
  readonly taxProfileVersion: string;
  readonly taxDocumentSnapshotIds: readonly string[];
  readonly inputHashes: readonly string[];
  readonly status: "not_applicable" | "blocked" | "executed" | "error";
  readonly proposedOutcome: TaxControlOutcome | null;
  readonly evidenceStrength: EvidenceStrength;
  readonly trace: readonly TaxTraceStep[];
  readonly reconciliationLineIds: readonly string[];
  readonly adjustmentIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly coverage: TaxCoverage;
  readonly limitations: readonly TaxLimitation[];
  readonly engineVersion: string;
  readonly executedAt: string;
  readonly canonicalJson: string;
  readonly executionHash: string;
}

export interface TaxReconciliationOperand {
  readonly amountCents: CentAmount;
  readonly currency: "EUR";
  readonly snapshotId: string;
  readonly fieldCode: string | null;
}

export interface TaxReconciliationLine {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly executionId: string;
  readonly lineKey: string;
  readonly label: string;
  readonly leftOperand: TaxReconciliationOperand | null;
  readonly rightOperand: TaxReconciliationOperand | null;
  readonly normalizationNotes: readonly string[];
  readonly differenceAmountCents: CentAmount | null;
  readonly toleranceAmountCents: CentAmount;
  readonly toleranceFamily: FindingFamily;
  readonly status: "matched" | "different" | "not_comparable" | "missing_operand";
  readonly evidenceRefs: readonly string[];
  readonly traceStepIds: readonly string[];
  readonly canonicalJson: string;
  readonly lineHash: string;
}

export interface TaxAdjustment {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly executionId: string;
  readonly taxPeriodId: string;
  readonly taxType: TaxType;
  readonly version: string;
  readonly adjustmentCode: string;
  readonly label: string;
  readonly direction: "increase_tax_base" | "decrease_tax_base" | "increase_tax" | "decrease_tax" | "unquantified";
  readonly baseAmountCents: CentAmount | null;
  readonly taxAmountCents: CentAmount | null;
  readonly currency: "EUR";
  readonly originRefs: readonly string[];
  readonly sourceVersionIds: readonly string[];
  readonly trace: readonly TaxTraceStep[];
  readonly proposalStatus: "proposed" | "withdrawn";
  readonly reviewStatus: "pending" | "accepted" | "rejected" | "amended";
  readonly reviewEventId: string | null;
  readonly supersedesAdjustmentId: string | null;
  readonly canonicalJson: string;
  readonly adjustmentHash: string;
}

export interface TaxFindingDetails {
  readonly findingId: string;
  readonly executionId: string;
  readonly domain: "tax";
  readonly taxType: TaxType;
  readonly taxPeriodId: string;
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly controlId: string;
  readonly controlVersion: string;
  readonly documentSnapshotIds: readonly string[];
  readonly sourceVersionIds: readonly string[];
  readonly reconciliationLineIds: readonly string[];
  readonly adjustmentIds: readonly string[];
  readonly taxImpactStatus: "not_computed" | "estimated" | "computed" | "reviewed";
  readonly limitationIds: readonly string[];
  readonly requiredReview: boolean;
}

export interface TaxComputationOutput {
  readonly code: string;
  readonly label: string;
  readonly amountCents: CentAmount;
  readonly currency: "EUR";
  readonly status: "declared" | "computed" | "reviewed";
}

export interface TaxComputationSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxPeriodId: string;
  readonly fiscalYear: number;
  readonly formVintage: number;
  readonly taxType: TaxType;
  readonly calculationType: string;
  readonly calculationVersion: string;
  readonly inputSnapshotIds: readonly string[];
  readonly sourceVersionIds: readonly string[];
  readonly proposedAdjustmentIds: readonly string[];
  readonly acceptedAdjustmentIds: readonly string[];
  readonly outputs: readonly TaxComputationOutput[];
  readonly trace: readonly TaxTraceStep[];
  readonly coverage: TaxCoverage;
  readonly limitations: readonly TaxLimitation[];
  readonly evidenceStrength: EvidenceStrength;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}

export interface FiscalSynthesisSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly snapshotVersion: string;
  readonly fiscalYear: number;
  readonly formVintage: number;
  readonly periodIds: readonly string[];
  readonly executionIds: readonly string[];
  readonly computationSnapshotIds: readonly string[];
  readonly outcomeCounts: Readonly<Record<TaxControlOutcome, number>>;
  readonly coverage: TaxCoverage;
  readonly limitations: readonly TaxLimitation[];
  readonly reviewSummary: {
    readonly pending: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly amended: number;
  };
  readonly headlineStatus: TaxControlOutcome | "no_conclusion";
  readonly headlinePolicyVersion: string;
  readonly trace: readonly TaxTraceStep[];
  readonly generatedAt: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}

