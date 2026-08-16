/**
 * `CfeFindingFactory` — traduction d'un rapprochement CFE en constats.
 *
 * Comme pour les autres moteurs fiscaux, la fabrique produit des
 * `TaxFindingDetails` : le rattachement à un `Finding` générique reste du
 * ressort de TAX-07 synthèse.
 *
 * Le garde-fou hérité des revues précédentes est conservé : un constat ne porte
 * qu'un `outcome` autorisé par la définition du contrôle cité, et le contrôle
 * CFE n'autorise ni `confirmed_non_compliance` ni `potential_tax_risk` — ce
 * dernier supposerait un montant de référence que le module ne calcule pas.
 */
import type {
  TaxControlDefinition,
  TaxControlOutcome,
  TaxFindingDetails,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import { TAX_CONTROL_DEFINITIONS } from "@/lib/tax";
import type { CfeReconciliationSnapshot } from "./types";

export const CFE_RECONCILIATION_CONTROL_ID = "CFE.NOTICE.RECONCILIATION";

export interface CfeFindingSeed {
  readonly code: string;
  readonly outcome: TaxControlOutcome;
  readonly engineControlIds: readonly string[];
  readonly reconciliationLineIds: readonly string[];
  readonly limitationIds: readonly string[];
}

function definitionFor(
  definitions: readonly TaxControlDefinition[],
  controlId: string,
): TaxControlDefinition | undefined {
  return definitions.find((definition) => definition.controlId === controlId);
}

export class CfeFindingFactory {
  constructor(
    private readonly definitions: readonly TaxControlDefinition[] = TAX_CONTROL_DEFINITIONS,
  ) {}

  build(options: {
    readonly snapshot: CfeReconciliationSnapshot;
    readonly reconciliationLines: readonly TaxReconciliationLine[];
    readonly executionId: string;
  }): readonly TaxFindingDetails[] {
    const { snapshot, reconciliationLines, executionId } = options;
    const definition = definitionFor(this.definitions, CFE_RECONCILIATION_CONTROL_ID);
    if (!definition) return [];

    const details: TaxFindingDetails[] = [];
    for (const seed of this.seeds(snapshot, reconciliationLines)) {
      if (!definition.allowedOutcomes.includes(seed.outcome)) {
        throw new Error(`CFE_OUTCOME_NOT_ALLOWED_BY_CONTROL:${CFE_RECONCILIATION_CONTROL_ID}:${seed.outcome}`);
      }
      details.push(Object.freeze({
        findingId: `cfe-finding:${executionId}:${seed.code}`,
        executionId,
        domain: "tax" as const,
        taxType: "cfe" as const,
        taxPeriodId: snapshot.taxPeriodId,
        outcome: seed.outcome,
        evidenceStrength: snapshot.evidenceStrength,
        controlId: definition.controlId,
        controlVersion: definition.controlVersion,
        documentSnapshotIds: [...new Set(
          snapshot.notices
            .map((notice) => notice.sourceDocumentId)
            .filter((id): id is string => id !== null),
        )].sort(),
        sourceVersionIds: [...new Set(snapshot.sourceRefs.map((ref) => ref.sourceVersionId))].sort(),
        reconciliationLineIds: [...seed.reconciliationLineIds].sort(),
        adjustmentIds: [],
        // Le module ne calcule jamais : l'impact fiscal n'est pas chiffré par lui.
        taxImpactStatus: "not_computed",
        limitationIds: [...seed.limitationIds].sort(),
        requiredReview: definition.reviewRequired,
      }));
    }

    return details.sort((left, right) => left.findingId.localeCompare(right.findingId));
  }

  private seeds(
    snapshot: CfeReconciliationSnapshot,
    reconciliationLines: readonly TaxReconciliationLine[],
  ): readonly CfeFindingSeed[] {
    const limitationIds = snapshot.limitations.map((item) => item.id);

    if (snapshot.status === "blocked") {
      return [{
        code: "reconciliation-blocked",
        outcome: "missing_information",
        engineControlIds: [],
        reconciliationLineIds: [],
        limitationIds,
      }];
    }

    const seeds: CfeFindingSeed[] = [];
    const byOutcome = (outcome: TaxControlOutcome) =>
      snapshot.controls.filter((control) => control.outcome === outcome);

    const differing = byOutcome("reconciliation_difference");
    if (differing.length > 0) {
      seeds.push({
        code: "reconciliation-difference",
        outcome: "reconciliation_difference",
        engineControlIds: differing.map((control) => control.controlId),
        reconciliationLineIds: reconciliationLines
          .filter((line) => line.status === "different")
          .map((line) => line.id),
        limitationIds,
      });
    }

    const missing = byOutcome("missing_information");
    if (missing.length > 0) {
      seeds.push({
        code: "missing-information",
        outcome: "missing_information",
        engineControlIds: missing.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: missing.flatMap((control) => control.limitationIds),
      });
    }

    const recommendations = byOutcome("review_recommendation");
    if (recommendations.length > 0) {
      seeds.push({
        code: "review-recommendation",
        outcome: "review_recommendation",
        engineControlIds: recommendations.map((control) => control.controlId),
        reconciliationLineIds: [],
        limitationIds: [],
      });
    }

    if (seeds.length === 0) {
      seeds.push({
        code: "reconciliation-passed",
        outcome: snapshot.outcome === "passed" ? "passed" : "inconclusive",
        engineControlIds: snapshot.controls.map((control) => control.controlId),
        reconciliationLineIds: reconciliationLines.map((line) => line.id),
        limitationIds,
      });
    }

    return seeds;
  }
}
