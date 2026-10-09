import { sql, type SQL } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { sha256 } from "@/lib/evidence/hash";
import type { ImportBatch } from "./imports";
import { assertScope, contentHash, frozen, validateRun, type WorkpaperRun, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import type { WorkpaperRepository } from "./repository";
import { STOCK_PROCEDURE } from "./stock-contract";

/** Persistence port of the stock chain (Mission 15). The runtime never writes SQL; PostgreSQL is the only durable adapter. */
export type StockSourceHead = { document_type: string; import_id: string };
export interface StockImportRecord { batch: ImportBatch; originalBase64: string }
export interface StockTx {
  ownsDossierForUpdate(scope: WorkpaperScope): Promise<boolean>;
  dossierCreatedAt(scope: WorkpaperScope): Promise<string | null>;
  sizes(scope: WorkpaperScope): Promise<{ versions: number; versionBytes: number; sourceBytes: number }>;
  imports(scope: WorkpaperScope): Promise<StockImportRecord[]>;
  insertImport(scope: WorkpaperScope, documentType: string, batch: ImportBatch, originalBase64: string): Promise<void>;
  approveImport(scope: WorkpaperScope, importId: string, actorId: string, at: string, previewHash: string): Promise<void>;
  heads(scope: WorkpaperScope): Promise<StockSourceHead[]>;
  setHead(scope: WorkpaperScope, documentType: string, importId: string): Promise<void>;
  lockRun(scope: WorkpaperScope, id: string): Promise<void>;
  currentRun(scope: WorkpaperScope, id: string): Promise<WorkpaperRun | null>;
  runIds(scope: WorkpaperScope): Promise<string[]>;
  insertRunHead(scope: WorkpaperScope, id: string, version: number): Promise<boolean>;
  moveRunHead(scope: WorkpaperScope, id: string, from: number, to: number): Promise<boolean>;
  appendVersion(run: WorkpaperRun): Promise<void>;
  history(scope: WorkpaperScope, id: string): Promise<WorkpaperRun[]>;
  allVersions(scope: WorkpaperScope): Promise<WorkpaperRun[]>;
  receipt(scope: WorkpaperScope, actorId: string, key: string): Promise<{ requestHash: string; response: unknown } | null>;
  putReceipt(scope: WorkpaperScope, actorId: string, key: string, requestHash: string, response: unknown): Promise<void>;
}
export interface StockDatabase { transaction<T>(body: (tx: StockTx) => Promise<T>): Promise<T> }

export interface StockSql { execute(query: SQL): PromiseLike<unknown> }
export interface StockSqlDatabase extends StockSql { transaction<T>(body: (tx: StockSql) => Promise<T>): Promise<T> }
async function rows<T>(db: StockSql, query: SQL): Promise<T[]> { return await db.execute(query) as T[]; }
function where(scope: WorkpaperScope) {
  if (scope.mode !== "real") throw new Error("ST_REAL_SCOPE_REQUIRED");
  return sql`organization_id = ${scope.organizationId} AND dossier_id = ${scope.dossierId} AND period_id = ${scope.periodId}`;
}
class PostgresStockTx implements StockTx {
  constructor(private readonly tx: StockSql) {}
  async ownsDossierForUpdate(scope: WorkpaperScope) {
    // Shared dossier lock serializes source replacement, commands and idempotency across server instances.
    return (await rows(this.tx, sql`SELECT id FROM dossiers WHERE id=${scope.dossierId} AND organization_id=${scope.organizationId} FOR UPDATE`)).length > 0;
  }
  async dossierCreatedAt(scope: WorkpaperScope) {
    const [row] = await rows<{ created_at: Date | string }>(this.tx, sql`SELECT created_at FROM dossiers WHERE id=${scope.dossierId} AND organization_id=${scope.organizationId}`);
    return row ? new Date(row.created_at).toISOString() : null;
  }
  async sizes(scope: WorkpaperScope) {
    const [versions] = await rows<{ count: string; bytes: string }>(this.tx, sql`SELECT count(*)::text AS count, coalesce(sum(octet_length(run::text)),0)::text AS bytes FROM st_workpaper_versions WHERE ${where(scope)}`);
    const [sources] = await rows<{ bytes: string }>(this.tx, sql`SELECT coalesce(sum(octet_length(preview::text)+octet_length(original_base64)),0)::text AS bytes FROM st_imports WHERE ${where(scope)}`);
    return { versions: Number(versions.count), versionBytes: Number(versions.bytes), sourceBytes: Number(sources.bytes) };
  }
  async imports(scope: WorkpaperScope) {
    const data = await rows<{ preview: ImportBatch; original_base64: string; actor_id: string | null; approved_at: Date | string | null; preview_hash: string | null }>(this.tx, sql`SELECT i.preview,i.original_base64,a.actor_id,a.approved_at,a.preview_hash FROM st_imports i
      LEFT JOIN st_import_approvals a ON i.organization_id=a.organization_id AND i.dossier_id=a.dossier_id AND i.period_id=a.period_id AND i.id=a.import_id
      WHERE i.organization_id=${scope.organizationId} AND i.dossier_id=${scope.dossierId} AND i.period_id=${scope.periodId} ORDER BY i.id`);
    return data.map(r => ({ originalBase64: r.original_base64, batch: r.actor_id ? { ...r.preview, approval: { actorId: r.actor_id, at: new Date(r.approved_at!).toISOString(), previewHash: r.preview_hash! }, report: { ...r.preview.report, calculationAllowed: true } } : r.preview }));
  }
  async insertImport(scope: WorkpaperScope, documentType: string, batch: ImportBatch, originalBase64: string) {
    await this.tx.execute(sql`INSERT INTO st_imports (organization_id,dossier_id,period_id,id,document_type,preview,original_base64)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${batch.id},${documentType},${JSON.stringify(batch)}::jsonb,${originalBase64}) ON CONFLICT DO NOTHING`);
  }
  async approveImport(scope: WorkpaperScope, importId: string, actorId: string, at: string, previewHash: string) {
    await this.tx.execute(sql`INSERT INTO st_import_approvals (organization_id,dossier_id,period_id,import_id,actor_id,approved_at,preview_hash)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${importId},${actorId},${at},${previewHash}) ON CONFLICT DO NOTHING`);
  }
  async heads(scope: WorkpaperScope) { return rows<StockSourceHead>(this.tx, sql`SELECT document_type,import_id FROM st_source_heads WHERE ${where(scope)} ORDER BY document_type`); }
  async setHead(scope: WorkpaperScope, documentType: string, importId: string) {
    await this.tx.execute(sql`INSERT INTO st_source_heads (organization_id,dossier_id,period_id,document_type,import_id)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${documentType},${importId})
      ON CONFLICT (organization_id,dossier_id,period_id,document_type) DO UPDATE SET import_id=excluded.import_id`);
  }
  async lockRun(scope: WorkpaperScope, id: string) { await this.tx.execute(sql`SELECT id FROM st_workpaper_heads WHERE ${where(scope)} AND id=${id} FOR UPDATE`); }
  async currentRun(scope: WorkpaperScope, id: string) {
    const [found] = await rows<{ run: WorkpaperRun }>(this.tx, sql`SELECT v.run FROM st_workpaper_versions v JOIN st_workpaper_heads h USING (organization_id,dossier_id,period_id,id,version)
      WHERE v.organization_id=${scope.organizationId} AND v.dossier_id=${scope.dossierId} AND v.period_id=${scope.periodId} AND v.id=${id}`);
    return found?.run ?? null;
  }
  async runIds(scope: WorkpaperScope) { return (await rows<{ id: string }>(this.tx, sql`SELECT id FROM st_workpaper_heads WHERE ${where(scope)} ORDER BY id`)).map(r => r.id); }
  async insertRunHead(scope: WorkpaperScope, id: string, version: number) {
    return (await rows(this.tx, sql`INSERT INTO st_workpaper_heads (organization_id,dossier_id,period_id,id,version) VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${id},${version}) ON CONFLICT DO NOTHING RETURNING id`)).length === 1;
  }
  async moveRunHead(scope: WorkpaperScope, id: string, from: number, to: number) {
    return (await rows(this.tx, sql`UPDATE st_workpaper_heads SET version=${to} WHERE ${where(scope)} AND id=${id} AND version=${from} RETURNING id`)).length === 1;
  }
  async appendVersion(run: WorkpaperRun) {
    await this.tx.execute(sql`INSERT INTO st_workpaper_versions (organization_id,dossier_id,period_id,id,version,run) VALUES (${run.scope.organizationId},${run.scope.dossierId},${run.scope.periodId},${run.id},${run.version},${JSON.stringify(run)}::jsonb)`);
  }
  async history(scope: WorkpaperScope, id: string) { return (await rows<{ run: WorkpaperRun }>(this.tx, sql`SELECT run FROM st_workpaper_versions WHERE ${where(scope)} AND id=${id} ORDER BY version`)).map(r => r.run); }
  async allVersions(scope: WorkpaperScope) { return (await rows<{ run: WorkpaperRun }>(this.tx, sql`SELECT run FROM st_workpaper_versions WHERE ${where(scope)} ORDER BY id,version`)).map(r => r.run); }
  async receipt(scope: WorkpaperScope, actorId: string, key: string) {
    const [found] = await rows<{ request_hash: string; response: unknown }>(this.tx, sql`SELECT request_hash,response FROM st_command_receipts WHERE ${where(scope)} AND actor_id=${actorId} AND idempotency_key=${key}`);
    return found ? { requestHash: found.request_hash, response: found.response } : null;
  }
  async putReceipt(scope: WorkpaperScope, actorId: string, key: string, requestHash: string, response: unknown) {
    await this.tx.execute(sql`INSERT INTO st_command_receipts (organization_id,dossier_id,period_id,actor_id,idempotency_key,request_hash,response)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${actorId},${key},${requestHash},${JSON.stringify(response)}::jsonb)`);
  }
}
export class PostgresStockDatabase implements StockDatabase {
  constructor(private readonly db: StockSqlDatabase) {}
  transaction<T>(body: (tx: StockTx) => Promise<T>) { return this.db.transaction(tx => body(new PostgresStockTx(tx))); }
}

export class StockConflict extends Error {
  constructor(readonly current: WorkpaperRun, readonly expectedVersion: number) { super("STALE_WORKPAPER_VERSION"); }
}
/** Versioned workpaper repository bound to one transaction; older versions are appended, never rewritten. */
export class StockWorkpaperRepository implements WorkpaperRepository {
  constructor(private readonly tx: StockTx) {}
  async get(scope: WorkpaperScope, id: string) { const run = await this.tx.currentRun(scope, id); return run ? frozen(validateRun(run)) : null; }
  async create(run: WorkpaperRun) {
    validateRun(run);
    if (run.scope.mode !== "real" || run.template.id !== STOCK_PROCEDURE) throw new Error("ST_TEMPLATE_REQUIRED");
    if (!(await this.tx.insertRunHead(run.scope, run.id, run.version))) throw new Error("WORKPAPER_ALREADY_EXISTS");
    await this.append(run); return frozen(run);
  }
  private async append(run: WorkpaperRun) {
    if (Buffer.byteLength(JSON.stringify(run)) > 3.5 * 1024 * 1024) throw new ApiError("ST_STATE_LIMIT", "Feuille trop volumineuse pour cette recette.", 413);
    await this.tx.appendVersion(run);
  }
  async compareAndSwap(scope: WorkpaperScope, id: string, version: number, update: (run: WorkpaperRun) => WorkpaperRun) {
    await this.tx.lockRun(scope, id);
    const current = await this.get(scope, id);
    if (!current) throw new Error("WORKPAPER_NOT_FOUND");
    if (current.version !== version) throw new StockConflict(current, version);
    const next = validateRun(update(frozen(current)));
    assertScope(scope, next.scope);
    if (next.id !== id || next.version !== version + 1 || next.template.id !== current.template.id) throw new Error("WORKPAPER_VERSION_INVALID");
    if (["approved", "locked", "superseded"].includes(current.state) && (current.state !== "approved" || next.state !== "locked" || contentHash(next) !== contentHash(current))) throw new Error("LOCKED_WORKPAPER_IMMUTABLE");
    if (!(await this.tx.moveRunHead(scope, id, version, next.version))) throw new StockConflict(current, version);
    await this.append(next); return frozen(next);
  }
  async history(scope: WorkpaperScope, id: string) { return (await this.tx.history(scope, id)).map(r => frozen(validateRun(r))); }
  async revise(scope: WorkpaperScope, id: string, version: number, create: (run: WorkpaperRun) => WorkpaperRun) {
    await this.tx.lockRun(scope, id);
    const current = await this.get(scope, id);
    if (!current) throw new Error("WORKPAPER_NOT_FOUND");
    if (current.version !== version) throw new StockConflict(current, version);
    if (current.state === "superseded") throw new Error("REVISION_NOT_ALLOWED");
    const next = validateRun(create(frozen(current)));
    assertScope(scope, next.scope);
    if (next.id !== current.rootId + ":r" + (current.revision + 1) || next.rootId !== current.rootId || next.revision !== current.revision + 1 || next.supersedes !== current.id || next.version !== 1 || next.state !== "draft"
      // A stock revision restarts from the current sources: no work, population, result or decision is carried over.
      || next.result || next.approval || next.submittedHash || next.population || next.selection || next.importIds.length || next.stockWork) throw new Error("REVISION_INVALID");
    return this.create(next);
  }
  async projection(): Promise<DossierSnapshot | null> { return null; }
  async lockAndProject(): Promise<DossierSnapshot> { throw new Error("ST_PROJECTION_OUT_OF_SCOPE"); }
}
export class StockImports {
  constructor(readonly batches: ImportBatch[], private readonly originals: Map<string, string>) {}
  static from(records: StockImportRecord[]) { return new StockImports(records.map(r => r.batch), new Map(records.map(r => [r.batch.id, r.originalBase64]))); }
  get(scope: WorkpaperScope, id: string, principal: Principal) {
    authorize(principal, scope, "read");
    const batch = this.batches.find(b => b.id === id);
    if (!batch) throw new Error("IMPORT_NOT_FOUND");
    assertScope(scope, batch.scope); return frozen(batch);
  }
  download(scope: WorkpaperScope, documentId: string, principal: Principal) {
    authorize(principal, scope, "download");
    const batch = this.batches.find(b => b.document.id === documentId);
    if (!batch) return null;
    assertScope(scope, batch.scope);
    const bytes = Buffer.from(this.originals.get(batch.id)!, "base64");
    if (sha256(bytes) !== batch.document.byteHash) throw new Error("SOURCE_BYTES_CHANGED");
    return Uint8Array.from(bytes);
  }
}
