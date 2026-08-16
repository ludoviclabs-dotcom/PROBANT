/**
 * Frontiere de validation du snapshot d'IS.
 *
 * Les invariants de prudence sont portes ici et non seulement dans le moteur :
 * un snapshot reconstruit depuis la persistance ou une API doit echouer aussi
 * fort qu'un snapshot mal calcule.
 */
import { z } from "zod";
import { TaxControlOutcomeSchema, TaxLimitationSchema, EvidenceStrengthSchema } from "../schemas";

const SafeIntegerSchema = z.number().int().safe();
const CentAmountSchema = SafeIntegerSchema;
const BasisPointsSchema = SafeIntegerSchema.min(0).max(10_000);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u, "SHA-256 hexadecimal attendu");
const IsoDateTimeSchema = z.string().datetime({ offset: true });

const TaxSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
});

const TaxTraceStepSchema = z.object({
  id: z.string().min(1),
  operation: z.string().min(1),
  inputRefs: z.array(z.string().min(1)),
  outputRef: z.string().min(1),
  sourceRefs: z.array(TaxSourceRefSchema),
  canonicalInputHash: HashSchema,
});

export const CorporateTaxAdjustmentCategorySchema = z.enum([
  "accounted_tax",
  "explicit_non_deductible",
  "donations_patronage",
  "provisions",
  "depreciation",
  "timing_difference",
  "unreconciled",
]);

const CorporateTaxOriginSchema = z.object({
  kind: z.enum(["declaration", "ledger", "human_review"]),
  snapshotId: z.string().min(1),
  fieldCode: z.string().min(1).nullable(),
  accountCode: z.string().min(1).nullable(),
  contentHash: HashSchema,
});

export const CorporateTaxAdjustmentLineSchema = z.object({
  id: z.string().min(1),
  category: CorporateTaxAdjustmentCategorySchema,
  direction: z.enum(["reintegration", "deduction"]),
  status: z.enum(["confirmed", "candidate"]),
  label: z.string().min(1),
  amountCents: CentAmountSchema.nonnegative(),
  signedAmountCents: CentAmountSchema,
  sign: z.enum(["positive", "negative"]),
  origin: CorporateTaxOriginSchema,
  sourceRefs: z.array(TaxSourceRefSchema),
  evidenceRefs: z.array(z.string().min(1)),
  evidenceStrength: EvidenceStrengthSchema,
}).superRefine((line, ctx) => {
  const expectedSign = line.direction === "reintegration" ? "positive" : "negative";
  if (line.sign !== expectedSign) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sign"], message: "le signe doit suivre le sens du retraitement" });
  }
  const expectedSigned = line.direction === "reintegration" ? line.amountCents : -line.amountCents;
  if (line.signedAmountCents !== expectedSigned) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["signedAmountCents"], message: "le montant signe doit deriver du sens et de la magnitude" });
  }
  if (line.status === "confirmed" && line.origin.kind === "ledger") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "un compte ou un libelle ne confirme pas un retraitement" });
  }
  if (line.status === "confirmed" && (line.sourceRefs.length === 0 || line.evidenceRefs.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "un retraitement confirme exige une source et une preuve" });
  }
});

const CorporateTaxConditionAssessmentSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  profileInput: z.string().min(1),
  status: z.enum(["satisfied", "not_satisfied", "unknown"]),
  observedValue: z.string().min(1).nullable(),
  expected: z.string().min(1),
});

const CorporateTaxEligibilitySchema = z.object({
  status: z.enum(["eligible", "not_eligible", "unknown", "not_applicable"]),
  conditions: z.array(CorporateTaxConditionAssessmentSchema),
}).superRefine((eligibility, ctx) => {
  if (eligibility.status === "eligible" && eligibility.conditions.some((item) => item.status !== "satisfied")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "une eligibilite acquise exige toutes ses conditions satisfaites" });
  }
});

export const CorporateTaxBracketAllocationSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  order: SafeIntegerSchema.positive(),
  rateBasisPoints: BasisPointsSchema,
  baseCapCents: CentAmountSchema.positive().nullable(),
  allocatedBaseCents: CentAmountSchema.nonnegative(),
  taxCents: CentAmountSchema.nonnegative(),
  applied: z.boolean(),
  eligibility: CorporateTaxEligibilitySchema,
  ruleVersionId: z.string().min(1),
  sourceRefs: z.array(TaxSourceRefSchema).min(1),
}).superRefine((bracket, ctx) => {
  if (bracket.baseCapCents !== null && bracket.allocatedBaseCents > bracket.baseCapCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocatedBaseCents"], message: "la base allouee depasse le plafond de la tranche" });
  }
  if (bracket.eligibility.status === "unknown" && bracket.allocatedBaseCents !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocatedBaseCents"], message: "une tranche d'eligibilite inconnue ne peut recevoir aucune base" });
  }
  if (bracket.eligibility.status === "not_eligible" && bracket.allocatedBaseCents !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocatedBaseCents"], message: "une tranche non eligible ne peut recevoir aucune base" });
  }
});

const CorporateTaxDeficitOutcomeSchema = z.object({
  status: z.enum(["applied", "none_available", "not_applicable", "unknown"]),
  availableStockCents: CentAmountSchema.nonnegative().nullable(),
  declaredOffsetCents: CentAmountSchema.nullable(),
  legalCapCents: CentAmountSchema.nonnegative().nullable(),
  appliedOffsetCents: CentAmountSchema.nonnegative(),
  remainingStockCents: CentAmountSchema.nonnegative().nullable(),
  sourceRefs: z.array(TaxSourceRefSchema),
});

const CorporateTaxStepCodeSchema = z.enum([
  "accounting_result",
  "reintegrations_confirmed",
  "reintegrations_proposed",
  "deductions_confirmed",
  "deductions_proposed",
  "tax_result_before_deficits",
  "deficits_offset",
  "taxable_base",
  "gross_tax",
]);

const CorporateTaxWaterfallStepSchema = z.object({
  code: CorporateTaxStepCodeSchema,
  label: z.string().min(1),
  order: SafeIntegerSchema.positive(),
  kind: z.enum(["base", "delta", "subtotal", "total"]),
  sign: z.enum(["positive", "negative", "neutral"]),
  deltaCents: CentAmountSchema,
  runningTotalCents: CentAmountSchema,
  status: z.enum(["computed", "proposed", "unavailable"]),
  adjustmentLineIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
});

export const CorporateTaxWaterfallSchema = z.object({
  steps: z.array(CorporateTaxWaterfallStepSchema).length(9),
  confirmedTaxResultCents: CentAmountSchema,
  proposedTaxResultCents: CentAmountSchema,
  currency: z.literal("EUR"),
});

export const CorporateTaxNoteSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  kind: z.enum(["method", "limitation", "difference", "prudence"]),
  message: z.string().min(1),
  relatedStepCodes: z.array(CorporateTaxStepCodeSchema),
  sourceRefs: z.array(TaxSourceRefSchema),
  noteHash: HashSchema,
}).superRefine((note, ctx) => {
  if (note.kind === "method" && note.sourceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRefs"], message: "une note normative exige une citation" });
  }
});

export const CorporateTaxSnapshotSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
  entityId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  fiscalYear: SafeIntegerSchema.min(2000).max(2200),
  formVintage: SafeIntegerSchema.min(2000).max(2200),
  taxType: z.literal("corporate_income_tax"),
  regime: z.enum(["standard", "simplified"]),
  engineVersion: z.string().min(1),
  calculationVersion: z.string().min(1),
  rateScheduleId: z.string().min(1).nullable(),
  status: z.enum(["computed", "blocked"]),
  accountingResultCents: CentAmountSchema,
  adjustmentLines: z.array(CorporateTaxAdjustmentLineSchema),
  reintegrationsConfirmedCents: CentAmountSchema.nonnegative(),
  reintegrationsProposedCents: CentAmountSchema.nonnegative(),
  deductionsConfirmedCents: CentAmountSchema.nonnegative(),
  deductionsProposedCents: CentAmountSchema.nonnegative(),
  taxResultBeforeDeficitsCents: CentAmountSchema,
  deficits: CorporateTaxDeficitOutcomeSchema,
  taxableBaseCents: CentAmountSchema.nonnegative(),
  brackets: z.array(CorporateTaxBracketAllocationSchema),
  grossTaxCents: CentAmountSchema.nonnegative(),
  taxImpactStatus: z.enum(["not_computed", "estimated", "computed", "reviewed"]),
  reconciliationLineIds: z.array(z.string().min(1)),
  waterfall: CorporateTaxWaterfallSchema,
  notes: z.array(CorporateTaxNoteSchema),
  limitations: z.array(TaxLimitationSchema),
  trace: z.array(TaxTraceStepSchema),
  outcome: TaxControlOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  sourceRefs: z.array(TaxSourceRefSchema),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  canonicalJson: z.string().min(2),
  snapshotHash: HashSchema,
}).superRefine((snapshot, ctx) => {
  // Le MVP n'autorise jamais une non-conformite confirmee sur ce calcul.
  if (snapshot.outcome === "confirmed_non_compliance") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outcome"], message: "confirmed_non_compliance est hors perimetre du calcul d'IS" });
  }
  if (snapshot.status === "blocked" && snapshot.limitations.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limitations"], message: "un calcul bloque doit expliciter sa limitation" });
  }
  if (snapshot.status === "blocked" && snapshot.taxImpactStatus !== "not_computed") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxImpactStatus"], message: "un calcul bloque ne produit aucun impact chiffre" });
  }
  if (snapshot.status === "computed" && snapshot.rateScheduleId === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rateScheduleId"], message: "un calcul execute doit citer le bareme utilise" });
  }
  const bracketTotal = snapshot.brackets.reduce((total, bracket) => total + bracket.taxCents, 0);
  if (bracketTotal !== snapshot.grossTaxCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["grossTaxCents"], message: "l'impot brut doit egaler la somme des tranches" });
  }
  const allocated = snapshot.brackets.reduce((total, bracket) => total + bracket.allocatedBaseCents, 0);
  if (snapshot.status === "computed" && allocated !== snapshot.taxableBaseCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brackets"], message: "la base imposable doit etre integralement ventilee" });
  }
});
