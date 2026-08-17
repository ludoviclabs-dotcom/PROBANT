import type {
  FiscalSynthesisSnapshot,
  ReviewEvent,
  ReviewEventStatus,
} from "@/lib/canonical-model";
import {
  computeReviewEventHash,
  reviewEventsDigest,
  statusForReviewAction,
  verifyReviewEventChain,
} from "@/lib/dossier/review";
import { createFiscalSynthesisSnapshot } from "@/lib/tax/canonical";
import type {
  TaxFindingDecision,
  TaxReviewEventInput,
  TaxReviewProjection,
} from "./tax-types";

function assertTaxEventScope(
  events: readonly ReviewEvent[],
  organizationId: string,
  dossierId: string,
): void {
  if (events.some((event) =>
    (event.organizationId !== undefined && event.organizationId !== organizationId) ||
    event.dossierId !== dossierId)) {
    throw new Error("TAX_REVIEW_SCOPE_MISMATCH");
  }
}

function latestStatus(events: readonly ReviewEvent[], findingId: string): ReviewEventStatus {
  return [...events].reverse().find((event) => event.findingId === findingId)?.newStatus ?? "pending";
}

/**
 * Ajoute une action fiscale au journal append-only générique.
 *
 * La chaîne reste globale au dossier : une action sur un second constat pointe
 * vers le dernier événement du dossier, pas seulement vers le dernier événement
 * de ce constat. L'organisation et l'action sont incluses dans `eventHash`.
 */
export function appendTaxReviewEvent(
  events: readonly ReviewEvent[],
  input: TaxReviewEventInput,
  validEvidenceIds?: ReadonlySet<string>,
): readonly ReviewEvent[] {
  if (!input.organizationId.trim() || !input.dossierId.trim()) {
    throw new Error("TAX_REVIEW_SCOPE_REQUIRED");
  }
  if (!input.findingId.trim() || !input.actorId.trim() || !input.actorRole.trim()) {
    throw new Error("TAX_REVIEW_REQUIRED_FIELD_MISSING");
  }
  if (events.some((event) => event.id === input.id)) {
    throw new Error("TAX_REVIEW_EVENT_ID_DUPLICATE");
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error("TAX_REVIEW_CREATED_AT_INVALID");
  }

  const verification = verifyReviewEventChain([...events]);
  if (!verification.valid) {
    throw new Error(`TAX_REVIEW_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  assertTaxEventScope(verification.orderedEvents, input.organizationId, input.dossierId);

  const relatedEvidenceIds = [...new Set(input.relatedEvidenceIds ?? [])].sort();
  if (input.action === "attach_evidence" && relatedEvidenceIds.length === 0) {
    throw new Error("TAX_REVIEW_ATTACHMENT_REQUIRED");
  }
  if (validEvidenceIds) {
    const unknown = relatedEvidenceIds.filter((id) => !validEvidenceIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`TAX_REVIEW_EVIDENCE_UNKNOWN:${unknown.join(",")}`);
    }
  }
  if (["correct", "replace"].includes(input.action) && !input.comment?.trim()) {
    throw new Error("TAX_REVIEW_COMMENT_REQUIRED");
  }

  const previousStatus = latestStatus(verification.orderedEvents, input.findingId);
  const newStatus = statusForReviewAction(input.action, previousStatus);
  const unsigned: Omit<ReviewEvent, "eventHash"> = {
    id: input.id,
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    findingId: input.findingId,
    action: input.action,
    actorId: input.actorId.trim(),
    actorRole: input.actorRole.trim(),
    previousStatus,
    newStatus,
    comment: input.comment?.trim() ?? "",
    relatedEvidenceIds,
    createdAt: input.createdAt,
    previousEventHash: verification.orderedEvents.at(-1)?.eventHash ?? null,
  };
  const event: ReviewEvent = { ...unsigned, eventHash: computeReviewEventHash(unsigned) };
  return [...verification.orderedEvents, event];
}

export function buildTaxReviewProjection(
  events: readonly ReviewEvent[],
  organizationId: string,
  dossierId: string,
): TaxReviewProjection {
  const verification = verifyReviewEventChain([...events]);
  if (!verification.valid) {
    throw new Error(`TAX_REVIEW_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  assertTaxEventScope(verification.orderedEvents, organizationId, dossierId);
  const latest = new Map<string, ReviewEvent>();
  for (const event of verification.orderedEvents) latest.set(event.findingId, event);
  return {
    events: verification.orderedEvents,
    decisionByFinding: Object.fromEntries(
      [...latest.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([findingId, event]) => [findingId, event.action ?? "pending"]),
    ) as Readonly<Record<string, TaxFindingDecision>>,
    statusByFinding: Object.fromEntries(
      [...latest.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([findingId, event]) => [findingId, event.newStatus]),
    ),
    digest: reviewEventsDigest(verification.orderedEvents),
  };
}

/** Produit un nouveau snapshot fiscal; le snapshot reçu n'est jamais modifié. */
export function projectFiscalSynthesisWithTaxReview(
  snapshot: FiscalSynthesisSnapshot,
  findingIds: readonly string[],
  events: readonly ReviewEvent[],
): FiscalSynthesisSnapshot {
  const projection = buildTaxReviewProjection(
    events,
    snapshot.organizationId,
    snapshot.dossierId,
  );
  const latestByFinding = new Map<string, ReviewEvent>();
  for (const event of projection.events) latestByFinding.set(event.findingId, event);

  const reviewSummary = { pending: 0, accepted: 0, rejected: 0, amended: 0 };
  for (const findingId of [...new Set(findingIds)].sort()) {
    const action = latestByFinding.get(findingId)?.action;
    if (action === "confirm") reviewSummary.accepted += 1;
    else if (action === "dismiss" || action === "mark_not_applicable") reviewSummary.rejected += 1;
    else if (action === "correct" || action === "replace") reviewSummary.amended += 1;
    else reviewSummary.pending += 1;
  }

  const { canonicalJson: _canonical, snapshotHash: _hash, ...input } = snapshot;
  void _canonical;
  void _hash;
  return createFiscalSynthesisSnapshot({ ...input, reviewSummary });
}
