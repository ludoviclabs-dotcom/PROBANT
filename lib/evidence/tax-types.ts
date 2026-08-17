import type {
  EvidenceStrength,
  ReviewEvent,
  ReviewEventAction,
  ReviewEventStatus,
  TaxControlOutcome,
  TaxProfile,
  TaxReconciliationLine,
  TaxType,
} from "@/lib/canonical-model";
import type { TaxRuleStatus } from "@/lib/knowledge/tax-types";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";

export const TAX_EVIDENCE_ARTIFACT_FORMATS = [
  "tax_profile_json",
  "tax_computation_json",
  "tax_reconciliation_lines_csv",
  "tax_findings_csv",
  "tax_controls_csv",
  "tax_sources_csv",
  "tax_review_events_csv",
  "fiscal_note_html",
  "fiscal_note_pdf",
] as const;

export type TaxEvidenceArtifactFormat = typeof TAX_EVIDENCE_ARTIFACT_FORMATS[number];

export interface TaxEvidenceArtifact {
  readonly id: string;
  readonly format: TaxEvidenceArtifactFormat;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly derivedFrom?: string;
  readonly validation?: {
    readonly pdfA: {
      readonly status: "not_validated" | "valid" | "invalid";
      readonly profile: string | null;
      readonly validator: string | null;
      readonly validatedAt: string | null;
    };
  };
}

export interface TaxEvidenceSourceDocument {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly snapshotId: string | null;
  readonly fileName: string;
  readonly documentType: string;
  readonly sha256: string;
  readonly parserName: string | null;
  readonly parserVersion: string | null;
  readonly location: {
    readonly provider: string;
    readonly key: string;
    readonly versionId: string | null;
  } | null;
}

export interface TaxSupplementalEvidence extends TaxEvidenceSourceDocument {
  readonly findingIds: readonly string[];
  readonly attachedBy: string;
  readonly attachedAt: string;
}

export interface TaxEvidenceDatum {
  readonly sourceDocumentId: string;
  readonly documentSnapshotId: string | null;
  readonly fieldId: string | null;
  readonly fieldCode: string | null;
  readonly rawValue: string | null;
  readonly normalizedValue: string | number | boolean | null;
  readonly unit: string | null;
  readonly sourceLocation: {
    readonly page: number | null;
    readonly sheet: string | null;
    readonly cell: string | null;
    readonly box: string | null;
    readonly zone: string | null;
    readonly structuredPath: string | null;
  };
  readonly datumHash: string;
}

export interface TaxEvidenceSource {
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly canonicalUrl: string | null;
  readonly documentUrl: string | null;
  readonly versionLabel: string | null;
  readonly locator: string;
  readonly publishedAt: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly status: TaxRuleStatus | "unresolved";
  readonly lastVerifiedAt: string | null;
}

export interface TaxEvidenceCalculationStep {
  readonly id: string;
  readonly operation: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly canonicalInputHash: string;
  readonly sourceVersionIds: readonly string[];
}

export type TaxFindingDecision = ReviewEventAction | "pending";

/**
 * Ligne de preuve autonome d'un constat fiscal.
 *
 * Tous les maillons demandés par TAX-09 sont des champs de premier niveau ou
 * des collections explicitement typées; aucun maillon n'est reconstitué depuis
 * un texte libre lors de l'export.
 */
export interface TaxEvidenceFinding {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly taxType: TaxType;
  readonly title: string;
  readonly sourceDocumentIds: readonly string[];
  readonly data: readonly TaxEvidenceDatum[];
  readonly rule: {
    readonly id: string;
    readonly version: string;
    readonly status: TaxRuleStatus;
  };
  readonly sources: readonly TaxEvidenceSource[];
  readonly paragraphs: readonly string[];
  readonly formula: string;
  readonly intermediateCalculations: readonly TaxEvidenceCalculationStep[];
  readonly result: {
    readonly outcome: TaxControlOutcome;
    readonly amountCents: number | null;
    readonly detail: string;
  };
  readonly evidenceLevel: EvidenceStrength;
  readonly decision: TaxFindingDecision;
  readonly comment: string;
  readonly supplementalEvidenceIds: readonly string[];
  readonly limitationIds: readonly string[];
  readonly findingHash: string;
}

export interface TaxEvidenceControlRow {
  readonly controlId: string;
  readonly controlVersion: string;
  readonly taxType: TaxType;
  readonly status: string;
  readonly outcome: TaxControlOutcome | null;
  readonly evidenceLevel: EvidenceStrength;
  readonly findingIds: readonly string[];
  readonly sourceVersionIds: readonly string[];
  readonly resultHash: string;
}

export interface TaxComputationEvidenceExport {
  readonly exportSchemaVersion: "1.0.0";
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly fiscalSynthesis: TaxCockpitSource["synthesis"];
  readonly corporateIncomeTax: NonNullable<TaxCockpitSource["corporateTax"]>["snapshot"] | null;
  readonly vat: NonNullable<TaxCockpitSource["vat"]>["snapshot"] | null;
  readonly otherTaxes: {
    readonly cfe: NonNullable<TaxCockpitSource["cfe"]>["snapshot"] | null;
  };
  readonly findings: readonly TaxEvidenceFinding[];
  readonly reviewEvents: readonly ReviewEvent[];
  readonly reviewEventsDigest: string;
}

export interface TaxEvidenceManifest {
  readonly manifestVersion: "1.0.0-tax";
  readonly applicationVersion: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly fiscalYear: number;
  readonly createdAt: string;
  readonly fiscalSnapshotSha256: string;
  readonly reviewEventsDigest: string;
  readonly sourceDocuments: readonly TaxEvidenceSourceDocument[];
  readonly normativeSources: readonly TaxEvidenceSource[];
  readonly artifacts: readonly TaxEvidenceArtifact[];
  readonly limitations: readonly {
    readonly code: string;
    readonly message: string;
    readonly subjects: readonly string[];
  }[];
}

export interface TaxEvidenceCsvFiles {
  readonly reconciliationLines: string;
  readonly findings: string;
  readonly controls: string;
  readonly sources: string;
  readonly reviewEvents: string;
}

export interface TaxEvidenceExportPackage {
  readonly manifest: TaxEvidenceManifest;
  readonly manifestJson: string;
  readonly taxProfileJson: string;
  readonly taxComputationJson: string;
  readonly csv: TaxEvidenceCsvFiles;
  readonly html: string;
  readonly pdf: Uint8Array;
}

export interface BuildTaxEvidencePackageInput {
  readonly source: TaxCockpitSource;
  readonly profile?: TaxProfile;
  readonly reviewEvents?: readonly ReviewEvent[];
  readonly supplementalEvidence?: readonly TaxSupplementalEvidence[];
  /** Métadonnées épinglées, notamment pour rejouer une source future historique. */
  readonly normativeSourceOverrides?: readonly TaxEvidenceSource[];
  /** Statuts épinglés par version pour rejouer un export historique. */
  readonly ruleStatuses?: Readonly<Record<string, TaxRuleStatus>>;
}

export interface BuildTaxEvidencePackageOptions {
  readonly applicationVersion: string;
  readonly activeContext: {
    readonly organizationId: string;
    readonly dossierId: string;
  };
}

export interface TaxReviewEventInput {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly findingId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly action: ReviewEventAction;
  readonly comment?: string;
  readonly relatedEvidenceIds?: readonly string[];
  readonly createdAt: string;
}

export interface TaxReviewProjection {
  readonly events: readonly ReviewEvent[];
  readonly decisionByFinding: Readonly<Record<string, TaxFindingDecision>>;
  readonly statusByFinding: Readonly<Record<string, ReviewEventStatus>>;
  readonly digest: string;
}

export type TaxEvidenceReconciliationLine = TaxReconciliationLine;
