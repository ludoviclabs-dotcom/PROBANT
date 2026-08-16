import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/persistence/db";
import {
  dossiers,
  ingestionJobs,
  sourceDocuments,
} from "@/lib/persistence/schema";
import {
  getIngestionJob as getMemoryJob,
  listIngestionJobs as listMemoryJobs,
  saveIngestionJob as saveMemoryJob,
  updateIngestionJob as updateMemoryJob,
} from "./memory-store";
import { isPersistentIngestionConfigured } from "./object-store";
import type { IngestionJob, IngestionJobStatus } from "./types";

export interface IngestionJobRepository {
  readonly kind: "memory" | "postgres";
  save(job: IngestionJob): Promise<IngestionJob>;
  get(id: string): Promise<IngestionJob | null>;
  update(id: string, patch: Partial<IngestionJob>): Promise<IngestionJob | null>;
  list(): Promise<IngestionJob[]>;
}

export class MemoryIngestionJobRepository implements IngestionJobRepository {
  readonly kind = "memory" as const;

  async save(job: IngestionJob): Promise<IngestionJob> {
    return saveMemoryJob(job);
  }

  async get(id: string): Promise<IngestionJob | null> {
    return getMemoryJob(id);
  }

  async update(
    id: string,
    patch: Partial<IngestionJob>,
  ): Promise<IngestionJob | null> {
    return updateMemoryJob(id, patch);
  }

  async list(): Promise<IngestionJob[]> {
    return listMemoryJobs();
  }
}

interface JoinedJobRow {
  job: typeof ingestionJobs.$inferSelect;
  document: typeof sourceDocuments.$inferSelect;
  dossier: typeof dossiers.$inferSelect;
}

function toJob(row: JoinedJobRow): IngestionJob {
  return {
    id: row.job.id,
    organizationId: row.dossier.organizationId,
    dossierId: row.job.dossierId,
    entityId: row.document.ingestionMetadata.entityId ?? row.job.dossierId,
    documentId: row.job.documentId ?? row.document.id,
    status: row.job.status as IngestionJobStatus,
    progress: row.job.progress,
    startedAt: row.job.startedAt,
    completedAt: row.job.completedAt ?? undefined,
    parserVersion: row.job.parserVersion ?? undefined,
    errorCode: row.job.errorCode ?? undefined,
    errorMessage: row.job.errorMessage ?? undefined,
    lineCount: row.job.lineCount ?? undefined,
    warningCount: row.job.warningCount ?? undefined,
    fileName: row.document.fileName,
    mimeType: row.document.mimeType,
    sizeBytes: row.document.sizeBytes,
    documentType: row.document.documentType as IngestionJob["documentType"],
    documentKind: row.document.documentType as IngestionJob["documentKind"],
    fileFormat: row.document.ingestionMetadata.fileFormat ?? "unknown",
    metadata: row.document.ingestionMetadata,
    privateObjectPath: row.document.privateObjectPath,
  };
}

export class PostgresIngestionJobRepository implements IngestionJobRepository {
  readonly kind = "postgres" as const;

  async save(job: IngestionJob): Promise<IngestionJob> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx
        .insert(dossiers)
        .values({
          id: job.dossierId,
          organizationId: job.organizationId,
          companyName: "Dossier en ingestion",
          fiscalYear: "a-determiner",
          storageKind: "persistent",
          createdAt: job.startedAt,
        })
        .onConflictDoNothing();
      await tx
        .insert(sourceDocuments)
        .values({
          id: job.documentId,
          dossierId: job.dossierId,
          fileName: job.fileName,
          documentType: job.documentKind,
          mimeType: job.mimeType,
          sizeBytes: job.sizeBytes,
          fingerprint: "pending",
          privateObjectPath: job.privateObjectPath,
          parserVersion: job.parserVersion,
          ingestionMetadata: {
            ...job.metadata,
            entityId: job.entityId,
            fileFormat: job.fileFormat,
          },
          createdAt: job.startedAt,
        })
        .onConflictDoUpdate({
          target: sourceDocuments.id,
          set: {
            privateObjectPath: job.privateObjectPath,
            parserVersion: job.parserVersion,
          },
        });
      await tx
        .insert(ingestionJobs)
        .values({
          id: job.id,
          dossierId: job.dossierId,
          documentId: job.documentId,
          status: job.status,
          progress: job.progress,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          parserVersion: job.parserVersion,
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
          lineCount: job.lineCount,
          warningCount: job.warningCount,
        })
        .onConflictDoUpdate({
          target: ingestionJobs.id,
          set: {
            status: job.status,
            progress: job.progress,
            completedAt: job.completedAt,
            errorCode: job.errorCode,
            errorMessage: job.errorMessage,
            lineCount: job.lineCount,
            warningCount: job.warningCount,
          },
        });
    });
    return job;
  }

  async get(id: string): Promise<IngestionJob | null> {
    const rows = await getDatabase()
      .select({ job: ingestionJobs, document: sourceDocuments, dossier: dossiers })
      .from(ingestionJobs)
      .innerJoin(sourceDocuments, eq(ingestionJobs.documentId, sourceDocuments.id))
      .innerJoin(dossiers, eq(ingestionJobs.dossierId, dossiers.id))
      .where(eq(ingestionJobs.id, id))
      .limit(1);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async update(
    id: string,
    patch: Partial<IngestionJob>,
  ): Promise<IngestionJob | null> {
    const values = {
      status: patch.status,
      progress: patch.progress,
      completedAt: patch.completedAt,
      parserVersion: patch.parserVersion,
      errorCode: patch.errorCode,
      errorMessage: patch.errorMessage,
      lineCount: patch.lineCount,
      warningCount: patch.warningCount,
    };
    const definedValues = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(definedValues).length > 0) {
      await getDatabase()
        .update(ingestionJobs)
        .set(definedValues)
        .where(eq(ingestionJobs.id, id));
    }
    return this.get(id);
  }

  async list(): Promise<IngestionJob[]> {
    const rows = await getDatabase()
      .select({ job: ingestionJobs, document: sourceDocuments, dossier: dossiers })
      .from(ingestionJobs)
      .innerJoin(sourceDocuments, eq(ingestionJobs.documentId, sourceDocuments.id))
      .innerJoin(dossiers, eq(ingestionJobs.dossierId, dossiers.id))
      .orderBy(desc(ingestionJobs.startedAt))
      .limit(100);
    return rows.map(toJob);
  }
}

export function getIngestionJobRepository(): IngestionJobRepository {
  return isPersistentIngestionConfigured()
    ? new PostgresIngestionJobRepository()
    : new MemoryIngestionJobRepository();
}

export async function updatePersistedSourceDocument(input: {
  documentId: string;
  fingerprint: string;
  lineCount: number;
}): Promise<void> {
  if (!isPersistentIngestionConfigured()) return;
  await getDatabase()
    .update(sourceDocuments)
    .set({
      fingerprint: input.fingerprint,
      lineCount: input.lineCount,
    })
    .where(eq(sourceDocuments.id, input.documentId));
}

