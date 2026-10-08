import { sql, type SQL } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { WorkpaperRepository } from "./repository";
import { assertScope, contentHash, frozen, validateRun, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { ImportBatch } from "./imports";
import { authorize, type Principal } from "./policy";
import { sha256 } from "@/lib/evidence/hash";
export interface ClientsSql {
    execute(query: SQL): PromiseLike<unknown>;
}
export interface ClientsDatabase extends ClientsSql {
    transaction<T>(body: (tx: ClientsSql) => Promise<T>): Promise<T>;
}
export async function rows<T>(db: ClientsSql, query: SQL): Promise<T[]> { return await db.execute(query) as T[]; }
export function scopeWhere(scope: WorkpaperScope) {
    if (scope.mode !== "real")
        throw new Error("CLIENT_REAL_SCOPE_REQUIRED");
    return sql `organization_id = ${scope.organizationId} AND dossier_id = ${scope.dossierId} AND period_id = ${scope.periodId}`;
}
export class ClientsConflict extends Error {
    constructor(readonly current: WorkpaperRun, readonly expectedVersion: number) { super("STALE_WORKPAPER_VERSION"); }
}
/** Bound to a database transaction; no process-local persistence. */
export class ClientsWorkpaperRepository implements WorkpaperRepository {
    constructor(private readonly tx: ClientsSql) { }
    async get(scope: WorkpaperScope, id: string) {
        const found = await rows<{
            run: WorkpaperRun;
        }>(this.tx, sql `SELECT v.run FROM clients_workpaper_versions v
      JOIN clients_workpaper_heads h USING (organization_id,dossier_id,period_id,id,version)
      WHERE v.organization_id=${scope.organizationId} AND v.dossier_id=${scope.dossierId} AND v.period_id=${scope.periodId} AND v.id=${id}`);
        return found[0] ? frozen(validateRun(found[0].run)) : null;
    }
    async create(run: WorkpaperRun) {
        validateRun(run);
        if (run.scope.mode !== "real" || !["clients.frame", "clients.sales"].includes(run.template.id))
            throw new Error("CLIENT_TEMPLATE_REQUIRED");
        const inserted = await rows(this.tx, sql `INSERT INTO clients_workpaper_heads (organization_id,dossier_id,period_id,id,version)
      VALUES (${run.scope.organizationId},${run.scope.dossierId},${run.scope.periodId},${run.id},${run.version})
      ON CONFLICT DO NOTHING RETURNING id`);
        if (!inserted.length)
            throw new Error("WORKPAPER_ALREADY_EXISTS");
        await this.append(run);
        return frozen(run);
    }
    private async append(run: WorkpaperRun) {
        if (Buffer.byteLength(JSON.stringify(run)) > 3.5 * 1024 * 1024) throw new ApiError("CLIENT_STATE_LIMIT", "Feuille trop volumineuse pour cette recette.", 413);
        await this.tx.execute(sql `INSERT INTO clients_workpaper_versions (organization_id,dossier_id,period_id,id,version,run)
      VALUES (${run.scope.organizationId},${run.scope.dossierId},${run.scope.periodId},${run.id},${run.version},${JSON.stringify(run)}::jsonb)`);
    }
    async compareAndSwap(scope: WorkpaperScope, id: string, version: number, update: (run: WorkpaperRun) => WorkpaperRun) {
        await this.tx.execute(sql `SELECT id FROM clients_workpaper_heads WHERE ${scopeWhere(scope)} AND id=${id} FOR UPDATE`);
        const current = await this.get(scope, id);
        if (!current)
            throw new Error("WORKPAPER_NOT_FOUND");
        if (current.version !== version)
            throw new ClientsConflict(current, version);
        const next = validateRun(update(frozen(current)));
        assertScope(scope, next.scope);
        if (next.id !== id || next.version !== version + 1 || next.template.id !== current.template.id)
            throw new Error("WORKPAPER_VERSION_INVALID");
        if (["approved", "locked", "superseded"].includes(current.state) &&
            (current.state !== "approved" || next.state !== "locked" || contentHash(next) !== contentHash(current)))
            throw new Error("LOCKED_WORKPAPER_IMMUTABLE");
        const changed = await rows(this.tx, sql `UPDATE clients_workpaper_heads SET version=${next.version}
      WHERE ${scopeWhere(scope)} AND id=${id} AND version=${version} RETURNING id`);
        if (changed.length !== 1)
            throw new ClientsConflict(current, version);
        await this.append(next);
        return frozen(next);
    }
    async history(scope: WorkpaperScope, id: string) {
        return (await rows<{
            run: WorkpaperRun;
        }>(this.tx, sql `SELECT run FROM clients_workpaper_versions
      WHERE ${scopeWhere(scope)} AND id=${id} ORDER BY version`)).map((r) => frozen(validateRun(r.run)));
    }
    async revise(scope: WorkpaperScope, id: string, version: number, create: (run: WorkpaperRun) => WorkpaperRun) {
        await this.tx.execute(sql `SELECT id FROM clients_workpaper_heads WHERE ${scopeWhere(scope)} AND id=${id} FOR UPDATE`);
        const current = await this.get(scope, id);
        if (!current)
            throw new Error("WORKPAPER_NOT_FOUND");
        if (current.version !== version)
            throw new ClientsConflict(current, version);
        if (current.state === "superseded")
            throw new Error("REVISION_NOT_ALLOWED");
        const next = validateRun(create(frozen(current)));
        assertScope(scope, next.scope);
        if (next.id !== current.rootId + ":r" + (current.revision + 1) || next.rootId !== current.rootId ||
            next.revision !== current.revision + 1 || next.supersedes !== current.id || next.version !== 1 || next.state !== "draft" ||
            next.result || next.approval || next.submittedHash || next.population || next.selection || next.importIds.length)
            throw new Error("REVISION_INVALID");
        return this.create(next);
    }
    async projection(): Promise<DossierSnapshot | null> { return null; }
    async lockAndProject(): Promise<DossierSnapshot> { throw new Error("CLIENT_PROJECTION_OUT_OF_SCOPE"); }
}
export class ClientsImports {
    constructor(readonly batches: ImportBatch[], private readonly originals: Map<string, string>) { }
    get(scope: WorkpaperScope, id: string, principal: Principal) {
        authorize(principal, scope, "read");
        const batch = this.batches.find((b) => b.id === id);
        if (!batch)
            throw new Error("IMPORT_NOT_FOUND");
        assertScope(scope, batch.scope);
        return frozen(batch);
    }
    download(scope: WorkpaperScope, id: string, principal: Principal) {
        authorize(principal, scope, "download");
        const batch = this.batches.find((b) => b.document.id === id);
        if (!batch)
            return null;
        assertScope(scope, batch.scope);
        const bytes = Buffer.from(this.originals.get(batch.id)!, "base64");
        if (sha256(bytes) !== batch.document.byteHash)
            throw new Error("SOURCE_BYTES_CHANGED");
        return Uint8Array.from(bytes);
    }
    static async load(tx: ClientsSql, scope: WorkpaperScope) {
        const data = await rows<{
            preview: ImportBatch;
            original_base64: string;
            actor_id: string | null;
            approved_at: Date | string | null;
            preview_hash: string | null;
        }>(tx, sql `SELECT i.preview,i.original_base64,a.actor_id,a.approved_at,a.preview_hash FROM clients_imports i
       LEFT JOIN clients_import_approvals a ON i.organization_id=a.organization_id AND i.dossier_id=a.dossier_id AND i.period_id=a.period_id AND i.id=a.import_id
       WHERE i.organization_id=${scope.organizationId} AND i.dossier_id=${scope.dossierId} AND i.period_id=${scope.periodId}`);
        return new ClientsImports(data.map((r) => r.actor_id ? { ...r.preview, approval: { actorId: r.actor_id, at: new Date(r.approved_at!).toISOString(), previewHash: r.preview_hash! },
            report: { ...r.preview.report, calculationAllowed: true } } : r.preview), new Map(data.map((r) => [r.preview.id, r.original_base64])));
    }
}
