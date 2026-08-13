import { z } from "zod";
import type {
  CrosswalkEntry,
  ExternalStatistic,
  KnowledgeRegistry,
  NormativeRequirement,
  ParagraphReference,
  SourceRecord,
  SourceVerification,
  SourceVersion,
} from "./types";

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date ISO attendue (YYYY-MM-DD)");
const ContentHashSchema = z.string().regex(
  /^sha256:[a-f0-9]{64}$/,
  "contentHash doit etre un SHA-256 hexadecimal",
);

export const AuthorityLevelSchema = z.enum([
  "law",
  "regulation",
  "professional_standard",
  "international_standard",
  "professional_guidance",
  "interpretive_analysis",
  "internal",
]);

export const SourceNatureSchema = z.enum([
  "law_or_regulation",
  "official_administrative_doctrine",
  "french_professional_standard",
  "international_standard",
  "professional_doctrine",
  "secondary_analysis",
  "internal_rule",
]);

export const JurisdictionSchema = z.enum(["FR", "EU", "IASB", "IAASB", "INTERNAL"]);

export const SourceStatusSchema = z.enum([
  "effective",
  "future",
  "pending_endorsement",
  "superseded",
  "review_required",
  "internal",
]);

export const ParagraphReferenceSchema: z.ZodType<ParagraphReference> = z.object({
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1),
  locator: z.string().min(1),
  label: z.string().optional(),
});

export const SourceRecordSchema: z.ZodType<SourceRecord> = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    publisher: z.string().min(1),
    authorityLevel: AuthorityLevelSchema,
    sourceNature: SourceNatureSchema,
    authorityRank: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    jurisdiction: JurisdictionSchema,
    canonicalUrl: z.string().min(1),
    documentType: z.string().min(1),
    language: z.string().min(2),
    licenseStatus: z.string().min(1),
    accessStatus: z.string().min(1),
  })
  .superRefine((record, ctx) => {
    if (
      record.sourceNature === "secondary_analysis" &&
      record.authorityLevel !== "interpretive_analysis"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une analyse secondaire doit rester interpretive_analysis",
        path: ["authorityLevel"],
      });
    }
    if (record.sourceNature === "secondary_analysis" && record.authorityRank !== 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une analyse secondaire doit rester au rang 5",
        path: ["authorityRank"],
      });
    }
    if (record.sourceNature === "internal_rule" && record.authorityRank !== 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une regle interne doit rester au rang 6",
        path: ["authorityRank"],
      });
    }
  });

export const SourceVersionSchema: z.ZodType<SourceVersion> = z
  .object({
    sourceId: z.string().min(1),
    versionLabel: z.string().min(1),
    publicationDate: IsoDateSchema.optional(),
    effectiveFrom: IsoDateSchema.optional(),
    effectiveTo: IsoDateSchema.optional(),
    status: SourceStatusSchema,
    lastVerifiedAt: IsoDateSchema,
    supersedes: z.string().min(1).optional(),
    supersededBy: z.string().min(1).optional(),
    supersessionJustification: z.string().min(12).optional(),
    contentHash: ContentHashSchema,
    homologationDate: IsoDateSchema.optional(),
    codeReference: z.string().optional(),
    iasbStatus: z.enum(["issued", "required", "future", "superseded", "review_required"]).optional(),
    iasbEffectiveFrom: IsoDateSchema.optional(),
    euEndorsementStatus: z
      .enum(["endorsed", "not_endorsed", "pending", "not_applicable", "review_required"])
      .optional(),
    euEndorsementDate: IsoDateSchema.optional(),
    euEffectiveFrom: IsoDateSchema.optional(),
    euEndorsementSource: ParagraphReferenceSchema.optional(),
  })
  .superRefine((version, ctx) => {
    if (version.effectiveFrom && version.effectiveTo && version.effectiveTo < version.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effectiveTo ne peut pas preceder effectiveFrom",
        path: ["effectiveTo"],
      });
    }
    if (
      version.euEndorsementStatus &&
      version.euEndorsementStatus !== "not_applicable" &&
      !version.euEndorsementSource
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "le statut d'adoption UE doit citer sa source",
        path: ["euEndorsementSource"],
      });
    }
  });

export const NormativeRequirementSchema: z.ZodType<NormativeRequirement> = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    summary: z.string().min(1).max(1200),
    force: z.enum([
      "mandatory",
      "recommended",
      "interpretive",
      "internal_parameter",
      "review_required",
    ]),
    applicability: z.enum([
      "direct_fr",
      "direct_eu",
      "international_reference",
      "internal_only",
      "review_required",
    ]),
    authorityLevel: AuthorityLevelSchema,
    sourceId: z.string().min(1),
    sourceVersion: z.string().min(1),
    paragraphReference: ParagraphReferenceSchema.optional(),
    numericThreshold: z
      .object({
        value: z.number().finite(),
        unit: z.string().min(1),
        operator: z.enum(["eq", "gt", "gte", "lt", "lte"]).optional(),
      })
      .optional(),
    appliesFrom: IsoDateSchema.optional(),
    appliesTo: IsoDateSchema.optional(),
  })
  .superRefine((requirement, ctx) => {
    if (requirement.force === "mandatory" && !requirement.paragraphReference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une exigence obligatoire doit citer un paragraphe ou article",
        path: ["paragraphReference"],
      });
    }
    if (
      requirement.force === "mandatory" &&
      ["interpretive_analysis", "internal"].includes(requirement.authorityLevel)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une analyse ou un parametre interne ne peut pas etre obligatoire",
        path: ["force"],
      });
    }
    if (
      requirement.numericThreshold &&
      requirement.force === "mandatory" &&
      !requirement.paragraphReference
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "une regle chiffree obligatoire doit citer sa source et son paragraphe",
        path: ["numericThreshold"],
      });
    }
  });

const CrosswalkKindSchema = z.enum([
  "PCG",
  "IFRS",
  "NEP",
  "ISA",
  "AUDIT_CYCLE",
  "ASSERTION",
  "CONTROL",
  "FINDING",
  "EVIDENCE",
]);

export const CrosswalkEntrySchema: z.ZodType<CrosswalkEntry> = z.object({
  id: z.string().min(1),
  fromKind: CrosswalkKindSchema,
  fromId: z.string().min(1),
  toKind: CrosswalkKindSchema,
  toId: z.string().min(1),
  relation: z.enum([
    "corresponds_to",
    "differs_from",
    "supports",
    "tests",
    "documents",
    "maps_to",
    "supersedes",
  ]),
  applicability: z.enum(["direct", "international_correspondence_only", "informative"]),
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1),
  status: SourceStatusSchema,
  note: z.string().optional(),
});

export const ExternalStatisticSchema: z.ZodType<ExternalStatistic> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number().finite(),
  unit: z.string().min(1),
  period: z.string().min(1),
  geographicScope: z.string().min(1),
  populationScope: z.string().min(1),
  sampleSize: z.number().int().positive().optional(),
  methodology: z.string().min(1),
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1),
  lastVerifiedAt: IsoDateSchema,
});

export const SourceVerificationSchema: z.ZodType<SourceVerification> = z.object({
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1),
  checkedAt: IsoDateSchema,
  checkedBy: z.string().min(1),
  result: z.enum(["pass", "pass_with_limitations", "fail", "not_tested"]),
  notes: z.string().optional(),
  unverifiedFields: z.array(z.string().min(1)).optional(),
});

export const KnowledgeRegistrySchema: z.ZodType<KnowledgeRegistry> = z.object({
  records: z.array(SourceRecordSchema),
  versions: z.array(SourceVersionSchema),
  requirements: z.array(NormativeRequirementSchema),
  crosswalks: z.array(CrosswalkEntrySchema),
  statistics: z.array(ExternalStatisticSchema),
  verifications: z.array(SourceVerificationSchema),
});
