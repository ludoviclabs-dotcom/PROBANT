/**
 * `VatFindingFactory` — traduction d'une réconciliation TVA en constats.
 *
 * Comme en TAX-05, la fabrique produit des `TaxFindingDetails` : le rattachement
 * à un `Finding` générique (cloison, silo, mesure) reste du ressort de TAX-07.
 *
 * Deux garde-fous, dont un appris de la revue TAX-05 :
 *  - un constat ne porte qu'un `outcome` autorisé par la définition du contrôle
 *    cité — les contrôles du catalogue n'autorisent pas les mêmes issues, et un
 *    `potential_tax_risk` ne peut donc pas être rattaché au contrôle de
 *    rapprochement de formulaire ;
 *  - le contrôle est choisi selon le régime : le réel simplifié cite la
 *    définition CA12, jamais la définition CA3 dont les documents requis lui
 *    sont étrangers.
 */
import type {
  TaxControlDefinition,
  TaxControlOutcome,
  TaxFindingDetails,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import { TAX_CONTROL_DEFINITIONS } from "../control-catalog";
import type { VatReconciliationSnapshot, VatRegime } from "./types";

/** Contrôle de rapprochement déclaratif applicable à chaque régime. */
export const VAT_RECONCILIATION_CONTROL_IDS: Readonly<Record<VatRegime, string>> = {
  real_normal: "VAT.FORM.CA3.RECONCILIATION",
  mini_real: "VAT.FORM.CA3.RECONCILIATION",
  real_simplified: "VAT.FORM.CA12.RECONCILIATION",
};

/** Contrôle portant le droit à déduction et les pièces justificatives. */
export const VAT_DEDUCTIBLE_CONTROL_ID = "VAT.DEDUCTIBLE.SUPPORT";

export interface VatFindingSeed {
  readonly code: string;
  readonly controlId: string;
  readonly outcome: TaxControlOutcome;
  readonly engineControlIds: readonly string[];
  readonly reconciliationLineIds: readonly string[];
  readonly limitationIds: readonly string[];
}

/** Contrôles moteur relevant du droit à déduction et des pièces. */
const DEDUCTION_ENGINE_CONTROLS = new Set([
  "VAT.PIECE.MISSING",
  "VAT.DEDUCTIBLE.ACCOUNTED",
]);

function definitionFor(
  definitions: readonly TaxControlDefinition[],
  controlId: string,
): TaxControlDefinition | undefined {
  return definitions.find((definition) => definition.controlId === controlId);
}

export class VatFindingFactory {
  constructor(
    private readonly definitions: readonly TaxControlDefinition[] = TAX_CONTROL_DEFINITIONS,
  ) {}

  build(options: {
    readonly snapshot: VatReconciliationSnapshot;
    readonly reconciliationLines: readonly TaxReconciliationLine[];
    readonly executionId: string;
  }): readonly TaxFindingDetails[] {
    const { snapshot, reconciliationLines, executionId } = options;
    const details: TaxFindingDetails[] = [];

    for (const seed of this.seeds(snapshot, reconciliationLines)) {
      const definition = definitionFor(this.definitions, seed.controlId);
      if (!definition) continue;
      if (!definition.allowedOutcomes.includes(seed.outcome)) {
        throw new Error(`VAT_OUTCOME_NOT_ALLOWED_BY_CONTROL:${seed.controlId}:${seed.outcome}`);
      }
      details.push(Object.freeze({
        findingId: `vat-finding:${executionId}:${seed.code}`,
        executionId,
        domain: "tax" as const,
        taxType: "vat" as const,
        taxPeriodId: snapshot.taxPeriodId,
        outcome: seed.outcome,
        evidenceStrength: snapshot.evidenceStrength,
        controlId: definition.controlId,
        controlVersion: definition.controlVersion,
        documentSnapshotIds: snapshot.declaration.status === "available"
          ? [snapshot.declaration.id]
          : [],
        sourceVersionIds: [...new Set(snapshot.sourceRefs.map((ref) => ref.sourceVersionId))].sort(),
        reconciliationLineIds: [...seed.reconciliationLineIds].sort(),
        // Les opérations reconstruites depuis le FEC restent des candidats.
        adjustmentIds: snapshot.transactionCandidates
          .filter((candidate) => candidate.signals.length > 0)
          .map((candidate) => candidate.id)
          .sort(),
        taxImpactStatus: snapshot.status === "blocked" ? "not_computed" : "estimated",
        limitationIds: [...seed.limitationIds].sort(),
        requiredReview: definition.reviewRequired,
      }));
    }

    return details.sort((left, right) => left.findingId.localeCompare(right.findingId));
  }

  private seeds(
    snapshot: VatReconciliationSnapshot,
    reconciliationLines: readonly TaxReconciliationLine[],
  ): readonly VatFindingSeed[] {
    const seeds: VatFindingSeed[] = [];
    const reconciliationControlId = VAT_RECONCILIATION_CONTROL_IDS[snapshot.regime];
    const limitationIds = snapshot.limitations.map((item) => item.id);

    if (snapshot.status === "blocked") {
      return [{
        code: "reconciliation-blocked",
        controlId: reconciliationControlId,
        outcome: "missing_information",
        engineControlIds: [],
        reconciliationLineIds: [],
        limitationIds,
      }];
    }

    const byOutcome = (outcome: TaxControlOutcome, deduction: boolean) =>
      snapshot.controls.filter((control) =>
        control.outcome === outcome && DEDUCTION_ENGINE_CONTROLS.has(control.controlId) === deduction);

    const differing = byOutcome("reconciliation_difference", false);
    if (differing.length > 0) {
      seeds.push({
        code: "reconciliation-difference",
        controlId: reconciliationControlId,
        outcome: "reconciliation_difference",
        engineControlIds: differing.map((control) => control.controlId),
        reconciliationLineIds: reconciliationLines
          .filter((line) => line.status === "different")
          .map((line) => line.id),
        limitationIds,
      });
    }

    // `potential_tax_risk` n'est autorisé que par le contrôle de déduction.
    const risky = snapshot.controls.filter((control) => control.outcome === "potential_tax_risk");
    if (risky.length > 0) {
      seeds.push({
        code: "deduction-risk",
        controlId: VAT_DEDUCTIBLE_CONTROL_ID,
        outcome: "potential_tax_risk",
        engineControlIds: risky.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: risky.flatMap((control) => control.limitationIds),
      });
    }

    const missing = snapshot.controls.filter((control) => control.outcome === "missing_information");
    if (missing.length > 0) {
      seeds.push({
        code: "missing-information",
        controlId: reconciliationControlId,
        outcome: "missing_information",
        engineControlIds: missing.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: missing.flatMap((control) => control.limitationIds),
      });
    }

    const recommendations = byOutcome("review_recommendation", false);
    if (recommendations.length > 0) {
      seeds.push({
        code: "review-recommendation",
        controlId: reconciliationControlId,
        outcome: "review_recommendation",
        engineControlIds: recommendations.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: [],
      });
    }

    // Le droit à déduction non conclu appartient au contrôle de déduction.
    const inconclusiveDeduction = byOutcome("inconclusive", true);
    if (inconclusiveDeduction.length > 0) {
      seeds.push({
        code: "deduction-inconclusive",
        controlId: VAT_DEDUCTIBLE_CONTROL_ID,
        outcome: "inconclusive",
        engineControlIds: inconclusiveDeduction.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: inconclusiveDeduction.flatMap((control) => control.limitationIds),
      });
    }

    if (seeds.length === 0) {
      seeds.push({
        code: "reconciliation-passed",
        controlId: reconciliationControlId,
        outcome: snapshot.outcome === "passed" ? "passed" : "inconclusive",
        engineControlIds: snapshot.controls.map((control) => control.controlId),
        reconciliationLineIds: reconciliationLines.map((line) => line.id),
        limitationIds,
      });
    }

    return seeds;
  }
}
