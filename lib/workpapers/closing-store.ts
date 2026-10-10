import { sql, type SQL } from "drizzle-orm";
import type { WorkpaperRun, WorkpaperScope } from "./model";
import { CL_FAMILIES, type CycleFamily } from "./closing-contract";
import type { ClosingEvent } from "./closing-journal";

/**
 * Persistence port of the professional file (Mission 19): an append-only journal, piece originals and idempotency receipts.
 * The cycle sheets are only read (current head of each run); the file never writes to a cycle table. PostgreSQL is the only durable adapter.
 */
export interface ClosingTx {
  ownsDossierForUpdate(scope: WorkpaperScope): Promise<boolean>;
  events(scope: WorkpaperScope): Promise<ClosingEvent[]>;
  /** Inserts the event at its sequence number; false when another writer already took it. */
  appendEvent(scope: WorkpaperScope, event: ClosingEvent): Promise<boolean>;
  insertPiece(scope: WorkpaperScope, pieceVersionId: string, sha256: string, base64: string): Promise<void>;
  pieceBytes(scope: WorkpaperScope, pieceVersionId: string): Promise<{ sha256: string; base64: string } | null>;
  sizes(scope: WorkpaperScope): Promise<{ events: number; eventBytes: number; pieceBytes: number }>;
  receipt(scope: WorkpaperScope, actorId: string, key: string): Promise<{ requestHash: string; response: unknown } | null>;
  putReceipt(scope: WorkpaperScope, actorId: string, key: string, requestHash: string, response: unknown): Promise<void>;
  cycleRuns(scope: WorkpaperScope): Promise<{ family: CycleFamily; run: WorkpaperRun }[]>;
}
export interface ClosingDatabase { transaction<T>(body: (tx: ClosingTx) => Promise<T>): Promise<T> }

export interface ClosingSql { execute(query: SQL): PromiseLike<unknown> }
export interface ClosingSqlDatabase extends ClosingSql { transaction<T>(body: (tx: ClosingSql) => Promise<T>): Promise<T> }
async function rows<T>(db: ClosingSql, query: SQL): Promise<T[]> { return await db.execute(query) as T[]; }
function where(scope: WorkpaperScope) {
  if (scope.mode !== "real") throw new Error("CL_REAL_SCOPE_REQUIRED");
  return sql`organization_id = ${scope.organizationId} AND dossier_id = ${scope.dossierId} AND period_id = ${scope.periodId}`;
}
/** Cycle tables are named from a closed list, never from a request. */
const FAMILY_TABLES: Record<CycleFamily, { heads: SQL; versions: SQL }> = Object.fromEntries(CL_FAMILIES.map(f => [f, { heads: sql.raw(f + "_workpaper_heads"), versions: sql.raw(f + "_workpaper_versions") }])) as never;

class PostgresClosingTx implements ClosingTx {
  constructor(private readonly tx: ClosingSql) {}
  async ownsDossierForUpdate(scope: WorkpaperScope) {
    // The dossier row lock serializes every writer of the file across server instances.
    return (await rows(this.tx, sql`SELECT id FROM dossiers WHERE id=${scope.dossierId} AND organization_id=${scope.organizationId} FOR UPDATE`)).length > 0;
  }
  async events(scope: WorkpaperScope) {
    const data = await rows<{ seq: number; id: string; type: ClosingEvent["type"]; actor_id: string; at: string; payload: Record<string, unknown>; prev_hash: string; hash: string }>(this.tx,
      sql`SELECT seq,id,type,actor_id,at,payload,prev_hash,hash FROM cl_events WHERE ${where(scope)} ORDER BY seq`);
    return data.map(r => ({ seq: Number(r.seq), id: r.id, type: r.type, actorId: r.actor_id, at: r.at, payload: r.payload, prevHash: r.prev_hash, hash: r.hash }));
  }
  async appendEvent(scope: WorkpaperScope, e: ClosingEvent) {
    return (await rows(this.tx, sql`INSERT INTO cl_events (organization_id,dossier_id,period_id,seq,id,type,actor_id,at,payload,prev_hash,hash)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${e.seq},${e.id},${e.type},${e.actorId},${e.at},${JSON.stringify(e.payload)}::jsonb,${e.prevHash},${e.hash}) ON CONFLICT DO NOTHING RETURNING seq`)).length === 1;
  }
  async insertPiece(scope: WorkpaperScope, pieceVersionId: string, sha256: string, base64: string) {
    await this.tx.execute(sql`INSERT INTO cl_pieces (organization_id,dossier_id,period_id,piece_version_id,sha256,original_base64)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${pieceVersionId},${sha256},${base64})`);
  }
  async pieceBytes(scope: WorkpaperScope, pieceVersionId: string) {
    const [found] = await rows<{ sha256: string; original_base64: string }>(this.tx, sql`SELECT sha256,original_base64 FROM cl_pieces WHERE ${where(scope)} AND piece_version_id=${pieceVersionId}`);
    return found ? { sha256: found.sha256, base64: found.original_base64 } : null;
  }
  async sizes(scope: WorkpaperScope) {
    const [events] = await rows<{ count: string; bytes: string }>(this.tx, sql`SELECT count(*)::text AS count, coalesce(sum(octet_length(payload::text)),0)::text AS bytes FROM cl_events WHERE ${where(scope)}`);
    const [pieces] = await rows<{ bytes: string }>(this.tx, sql`SELECT coalesce(sum(octet_length(original_base64)),0)::text AS bytes FROM cl_pieces WHERE ${where(scope)}`);
    return { events: Number(events.count), eventBytes: Number(events.bytes), pieceBytes: Number(pieces.bytes) };
  }
  async receipt(scope: WorkpaperScope, actorId: string, key: string) {
    const [found] = await rows<{ request_hash: string; response: unknown }>(this.tx, sql`SELECT request_hash,response FROM cl_command_receipts WHERE ${where(scope)} AND actor_id=${actorId} AND idempotency_key=${key}`);
    return found ? { requestHash: found.request_hash, response: found.response } : null;
  }
  async putReceipt(scope: WorkpaperScope, actorId: string, key: string, requestHash: string, response: unknown) {
    await this.tx.execute(sql`INSERT INTO cl_command_receipts (organization_id,dossier_id,period_id,actor_id,idempotency_key,request_hash,response)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${actorId},${key},${requestHash},${JSON.stringify(response)}::jsonb)`);
  }
  async cycleRuns(scope: WorkpaperScope) {
    const out: { family: CycleFamily; run: WorkpaperRun }[] = [];
    for (const family of CL_FAMILIES) {
      const t = FAMILY_TABLES[family];
      const data = await rows<{ run: WorkpaperRun }>(this.tx, sql`SELECT v.run FROM ${t.versions} v JOIN ${t.heads} h USING (organization_id,dossier_id,period_id,id,version)
        WHERE v.organization_id=${scope.organizationId} AND v.dossier_id=${scope.dossierId} AND v.period_id=${scope.periodId} ORDER BY v.id`);
      out.push(...data.map(r => ({ family, run: r.run })));
    }
    return out;
  }
}
export class PostgresClosingDatabase implements ClosingDatabase {
  constructor(private readonly db: ClosingSqlDatabase) {}
  transaction<T>(body: (tx: ClosingTx) => Promise<T>) { return this.db.transaction(tx => body(new PostgresClosingTx(tx))); }
}
/** Optimistic concurrency: the browser wrote against an older journal head. */
export class ClosingConflict extends Error {
  constructor(readonly currentSeq: number, readonly expectedSeq: number) { super("CL_STALE_SEQ"); }
}
