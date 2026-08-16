import { z } from "zod";
import type {
  TaxCrosswalk,
  TaxExtensionMetadata,
  TaxFormVintage,
  TaxKnowledgeRegistry,
  TaxRuleVersion,
  TaxSource,
  TaxSourceVersion,
} from "./tax-types";

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date ISO attendue (YYYY-MM-DD)");
const NullableIsoDateSchema = IsoDateSchema.nullable();
const TaxTypeSchema = z.enum([
  "corporate_income_tax",
  "vat",
  "c3s",
  "cvae",
  "cfe",
  "payroll_tax",
]);
const TaxRuleStatusSchema = z.enum(["effective", "future", "superseded", "review_required"]);
const AuthorityLevelSchema = z.enum([
  "law",
  "regulation",
  "professional_standard",
  "international_standard",
  "professional_guidance",
  "interpretive_analysis",
  "internal",
]);

export const TaxParagraphReferenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1).max(300),
});

export const TaxSourceSchema: z.ZodType<TaxSource> = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500),
  publisher: z.string().min(1),
  authorityLevel: AuthorityLevelSchema,
  nature: z.enum([
    "statute",
    "official_doctrine",
    "official_form",
    "official_notice",
    "official_service_guidance",
    "secondary_analysis",
  ]),
  canonicalUrl: z.string().url(),
  jurisdiction: z.enum(["FR", "EU"]),
  taxTypes: z.array(TaxTypeSchema).min(1),
  mandatoryBasisAllowed: z.boolean(),
  lastVerifiedAt: IsoDateSchema,
});

export const TaxSourceVersionSchema: z.ZodType<TaxSourceVersion> = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    versionLabel: z.string().min(1),
    documentUrl: z.string().url().optional(),
    publishedAt: NullableIsoDateSchema,
    effectiveFrom: NullableIsoDateSchema,
    effectiveTo: NullableIsoDateSchema,
    status: TaxRuleStatusSchema,
    lastVerifiedAt: IsoDateSchema,
  })
  .superRefine((version, ctx) => {
    if (version.effectiveFrom && version.effectiveTo && version.effectiveTo < version.effectiveFrom) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "effectiveTo precede effectiveFrom" });
    }
  });

const TaxApplicabilitySchema = z.object({
  jurisdiction: z.literal("FR"),
  entityTypes: z.array(z.string().min(1)),
  regimes: z.array(z.string().min(1)),
  conditions: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1)),
});

const TaxRequiredInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  dataType: z.enum(["amount", "date", "text", "boolean", "percentage", "identifier"]),
  scope: z.enum(["dossier", "form", "ledger", "human_decision"]),
  required: z.boolean(),
});

const TaxCalculationStepSchema = z.object({
  id: z.string().min(1),
  operation: z.string().min(1),
  inputIds: z.array(z.string().min(1)).min(1),
  outputId: z.string().min(1),
  paragraphReferences: z.array(TaxParagraphReferenceSchema).min(1),
});

const TaxCalculationSpecificationSchema = z.object({
  kind: z.enum(["none", "formula", "rate", "reconciliation", "form_relationship"]),
  description: z.string().min(1).max(1200),
  expression: z.string().min(1).max(1000).nullable(),
  traceRequired: z.boolean(),
  steps: z.array(TaxCalculationStepSchema),
});

export const TaxRuleVersionSchema: z.ZodType<TaxRuleVersion> = z
  .object({
    id: z.string().min(1),
    ruleCode: z.string().min(1),
    taxType: TaxTypeSchema,
    title: z.string().min(1),
    summary: z.string().min(1).max(1600),
    force: z.enum(["mandatory", "interpretive", "internal", "review_required"]),
    authorityLevel: AuthorityLevelSchema,
    sourceId: z.string().min(1),
    sourceVersionId: z.string().min(1),
    paragraphReferences: z.array(TaxParagraphReferenceSchema).min(1),
    publishedAt: NullableIsoDateSchema,
    effectiveFrom: NullableIsoDateSchema,
    effectiveTo: NullableIsoDateSchema,
    fiscalYears: z.array(z.number().int().min(2000).max(2200)),
    formVintages: z.array(z.number().int().min(2000).max(2200)),
    status: TaxRuleStatusSchema,
    applicability: TaxApplicabilitySchema,
    requiredInputs: z.array(TaxRequiredInputSchema),
    calculationSpecification: TaxCalculationSpecificationSchema,
    lastVerifiedAt: IsoDateSchema,
  })
  .superRefine((rule, ctx) => {
    if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "effectiveTo precede effectiveFrom" });
    }
  });

const TaxFormBoxSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  formVintage: z.number().int().min(2000).max(2200),
  dataType: z.enum(["amount", "date", "text", "boolean", "percentage", "identifier"]),
  sign: z.enum(["positive", "negative", "signed", "not_applicable"]),
  unit: z.enum(["EUR", "date", "text", "boolean", "percent", "identifier"]),
  relations: z.array(z.object({
    kind: z.enum(["sum_of", "difference_of", "carryforward_to", "reported_to", "supports"]),
    relatedBoxCodes: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
  })),
});

export const TaxFormVintageSchema: z.ZodType<TaxFormVintage> = z.object({
  id: z.string().min(1),
  formNumber: z.string().min(1),
  name: z.string().min(1),
  taxType: TaxTypeSchema,
  regime: z.string().min(1),
  period: z.string().min(1),
  vintage: z.number().int().min(2000).max(2200),
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  status: TaxRuleStatusSchema,
  publishedAt: NullableIsoDateSchema,
  effectiveFrom: NullableIsoDateSchema,
  effectiveTo: NullableIsoDateSchema,
  lastVerifiedAt: IsoDateSchema,
  boxes: z.array(TaxFormBoxSchema).min(1),
});

export const TaxCrosswalkSchema: z.ZodType<TaxCrosswalk> = z.object({
  id: z.string().min(1),
  taxType: TaxTypeSchema,
  from: z.object({ kind: z.enum(["form_box", "ledger", "dossier"]), id: z.string().min(1) }),
  to: z.object({ kind: z.enum(["rule_input", "form_box"]), id: z.string().min(1) }),
  relation: z.enum(["feeds", "reconciles_with", "reported_to", "supports"]),
  sourceReferences: z.array(TaxParagraphReferenceSchema).min(1),
  status: TaxRuleStatusSchema,
  limitation: z.string().min(1),
});

export const TaxExtensionMetadataSchema: z.ZodType<TaxExtensionMetadata> = z.object({
  id: z.string().min(1),
  taxType: z.enum(["c3s", "cvae", "cfe", "payroll_tax"]),
  title: z.string().min(1),
  status: z.enum(["metadata_only", "future", "review_required"]),
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  availableMetadata: z.array(z.string().min(1)),
  limitation: z.string().min(1),
  lastVerifiedAt: IsoDateSchema,
});

export const TaxKnowledgeRegistrySchema: z.ZodType<TaxKnowledgeRegistry> = z.object({
  sources: z.array(TaxSourceSchema),
  sourceVersions: z.array(TaxSourceVersionSchema),
  forms: z.array(TaxFormVintageSchema),
  rules: z.array(TaxRuleVersionSchema),
  crosswalks: z.array(TaxCrosswalkSchema),
  extensions: z.array(TaxExtensionMetadataSchema),
});

