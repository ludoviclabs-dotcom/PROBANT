/**
 * `CorporateTaxComputationEngine` — impot sur les societes, dossier mono-entite.
 *
 * Perimetre : societes francaises a l'IS, reel normal ou simplifie, un exercice.
 * Hors perimetre : integration fiscale, Pilier 2, contribution exceptionnelle,
 * credits d'impot complexes, interets et penalites.
 *
 * Le moteur est deterministe : memes entrees, meme snapshot, meme empreinte. Il
 * ne compense jamais deux grandeurs de sens opposes, n'applique un taux reduit
 * que si toutes ses conditions sont renseignees, et ne confirme un retraitement
 * que sur source et preuve.
 */
import type {
  BasisPoints,
  CentAmount,
  EvidenceStrength,
  TaxControlOutcome,
  TaxDocumentSnapshot,
  TaxLimitation,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
  TaxSourceRef,
  TaxTraceStep,
} from "@/lib/canonical-model";
import {
  findCorporateTaxRateSchedule,
  orderedBrackets,
  type TaxRateBracket,
  type TaxRateCondition,
  type TaxRateSchedule,
} from "@/lib/knowledge/tax-rate-schedule";
import { canonicalJson, stableHash } from "@/lib/synthesis/canonical";
import { CorporateTaxSnapshotSchema } from "./schemas";
import { createTaxReconciliationLine } from "../canonical";
import {
  addCents,
  applyBasisPoints,
  clampToNonNegative,
  maxCents,
  minCents,
  subtractCents,
  sumCents,
} from "./arithmetic";
import {
  CORPORATE_TAX_FORM_MAPPINGS,
  DECLARATION_BOXES,
  DECLARATION_FORM,
  DEFICIT_BOXES,
  DEFICIT_FOLLOW_UP_FORM,
  amountFor,
  readDeclarationBoxes,
  type CorporateTaxRegime,
  type DeclarationAmount,
  type DeclarationReading,
} from "./liasse";
import { CorporateTaxNoteCollector } from "./notes";
import type {
  CorporateTaxAdjustmentCategory,
  CorporateTaxAdjustmentLine,
  CorporateTaxBracketAllocation,
  CorporateTaxConditionAssessment,
  CorporateTaxDeficitOutcome,
  CorporateTaxEligibility,
  CorporateTaxSnapshot,
  CorporateTaxWaterfall,
  CorporateTaxWaterfallStep,
} from "./types";
import { buildWaterfall } from "./waterfall";

export const CORPORATE_TAX_ENGINE_VERSION = "tax-05-corporate-income-tax-1.0.0";
export const CORPORATE_TAX_CALCULATION_VERSION = "2026.1.0";

/** Observation comptable : un compte ou un libelle ne produit qu'un candidat. */
export interface CorporateTaxLedgerObservation {
  readonly id: string;
  readonly accountCode: string;
  readonly label: string;
  readonly amountCents: CentAmount;
  readonly direction: "reintegration" | "deduction";
  readonly category: CorporateTaxAdjustmentCategory;
  readonly snapshotId: string;
  readonly contentHash: string;
}

/** Retraitement confirme par une revue humaine : source et preuve obligatoires. */
export interface CorporateTaxConfirmedAdjustment {
  readonly id: string;
  readonly category: CorporateTaxAdjustmentCategory;
  readonly direction: "reintegration" | "deduction";
  readonly label: string;
  readonly amountCents: CentAmount;
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly evidenceRefs: readonly string[];
  readonly reviewEventId: string;
}

export interface CorporateTaxAccountedPositions {
  readonly chargeCents: CentAmount | null;
  readonly liabilityCents: CentAmount | null;
  readonly snapshotId: string;
  readonly contentHash: string;
}

export interface CorporateTaxComputationInput {
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly executionId: string;
  readonly snapshotId: string;
  readonly profile: TaxProfile;
  readonly period: TaxPeriod;
  readonly documentSnapshots: readonly TaxDocumentSnapshot[];
  readonly ledgerObservations?: readonly CorporateTaxLedgerObservation[];
  readonly confirmedAdjustments?: readonly CorporateTaxConfirmedAdjustment[];
  readonly accountedPositions?: CorporateTaxAccountedPositions;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface CorporateTaxComputationResult {
  readonly snapshot: CorporateTaxSnapshot;
  readonly reconciliationLines: readonly TaxReconciliationLine[];
}

const BLOCKED_CONCLUSIONS: readonly TaxControlOutcome[] = [
  "passed",
  "confirmed_non_compliance",
  "reconciliation_difference",
  "potential_tax_risk",
];

const EVIDENCE_ORDER: Readonly<Record<EvidenceStrength, number>> = {
  insufficient: 0,
  derived: 1,
  direct: 2,
  corroborated: 3,
};

function weakest(values: readonly EvidenceStrength[]): EvidenceStrength {
  return values.reduce<EvidenceStrength>(
    (current, value) => (EVIDENCE_ORDER[value] < EVIDENCE_ORDER[current] ? value : current),
    "corroborated",
  );
}

function sourceRefKey(ref: TaxSourceRef): string {
  return `${ref.sourceVersionId}:${ref.locator}`;
}

function dedupeSourceRefs(refs: readonly TaxSourceRef[]): readonly TaxSourceRef[] {
  const map = new Map<string, TaxSourceRef>();
  for (const ref of refs) map.set(sourceRefKey(ref), ref);
  return [...map.values()].sort((left, right) => sourceRefKey(left).localeCompare(sourceRefKey(right)));
}

function limitation(input: {
  readonly code: string;
  readonly scope: TaxLimitation["scope"];
  readonly reason: string;
  readonly message: string;
  readonly requiredInputs?: readonly string[];
  readonly relatedIds?: readonly string[];
  readonly resolvability?: TaxLimitation["resolvability"];
  readonly blockedOutcomes?: readonly TaxControlOutcome[];
  readonly capabilityStatus?: TaxLimitation["capabilityStatus"];
}): TaxLimitation {
  return {
    id: `corporate-tax-limitation:${input.code}`,
    code: input.code,
    scope: input.scope,
    capabilityStatus: input.capabilityStatus ?? "available",
    reason: input.reason,
    message: input.message,
    blockedOutcomes: input.blockedOutcomes ?? BLOCKED_CONCLUSIONS,
    requiredInputs: [...(input.requiredInputs ?? [])].sort(),
    relatedIds: [...(input.relatedIds ?? [])].sort(),
    resolvability: input.resolvability ?? "user_can_supply",
  };
}

interface TraceInput {
  readonly id: string;
  readonly operation: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly sourceRefs?: readonly TaxSourceRef[];
  readonly inputs: unknown;
}

class TraceRecorder {
  private readonly steps: TaxTraceStep[] = [];

  record(input: TraceInput): void {
    this.steps.push({
      id: input.id,
      operation: input.operation,
      inputRefs: [...input.inputRefs],
      outputRef: input.outputRef,
      sourceRefs: dedupeSourceRefs(input.sourceRefs ?? []),
      canonicalInputHash: stableHash(input.inputs),
    });
  }

  all(): readonly TaxTraceStep[] {
    return [...this.steps];
  }
}

function regimeOf(profile: TaxProfile): CorporateTaxRegime | null {
  if (profile.corporateIncomeTaxRegime === "standard") return "standard";
  if (profile.corporateIncomeTaxRegime === "simplified") return "simplified";
  return null;
}

/**
 * Faits du profil qu'une condition de bareme peut designer.
 *
 * La table est explicite : une condition qui designe un fait absent de cette
 * table reste `unknown`. Le moteur ne substitue jamais un autre fait, sans quoi
 * un bareme pourrait accorder un taux sur une condition jamais verifiee.
 */
type ProfileFact =
  | { readonly kind: "cents"; readonly value: CentAmount | null }
  | { readonly kind: "enum"; readonly value: string | null }
  | { readonly kind: "basis_points"; readonly value: BasisPoints | null };

const PROFILE_FACTS: Readonly<Record<string, (profile: TaxProfile) => ProfileFact>> = {
  "profile:turnoverAmountCents": (profile) => ({ kind: "cents", value: profile.turnoverAmountCents }),
  "profile:capitalPaidStatus": (profile) => ({
    kind: "enum",
    value: profile.capitalPaidStatus === "unknown" ? null : profile.capitalPaidStatus,
  }),
  "profile:ownershipStatus": (profile) => ({
    kind: "basis_points",
    value: profile.ownershipStatus === "known" ? profile.qualifyingIndividualOwnershipBasisPoints : null,
  }),
};

/** Type de fait attendu par chaque operateur, pour refuser les appariements incoherents. */
const OPERATOR_FACT_KIND: Readonly<Record<TaxRateCondition["operator"], ProfileFact["kind"]>> = {
  lte_cents: "cents",
  equals_enum: "enum",
  gte_basis_points: "basis_points",
};

function expectedOf(condition: TaxRateCondition): string {
  switch (condition.operator) {
    case "lte_cents": return `<= ${condition.thresholdCents} centimes`;
    case "equals_enum": return condition.expectedValue;
    case "gte_basis_points": return `>= ${condition.thresholdBasisPoints} points de base`;
  }
}

/**
 * Evalue une condition de taux contre le fait qu'elle designe. Un fait absent,
 * inconnu du moteur, ou d'un type incompatible avec l'operateur rend la condition
 * `unknown` : elle n'est jamais presumee satisfaite.
 */
function assessCondition(condition: TaxRateCondition, profile: TaxProfile): CorporateTaxConditionAssessment {
  const base = {
    code: condition.code,
    label: condition.label,
    profileInput: condition.profileInput,
  };
  const expected = expectedOf(condition);
  const unknown = { ...base, status: "unknown" as const, observedValue: null, expected };

  const read = PROFILE_FACTS[condition.profileInput];
  if (!read) return unknown;

  const fact = read(profile);
  if (fact.kind !== OPERATOR_FACT_KIND[condition.operator]) return unknown;
  if (fact.value === null) return unknown;

  switch (condition.operator) {
    case "lte_cents":
      return {
        ...base,
        status: (fact.value as CentAmount) <= condition.thresholdCents ? "satisfied" : "not_satisfied",
        observedValue: String(fact.value),
        expected,
      };
    case "equals_enum":
      return {
        ...base,
        status: fact.value === condition.expectedValue ? "satisfied" : "not_satisfied",
        observedValue: String(fact.value),
        expected,
      };
    case "gte_basis_points":
      return {
        ...base,
        status: (fact.value as BasisPoints) >= condition.thresholdBasisPoints ? "satisfied" : "not_satisfied",
        observedValue: String(fact.value),
        expected,
      };
  }
}

function evaluateEligibility(bracket: TaxRateBracket, profile: TaxProfile): CorporateTaxEligibility {
  if (bracket.conditions.length === 0) {
    return { status: "not_applicable", conditions: [] };
  }
  const conditions = bracket.conditions
    .map((condition) => assessCondition(condition, profile))
    .sort((left, right) => left.code.localeCompare(right.code));
  if (conditions.some((condition) => condition.status === "not_satisfied")) {
    return { status: "not_eligible", conditions };
  }
  if (conditions.some((condition) => condition.status === "unknown")) {
    return { status: "unknown", conditions };
  }
  return { status: "eligible", conditions };
}

function bracketSourceRef(bracket: TaxRateBracket): TaxSourceRef {
  return { sourceId: bracket.sourceId, sourceVersionId: bracket.sourceVersionId, locator: bracket.locator };
}

function adjustmentLine(input: {
  readonly id: string;
  readonly category: CorporateTaxAdjustmentCategory;
  readonly direction: "reintegration" | "deduction";
  readonly status: "confirmed" | "candidate";
  readonly label: string;
  readonly amountCents: CentAmount;
  readonly originKind: "declaration" | "ledger" | "human_review";
  readonly snapshotId: string;
  readonly fieldCode: string | null;
  readonly accountCode: string | null;
  readonly contentHash: string;
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly evidenceRefs: readonly string[];
  readonly evidenceStrength: EvidenceStrength;
}): CorporateTaxAdjustmentLine {
  if (input.status === "confirmed" && input.originKind === "ledger") {
    throw new Error(`TAX_LEDGER_ORIGIN_CANNOT_CONFIRM:${input.id}`);
  }
  if (input.status === "confirmed" && (input.sourceRefs.length === 0 || input.evidenceRefs.length === 0)) {
    throw new Error(`TAX_CONFIRMED_ADJUSTMENT_REQUIRES_SOURCE_AND_EVIDENCE:${input.id}`);
  }
  if (input.amountCents < 0) {
    throw new Error(`TAX_ADJUSTMENT_MAGNITUDE_MUST_BE_POSITIVE:${input.id}`);
  }
  const sign = input.direction === "reintegration" ? "positive" : "negative";
  return Object.freeze({
    id: input.id,
    category: input.category,
    direction: input.direction,
    status: input.status,
    label: input.label,
    amountCents: input.amountCents,
    signedAmountCents: input.direction === "reintegration" ? input.amountCents : -input.amountCents,
    sign,
    origin: Object.freeze({
      kind: input.originKind,
      snapshotId: input.snapshotId,
      fieldCode: input.fieldCode,
      accountCode: input.accountCode,
      contentHash: input.contentHash,
    }),
    sourceRefs: dedupeSourceRefs(input.sourceRefs),
    evidenceRefs: [...input.evidenceRefs].sort(),
    evidenceStrength: input.evidenceStrength,
  });
}

function totalFor(
  lines: readonly CorporateTaxAdjustmentLine[],
  direction: "reintegration" | "deduction",
  status: "confirmed" | "candidate",
): CentAmount {
  return sumCents(
    lines.filter((line) => line.direction === direction && line.status === status).map((line) => line.amountCents),
    `total:${direction}:${status}`,
  );
}

export class CorporateTaxComputationEngine {
  constructor(
    private readonly resolveSchedule: (options: {
      readonly fiscalYear: number;
      readonly formVintage: number;
    }) => TaxRateSchedule | undefined = findCorporateTaxRateSchedule,
  ) {}

  compute(input: CorporateTaxComputationInput): CorporateTaxComputationResult {
    this.assertScope(input);
    const notes = new CorporateTaxNoteCollector();
    const trace = new TraceRecorder();
    const limitations: TaxLimitation[] = [];
    const reconciliationLines: TaxReconciliationLine[] = [];

    const regime = regimeOf(input.profile);
    const schedule = this.resolveSchedule({
      fiscalYear: input.period.fiscalYear,
      formVintage: input.period.formVintage,
    });

    const blocking = this.collectBlockingConditions({ input, regime, schedule });
    if (blocking.length > 0) {
      limitations.push(...blocking);
      notes.add({
        code: "COMPUTATION_BLOCKED",
        kind: "prudence",
        message: "Le calcul n'est pas execute : une condition de perimetre ou une entree obligatoire manque.",
      });
      return {
        snapshot: this.finalize({
          input,
          regime: regime ?? "standard",
          schedule: null,
          status: "blocked",
          accountingResultCents: 0,
          adjustmentLines: [],
          taxResultBeforeDeficitsCents: 0,
          deficits: {
            status: "unknown",
            availableStockCents: null,
            declaredOffsetCents: null,
            legalCapCents: null,
            appliedOffsetCents: 0,
            remainingStockCents: null,
            sourceRefs: [],
          },
          taxableBaseCents: 0,
          brackets: [],
          grossTaxCents: null,
          taxImpactStatus: "not_computed",
          outcome: "missing_information",
          evidenceStrength: "insufficient",
          limitations,
          notes: notes.all(),
          trace: trace.all(),
          reconciliationLineIds: [],
          sourceRefs: [],
        }),
        reconciliationLines: [],
      };
    }

    const resolvedRegime = regime as CorporateTaxRegime;
    const resolvedSchedule = schedule as TaxRateSchedule;
    const mapping = CORPORATE_TAX_FORM_MAPPINGS[resolvedRegime];

    const liasse = readDeclarationBoxes({
      snapshots: input.documentSnapshots,
      formNumber: mapping.formNumber,
      formVintage: input.period.formVintage,
      fieldCodes: [
        mapping.accountingProfit,
        mapping.accountingLoss,
        ...(mapping.reintegrationsTotal ? [mapping.reintegrationsTotal] : []),
        ...(mapping.deductionsTotal ? [mapping.deductionsTotal] : []),
        ...mapping.detailBoxes.map((box) => box.code),
        mapping.resultBeforeDeficitsProfit,
        mapping.resultBeforeDeficitsDeficit,
        mapping.deficitsOffset,
        mapping.finalProfit,
        mapping.finalDeficit,
      ],
    });

    const formSourceRef: TaxSourceRef = {
      sourceId: resolvedRegime === "standard" ? "form-2050-liasse" : "form-2033-liasse",
      sourceVersionId: resolvedRegime === "standard" ? "form-2050-liasse-v2026" : "form-2033-liasse-v2026",
      locator: resolvedRegime === "standard"
        ? "2058-A-SD, rubriques I, II et III"
        : "2033-B-SD, B - Resultat fiscal",
    };

    // 1. Resultat comptable ------------------------------------------------
    const accounting = this.readAccountingResult({ liasse, mapping, limitations, notes, formSourceRef });
    if (accounting === null) {
      const inconsistent = limitations.some((item) => item.code === "INCONSISTENT_ACCOUNTING_RESULT");
      return this.blockedAfterReading({
        input,
        regime: resolvedRegime,
        limitations,
        notes,
        trace,
        outcome: inconsistent ? "reconciliation_difference" : "missing_information",
        sourceRefs: [formSourceRef],
      });
    }
    trace.record({
      id: "step-accounting-result",
      operation: "read_accounting_result",
      inputRefs: accounting.inputRefs,
      outputRef: "accounting_result",
      sourceRefs: [formSourceRef],
      inputs: { amountCents: accounting.amountCents, fieldCode: accounting.fieldCode },
    });

    // 2 et 3. Reintegrations et deductions ---------------------------------
    const adjustmentLines = this.buildAdjustmentLines({
      input,
      mapping,
      liasse,
      formSourceRef,
      limitations,
      notes,
    });
    // Un total declare (WR, XH) present dans le millesime mais illisible dans
    // cette liasse n'est jamais traite comme zero : le resultat fiscal serait
    // faux pour un dossier qui contient reellement des retraitements. Le calcul
    // est bloque plutot que d'avancer sur une hypothese silencieuse.
    if (limitations.some((item) => item.code.startsWith("DECLARED_TOTAL_UNAVAILABLE:"))) {
      return this.blockedAfterReading({
        input,
        regime: resolvedRegime,
        limitations,
        notes,
        trace,
        outcome: "missing_information",
        sourceRefs: [formSourceRef],
      });
    }
    const reintegrationsConfirmed = totalFor(adjustmentLines, "reintegration", "confirmed");
    const reintegrationsProposed = totalFor(adjustmentLines, "reintegration", "candidate");
    const deductionsConfirmed = totalFor(adjustmentLines, "deduction", "confirmed");
    const deductionsProposed = totalFor(adjustmentLines, "deduction", "candidate");
    trace.record({
      id: "step-adjustments",
      operation: "aggregate_adjustments_by_direction_and_status",
      inputRefs: adjustmentLines.map((line) => line.id),
      outputRef: "adjustment_totals",
      sourceRefs: [formSourceRef],
      inputs: { reintegrationsConfirmed, reintegrationsProposed, deductionsConfirmed, deductionsProposed },
    });

    // 4. Resultat fiscal avant deficits ------------------------------------
    const taxResultBeforeDeficits = subtractCents(
      addCents(accounting.amountCents, reintegrationsConfirmed, "tax_result_before_deficits"),
      deductionsConfirmed,
      "tax_result_before_deficits",
    );
    trace.record({
      id: "step-tax-result-before-deficits",
      operation: "accounting_result_plus_reintegrations_minus_deductions",
      inputRefs: ["accounting_result", "adjustment_totals"],
      outputRef: "tax_result_before_deficits",
      sourceRefs: [formSourceRef],
      inputs: { accounting: accounting.amountCents, reintegrationsConfirmed, deductionsConfirmed },
    });

    reconciliationLines.push(...this.compareDeclaredTaxResult({
      input,
      liasse,
      mapping,
      computedCents: taxResultBeforeDeficits,
      limitations,
    }));

    // 5. Deficits -----------------------------------------------------------
    const deficits = this.resolveDeficits({
      input,
      liasse,
      mapping,
      schedule: resolvedSchedule,
      taxResultBeforeDeficits,
      limitations,
      notes,
      trace,
    });

    reconciliationLines.push(...this.compareFinalTaxResult({
      input,
      liasse,
      mapping,
      computedCents: subtractCents(
        taxResultBeforeDeficits,
        deficits.appliedOffsetCents,
        "final_tax_result",
      ),
      limitations,
    }));

    // 6. Base imposable -----------------------------------------------------
    const taxableBase = clampToNonNegative(
      subtractCents(taxResultBeforeDeficits, deficits.appliedOffsetCents, "taxable_base"),
    );
    trace.record({
      id: "step-taxable-base",
      operation: "tax_result_minus_applied_deficits_floored_at_zero",
      inputRefs: ["tax_result_before_deficits", "deficits_applied"],
      outputRef: "taxable_base",
      sourceRefs: deficits.sourceRefs,
      inputs: { taxResultBeforeDeficits, applied: deficits.appliedOffsetCents },
    });

    // 7 et 8. Ventilation par taux et IS brut -------------------------------
    const allocation = this.allocateBrackets({
      schedule: resolvedSchedule,
      profile: input.profile,
      taxableBaseCents: taxableBase,
      notes,
      trace,
    });
    if (allocation.unallocatedBaseCents !== 0) {
      limitations.push(limitation({
        code: "TAXABLE_BASE_NOT_ALLOCATABLE",
        scope: "control",
        reason: "unsupported_rate_schedule",
        message: `Le bareme ${resolvedSchedule.id} ne comporte aucune tranche capable d'absorber ${allocation.unallocatedBaseCents} centimes de base imposable : aucun impot n'est calcule.`,
        requiredInputs: [`rate_schedule:${input.period.fiscalYear}:${input.period.formVintage}`],
        relatedIds: [input.period.id],
        capabilityStatus: "non_available",
        resolvability: "not_resolvable",
      }));
      notes.add({
        code: "BASE_NOT_ALLOCATABLE",
        kind: "prudence",
        message: "Une fraction de la base imposable n'est couverte par aucune tranche applicable : le moteur ne l'attribue pas d'office a la derniere tranche.",
        relatedStepCodes: ["gross_tax"],
      });
      return this.blockedAfterReading({
        input,
        regime: resolvedRegime,
        limitations,
        notes,
        trace,
        outcome: "missing_information",
        sourceRefs: [formSourceRef],
      });
    }

    if (allocation.hasUnknownEligibility) {
      limitations.push(limitation({
        code: "REDUCED_RATE_ELIGIBILITY_UNKNOWN",
        scope: "control",
        reason: "missing_field",
        message: "Une condition du taux reduit n'est pas renseignee : le taux reduit n'est pas applique et l'impot reste une estimation au taux normal.",
        requiredInputs: allocation.unknownInputs,
        relatedIds: [input.period.id],
        resolvability: "human_review",
      }));
    }

    // 9 et 10. Comparaisons declaration et comptabilite ----------------------
    reconciliationLines.push(...this.compareDeclaration2065({ input, allocation }));
    reconciliationLines.push(...this.compareAccountedPositions({ input, grossTaxCents: allocation.grossTaxCents }));

    const differenceFound = reconciliationLines.some((line) => line.status === "different");
    const missingOperand = reconciliationLines.some((line) => line.status === "missing_operand");

    const outcome = this.resolveOutcome({
      limitations,
      differenceFound,
      missingOperand,
      hasUnknownEligibility: allocation.hasUnknownEligibility,
    });

    // Un montant calcule n'est jamais `direct` : il est au mieux `derived`, et
    // `corroborated` seulement si un document independant confirme la chaine et
    // que toutes les entrees retenues sont elles-memes au moins directes.
    const retainedInputs = [
      accounting.evidenceStrength,
      ...adjustmentLines.filter((line) => line.status === "confirmed").map((line) => line.evidenceStrength),
    ];
    const corroborated = reconciliationLines.some((line) => line.status === "matched") &&
      EVIDENCE_ORDER[weakest(retainedInputs)] >= EVIDENCE_ORDER.direct;
    const evidenceStrength: EvidenceStrength = outcome === "missing_information"
      ? "insufficient"
      : corroborated
        ? "corroborated"
        : "derived";

    if (missingOperand) {
      notes.add({
        code: "COMPARISON_OPERAND_MISSING",
        kind: "prudence",
        message: "Au moins une comparaison n'a pas pu etre faite faute d'operande ; elle est reportee sans etre presumee concordante.",
      });
    }

    notes.add({
      code: "NO_INTEREST_NO_PENALTY",
      kind: "prudence",
      message: "Le moteur calcule un impot brut. Aucun interet de retard ni aucune penalite n'est estime.",
    });

    const sourceRefs = dedupeSourceRefs([
      formSourceRef,
      ...allocation.allocations.flatMap((bracket) => bracket.sourceRefs),
      ...deficits.sourceRefs,
    ]);

    const snapshot = this.finalize({
      input,
      regime: resolvedRegime,
      schedule: resolvedSchedule,
      status: "computed",
      accountingResultCents: accounting.amountCents,
      adjustmentLines,
      taxResultBeforeDeficitsCents: taxResultBeforeDeficits,
      deficits,
      taxableBaseCents: taxableBase,
      brackets: allocation.allocations,
      grossTaxCents: allocation.grossTaxCents,
      taxImpactStatus: allocation.hasUnknownEligibility ? "estimated" : "computed",
      outcome,
      evidenceStrength,
      limitations,
      notes: notes.all(),
      trace: trace.all(),
      reconciliationLineIds: reconciliationLines.map((line) => line.id).sort(),
      sourceRefs,
    });

    return { snapshot, reconciliationLines };
  }

  // -- Perimetre ----------------------------------------------------------

  private assertScope(input: CorporateTaxComputationInput): void {
    const scoped = [input.profile, input.period];
    if (scoped.some((item) =>
      item.organizationId !== input.organizationId ||
      item.dossierId !== input.dossierId ||
      item.entityId !== input.entityId)) {
      throw new Error("CORPORATE_TAX_SCOPE_MISMATCH");
    }
    if (input.documentSnapshots.some((snapshot) =>
      snapshot.organizationId !== input.organizationId ||
      snapshot.dossierId !== input.dossierId ||
      snapshot.entityId !== input.entityId ||
      // Un snapshot d'une autre periode fiscale ne doit jamais alimenter ce
      // calcul, meme s'il porte le meme formulaire et le meme millesime.
      snapshot.taxPeriodId !== input.period.id)) {
      throw new Error("CORPORATE_TAX_DOCUMENT_SCOPE_MISMATCH");
    }
  }

  private collectBlockingConditions(options: {
    readonly input: CorporateTaxComputationInput;
    readonly regime: CorporateTaxRegime | null;
    readonly schedule: TaxRateSchedule | undefined;
  }): readonly TaxLimitation[] {
    const { input, regime, schedule } = options;
    const found: TaxLimitation[] = [];

    if (input.period.taxType !== "corporate_income_tax") {
      found.push(limitation({
        code: "PERIOD_NOT_CORPORATE_INCOME_TAX",
        scope: "period",
        reason: "unsupported_regime",
        message: "La periode fiscale fournie ne releve pas de l'impot sur les societes.",
        relatedIds: [input.period.id],
        resolvability: "not_resolvable",
      }));
    }
    if (regime === null) {
      found.push(limitation({
        code: "UNSUPPORTED_CIT_REGIME",
        scope: "control",
        reason: input.profile.corporateIncomeTaxRegime === "unknown" ? "missing_field" : "unsupported_regime",
        message: `Le regime d'imposition ${input.profile.corporateIncomeTaxRegime} n'entre pas dans le perimetre du moteur (reel normal ou simplifie).`,
        requiredInputs: ["profile:corporateIncomeTaxRegime"],
        relatedIds: [input.profile.id],
        resolvability: input.profile.corporateIncomeTaxRegime === "unknown" ? "human_review" : "not_resolvable",
      }));
    }
    if (input.profile.corporateIncomeTaxGroupStatus !== "none") {
      found.push(limitation({
        code: "TAX_GROUP_OUT_OF_SCOPE",
        scope: "control",
        reason: input.profile.corporateIncomeTaxGroupStatus === "unknown" ? "missing_field" : "unsupported_regime",
        message: "Le moteur ne traite qu'un dossier mono-entite hors integration fiscale.",
        requiredInputs: ["profile:corporateIncomeTaxGroupStatus"],
        relatedIds: [input.profile.id],
        capabilityStatus: input.profile.corporateIncomeTaxGroupStatus === "unknown" ? "available" : "future",
        resolvability: input.profile.corporateIncomeTaxGroupStatus === "unknown" ? "human_review" : "future_engine",
      }));
    }
    if (
      input.profile.accountingPeriod.startDate !== input.period.startDate ||
      input.profile.accountingPeriod.endDate !== input.period.endDate
    ) {
      found.push(limitation({
        code: "ACCOUNTING_PERIOD_MISALIGNED",
        scope: "period",
        reason: "period_mismatch",
        message: "L'exercice comptable du profil et la periode fiscale ne coincident pas ; aucun pont n'est suppose.",
        requiredInputs: ["period:accountingPeriodAlignment"],
        relatedIds: [input.period.id, input.profile.id],
        resolvability: "human_review",
      }));
    }
    if (!schedule) {
      found.push(limitation({
        code: "UNSUPPORTED_RATE_SCHEDULE",
        scope: "period",
        reason: "unsupported_millesime",
        message: `Aucun bareme d'IS n'est publie pour l'exercice ${input.period.fiscalYear} et le millesime ${input.period.formVintage}.`,
        requiredInputs: [`rate_schedule:${input.period.fiscalYear}:${input.period.formVintage}`],
        relatedIds: [input.period.id],
        capabilityStatus: "non_available",
        resolvability: "future_engine",
      }));
    }
    return found;
  }

  // -- Lectures -----------------------------------------------------------

  private readAccountingResult(options: {
    readonly liasse: DeclarationReading;
    readonly mapping: (typeof CORPORATE_TAX_FORM_MAPPINGS)[CorporateTaxRegime];
    readonly limitations: TaxLimitation[];
    readonly notes: CorporateTaxNoteCollector;
    readonly formSourceRef: TaxSourceRef;
  }): {
    readonly amountCents: CentAmount;
    readonly fieldCode: string;
    readonly inputRefs: readonly string[];
    readonly evidenceStrength: EvidenceStrength;
  } | null {
    const { liasse, mapping, limitations, notes } = options;
    const profit = amountFor(liasse, mapping.accountingProfit);
    const loss = amountFor(liasse, mapping.accountingLoss);

    const profitAmount = profit?.amountCents;
    const lossAmount = loss?.amountCents;
    const accountingIssues = liasse.issues.filter((issue) =>
      issue.fieldCode === mapping.accountingProfit ||
      issue.fieldCode === mapping.accountingLoss);

    const accountingUnavailable = (): null => {
      const diagnostics = accountingIssues.map((issue) =>
        `${issue.fieldCode}:${issue.status}:${issue.reason}`);
      const diagnostic = diagnostics.length > 0
        ? ` Diagnostics: ${diagnostics.join(", ")}.`
        : "";
      limitations.push(limitation({
        code: "ACCOUNTING_RESULT_UNAVAILABLE",
        scope: "field",
        reason: "missing_field",
        message: `Les cases ${mapping.accountingProfit}/${mapping.accountingLoss} ne permettent pas d'etablir le resultat comptable sans supposer qu'une absence vaut zero.${diagnostic}`,
        requiredInputs: [`field:${mapping.accountingProfit}`, `field:${mapping.accountingLoss}`],
      }));
      notes.add({
        code: "ACCOUNTING_RESULT_INPUT_INCOMPLETE",
        kind: "prudence",
        message: "Le calcul IS est arrete avant tout calcul dependant : la presence, la lisibilite et le millesime des cases de resultat comptable ne sont pas suffisamment etablis.",
      });
      return null;
    };

    // Une case illisible ou contraire à l'invariant canonique ne peut pas être
    // masquée par une valeur exploitable dans la case opposée.
    if (accountingIssues.some((issue) => issue.status !== "missing")) {
      return accountingUnavailable();
    }

    if (profitAmount !== undefined && profitAmount !== 0 && lossAmount !== undefined && lossAmount !== 0) {
      limitations.push(limitation({
        code: "INCONSISTENT_ACCOUNTING_RESULT",
        scope: "document",
        reason: "inconsistent_declaration",
        message: `La liasse declare simultanement un benefice (${mapping.accountingProfit}) et une perte (${mapping.accountingLoss}) non nuls ; le moteur ne compense pas ces deux grandeurs.`,
        requiredInputs: [`field:${mapping.accountingProfit}`, `field:${mapping.accountingLoss}`],
        resolvability: "human_review",
      }));
      notes.add({
        code: "NO_SILENT_COMPENSATION",
        kind: "prudence",
        message: "Benefice et perte comptables declares ensemble : aucune difference nette n'est calculee a leur place.",
      });
      return null;
    }

    if (!profit && !loss) return accountingUnavailable();

    // Une seule case non nulle identifie sans ambiguïté la branche imprimée.
    // En revanche, une case présente à zéro ne prouve rien sur la case absente.
    if ((profitAmount === undefined || profitAmount === 0) &&
        (lossAmount === undefined || lossAmount === 0) &&
        (!profit || !loss)) {
      return accountingUnavailable();
    }

    const source = profitAmount !== undefined && profitAmount !== 0
      ? profit
      : lossAmount !== undefined && lossAmount !== 0
        ? loss
        : profit;
    if (!source) return null;
    const isProfit = source.fieldCode === mapping.accountingProfit;
    return {
      // Les cases de perte des formulaires 2058-A/2033-B portent une magnitude
      // imprimée. Le rôle de la case détermine le sens économique ; `sign`
      // conserve le signe natif et n'est jamais multiplié une seconde fois.
      amountCents: isProfit ? source.amountCents : -source.amountCents || 0,
      fieldCode: source.fieldCode,
      inputRefs: [source.snapshotId, source.fieldCode],
      evidenceStrength: source.evidenceStrength,
    };
  }

  private buildAdjustmentLines(options: {
    readonly input: CorporateTaxComputationInput;
    readonly mapping: (typeof CORPORATE_TAX_FORM_MAPPINGS)[CorporateTaxRegime];
    readonly liasse: DeclarationReading;
    readonly formSourceRef: TaxSourceRef;
    readonly limitations: TaxLimitation[];
    readonly notes: CorporateTaxNoteCollector;
  }): readonly CorporateTaxAdjustmentLine[] {
    const { input, mapping, liasse, formSourceRef, limitations, notes } = options;
    const lines: CorporateTaxAdjustmentLine[] = [];

    const declaredTotal = (fieldCode: string | null, direction: "reintegration" | "deduction"): void => {
      if (!fieldCode) return;
      const amount = amountFor(liasse, fieldCode);
      if (!amount) {
        limitations.push(limitation({
          code: `DECLARED_TOTAL_UNAVAILABLE:${fieldCode}`,
          scope: "field",
          reason: "missing_field",
          message: `Le total declare ${fieldCode} n'est pas exploitable ; aucun montant n'est suppose a sa place.`,
          requiredInputs: [`field:${fieldCode}`],
        }));
        return;
      }
      if (amount.amountCents === 0) return;
      lines.push(adjustmentLine({
        id: `declared:${fieldCode}`,
        // Un total agrege est declare mais non ventile par nature : il reste
        // rattache aux elements non rapproches tant qu'aucun detail n'existe.
        category: "unreconciled",
        direction,
        status: "confirmed",
        label: `Total declare ${fieldCode}`,
        amountCents: amount.amountCents,
        originKind: "declaration",
        snapshotId: amount.snapshotId,
        fieldCode,
        accountCode: null,
        contentHash: amount.contentHash,
        sourceRefs: [formSourceRef],
        evidenceRefs: [`${amount.snapshotId}:${fieldCode}`],
        evidenceStrength: amount.evidenceStrength,
      }));
      notes.add({
        code: "AGGREGATE_ADJUSTMENT_NOT_ITEMISED",
        kind: "method",
        message: "Les totaux declares de retraitements sont repris tels quels ; leur ventilation par nature n'est pas deduite du formulaire.",
        relatedStepCodes: ["reintegrations_confirmed", "deductions_confirmed"],
        sourceRefs: [formSourceRef],
      });
    };

    declaredTotal(mapping.reintegrationsTotal, "reintegration");
    declaredTotal(mapping.deductionsTotal, "deduction");

    for (const box of mapping.detailBoxes) {
      const amount = amountFor(liasse, box.code);
      if (!amount || amount.amountCents === 0) continue;
      lines.push(adjustmentLine({
        id: `declared:${box.code}`,
        category: box.category,
        direction: box.direction,
        status: "confirmed",
        label: `Case declaree ${box.code}`,
        amountCents: amount.amountCents,
        originKind: "declaration",
        snapshotId: amount.snapshotId,
        fieldCode: box.code,
        accountCode: null,
        contentHash: amount.contentHash,
        sourceRefs: [formSourceRef],
        evidenceRefs: [`${amount.snapshotId}:${box.code}`],
        evidenceStrength: amount.evidenceStrength,
      }));
    }

    if (mapping.deductionsTotal === null && mapping.detailBoxes.length > 0) {
      limitations.push(limitation({
        code: "DEDUCTIONS_NOT_READABLE_FROM_VINTAGE",
        scope: "document",
        reason: "missing_field",
        message: `Le millesime publie de ${mapping.formNumber} n'expose aucune case de deduction : les deductions ne sont pas lues et ne sont pas presumees nulles.`,
        requiredInputs: [`document:${mapping.formNumber}`],
        resolvability: "human_review",
      }));
    }

    for (const observation of input.ledgerObservations ?? []) {
      lines.push(adjustmentLine({
        id: `ledger:${observation.id}`,
        category: observation.category,
        direction: observation.direction,
        // Un numero de compte ou un libelle ne qualifie jamais un retraitement.
        status: "candidate",
        label: observation.label,
        amountCents: observation.amountCents,
        originKind: "ledger",
        snapshotId: observation.snapshotId,
        fieldCode: null,
        accountCode: observation.accountCode,
        contentHash: observation.contentHash,
        sourceRefs: [],
        evidenceRefs: [],
        evidenceStrength: "insufficient",
      }));
    }
    if ((input.ledgerObservations ?? []).length > 0) {
      notes.add({
        code: "LEDGER_OBSERVATIONS_ARE_CANDIDATES",
        kind: "prudence",
        message: "Les observations issues des comptes sont des candidats de retraitement. Elles n'entrent pas dans le resultat fiscal retenu tant qu'une piece et une decision ne les confirment pas.",
        relatedStepCodes: ["reintegrations_proposed", "deductions_proposed"],
      });
    }

    for (const confirmed of input.confirmedAdjustments ?? []) {
      lines.push(adjustmentLine({
        id: `review:${confirmed.id}`,
        category: confirmed.category,
        direction: confirmed.direction,
        status: "confirmed",
        label: confirmed.label,
        amountCents: confirmed.amountCents,
        originKind: "human_review",
        snapshotId: confirmed.snapshotId,
        fieldCode: null,
        accountCode: null,
        contentHash: confirmed.contentHash,
        sourceRefs: confirmed.sourceRefs,
        evidenceRefs: [...confirmed.evidenceRefs, confirmed.reviewEventId],
        evidenceStrength: "direct",
      }));
    }

    return lines.sort((left, right) => left.id.localeCompare(right.id));
  }

  // -- Deficits -----------------------------------------------------------

  private resolveDeficits(options: {
    readonly input: CorporateTaxComputationInput;
    readonly liasse: DeclarationReading;
    readonly mapping: (typeof CORPORATE_TAX_FORM_MAPPINGS)[CorporateTaxRegime];
    readonly schedule: TaxRateSchedule;
    readonly taxResultBeforeDeficits: CentAmount;
    readonly limitations: TaxLimitation[];
    readonly notes: CorporateTaxNoteCollector;
    readonly trace: TraceRecorder;
  }): CorporateTaxDeficitOutcome {
    const { input, liasse, mapping, schedule, taxResultBeforeDeficits, limitations, notes, trace } = options;
    const rule = schedule.deficitCarryforward;
    const sourceRefs: readonly TaxSourceRef[] = [{
      sourceId: rule.sourceId,
      sourceVersionId: rule.sourceVersionId,
      locator: rule.locator,
    }];

    const declared = amountFor(liasse, mapping.deficitsOffset);
    const followUp = readDeclarationBoxes({
      snapshots: input.documentSnapshots,
      formNumber: DEFICIT_FOLLOW_UP_FORM,
      formVintage: input.period.formVintage,
      fieldCodes: [DEFICIT_BOXES.openingStock, DEFICIT_BOXES.transferred],
    });
    const opening = amountFor(followUp, DEFICIT_BOXES.openingStock);
    const transferred = amountFor(followUp, DEFICIT_BOXES.transferred);
    const availableStock = opening
      ? addCents(opening.amountCents, transferred?.amountCents ?? 0, "available_deficit_stock")
      : null;

    if (taxResultBeforeDeficits <= 0) {
      if (declared && declared.amountCents !== 0) {
        limitations.push(limitation({
          code: "DEFICIT_OFFSET_WITHOUT_PROFIT",
          scope: "field",
          reason: "inconsistent_declaration",
          message: `Une imputation de deficits (${mapping.deficitsOffset}) est declaree alors que le resultat fiscal avant deficits n'est pas beneficiaire.`,
          requiredInputs: [`field:${mapping.deficitsOffset}`],
          resolvability: "human_review",
        }));
      }
      notes.add({
        code: "NO_DEFICIT_OFFSET_ON_LOSS",
        kind: "method",
        message: "Aucune imputation n'est possible : le report en avant s'impute sur un benefice.",
        relatedStepCodes: ["deficits_offset"],
        sourceRefs,
      });
      return {
        status: "not_applicable",
        availableStockCents: availableStock,
        declaredOffsetCents: declared?.amountCents ?? null,
        legalCapCents: null,
        appliedOffsetCents: 0,
        remainingStockCents: availableStock,
        sourceRefs,
      };
    }

    // Plafond legal : franchise + quote-part de la fraction excedentaire.
    const excess = clampToNonNegative(
      subtractCents(taxResultBeforeDeficits, rule.baseAllowanceCents, "deficit_cap_excess"),
    );
    const capFromLaw = addCents(
      minCents(rule.baseAllowanceCents, taxResultBeforeDeficits),
      applyBasisPoints(excess, rule.marginalRateBasisPoints),
      "deficit_legal_cap",
    );
    const legalCap = availableStock === null ? capFromLaw : minCents(capFromLaw, availableStock);
    trace.record({
      id: "step-deficit-cap",
      operation: "legal_cap_allowance_plus_marginal_share",
      inputRefs: ["tax_result_before_deficits", "deficit_stock"],
      outputRef: "deficit_legal_cap",
      sourceRefs,
      inputs: {
        taxResultBeforeDeficits,
        baseAllowanceCents: rule.baseAllowanceCents,
        marginalRateBasisPoints: rule.marginalRateBasisPoints,
        availableStock,
        capFromLaw,
        legalCap,
      },
    });

    notes.add({
      code: "DEFICIT_CARRYFORWARD_CAP",
      kind: "method",
      message: "L'imputation des deficits reportables est plafonnee par une franchise majoree d'une quote-part de la fraction du benefice qui l'excede.",
      relatedStepCodes: ["deficits_offset"],
      sourceRefs,
    });

    if (!declared) {
      if (availableStock === null) {
        // Ni l'imputation declaree ni le stock de deficits ne sont connus : le
        // moteur ne peut pas ecarter l'existence d'un deficit reportable. Une
        // limitation est requise pour que resolveOutcome ne conclue jamais
        // `passed` sur cette hypothese non verifiee.
        limitations.push(limitation({
          code: "DEFICIT_DATA_UNAVAILABLE",
          scope: "field",
          reason: "missing_field",
          message: `Ni l'imputation declaree (${mapping.deficitsOffset}) ni le stock de deficits (2058-B, ${DEFICIT_BOXES.openingStock}) ne sont exploitables : l'absence de deficit reportable n'est pas presumee.`,
          requiredInputs: [`field:${mapping.deficitsOffset}`, `document:${DEFICIT_FOLLOW_UP_FORM}`],
          resolvability: "human_review",
        }));
        notes.add({
          code: "NO_DEFICIT_DATA",
          kind: "prudence",
          message: "Aucune donnee de deficit n'est fournie : aucune imputation n'est retenue et l'absence de stock n'est pas presumee.",
          relatedStepCodes: ["deficits_offset"],
        });
        return {
          status: "unknown",
          availableStockCents: null,
          declaredOffsetCents: null,
          legalCapCents: legalCap,
          appliedOffsetCents: 0,
          remainingStockCents: null,
          sourceRefs,
        };
      }
      limitations.push(limitation({
        code: "DEFICIT_OFFSET_NOT_DECLARED",
        scope: "field",
        reason: "missing_field",
        message: `Un stock de deficits est connu mais la case ${mapping.deficitsOffset} n'est pas exploitable : le moteur n'impute rien d'office.`,
        requiredInputs: [`field:${mapping.deficitsOffset}`],
        resolvability: "human_review",
      }));
      return {
        status: "unknown",
        availableStockCents: availableStock,
        declaredOffsetCents: null,
        legalCapCents: legalCap,
        appliedOffsetCents: 0,
        remainingStockCents: availableStock,
        sourceRefs,
      };
    }

    if (declared.amountCents > legalCap) {
      limitations.push(limitation({
        code: "DEFICIT_OFFSET_ABOVE_LEGAL_CAP",
        scope: "control",
        reason: "inconsistent_declaration",
        message: `L'imputation declaree (${declared.amountCents} centimes) depasse le plafond calcule (${legalCap} centimes). Le moteur conserve la valeur declaree et signale l'ecart sans la corriger.`,
        requiredInputs: [`field:${mapping.deficitsOffset}`],
        blockedOutcomes: ["passed"],
        resolvability: "human_review",
      }));
      notes.add({
        code: "DEFICIT_OFFSET_KEPT_AS_DECLARED",
        kind: "prudence",
        message: "L'imputation retenue reste celle declaree : le moteur ne substitue pas son plafond a la declaration.",
        relatedStepCodes: ["deficits_offset"],
      });
    }

    return {
      status: "applied",
      availableStockCents: availableStock,
      declaredOffsetCents: declared.amountCents,
      legalCapCents: legalCap,
      appliedOffsetCents: declared.amountCents,
      remainingStockCents: availableStock === null
        ? null
        : maxCents(subtractCents(availableStock, declared.amountCents, "remaining_stock"), 0),
      sourceRefs,
    };
  }

  // -- Taux ---------------------------------------------------------------

  private allocateBrackets(options: {
    readonly schedule: TaxRateSchedule;
    readonly profile: TaxProfile;
    readonly taxableBaseCents: CentAmount;
    readonly notes: CorporateTaxNoteCollector;
    readonly trace: TraceRecorder;
  }): {
    readonly allocations: readonly CorporateTaxBracketAllocation[];
    readonly grossTaxCents: CentAmount;
    readonly hasUnknownEligibility: boolean;
    readonly unknownInputs: readonly string[];
    readonly unallocatedBaseCents: CentAmount;
  } {
    const { schedule, profile, taxableBaseCents, notes, trace } = options;
    const allocations: CorporateTaxBracketAllocation[] = [];
    const unknownInputs = new Set<string>();
    let remaining = taxableBaseCents;
    let hasUnknownEligibility = false;

    for (const bracket of orderedBrackets(schedule)) {
      const eligibility = evaluateEligibility(bracket, profile);
      const usable = eligibility.status === "eligible" || eligibility.status === "not_applicable";
      if (eligibility.status === "unknown") {
        hasUnknownEligibility = true;
        for (const condition of eligibility.conditions) {
          if (condition.status === "unknown") unknownInputs.add(condition.profileInput);
        }
        notes.add({
          code: "REDUCED_RATE_NOT_APPLIED_UNKNOWN_CONDITIONS",
          kind: "prudence",
          message: "Une condition d'eligibilite au taux reduit n'est pas renseignee : le taux reduit n'est pas applique et l'impot est presente comme une estimation.",
          relatedStepCodes: ["gross_tax"],
        });
      }
      const allocated = usable && remaining > 0
        ? (bracket.baseCapCents === null ? remaining : minCents(remaining, bracket.baseCapCents))
        : 0;
      const tax = applyBasisPoints(allocated, bracket.rateBasisPoints);
      allocations.push(Object.freeze({
        code: bracket.code,
        label: bracket.label,
        order: bracket.order,
        rateBasisPoints: bracket.rateBasisPoints,
        baseCapCents: bracket.baseCapCents,
        allocatedBaseCents: allocated,
        taxCents: tax,
        applied: allocated > 0,
        eligibility,
        ruleVersionId: bracket.ruleVersionId,
        sourceRefs: [bracketSourceRef(bracket)],
      }));
      if (allocated > 0) {
        notes.add({
          code: `RATE_APPLIED:${bracket.code}`,
          kind: "method",
          message: `${bracket.label} applique a la fraction correspondante de la base imposable.`,
          relatedStepCodes: ["gross_tax"],
          sourceRefs: [bracketSourceRef(bracket)],
        });
      }
      remaining = subtractCents(remaining, allocated, "bracket_allocation");
    }

    const grossTaxCents = sumCents(allocations.map((allocation) => allocation.taxCents), "gross_tax");
    trace.record({
      id: "step-gross-tax",
      operation: "allocate_taxable_base_by_bracket_then_apply_rates",
      inputRefs: ["taxable_base"],
      outputRef: "gross_tax",
      sourceRefs: allocations.flatMap((allocation) => allocation.sourceRefs),
      inputs: {
        scheduleId: schedule.id,
        roundingRule: schedule.roundingRule,
        allocations: allocations.map((allocation) => ({
          code: allocation.code,
          allocatedBaseCents: allocation.allocatedBaseCents,
          rateBasisPoints: allocation.rateBasisPoints,
          taxCents: allocation.taxCents,
        })),
      },
    });

    return {
      allocations,
      grossTaxCents,
      hasUnknownEligibility,
      unknownInputs: [...unknownInputs].sort(),
      // Aucune tranche n'a pu absorber ce reliquat : le bareme applicable ne
      // couvre pas cette base. Le moteur le signale, il ne l'attribue pas
      // d'office a la derniere tranche.
      unallocatedBaseCents: remaining,
    };
  }

  // -- Comparaisons -------------------------------------------------------

  private reconciliation(options: {
    readonly input: CorporateTaxComputationInput;
    readonly lineKey: string;
    readonly label: string;
    readonly left: { readonly amountCents: CentAmount; readonly snapshotId: string; readonly fieldCode: string | null } | null;
    readonly right: { readonly amountCents: CentAmount; readonly snapshotId: string; readonly fieldCode: string | null } | null;
    readonly toleranceFamily: "hardLaw" | "methodology" | "internal";
    readonly normalizationNotes?: readonly string[];
    readonly evidenceRefs?: readonly string[];
    readonly traceStepIds?: readonly string[];
  }): TaxReconciliationLine {
    const { input, left, right } = options;
    const comparable = left !== null && right !== null;
    const difference = comparable ? subtractCents(left.amountCents, right.amountCents, options.lineKey) : null;
    return createTaxReconciliationLine({
      id: `corporate-tax-line:${input.executionId}:${options.lineKey}`,
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      executionId: input.executionId,
      lineKey: options.lineKey,
      label: options.label,
      leftOperand: left ? { amountCents: left.amountCents, currency: "EUR", snapshotId: left.snapshotId, fieldCode: left.fieldCode } : null,
      rightOperand: right ? { amountCents: right.amountCents, currency: "EUR", snapshotId: right.snapshotId, fieldCode: right.fieldCode } : null,
      normalizationNotes: [...(options.normalizationNotes ?? [])],
      differenceAmountCents: difference,
      // Une identite arithmetique ne supporte aucune tolerance.
      toleranceAmountCents: 0,
      toleranceFamily: options.toleranceFamily,
      status: !comparable ? "missing_operand" : difference === 0 ? "matched" : "different",
      evidenceRefs: [...(options.evidenceRefs ?? [])].sort(),
      traceStepIds: [...(options.traceStepIds ?? [])].sort(),
    });
  }

  private compareDeclaredTaxResult(options: {
    readonly input: CorporateTaxComputationInput;
    readonly liasse: DeclarationReading;
    readonly mapping: (typeof CORPORATE_TAX_FORM_MAPPINGS)[CorporateTaxRegime];
    readonly computedCents: CentAmount;
    readonly limitations: TaxLimitation[];
  }): readonly TaxReconciliationLine[] {
    const { input, liasse, mapping, computedCents, limitations } = options;
    const profit = amountFor(liasse, mapping.resultBeforeDeficitsProfit);
    const deficit = amountFor(liasse, mapping.resultBeforeDeficitsDeficit);
    const declared = this.signedDeclaredResult(profit, deficit, {
      limitations,
      profitFieldCode: mapping.resultBeforeDeficitsProfit,
      deficitFieldCode: mapping.resultBeforeDeficitsDeficit,
    });
    return [this.reconciliation({
      input,
      lineKey: "declared_tax_result_before_deficits",
      label: "Resultat fiscal avant deficits : recalcule et declare",
      left: { amountCents: computedCents, snapshotId: input.snapshotId, fieldCode: null },
      right: declared,
      toleranceFamily: "hardLaw",
      normalizationNotes: [
        `Le formulaire porte le benefice en ${mapping.resultBeforeDeficitsProfit} et le deficit en ${mapping.resultBeforeDeficitsDeficit}, tous deux en valeur absolue ; le signe est retabli avant comparaison.`,
      ],
      traceStepIds: ["step-tax-result-before-deficits"],
    })];
  }

  private compareFinalTaxResult(options: {
    readonly input: CorporateTaxComputationInput;
    readonly liasse: DeclarationReading;
    readonly mapping: (typeof CORPORATE_TAX_FORM_MAPPINGS)[CorporateTaxRegime];
    readonly computedCents: CentAmount;
    readonly limitations: TaxLimitation[];
  }): readonly TaxReconciliationLine[] {
    const { input, liasse, mapping, computedCents, limitations } = options;
    const declared = this.signedDeclaredResult(
      amountFor(liasse, mapping.finalProfit),
      amountFor(liasse, mapping.finalDeficit),
      {
        limitations,
        profitFieldCode: mapping.finalProfit,
        deficitFieldCode: mapping.finalDeficit,
      },
    );
    return [this.reconciliation({
      input,
      lineKey: "declared_final_tax_result",
      label: "Resultat fiscal apres imputation des deficits : recalcule et declare",
      left: { amountCents: computedCents, snapshotId: input.snapshotId, fieldCode: null },
      right: declared,
      toleranceFamily: "hardLaw",
      normalizationNotes: [
        `Le formulaire porte le benefice en ${mapping.finalProfit} et le deficit en ${mapping.finalDeficit}, tous deux en valeur absolue ; le signe est retabli avant comparaison.`,
      ],
      traceStepIds: ["step-tax-result-before-deficits", "step-deficit-cap"],
    })];
  }

  private signedDeclaredResult(
    profit: DeclarationAmount | undefined,
    deficit: DeclarationAmount | undefined,
    context: {
      readonly limitations: TaxLimitation[];
      readonly profitFieldCode: string;
      readonly deficitFieldCode: string;
    },
  ): { readonly amountCents: CentAmount; readonly snapshotId: string; readonly fieldCode: string } | null {
    if (profit && deficit && profit.amountCents !== 0 && deficit.amountCents !== 0) {
      // Benefice et deficit non nuls declares ensemble sur la meme paire de
      // cases : la valeur declaree est contradictoire. Ni l'une ni l'autre
      // n'est retenue a la place de l'arbitrage humain requis.
      context.limitations.push(limitation({
        code: `DECLARED_RESULT_INCONSISTENT:${context.profitFieldCode}`,
        scope: "field",
        reason: "inconsistent_declaration",
        message: `La liasse declare simultanement un resultat positif (${context.profitFieldCode}) et un resultat negatif (${context.deficitFieldCode}) non nuls ; la valeur declaree ne peut pas etre etablie sans arbitrage humain.`,
        requiredInputs: [`field:${context.profitFieldCode}`, `field:${context.deficitFieldCode}`],
        resolvability: "human_review",
      }));
      return null;
    }
    if (profit && profit.amountCents !== 0) {
      return { amountCents: profit.amountCents, snapshotId: profit.snapshotId, fieldCode: profit.fieldCode };
    }
    if (deficit && deficit.amountCents !== 0) {
      return { amountCents: -deficit.amountCents, snapshotId: deficit.snapshotId, fieldCode: deficit.fieldCode };
    }
    if (profit) {
      return { amountCents: 0, snapshotId: profit.snapshotId, fieldCode: profit.fieldCode };
    }
    return null;
  }

  private compareDeclaration2065(options: {
    readonly input: CorporateTaxComputationInput;
    readonly allocation: { readonly allocations: readonly CorporateTaxBracketAllocation[] };
  }): readonly TaxReconciliationLine[] {
    const { input, allocation } = options;
    const reading = readDeclarationBoxes({
      snapshots: input.documentSnapshots,
      formNumber: DECLARATION_FORM,
      formVintage: input.period.formVintage,
      fieldCodes: [DECLARATION_BOXES.normalRateBase, DECLARATION_BOXES.reducedRateBase],
    });
    const normal = allocation.allocations.find((bracket) => bracket.code === "normal");
    const reduced = allocation.allocations.find((bracket) => bracket.code === "reduced_sme");
    const declaredNormal = amountFor(reading, DECLARATION_BOXES.normalRateBase);
    const declaredReduced = amountFor(reading, DECLARATION_BOXES.reducedRateBase);

    const lines: TaxReconciliationLine[] = [];
    if (declaredNormal || declaredReduced) {
      lines.push(this.reconciliation({
        input,
        lineKey: "declared_normal_rate_base",
        label: "Base au taux normal : recalculee et declaree sur la 2065",
        left: normal ? { amountCents: normal.allocatedBaseCents, snapshotId: input.snapshotId, fieldCode: null } : null,
        right: declaredNormal
          ? { amountCents: declaredNormal.amountCents, snapshotId: declaredNormal.snapshotId, fieldCode: declaredNormal.fieldCode }
          : null,
        toleranceFamily: "methodology",
        traceStepIds: ["step-gross-tax"],
      }));
      lines.push(this.reconciliation({
        input,
        lineKey: "declared_reduced_rate_base",
        label: "Base au taux reduit : recalculee et declaree sur la 2065",
        left: reduced ? { amountCents: reduced.allocatedBaseCents, snapshotId: input.snapshotId, fieldCode: null } : null,
        right: declaredReduced
          ? { amountCents: declaredReduced.amountCents, snapshotId: declaredReduced.snapshotId, fieldCode: declaredReduced.fieldCode }
          : null,
        toleranceFamily: "methodology",
        traceStepIds: ["step-gross-tax"],
      }));
    }
    return lines;
  }

  private compareAccountedPositions(options: {
    readonly input: CorporateTaxComputationInput;
    readonly grossTaxCents: CentAmount;
  }): readonly TaxReconciliationLine[] {
    const { input, grossTaxCents } = options;
    const positions = input.accountedPositions;
    if (!positions) return [];
    const lines: TaxReconciliationLine[] = [];
    if (positions.chargeCents !== null) {
      lines.push(this.reconciliation({
        input,
        lineKey: "accounted_tax_charge",
        label: "Impot brut estime et charge d'impot comptabilisee",
        left: { amountCents: grossTaxCents, snapshotId: input.snapshotId, fieldCode: null },
        right: { amountCents: positions.chargeCents, snapshotId: positions.snapshotId, fieldCode: null },
        toleranceFamily: "methodology",
        normalizationNotes: [
          "La charge comptabilisee peut inclure des elements hors perimetre du calcul (credits d'impot, contributions additionnelles) ; l'ecart n'est pas une non-conformite.",
        ],
        traceStepIds: ["step-gross-tax"],
      }));
    }
    if (positions.liabilityCents !== null) {
      lines.push(this.reconciliation({
        input,
        lineKey: "accounted_tax_liability",
        label: "Impot brut estime et dette d'impot comptabilisee",
        left: { amountCents: grossTaxCents, snapshotId: input.snapshotId, fieldCode: null },
        right: { amountCents: positions.liabilityCents, snapshotId: positions.snapshotId, fieldCode: null },
        toleranceFamily: "methodology",
        normalizationNotes: [
          "La dette comptabilisee est nette des acomptes verses ; elle n'est pas directement comparable a un impot brut.",
        ],
        traceStepIds: ["step-gross-tax"],
      }));
    }
    return lines;
  }

  // -- Sorties ------------------------------------------------------------

  /**
   * Ordre de priorite deterministe. Un ecart constate prime sur une limitation
   * non bloquante, mais une information manquante prime sur tout : le moteur ne
   * conclut pas sur des donnees qu'il n'a pas.
   */
  private resolveOutcome(options: {
    readonly limitations: readonly TaxLimitation[];
    readonly differenceFound: boolean;
    readonly missingOperand: boolean;
    readonly hasUnknownEligibility: boolean;
  }): TaxControlOutcome {
    const { limitations, differenceFound, missingOperand, hasUnknownEligibility } = options;
    const blocksConclusion = limitations.some((item) =>
      item.blockedOutcomes.includes("reconciliation_difference") ||
      item.reason === "missing_field" ||
      item.reason === "missing_document");
    if (hasUnknownEligibility || blocksConclusion) return "missing_information";
    if (differenceFound) return "reconciliation_difference";
    // Une comparaison sans operande interdit une conclusion positive globale.
    if (missingOperand || limitations.length > 0) return "inconclusive";
    return "passed";
  }

  private blockedAfterReading(options: {
    readonly input: CorporateTaxComputationInput;
    readonly regime: CorporateTaxRegime;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: CorporateTaxNoteCollector;
    readonly trace: TraceRecorder;
    readonly outcome: TaxControlOutcome;
    readonly sourceRefs: readonly TaxSourceRef[];
  }): CorporateTaxComputationResult {
    return {
      snapshot: this.finalize({
        input: options.input,
        regime: options.regime,
        schedule: null,
        status: "blocked",
        accountingResultCents: 0,
        adjustmentLines: [],
        taxResultBeforeDeficitsCents: 0,
        deficits: {
          status: "unknown",
          availableStockCents: null,
          declaredOffsetCents: null,
          legalCapCents: null,
          appliedOffsetCents: 0,
          remainingStockCents: null,
          sourceRefs: [],
        },
        taxableBaseCents: 0,
        brackets: [],
        grossTaxCents: null,
        taxImpactStatus: "not_computed",
        outcome: options.outcome,
        evidenceStrength: "insufficient",
        limitations: [...options.limitations],
        notes: options.notes.all(),
        trace: options.trace.all(),
        reconciliationLineIds: [],
        sourceRefs: options.sourceRefs,
      }),
      reconciliationLines: [],
    };
  }

  private finalize(options: {
    readonly input: CorporateTaxComputationInput;
    readonly regime: CorporateTaxRegime;
    readonly schedule: TaxRateSchedule | null;
    readonly status: "computed" | "blocked";
    readonly accountingResultCents: CentAmount;
    readonly adjustmentLines: readonly CorporateTaxAdjustmentLine[];
    readonly taxResultBeforeDeficitsCents: CentAmount;
    readonly deficits: CorporateTaxDeficitOutcome;
    readonly taxableBaseCents: CentAmount;
    readonly brackets: readonly CorporateTaxBracketAllocation[];
    readonly grossTaxCents: CentAmount | null;
    readonly taxImpactStatus: CorporateTaxSnapshot["taxImpactStatus"];
    readonly outcome: TaxControlOutcome;
    readonly evidenceStrength: EvidenceStrength;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: CorporateTaxSnapshot["notes"];
    readonly trace: readonly TaxTraceStep[];
    readonly reconciliationLineIds: readonly string[];
    readonly sourceRefs: readonly TaxSourceRef[];
  }): CorporateTaxSnapshot {
    const { input } = options;
    const reintegrationsConfirmedCents = totalFor(options.adjustmentLines, "reintegration", "confirmed");
    const reintegrationsProposedCents = totalFor(options.adjustmentLines, "reintegration", "candidate");
    const deductionsConfirmedCents = totalFor(options.adjustmentLines, "deduction", "confirmed");
    const deductionsProposedCents = totalFor(options.adjustmentLines, "deduction", "candidate");

    const waterfall: CorporateTaxWaterfall = buildWaterfall({
      accountingResultCents: options.accountingResultCents,
      reintegrationsConfirmedCents,
      reintegrationsProposedCents,
      deductionsConfirmedCents,
      deductionsProposedCents,
      taxResultBeforeDeficitsCents: options.taxResultBeforeDeficitsCents,
      deficitOffsetCents: options.deficits.appliedOffsetCents,
      taxableBaseCents: options.taxableBaseCents,
      grossTaxCents: options.grossTaxCents ?? 0,
      adjustmentLines: options.adjustmentLines,
      status: options.status,
      sourceRefs: options.sourceRefs,
    });

    const body = {
      id: input.snapshotId,
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      taxPeriodId: input.period.id,
      fiscalYear: input.period.fiscalYear,
      formVintage: input.period.formVintage,
      taxType: "corporate_income_tax" as const,
      regime: options.regime,
      engineVersion: CORPORATE_TAX_ENGINE_VERSION,
      calculationVersion: CORPORATE_TAX_CALCULATION_VERSION,
      rateScheduleId: options.schedule?.id ?? null,
      status: options.status,
      accountingResultCents: options.accountingResultCents,
      adjustmentLines: options.adjustmentLines,
      reintegrationsConfirmedCents,
      reintegrationsProposedCents,
      deductionsConfirmedCents,
      deductionsProposedCents,
      taxResultBeforeDeficitsCents: options.taxResultBeforeDeficitsCents,
      deficits: options.deficits,
      taxableBaseCents: options.taxableBaseCents,
      brackets: options.brackets,
      grossTaxCents: options.grossTaxCents,
      taxImpactStatus: options.taxImpactStatus,
      reconciliationLineIds: [...options.reconciliationLineIds].sort(),
      waterfall,
      notes: options.notes,
      limitations: [...options.limitations].sort((left, right) => left.id.localeCompare(right.id)),
      trace: options.trace,
      outcome: options.outcome,
      evidenceStrength: options.evidenceStrength,
      sourceRefs: dedupeSourceRefs(options.sourceRefs),
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };

    const snapshot = {
      ...body,
      canonicalJson: canonicalJson(body),
      snapshotHash: stableHash(body),
    };

    // Les invariants de prudence sont verifies sur la sortie elle-meme, et pas
    // seulement a la construction de chaque piece : un snapshot qui violerait
    // « base integralement ventilee », « impot = somme des tranches » ou
    // « pas de non-conformite confirmee » ne sort jamais du moteur.
    CorporateTaxSnapshotSchema.parse(snapshot);
    return Object.freeze(snapshot) as CorporateTaxSnapshot;
  }
}

export function computeCorporateTax(input: CorporateTaxComputationInput): CorporateTaxComputationResult {
  return new CorporateTaxComputationEngine().compute(input);
}

export type { CorporateTaxWaterfallStep };
