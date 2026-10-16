/**
 * Incidence fiscale d'un ajustement par comparaison de scenarios d'IS (C05 / C10).
 *
 * Aucun taux n'est applique ici : le meme moteur IS calcule le scenario de base puis
 * le scenario ou l'ajustement corrige le resultat, et l'incidence est la difference
 * des impots liquides (CGI art. 219, I et 1724 deja appliques par le moteur).
 *
 * Plusieurs ajustements : scenarios cumules, dans l'ordre des identifiants de constat.
 * L'incidence attribuee a chacun est la variation qu'il ajoute au scenario precedent ;
 * leur somme egale l'incidence conjointe, meme quand un ajustement franchit le plafond
 * du taux reduit. Seul l'impot de l'exercice est mesure : l'effet sur un deficit
 * reportable ou un impot differe n'est pas estime.
 */
import type { TaxSourceRef } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import type { TaxIncidenceAnswer, TaxIncidenceProvider, TaxIncidenceRequest } from "@/lib/synthesis/types";
import {
  CORPORATE_TAX_ENGINE_VERSION,
  computeCorporateTax,
  type CorporateTaxComputationInput,
  type CorporateTaxConfirmedAdjustment,
} from "./engine";
import type { CorporateTaxSnapshot } from "./types";

export const CORPORATE_TAX_SCENARIO_VERSION = "is-scenario-1.0.0";

/**
 * L'ajustement d'un scenario corrige le resultat comptable : l'article 38 fait du benefice net la base de
 * l'impot. La qualification « deductible » est une decision de revue, citee comme telle, pas une regle.
 */
const SCENARIO_SOURCE: TaxSourceRef = {
  sourceId: "cgi-art-38",
  sourceVersionId: "cgi-art-38-v2025-02-16",
  locator: "article 38, 1 et 2 (benefice net) ; qualification deductible : decision de revue",
};

export interface CorporateTaxScenarioStep {
  readonly findingId: string;
  readonly signedCents: number;
  /** Impot liquide du scenario cumule apres cet ajustement ; null si le scenario n'est pas calcule. */
  readonly liquidatedTaxCents: number | null;
  readonly snapshotHash: string;
  readonly answer: TaxIncidenceAnswer;
}

export interface CorporateTaxScenarioComparison {
  readonly version: string;
  readonly engineVersion: string;
  readonly base: { readonly liquidatedTaxCents: number | null; readonly snapshotHash: string; readonly status: CorporateTaxSnapshot["status"] };
  readonly steps: readonly CorporateTaxScenarioStep[];
  /** Incidence conjointe des ajustements calcules (somme des pas) ; null si aucun n'est calcule. */
  readonly totalIncidenceCents: number | null;
  readonly comparisonHash: string;
}

/** Motif d'indisponibilite d'un scenario, ou null s'il est exploitable. */
function unusable(snapshot: CorporateTaxSnapshot): string | null {
  if (snapshot.status !== "computed" || snapshot.liquidatedTaxCents === null) {
    const codes = snapshot.limitations.map((item) => item.code).join(", ");
    return `scénario d'IS non calculé par le moteur (${codes || "limitation"}) : incidence fiscale inconnue`;
  }
  if (snapshot.taxImpactStatus !== "computed") {
    return "scénario d'IS seulement estimé (éligibilité au taux réduit non établie) : incidence fiscale non chiffrée";
  }
  return null;
}

function scenarioAdjustment(base: CorporateTaxComputationInput, request: TaxIncidenceRequest): CorporateTaxConfirmedAdjustment {
  return {
    id: `scenario:${request.findingId}`,
    category: "unreconciled",
    direction: request.signedCents >= 0 ? "reintegration" : "deduction",
    label: `Scénario : correction du résultat proposée par le constat ${request.findingId}`,
    amountCents: Math.abs(request.signedCents),
    snapshotId: base.snapshotId,
    contentHash: stableHash({ findingId: request.findingId, signedCents: request.signedCents }),
    sourceRefs: [SCENARIO_SOURCE],
    evidenceRefs: [`finding:${request.findingId}`],
    reviewEventId: `qualification-deductible:${request.findingId}`,
  };
}

/**
 * Compare le scenario de base aux scenarios cumules. Un scenario non calcule rend indisponibles
 * l'ajustement qui l'ouvre et tous les suivants : l'attribution sequentielle n'a plus de base.
 */
export function compareCorporateTaxScenarios(
  base: CorporateTaxComputationInput,
  requests: readonly TaxIncidenceRequest[],
): CorporateTaxScenarioComparison {
  const ordered = [...requests].sort((left, right) => left.findingId.localeCompare(right.findingId));
  const baseSnapshot = computeCorporateTax(base).snapshot;
  const baseReason = unusable(baseSnapshot);
  const steps: CorporateTaxScenarioStep[] = [];
  let previous = baseReason === null ? baseSnapshot.liquidatedTaxCents : null;
  let blockedReason = baseReason;
  const added: CorporateTaxConfirmedAdjustment[] = [];
  for (const request of ordered) {
    if (!Number.isSafeInteger(request.signedCents) || request.signedCents === 0) {
      steps.push({ findingId: request.findingId, signedCents: request.signedCents, liquidatedTaxCents: null, snapshotHash: baseSnapshot.snapshotHash,
        answer: { status: "unavailable", reason: "ajustement nul ou non exprimé en centimes entiers : aucun scénario" } });
      continue;
    }
    added.push(scenarioAdjustment(base, request));
    const snapshot = computeCorporateTax({
      ...base,
      executionId: `${base.executionId}:scenario:${added.length}`,
      snapshotId: `${base.snapshotId}:scenario:${added.length}`,
      confirmedAdjustments: [...(base.confirmedAdjustments ?? []), ...added],
    }).snapshot;
    const reason = blockedReason ?? unusable(snapshot);
    if (reason !== null || previous === null) {
      blockedReason = reason ?? "scénario précédent non calculé : incidence fiscale inconnue";
      steps.push({ findingId: request.findingId, signedCents: request.signedCents, liquidatedTaxCents: null, snapshotHash: snapshot.snapshotHash,
        answer: { status: "unavailable", reason: blockedReason } });
      continue;
    }
    const liquidated = snapshot.liquidatedTaxCents as number;
    steps.push({ findingId: request.findingId, signedCents: request.signedCents, liquidatedTaxCents: liquidated, snapshotHash: snapshot.snapshotHash,
      answer: { status: "computed", taxCents: liquidated - previous } });
    previous = liquidated;
  }
  const computed = steps.flatMap((step) => (step.answer.status === "computed" ? [step.answer.taxCents] : []));
  const body = {
    version: CORPORATE_TAX_SCENARIO_VERSION,
    engineVersion: CORPORATE_TAX_ENGINE_VERSION,
    base: { liquidatedTaxCents: baseSnapshot.liquidatedTaxCents, snapshotHash: baseSnapshot.snapshotHash, status: baseSnapshot.status },
    steps,
    totalIncidenceCents: computed.length > 0 ? computed.reduce((total, value) => total + value, 0) : null,
  };
  return Object.freeze({ ...body, comparisonHash: stableHash(body) });
}

/** Fournisseur d'incidence fiscale pour la projection des effets (C05), adosse a un calcul d'IS de base. */
export function corporateTaxIncidenceProvider(base: CorporateTaxComputationInput): TaxIncidenceProvider {
  return {
    id: "c10_is_engine",
    version: `${CORPORATE_TAX_ENGINE_VERSION}+${CORPORATE_TAX_SCENARIO_VERSION}`,
    incidence(requests) {
      const comparison = compareCorporateTaxScenarios(base, requests);
      return {
        answers: new Map(comparison.steps.map((step) => [step.findingId, step.answer])),
        scenarioHash: comparison.steps.some((step) => step.answer.status === "computed") ? comparison.comparisonHash : null,
      };
    },
  };
}
