import { z } from "zod";

export const TaxTypeSchema = z.enum([
  "corporate_income_tax",
  "vat",
  "c3s",
  "cvae",
  "cfe",
  "payroll_tax",
]);

export const TaxControlOutcomeSchema = z.enum([
  "passed",
  "confirmed_non_compliance",
  "reconciliation_difference",
  "potential_tax_risk",
  "missing_information",
  "inconclusive",
  "review_recommendation",
]);

export const EvidenceStrengthSchema = z.enum([
  "direct",
  "derived",
  "corroborated",
  "insufficient",
]);

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date ISO YYYY-MM-DD attendue");
const IsoDateTimeSchema = z.string().datetime({ offset: true });
const VersionSchema = z.string().min(1).max(100);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u, "SHA-256 hexadecimal attendu");
const CanonicalJsonSchema = z.string().min(2).refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, "JSON canonique invalide");
const SafeIntegerSchema = z.number().int().safe();
const CentAmountSchema = SafeIntegerSchema;
const BasisPointsSchema = SafeIntegerSchema.min(0).max(10_000);
const FiscalYearSchema = z.number().int().min(2000).max(2200);
const FormVintageSchema = z.number().int().min(2000).max(2200);

const OwnedSchema = {
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
};

const TaxSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
});

export const TaxCoverageSchema = z.object({
  applicableControlCount: SafeIntegerSchema.nonnegative(),
  executedControlCount: SafeIntegerSchema.nonnegative(),
  blockedControlCount: SafeIntegerSchema.nonnegative(),
  requiredDocumentCount: SafeIntegerSchema.nonnegative(),
  availableDocumentCount: SafeIntegerSchema.nonnegative(),
  requiredFieldCount: SafeIntegerSchema.nonnegative(),
  usableFieldCount: SafeIntegerSchema.nonnegative(),
  verifiedFieldCount: SafeIntegerSchema.nonnegative(),
  coveredPeriodIds: z.array(z.string().min(1)),
  uncoveredPeriodIds: z.array(z.string().min(1)),
  excludedScopes: z.array(z.string().min(1)),
});

export const TaxLimitationSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  scope: z.enum(["document", "field", "control", "period", "synthesis"]),
  capabilityStatus: z.enum(["available", "future", "non_available"]),
  reason: z.string().min(1),
  message: z.string().min(1),
  blockedOutcomes: z.array(TaxControlOutcomeSchema),
  requiredInputs: z.array(z.string().min(1)),
  relatedIds: z.array(z.string().min(1)),
  resolvability: z.enum(["user_can_supply", "human_review", "future_engine", "not_resolvable"]),
});

const TaxTraceStepSchema = z.object({
  id: z.string().min(1),
  operation: z.string().min(1),
  inputRefs: z.array(z.string().min(1)),
  outputRef: z.string().min(1),
  sourceRefs: z.array(TaxSourceRefSchema),
  canonicalInputHash: HashSchema,
});

const TaxParameterSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  verificationStatus: z.enum(["verified", "unverified", "unknown"]),
  sourceRefs: z.array(z.string().min(1)),
  verifiedBy: z.string().min(1).nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
}).superRefine((parameter, ctx) => {
  if (parameter.verificationStatus === "verified" && (!parameter.verifiedBy || !parameter.verifiedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "un parametre verifie doit porter auteur et horodatage" });
  }
});

const EstablishmentSchema = z.object({
  establishmentId: z.string().min(1),
  countryCode: z.string().regex(/^[A-Z]{2}$/u),
  postalCode: z.string().min(1).nullable(),
  municipality: z.string().min(1).nullable(),
  isPrincipal: z.boolean(),
  verificationStatus: z.enum(["verified", "unverified", "unknown"]),
});

export const TaxProfileSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  version: VersionSchema,
  jurisdiction: z.literal("FR"),
  status: z.enum(["draft", "confirmed", "superseded"]),
  corporateIncomeTaxRegime: z.enum(["standard", "simplified", "exempt", "unknown"]),
  vatRegime: z.enum(["real_normal", "mini_real", "real_simplified", "franchise", "exempt", "unknown"]),
  accountingPeriod: z.object({ startDate: IsoDateSchema, endDate: IsoDateSchema }),
  corporateIncomeTaxGroupStatus: z.enum(["none", "member", "parent", "unknown"]),
  vatGroupStatus: z.enum(["none", "member", "representative", "unknown"]),
  turnoverAmountCents: CentAmountSchema.nonnegative().nullable(),
  capitalPaidStatus: z.enum(["fully_paid", "partially_paid", "unknown"]),
  ownershipStatus: z.enum(["known", "unknown"]),
  qualifyingIndividualOwnershipBasisPoints: BasisPointsSchema.nullable(),
  vatLiabilityRatioStatus: z.enum(["known", "unknown"]),
  vatLiabilityRatioBasisPoints: BasisPointsSchema.nullable(),
  establishments: z.array(EstablishmentSchema),
  parameters: z.array(TaxParameterSchema),
  confirmedBy: z.string().min(1).nullable(),
  confirmedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  canonicalJson: CanonicalJsonSchema,
  contentHash: HashSchema,
}).superRefine((profile, ctx) => {
  if (profile.accountingPeriod.endDate < profile.accountingPeriod.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountingPeriod", "endDate"], message: "la fin d'exercice precede le debut" });
  }
  if ((profile.ownershipStatus === "known") !== (profile.qualifyingIndividualOwnershipBasisPoints !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["qualifyingIndividualOwnershipBasisPoints"], message: "la detention doit etre chiffree si et seulement si elle est connue" });
  }
  if ((profile.vatLiabilityRatioStatus === "known") !== (profile.vatLiabilityRatioBasisPoints !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vatLiabilityRatioBasisPoints"], message: "le rapport d'assujettissement doit etre chiffre si et seulement s'il est connu" });
  }
  if (profile.status === "confirmed" && (!profile.confirmedBy || !profile.confirmedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "un profil confirme doit porter la decision humaine" });
  }
});

export const TaxPeriodSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  taxType: TaxTypeSchema,
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  fiscalYear: FiscalYearSchema,
  formVintage: FormVintageSchema,
  frequency: z.enum(["annual", "quarterly", "monthly", "event_based"]),
  accountingPeriodId: z.string().min(1).nullable(),
  status: z.enum(["open", "filed", "amended", "closed", "unknown"]),
  version: VersionSchema,
  sourceRefs: z.array(z.string().min(1)),
  createdAt: IsoDateTimeSchema,
  canonicalJson: CanonicalJsonSchema,
  contentHash: HashSchema,
}).superRefine((period, ctx) => {
  if (period.endDate < period.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "la fin de periode precede le debut" });
  }
});

export const TaxDeclarationFieldSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  taxDocumentSnapshotId: z.string().min(1),
  formVintage: FormVintageSchema,
  fieldCode: z.string().min(1),
  label: z.string().min(1),
  dataType: z.enum(["amount", "date", "text", "boolean", "percentage", "identifier"]),
  rawValue: z.string().nullable(),
  amountCents: CentAmountSchema.nullable(),
  normalizedValue: z.union([z.string(), z.boolean(), z.null()]),
  percentageBasisPoints: BasisPointsSchema.nullable(),
  unit: z.enum(["cent", "date", "text", "boolean", "basis_point", "identifier"]),
  sign: z.enum(["positive", "negative", "signed", "not_applicable"]),
  documentHash: HashSchema,
  sourceLocation: z.object({
    page: SafeIntegerSchema.positive().nullable(),
    sheet: z.string().min(1).nullable(),
    cell: z.string().min(1).nullable(),
    box: z.string().min(1).nullable(),
    zone: z.string().min(1).nullable(),
    structuredPath: z.string().min(1).nullable(),
  }),
  extractionMethod: z.enum(["structured", "text_layer", "ocr", "manual"]),
  parserVersion: VersionSchema,
  confidence: z.number().finite().min(0).max(1),
  processingStatus: z.enum(["accepted", "needs_manual_review", "rejected"]),
  usableForAutomatedCalculation: z.boolean(),
  reviewStatus: z.enum(["unreviewed", "verified", "rejected", "not_applicable"]),
  warnings: z.array(z.string()),
  evidenceStrength: EvidenceStrengthSchema,
  fieldHash: HashSchema,
}).superRefine((field, ctx) => {
  if (field.dataType === "amount" && field.unit !== "cent") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "un montant doit etre stocke en centimes" });
  }
  if (field.dataType !== "amount" && field.amountCents !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amountCents"], message: "seul un montant peut porter des centimes" });
  }
  if (field.dataType === "amount" && field.amountCents === null && field.processingStatus === "accepted") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amountCents"], message: "un montant accepte doit etre normalise en centimes entiers" });
  }
  if (field.dataType === "percentage" && field.unit !== "basis_point") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "un pourcentage doit etre stocke en points de base" });
  }
  if (field.dataType !== "percentage" && field.percentageBasisPoints !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["percentageBasisPoints"], message: "seul un pourcentage peut porter des points de base" });
  }
  if (field.dataType === "percentage" && field.percentageBasisPoints === null && field.processingStatus === "accepted") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["percentageBasisPoints"], message: "un pourcentage accepte doit etre normalise" });
  }
  if (field.extractionMethod === "ocr" && field.evidenceStrength !== "insufficient") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceStrength"], message: "un OCR non revu reste une preuve insuffisante" });
  }
  if (field.processingStatus !== "accepted" && field.usableForAutomatedCalculation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["usableForAutomatedCalculation"], message: "un champ incertain ou rejete ne peut alimenter un calcul automatique" });
  }
  if (field.confidence < 0.9 && field.usableForAutomatedCalculation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confidence"], message: "une confiance inferieure a 0,9 bloque tout calcul automatique" });
  }
});

export const TaxDocumentSnapshotSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  logicalDocumentId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  taxPeriodVersion: VersionSchema,
  taxType: TaxTypeSchema,
  documentType: z.string().min(1),
  formNumber: z.string().min(1),
  formVintage: FormVintageSchema,
  snapshotVersion: VersionSchema,
  schemaVersion: VersionSchema,
  parserName: z.string().min(1),
  parserVersion: VersionSchema,
  sourceHash: HashSchema,
  fields: z.array(TaxDeclarationFieldSchema),
  warnings: z.array(z.string()),
  limitationIds: z.array(z.string().min(1)),
  supersedesSnapshotId: z.string().min(1).nullable(),
  status: z.enum(["review_required", "active", "superseded", "rejected"]),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  canonicalJson: CanonicalJsonSchema,
  snapshotHash: HashSchema,
}).superRefine((snapshot, ctx) => {
  for (const [index, field] of snapshot.fields.entries()) {
    if (field.organizationId !== snapshot.organizationId || field.dossierId !== snapshot.dossierId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", index], message: "champ hors organisation ou dossier" });
    }
    if (field.formVintage !== snapshot.formVintage || field.taxDocumentSnapshotId !== snapshot.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", index], message: "champ rattache a un autre snapshot ou millesime" });
    }
    if (snapshot.status === "active" && !field.usableForAutomatedCalculation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", index, "usableForAutomatedCalculation"], message: "un snapshot actif ne peut contenir un champ bloque pour revue" });
    }
  }
});

export const TaxControlDefinitionSchema = z.object({
  controlId: z.string().min(1),
  controlVersion: VersionSchema,
  title: z.string().min(1),
  purpose: z.string().min(1),
  family: z.enum(["hardLaw", "methodology", "internal"]),
  domain: z.literal("tax"),
  taxType: TaxTypeSchema,
  controlStage: z.literal("tax_review"),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.nullable(),
  fiscalYears: z.array(FiscalYearSchema).min(1),
  formVintages: z.array(FormVintageSchema).min(1),
  sourceRefs: z.array(TaxSourceRefSchema).min(1),
  requiredDocumentTypes: z.array(z.string().min(1)),
  requiredFieldCodes: z.array(z.string().min(1)),
  allowedOutcomes: z.array(TaxControlOutcomeSchema).min(1),
  automation: z.enum(["automatic", "assisted", "manual", "unavailable"]),
  maximumEvidenceStrength: EvidenceStrengthSchema,
  capabilityStatus: z.enum(["available", "future", "non_available"]),
  reviewRequired: z.boolean(),
  definitionHash: HashSchema,
}).superRefine((definition, ctx) => {
  if (definition.effectiveTo && definition.effectiveTo < definition.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "la fin d'effet precede le debut" });
  }
});

export const TaxControlExecutionSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  fiscalYear: FiscalYearSchema,
  formVintage: FormVintageSchema,
  executionVersion: VersionSchema,
  controlId: z.string().min(1),
  controlVersion: VersionSchema,
  definitionHash: HashSchema,
  taxProfileId: z.string().min(1),
  taxProfileVersion: VersionSchema,
  taxDocumentSnapshotIds: z.array(z.string().min(1)),
  inputHashes: z.array(HashSchema),
  status: z.enum(["not_applicable", "blocked", "executed", "error"]),
  proposedOutcome: TaxControlOutcomeSchema.nullable(),
  evidenceStrength: EvidenceStrengthSchema,
  trace: z.array(TaxTraceStepSchema),
  reconciliationLineIds: z.array(z.string().min(1)),
  adjustmentIds: z.array(z.string().min(1)),
  findingIds: z.array(z.string().min(1)),
  coverage: TaxCoverageSchema,
  limitations: z.array(TaxLimitationSchema),
  engineVersion: VersionSchema,
  executedAt: IsoDateTimeSchema,
  canonicalJson: CanonicalJsonSchema,
  executionHash: HashSchema,
}).superRefine((execution, ctx) => {
  if (execution.status === "executed" && execution.proposedOutcome === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedOutcome"], message: "une execution terminee doit proposer un resultat" });
  }
  if (execution.status === "blocked" && execution.limitations.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limitations"], message: "une execution bloquee doit expliciter sa limitation" });
  }
});

const TaxReconciliationOperandSchema = z.object({
  amountCents: CentAmountSchema,
  currency: z.literal("EUR"),
  snapshotId: z.string().min(1),
  fieldCode: z.string().min(1).nullable(),
});

export const TaxReconciliationLineSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  executionId: z.string().min(1),
  lineKey: z.string().min(1),
  label: z.string().min(1),
  leftOperand: TaxReconciliationOperandSchema.nullable(),
  rightOperand: TaxReconciliationOperandSchema.nullable(),
  normalizationNotes: z.array(z.string()),
  differenceAmountCents: CentAmountSchema.nullable(),
  toleranceAmountCents: CentAmountSchema.nonnegative(),
  toleranceFamily: z.enum(["hardLaw", "methodology", "internal"]),
  status: z.enum(["matched", "different", "not_comparable", "missing_operand"]),
  evidenceRefs: z.array(z.string().min(1)),
  traceStepIds: z.array(z.string().min(1)),
  canonicalJson: CanonicalJsonSchema,
  lineHash: HashSchema,
});

export const TaxAdjustmentSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  executionId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  taxType: TaxTypeSchema,
  version: VersionSchema,
  adjustmentCode: z.string().min(1),
  label: z.string().min(1),
  direction: z.enum(["increase_tax_base", "decrease_tax_base", "increase_tax", "decrease_tax", "unquantified"]),
  baseAmountCents: CentAmountSchema.nullable(),
  taxAmountCents: CentAmountSchema.nullable(),
  currency: z.literal("EUR"),
  originRefs: z.array(z.string().min(1)),
  sourceVersionIds: z.array(z.string().min(1)),
  trace: z.array(TaxTraceStepSchema),
  proposalStatus: z.enum(["proposed", "withdrawn"]),
  reviewStatus: z.enum(["pending", "accepted", "rejected", "amended"]),
  reviewEventId: z.string().min(1).nullable(),
  supersedesAdjustmentId: z.string().min(1).nullable(),
  canonicalJson: CanonicalJsonSchema,
  adjustmentHash: HashSchema,
});

export const TaxFindingDetailsSchema = z.object({
  findingId: z.string().min(1),
  executionId: z.string().min(1),
  domain: z.literal("tax"),
  taxType: TaxTypeSchema,
  taxPeriodId: z.string().min(1),
  outcome: TaxControlOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  controlId: z.string().min(1),
  controlVersion: VersionSchema,
  documentSnapshotIds: z.array(z.string().min(1)),
  sourceVersionIds: z.array(z.string().min(1)),
  reconciliationLineIds: z.array(z.string().min(1)),
  adjustmentIds: z.array(z.string().min(1)),
  taxImpactStatus: z.enum(["not_computed", "estimated", "computed", "reviewed"]),
  limitationIds: z.array(z.string().min(1)),
  requiredReview: z.boolean(),
});

const TaxComputationOutputSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  amountCents: CentAmountSchema,
  currency: z.literal("EUR"),
  status: z.enum(["declared", "computed", "reviewed"]),
});

export const TaxComputationSnapshotSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  fiscalYear: FiscalYearSchema,
  formVintage: FormVintageSchema,
  taxType: TaxTypeSchema,
  calculationType: z.string().min(1),
  calculationVersion: VersionSchema,
  inputSnapshotIds: z.array(z.string().min(1)),
  sourceVersionIds: z.array(z.string().min(1)),
  proposedAdjustmentIds: z.array(z.string().min(1)),
  acceptedAdjustmentIds: z.array(z.string().min(1)),
  outputs: z.array(TaxComputationOutputSchema),
  trace: z.array(TaxTraceStepSchema),
  coverage: TaxCoverageSchema,
  limitations: z.array(TaxLimitationSchema),
  evidenceStrength: EvidenceStrengthSchema,
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  canonicalJson: CanonicalJsonSchema,
  snapshotHash: HashSchema,
});

const OutcomeCountsSchema = z.object({
  passed: SafeIntegerSchema.nonnegative(),
  confirmed_non_compliance: SafeIntegerSchema.nonnegative(),
  reconciliation_difference: SafeIntegerSchema.nonnegative(),
  potential_tax_risk: SafeIntegerSchema.nonnegative(),
  missing_information: SafeIntegerSchema.nonnegative(),
  inconclusive: SafeIntegerSchema.nonnegative(),
  review_recommendation: SafeIntegerSchema.nonnegative(),
});

export const FiscalSynthesisSnapshotSchema = z.object({
  id: z.string().min(1),
  ...OwnedSchema,
  entityId: z.string().min(1),
  snapshotVersion: VersionSchema,
  fiscalYear: FiscalYearSchema,
  formVintage: FormVintageSchema,
  periodIds: z.array(z.string().min(1)).min(1),
  executionIds: z.array(z.string().min(1)),
  computationSnapshotIds: z.array(z.string().min(1)),
  outcomeCounts: OutcomeCountsSchema,
  coverage: TaxCoverageSchema,
  limitations: z.array(TaxLimitationSchema),
  reviewSummary: z.object({
    pending: SafeIntegerSchema.nonnegative(),
    accepted: SafeIntegerSchema.nonnegative(),
    rejected: SafeIntegerSchema.nonnegative(),
    amended: SafeIntegerSchema.nonnegative(),
  }),
  headlineStatus: z.union([TaxControlOutcomeSchema, z.literal("no_conclusion")]),
  headlinePolicyVersion: VersionSchema,
  trace: z.array(TaxTraceStepSchema),
  generatedAt: IsoDateTimeSchema,
  canonicalJson: CanonicalJsonSchema,
  snapshotHash: HashSchema,
});

