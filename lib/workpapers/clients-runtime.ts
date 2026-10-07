import { buildClientMission, type MissionSelection } from "./client-mission";
import { buildClientMissionPackage, type ClientExportKind } from "@/lib/evidence/client-mission-package";
import { sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { neutralizeFileName } from "@/lib/security/filename";
import { previewImport, type ImportMapping } from "./imports";
import { CLIENT_FRAME_TEMPLATE, CLIENT_TYPES, ClientsFramingRegistry, assertClientsBatch } from "./clients-adapter";
import { ClientsImports, ClientsWorkpaperRepository, rows, scopeWhere, type ClientsDatabase, type ClientsSql } from "./clients-persistence";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import { type Principal, type Permission } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";
import type { ClientsCommand } from "./clients-commands";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
export class ClientsRuntime {
    constructor(private readonly db: ClientsDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) { }
    async check(request: Request, dossierId: string, permission: Permission) { await this.identity(request, dossierId, permission); }
    private async identity(request: Request, dossierId: string, permission: Permission) {
        const identity = await this.authorizer.authorize(request, { dossierId, permission: permissions[permission] });
        assertDossierPermission(identity, dossierId, permissions[permission]);
        if (isExpired(identity, this.now()))
            throw new Error("SESSION_INVALID");
        return identity;
    }
    private actor(identity: AuthenticatedPrincipal, scope: WorkpaperScope): Principal {
        return { id: identity.subject, grants: [{ scope, permissions: (Object.keys(permissions) as Permission[]).filter((p) => hasPermission(identity.roles, permissions[p])) }] };
    }
    private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: ClientsSql, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
        const identity = await this.identity(request, dossierId, permission);
        const scope: WorkpaperScope = { organizationId: identity.organizationId, dossierId, periodId: pid, mode: "real" };
        return this.db.transaction(async (tx) => {
            // Shared dossier lock serializes source replacement, commands, and idempotency across server instances.
            const owned = await rows(tx, sql `SELECT id FROM dossiers WHERE id=${dossierId} AND organization_id=${identity.organizationId} FOR UPDATE`);
            if (!owned.length)
                throw new Error("WORKPAPER_FORBIDDEN");
            if (isExpired(identity, this.now()))
                throw new Error("SESSION_INVALID");
            const result = await body(tx, scope, this.actor(identity, scope));
            if (isExpired(identity, this.now()))
                throw new Error("SESSION_INVALID");
            return result;
        });
    }
    private async receipt<T>(tx: ClientsSql, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
        if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key))
            throw new Error("IDEMPOTENCY_KEY_REQUIRED");
        const hash = stableSha256(payload);
        const existing = await rows<{
            request_hash: string;
            response: T;
        }>(tx, sql `SELECT request_hash,response FROM clients_command_receipts WHERE ${scopeWhere(scope)} AND actor_id=${actor.id} AND idempotency_key=${key}`);
        if (existing[0]) {
            if (existing[0].request_hash !== hash)
                throw new Error("IDEMPOTENCY_KEY_REUSED");
            return existing[0].response;
        }
        const response = await body();
        await tx.execute(sql `INSERT INTO clients_command_receipts (organization_id,dossier_id,period_id,actor_id,idempotency_key,request_hash,response)
      VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${actor.id},${key},${hash},${JSON.stringify(response)}::jsonb)`);
        return response;
    }
    private heads(tx: ClientsSql, scope: WorkpaperScope) {
        return rows<{
            document_type: string;
            import_id: string;
        }>(tx, sql `SELECT document_type,import_id FROM clients_source_heads WHERE ${scopeWhere(scope)}`);
    }
    private async assertCurrent(tx: ClientsSql, scope: WorkpaperScope, run: WorkpaperRun) {
        const heads = await this.heads(tx, scope);
        if (run.importIds.some((id) => !heads.some((h) => h.import_id === id)))
            throw new Error("CLIENT_SOURCE_REPLACED_REVISION_REQUIRED");
    }
    async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
        return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
            const repository = new ClientsWorkpaperRepository(tx), imports = await ClientsImports.load(tx, scope), heads = await this.heads(tx, scope);
            const ids = id ? [{ id }] : await rows<{
                id: string;
            }>(tx, sql `SELECT id FROM clients_workpaper_heads WHERE ${scopeWhere(scope)} ORDER BY id`);
            const currentRuns = (await Promise.all(ids.map((r) => repository.get(scope, r.id)))).filter((r): r is WorkpaperRun => !!r);
            const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
            if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
            const lineageHeads = await rows<{ id: string; version: number; root_id: string; revision: number }>(tx, sql`SELECT h.id,h.version,v.run->>'rootId' AS root_id,(v.run->>'revision')::int AS revision FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId}`);
            const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
            for (const h of lineageHeads) if (!lineageCurrent[h.root_id] || h.revision > lineageCurrent[h.root_id].revision) lineageCurrent[h.root_id] = { id: h.id, version: h.version, revision: h.revision };
            return { actorId: actor.id, permissions: actor.grants[0].permissions, runs, lineageCurrent, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id,r.version])), imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: heads,
                sourcesCurrent: Object.fromEntries(runs.map((r) => [r.id, r.importIds.every((i) => heads.some((h) => h.import_id === i))])),
                ...(history && id ? { history: await repository.history(scope, id) } : {}) };
        });
    }
    private async missionData(tx: ClientsSql, scope: WorkpaperScope, selection: MissionSelection) {
        // Bounds apply before materializing the immutable history; no alternative store is used.
        const [size] = await rows<{ count: string; bytes: string }>(tx, sql`SELECT count(*)::text AS count, coalesce(sum(octet_length(run::text)),0)::text AS bytes FROM clients_workpaper_versions WHERE ${scopeWhere(scope)}`);
        if (Number(size.count) > 500 || Number(size.bytes) > 24 * 1024 * 1024) throw new ApiError("CLIENT_MISSION_LIMIT", "Historique trop volumineux pour cette recette.", 413);
        const [sourceSize] = await rows<{ bytes: string }>(tx, sql`SELECT coalesce(sum(octet_length(preview::text) + octet_length(original_base64)),0)::text AS bytes FROM clients_imports WHERE ${scopeWhere(scope)}`);
        if (Number(sourceSize.bytes) > 24 * 1024 * 1024) throw new ApiError("CLIENT_MISSION_LIMIT", "Sources trop volumineuses pour cette recette.", 413);
        const versions = (await rows<{ run: WorkpaperRun }>(tx, sql`SELECT run FROM clients_workpaper_versions WHERE ${scopeWhere(scope)} ORDER BY id,version`)).map(r => r.run);
        const imports = await ClientsImports.load(tx, scope), heads = await this.heads(tx, scope);
        const [dossier] = await rows<{ created_at: Date | string }>(tx, sql`SELECT created_at FROM dossiers WHERE id=${scope.dossierId} AND organization_id=${scope.organizationId}`);
        if (!dossier) throw new Error("WORKPAPER_NOT_FOUND");
        const mission = buildClientMission(scope, versions, imports.batches, heads, selection, new Date(dossier.created_at).toISOString());
        const run = versions.find(r => r.id === mission.procedure.runId && r.version === mission.procedure.version) ?? null;
        if (Buffer.byteLength(JSON.stringify(mission)) > 8 * 1024 * 1024) throw new ApiError("CLIENT_MISSION_LIMIT", "Synthèse trop volumineuse pour cette recette.", 413);
        return { mission, run, imports: imports.batches };
    }
    async mission(request: Request, dossierId: string, pid: string, selection: MissionSelection = {}) {
        return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
            const { mission } = await this.missionData(tx, scope, selection);
            return { actorId: actor.id, permissions: actor.grants[0].permissions, mission };
        });
    }
    async missionExport(request: Request, dossierId: string, pid: string, selection: MissionSelection, kind: ClientExportKind, expectedSnapshotHash: string) {
        const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
            const data = await this.missionData(tx, scope, selection);
            if (data.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
            return data;
        });
        const pack = await buildClientMissionPackage(data.mission, data.run, data.imports, kind, data.mission.stateAsOf!);
        if (Buffer.byteLength(pack.canonicalJson) > 16 * 1024 * 1024 || pack.pdf.byteLength > 16 * 1024 * 1024 || Buffer.byteLength(pack.html) > 16 * 1024 * 1024) throw new ApiError("CLIENT_EXPORT_LIMIT", "Export trop volumineux pour cette recette.", 413);
        // Recheck session, permissions and version after rendering, before returning any bytes.
        await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
            const latest = await this.missionData(tx, scope, selection);
            if (latest.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
        });
        return pack;
    }
    async download(request: Request, dossierId: string, pid: string, documentId: string) {
        return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => (await ClientsImports.load(tx, scope)).download(scope, documentId, actor));
    }
    async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: typeof CLIENT_TYPES[number], key: string) {
        return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
            if (file.size > 3 * 1024 * 1024) throw new ApiError("CLIENT_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
            const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
            let batch = await previewImport(safeFile, scope, mapping, actor, type, "clients.frame");
            assertClientsBatch(batch, period.closingDate);
            if (Buffer.byteLength(JSON.stringify(batch)) > 3 * 1024 * 1024) throw new ApiError("CLIENT_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
            const { previewHash: _hash, ...base } = batch;
            void _hash;
            base.document = { ...base.document, logicalId: type, storageRef: "postgres-clients:" + batch.id };
            batch = { ...base, previewHash: stableSha256(base) };
            return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: batch.previewHash }, async () => {
                await tx.execute(sql `INSERT INTO clients_imports (organization_id,dossier_id,period_id,id,document_type,preview,original_base64)
          VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${batch.id},${type},${JSON.stringify(batch)}::jsonb,${Buffer.from(await safeFile.arrayBuffer()).toString("base64")}) ON CONFLICT DO NOTHING`);
                return { batch: (await ClientsImports.load(tx, scope)).get(scope, batch.id, actor) };
            });
        });
    }
    async approveImport(request: Request, dossierId: string, pid: string, command: {
        importId: string;
        previewHash: string;
        expectedSourceId: string | null;
    }, key: string) {
        return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
            const imports = await ClientsImports.load(tx, scope), batch = imports.get(scope, command.importId, actor);
            if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length)
                throw new Error("IMPORT_REJECTED_OR_STALE");
            const head = (await this.heads(tx, scope)).find((h) => h.document_type === batch.document.documentType)?.import_id ?? null;
            if (batch.approval && head !== batch.id)
                throw new Error("CLIENT_SOURCE_REPLACED_REVISION_REQUIRED");
            if (head !== command.expectedSourceId)
                throw new Error("CLIENT_SOURCE_HEAD_CONFLICT");
            const at = new Date(this.now() * 1000).toISOString();
            await tx.execute(sql `INSERT INTO clients_import_approvals (organization_id,dossier_id,period_id,import_id,actor_id,approved_at,preview_hash)
        VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${batch.id},${actor.id},${at},${batch.previewHash}) ON CONFLICT DO NOTHING`);
            await tx.execute(sql `INSERT INTO clients_source_heads (organization_id,dossier_id,period_id,document_type,import_id)
        VALUES (${scope.organizationId},${scope.dossierId},${scope.periodId},${batch.document.documentType},${batch.id})
        ON CONFLICT (organization_id,dossier_id,period_id,document_type) DO UPDATE SET import_id=excluded.import_id`);
            return { batch: (await ClientsImports.load(tx, scope)).get(scope, batch.id, actor) };
        }));
    }
    async command(request: Request, dossierId: string, pid: string, command: ClientsCommand, key: string) {
        const permission = ["review", "lock"].includes(command.command) ? "review" : "prepare";
        return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
            const imports = await ClientsImports.load(tx, scope), repository = new ClientsWorkpaperRepository(tx);
            const service = new WorkpaperService(repository, imports, new ClientsFramingRegistry(), async () => actor, () => new Date(this.now() * 1000).toISOString(), "clients.frame");
            if (command.command === "create") {
                if (periodId(command.period) !== pid)
                    throw new Error("WORKPAPER_PERIOD_INVALID");
                return { run: await service.create(scope, command.period, CLIENT_FRAME_TEMPLATE, command.instanceKey) };
            }
            const current = await service.get(scope, command.id);
            if (!current)
                throw new Error("WORKPAPER_NOT_FOUND");
            if (command.command !== "revise")
                await this.assertCurrent(tx, scope, current);
            const id = command.id, v = command.expectedVersion;
            let run: WorkpaperRun;
            switch (command.command) {
                case "freeze": {
                    const batches = command.importIds.map((i) => imports.get(scope, i, actor));
                    const heads = await this.heads(tx, scope);
                    if (CLIENT_TYPES.some((t) => batches.filter((b) => b.document.documentType === t).length !== 1) || batches.some((b) => !heads.some((h) => h.import_id === b.id)))
                        throw new Error("CLIENT_CURRENT_THREE_SOURCES_REQUIRED");
                    batches.forEach((b) => assertClientsBatch(b, current.period.closingDate));
                    const population = freezePopulation(scope, batches, "row", actor);
                    const selection = selectPopulation(population, { method: "targeted", criteria: "Population complète du cadrage Clients", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map((i) => i.id) }, actor);
                    run = await service.attachInputs(scope, id, v, population, selection);
                    for (const batch of batches)
                        run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source du cadrage Clients");
                    run = await service.transition(scope, id, run.version, "ready");
                    break;
                }
                case "execute":
                    run = await service.execute(scope, id, v, {});
                    if (run.state === "executed" && run.result?.outcome !== "no_exception_detected")
                        run = await service.addNote(scope, id, run.version, {
                            id: "clients-frame-exception:" + run.result!.inputHash, kind: "observation", text: "Écarts ou périmètre incomplet dans le cadrage : examiner les lignes et documenter leur traitement.",
                            amount: { kind: "unknown", reason: "Voir les résidus exacts des deux rapprochements ; aucune compensation." }, blocking: true
                        });
                    break;
                case "note":
                    run = await service.addNote(scope, id, v, command.note);
                    break;
                case "resolve":
                    run = await service.resolveNote(scope, id, v, command.noteId, command.text);
                    break;
                case "conclude":
                    run = await service.conclude(scope, id, v, command.text);
                    break;
                case "submit":
                    run = await service.transition(scope, id, v, "awaiting_review");
                    break;
                case "review":
                    run = await service.transition(scope, id, v, command.decision, command.text, command.submittedHash);
                    break;
                case "lock":
                    run = await service.lock(scope, id, v);
                    break;
                case "revise":
                    run = await service.revise(scope, id, v);
                    break;
            }
            return { run };
        }));
    }
}
