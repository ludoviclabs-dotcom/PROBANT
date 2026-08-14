import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { ProbantDatabase } from "@/lib/db/client";
import { dossiers, sourceDocuments, synthesisSnapshots } from "@/lib/db/schema";
import type {
  DossierContext,
  DossierSnapshot,
  PostgresDossierRepository,
} from "./types";
import { loadReviewEvents } from "./review-repository";

export class DrizzleDossierRepository implements PostgresDossierRepository {
  readonly kind = "persistent" as const;

  constructor(private readonly db: ProbantDatabase) {}

  async get(context: DossierContext): Promise<DossierSnapshot | null> {
    const [row] = await this.db
      .select({ payload: synthesisSnapshots.payload })
      .from(synthesisSnapshots)
      .innerJoin(dossiers, eq(dossiers.id, synthesisSnapshots.dossierId))
      .where(
        and(
          eq(dossiers.id, context.dossierId),
          eq(dossiers.organizationId, context.organizationId),
        ),
      )
      .orderBy(desc(synthesisSnapshots.createdAt))
      .limit(1);
    if (!row) return null;
    const payload = row.payload as unknown as DossierSnapshot;
    return {
      ...payload,
      sourceKind: "persistent",
      reviewEvents: await loadReviewEvents(this.db, context.dossierId),
    };
  }

  async save(context: DossierContext, snapshot: DossierSnapshot): Promise<void> {
    if (snapshot.dossier.id !== context.dossierId) throw new Error("DOSSIER_CONTEXT_MISMATCH");
    const sourceDocumentId = snapshot.sourceDocuments.at(0)?.id;
    if (!sourceDocumentId) throw new Error("SNAPSHOT_SOURCE_DOCUMENT_REQUIRED");
    const [ownedDocument] = await this.db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .innerJoin(dossiers, eq(dossiers.id, sourceDocuments.dossierId))
      .where(
        and(
          eq(sourceDocuments.id, sourceDocumentId),
          eq(sourceDocuments.dossierId, context.dossierId),
          eq(dossiers.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!ownedDocument) throw new Error("SNAPSHOT_SOURCE_DOCUMENT_FORBIDDEN");
    const persistent = { ...snapshot, sourceKind: "persistent" as const, ledgerEntries: undefined };
    await this.db
      .insert(synthesisSnapshots)
      .values({
        id: crypto.randomUUID(),
        dossierId: context.dossierId,
        sourceDocumentId,
        snapshotVersion: persistent.snapshotVersion,
        snapshotHash: persistent.snapshotHash,
        payload: persistent as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({
        target: [synthesisSnapshots.dossierId, synthesisSnapshots.snapshotHash],
      });
  }
}
