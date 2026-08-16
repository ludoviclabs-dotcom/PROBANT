/**
 * Frontière de validation du module CFE.
 *
 * L'invariant central est négatif : le module **ne calcule pas**. Le schéma
 * refuse donc tout snapshot qui revendiquerait une capacité de calcul, et exige
 * que la limitation d'incalculabilité soit toujours portée.
 */
import { z } from "zod";
import { EvidenceStrengthSchema, TaxControlOutcomeSchema, TaxLimitationSchema } from "@/lib/tax/schemas";

const SafeIntegerSchema = z.number().int().safe();
const CentAmountSchema = SafeIntegerSchema;
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u, "SHA-256 hexadecimal attendu");
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date ISO YYYY-MM-DD attendue");
const IsoDateTimeSchema = z.string().datetime({ offset: true });

const TaxSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
});

/** `confirmed_non_compliance` est hors périmètre du module. */
export const CfeOutcomeSchema = TaxControlOutcomeSchema.refine(
  (outcome) => outcome !== "confirmed_non_compliance",
  "confirmed_non_compliance est hors perimetre du module CFE",
);

export const CfeNoticeSchema = z.object({
  id: z.string().min(1),
  establishmentId: z.string().min(1),
  taxYear: SafeIntegerSchema.min(2000).max(2200),
  periodStartDate: IsoDateSchema,
  periodEndDate: IsoDateSchema,
  lines: z.array(z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    amountCents: CentAmountSchema,
  })),
  totalDueCents: CentAmountSchema.nullable(),
  provenance: z.enum(["imported_document", "manual_entry"]),
  sourceDocumentId: z.string().min(1).nullable(),
  capturedBy: z.string().min(1),
  capturedAt: IsoDateTimeSchema,
  noticeHash: HashSchema,
}).superRefine((notice, ctx) => {
  if (notice.provenance === "imported_document" && notice.sourceDocumentId === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceDocumentId"], message: "un avis importe doit citer son document source" });
  }
  if (notice.periodEndDate < notice.periodStartDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEndDate"], message: "la fin de periode precede le debut" });
  }
});

const CfeLedgerCandidateSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["charge", "settlement", "liability"]),
  journalCode: z.string(),
  ecritureNum: z.string(),
  ecritureDate: z.string().min(1),
  pieceRef: z.string().min(1).nullable(),
  accountNumber: z.string().min(1),
  amountCents: CentAmountSchema,
  sourceLineNumbers: z.array(SafeIntegerSchema),
  evidenceStrength: EvidenceStrengthSchema,
}).superRefine((candidate, ctx) => {
  // Une position reconstruite depuis les écritures ne dépasse jamais `derived`.
  if (candidate.evidenceStrength === "direct" || candidate.evidenceStrength === "corroborated") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceStrength"],
      message: "une position reconstruite depuis le FEC ne peut pas porter une preuve directe ou corroboree",
    });
  }
});

const SourceCoverageSchema = z.object({
  status: z.enum(["covered", "partially_covered", "not_covered"]),
  coveredThroughDate: IsoDateSchema.nullable(),
  uncoveredFromDate: IsoDateSchema.nullable(),
  expiringSourceVersionIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
});

export const CfeApplicabilitySchema = z.object({
  status: z.enum(["applicable", "not_applicable", "unknown"]),
  exemptionStatus: z.enum(["none", "claimed", "unknown"]),
  frenchEstablishmentIds: z.array(z.string().min(1)),
  unverifiedEstablishmentIds: z.array(z.string().min(1)),
  sourceCoverage: SourceCoverageSchema,
  reasons: z.array(z.string().min(1)),
});

const CfeControlResultSchema = z.object({
  controlId: z.string().min(1),
  title: z.string().min(1),
  outcome: CfeOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  detail: z.string().min(1),
  observedCents: CentAmountSchema.nullable(),
  comparedCents: CentAmountSchema.nullable(),
  differenceCents: CentAmountSchema.nullable(),
  toleranceCents: CentAmountSchema.nonnegative(),
  reconciliationLineIds: z.array(z.string().min(1)),
  limitationIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
  resultHash: HashSchema,
}).superRefine((control, ctx) => {
  if (control.outcome === "passed" && control.evidenceStrength === "insufficient") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outcome"], message: "un controle sans preuve suffisante ne peut pas conclure passed" });
  }
  if (control.outcome === "missing_information" && control.limitationIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limitationIds"], message: "une information manquante doit citer sa limitation" });
  }
});

const CfeNoteSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  kind: z.enum(["method", "limitation", "difference", "prudence"]),
  message: z.string().min(1),
  relatedControlIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
  noteHash: HashSchema,
}).superRefine((note, ctx) => {
  if (note.kind === "method" && note.sourceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRefs"], message: "une note normative exige une citation" });
  }
});

export const CfeReconciliationSnapshotSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
  entityId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  taxType: z.literal("cfe"),
  taxYear: SafeIntegerSchema.min(2000).max(2200),
  engineVersion: z.string().min(1),
  calculationVersion: z.string().min(1),
  status: z.enum(["reconciled", "blocked"]),
  // `compute` n'existe pas : le module ne peut pas revendiquer un calcul.
  capability: z.enum(["reconcile", "recommend_review", "blocked"]),
  applicability: CfeApplicabilitySchema,
  notices: z.array(CfeNoticeSchema),
  noticeTotalCents: CentAmountSchema.nullable(),
  ledger: z.object({
    chargeCents: CentAmountSchema,
    settlementCents: CentAmountSchema,
    liabilityBalanceCents: CentAmountSchema,
    candidates: z.array(CfeLedgerCandidateSchema),
  }),
  establishmentComparisons: z.array(z.object({
    establishmentId: z.string().min(1),
    inProfile: z.boolean(),
    inNotices: z.boolean(),
    municipality: z.string().min(1).nullable(),
    verificationStatus: z.enum(["verified", "unverified", "unknown", "absent"]),
    noticeTotalCents: CentAmountSchema.nullable(),
  })),
  controls: z.array(CfeControlResultSchema),
  reconciliationLineIds: z.array(z.string().min(1)),
  outcome: CfeOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  limitations: z.array(TaxLimitationSchema),
  notes: z.array(CfeNoteSchema),
  trace: z.array(z.object({
    id: z.string().min(1),
    operation: z.string().min(1),
    inputRefs: z.array(z.string().min(1)),
    outputRef: z.string().min(1),
    sourceRefs: z.array(TaxSourceRefSchema),
    canonicalInputHash: HashSchema,
  })),
  sourceRefs: z.array(TaxSourceRefSchema),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  canonicalJson: z.string().min(2),
  snapshotHash: HashSchema,
}).superRefine((snapshot, ctx) => {
  // Invariant central : l'incalculabilité est toujours portée et tracée.
  if (!snapshot.limitations.some((item) => item.code === "CFE_BASE_NOT_RECOMPUTABLE")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["limitations"],
      message: "le module doit toujours porter la limitation d'incalculabilite de la cotisation",
    });
  }
  if (!snapshot.trace.some((step) => step.operation === "abstain_from_computation")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trace"],
      message: "l'abstention de calcul doit etre tracee",
    });
  }
  if (snapshot.status === "blocked" && snapshot.controls.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["controls"], message: "un module bloque n'execute aucun controle" });
  }
  if (snapshot.status === "blocked" && snapshot.capability !== "blocked") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capability"], message: "un module bloque ne revendique aucune capacite" });
  }
  // Une capacité `reconcile` exige au moins un avis exploitable.
  if (snapshot.capability === "reconcile" && snapshot.notices.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capability"], message: "rapprocher exige au moins un avis" });
  }
});
