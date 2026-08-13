
import type { Finding, StatutRevue } from "@/lib/canonical-model";
import type { ReviewEvent, ReviewEventStatus } from "./types";

export interface ReviewProgress {
  numerator: number;
  denominator: number;
  pct: number;
  includedStatuses: ReviewEventStatus[];
  excludedStatuses: ReviewEventStatus[];
}

const CLOSED_STATUSES: ReviewEventStatus[] = [
  "valide",
  "ecarte",
  "corrige",
  "confirmed",
  "dismissed",
  "corrected",
  "superseded",
];
const OPEN_STATUSES: ReviewEventStatus[] = [
  "en_attente",
  "pending",
  "needs_evidence",
];

export function calculateReviewProgress(
  statuses: ReviewEventStatus[],
): ReviewProgress {
  const denominator = statuses.length;
  const numerator = statuses.filter((status) => CLOSED_STATUSES.includes(status)).length;
  return {
    numerator,
    denominator,
    pct: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100),
    includedStatuses: CLOSED_STATUSES,
    excludedStatuses: OPEN_STATUSES,
  };
}

export function statusAfterReviewEvents(
  finding: Finding,
  events: ReviewEvent[],
): ReviewEventStatus {
  const last = events
    .filter((event) => event.findingId === finding.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  return last?.newStatus ?? finding.statutRevue;
}

export function calculateFindingsReviewProgress(
  findings: Finding[],
  events: ReviewEvent[],
): ReviewProgress {
  return calculateReviewProgress(findings.map((finding) => statusAfterReviewEvents(finding, events)));
}

export function toLegacyReviewStatus(status: ReviewEventStatus): StatutRevue {
  if (["corrige", "confirmed", "corrected", "superseded"].includes(status)) {
    return "valide";
  }
  if (status === "dismissed") return "ecarte";
  if (["pending", "needs_evidence"].includes(status)) return "en_attente";
  return status as StatutRevue;
}

