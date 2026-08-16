import type { AuthorityLevel } from "./types";
import type { TaxType } from "@/lib/canonical-model";

export type { TaxType } from "@/lib/canonical-model";

export type TaxRuleStatus = "effective" | "future" | "superseded" | "review_required";

export type TaxSourceNature =
  | "statute"
  | "official_doctrine"
  | "official_form"
  | "official_notice"
  | "official_service_guidance"
  | "secondary_analysis";

export interface TaxSource {
  id: string;
  title: string;
  publisher: string;
  authorityLevel: AuthorityLevel;
  nature: TaxSourceNature;
  canonicalUrl: string;
  jurisdiction: "FR" | "EU";
  taxTypes: TaxType[];
  mandatoryBasisAllowed: boolean;
  lastVerifiedAt: string;
}

export interface TaxSourceVersion {
  id: string;
  sourceId: string;
  versionLabel: string;
  documentUrl?: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: TaxRuleStatus;
  lastVerifiedAt: string;
}

export interface TaxParagraphReference {
  sourceId: string;
  sourceVersionId: string;
  locator: string;
}

export interface TaxApplicability {
  jurisdiction: "FR";
  entityTypes: string[];
  regimes: string[];
  conditions: string[];
  exclusions: string[];
}

export interface TaxRequiredInput {
  id: string;
  label: string;
  dataType: "amount" | "date" | "text" | "boolean" | "percentage" | "identifier";
  scope: "dossier" | "form" | "ledger" | "human_decision";
  required: boolean;
}

export interface TaxCalculationStep {
  id: string;
  operation: string;
  inputIds: string[];
  outputId: string;
  paragraphReferences: TaxParagraphReference[];
}

export interface TaxCalculationSpecification {
  kind: "none" | "formula" | "rate" | "reconciliation" | "form_relationship";
  description: string;
  expression: string | null;
  traceRequired: boolean;
  steps: TaxCalculationStep[];
}

export interface TaxRuleVersion {
  id: string;
  ruleCode: string;
  taxType: TaxType;
  title: string;
  summary: string;
  force: "mandatory" | "interpretive" | "internal" | "review_required";
  authorityLevel: AuthorityLevel;
  sourceId: string;
  sourceVersionId: string;
  paragraphReferences: TaxParagraphReference[];
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  fiscalYears: number[];
  formVintages: number[];
  status: TaxRuleStatus;
  applicability: TaxApplicability;
  requiredInputs: TaxRequiredInput[];
  calculationSpecification: TaxCalculationSpecification;
  lastVerifiedAt: string;
}

export interface TaxFormBoxRelation {
  kind: "sum_of" | "difference_of" | "carryforward_to" | "reported_to" | "supports";
  relatedBoxCodes: string[];
  description: string;
}

export interface TaxFormBox {
  code: string;
  label: string;
  formVintage: number;
  dataType: "amount" | "date" | "text" | "boolean" | "percentage" | "identifier";
  sign: "positive" | "negative" | "signed" | "not_applicable";
  unit: "EUR" | "date" | "text" | "boolean" | "percent" | "identifier";
  relations: TaxFormBoxRelation[];
}

export interface TaxFormVintage {
  id: string;
  formNumber: string;
  name: string;
  taxType: TaxType;
  regime: string;
  period: string;
  vintage: number;
  sourceId: string;
  sourceVersionId: string;
  status: TaxRuleStatus;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  lastVerifiedAt: string;
  boxes: TaxFormBox[];
}

export interface TaxCrosswalk {
  id: string;
  taxType: TaxType;
  from: { kind: "form_box" | "ledger" | "dossier"; id: string };
  to: { kind: "rule_input" | "form_box"; id: string };
  relation: "feeds" | "reconciles_with" | "reported_to" | "supports";
  sourceReferences: TaxParagraphReference[];
  status: TaxRuleStatus;
  limitation: string;
}

export interface TaxExtensionMetadata {
  id: string;
  taxType: "c3s" | "cvae" | "cfe" | "payroll_tax";
  title: string;
  status: "metadata_only" | "future" | "review_required";
  sourceId: string;
  sourceVersionId: string;
  availableMetadata: string[];
  limitation: string;
  lastVerifiedAt: string;
}

export interface TaxKnowledgeRegistry {
  sources: TaxSource[];
  sourceVersions: TaxSourceVersion[];
  forms: TaxFormVintage[];
  rules: TaxRuleVersion[];
  crosswalks: TaxCrosswalk[];
  extensions: TaxExtensionMetadata[];
}

