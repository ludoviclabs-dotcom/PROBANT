/**
 * `CorporateTaxFindingFactory` — traduction du snapshot de calcul en constats.
 *
 * La fabrique produit des `TaxFindingDetails`, l'extension typee prevue par le
 * modele canonique. Le rattachement a un `Finding` generique (cloison, silo,
 * mesure) reste du ressort de TAX-07 : rien n'est invente ici.
 *
 * Deux garde-fous :
 *  - un constat ne peut porter qu'un `outcome` autorise par la definition du
 *    controle cite ; `confirmed_non_compliance` demeure hors MVP ;
 *  - un constat dont le controle n'existe pas dans le catalogue n'est pas emis.
 */
import type {
  TaxControlDefinition,
  TaxControlOutcome,
  TaxFindingDetails,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import { TAX_CONTROL_DEFINITIONS } from "../control-catalog";
import type { CorporateTaxSnapshot } from "./types";

export const CORPORATE_TAX_COMPUTATION_CONTROL_ID = "IS.COMPUTATION.RESULT_AND_TAX";
export const CORPORATE_TAX_REDUCED_RATE_CONTROL_ID = "IS.RATE.REDUCED.ELIGIBILITY";

export interface CorporateTaxFindingSeed {
  readonly code: string;
  readonly controlId: string;
  readonly outcome: TaxControlOutcome;
  readonly reconciliationLineIds: readonly string[];
  readonly limitationIds: readonly string[];
}

function definitionFor(
  definitions: readonly TaxControlDefinition[],
  controlId: string,
): TaxControlDefinition | undefined {
  return definitions.find((definition) => definition.controlId === controlId);
}

export class CorporateTaxFindingFactory {
  constructor(
    private readonly definitions: readonly TaxControlDefinition[] = TAX_CONTROL_DEFINITIONS,
  ) {}

  build(options: {
    readonly snapshot: CorporateTaxSnapshot;
    readonly reconciliationLines: readonly TaxReconciliationLine[];
    readonly executionId: string;
  }): readonly TaxFindingDetails[] {
    const { snapshot, reconciliationLines, executionId } = options;
    const seeds = this.seeds(snapshot, reconciliationLines);
    const details: TaxFindingDetails[] = [];

    for (const seed of seeds) {
      const definition = definitionFor(this.definitions, seed.controlId);
      if (!definition) continue;
      if (!definition.allowedOutcomes.includes(seed.outcome)) {
        throw new Error(`TAX_OUTCOME_NOT_ALLOWED_BY_CONTROL:${seed.controlId}:${seed.outcome}`);
      }
      details.push(Object.freeze({
        findingId: `corporate-tax-finding:${executionId}:${seed.code}`,
        executionId,
        domain: "tax" as const,
        taxType: "corporate_income_tax" as const,
        taxPeriodId: snapshot.taxPeriodId,
        outcome: seed.outcome,
        evidenceStrength: snapshot.evidenceStrength,
        controlId: definition.controlId,
        controlVersion: definition.controlVersion,
        documentSnapshotIds: [...new Set(
          snapshot.adjustmentLines.map((line) => line.origin.snapshotId),
        )].sort(),
        sourceVersionIds: [...new Set(
          snapshot.sourceRefs.map((ref) => ref.sourceVersionId),
        )].sort(),
        reconciliationLineIds: [...seed.reconciliationLineIds].sort(),
        adjustmentIds: snapshot.adjustmentLines
          .filter((line) => line.status === "candidate")
          .map((line) => line.id)
          .sort(),
        taxImpactStatus: snapshot.taxImpactStatus,
        limitationIds: [...seed.limitationIds].sort(),
        requiredReview: definition.reviewRequired,
      }));
    }

    return details.sort((left, right) => left.findingId.localeCompare(right.findingId));
  }

  private seeds(
    snapshot: CorporateTaxSnapshot,
    reconciliationLines: readonly TaxReconciliationLine[],
  ): readonly CorporateTaxFindingSeed[] {
    const seeds: CorporateTaxFindingSeed[] = [];
    const limitationIds = snapshot.limitations.map((item) => item.id);

    if (snapshot.status === "blocked") {
      return [{
        code: "computation-blocked",
        controlId: CORPORATE_TAX_COMPUTATION_CONTROL_ID,
        outcome: snapshot.outcome === "reconciliation_difference"
          ? "reconciliation_difference"
          : "missing_information",
        reconciliationLineIds: [],
        limitationIds,
      }];
    }

    const differing = reconciliationLines.filter((line) => line.status === "different");
    if (differing.length > 0) {
      seeds.push({
        code: "reconciliation-difference",
        controlId: CORPORATE_TAX_COMPUTATION_CONTROL_ID,
        outcome: "reconciliation_difference",
        reconciliationLineIds: differing.map((line) => line.id),
        limitationIds,
      });
    }

    const unknownEligibility = snapshot.brackets.some(
      (bracket) => bracket.eligibility.status === "unknown",
    );
    if (unknownEligibility) {
      seeds.push({
        code: "reduced-rate-eligibility-unknown",
        controlId: CORPORATE_TAX_REDUCED_RATE_CONTROL_ID,
        outcome: "missing_information",
        reconciliationLineIds: [],
        limitationIds: snapshot.limitations
          .filter((item) => item.code === "REDUCED_RATE_ELIGIBILITY_UNKNOWN")
          .map((item) => item.id),
      });
    }

    const capBreach = snapshot.limitations.find(
      (item) => item.code === "DEFICIT_OFFSET_ABOVE_LEGAL_CAP",
    );
    if (capBreach) {
      seeds.push({
        code: "deficit-offset-above-cap",
        controlId: CORPORATE_TAX_COMPUTATION_CONTROL_ID,
        outcome: "potential_tax_risk",
        reconciliationLineIds: [],
        limitationIds: [capBreach.id],
      });
    }

    if (seeds.length === 0) {
      seeds.push({
        code: "computation-passed",
        controlId: CORPORATE_TAX_COMPUTATION_CONTROL_ID,
        outcome: snapshot.outcome,
        reconciliationLineIds: reconciliationLines.map((line) => line.id),
        limitationIds,
      });
    }

    return seeds;
  }
}
