/**
 * `CfeReconciliationEngine` — module CFE (TAX-07-CFE).
 *
 * Ce moteur **rapproche**. Il ne recalcule aucune cotisation : le registre ne
 * publie ni base locative, ni taux communal, ni délibération, et le lot
 * l'interdit explicitement. L'abstention est tracée, pas seulement documentée.
 *
 * Il confronte l'avis — importé ou saisi — à la charge comptabilisée, aux
 * règlements, aux établissements du profil et à la période.
 */
import type {
  CentAmount,
  EvidenceStrength,
  FecEntry,
  TaxControlOutcome,
  TaxLimitation,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
  TaxSourceRef,
} from "@/lib/canonical-model";
import { canonicalJson, stableHash } from "@/lib/synthesis/canonical";
import { createTaxReconciliationLine } from "@/lib/tax";
import { assessCfeApplicability } from "./applicability";
import { readCfeLedger } from "./ledger";
import { CfeNoteCollector, CfeTraceRecorder } from "./trace";
import { CfeReconciliationSnapshotSchema } from "./schemas";
import type {
  CfeAccountMap,
  CfeApplicability,
  CfeCapability,
  CfeControlResult,
  CfeEstablishmentComparison,
  CfeLedgerPosition,
  CfeNotice,
  CfeReconciliationSnapshot,
} from "./types";

export const CFE_ENGINE_VERSION = "tax-07-cfe-reconciliation-1.0.0";
export const CFE_CALCULATION_VERSION = "2026.1.0";

/** Tolérance de rapprochement par défaut : aucune. */
export const DEFAULT_CFE_TOLERANCE_CENTS = 0;

const BLOCKED_CONCLUSIONS: readonly TaxControlOutcome[] = [
  "passed",
  "reconciliation_difference",
  "potential_tax_risk",
];

/** Doctrine CFE publiée : elle fonde l'applicabilité, jamais un montant. */
const CFE_SOURCE_REF: TaxSourceRef = {
  sourceId: "bofip-cfe",
  sourceVersionId: "bofip-cfe-v2026-04-29",
  locator: "BOI-IF-CFE-10-20-20, activites imposables",
};

export interface CfeReconciliationInput {
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly executionId: string;
  readonly snapshotId: string;
  readonly profile: TaxProfile;
  readonly period: TaxPeriod;
  readonly notices: readonly CfeNotice[];
  readonly fecEntries: readonly FecEntry[];
  readonly accountMap?: CfeAccountMap;
  /** Tolérance interne de rapprochement, en centimes. Jamais une tolérance légale. */
  readonly toleranceCents?: CentAmount;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface CfeReconciliationResult {
  readonly snapshot: CfeReconciliationSnapshot;
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
    id: `cfe-limitation:${input.code}`,
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

function sumCents(values: readonly CentAmount[]): CentAmount {
  return values.reduce((total, value) => total + value, 0);
}

export class CfeReconciliationEngine {
  reconcile(input: CfeReconciliationInput): CfeReconciliationResult {
    this.assertScope(input);
    const tolerance = input.toleranceCents ?? DEFAULT_CFE_TOLERANCE_CENTS;
    if (tolerance < 0) throw new Error("CFE_NEGATIVE_TOLERANCE");

    const notes = new CfeNoteCollector();
    const trace = new CfeTraceRecorder();
    const limitations: TaxLimitation[] = [];
    const reconciliationLines: TaxReconciliationLine[] = [];

    // Abstention tracée : elle précède tout le reste et n'est pas conditionnelle.
    trace.recordAbstention({
      id: "step-no-recomputation",
      reason: "Aucune base locative ni taux communal n'est publie par le registre : la cotisation n'est pas recalculee.",
      missingInputs: ["base_locative", "taux_communal", "deliberation_collectivite"],
    });
    limitations.push(limitation({
      code: "CFE_BASE_NOT_RECOMPUTABLE",
      scope: "control",
      reason: "unsupported_calculation",
      message: "La cotisation CFE n'est pas recalculee : base locative, taux communal et deliberations ne sont pas modelisees. Le module rapproche l'avis, il ne le reconstitue pas.",
      requiredInputs: ["base_locative", "taux_communal"],
      relatedIds: [input.period.id],
      capabilityStatus: "non_available",
      resolvability: "not_resolvable",
      // Cette limitation n'interdit pas de conclure sur un rapprochement :
      // elle interdit seulement de pretendre calculer.
      blockedOutcomes: [],
    }));
    notes.add({
      code: "NO_RECOMPUTATION",
      kind: "prudence",
      message: "Le module ne recalcule pas la CFE. Il confronte l'avis recu ou saisi a la comptabilite, aux etablissements et a la periode.",
    });

    const blocking = this.collectBlockingConditions(input);
    if (blocking.length > 0) {
      limitations.push(...blocking);
      return this.finalizeBlocked({ input, limitations, notes, trace });
    }

    const applicability = assessCfeApplicability({
      profile: input.profile,
      periodStartDate: input.period.startDate,
      periodEndDate: input.period.endDate,
    });
    trace.record({
      id: "step-applicability",
      operation: "assess_cfe_applicability",
      inputRefs: [input.profile.id, input.period.id],
      outputRef: "cfe_applicability",
      sourceRefs: [CFE_SOURCE_REF],
      inputs: {
        status: applicability.status,
        exemptionStatus: applicability.exemptionStatus,
        coverage: applicability.sourceCoverage.status,
      },
    });

    if (applicability.sourceCoverage.status !== "covered") {
      limitations.push(limitation({
        code: "CFE_DOCTRINE_NOT_COVERED",
        scope: "period",
        reason: "unsupported_millesime",
        message: `La doctrine CFE publiee ne couvre pas la periode a partir du ${applicability.sourceCoverage.uncoveredFromDate}. Aucune version voisine n'est substituee.`,
        requiredInputs: ["source:bofip-cfe"],
        relatedIds: [input.period.id],
        capabilityStatus: "non_available",
        resolvability: "future_engine",
      }));
    }

    const ledger = readCfeLedger({ entries: input.fecEntries, accountMap: input.accountMap });
    trace.record({
      id: "step-ledger",
      operation: "rebuild_cfe_positions_from_ledger",
      inputRefs: ["fec"],
      outputRef: "cfe_ledger_position",
      inputs: {
        chargeCents: ledger.chargeCents,
        settlementCents: ledger.settlementCents,
        candidateCount: ledger.candidates.length,
      },
    });

    const noticeTotalCents = this.noticeTotal(input.notices);
    const establishmentComparisons = this.compareEstablishments(input);
    const controls = this.runControls({
      input,
      applicability,
      ledger,
      noticeTotalCents,
      establishmentComparisons,
      tolerance,
      limitations,
      reconciliationLines,
      notes,
    });

    const capability = this.resolveCapability(input.notices, controls);
    const outcome = this.resolveOutcome(controls);

    return this.finalize({
      input,
      applicability,
      ledger,
      noticeTotalCents,
      establishmentComparisons,
      controls,
      capability,
      status: "reconciled",
      outcome,
      evidenceStrength: this.resolveEvidence(input.notices, outcome),
      limitations,
      notes: notes.all(),
      trace,
      reconciliationLineIds: reconciliationLines.map((line) => line.id),
      reconciliationLines,
    });
  }

  // -- Périmètre -----------------------------------------------------------

  private assertScope(input: CfeReconciliationInput): void {
    const scoped = [input.profile, input.period];
    if (scoped.some((item) =>
      item.organizationId !== input.organizationId ||
      item.dossierId !== input.dossierId ||
      item.entityId !== input.entityId)) {
      throw new Error("CFE_SCOPE_MISMATCH");
    }
    // Un avis importé doit citer son document ; un avis saisi doit citer sa
    // personne. Aucun avis n'entre sans porteur.
    for (const notice of input.notices) {
      if (notice.provenance === "imported_document" && notice.sourceDocumentId === null) {
        throw new Error(`CFE_IMPORTED_NOTICE_WITHOUT_DOCUMENT:${notice.id}`);
      }
      if (notice.capturedBy.trim().length === 0) {
        throw new Error(`CFE_NOTICE_WITHOUT_CAPTURER:${notice.id}`);
      }
    }
  }

  private collectBlockingConditions(input: CfeReconciliationInput): readonly TaxLimitation[] {
    const found: TaxLimitation[] = [];
    if (input.period.taxType !== "cfe") {
      found.push(limitation({
        code: "PERIOD_NOT_CFE",
        scope: "period",
        reason: "unsupported_regime",
        message: "La periode fournie ne releve pas de la CFE.",
        relatedIds: [input.period.id],
        resolvability: "not_resolvable",
      }));
    }
    return found;
  }

  // -- Rapprochements ------------------------------------------------------

  private noticeTotal(notices: readonly CfeNotice[]): CentAmount | null {
    if (notices.length === 0) return null;
    // Un seul avis illisible rend le total inconnu : il n'est pas remplace par
    // la somme partielle des autres.
    if (notices.some((notice) => notice.totalDueCents === null)) return null;
    return sumCents(notices.map((notice) => notice.totalDueCents as CentAmount));
  }

  private compareEstablishments(input: CfeReconciliationInput): readonly CfeEstablishmentComparison[] {
    const byId = new Map<string, CfeEstablishmentComparison>();

    for (const establishment of input.profile.establishments) {
      byId.set(establishment.establishmentId, {
        establishmentId: establishment.establishmentId,
        inProfile: true,
        inNotices: false,
        municipality: establishment.municipality,
        verificationStatus: establishment.verificationStatus,
        noticeTotalCents: null,
      });
    }

    for (const notice of input.notices) {
      const existing = byId.get(notice.establishmentId);
      const noticeTotal = notice.totalDueCents;
      if (existing) {
        byId.set(notice.establishmentId, {
          ...existing,
          inNotices: true,
          noticeTotalCents: noticeTotal === null
            ? existing.noticeTotalCents
            : (existing.noticeTotalCents ?? 0) + noticeTotal,
        });
        continue;
      }
      byId.set(notice.establishmentId, {
        establishmentId: notice.establishmentId,
        inProfile: false,
        inNotices: true,
        municipality: null,
        verificationStatus: "absent",
        noticeTotalCents: noticeTotal,
      });
    }

    return [...byId.values()].sort((left, right) =>
      left.establishmentId.localeCompare(right.establishmentId));
  }

  private control(input: {
    readonly controlId: string;
    readonly title: string;
    readonly outcome: TaxControlOutcome;
    readonly evidenceStrength: EvidenceStrength;
    readonly detail: string;
    readonly toleranceCents: CentAmount;
    readonly observedCents?: CentAmount | null;
    readonly comparedCents?: CentAmount | null;
    readonly reconciliationLineIds?: readonly string[];
    readonly limitationIds?: readonly string[];
    readonly sourceRefs?: readonly TaxSourceRef[];
  }): CfeControlResult {
    const observed = input.observedCents ?? null;
    const compared = input.comparedCents ?? null;
    const body = {
      controlId: input.controlId,
      title: input.title,
      outcome: input.outcome,
      evidenceStrength: input.evidenceStrength,
      detail: input.detail,
      observedCents: observed,
      comparedCents: compared,
      differenceCents: observed !== null && compared !== null ? observed - compared : null,
      toleranceCents: input.toleranceCents,
      reconciliationLineIds: [...(input.reconciliationLineIds ?? [])].sort(),
      limitationIds: [...(input.limitationIds ?? [])].sort(),
      sourceRefs: [...(input.sourceRefs ?? [])],
    };
    return Object.freeze({ ...body, resultHash: stableHash(body) });
  }

  private line(options: {
    readonly input: CfeReconciliationInput;
    readonly lineKey: string;
    readonly label: string;
    readonly leftCents: CentAmount | null;
    readonly rightCents: CentAmount | null;
    readonly tolerance: CentAmount;
    readonly rightSnapshotId: string;
    readonly normalizationNotes?: readonly string[];
    readonly collector: TaxReconciliationLine[];
  }): TaxReconciliationLine {
    const { input, leftCents, rightCents, tolerance } = options;
    const comparable = leftCents !== null && rightCents !== null;
    const difference = comparable ? (leftCents as CentAmount) - (rightCents as CentAmount) : null;
    const line = createTaxReconciliationLine({
      id: `cfe-line:${input.executionId}:${options.lineKey}`,
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      executionId: input.executionId,
      lineKey: options.lineKey,
      label: options.label,
      leftOperand: leftCents !== null
        ? { amountCents: leftCents, currency: "EUR", snapshotId: input.snapshotId, fieldCode: null }
        : null,
      rightOperand: rightCents !== null
        ? { amountCents: rightCents, currency: "EUR", snapshotId: options.rightSnapshotId, fieldCode: null }
        : null,
      normalizationNotes: [...(options.normalizationNotes ?? [])],
      differenceAmountCents: difference,
      toleranceAmountCents: tolerance,
      // Une tolérance de rapprochement reste interne : elle ne devient jamais
      // une tolérance légale.
      toleranceFamily: "internal",
      status: !comparable
        ? "missing_operand"
        : Math.abs(difference as number) <= tolerance ? "matched" : "different",
      evidenceRefs: [],
      traceStepIds: ["step-ledger"],
    });
    options.collector.push(line);
    return line;
  }

  private runControls(options: {
    readonly input: CfeReconciliationInput;
    readonly applicability: CfeApplicability;
    readonly ledger: CfeLedgerPosition;
    readonly noticeTotalCents: CentAmount | null;
    readonly establishmentComparisons: readonly CfeEstablishmentComparison[];
    readonly tolerance: CentAmount;
    readonly limitations: TaxLimitation[];
    readonly reconciliationLines: TaxReconciliationLine[];
    readonly notes: CfeNoteCollector;
  }): readonly CfeControlResult[] {
    const { input, applicability, ledger, noticeTotalCents, tolerance, limitations, notes } = options;
    const results: CfeControlResult[] = [];
    const noticesPresent = input.notices.length > 0;

    // 1. Disponibilité de l'avis.
    if (!noticesPresent) {
      const item = limitation({
        code: "CFE_NOTICE_UNAVAILABLE",
        scope: "document",
        reason: "missing_document",
        message: "Aucun avis de CFE n'est importe ni saisi : l'absence d'avis dans PROBANT ne vaut pas absence d'avis.",
        requiredInputs: ["document:tax_notice"],
        relatedIds: [input.period.id],
      });
      limitations.push(item);
      results.push(this.control({
        controlId: "CFE.NOTICE.AVAILABLE",
        title: "Avis de CFE disponible",
        outcome: "missing_information",
        evidenceStrength: "insufficient",
        detail: "Aucun avis n'a ete fourni pour la periode.",
        toleranceCents: tolerance,
        limitationIds: [item.id],
      }));
    } else {
      const unreadable = input.notices.filter((notice) => notice.totalDueCents === null);
      const item = unreadable.length > 0
        ? limitation({
          code: "CFE_NOTICE_TOTAL_UNREADABLE",
          scope: "field",
          reason: "missing_field",
          message: `Le total du est illisible sur ${unreadable.length} avis : aucun montant n'est suppose a sa place.`,
          requiredInputs: ["field:total_du"],
          relatedIds: unreadable.map((notice) => notice.id),
          resolvability: "human_review",
        })
        : null;
      if (item) limitations.push(item);
      results.push(this.control({
        controlId: "CFE.NOTICE.AVAILABLE",
        title: "Avis de CFE disponible",
        outcome: item ? "missing_information" : "passed",
        evidenceStrength: item ? "insufficient" : "direct",
        detail: item
          ? "Un avis au moins porte un total illisible."
          : `${input.notices.length} avis exploitable(s) pour la periode.`,
        toleranceCents: tolerance,
        observedCents: noticeTotalCents,
        limitationIds: item ? [item.id] : [],
        sourceRefs: [CFE_SOURCE_REF],
      }));

      // 2. Cohérence interne de chaque avis : lignes contre total.
      const inconsistent = input.notices.filter((notice) =>
        notice.totalDueCents !== null &&
        notice.lines.length > 0 &&
        sumCents(notice.lines.map((line) => line.amountCents)) !== notice.totalDueCents);
      results.push(this.control({
        controlId: "CFE.NOTICE.INTERNAL_CONSISTENCY",
        title: "Coherence interne de l'avis",
        outcome: inconsistent.length === 0 ? "passed" : "reconciliation_difference",
        evidenceStrength: "direct",
        detail: inconsistent.length === 0
          ? "Le detail de chaque avis totalise le montant du."
          : `${inconsistent.length} avis dont le detail ne totalise pas le montant du.`,
        toleranceCents: tolerance,
      }));
    }

    // 3. Avis contre charge comptabilisée.
    const noticeVsCharge = this.line({
      input,
      lineKey: "cfe_notice_vs_charge",
      label: "Avis de CFE et charge comptabilisee",
      leftCents: noticeTotalCents,
      rightCents: ledger.chargeCents,
      tolerance,
      rightSnapshotId: "fec",
      normalizationNotes: [
        "La charge comptabilisee peut inclure d'autres impots directs si le compte n'est pas dedie a la CFE.",
      ],
      collector: options.reconciliationLines,
    });
    results.push(this.control({
      controlId: "CFE.NOTICE.VS.CHARGE",
      title: "Avis et charge comptabilisee",
      outcome: noticeVsCharge.status === "matched"
        ? "passed"
        : noticeVsCharge.status === "missing_operand"
          ? "inconclusive"
          : "reconciliation_difference",
      evidenceStrength: noticeVsCharge.status === "missing_operand" ? "insufficient" : "corroborated",
      detail: "Total des avis confronte a la charge reconstruite depuis les ecritures.",
      toleranceCents: tolerance,
      observedCents: noticeTotalCents,
      comparedCents: ledger.chargeCents,
      reconciliationLineIds: [noticeVsCharge.id],
    }));

    // 4. Avis contre règlements.
    const noticeVsPayment = this.line({
      input,
      lineKey: "cfe_notice_vs_settlement",
      label: "Avis de CFE et reglements",
      leftCents: noticeTotalCents,
      rightCents: ledger.settlementCents,
      tolerance,
      rightSnapshotId: "fec",
      normalizationNotes: [
        "Un avis peut etre regle en plusieurs echeances, dont certaines hors periode : un ecart n'est pas necessairement une anomalie.",
      ],
      collector: options.reconciliationLines,
    });
    results.push(this.control({
      controlId: "CFE.NOTICE.VS.PAYMENT",
      title: "Avis et reglements",
      outcome: noticeVsPayment.status === "matched"
        ? "passed"
        : noticeVsPayment.status === "missing_operand"
          ? "inconclusive"
          : "review_recommendation",
      evidenceStrength: noticeVsPayment.status === "missing_operand" ? "insufficient" : "derived",
      detail: "Total des avis confronte aux decaissements rattaches a la CFE.",
      toleranceCents: tolerance,
      observedCents: noticeTotalCents,
      comparedCents: ledger.settlementCents,
      reconciliationLineIds: [noticeVsPayment.id],
    }));

    // 5. Charge contre règlement.
    const chargeVsPayment = this.line({
      input,
      lineKey: "cfe_charge_vs_settlement",
      label: "Charge comptabilisee et reglements",
      leftCents: ledger.chargeCents,
      rightCents: ledger.settlementCents,
      tolerance,
      rightSnapshotId: "fec",
      normalizationNotes: [
        "L'ecart entre charge et reglement correspond normalement a la dette restant a payer.",
      ],
      collector: options.reconciliationLines,
    });
    results.push(this.control({
      controlId: "CFE.CHARGE.VS.PAYMENT",
      title: "Charge et reglements",
      outcome: chargeVsPayment.status === "matched" ? "passed" : "review_recommendation",
      evidenceStrength: "derived",
      detail: "Difference entre charge et reglements, rapprochee du solde de dette.",
      toleranceCents: tolerance,
      observedCents: ledger.chargeCents,
      comparedCents: ledger.settlementCents,
      reconciliationLineIds: [chargeVsPayment.id],
    }));

    // 6. Cohérence des établissements.
    const noticeOnly = options.establishmentComparisons.filter((item) => item.inNotices && !item.inProfile);
    const profileOnly = options.establishmentComparisons.filter((item) => item.inProfile && !item.inNotices);
    const establishmentOutcome: TaxControlOutcome = noticeOnly.length > 0
      ? "reconciliation_difference"
      : profileOnly.length > 0
        ? "review_recommendation"
        : options.establishmentComparisons.length === 0
          ? "inconclusive"
          : "passed";
    results.push(this.control({
      controlId: "CFE.ESTABLISHMENT.COHERENCE",
      title: "Coherence des etablissements",
      outcome: establishmentOutcome,
      evidenceStrength: options.establishmentComparisons.length === 0 ? "insufficient" : "corroborated",
      detail: noticeOnly.length > 0
        ? `${noticeOnly.length} etablissement(s) present(s) sur un avis mais absent(s) du profil fiscal.`
        : profileOnly.length > 0
          ? `${profileOnly.length} etablissement(s) du profil sans avis rattache.`
          : options.establishmentComparisons.length === 0
            ? "Aucun etablissement n'est declare ni porte par un avis."
            : "Chaque etablissement du profil porte un avis et reciproquement.",
      toleranceCents: tolerance,
      sourceRefs: [CFE_SOURCE_REF],
    }));

    // 7. Cohérence des périodes.
    const mismatched = input.notices.filter((notice) =>
      notice.periodStartDate !== input.period.startDate ||
      notice.periodEndDate !== input.period.endDate ||
      notice.taxYear !== input.period.fiscalYear);
    results.push(this.control({
      controlId: "CFE.PERIOD.COHERENCE",
      title: "Coherence des periodes",
      outcome: !noticesPresent
        ? "inconclusive"
        : mismatched.length === 0 ? "passed" : "reconciliation_difference",
      evidenceStrength: noticesPresent ? "direct" : "insufficient",
      detail: !noticesPresent
        ? "Aucun avis a rapprocher de la periode."
        : mismatched.length === 0
          ? "Chaque avis porte exactement la periode et l'exercice controles."
          : `${mismatched.length} avis dont la periode ou l'exercice differe de la periode controlee.`,
      toleranceCents: tolerance,
    }));

    // 8. Cohérence de l'exonération.
    const exemptionOutcome: TaxControlOutcome = applicability.exemptionStatus === "unknown"
      ? "missing_information"
      : applicability.exemptionStatus === "claimed" && (noticeTotalCents ?? 0) > 0
        ? "reconciliation_difference"
        : "passed";
    const exemptionLimitation = applicability.exemptionStatus === "unknown"
      ? limitation({
        code: "CFE_EXEMPTION_STATUS_UNKNOWN",
        scope: "control",
        reason: "missing_field",
        message: "Le statut d'exoneration CFE n'est pas renseigne et verifie : ni l'assujettissement ni l'exoneration ne sont presumes.",
        requiredInputs: ["parameter:cfe_exemption"],
        relatedIds: [input.profile.id],
        resolvability: "human_review",
      })
      : null;
    if (exemptionLimitation) limitations.push(exemptionLimitation);
    results.push(this.control({
      controlId: "CFE.EXEMPTION.CONSISTENCY",
      title: "Coherence de l'exoneration",
      outcome: exemptionOutcome,
      evidenceStrength: applicability.exemptionStatus === "unknown" ? "insufficient" : "direct",
      detail: applicability.exemptionStatus === "claimed"
        ? "Une exoneration verifiee est declaree au profil fiscal."
        : applicability.exemptionStatus === "none"
          ? "Aucune exoneration n'est declaree."
          : "Le statut d'exoneration n'est pas etabli.",
      toleranceCents: tolerance,
      observedCents: noticeTotalCents,
      limitationIds: exemptionLimitation ? [exemptionLimitation.id] : [],
      sourceRefs: [CFE_SOURCE_REF],
    }));

    if (applicability.exemptionStatus === "claimed" && (noticeTotalCents ?? 0) > 0) {
      notes.add({
        code: "EXEMPTION_WITH_NOTICE",
        kind: "difference",
        message: "Une exoneration est declaree alors qu'un avis porte un montant du : la contradiction est signalee, elle n'est pas arbitree.",
        relatedControlIds: ["CFE.EXEMPTION.CONSISTENCY"],
      });
    }

    return results.sort((left, right) => left.controlId.localeCompare(right.controlId));
  }

  // -- Sorties -------------------------------------------------------------

  /**
   * Ce que le module a réellement fait. `reconcile` exige au moins un avis
   * exploitable confronté à la comptabilité ; sinon il ne peut que recommander
   * une revue.
   */
  private resolveCapability(
    notices: readonly CfeNotice[],
    controls: readonly CfeControlResult[],
  ): CfeCapability {
    const noticeControl = controls.find((control) => control.controlId === "CFE.NOTICE.AVAILABLE");
    if (notices.length === 0 || noticeControl?.outcome === "missing_information") {
      return "recommend_review";
    }
    return "reconcile";
  }

  private resolveOutcome(controls: readonly CfeControlResult[]): TaxControlOutcome {
    const has = (outcome: TaxControlOutcome) => controls.some((control) => control.outcome === outcome);
    if (has("missing_information")) return "missing_information";
    if (has("reconciliation_difference")) return "reconciliation_difference";
    if (has("potential_tax_risk")) return "potential_tax_risk";
    if (has("review_recommendation")) return "review_recommendation";
    if (has("inconclusive")) return "inconclusive";
    return "passed";
  }

  private resolveEvidence(
    notices: readonly CfeNotice[],
    outcome: TaxControlOutcome,
  ): EvidenceStrength {
    if (outcome === "missing_information") return "insufficient";
    if (notices.length === 0) return "derived";
    // Un avis confronté aux écritures est corroboré par deux sources.
    return "corroborated";
  }

  private finalizeBlocked(options: {
    readonly input: CfeReconciliationInput;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: CfeNoteCollector;
    readonly trace: CfeTraceRecorder;
  }): CfeReconciliationResult {
    const { input } = options;
    return this.finalize({
      input,
      applicability: assessCfeApplicability({
        profile: input.profile,
        periodStartDate: input.period.startDate,
        periodEndDate: input.period.endDate,
      }),
      ledger: { chargeCents: 0, settlementCents: 0, liabilityBalanceCents: 0, candidates: [] },
      noticeTotalCents: null,
      establishmentComparisons: [],
      controls: [],
      capability: "blocked",
      status: "blocked",
      outcome: "missing_information",
      evidenceStrength: "insufficient",
      limitations: options.limitations,
      notes: options.notes.all(),
      trace: options.trace,
      reconciliationLineIds: [],
      reconciliationLines: [],
    });
  }

  private finalize(options: {
    readonly input: CfeReconciliationInput;
    readonly applicability: CfeApplicability;
    readonly ledger: CfeLedgerPosition;
    readonly noticeTotalCents: CentAmount | null;
    readonly establishmentComparisons: readonly CfeEstablishmentComparison[];
    readonly controls: readonly CfeControlResult[];
    readonly capability: CfeCapability;
    readonly status: "reconciled" | "blocked";
    readonly outcome: TaxControlOutcome;
    readonly evidenceStrength: EvidenceStrength;
    readonly limitations: readonly TaxLimitation[];
    readonly notes: readonly CfeReconciliationSnapshot["notes"][number][];
    readonly trace: CfeTraceRecorder;
    readonly reconciliationLineIds: readonly string[];
    readonly reconciliationLines: readonly TaxReconciliationLine[];
  }): CfeReconciliationResult {
    const { input } = options;
    const body = {
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      entityId: input.entityId,
      taxPeriodId: input.period.id,
      taxType: "cfe" as const,
      taxYear: input.period.fiscalYear,
      engineVersion: CFE_ENGINE_VERSION,
      calculationVersion: CFE_CALCULATION_VERSION,
      status: options.status,
      capability: options.capability,
      applicability: options.applicability,
      notices: [...input.notices].sort((left, right) => left.id.localeCompare(right.id)),
      noticeTotalCents: options.noticeTotalCents,
      ledger: options.ledger,
      establishmentComparisons: options.establishmentComparisons,
      controls: options.controls,
      reconciliationLineIds: [...options.reconciliationLineIds].sort(),
      outcome: options.outcome,
      evidenceStrength: options.evidenceStrength,
      limitations: [...options.limitations].sort((left, right) => left.id.localeCompare(right.id)),
      notes: options.notes,
      trace: options.trace.all(),
      sourceRefs: [CFE_SOURCE_REF],
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
    // snapshot qui pretendrait calculer, ou conclurait sans limitation, ne sort
    // pas du moteur.
    CfeReconciliationSnapshotSchema.parse(snapshot);
    return {
      snapshot: Object.freeze(snapshot) as CfeReconciliationSnapshot,
      reconciliationLines: options.reconciliationLines,
    };
  }
}

export function reconcileCfe(input: CfeReconciliationInput): CfeReconciliationResult {
  return new CfeReconciliationEngine().reconcile(input);
}

export const CFE_CONTROL_IDS = [
  "CFE.CHARGE.VS.PAYMENT",
  "CFE.ESTABLISHMENT.COHERENCE",
  "CFE.EXEMPTION.CONSISTENCY",
  "CFE.NOTICE.AVAILABLE",
  "CFE.NOTICE.INTERNAL_CONSISTENCY",
  "CFE.NOTICE.VS.CHARGE",
  "CFE.NOTICE.VS.PAYMENT",
  "CFE.PERIOD.COHERENCE",
] as const;
