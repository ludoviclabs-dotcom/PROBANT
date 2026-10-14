import "server-only";

import { sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { LocalObjectStorage, localPiecesRoot } from "@/lib/storage/local-object-storage";
import { readIngestionLimits } from "./limits";
import { IngestionProcessor } from "./processor";
import type { IngestionJobMessage, IngestionJobQueue } from "./queue";
import { DrizzleUploadQuotaStore, UploadQuotaService, readUploadQuotaPolicy } from "./quota";
import { DrizzleIngestionRepository } from "./repository";
import { DirectUploadService } from "./upload-service";

/**
 * Ingestion FEC du profil personnel local (C07) : même service d'envoi direct,
 * même processeur, mêmes états PostgreSQL que le mode persistant, sans S3 ni SQS.
 *
 * - Les pièces vont dans `LocalObjectStorage` (disque du PC, écriture unique).
 * - La « file » est le traitement en processus, un job à la fois ; l'état durable
 *   reste `ingestion_jobs`. Un job interrompu (arrêt du PC, du serveur) est
 *   repris depuis cet état : `uploaded` non traité, actif dont le bail a expiré,
 *   échec transitoire. Le processeur reste idempotent (statuts terminaux réutilisés).
 */
type Processor = (message: IngestionJobMessage) => Promise<unknown>;
const MAX_ATTEMPTS = 5;
const state = globalThis as typeof globalThis & { __probantLocalIngestion?: { chain: Promise<unknown>; pending: Set<string>; recovery?: ReturnType<typeof setInterval> } };
const queueState = () => (state.__probantLocalIngestion ??= { chain: Promise.resolve(), pending: new Set() });

export class LocalIngestionJobQueue implements IngestionJobQueue {
  constructor(private readonly process: Processor) {}
  async publish(message: IngestionJobMessage): Promise<{ messageId: string }> {
    const s = queueState();
    if (!s.pending.has(message.jobId)) {
      s.pending.add(message.jobId);
      s.chain = s.chain.then(() => this.process(message)).catch(error => {
        console.error(JSON.stringify({ level: "error", code: "LOCAL_INGESTION_RETRY_LATER", jobId: message.jobId, errorName: error instanceof Error ? error.name : "UnknownError" }));
      }).finally(() => s.pending.delete(message.jobId));
    }
    return { messageId: "local:" + message.jobId };
  }
}

function uploadTtlSeconds(): number {
  const value = Number(process.env.DIRECT_UPLOAD_TTL_SECONDS);
  if (!Number.isInteger(value) || value <= 0 || value > 3_600) throw new Error("DIRECT_UPLOAD_TTL_NOT_CONFIGURED");
  return value;
}

export function createLocalObjectStorage(env: Record<string, string | undefined> = process.env): LocalObjectStorage {
  const origin = env.AUTH_APP_ORIGIN?.trim(), secret = env.AUTH_SESSION_SECRET ?? "";
  if (!origin || secret.length < 32) throw new Error("LOCAL_STORAGE_NOT_CONFIGURED");
  return new LocalObjectStorage(localPiecesRoot(env), new URL(origin).origin, secret);
}

function localQueue(repository: DrizzleIngestionRepository, storage: LocalObjectStorage, limits: ReturnType<typeof readIngestionLimits>) {
  return new LocalIngestionJobQueue(message => new IngestionProcessor(repository, storage, limits).process(message));
}

export function createLocalIngestionRuntime() {
  const repository = new DrizzleIngestionRepository(getDatabase());
  const storage = createLocalObjectStorage();
  const limits = readIngestionLimits();
  const queue = localQueue(repository, storage, limits);
  const quota = new UploadQuotaService(new DrizzleUploadQuotaStore(getDatabase()), readUploadQuotaPolicy());
  ensureLocalIngestionRecovery(queue);
  return { repository, storage, queue, limits, quota, uploadTtlSeconds: uploadTtlSeconds(), uploadService: new DirectUploadService(repository, storage, queue, limits, quota) };
}

/** Jobs à reprendre depuis l'état durable ; aucune décision n'est prise sur un job terminé. */
export async function recoverableLocalJobs(limit = 50): Promise<IngestionJobMessage[]> {
  const rows = await getDatabase().execute<{ id: string; organization_id: string; source_document_id: string }>(sql`
    SELECT id::text, organization_id::text, source_document_id::text FROM ingestion_jobs
    WHERE status = 'uploaded'
       OR (status IN ('fingerprinting','parsing','validating','running_controls','building_snapshot') AND lease_expires_at < now())
       OR (status = 'failed' AND error_code IN ('INGESTION_TRANSIENT_FAILURE', 'WORKER_LEASE_EXPIRED') AND attempt < ${MAX_ATTEMPTS})
    ORDER BY updated_at LIMIT ${limit}`);
  return [...rows].map(r => ({ schemaVersion: 1 as const, jobId: r.id, organizationId: r.organization_id, sourceDocumentId: r.source_document_id }));
}

/**
 * Reprise au premier usage du runtime local après un démarrage, puis toutes les
 * minutes tant que le serveur tourne. Jamais en dehors du profil personnel.
 */
export function ensureLocalIngestionRecovery(queue?: IngestionJobQueue): void {
  const s = queueState();
  if (s.recovery || process.env.PROBANT_RUNTIME_PROFILE !== "personal") return;
  const target = queue ?? localQueue(new DrizzleIngestionRepository(getDatabase()), createLocalObjectStorage(), readIngestionLimits());
  const pass = () => { void recoverableLocalJobs().then(jobs => Promise.all(jobs.map(job => target.publish(job)))).catch(() => undefined); };
  s.recovery = setInterval(pass, 60_000);
  s.recovery.unref?.();
  pass();
}
