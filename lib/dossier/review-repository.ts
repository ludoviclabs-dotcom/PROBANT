import "server-only";

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { ProbantDatabase } from "@/lib/db/client";
import {
  dossiers,
  findings,
  reviewEvents,
  sourceDocuments,
  synthesisSnapshots,
} from "@/lib/db/schema";
import type { ReviewEvent, ReviewEventAction, ReviewEventStatus } from "@/lib/canonical-model";
import { appendReviewDecisionToSnapshot } from "./snapshot-state";
import type { DossierContext, DossierSnapshot } from "./types";

type ReviewRow = {
  id: string;
  organizationId: string | null;
  dossierId: string;
  findingKey: string;
  action: ReviewEventAction | null;
  actorId: string;
  actorRole: string;
  previousStatus: ReviewEventStatus;
  newStatus: ReviewEventStatus;
  comment: string;
  relatedEvidenceIds: string[];
  createdAt: Date;
  previousEventHash: string | null;
  eventHash: string;
};

function mapReviewRows(rows: ReviewRow[]): ReviewEvent[] {
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId ?? undefined,
    dossierId: row.dossierId,
    findingId: row.findingKey,
    action: row.action ?? undefined,
    actorId: row.actorId,
    actorRole: row.actorRole,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    comment: row.comment,
    relatedEvidenceIds: row.relatedEvidenceIds,
    createdAt: row.createdAt.toISOString(),
    previousEventHash: row.previousEventHash,
    eventHash: row.eventHash,
  }));
}

const reviewSelection = {
  id: reviewEvents.id,
  organizationId: reviewEvents.organizationId,
  dossierId: reviewEvents.dossierId,
  findingKey: findings.findingKey,
  action: reviewEvents.action,
  actorId: reviewEvents.actorId,
  actorRole: reviewEvents.actorRole,
  previousStatus: reviewEvents.previousStatus,
  newStatus: reviewEvents.newStatus,
  comment: reviewEvents.comment,
  relatedEvidenceIds: reviewEvents.relatedEvidenceIds,
  createdAt: reviewEvents.createdAt,
  previousEventHash: reviewEvents.previousEventHash,
  eventHash: reviewEvents.eventHash,
};

export async function loadReviewEvents(
  db: ProbantDatabase,
  context: DossierContext,
): Promise<ReviewEvent[]> {
  const rows = await db
    .select(reviewSelection)
    .from(reviewEvents)
    .innerJoin(findings, eq(findings.id, reviewEvents.findingId))
    .innerJoin(dossiers, eq(dossiers.id, reviewEvents.dossierId))
    .where(and(
      eq(reviewEvents.dossierId, context.dossierId),
      eq(dossiers.organizationId, context.organizationId),
      // Les événements antérieurs à TAX-09 restent lisibles sans réécriture.
      or(
        isNull(reviewEvents.organizationId),
        eq(reviewEvents.organizationId, context.organizationId),
      ),
    ))
    .orderBy(asc(reviewEvents.createdAt), asc(reviewEvents.id));
  return mapReviewRows(rows);
}

export class DrizzleReviewEventRepository {
  constructor(private readonly db: ProbantDatabase) {}

  async append(
    context: DossierContext,
    input: {
      findingId: string;
      actorId: string;
      actorRole: string;
      newStatus: ReviewEventStatus;
      action?: ReviewEventAction;
      comment?: string;
      relatedEvidenceIds?: string[];
    },
  ): Promise<DossierSnapshot> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select ${dossiers.id} from ${dossiers} where ${dossiers.id} = ${context.dossierId} and ${dossiers.organizationId} = ${context.organizationId} for update`,
      );
      const [snapshotRow] = await tx
        .select({
          id: synthesisSnapshots.id,
          sourceDocumentId: synthesisSnapshots.sourceDocumentId,
          payload: synthesisSnapshots.payload,
        })
        .from(synthesisSnapshots)
        .innerJoin(dossiers, eq(dossiers.id, synthesisSnapshots.dossierId))
        .where(
          and(
            eq(synthesisSnapshots.dossierId, context.dossierId),
            eq(dossiers.organizationId, context.organizationId),
          ),
        )
        .orderBy(desc(synthesisSnapshots.createdAt), desc(synthesisSnapshots.id))
        .limit(1);
      if (!snapshotRow) throw new Error("REVIEW_SNAPSHOT_NOT_FOUND");

      const [findingRow] = await tx
        .select({ id: findings.id })
        .from(findings)
        .innerJoin(dossiers, eq(dossiers.id, findings.dossierId))
        .where(
          and(
            eq(findings.dossierId, context.dossierId),
            eq(dossiers.organizationId, context.organizationId),
            eq(findings.findingKey, input.findingId),
          ),
        )
        .limit(1);
      if (!findingRow) throw new Error("REVIEW_FINDING_NOT_FOUND");

      const rows = await tx
        .select(reviewSelection)
        .from(reviewEvents)
        .innerJoin(findings, eq(findings.id, reviewEvents.findingId))
        .innerJoin(dossiers, eq(dossiers.id, reviewEvents.dossierId))
        .where(and(
          eq(reviewEvents.dossierId, context.dossierId),
          eq(dossiers.organizationId, context.organizationId),
          or(
            isNull(reviewEvents.organizationId),
            eq(reviewEvents.organizationId, context.organizationId),
          ),
        ))
        .orderBy(asc(reviewEvents.createdAt), asc(reviewEvents.id));
      const current = {
        ...(snapshotRow.payload as unknown as DossierSnapshot),
        sourceKind: "persistent" as const,
        reviewEvents: mapReviewRows(rows),
      };
      const eventId = crypto.randomUUID();
      const next = appendReviewDecisionToSnapshot(current, {
        id: eventId,
        organizationId: context.organizationId,
        findingId: input.findingId,
        action: input.action,
        actorId: input.actorId,
        actorRole: input.actorRole,
        newStatus: input.newStatus,
        comment: input.comment,
        relatedEvidenceIds: input.relatedEvidenceIds,
        createdAt: new Date().toISOString(),
      });
      const event = next.reviewEvents.at(-1);
      if (!event) throw new Error("REVIEW_EVENT_NOT_CREATED");

      await tx.insert(reviewEvents).values({
        id: event.id,
        organizationId: event.organizationId,
        dossierId: context.dossierId,
        findingId: findingRow.id,
        action: event.action,
        actorId: event.actorId,
        actorRole: event.actorRole,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        comment: event.comment,
        relatedEvidenceIds: event.relatedEvidenceIds,
        createdAt: new Date(event.createdAt),
        previousEventHash: event.previousEventHash,
        eventHash: event.eventHash,
      });
      await tx
        .update(findings)
        .set({ reviewStatus: event.newStatus, updatedAt: new Date() })
        .where(eq(findings.id, findingRow.id));
      await tx.insert(synthesisSnapshots).values({
        id: crypto.randomUUID(),
        dossierId: context.dossierId,
        sourceDocumentId: snapshotRow.sourceDocumentId,
        snapshotVersion: next.snapshotVersion,
        snapshotHash: next.snapshotHash,
        payload: { ...next, ledgerEntries: undefined } as unknown as Record<string, unknown>,
      });

      const evidenceIds = input.relatedEvidenceIds ?? [];
      if (evidenceIds.length > 0) {
        const rowsFound = await tx
          .select({ id: sourceDocuments.id })
          .from(sourceDocuments)
          .innerJoin(dossiers, eq(dossiers.id, sourceDocuments.dossierId))
          .where(and(
            eq(sourceDocuments.dossierId, context.dossierId),
            eq(dossiers.organizationId, context.organizationId),
          ));
        const allowed = new Set(rowsFound.map((row) => row.id));
        if (evidenceIds.some((id) => !allowed.has(id))) {
          throw new Error("REVIEW_EVIDENCE_NOT_FOUND");
        }
      }
      return next;
    });
  }
}

