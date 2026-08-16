import { and, asc, count, desc, eq } from "drizzle-orm";
import type { FecEntry } from "@/lib/canonical-model";
import { getDatabase } from "@/lib/persistence/db";
import {
  dossiers,
  findings,
  ledgerEntries,
  reviewEvents,
  sourceDocuments,
  synthesisSnapshots,
} from "@/lib/persistence/schema";
import type {
  DossierContext,
  DossierSnapshot,
  PostgresDossierRepository as PostgresDossierRepositoryContract,
} from "./types";

export class PostgresDossierRepository
  implements PostgresDossierRepositoryContract
{
  readonly kind = "persistent" as const;

  constructor(_dossierId?: string) {
    void _dossierId;
  }

  async get(context: DossierContext): Promise<DossierSnapshot | null> {
    return this.getById(context.organizationId, context.dossierId);
  }

  async getById(organizationId: string, id: string): Promise<DossierSnapshot | null> {
    const rows = await getDatabase()
      .select({ payload: synthesisSnapshots.payload })
      .from(synthesisSnapshots)
      .innerJoin(dossiers, eq(synthesisSnapshots.dossierId, dossiers.id))
      .where(and(
        eq(synthesisSnapshots.dossierId, id),
        eq(synthesisSnapshots.snapshotKind, "dossier"),
        eq(dossiers.organizationId, organizationId),
      ))
      .orderBy(desc(synthesisSnapshots.createdAt))
      .limit(1);
    return rows[0]?.payload
      ? { ...(rows[0].payload as DossierSnapshot), sourceKind: "persistent" }
      : null;
  }

  async save(context: DossierContext, input: DossierSnapshot): Promise<void> {
    if (context.dossierId !== input.dossier.id) {
      throw new Error("Le contexte persistant ne correspond pas au snapshot.");
    }
    const snapshot: DossierSnapshot = { ...input, sourceKind: "persistent" };
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx
        .insert(dossiers)
        .values({
          id: snapshot.dossier.id,
          organizationId: context.organizationId,
          companyName: snapshot.dossier.societe.raisonSociale,
          siren: snapshot.dossier.societe.siren,
          fiscalYear: snapshot.dossier.societe.exercice,
          storageKind: "persistent",
          createdAt: snapshot.dossier.createdAt,
        })
        .onConflictDoUpdate({
          target: dossiers.id,
          set: {
            companyName: snapshot.dossier.societe.raisonSociale,
            organizationId: context.organizationId,
            siren: snapshot.dossier.societe.siren,
            fiscalYear: snapshot.dossier.societe.exercice,
            storageKind: "persistent",
          },
        });

      for (const document of snapshot.sourceDocuments) {
        await tx
          .insert(sourceDocuments)
          .values({
            id: document.id,
            dossierId: snapshot.dossier.id,
            fileName: document.fileName,
            documentType: document.documentType,
            mimeType: "application/octet-stream",
            sizeBytes: 0,
            fingerprint: document.fingerprint,
            privateObjectPath: `snapshot://${snapshot.dossier.id}/${document.id}`,
            parserVersion: document.parserVersion,
            lineCount: document.lineCount,
            pageCount: document.pageCount,
            createdAt: document.createdAt,
          })
          .onConflictDoUpdate({
            target: sourceDocuments.id,
            set: {
              fingerprint: document.fingerprint,
              parserVersion: document.parserVersion,
              lineCount: document.lineCount,
              pageCount: document.pageCount,
            },
          });
      }

      for (const finding of snapshot.findings) {
        await tx
          .insert(findings)
          .values({
            id: finding.id,
            dossierId: snapshot.dossier.id,
            severity: finding.severity,
            family: finding.family,
            domain: finding.domain ?? "accounting",
            payload: finding,
          })
          .onConflictDoUpdate({
            target: findings.id,
            set: {
              severity: finding.severity,
              family: finding.family,
              domain: finding.domain ?? "accounting",
              payload: finding,
            },
          });
      }

      for (const event of snapshot.reviewEvents) {
        await tx
          .insert(reviewEvents)
          .values({
            id: event.id,
            dossierId: snapshot.dossier.id,
            findingId: event.findingId,
            previousStatus: event.previousStatus,
            newStatus: event.newStatus,
            comment: event.comment,
            actorLabel: event.actorLabel,
            actorRole: event.actorRole,
            relatedEvidenceIds: event.relatedEvidenceIds,
            createdAt: event.createdAt,
          })
          .onConflictDoNothing();
      }

      await tx
        .insert(synthesisSnapshots)
        .values({
          id: `${snapshot.dossier.id}:${snapshot.snapshotHash}`,
          organizationId: context.organizationId,
          dossierId: snapshot.dossier.id,
          snapshotVersion: snapshot.snapshotVersion,
          snapshotKind: "dossier",
          snapshotHash: snapshot.snapshotHash,
          payload: snapshot,
        })
        .onConflictDoUpdate({
          target: synthesisSnapshots.id,
          set: {
            snapshotVersion: snapshot.snapshotVersion,
            payload: snapshot,
          },
        });
    });
  }
}

export async function saveLedgerEntries(input: {
  dossierId: string;
  documentId: string;
  entries: FecEntry[];
}): Promise<void> {
  const db = getDatabase();
  const chunkSize = 500;
  for (let start = 0; start < input.entries.length; start += chunkSize) {
    const chunk = input.entries.slice(start, start + chunkSize);
    if (chunk.length === 0) continue;
    await db
      .insert(ledgerEntries)
      .values(
        chunk.map((entry) => ({
          id: `${input.documentId}:${entry.ligne}`,
          dossierId: input.dossierId,
          documentId: input.documentId,
          lineNumber: entry.ligne,
          entryPayload: entry,
        })),
      )
      .onConflictDoNothing();
  }
}

export async function getLedgerEntriesPage(input: {
  dossierId: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: FecEntry[]; totalRows: number }> {
  const db = getDatabase();
  const page = Math.max(1, input.page);
  const pageSize = Math.min(500, Math.max(1, input.pageSize));
  const [totalResult, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.dossierId, input.dossierId)),
    db
      .select({ entry: ledgerEntries.entryPayload })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.dossierId, input.dossierId))
      .orderBy(asc(ledgerEntries.lineNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return {
    rows: rows.map((row) => row.entry),
    totalRows: totalResult[0]?.value ?? 0,
  };
}

