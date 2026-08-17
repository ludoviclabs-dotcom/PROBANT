import type { Finding, StatutRevue } from "@/lib/canonical-model";
import { canonicalJson, sha256Hex, stableHash } from "@/lib/synthesis/canonical";
import type { ReviewEvent, ReviewEventAction, ReviewEventStatus } from "./types";

export const REVIEW_EVENT_STATUSES = [
  "pending",
  "needs_evidence",
  "confirmed",
  "dismissed",
  "corrected",
  "superseded",
] as const satisfies readonly ReviewEventStatus[];

export interface ReviewProgress {
  numerator: number;
  denominator: number;
  pct: number;
  includedStatuses: ReviewEventStatus[];
  excludedStatuses: ReviewEventStatus[];
}

export interface AppendReviewEventInput {
  id: string;
  organizationId?: string;
  dossierId: string;
  finding: Finding;
  action?: ReviewEventAction;
  actorId: string;
  actorRole: string;
  newStatus: ReviewEventStatus;
  comment?: string;
  relatedEvidenceIds?: string[];
  createdAt: string;
}

export interface ReviewChainVerification {
  valid: boolean;
  digest: string;
  orderedEvents: ReviewEvent[];
  errors: string[];
}

const CLOSED_STATUSES: ReviewEventStatus[] = [
  "confirmed",
  "dismissed",
  "corrected",
  "superseded",
];
const OPEN_STATUSES: ReviewEventStatus[] = ["pending", "needs_evidence"];
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

export function statusForReviewAction(
  action: ReviewEventAction,
  previousStatus: ReviewEventStatus,
): ReviewEventStatus {
  switch (action) {
    case "confirm": return "confirmed";
    case "dismiss":
    case "mark_not_applicable": return "dismissed";
    case "request_evidence": return "needs_evidence";
    case "correct": return "corrected";
    case "replace": return "superseded";
    case "mark_inconclusive": return "pending";
    case "attach_evidence": return previousStatus;
  }
}

function compareEvents(a: ReviewEvent, b: ReviewEvent): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function normalizeReviewStatus(
  status: ReviewEventStatus | StatutRevue | "corrige",
): ReviewEventStatus {
  switch (status) {
    case "valide":
      return "confirmed";
    case "ecarte":
      return "dismissed";
    case "corrige":
      return "corrected";
    case "en_attente":
      return "pending";
    default:
      return status;
  }
}

export function calculateReviewProgress(
  statuses: Array<ReviewEventStatus | StatutRevue | "corrige">,
): ReviewProgress {
  const normalized = statuses.map(normalizeReviewStatus);
  const denominator = normalized.length;
  const numerator = normalized.filter((status) => CLOSED_STATUSES.includes(status)).length;
  return {
    numerator,
    denominator,
    pct: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100),
    includedStatuses: CLOSED_STATUSES,
    excludedStatuses: OPEN_STATUSES,
  };
}

export function reviewEventHashPayload(
  event: Omit<ReviewEvent, "eventHash">,
): Omit<ReviewEvent, "eventHash"> {
  return {
    id: event.id,
    organizationId: event.organizationId,
    dossierId: event.dossierId,
    findingId: event.findingId,
    action: event.action,
    actorId: event.actorId,
    actorRole: event.actorRole,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    comment: event.comment,
    relatedEvidenceIds: [...event.relatedEvidenceIds].sort(),
    createdAt: event.createdAt,
    previousEventHash: event.previousEventHash,
  };
}

export function computeReviewEventHash(event: Omit<ReviewEvent, "eventHash">): string {
  return sha256Hex(canonicalJson(reviewEventHashPayload(event)));
}

/**
 * Reconstruit l'ordre depuis les pointeurs de hash. L'ordre du tableau et les
 * horloges ne sont jamais pris comme preuve de succession.
 */
export function verifyReviewEventChain(events: ReviewEvent[]): ReviewChainVerification {
  if (events.length === 0) {
    return { valid: true, digest: stableHash([]), orderedEvents: [], errors: [] };
  }

  const errors: string[] = [];
  const byHash = new Map<string, ReviewEvent>();
  const children = new Map<string | null, ReviewEvent[]>();
  for (const event of events) {
    if (!HASH_PATTERN.test(event.eventHash)) errors.push(`EVENT_HASH_INVALID:${event.id}`);
    if (byHash.has(event.eventHash)) errors.push(`EVENT_HASH_DUPLICATE:${event.id}`);
    byHash.set(event.eventHash, event);
    const siblings = children.get(event.previousEventHash) ?? [];
    siblings.push(event);
    children.set(event.previousEventHash, siblings);
    if (computeReviewEventHash(event) !== event.eventHash) {
      errors.push(`EVENT_HASH_MISMATCH:${event.id}`);
    }
  }

  const roots = children.get(null) ?? [];
  if (roots.length !== 1) errors.push(`EVENT_CHAIN_ROOT_COUNT:${roots.length}`);
  const orderedEvents: ReviewEvent[] = [];
  const visited = new Set<string>();
  let current = roots.sort(compareEvents)[0];
  while (current && !visited.has(current.eventHash)) {
    orderedEvents.push(current);
    visited.add(current.eventHash);
    const next = children.get(current.eventHash) ?? [];
    if (next.length > 1) errors.push(`EVENT_CHAIN_FORK:${current.eventHash}`);
    current = next.sort(compareEvents)[0];
  }
  if (orderedEvents.length !== events.length) {
    errors.push(`EVENT_CHAIN_DISCONNECTED:${events.length - orderedEvents.length}`);
  }

  const statusByFinding = new Map<string, ReviewEventStatus>();
  for (const event of orderedEvents) {
    const previous = statusByFinding.get(event.findingId);
    if (previous && previous !== event.previousStatus) {
      errors.push(`EVENT_STATUS_DISCONTINUITY:${event.id}`);
    }
    statusByFinding.set(event.findingId, event.newStatus);
  }

  return {
    valid: errors.length === 0,
    digest: stableHash(orderedEvents.map((event) => event.eventHash)),
    orderedEvents,
    errors,
  };
}

export function reviewEventsDigest(events: ReviewEvent[]): string {
  const verification = verifyReviewEventChain(events);
  if (!verification.valid) {
    throw new Error(`REVIEW_EVENT_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  return verification.digest;
}

export function statusAfterReviewEvents(
  finding: Finding,
  events: ReviewEvent[],
): ReviewEventStatus {
  const verification = verifyReviewEventChain(events);
  if (!verification.valid) {
    throw new Error(`REVIEW_EVENT_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  const last = verification.orderedEvents
    .filter((event) => event.findingId === finding.id)
    .at(-1);
  return last?.newStatus ?? normalizeReviewStatus(finding.statutRevue);
}

export function appendReviewEvent(
  events: ReviewEvent[],
  input: AppendReviewEventInput,
  validEvidenceIds?: ReadonlySet<string>,
): ReviewEvent[] {
  if (input.finding.id.length === 0 || input.finding.id !== input.finding.id.trim()) {
    throw new Error("REVIEW_FINDING_ID_INVALID");
  }
  if (input.finding.id === input.id) throw new Error("REVIEW_EVENT_ID_COLLISION");
  if (events.some((event) => event.id === input.id)) throw new Error("REVIEW_EVENT_ID_DUPLICATE");
  if (!REVIEW_EVENT_STATUSES.includes(input.newStatus)) throw new Error("REVIEW_STATUS_INVALID");
  if (!input.actorId.trim() || !input.actorRole.trim()) throw new Error("REVIEW_ACTOR_REQUIRED");
  if (Number.isNaN(Date.parse(input.createdAt))) throw new Error("REVIEW_CREATED_AT_INVALID");

  const verification = verifyReviewEventChain(events);
  if (!verification.valid) {
    throw new Error(`REVIEW_EVENT_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  if (verification.orderedEvents.some((event) => event.dossierId !== input.dossierId)) {
    throw new Error("REVIEW_DOSSIER_CHAIN_MISMATCH");
  }
  if (input.organizationId && verification.orderedEvents.some((event) =>
    event.organizationId !== undefined && event.organizationId !== input.organizationId)) {
    throw new Error("REVIEW_ORGANIZATION_CHAIN_MISMATCH");
  }

  const relatedEvidenceIds = [...new Set(input.relatedEvidenceIds ?? [])].sort();
  if (validEvidenceIds) {
    const invalid = relatedEvidenceIds.filter((id) => !validEvidenceIds.has(id));
    if (invalid.length > 0) throw new Error(`REVIEW_EVIDENCE_UNKNOWN:${invalid.join(",")}`);
  }
  const previousStatus = statusAfterReviewEvents(input.finding, verification.orderedEvents);
  if (input.action && statusForReviewAction(input.action, previousStatus) !== input.newStatus) {
    throw new Error("REVIEW_ACTION_STATUS_MISMATCH");
  }
  const previousEventHash = verification.orderedEvents.at(-1)?.eventHash ?? null;
  const unsigned: Omit<ReviewEvent, "eventHash"> = {
    id: input.id,
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    findingId: input.finding.id,
    action: input.action,
    actorId: input.actorId.trim(),
    actorRole: input.actorRole.trim(),
    previousStatus,
    newStatus: input.newStatus,
    comment: input.comment?.trim() ?? "",
    relatedEvidenceIds,
    createdAt: input.createdAt,
    previousEventHash,
  };
  const event: ReviewEvent = { ...unsigned, eventHash: computeReviewEventHash(unsigned) };
  return [...verification.orderedEvents, event];
}

export function calculateFindingsReviewProgress(
  findings: Finding[],
  events: ReviewEvent[],
): ReviewProgress {
  return calculateReviewProgress(findings.map((finding) => statusAfterReviewEvents(finding, events)));
}

export function toLegacyReviewStatus(status: ReviewEventStatus): StatutRevue {
  if (["confirmed", "corrected", "superseded"].includes(status)) return "valide";
  if (status === "dismissed") return "ecarte";
  return "en_attente";
}
