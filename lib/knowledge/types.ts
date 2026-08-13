export type AuthorityLevel =
  | "law"
  | "regulation"
  | "professional_standard"
  | "international_standard"
  | "professional_guidance"
  | "interpretive_analysis"
  | "internal";

export type SourceNature =
  | "law_or_regulation"
  | "official_administrative_doctrine"
  | "french_professional_standard"
  | "international_standard"
  | "professional_doctrine"
  | "secondary_analysis"
  | "internal_rule";

export type AuthorityRank = 1 | 2 | 3 | 4 | 5 | 6;

export type Jurisdiction = "FR" | "EU" | "IASB" | "IAASB" | "INTERNAL";

export type SourceStatus =
  | "effective"
  | "future"
  | "pending_endorsement"
  | "superseded"
  | "review_required"
  | "internal";

export type RequirementForce =
  | "mandatory"
  | "recommended"
  | "interpretive"
  | "internal_parameter"
  | "review_required";

export type RequirementApplicability =
  | "direct_fr"
  | "direct_eu"
  | "international_reference"
  | "internal_only"
  | "review_required";

export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  authorityLevel: AuthorityLevel;
  sourceNature: SourceNature;
  authorityRank: AuthorityRank;
  jurisdiction: Jurisdiction;
  canonicalUrl: string;
  documentType: string;
  language: string;
  licenseStatus: string;
  accessStatus: string;
}

export interface ParagraphReference {
  sourceId: string;
  sourceVersion: string;
  locator: string;
  label?: string;
}

export interface SourceVersion {
  sourceId: string;
  versionLabel: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  status: SourceStatus;
  lastVerifiedAt: string;
  supersedes?: string;
  supersededBy?: string;
  supersessionJustification?: string;
  contentHash: string;
  homologationDate?: string;
  codeReference?: string;
  iasbStatus?: "issued" | "required" | "future" | "superseded" | "review_required";
  iasbEffectiveFrom?: string;
  euEndorsementStatus?:
    | "endorsed"
    | "not_endorsed"
    | "pending"
    | "not_applicable"
    | "review_required";
  euEndorsementDate?: string;
  euEffectiveFrom?: string;
  euEndorsementSource?: ParagraphReference;
}

export interface NumericThreshold {
  value: number;
  unit: string;
  operator?: "eq" | "gt" | "gte" | "lt" | "lte";
}

export interface NormativeRequirement {
  id: string;
  label: string;
  summary: string;
  force: RequirementForce;
  applicability: RequirementApplicability;
  authorityLevel: AuthorityLevel;
  sourceId: string;
  sourceVersion: string;
  paragraphReference?: ParagraphReference;
  numericThreshold?: NumericThreshold;
  appliesFrom?: string;
  appliesTo?: string;
}

export type CrosswalkKind =
  | "PCG"
  | "IFRS"
  | "NEP"
  | "ISA"
  | "AUDIT_CYCLE"
  | "ASSERTION"
  | "CONTROL"
  | "FINDING"
  | "EVIDENCE";

export interface CrosswalkEntry {
  id: string;
  fromKind: CrosswalkKind;
  fromId: string;
  toKind: CrosswalkKind;
  toId: string;
  relation:
    | "corresponds_to"
    | "differs_from"
    | "supports"
    | "tests"
    | "documents"
    | "maps_to"
    | "supersedes";
  applicability: "direct" | "international_correspondence_only" | "informative";
  sourceId: string;
  sourceVersion: string;
  status: SourceStatus;
  note?: string;
}

export interface ExternalStatistic {
  id: string;
  label: string;
  value: number;
  unit: string;
  period: string;
  geographicScope: string;
  populationScope: string;
  sampleSize?: number;
  methodology: string;
  sourceId: string;
  sourceVersion: string;
  lastVerifiedAt: string;
}

export interface SourceVerification {
  sourceId: string;
  sourceVersion: string;
  checkedAt: string;
  checkedBy: string;
  result: "pass" | "pass_with_limitations" | "fail" | "not_tested";
  notes?: string;
  unverifiedFields?: string[];
}

export interface KnowledgeRegistry {
  records: SourceRecord[];
  versions: SourceVersion[];
  requirements: NormativeRequirement[];
  crosswalks: CrosswalkEntry[];
  statistics: ExternalStatistic[];
  verifications: SourceVerification[];
}
