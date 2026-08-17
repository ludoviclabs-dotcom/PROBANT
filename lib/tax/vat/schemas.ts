/**
 * Frontière de validation de la réconciliation TVA.
 *
 * Les invariants de prudence sont portés ici et pas seulement dans le moteur :
 * un snapshot reconstruit depuis la persistance ou une API doit échouer aussi
 * fort qu'un snapshot mal calculé. La leçon TAX-05 est appliquée d'emblée — le
 * moteur fait passer sa propre sortie par ce schéma.
 */
import { z } from "zod";
import { EvidenceStrengthSchema, TaxControlOutcomeSchema, TaxLimitationSchema } from "../schemas";

const SafeIntegerSchema = z.number().int().safe();
const CentAmountSchema = SafeIntegerSchema;
const BasisPointsSchema = SafeIntegerSchema.min(0).max(10_000);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u, "SHA-256 hexadecimal attendu");
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date ISO YYYY-MM-DD attendue");
const IsoDateTimeSchema = z.string().datetime({ offset: true });

const TaxSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
});

export const VatRegimeSchema = z.enum(["real_normal", "mini_real", "real_simplified"]);
export const VatFrequencySchema = z.enum(["monthly", "quarterly", "annual"]);
export const VatDirectionSchema = z.enum(["collected", "deductible"]);

/** `confirmed_non_compliance` est hors périmètre du lot TVA. */
export const VatOutcomeSchema = TaxControlOutcomeSchema.refine(
  (outcome) => outcome !== "confirmed_non_compliance",
  "confirmed_non_compliance est hors perimetre du moteur TVA",
);

export const VatNormativeCoverageSchema = z.object({
  status: z.enum(["covered", "partially_covered", "not_covered"]),
  coveredThroughDate: IsoDateSchema.nullable(),
  uncoveredFromDate: IsoDateSchema.nullable(),
  expiringSourceVersionIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
}).superRefine((coverage, ctx) => {
  if (coverage.status === "covered" && coverage.uncoveredFromDate !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["uncoveredFromDate"], message: "une periode couverte n'a pas de date non couverte" });
  }
  if (coverage.status !== "covered" && coverage.uncoveredFromDate === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["uncoveredFromDate"], message: "une couverture incomplete doit dater sa rupture" });
  }
});

export const VatPeriodSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
  entityId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  frequency: VatFrequencySchema,
  regime: VatRegimeSchema,
  expectedFormNumber: z.string().min(1),
  formVintage: SafeIntegerSchema.min(2000).max(2200),
  normativeCoverage: VatNormativeCoverageSchema,
  canonicalJson: z.string().min(2),
  contentHash: HashSchema,
}).superRefine((period, ctx) => {
  if (period.endDate < period.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "la fin de periode precede le debut" });
  }
});

export const VatTransactionSignalSchema = z.enum([
  "missing_piece_reference",
  "missing_piece_date",
  "duplicate_piece_candidate",
  "period_shift_candidate",
  "reverse_charge_candidate",
  "unusual_rate_candidate",
  "rate_not_derivable",
  "base_not_linked",
]);

export const VatTransactionCandidateSchema = z.object({
  id: z.string().min(1),
  direction: VatDirectionSchema,
  journalCode: z.string(),
  ecritureNum: z.string(),
  ecritureDate: z.string().min(1),
  pieceRef: z.string().min(1).nullable(),
  pieceDate: IsoDateSchema.nullable(),
  baseAmountCents: CentAmountSchema.nullable(),
  vatAmountCents: CentAmountSchema.nullable(),
  observedRateBasisPoints: BasisPointsSchema.nullable(),
  baseAccounts: z.array(z.string().min(1)),
  vatAccounts: z.array(z.string().min(1)),
  linkage: z.enum(["same_entry", "base_only", "vat_only", "unresolved"]),
  signals: z.array(VatTransactionSignalSchema),
  evidenceStrength: EvidenceStrengthSchema,
  sourceLineNumbers: z.array(SafeIntegerSchema),
  candidateHash: HashSchema,
}).superRefine((candidate, ctx) => {
  // Une opération reconstruite depuis les écritures ne dépasse jamais `derived`.
  if (candidate.evidenceStrength === "direct" || candidate.evidenceStrength === "corroborated") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceStrength"],
      message: "une operation reconstruite depuis le FEC ne peut pas porter une preuve directe ou corroboree",
    });
  }
});

export const VatRateBucketSchema = z.object({
  key: z.string().min(1),
  direction: VatDirectionSchema,
  rateBasisPoints: BasisPointsSchema.nullable(),
  label: z.string().min(1),
  baseAmountCents: CentAmountSchema.nullable(),
  vatAccountedCents: CentAmountSchema,
  vatTheoreticalCents: CentAmountSchema.nullable(),
  differenceCents: CentAmountSchema.nullable(),
  transactionCount: SafeIntegerSchema.nonnegative(),
  transactionIds: z.array(z.string().min(1)),
  shareOfBaseBasisPoints: BasisPointsSchema,
  status: z.enum(["dominant", "secondary", "outlier", "unresolved"]),
}).superRefine((bucket, ctx) => {
  if (bucket.rateBasisPoints === null && bucket.status !== "unresolved") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "une tranche sans taux derivable est unresolved" });
  }
  if ((bucket.rateBasisPoints === null || bucket.baseAmountCents === null) && bucket.vatTheoreticalCents !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vatTheoreticalCents"], message: "une TVA theorique exige une base et un taux derivables" });
  }
  if (bucket.vatTheoreticalCents === null && bucket.differenceCents !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["differenceCents"], message: "aucun ecart certain ne peut etre calcule sans TVA theorique" });
  }
  if (bucket.vatTheoreticalCents !== null && bucket.differenceCents !== bucket.vatAccountedCents - bucket.vatTheoreticalCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["differenceCents"], message: "l'ecart doit deriver des deux montants" });
  }
});

export const VatDeclarationSnapshotSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
  entityId: z.string().min(1),
  vatPeriodId: z.string().min(1),
  formNumber: z.string().min(1),
  formVintage: SafeIntegerSchema.min(2000).max(2200),
  regime: VatRegimeSchema,
  status: z.enum(["available", "absent", "unreadable"]),
  boxes: z.array(z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    amountCents: CentAmountSchema,
    snapshotId: z.string().min(1),
    contentHash: HashSchema,
  })),
  grossVatCents: CentAmountSchema.nullable(),
  deductibleVatCents: CentAmountSchema.nullable(),
  netDueCents: CentAmountSchema.nullable(),
  creditCents: CentAmountSchema.nullable(),
  creditCarriedForwardCents: CentAmountSchema.nullable(),
  normalRateBaseCents: CentAmountSchema.nullable(),
  issues: z.array(z.object({
    fieldCode: z.string().min(1),
    formNumber: z.string().min(1),
    reason: z.string().min(1),
    detail: z.string().min(1),
  })),
  sourceRefs: z.array(TaxSourceRefSchema),
  canonicalJson: z.string().min(2),
  snapshotHash: HashSchema,
}).superRefine((declaration, ctx) => {
  // Une déclaration absente ne porte aucun montant : elle ne vaut pas zéro.
  if (declaration.status === "absent" && declaration.boxes.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boxes"], message: "une declaration absente ne porte aucune case" });
  }
});

export const VatEvidenceTierSchema = z.enum([
  "ledger_only",
  "ledger_and_declaration",
  "ledger_declaration_and_invoice",
  "insufficient",
]);

export const VatControlResultSchema = z.object({
  controlId: z.string().min(1),
  title: z.string().min(1),
  outcome: VatOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  evidenceTier: VatEvidenceTierSchema,
  detail: z.string().min(1),
  observedCents: CentAmountSchema.nullable(),
  comparedCents: CentAmountSchema.nullable(),
  differenceCents: CentAmountSchema.nullable(),
  reconciliationLineIds: z.array(z.string().min(1)),
  limitationIds: z.array(z.string().min(1)),
  transactionIds: z.array(z.string().min(1)),
  sourceRefs: z.array(TaxSourceRefSchema),
  resultHash: HashSchema,
}).superRefine((control, ctx) => {
  // Un contrôle qui conclut positivement ne peut pas s'appuyer sur rien.
  if (control.outcome === "passed" && control.evidenceStrength === "insufficient") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outcome"], message: "un controle sans preuve suffisante ne peut pas conclure passed" });
  }
  if (control.outcome === "missing_information" && control.limitationIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limitationIds"], message: "une information manquante doit citer sa limitation" });
  }
});

const VatNoteSchema = z.object({
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

export const VatReconciliationSnapshotSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  dossierId: z.string().min(1),
  entityId: z.string().min(1),
  vatPeriodId: z.string().min(1),
  taxPeriodId: z.string().min(1),
  taxType: z.literal("vat"),
  regime: VatRegimeSchema,
  frequency: VatFrequencySchema,
  engineVersion: z.string().min(1),
  calculationVersion: z.string().min(1),
  status: z.enum(["reconciled", "blocked"]),
  period: VatPeriodSchema,
  declaration: VatDeclarationSnapshotSchema,
  transactionCandidates: z.array(VatTransactionCandidateSchema),
  rateBuckets: z.array(VatRateBucketSchema),
  collectedAccountedCents: CentAmountSchema,
  deductibleAccountedCents: CentAmountSchema,
  collectedTheoreticalCents: CentAmountSchema.nullable(),
  netAccountedCents: CentAmountSchema,
  netDeclaredCents: CentAmountSchema.nullable(),
  controls: z.array(VatControlResultSchema),
  reconciliationLineIds: z.array(z.string().min(1)),
  datasets: z.object({
    salesByRate: z.object({
      buckets: z.array(VatRateBucketSchema),
      totalBaseCents: CentAmountSchema.nullable(),
      currency: z.literal("EUR"),
    }),
    comparison: z.object({
      rows: z.array(z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        theoreticalCents: CentAmountSchema.nullable(),
        accountedCents: CentAmountSchema.nullable(),
        declaredCents: CentAmountSchema.nullable(),
      })),
      currency: z.literal("EUR"),
    }),
    netWaterfall: z.object({
      steps: z.array(z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        order: SafeIntegerSchema.positive(),
        kind: z.enum(["base", "delta", "subtotal", "total"]),
        sign: z.enum(["positive", "negative", "neutral"]),
        deltaCents: CentAmountSchema,
        runningTotalCents: CentAmountSchema,
        status: z.enum(["computed", "declared", "unavailable"]),
      })).length(6),
      currency: z.literal("EUR"),
    }),
    timeline: z.object({
      entries: z.array(z.object({
        periodStart: IsoDateSchema,
        periodEnd: IsoDateSchema,
        frequency: VatFrequencySchema,
        collectedAccountedCents: CentAmountSchema,
        deductibleAccountedCents: CentAmountSchema,
        declaredNetCents: CentAmountSchema.nullable(),
        status: z.enum(["reconciled", "difference", "declaration_absent"]),
      })),
      currency: z.literal("EUR"),
    }),
    missingPieces: z.object({
      cells: z.array(z.object({
        transactionId: z.string().min(1),
        direction: VatDirectionSchema,
        ecritureDate: z.string().min(1),
        journalCode: z.string(),
        pieceRef: z.string().min(1).nullable(),
        missingSignals: z.array(VatTransactionSignalSchema),
        vatAmountCents: CentAmountSchema.nullable(),
      })),
      signalCounts: z.record(z.string(), SafeIntegerSchema.nonnegative()),
    }),
  }),
  outcome: VatOutcomeSchema,
  evidenceStrength: EvidenceStrengthSchema,
  evidenceTier: VatEvidenceTierSchema,
  limitations: z.array(TaxLimitationSchema),
  notes: z.array(VatNoteSchema),
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
  if (snapshot.status === "blocked" && snapshot.limitations.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limitations"], message: "une reconciliation bloquee doit expliciter sa limitation" });
  }
  if (snapshot.status === "blocked" && snapshot.controls.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["controls"], message: "une reconciliation bloquee n'execute aucun controle" });
  }
  const net = snapshot.collectedAccountedCents - snapshot.deductibleAccountedCents;
  if (snapshot.netAccountedCents !== net) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["netAccountedCents"], message: "la TVA nette comptabilisee doit deriver des deux totaux" });
  }
  // Le régime détermine le formulaire attendu : aucun croisement possible.
  const expected = snapshot.regime === "real_simplified" ? "3517-S-SD" : "3310-CA3-SD";
  if (snapshot.declaration.formNumber !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["declaration", "formNumber"], message: `le regime ${snapshot.regime} attend le formulaire ${expected}` });
  }
});
