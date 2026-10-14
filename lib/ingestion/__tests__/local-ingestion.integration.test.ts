import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { LocalObjectStorage } from "@/lib/storage/local-object-storage";
import { FEC_STREAM_PARSER_VERSION } from "@/lib/fec/stream-parser";
import { DrizzleDossierRepository } from "@/lib/dossier/postgres-repository";
import { LocalIngestionJobQueue, recoverableLocalJobs } from "../local-runtime";
import { closeDatabaseForTests } from "@/lib/db/client";
import { IngestionProcessor } from "../processor";
import { DrizzleUploadQuotaStore, UploadQuotaService } from "../quota";
import { DrizzleIngestionRepository } from "../repository";
import { DirectUploadService } from "../upload-service";
import { assertDisposableDatabase } from "@/lib/workpapers/__tests__/disposable-database";

/**
 * C07 — dépôt FEC du profil personnel sans S3 ni SQS, sur PostgreSQL jetable.
 * Même service d'envoi, même processeur et mêmes états que le mode persistant ;
 * seuls le stockage (disque) et la file (en processus) sont locaux.
 */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
const LIMITS = { maxUploadBytes: 134_217_728, maxFecLines: 250_000, maxLineBytes: 262_144, maxFieldBytes: 65_536, maxParseDurationMs: 300_000, maxConcurrentJobsPerOrg: 2 };
function fec(lines: number) {
  const rows = ["JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise"];
  for (let i = 1; i <= lines; i++) {
    const amount = (i * 100).toFixed(2).replace(".", ","), num = "VE" + String(i).padStart(6, "0");
    rows.push(`VE|Ventes|${num}|20241231|411000|Clients|||FA${i}|20241231|Vente|${amount}|0,00|||20241231||`, `VE|Ventes|${num}|20241231|707000|Ventes|||FA${i}|20241231|Vente|0,00|${amount}|||20241231||`);
  }
  return Buffer.from(rows.join("\n") + "\n", "utf8");
}

describe.skipIf(!databaseUrl)("C07 — dépôt FEC local : stockage disque, traitement local, reprise depuis PostgreSQL", () => {
  let client: ReturnType<typeof postgres>, repository: DrizzleIngestionRepository, storage: LocalObjectStorage, service: DirectUploadService, root: string;
  const org = randomUUID(), dossier = randomUUID(), processed: string[] = [];
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    await assertDisposableDatabase(client);
    const db = drizzle(client, { schema });
    await client`INSERT INTO organizations (id,name) VALUES (${org},'FEC local')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossier},${org},${dossier})`;
    root = mkdtempSync(join(tmpdir(), "probant-c07-pieces-"));
    repository = new DrizzleIngestionRepository(db);
    storage = new LocalObjectStorage(root, "http://127.0.0.1:3210", "c07-local-ingestion-secret-0000000000000000");
    const processor = new IngestionProcessor(repository, storage, LIMITS);
    const queue = new LocalIngestionJobQueue(async message => { processed.push(message.jobId); return processor.process(message); });
    service = new DirectUploadService(repository, storage, queue, LIMITS, new UploadQuotaService(new DrizzleUploadQuotaStore(db), { ratePerMinute: 30, filesPerDay: 100, bytesPerDay: 1_000_000_000 }));
  }, 30000);
  afterAll(async () => { await closeDatabaseForTests(); if (client) await client.end(); if (root) rmSync(root, { recursive: true, force: true }); });
  const start = (bytes: Buffer, key: string, name = "552100554FEC20241231.txt") => service.start({ organizationId: org, dossierId: dossier, fileName: name, documentType: "fec", contentType: "text/plain", contentLength: bytes.length,
    checksumSha256Base64: createHash("sha256").update(bytes).digest("base64"), idempotencyKey: key, parserVersion: FEC_STREAM_PARSER_VERSION, requestId: randomUUID(), expiresInSeconds: 900 });
  async function settled(jobId: string) {
    for (let i = 0; i < 100; i++) { const r = await repository.getUploadIntent(org, dossier, jobId); if (r && ["completed", "failed", "quarantined"].includes(r.job.status)) return r; await new Promise(res => setTimeout(res, 100)); }
    throw new Error("job non terminé");
  }

  it("intentions simultanées avec la même clé : un seul job ; le rejeu restitue le quota au lieu d'échouer", async () => {
    const bytes = fec(20), key = "c07-double-" + randomUUID();
    const [a, b] = await Promise.all([start(bytes, key), start(bytes, key)]);
    expect(a.jobId).toBe(b.jobId);
    const replay = await start(bytes, key);
    expect(replay.jobId).toBe(a.jobId);
    const [{ n }] = await client`SELECT count(*)::int AS n FROM ingestion_jobs WHERE dossier_id = ${dossier}`;
    expect(n).toBe(1);
  });

  it("envoi, finalisation, traitement local et synthèse persistante ; pièce écrite une fois sur disque", async () => {
    const bytes = fec(50), started = await start(bytes, "c07-nominal-" + randomUUID(), "552100554FEC20241231-b.txt");
    expect(started.upload?.url.startsWith("http://127.0.0.1:3210/api/local/objects?grant=")).toBe(true);
    await storage.receive(new URL(started.upload!.url).searchParams.get("grant")!, "text/plain", new Blob([new Uint8Array(bytes)]).stream());
    expect(await service.complete({ organizationId: org, dossierId: dossier, jobId: started.jobId })).toEqual({ jobId: started.jobId, status: "uploaded" });
    const done = await settled(started.jobId);
    expect(done.job.status).toBe("completed");
    expect(done.document).toMatchObject({ storageProvider: "local", sha256: createHash("sha256").update(bytes).digest("hex"), lineCount: 100 });
    expect(readFileSync(join(root, ...done.document.storageKey.split("/")))).toEqual(bytes);
    const snapshot = await new DrizzleDossierRepository(drizzle(client, { schema })).get({ organizationId: org, dossierId: dossier });
    expect(snapshot?.sourceKind).toBe("persistent");
    expect(snapshot?.sourceDocuments.some(d => d.location?.provider === "local")).toBe(true);
  });

  it("un dépôt reçu mais non publié (arrêt du serveur) est retrouvé dans l'état PostgreSQL et traité", async () => {
    const bytes = fec(30), started = await start(bytes, "c07-reprise-" + randomUUID(), "552100554FEC20241231-c.txt");
    await storage.receive(new URL(started.upload!.url).searchParams.get("grant")!, "text/plain", new Blob([new Uint8Array(bytes)]).stream());
    // Arrêt simulé entre la réception et la publication : l'intention est marquée reçue, rien n'est mis en file.
    const intent = (await repository.getUploadIntent(org, dossier, started.jobId))!;
    await repository.markUploaded(intent, { byteSize: bytes.length, contentType: "text/plain" });
    const pending = await client`SELECT id::text FROM ingestion_jobs WHERE id = ${started.jobId} AND status = 'uploaded' AND queue_published_at IS NULL`;
    expect(pending).toHaveLength(1);
    // La reprise du runtime local lit ce même état (connexion du serveur : DATABASE_URL).
    process.env.DATABASE_URL = databaseUrl; process.env.DATABASE_POOL_SIZE = "2";
    expect((await recoverableLocalJobs(500)).map(j => j.jobId)).toContain(started.jobId);
    // Au redémarrage, la finalisation rejouée par l'écran ou la reprise publie le même job.
    expect(await service.complete({ organizationId: org, dossierId: dossier, jobId: started.jobId })).toEqual({ jobId: started.jobId, status: "uploaded" });
    expect((await settled(started.jobId)).job.status).toBe("completed");
    expect(processed.filter(id => id === started.jobId)).toHaveLength(1);
  });
});
