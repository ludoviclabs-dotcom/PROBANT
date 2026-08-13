import "server-only";

import { and, asc, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { FecEntry } from "@/lib/canonical-model";
import type { DossierSnapshot, Finding } from "@/lib/canonical-model";
import type { ProbantDatabase } from "@/lib/db/client";
import {
  dossiers,
  controlExecutions,
  fecEntries,
  findingEntries,
  findings,
  ingestionJobs,
  sourceDocuments,
  synthesisSnapshots,
  type IngestionJobRow,
  type IngestionJobStatus,
  type SourceDocumentRow,
} from "@/lib/db/schema";

export interface UploadIntentRecord {
  job: IngestionJobRow;
  document: SourceDocumentRow;
}

export interface CreateUploadIntentInput {
  organizationId: string;
  dossierId: string;
  originalName: string;
  documentType: string;
  contentType: string;
  contentLength: number;
  checksumSha256Base64?: string;
  idempotencyKey: string;
  parserVersion: string;
  requestId: string;
  storageBucket: string;
}

export interface LedgerPage {
  entries: FecEntry[];
  nextCursor: string | null;
  total: number;
}

const ACTIVE_JOB_STATES: IngestionJobStatus[] = [
  "fingerprinting",
  "parsing",
  "validating",
  "running_controls",
  "building_snapshot",
];

function storageKey(input: {
  organizationId: string;
  dossierId: string;
  documentId: string;
}): string {
  return `organizations/${input.organizationId}/dossiers/${input.dossierId}/documents/${input.documentId}/source`;
}

function toRecord(
  row: { job: IngestionJobRow; document: SourceDocumentRow } | undefined,
): UploadIntentRecord | null {
  return row ?? null;
}

export class DrizzleIngestionRepository {
  constructor(private readonly db: ProbantDatabase) {}

  async createOrGetUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntentRecord> {
    const existing = await this.findByIdempotency(
      input.organizationId,
      input.dossierId,
      input.idempotencyKey,
    );
    if (existing) return existing;

    try {
      return await this.db.transaction(async (tx) => {
        const [dossier] = await tx
          .select({ id: dossiers.id })
          .from(dossiers)
          .where(
            and(
              eq(dossiers.id, input.dossierId),
              eq(dossiers.organizationId, input.organizationId),
              eq(dossiers.status, "active"),
            ),
          )
          .limit(1);
        if (!dossier) throw new Error("DOSSIER_NOT_FOUND");

        const documentId = crypto.randomUUID();
        const jobId = crypto.randomUUID();
        const [document] = await tx
          .insert(sourceDocuments)
          .values({
            id: documentId,
            organizationId: input.organizationId,
            dossierId: input.dossierId,
            originalName: input.originalName,
            documentType: input.documentType,
            declaredMimeType: input.contentType,
            declaredByteSize: input.contentLength,
            declaredChecksumSha256: input.checksumSha256Base64,
            storageProvider: "s3",
            storageBucket: input.storageBucket,
            storageKey: storageKey({
              organizationId: input.organizationId,
              dossierId: input.dossierId,
              documentId,
            }),
            status: "pending_upload",
            parserVersion: input.parserVersion,
          })
          .returning();
        const [job] = await tx
          .insert(ingestionJobs)
          .values({
            id: jobId,
            organizationId: input.organizationId,
            dossierId: input.dossierId,
            sourceDocumentId: documentId,
            status: "uploading",
            idempotencyKey: input.idempotencyKey,
            parserVersion: input.parserVersion,
            requestId: input.requestId,
          })
          .returning();
        return { job, document };
      });
    } catch (error) {
      const raced = await this.findByIdempotency(
        input.organizationId,
        input.dossierId,
        input.idempotencyKey,
      );
      if (raced) return raced;
      throw error;
    }
  }

  async findByIdempotency(
    organizationId: string,
    dossierId: string,
    idempotencyKey: string,
  ): Promise<UploadIntentRecord | null> {
    const [row] = await this.db
      .select({ job: ingestionJobs, document: sourceDocuments })
      .from(ingestionJobs)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, ingestionJobs.sourceDocumentId))
      .where(
        and(
          eq(ingestionJobs.organizationId, organizationId),
          eq(ingestionJobs.dossierId, dossierId),
          eq(ingestionJobs.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return toRecord(row);
  }

  async getUploadIntent(
    organizationId: string,
    dossierId: string,
    jobId: string,
  ): Promise<UploadIntentRecord | null> {
    const [row] = await this.db
      .select({ job: ingestionJobs, document: sourceDocuments })
      .from(ingestionJobs)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, ingestionJobs.sourceDocumentId))
      .where(
        and(
          eq(ingestionJobs.id, jobId),
          eq(ingestionJobs.organizationId, organizationId),
          eq(ingestionJobs.dossierId, dossierId),
        ),
      )
      .limit(1);
    return toRecord(row);
  }

  async getJobForProcessing(
    organizationId: string,
    jobId: string,
  ): Promise<UploadIntentRecord | null> {
    const [row] = await this.db
      .select({ job: ingestionJobs, document: sourceDocuments })
      .from(ingestionJobs)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, ingestionJobs.sourceDocumentId))
      .where(
        and(
          eq(ingestionJobs.id, jobId),
          eq(ingestionJobs.organizationId, organizationId),
        ),
      )
      .limit(1);
    return toRecord(row);
  }

  async markUploaded(
    record: UploadIntentRecord,
    observed: { byteSize: number; contentType?: string; versionId?: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(sourceDocuments)
        .set({
          status: "uploaded",
          observedByteSize: observed.byteSize,
          observedMimeType: observed.contentType,
          storageVersionId: observed.versionId,
          uploadedAt: new Date(),
        })
        .where(
          and(
            eq(sourceDocuments.id, record.document.id),
            inArray(sourceDocuments.status, ["pending_upload", "uploaded"]),
          ),
        );
      await tx
        .update(ingestionJobs)
        .set({ status: "uploaded", updatedAt: new Date() })
        .where(
          and(
            eq(ingestionJobs.id, record.job.id),
            inArray(ingestionJobs.status, ["uploading", "uploaded"]),
          ),
        );
    });
  }

  async markQueuePublished(jobId: string): Promise<void> {
    await this.db
      .update(ingestionJobs)
      .set({ queuePublishedAt: new Date(), updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));
  }

  async listUploadedJobsAwaitingPublication(limit: number): Promise<Array<{
    jobId: string;
    organizationId: string;
    sourceDocumentId: string;
  }>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("RECONCILIATION_LIMIT_INVALID");
    }
    const rows = await this.db
      .select({
        jobId: ingestionJobs.id,
        organizationId: ingestionJobs.organizationId,
        sourceDocumentId: ingestionJobs.sourceDocumentId,
      })
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.status, "uploaded"),
          isNull(ingestionJobs.queuePublishedAt),
        ),
      )
      .orderBy(asc(ingestionJobs.updatedAt))
      .limit(limit);
    return rows;
  }

  async markTerminal(jobId: string, status: "failed" | "quarantined", errorCode: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [job] = await tx
        .update(ingestionJobs)
        .set({
          status,
          errorCode,
          completedAt: new Date(),
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(ingestionJobs.id, jobId))
        .returning({ sourceDocumentId: ingestionJobs.sourceDocumentId });
      if (job) {
        await tx
          .update(sourceDocuments)
          .set({ status, completedAt: new Date() })
          .where(eq(sourceDocuments.id, job.sourceDocumentId));
      }
    });
  }

  async acquireJob(
    jobId: string,
    organizationId: string,
    maxConcurrentJobs: number,
    leaseUntil: Date,
  ): Promise<UploadIntentRecord | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`);
      const now = new Date();
      // A Lambda crash must not strand an active job forever. SQS redelivery can
      // reclaim it only after its durable lease has expired.
      await tx
        .update(ingestionJobs)
        .set({
          status: "failed",
          errorCode: "WORKER_LEASE_EXPIRED",
          completedAt: now,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(ingestionJobs.organizationId, organizationId),
            inArray(ingestionJobs.status, ACTIVE_JOB_STATES),
            lt(ingestionJobs.leaseExpiresAt, now),
          ),
        );
      const [active] = await tx
        .select({ value: count() })
        .from(ingestionJobs)
        .where(
          and(
            eq(ingestionJobs.organizationId, organizationId),
            inArray(ingestionJobs.status, ACTIVE_JOB_STATES),
          ),
        );
      if ((active?.value ?? 0) >= maxConcurrentJobs) return null;

      const [job] = await tx
        .update(ingestionJobs)
        .set({
          status: "fingerprinting",
          attempt: sql`${ingestionJobs.attempt} + 1`,
          startedAt: sql`coalesce(${ingestionJobs.startedAt}, now())`,
          completedAt: null,
          leaseExpiresAt: leaseUntil,
          heartbeatAt: new Date(),
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ingestionJobs.id, jobId),
            eq(ingestionJobs.organizationId, organizationId),
            inArray(ingestionJobs.status, ["uploaded", "failed"]),
          ),
        )
        .returning();
      if (!job) return null;
      const [document] = await tx
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, job.sourceDocumentId))
        .limit(1);
      return document ? { job, document } : null;
    });
  }

  async prepareParsing(jobId: string, sourceDocumentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(fecEntries).where(eq(fecEntries.sourceDocumentId, sourceDocumentId));
      await tx
        .update(ingestionJobs)
        .set({ status: "parsing", lineCount: 0, warningCount: 0, updatedAt: new Date() })
        .where(eq(ingestionJobs.id, jobId));
      await tx
        .update(sourceDocuments)
        .set({ status: "processing" })
        .where(eq(sourceDocuments.id, sourceDocumentId));
    });
  }

  async insertFecBatch(sourceDocumentId: string, dossierId: string, entries: FecEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insert(fecEntries).values(
      entries.map((entry) => ({
        sourceDocumentId,
        dossierId,
        lineNumber: entry.ligne,
        journalCode: entry.journalCode,
        journalLib: entry.journalLib,
        ecritureNum: entry.ecritureNum,
        ecritureDate: entry.ecritureDate,
        compteNum: entry.compteNum,
        compteLib: entry.compteLib,
        compAuxNum: entry.compAuxNum,
        compAuxLib: entry.compAuxLib,
        pieceRef: entry.pieceRef,
        pieceDate: entry.pieceDate,
        ecritureLib: entry.ecritureLib,
        debit: entry.debit.toFixed(2),
        credit: entry.credit.toFixed(2),
        ecritureLet: entry.ecritureLet,
        dateLet: entry.dateLet,
        validDate: entry.validDate,
        montant: entry.montant.toFixed(2),
      })),
    );
  }

  async completeParsing(
    jobId: string,
    sourceDocumentId: string,
    result: { sha256: string; byteCount: number; lineCount: number; warningCount: number },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(sourceDocuments)
        .set({
          sha256: result.sha256,
          observedByteSize: result.byteCount,
          lineCount: result.lineCount,
        })
        .where(eq(sourceDocuments.id, sourceDocumentId));
      await tx
        .update(ingestionJobs)
        .set({
          status: "validating",
          lineCount: result.lineCount,
          warningCount: result.warningCount,
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ingestionJobs.id, jobId));
    });
  }

  async findDocumentBySha256(
    dossierId: string,
    sha256: string,
  ): Promise<{ id: string } | null> {
    const [document] = await this.db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.dossierId, dossierId),
          eq(sourceDocuments.sha256, sha256),
        ),
      )
      .limit(1);
    return document ?? null;
  }

  async persistAnalysis(input: {
    jobId: string;
    dossierId: string;
    sourceDocumentId: string;
    findings: Finding[];
    controls: Array<{
      ruleId: string;
      ruleVersion: string;
      status: "completed" | "failed";
      findingCount: number;
    }>;
    snapshot: DossierSnapshot;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const executionIds = new Map<string, string>();
      for (const control of input.controls) {
        const [execution] = await tx
          .insert(controlExecutions)
          .values({
            id: crypto.randomUUID(),
            ingestionJobId: input.jobId,
            ruleId: control.ruleId,
            ruleVersion: control.ruleVersion,
            status: control.status,
            metrics: { findingCount: control.findingCount },
            startedAt: new Date(),
            completedAt: new Date(),
            errorCode: control.status === "failed" ? "RULE_EXECUTION_ERROR" : null,
          })
          .onConflictDoUpdate({
            target: [
              controlExecutions.ingestionJobId,
              controlExecutions.ruleId,
              controlExecutions.ruleVersion,
            ],
            set: {
              status: control.status,
              metrics: { findingCount: control.findingCount },
              completedAt: new Date(),
              errorCode: control.status === "failed" ? "RULE_EXECUTION_ERROR" : null,
            },
          })
          .returning({ id: controlExecutions.id });
        executionIds.set(`${control.ruleId}@${control.ruleVersion}`, execution.id);
      }

      for (const finding of input.findings) {
        const executionId = executionIds.get(`${finding.ruleId}@${finding.ruleVersion}`);
        if (!executionId) throw new Error("CONTROL_EXECUTION_MISSING");
        const [persistedFinding] = await tx
          .insert(findings)
          .values({
            id: crypto.randomUUID(),
            dossierId: input.dossierId,
            controlExecutionId: executionId,
            findingKey: finding.id,
            family: finding.family,
            severity: finding.severity,
            reviewStatus: finding.statutRevue,
            payload: finding as unknown as Record<string, unknown>,
          })
          .onConflictDoUpdate({
            target: [findings.dossierId, findings.findingKey],
            set: {
              controlExecutionId: executionId,
              family: finding.family,
              severity: finding.severity,
              payload: finding as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
          })
          .returning({ id: findings.id });
        await tx.delete(findingEntries).where(eq(findingEntries.findingId, persistedFinding.id));
        if (finding.lignesSource.length > 0) {
          await tx.insert(findingEntries).values(
            [...new Set(finding.lignesSource)].map((lineNumber) => ({
              findingId: persistedFinding.id,
              sourceDocumentId: input.sourceDocumentId,
              lineNumber,
            })),
          );
        }
      }

      await tx
        .insert(synthesisSnapshots)
        .values({
          id: crypto.randomUUID(),
          dossierId: input.dossierId,
          sourceDocumentId: input.sourceDocumentId,
          snapshotVersion: input.snapshot.snapshotVersion,
          snapshotHash: input.snapshot.snapshotHash,
          payload: input.snapshot as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({
          target: [synthesisSnapshots.dossierId, synthesisSnapshots.snapshotHash],
        });

      await tx
        .update(sourceDocuments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(sourceDocuments.id, input.sourceDocumentId));
      await tx
        .update(ingestionJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          leaseExpiresAt: null,
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ingestionJobs.id, input.jobId));
    });
  }

  async setJobStatus(
    jobId: string,
    status: IngestionJobStatus,
    leaseUntil?: Date,
  ): Promise<void> {
    await this.db
      .update(ingestionJobs)
      .set({
        status,
        heartbeatAt: new Date(),
        leaseExpiresAt: leaseUntil,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, jobId));
  }

  async listAllEntries(sourceDocumentId: string): Promise<FecEntry[]> {
    const rows = await this.db
      .select()
      .from(fecEntries)
      .where(eq(fecEntries.sourceDocumentId, sourceDocumentId))
      .orderBy(asc(fecEntries.lineNumber));
    return rows.map((row) => ({
      ligne: row.lineNumber,
      journalCode: row.journalCode,
      journalLib: row.journalLib,
      ecritureNum: row.ecritureNum,
      ecritureDate: row.ecritureDate,
      compteNum: row.compteNum,
      compteLib: row.compteLib,
      compAuxNum: row.compAuxNum,
      compAuxLib: row.compAuxLib,
      pieceRef: row.pieceRef,
      pieceDate: row.pieceDate,
      ecritureLib: row.ecritureLib,
      debit: Number(row.debit),
      credit: Number(row.credit),
      ecritureLet: row.ecritureLet,
      dateLet: row.dateLet,
      validDate: row.validDate,
      montant: Number(row.montant),
    }));
  }

  async listLedgerPage(input: {
    organizationId: string;
    dossierId: string;
    sourceDocumentId: string;
    afterLine: number;
    pageSize: number;
  }): Promise<LedgerPage> {
    const ownership = and(
      eq(sourceDocuments.id, input.sourceDocumentId),
      eq(sourceDocuments.organizationId, input.organizationId),
      eq(sourceDocuments.dossierId, input.dossierId),
    );
    const [document] = await this.db
      .select({ lineCount: sourceDocuments.lineCount })
      .from(sourceDocuments)
      .where(ownership)
      .limit(1);
    if (!document) throw new Error("SOURCE_DOCUMENT_NOT_FOUND");
    const rows = await this.db
      .select()
      .from(fecEntries)
      .where(
        and(
          eq(fecEntries.sourceDocumentId, input.sourceDocumentId),
          gt(fecEntries.lineNumber, input.afterLine),
        ),
      )
      .orderBy(asc(fecEntries.lineNumber))
      .limit(input.pageSize + 1);
    const hasMore = rows.length > input.pageSize;
    const page = hasMore ? rows.slice(0, input.pageSize) : rows;
    const entries = page.map((row) => ({
      ligne: row.lineNumber,
      journalCode: row.journalCode,
      journalLib: row.journalLib,
      ecritureNum: row.ecritureNum,
      ecritureDate: row.ecritureDate,
      compteNum: row.compteNum,
      compteLib: row.compteLib,
      compAuxNum: row.compAuxNum,
      compAuxLib: row.compAuxLib,
      pieceRef: row.pieceRef,
      pieceDate: row.pieceDate,
      ecritureLib: row.ecritureLib,
      debit: Number(row.debit),
      credit: Number(row.credit),
      ecritureLet: row.ecritureLet,
      dateLet: row.dateLet,
      validDate: row.validDate,
      montant: Number(row.montant),
    }));
    return {
      entries,
      nextCursor: hasMore
        ? Buffer.from(String(page.at(-1)!.lineNumber), "utf8").toString("base64url")
        : null,
      total: document.lineCount ?? 0,
    };
  }
}

export function decodeLedgerCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const decoded = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(decoded) || decoded < 0) throw new Error("LEDGER_CURSOR_INVALID");
  return decoded;
}
