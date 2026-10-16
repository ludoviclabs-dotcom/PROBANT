import type { DossierSnapshot } from "@/lib/canonical-model";
import { reviewStageOf, reviewStatusMap } from "@/lib/synthesis/exposure";
import type { EffectReviewStage } from "@/lib/synthesis/types";

/**
 * Lecture de la revue pour les vues de la Synthèse : l'étape de chaque constat vient du dernier événement de revue
 * (sinon du statut porté), par la même fonction que le moteur (`reviewStageOf`). Aucune règle de revue n'est
 * redéfinie ici.
 */

export type ReviewStage = EffectReviewStage;

/** Mot de la revue : « validé » désigne un ajustement proposé, « corrigé » une correction comptabilisée. */
export const REVIEW_WORD: Record<ReviewStage, string> = {
  pending: "en attente",
  proposed: "validé",
  corrected: "corrigé",
  dismissed: "écarté",
};

export function reviewStageByFinding(snapshot: Pick<DossierSnapshot, "findings" | "reviewEvents">): Map<string, ReviewStage> {
  const statuses = reviewStatusMap(snapshot.findings, snapshot.reviewEvents);
  return new Map([...statuses].map(([id, status]) => [id, reviewStageOf(status)]));
}

export interface ReviewTally {
  total: number;
  pending: number;
  proposed: number;
  corrected: number;
  dismissed: number;
}

export function tallyReview(stages: ReadonlyMap<string, ReviewStage>): ReviewTally {
  const tally: ReviewTally = { total: stages.size, pending: 0, proposed: 0, corrected: 0, dismissed: 0 };
  for (const stage of stages.values()) tally[stage] += 1;
  return tally;
}
