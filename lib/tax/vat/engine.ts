/**
 * `VatControlEngine` — réconciliation TVA explicable (TAX-06).
 *
 * Périmètre : une entité, une période déclarative, régime réel normal, mini-réel
 * ou réel simplifié. Le moteur rapproche les écritures, la déclaration et, quand
 * elles sont fournies, les pièces. Il ne télétransmet rien.
 *
 * Trois disciplines héritées de TAX-05 et renforcées ici :
 *  - le FEC ne confirme rien : il produit des candidats et des signaux ;
 *  - une source non couverte pour la période bloque le contrôle qui en dépend,
 *    sans repli sur « la version la plus proche » ;
 *  - `confirmed_non_compliance` est hors périmètre du lot.
 */
import type {
  CentAmount,
  EvidenceStrength,
  FecEntry,
  TaxControlOutcome,
  TaxDocumentSnapshot,
  TaxLimitation,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
  TaxSourceRef,
  TaxTraceStep,
} from "@/lib/canonical-model";
import { canonicalJson, stableHash } from "@/lib/synthesis/canonical";
import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";
import { createTaxReconciliationLine } from "../canonical";
import { subtractCents } from "../corporate-tax/arithmetic";
import { assessNormativeCoverage, type VatSourceRequirement } from "./coverage";
import {
  buildComparisonDataset,
  buildMissingPieceMatrix,
  buildNetWaterfallDataset,
  buildSalesByRateDataset,
  buildTimelineDataset,
} from "./datasets";
import { creditToCarryCents, readVatDeclaration, vatFormMappingFor } from "./declaration";
import { readVatLedger, type VatAccountMap } from "./ledger";
import { buildRateBuckets, totalAccountedCents, totalTheoreticalCents } from "./rates";
import { VatNoteCollector } from "./notes";
import { VatReconciliationSnapshotSchema } from "./schemas";
import type {
  VatControlResult,
  VatDeclarationSnapshot,
  VatDatasets,
  VatEvidenceTier,
  VatFrequency,
  VatPeriod,
  VatRateBucket,
  VatReconciliationSnapshot,
  VatRegime,
  VatTransactionCandidate,
} from "./types";

export const VAT_ENGINE_VERSION = "tax-06-vat-reconciliation-1.0.0";
export const VAT_CALCULATION_VERSION = "2026.1.0";

const BLOCKED_CONCLUSIONS: readonly TaxControlOutcome[] = [
  "passed",
  "reconciliation_difference",
  "potential_tax_risk",
];

export interface VatReconciliationInput {
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly executionId: string;
  readonly snapshotId: string;
  readonly profile: TaxProfile;
  readonly period: TaxPeriod;
  readonly fecEntries: readonly FecEntry[];
  readonly documentSnapshots: readonly TaxDocumentSnapshot[];
  readonly availableInvoiceRefs?: readonly string[];
  readonly accountMap?: VatAccountMap;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface VatReconciliationResult {
  readonly snapshot: VatReconciliationSnapshot;
  readonly reconciliationLines: readonly TaxReconciliationLine[];
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
    id: `vat-limitation:${input.code}`,
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

function regimeOf(profile: TaxProfile): VatRegime | null {
  if (profile.vatRegime === "real_normal") return "real_normal";
  if (profile.vatRegime === "mini_real") return "mini_real";
  if (profile.vatRegime === "real_simplified") return "real_simplified";
  return null;
}

function frequencyOf(period: TaxPeriod): VatFrequency | null {
  if (period.frequency === "monthly") return "monthly";
  if (period.frequency === "quarterly") return "quarterly";
  if (period.frequency === "annual") return "annual";
  return null;
}

class TraceRecorder {
  private readonly steps: TaxTraceStep[] = [];

  record(input: {
    readonly id: string;
    readonly operation: string;
    readonly inputRefs: readonly string[];
    readonly outputRef: string;
    readonly sourceRefs?: readonly TaxSourceRef[];
    readonly inputs: unknown;
  }): void {
    this.steps.push({
      id: input.id,
      operation: input.operation,
      inputRefs: [...input.inputRefs],
      outputRef: input.outputRef,
      sourceRefs: [...(input.sourceRefs ?? [])],
      canonicalInputHash: stableHash(input.inputs),
    });
  }

  all(): readonly TaxTraceStep[] {
    return [...this.steps];
  }
}

/** Contexte partagé par tous les contrôles d'une exécution. */
interface ControlContext {
  readonly input: VatReconciliationInput;
  readonly period: VatPeriod;
  readonly declaration: VatDeclarationSnapshot;
  readonly candidates: readonly VatTransactionCandidate[];
  readonly collectedBuckets: readonly VatRateBucket[];
  readonly deductibleBuckets: readonly VatRateBucket[];
  readonly collectedAccountedCents: CentAmount;
  readonly deductibleAccountedCents: CentAmount;
  readonly collectedTheoreticalCents: CentAmount;
  readonly collectedAccountBalanceCents: CentAmount;
  readonly deductibleAccountBalanceCents: CentAmount;
  readonly invoiceRefsProvided: boolean;
  readonly limitations: TaxLimitation[];
  readonly reconciliationLines: TaxReconciliationLine[];
}

export class VatControlEngine {
  reconcile(input: VatReconciliationInput): VatReconciliationResult {
    this.assertScope(input);
    const notes = new VatNoteCollector();
    const trace = new TraceRecorder();
    const limitations: TaxLimitation[] = [];
    const reconciliationLines: TaxReconciliationLine[] = [];

    const regime = regimeOf(input.profile);
    const frequency = frequencyOf(input.period);

    const blocking = this.collectBlockingConditions({ input, regime, frequency });
    if (blocking.length > 0) {
      limitations.push(...blocking);
      notes.add({
        code: "RECONCILIATION_BLOCKED",
        kind: "prudence",
        message: "La reconciliation TVA n'est pas executee : une condition de perimetre ou une entree obligatoire manque.",
      });
      return this.blocked({ input, regime: regime ?? "real_normal", frequency: frequency ?? "monthly", limitations, notes, trace });
    }

    const resolvedRegime = regime as VatRegime;
    const resolvedFrequency = frequency as VatFrequency;
    const period = this.buildPeriod(input, resolvedRegime, resolvedFrequency);

    const ledger = readVatLedger({
      entries: input.fecEntries,
      periodStartDate: input.period.startDate,
      periodEndDate: input.period.endDate,
      accountMap: input.accountMap,
      availableInvoiceRefs: input.availableInvoiceRefs,
    });
    trace.record({
      id: "step-ledger",
      operation: "rebuild_vat_candidates_from_ledger",
      inputRefs: ["fec"],
      outputRef: "vat_candidates",
      inputs: { candidateCount: ledger.candidates.length },
    });

    const declaration = readVatDeclaration({
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      vatPeriodId: period.id,
      regime: resolvedRegime,
      formVintage: input.period.formVintage,
      snapshots: input.documentSnapshots,
      snapshotId: `${input.snapshotId}:declaration`,
    });

    const collectedBuckets = buildRateBuckets({ candidates: ledger.candidates, direction: "collected" });
    const deductibleBuckets = buildRateBuckets({ candidates: ledger.candidates, direction: "deductible" });
    const collectedAccountedCents = totalAccountedCents(collectedBuckets);
    const deductibleAccountedCents = totalAccountedCents(deductibleBuckets);
    const collectedTheoreticalCents = totalTheoreticalCents(collectedBuckets);
    trace.record({
      id: "step-rate-buckets",
      operation: "aggregate_by_observed_rate",
      inputRefs: ["vat_candidates"],
      outputRef: "rate_buckets",
      inputs: { collectedAccountedCents, deductibleAccountedCents, collectedTheoreticalCents },
    });

    notes.add({
      code: "OBSERVED_RATES_ONLY",
      kind: "prudence",
      message: "Aucun bareme legal de TVA n'est publie par le registre. Les taux sont constates a partir des ecritures ; le moteur ne qualifie aucun taux de correct ou d'incorrect.",
    });

    const context: ControlContext = {
      input,
      period,
      declaration,
      candidates: ledger.candidates,
      collectedBuckets,
      deductibleBuckets,
      collectedAccountedCents,
      deductibleAccountedCents,
      collectedTheoreticalCents,
      collectedAccountBalanceCents: ledger.collectedAccountBalanceCents,
      deductibleAccountBalanceCents: ledger.deductibleAccountBalanceCents,
      invoiceRefsProvided: ledger.invoiceRefsProvided,
      limitations,
      reconciliationLines,
    };

    const controls = this.runControls(context, notes);

    const netAccountedCents = subtractCents(collectedAccountedCents, deductibleAccountedCents, "vat_net_accounted");
    const datasets: VatDatasets = {
      salesByRate: buildSalesByRateDataset(collectedBuckets),
      comparison: buildComparisonDataset({
        collectedTheoreticalCents,
        collectedAccountedCents,
        deductibleAccountedCents,
        declaration,
      }),
      netWaterfall: buildNetWaterfallDataset({
        collectedAccountedCents,
        deductibleAccountedCents,
        declaration,
      }),
      timeline: buildTimelineDataset({
        periodStart: period.startDate,
        periodEnd: period.endDate,
        frequency: resolvedFrequency,
        collectedAccountedCents,
        deductibleAccountedCents,
        declaredNetCents: declaration.netDueCents,
        status: declaration.status !== "available"
          ? "declaration_absent"
          : controls.some((control) => control.outcome === "reconciliation_difference")
            ? "difference"
            : "reconciled",
      }),
      missingPieces: buildMissingPieceMatrix(ledger.candidates),
    };

    const evidenceTier = this.evidenceTier(
      declaration,
      ledger.invoiceRefsProvided,
      ledger.candidates,
    );
    const outcome = this.resolveOutcome(controls);
    const evidenceStrength = this.evidenceStrength(evidenceTier, outcome);

    notes.add({
      code: "NO_TRANSMISSION",
      kind: "prudence",
      message: "Le moteur produit une reconciliation explicable. Il n'effectue aucune telétransmission a la DGFiP.",
    });

    const snapshot = this.finalize({
      input,
      period,
      declaration,
      regime: resolvedRegime,
      frequency: resolvedFrequency,
      status: "reconciled",
      candidates: ledger.candidates,
      rateBuckets: [...collectedBuckets, ...deductibleBuckets],
      collectedAccountedCents,
      deductibleAccountedCents,
      collectedTheoreticalCents,
      netAccountedCents,
      netDeclaredCents: declaration.netDueCents,
      controls,
      datasets,
      outcome,
      evidenceStrength,
      evidenceTier,
      limitations,
      notes: notes.all(),
      trace: trace.all(),
      reconciliationLineIds: reconciliationLines.map((line) => line.id).sort(),
    });

    return { snapshot, reconciliationLines };
  }

  // -- Périmètre -----------------------------------------------------------

  private assertScope(input: VatReconciliationInput): void {
    const scoped = [input.profile, input.period];
    if (scoped.some((item) =>
      item.organizationId !== input.organizationId ||
      item.dossierId !== input.dossierId ||
      item.entityId !== input.entityId)) {
      throw new Error("VAT_SCOPE_MISMATCH");
    }
    if (input.documentSnapshots.some((snapshot) =>
      snapshot.organizationId !== input.organizationId ||
      snapshot.dossierId !== input.dossierId ||
      snapshot.entityId !== input.entityId ||
      snapshot.taxPeriodId !== input.period.id)) {
      throw new Error("VAT_DOCUMENT_SCOPE_MISMATCH");
    }
  }

  private collectBlockingConditions(options: {
    readonly input: VatReconciliationInput;
    readonly regime: VatRegime | null;
    readonly frequency: VatFrequency | null;
  }): readonly TaxLimitation[] {
    const { input, regime, frequency } = options;
    const found: TaxLimitation[] = [];

    if (input.period.taxType !== "vat") {
      found.push(limitation({
        code: "PERIOD_NOT_VAT",
        scope: "period",
        reason: "unsupported_regime",
        message: "La periode fournie ne releve pas de la TVA.",
        relatedIds: [input.period.id],
        resolvability: "not_resolvable",
      }));
    }
    if (regime === null) {
      found.push(limitation({
        code: "UNSUPPORTED_VAT_REGIME",
        scope: "control",
        reason: input.profile.vatRegime === "unknown" ? "missing_field" : "unsupported_regime",
        message: `Le regime TVA ${input.profile.vatRegime} n'entre pas dans le perimetre du moteur (reel normal, mini-reel ou reel simplifie).`,
        requiredInputs: ["profile:vatRegime"],
        relatedIds: [input.profile.id],
        resolvability: input.profile.vatRegime === "unknown" ? "human_review" : "not_resolvable",
      }));
    }
    if (regime !== null) {
      const mapping = vatFormMappingFor(regime);
      const form = getTaxFormVintage(mapping.formNumber, input.period.formVintage);
      if (!form) {
        found.push(limitation({
          code: "UNSUPPORTED_VAT_FORM_VINTAGE",
          scope: "period",
          reason: "unsupported_millesime",
          message: `Aucun formulaire ${mapping.formNumber} n'est publie pour le millesime ${input.period.formVintage}.`,
          requiredInputs: [`form:${mapping.formNumber}:${input.period.formVintage}`],
          relatedIds: [input.period.id],
          capabilityStatus: "non_available",
          resolvability: "future_engine",
        }));
      }
    }
    if (frequency === null) {
      found.push(limitation({
        code: "UNSUPPORTED_VAT_FREQUENCY",
        scope: "period",
        reason: "unsupported_regime",
        message: `La periodicite ${input.period.frequency} n'est pas une periodicite declarative TVA du MVP.`,
        relatedIds: [input.period.id],
        resolvability: "not_resolvable",
      }));
    }
    if (input.profile.vatGroupStatus !== "none") {
      found.push(limitation({
        code: "VAT_GROUP_OUT_OF_SCOPE",
        scope: "control",
        reason: input.profile.vatGroupStatus === "unknown" ? "missing_field" : "unsupported_regime",
        message: "Le moteur ne traite qu'un assujetti isole, hors groupe TVA.",
        requiredInputs: ["profile:vatGroupStatus"],
        relatedIds: [input.profile.id],
        capabilityStatus: input.profile.vatGroupStatus === "unknown" ? "available" : "future",
        resolvability: input.profile.vatGroupStatus === "unknown" ? "human_review" : "future_engine",
      }));
    }
    // Un regime declare incoherent avec la periodicite fournie n'est pas arbitre
    // par le moteur : le reel simplifie declare annuellement (CA12).
    if (regime === "real_simplified" && frequency !== null && frequency !== "annual") {
      found.push(limitation({
        code: "REGIME_FREQUENCY_INCONSISTENT",
        scope: "period",
        reason: "inconsistent_declaration",
        message: `Le regime reel simplifie depose une CA12 annuelle ; la periodicite ${frequency} fournie est incoherente et n'est pas arbitree par le moteur.`,
        requiredInputs: ["profile:vatRegime", "period:frequency"],
        relatedIds: [input.period.id, input.profile.id],
        resolvability: "human_review",
      }));
    }
    if ((regime === "real_normal" || regime === "mini_real") && frequency === "annual") {
      found.push(limitation({
        code: "REGIME_FREQUENCY_INCONSISTENT",
        scope: "period",
        reason: "inconsistent_declaration",
        message: "Le reel normal et le mini-reel deposent une CA3 mensuelle ou trimestrielle ; une periodicite annuelle est incoherente.",
        requiredInputs: ["profile:vatRegime", "period:frequency"],
        relatedIds: [input.period.id, input.profile.id],
        resolvability: "human_review",
      }));
    }
    return found;
  }

  private buildPeriod(
    input: VatReconciliationInput,
    regime: VatRegime,
    frequency: VatFrequency,
  ): VatPeriod {
    const coverage = assessNormativeCoverage({
      startDate: input.period.startDate,
      endDate: input.period.endDate,
      requirements: ["taxPoint", "deduction", "invoicing", "filing"],
    });
    const body = {
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      taxPeriodId: input.period.id,
      startDate: input.period.startDate,
      endDate: input.period.endDate,
      frequency,
      regime,
      expectedFormNumber: vatFormMappingFor(regime).formNumber,
      formVintage: input.period.formVintage,
      normativeCoverage: coverage,
    };
    return Object.freeze({
      ...body,
      id: `vat-period:${input.period.id}`,
      canonicalJson: canonicalJson(body),
      contentHash: stableHash(body),
    }) as VatPeriod;
  }

  // -- Contrôles -----------------------------------------------------------

  private runControls(context: ControlContext, notes: VatNoteCollector): readonly VatControlResult[] {
    let results = [
      ...this.baseAndRateControls(context, notes),
      ...this.accountedControls(context),
      ...this.declarationControls(context, notes),
      ...this.signalControls(context, notes),
    ];
    // Une absence totale de FEC et de déclaration ne constitue jamais un
    // contrôle réussi « à zéro ». Les contrôles qui auraient conclu sur des
    // collections vides sont rabattus vers l'inconclusif, avec preuve
    // insuffisante. Cette garde est volontairement centrale afin qu'un futur
    // contrôle ne réintroduise pas ce faux positif par oubli.
    if (context.input.fecEntries.length === 0 && context.declaration.status !== "available") {
      results = results.map((control) => {
        if (!["passed", "confirmed_non_compliance", "reconciliation_difference", "potential_tax_risk"].includes(control.outcome)) {
          return control;
        }
        return this.result({
          controlId: control.controlId,
          title: control.title,
          outcome: "inconclusive",
          evidenceStrength: "insufficient",
          evidenceTier: "insufficient",
          detail: "Contrôle non conclu : aucune écriture FEC ni déclaration exploitable n'est fournie.",
          limitationIds: control.limitationIds,
          sourceRefs: control.sourceRefs,
        });
      });
    }
    return results.sort((left, right) => left.controlId.localeCompare(right.controlId));
  }

  /**
   * Vérifie qu'une source requise couvre toute la période. Renvoie la limitation
   * à porter, ou `null` si la couverture est complète.
   */
  private coverageGuard(
    context: ControlContext,
    controlId: string,
    requirements: readonly VatSourceRequirement[],
  ): TaxLimitation | null {
    const coverage = assessNormativeCoverage({
      startDate: context.period.startDate,
      endDate: context.period.endDate,
      requirements,
    });
    if (coverage.status === "covered") return null;
    const item = limitation({
      code: `VAT_SOURCE_NOT_COVERED:${controlId}`,
      scope: "control",
      reason: "unsupported_millesime",
      message: `Le controle ${controlId} depend de sources dont la couverture s'arrete le ${coverage.coveredThroughDate ?? "avant le debut de la periode"} ; la periode n'est pas couverte a partir du ${coverage.uncoveredFromDate}. Aucune version voisine n'est substituee.`,
      requiredInputs: coverage.expiringSourceVersionIds.map((id) => `source_version:${id}`),
      relatedIds: [context.period.id],
      capabilityStatus: "non_available",
      resolvability: "future_engine",
    });
    if (!context.limitations.some((existing) => existing.id === item.id)) {
      context.limitations.push(item);
    }
    return item;
  }

  private result(input: {
    readonly controlId: string;
    readonly title: string;
    readonly outcome: TaxControlOutcome;
    readonly evidenceStrength: EvidenceStrength;
    readonly evidenceTier: VatEvidenceTier;
    readonly detail: string;
    readonly observedCents?: CentAmount | null;
    readonly comparedCents?: CentAmount | null;
    readonly reconciliationLineIds?: readonly string[];
    readonly limitationIds?: readonly string[];
    readonly transactionIds?: readonly string[];
    readonly sourceRefs?: readonly TaxSourceRef[];
  }): VatControlResult {
    const observed = input.observedCents ?? null;
    const compared = input.comparedCents ?? null;
    const body = {
      controlId: input.controlId,
      title: input.title,
      outcome: input.outcome,
      evidenceStrength: input.evidenceStrength,
      evidenceTier: input.evidenceTier,
      detail: input.detail,
      observedCents: observed,
      comparedCents: compared,
      differenceCents: observed !== null && compared !== null
        ? subtractCents(observed, compared, input.controlId)
        : null,
      reconciliationLineIds: [...(input.reconciliationLineIds ?? [])].sort(),
      limitationIds: [...(input.limitationIds ?? [])].sort(),
      transactionIds: [...(input.transactionIds ?? [])].sort(),
      sourceRefs: [...(input.sourceRefs ?? [])],
    };
    return Object.freeze({ ...body, resultHash: stableHash(body) });
  }

  private reconciliationLine(context: ControlContext, options: {
    readonly lineKey: string;
    readonly label: string;
    readonly leftCents: CentAmount | null;
    readonly rightCents: CentAmount | null;
    readonly rightSnapshotId: string;
    readonly rightFieldCode: string | null;
    readonly normalizationNotes?: readonly string[];
  }): TaxReconciliationLine {
    const { input } = context;
    const comparable = options.leftCents !== null && options.rightCents !== null;
    const difference = comparable
      ? subtractCents(options.leftCents as CentAmount, options.rightCents as CentAmount, options.lineKey)
      : null;
    const line = createTaxReconciliationLine({
      id: `vat-line:${input.executionId}:${options.lineKey}`,
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      executionId: input.executionId,
      lineKey: options.lineKey,
      label: options.label,
      leftOperand: options.leftCents !== null
        ? { amountCents: options.leftCents, currency: "EUR", snapshotId: input.snapshotId, fieldCode: null }
        : null,
      rightOperand: options.rightCents !== null
        ? {
          amountCents: options.rightCents,
          currency: "EUR",
          snapshotId: options.rightSnapshotId,
          fieldCode: options.rightFieldCode,
        }
        : null,
      normalizationNotes: [...(options.normalizationNotes ?? [])],
      differenceAmountCents: difference,
      toleranceAmountCents: 0,
      toleranceFamily: "methodology",
      status: !comparable ? "missing_operand" : difference === 0 ? "matched" : "different",
      evidenceRefs: [],
      traceStepIds: ["step-rate-buckets"],
    });
    context.reconciliationLines.push(line);
    return line;
  }

  private baseAndRateControls(context: ControlContext, notes: VatNoteCollector): readonly VatControlResult[] {
    const results: VatControlResult[] = [];
    const declarationAvailable = context.declaration.status === "available";
    const tier: VatEvidenceTier = declarationAvailable ? "ledger_and_declaration" : "ledger_only";

    // 1. Bases HT par taux.
    const declaredNormalBase = context.declaration.normalRateBaseCents;
    const dominant = context.collectedBuckets.find((bucket) => bucket.status === "dominant");
    if (declaredNormalBase !== null && dominant) {
      const line = this.reconciliationLine(context, {
        lineKey: "vat_normal_rate_base",
        label: "Base HT au taux dominant : comptabilisee et declaree",
        leftCents: dominant.baseAmountCents,
        rightCents: declaredNormalBase,
        rightSnapshotId: context.declaration.id,
        rightFieldCode: "08",
        normalizationNotes: [
          "La case 08 de la CA3 porte la base au taux normal ; elle est comparee au taux constate dominant, ce qui suppose que ce taux soit le taux normal.",
        ],
      });
      results.push(this.result({
        controlId: "VAT.BASE.BY_RATE",
        title: "Bases HT par taux",
        outcome: line.status === "matched" ? "passed" : "reconciliation_difference",
        evidenceStrength: "corroborated",
        evidenceTier: tier,
        detail: `Base au taux dominant ${dominant.label} comparee a la case 08.`,
        observedCents: dominant.baseAmountCents,
        comparedCents: declaredNormalBase,
        reconciliationLineIds: [line.id],
        sourceRefs: context.declaration.sourceRefs,
      }));
    } else {
      results.push(this.result({
        controlId: "VAT.BASE.BY_RATE",
        title: "Bases HT par taux",
        outcome: "inconclusive",
        evidenceStrength: "derived",
        evidenceTier: tier,
        detail: context.declaration.regime === "real_simplified"
          ? "Le millesime publie de la CA12 n'expose aucune case de base HT : la ventilation declaree ne peut pas etre rapprochee."
          : "La base HT declaree n'est pas exploitable ; la ventilation par taux reste issue des seules ecritures.",
      }));
      notes.add({
        code: "DECLARED_BASE_PARTIAL",
        kind: "limitation",
        message: "Le millesime publie n'expose une base HT que pour le taux normal (CA3 case 08) et aucune pour la CA12 : la ventilation declaree par taux reste partielle.",
        relatedControlIds: ["VAT.BASE.BY_RATE"],
      });
    }

    // 2. TVA théorique par taux.
    const theoreticalDifference = subtractCents(
      context.collectedTheoreticalCents,
      context.collectedAccountedCents,
      "vat_theoretical_vs_accounted",
    );
    results.push(this.result({
      controlId: "VAT.THEORETICAL.BY_RATE",
      title: "TVA theorique par taux",
      outcome: theoreticalDifference === 0 ? "passed" : "reconciliation_difference",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: "TVA recalculee par application du taux constate a la base de chaque tranche, comparee a la TVA comptabilisee.",
      observedCents: context.collectedTheoreticalCents,
      comparedCents: context.collectedAccountedCents,
      transactionIds: context.collectedBuckets.flatMap((bucket) => bucket.transactionIds),
    }));

    // 10. Taux inhabituel.
    const outliers = [...context.collectedBuckets, ...context.deductibleBuckets]
      .filter((bucket) => bucket.status === "outlier");
    results.push(this.result({
      controlId: "VAT.RATE.UNUSUAL",
      title: "Taux inhabituel",
      outcome: outliers.length === 0 ? "passed" : "review_recommendation",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: outliers.length === 0
        ? "Aucun taux constate marginal au regard des autres taux du dossier."
        : `${outliers.length} taux constate(s) marginaux au regard des autres taux du dossier. Un taux atypique n'est pas une erreur : il appelle un examen.`,
      transactionIds: outliers.flatMap((bucket) => bucket.transactionIds),
    }));

    return results;
  }

  private accountedControls(context: ControlContext): readonly VatControlResult[] {
    const results: VatControlResult[] = [];

    // 3 et 4. TVA collectée et déductible comptabilisées.
    results.push(this.result({
      controlId: "VAT.COLLECTED.ACCOUNTED",
      title: "TVA collectee comptabilisee",
      outcome: "passed",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: "Total de la TVA collectee reconstruite depuis les ecritures. Estimation issue du FEC seul.",
      observedCents: context.collectedAccountedCents,
    }));
    results.push(this.result({
      controlId: "VAT.DEDUCTIBLE.ACCOUNTED",
      title: "TVA deductible comptabilisee",
      outcome: "passed",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: "Total de la TVA deductible reconstruite depuis les ecritures. Le droit a deduction n'est pas qualifie ici.",
      observedCents: context.deductibleAccountedCents,
    }));

    // 14. Sens anormal des comptes de TVA.
    const collectedAbnormal = context.collectedAccountBalanceCents < 0;
    const deductibleAbnormal = context.deductibleAccountBalanceCents < 0;
    const abnormal = collectedAbnormal || deductibleAbnormal;
    results.push(this.result({
      controlId: "VAT.ACCOUNT.ABNORMAL_BALANCE",
      title: "Compte de TVA au sens anormal",
      outcome: abnormal ? "review_recommendation" : "passed",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: abnormal
        ? `Sens inhabituel constate (collectee ${context.collectedAccountBalanceCents}, deductible ${context.deductibleAccountBalanceCents} centimes). Des avoirs ou regularisations peuvent l'expliquer ; aucune conclusion n'est tiree du seul numero de compte.`
        : "Les comptes de TVA presentent le sens attendu sur la periode.",
      observedCents: context.collectedAccountBalanceCents,
      comparedCents: context.deductibleAccountBalanceCents,
    }));

    return results;
  }

  private declarationControls(context: ControlContext, notes: VatNoteCollector): readonly VatControlResult[] {
    const results: VatControlResult[] = [];
    const declaration = context.declaration;
    const available = declaration.status === "available";
    const tier: VatEvidenceTier = available ? "ledger_and_declaration" : "ledger_only";

    // 5. TVA déclarée.
    if (!available) {
      const item = limitation({
        code: "VAT_DECLARATION_UNAVAILABLE",
        scope: "document",
        reason: "missing_document",
        message: `Aucune ${declaration.formNumber} exploitable pour la periode : l'absence de declaration n'est pas assimilee a une declaration a zero.`,
        requiredInputs: [`document:${declaration.formNumber}`],
        relatedIds: [context.period.id],
      });
      context.limitations.push(item);
      results.push(this.result({
        controlId: "VAT.DECLARED",
        title: "TVA declaree",
        outcome: "missing_information",
        evidenceStrength: "insufficient",
        evidenceTier: "ledger_only",
        detail: `La declaration ${declaration.formNumber} est ${declaration.status === "absent" ? "absente" : "illisible"}.`,
        limitationIds: [item.id],
      }));
      // Sans declaration, tous les rapprochements declaratifs sont inconclusive.
      for (const [controlId, title] of [
        ["VAT.NET", "TVA nette"],
        ["VAT.CREDIT", "Credit de TVA"],
        ["VAT.CREDIT.CARRYFORWARD", "Report de credit"],
        ["VAT.FORM.COHERENCE", "Coherence CA3/CA12 selon le regime"],
      ] as const) {
        results.push(this.result({
          controlId,
          title,
          outcome: "inconclusive",
          evidenceStrength: "insufficient",
          evidenceTier: "ledger_only",
          detail: "Rapprochement impossible sans declaration exploitable.",
          limitationIds: [item.id],
        }));
      }
      return results;
    }

    results.push(this.result({
      controlId: "VAT.DECLARED",
      title: "TVA declaree",
      outcome: "passed",
      evidenceStrength: "direct",
      evidenceTier: tier,
      detail: `Declaration ${declaration.formNumber} exploitable pour la periode.`,
      observedCents: declaration.grossVatCents,
      comparedCents: declaration.deductibleVatCents,
      sourceRefs: declaration.sourceRefs,
    }));

    // 6. TVA nette : comptabilisée vs déclarée.
    const netAccounted = subtractCents(
      context.collectedAccountedCents,
      context.deductibleAccountedCents,
      "vat_net",
    );
    const netLine = this.reconciliationLine(context, {
      lineKey: "vat_net",
      label: "TVA nette : comptabilisee et declaree",
      leftCents: netAccounted,
      rightCents: declaration.netDueCents,
      rightSnapshotId: declaration.id,
      rightFieldCode: vatFormMappingFor(declaration.regime).netDue,
      normalizationNotes: [
        "La TVA nette declaree peut integrer un report de credit anterieur que la difference comptable ne porte pas.",
      ],
    });
    results.push(this.result({
      controlId: "VAT.NET",
      title: "TVA nette",
      outcome: netLine.status === "matched"
        ? "passed"
        : netLine.status === "missing_operand"
          ? "inconclusive"
          : "reconciliation_difference",
      evidenceStrength: "corroborated",
      evidenceTier: tier,
      detail: "Difference entre TVA collectee et deductible comptabilisees, comparee a la TVA nette declaree.",
      observedCents: netAccounted,
      comparedCents: declaration.netDueCents,
      reconciliationLineIds: [netLine.id],
      sourceRefs: declaration.sourceRefs,
    }));

    // 7. Crédit de TVA : un net négatif doit se traduire par un crédit déclaré.
    const creditExpected = netAccounted < 0;
    const creditDeclared = declaration.creditCents;
    results.push(this.result({
      controlId: "VAT.CREDIT",
      title: "Credit de TVA",
      outcome: creditDeclared === null
        ? "inconclusive"
        : creditExpected === (creditDeclared > 0)
          ? "passed"
          : "reconciliation_difference",
      evidenceStrength: "corroborated",
      evidenceTier: tier,
      detail: creditExpected
        ? "La comptabilite fait ressortir une position crediteur ; la declaration doit porter un credit."
        : "La comptabilite ne fait pas ressortir de position crediteur.",
      observedCents: creditExpected ? -netAccounted : 0,
      comparedCents: creditDeclared,
      sourceRefs: declaration.sourceRefs,
    }));

    // 8. Report de crédit.
    const toCarry = creditToCarryCents(declaration, declaration.regime);
    results.push(this.result({
      controlId: "VAT.CREDIT.CARRYFORWARD",
      title: "Report de credit",
      outcome: toCarry === null && declaration.creditCarriedForwardCents === null
        ? "inconclusive"
        : "passed",
      evidenceStrength: "direct",
      evidenceTier: tier,
      detail: "Report recu et credit a reporter lus sur la declaration. La continuite avec la periode precedente releve de la synthese pluri-periodes.",
      observedCents: declaration.creditCarriedForwardCents,
      comparedCents: toCarry,
      sourceRefs: declaration.sourceRefs,
    }));
    notes.add({
      code: "CREDIT_CONTINUITY_OUT_OF_SCOPE",
      kind: "limitation",
      message: "La continuite du credit d'une periode a la suivante suppose la declaration precedente ; elle n'est pas verifiee par une execution mono-periode.",
      relatedControlIds: ["VAT.CREDIT.CARRYFORWARD"],
    });

    // 16. Cohérence interne du formulaire selon le régime.
    const mapping = vatFormMappingFor(declaration.regime);
    const internalExpected = declaration.grossVatCents !== null && declaration.deductibleVatCents !== null
      ? subtractCents(declaration.grossVatCents, declaration.deductibleVatCents, "vat_form_internal")
      : null;
    const formLine = this.reconciliationLine(context, {
      lineKey: "vat_form_coherence",
      label: `Coherence interne ${mapping.formNumber} : brute moins deductible et net declare`,
      leftCents: internalExpected,
      rightCents: declaration.netDueCents,
      rightSnapshotId: declaration.id,
      rightFieldCode: mapping.netDue,
      normalizationNotes: [
        `Relation publiee par le registre pour ${mapping.formNumber} : case ${mapping.grossVat} moins case ${mapping.deductibleVat}.`,
        "Le net declare peut integrer un report de credit : un ecart n'est pas necessairement une erreur.",
      ],
    });
    results.push(this.result({
      controlId: "VAT.FORM.COHERENCE",
      title: "Coherence CA3/CA12 selon le regime",
      outcome: formLine.status === "matched"
        ? "passed"
        : formLine.status === "missing_operand"
          ? "inconclusive"
          : "reconciliation_difference",
      evidenceStrength: "direct",
      evidenceTier: tier,
      detail: `Relation interne du formulaire ${mapping.formNumber} du millesime ${declaration.formVintage}.`,
      observedCents: internalExpected,
      comparedCents: declaration.netDueCents,
      reconciliationLineIds: [formLine.id],
      sourceRefs: declaration.sourceRefs,
    }));

    return results;
  }

  private signalControls(context: ControlContext, notes: VatNoteCollector): readonly VatControlResult[] {
    const results: VatControlResult[] = [];
    const withSignal = (signal: string) =>
      context.candidates.filter((candidate) => candidate.signals.includes(signal as never));

    // 9. Décalage de période — dépend du fait générateur (art. 269).
    const shiftGuard = this.coverageGuard(context, "VAT.PERIOD.SHIFT", ["taxPoint"]);
    const shifted = withSignal("period_shift_candidate");
    results.push(this.result({
      controlId: "VAT.PERIOD.SHIFT",
      title: "Decalage de periode",
      outcome: shiftGuard !== null
        ? "missing_information"
        : shifted.length === 0
          ? "passed"
          : "review_recommendation",
      evidenceStrength: shiftGuard !== null ? "insufficient" : "derived",
      evidenceTier: shiftGuard !== null ? "insufficient" : "ledger_only",
      detail: shiftGuard !== null
        ? "La qualification du fait generateur repose sur une source non couverte pour cette periode."
        : `${shifted.length} operation(s) dont la piece est datee hors periode. L'exigibilite reste a qualifier.`,
      transactionIds: shifted.map((candidate) => candidate.id),
      limitationIds: shiftGuard !== null ? [shiftGuard.id] : [],
    }));

    // 11. Doublons de pièces.
    const duplicates = withSignal("duplicate_piece_candidate");
    results.push(this.result({
      controlId: "VAT.PIECE.DUPLICATE",
      title: "Doublons de pieces",
      outcome: duplicates.length === 0 ? "passed" : "review_recommendation",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: duplicates.length === 0
        ? "Aucune reference de piece repetee a montant identique."
        : `${duplicates.length} operation(s) partagent reference et montant. Une refacturation legitime peut l'expliquer.`,
      transactionIds: duplicates.map((candidate) => candidate.id),
    }));

    // 12. Pièce absente — sans référentiel de pièces, aucune conclusion.
    const invoiceGuard = this.coverageGuard(context, "VAT.PIECE.MISSING", ["invoicing", "deduction"]);
    if (!context.invoiceRefsProvided) {
      results.push(this.result({
        controlId: "VAT.PIECE.MISSING",
        title: "Piece absente",
        outcome: "inconclusive",
        evidenceStrength: "insufficient",
        evidenceTier: "ledger_only",
        detail: "Aucun inventaire de pieces n'est fourni : le droit a deduction ne peut pas etre conclu. L'absence de piece dans PROBANT ne vaut pas absence de piece.",
        limitationIds: invoiceGuard !== null ? [invoiceGuard.id] : [],
      }));
      notes.add({
        code: "NO_INVOICE_INVENTORY",
        kind: "prudence",
        message: "Sans inventaire de pieces, le droit a deduction reste inconclusive : le moteur ne conclut pas a l'absence de facture.",
        relatedControlIds: ["VAT.PIECE.MISSING"],
      });
    } else {
      const missing = withSignal("missing_piece_reference")
        .filter((candidate) => candidate.direction === "deductible");
      results.push(this.result({
        controlId: "VAT.PIECE.MISSING",
        title: "Piece absente",
        outcome: invoiceGuard !== null
          ? "missing_information"
          : missing.length === 0
            ? "passed"
            : "potential_tax_risk",
        evidenceStrength: invoiceGuard !== null ? "insufficient" : "corroborated",
        // Un inventaire de pièces permet de constater l'absence, mais ne
        // justifie pas la déduction concernée. Le niveau « + facture » n'est
        // acquis que si toutes les opérations déductibles ont leur pièce.
        evidenceTier: invoiceGuard !== null
          ? "insufficient"
          : missing.length === 0
            ? "ledger_declaration_and_invoice"
            : "ledger_and_declaration",
        detail: missing.length === 0
          ? "Chaque operation deductible porte une reference presente dans l'inventaire de pieces."
          : `${missing.length} operation(s) deductibles sans piece correspondante dans l'inventaire fourni.`,
        transactionIds: missing.map((candidate) => candidate.id),
        limitationIds: invoiceGuard !== null ? [invoiceGuard.id] : [],
      }));
    }

    // 13. Écriture sans référence — obligation de facturation (art. 289).
    const referenceGuard = this.coverageGuard(context, "VAT.ENTRY.NO_REFERENCE", ["invoicing"]);
    const unreferenced = context.candidates.filter((candidate) => candidate.pieceRef === null);
    results.push(this.result({
      controlId: "VAT.ENTRY.NO_REFERENCE",
      title: "Ecriture sans reference de piece",
      outcome: referenceGuard !== null
        ? "missing_information"
        : unreferenced.length === 0
          ? "passed"
          : "review_recommendation",
      evidenceStrength: referenceGuard !== null ? "insufficient" : "derived",
      evidenceTier: referenceGuard !== null ? "insufficient" : "ledger_only",
      detail: referenceGuard !== null
        ? "L'obligation de facturation repose sur une source non couverte pour cette periode."
        : `${unreferenced.length} ecriture(s) de TVA sans reference de piece.`,
      transactionIds: unreferenced.map((candidate) => candidate.id),
      limitationIds: referenceGuard !== null ? [referenceGuard.id] : [],
    }));

    // 15. Opérations potentiellement autoliquidées.
    const reverseCharge = withSignal("reverse_charge_candidate");
    results.push(this.result({
      controlId: "VAT.REVERSE_CHARGE.CANDIDATE",
      title: "Operations potentiellement autoliquidees",
      outcome: reverseCharge.length === 0 ? "passed" : "review_recommendation",
      evidenceStrength: "derived",
      evidenceTier: "ledger_only",
      detail: reverseCharge.length === 0
        ? "Aucune ecriture ne presente simultanement TVA collectee et deductible de meme montant."
        : `${reverseCharge.length} ecriture(s) evoquent une autoliquidation. La qualification de l'operation reste humaine.`,
      transactionIds: reverseCharge.map((candidate) => candidate.id),
    }));

    return results;
  }

  // -- Sorties -------------------------------------------------------------

  private evidenceTier(
    declaration: VatDeclarationSnapshot,
    invoiceRefsProvided: boolean,
    candidates: readonly VatTransactionCandidate[],
  ): VatEvidenceTier {
    if (declaration.status !== "available") return "ledger_only";
    if (!invoiceRefsProvided) return "ledger_and_declaration";
    const deductibleWithoutEvidence = candidates.some((candidate) =>
      candidate.direction === "deductible" &&
      candidate.signals.includes("missing_piece_reference"));
    return deductibleWithoutEvidence
      ? "ledger_and_declaration"
      : "ledger_declaration_and_invoice";
  }

  private evidenceStrength(tier: VatEvidenceTier, outcome: TaxControlOutcome): EvidenceStrength {
    if (outcome === "missing_information") return "insufficient";
    switch (tier) {
      case "ledger_declaration_and_invoice": return "corroborated";
      case "ledger_and_declaration": return "corroborated";
      case "ledger_only": return "derived";
      case "insufficient": return "insufficient";
    }
  }

  /**
   * Ordre de priorité déterministe : une information manquante prime sur un
   * écart, qui prime sur une recommandation, qui prime sur un résultat neutre.
   */
  private resolveOutcome(controls: readonly VatControlResult[]): TaxControlOutcome {
    const has = (outcome: TaxControlOutcome) => controls.some((control) => control.outcome === outcome);
    if (has("missing_information")) return "missing_information";
    if (has("reconciliation_difference")) return "reconciliation_difference";
    if (has("potential_tax_risk")) return "potential_tax_risk";
    if (has("review_recommendation")) return "review_recommendation";
    if (has("inconclusive")) return "inconclusive";
    return "passed";
  }

  private blocked(options: {
    readonly input: VatReconciliationInput;
    readonly regime: VatRegime;
    readonly frequency: VatFrequency;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: VatNoteCollector;
    readonly trace: TraceRecorder;
  }): VatReconciliationResult {
    const { input } = options;
    const emptyDeclaration = readVatDeclaration({
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      vatPeriodId: `vat-period:${input.period.id}`,
      regime: options.regime,
      formVintage: input.period.formVintage,
      snapshots: [],
      snapshotId: `${input.snapshotId}:declaration`,
    });
    const period = this.buildPeriod(input, options.regime, options.frequency);
    return {
      snapshot: this.finalize({
        input,
        period,
        declaration: emptyDeclaration,
        regime: options.regime,
        frequency: options.frequency,
        status: "blocked",
        candidates: [],
        rateBuckets: [],
        collectedAccountedCents: 0,
        deductibleAccountedCents: 0,
        collectedTheoreticalCents: 0,
        netAccountedCents: 0,
        netDeclaredCents: null,
        controls: [],
        datasets: {
          salesByRate: buildSalesByRateDataset([]),
          comparison: buildComparisonDataset({
            collectedTheoreticalCents: 0,
            collectedAccountedCents: 0,
            deductibleAccountedCents: 0,
            declaration: emptyDeclaration,
          }),
          netWaterfall: buildNetWaterfallDataset({
            collectedAccountedCents: 0,
            deductibleAccountedCents: 0,
            declaration: emptyDeclaration,
          }),
          timeline: buildTimelineDataset({
            periodStart: input.period.startDate,
            periodEnd: input.period.endDate,
            frequency: options.frequency,
            collectedAccountedCents: 0,
            deductibleAccountedCents: 0,
            declaredNetCents: null,
            status: "declaration_absent",
          }),
          missingPieces: buildMissingPieceMatrix([]),
        },
        outcome: "missing_information",
        evidenceStrength: "insufficient",
        evidenceTier: "insufficient",
        limitations: options.limitations,
        notes: options.notes.all(),
        trace: options.trace.all(),
        reconciliationLineIds: [],
      }),
      reconciliationLines: [],
    };
  }

  private finalize(options: {
    readonly input: VatReconciliationInput;
    readonly period: VatPeriod;
    readonly declaration: VatDeclarationSnapshot;
    readonly regime: VatRegime;
    readonly frequency: VatFrequency;
    readonly status: "reconciled" | "blocked";
    readonly candidates: readonly VatTransactionCandidate[];
    readonly rateBuckets: readonly VatRateBucket[];
    readonly collectedAccountedCents: CentAmount;
    readonly deductibleAccountedCents: CentAmount;
    readonly collectedTheoreticalCents: CentAmount;
    readonly netAccountedCents: CentAmount;
    readonly netDeclaredCents: CentAmount | null;
    readonly controls: readonly VatControlResult[];
    readonly datasets: VatDatasets;
    readonly outcome: TaxControlOutcome;
    readonly evidenceStrength: EvidenceStrength;
    readonly evidenceTier: VatEvidenceTier;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: VatReconciliationSnapshot["notes"];
    readonly trace: readonly TaxTraceStep[];
    readonly reconciliationLineIds: readonly string[];
  }): VatReconciliationSnapshot {
    const { input } = options;
    const sourceRefs = [
      ...options.declaration.sourceRefs,
      ...options.period.normativeCoverage.sourceRefs,
    ];
    const deduped = new Map(sourceRefs.map((ref) => [`${ref.sourceVersionId}:${ref.locator}`, ref]));

    const body = {
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      vatPeriodId: options.period.id,
      taxPeriodId: input.period.id,
      taxType: "vat" as const,
      regime: options.regime,
      frequency: options.frequency,
      engineVersion: VAT_ENGINE_VERSION,
      calculationVersion: VAT_CALCULATION_VERSION,
      status: options.status,
      period: options.period,
      declaration: options.declaration,
      transactionCandidates: options.candidates,
      rateBuckets: [...options.rateBuckets].sort((left, right) => left.key.localeCompare(right.key)),
      collectedAccountedCents: options.collectedAccountedCents,
      deductibleAccountedCents: options.deductibleAccountedCents,
      collectedTheoreticalCents: options.collectedTheoreticalCents,
      netAccountedCents: options.netAccountedCents,
      netDeclaredCents: options.netDeclaredCents,
      controls: options.controls,
      reconciliationLineIds: [...options.reconciliationLineIds].sort(),
      datasets: options.datasets,
      outcome: options.outcome,
      evidenceStrength: options.evidenceStrength,
      evidenceTier: options.evidenceTier,
      limitations: [...options.limitations].sort((left, right) => left.id.localeCompare(right.id)),
      notes: options.notes,
      trace: options.trace,
      sourceRefs: [...deduped.values()].sort((left, right) =>
        `${left.sourceVersionId}:${left.locator}`.localeCompare(`${right.sourceVersionId}:${right.locator}`)),
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };

    const snapshot = {
      ...body,
      id: input.snapshotId,
      canonicalJson: canonicalJson(body),
      snapshotHash: stableHash(body),
    };

    // Les invariants de prudence sont verifies sur la sortie elle-meme : un
    // snapshot qui violerait « bloque sans limitation », « net derive des deux
    // totaux » ou « regime coherent avec le formulaire » ne sort pas du moteur.
    VatReconciliationSnapshotSchema.parse(snapshot);
    return Object.freeze(snapshot) as VatReconciliationSnapshot;
  }
}

export function reconcileVat(input: VatReconciliationInput): VatReconciliationResult {
  return new VatControlEngine().reconcile(input);
}

export const VAT_CONTROL_IDS = [
  "VAT.ACCOUNT.ABNORMAL_BALANCE",
  "VAT.BASE.BY_RATE",
  "VAT.COLLECTED.ACCOUNTED",
  "VAT.CREDIT",
  "VAT.CREDIT.CARRYFORWARD",
  "VAT.DECLARED",
  "VAT.DEDUCTIBLE.ACCOUNTED",
  "VAT.ENTRY.NO_REFERENCE",
  "VAT.FORM.COHERENCE",
  "VAT.NET",
  "VAT.PERIOD.SHIFT",
  "VAT.PIECE.DUPLICATE",
  "VAT.PIECE.MISSING",
  "VAT.RATE.UNUSUAL",
  "VAT.REVERSE_CHARGE.CANDIDATE",
  "VAT.THEORETICAL.BY_RATE",
] as const;
