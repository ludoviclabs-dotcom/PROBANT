import { SALES_TYPES, assertClientsSalesBatch, buildClientsSalesFacts, clientsSalesDraftFromWork, clientsSalesWorkSchema, makeInitialClientsSalesWork, stampClientsSalesWork, type ClientsFramingReference } from "./clients-sales";
import { CLIENT_SALES_TEMPLATE, ClientsSalesRegistry } from "./clients-sales-adapter";
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
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import { type Principal, type Permission } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";
import type { ClientsCommand } from "./clients-commands";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
export class ClientsRuntime {
    protected readonly procedureIds: readonly string[] = ["clients.frame", "clients.sales"];
    protected readonly sourceTypes: readonly string[] = [...CLIENT_TYPES, ...SALES_TYPES];
    constructor(protected readonly db: ClientsDatabase, protected readonly authorizer: Pick<RequestAuthorizer, "authorize">, protected readonly now: () => number = () => Math.floor(Date.now() / 1000)) { }
    async check(request: Request, dossierId: string, permission: Permission) { await this.identity(request, dossierId, permission); }
    protected async identity(request: Request, dossierId: string, permission: Permission) {
        const identity = await this.authorizer.authorize(request, { dossierId, permission: permissions[permission] });
        assertDossierPermission(identity, dossierId, permissions[permission]);
        if (isExpired(identity, this.now()))
            throw new Error("SESSION_INVALID");
        return identity;
    }
    protected actor(identity: AuthenticatedPrincipal, scope: WorkpaperScope): Principal {
        return { id: identity.subject, grants: [{ scope, permissions: (Object.keys(permissions) as Permission[]).filter((p) => hasPermission(identity.roles, permissions[p])) }] };
    }
    protected async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: ClientsSql, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
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
    protected async receipt<T>(tx: ClientsSql, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
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
    protected heads(tx: ClientsSql, scope: WorkpaperScope) {
        return rows<{
            document_type: string;
            import_id: string;
        }>(tx, sql `SELECT document_type,import_id FROM clients_source_heads WHERE ${scopeWhere(scope)}`);
    }
    protected async assertCurrent(tx: ClientsSql, scope: WorkpaperScope, run: WorkpaperRun) {
        const heads = await this.heads(tx, scope);
        if (run.importIds.some((id) => !heads.some((h) => h.import_id === id)))
            throw new Error("CLIENT_SOURCE_REPLACED_REVISION_REQUIRED");
        if (run.clientsWork) { const work = clientsSalesWorkSchema.parse(run.clientsWork); const reference = await this.framingReference(tx, scope, work.framing.runId, work.framing.version); if (stableSha256(reference)!==stableSha256(work.framing)) throw new Error("CLIENT_FRAMING_REFERENCE_CHANGED"); }
    }
    private async framingReference(tx: ClientsSql, scope: WorkpaperScope, id: string, version: number): Promise<ClientsFramingReference> {
        const repository = new ClientsWorkpaperRepository(tx), frame = await repository.get(scope, id);
        if (!frame || frame.template.id !== "clients.frame") throw new Error("CLIENT_FRAMING_NOT_FOUND");
        if (frame.version !== version) throw new Error("CLIENT_FRAMING_VERSION_REPLACED");
        if (frame.state !== "locked") throw new Error("CLIENT_FRAMING_LOCKED_REQUIRED");
        await this.assertCurrent(tx, scope, frame);
        const [latest] = await rows<{ id: string }>(tx, sql`SELECT h.id FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId} AND v.run->>'rootId'=${frame.rootId} ORDER BY (v.run->>'revision')::int DESC LIMIT 1`);
        if (latest?.id !== frame.id) throw new Error("CLIENT_FRAMING_VERSION_REPLACED");
        return { runId: frame.id, rootId: frame.rootId, version: frame.version, contentHash: contentHash(frame) };
    }
    async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
        return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
            const [size] = await rows<{count:string;bytes:string}>(tx, sql`SELECT count(*)::text AS count,coalesce(sum(octet_length(run::text)),0)::text AS bytes FROM clients_workpaper_versions WHERE ${scopeWhere(scope)}`);
            const [sourceSize] = await rows<{bytes:string}>(tx, sql`SELECT coalesce(sum(octet_length(preview::text)+octet_length(original_base64)),0)::text AS bytes FROM clients_imports WHERE ${scopeWhere(scope)}`);
            if (Number(size.count)>500 || Number(size.bytes)>24*1024*1024 || Number(sourceSize.bytes)>24*1024*1024) throw new ApiError("CLIENT_STATE_LIMIT","État trop volumineux pour cette recette.",413);
            const repository = new ClientsWorkpaperRepository(tx), imports = await ClientsImports.load(tx, scope), heads = await this.heads(tx, scope);
            const ids = id ? [{ id }] : await rows<{
                id: string;
            }>(tx, sql `SELECT id FROM clients_workpaper_heads WHERE ${scopeWhere(scope)} ORDER BY id`);
            const currentRuns = (await Promise.all(ids.map((r) => repository.get(scope, r.id)))).filter((r): r is WorkpaperRun => !!r && this.procedureIds.includes(r.template.id));
            if (id && !currentRuns.length) throw new Error("WORKPAPER_NOT_FOUND");
            const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
            if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
            const lineageHeads = await rows<{ id: string; version: number; root_id: string; revision: number }>(tx, sql`SELECT h.id,h.version,v.run->>'rootId' AS root_id,(v.run->>'revision')::int AS revision FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId}`);
            const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
            for (const h of lineageHeads) if (!lineageCurrent[h.root_id] || h.revision > lineageCurrent[h.root_id].revision) lineageCurrent[h.root_id] = { id: h.id, version: h.version, revision: h.revision };
            const salesFactsIssues: Record<string, string> = {};
            const salesFraming: Record<string, ClientsFramingReference | null> = {};
            const sourcesCurrent: Record<string, boolean> = {};
            for (const r of runs) {
                sourcesCurrent[r.id] = r.importIds.every(i => heads.some(h => h.import_id === i));
                if (r.template.id === "clients.sales") {
                    const original = r.clientsWork?.framing ?? (await repository.history(scope, r.rootId)).find(v => v.clientsWork)?.clientsWork?.framing;
                    const latest = original ? lineageCurrent[original.rootId] : undefined;
                    try { salesFraming[r.id] = latest ? await this.framingReference(tx, scope, latest.id, latest.version) : null; } catch { salesFraming[r.id] = null; }
                    if (r.clientsWork) { try { await this.framingReference(tx, scope, r.clientsWork.framing.runId, r.clientsWork.framing.version); } catch { sourcesCurrent[r.id] = false; } }
                }
            }
            const salesFacts = Object.fromEntries(runs.filter(r => r.template.id === "clients.sales").map(r => {
                if (r.clientsWork) clientsSalesWorkSchema.parse(r.clientsWork);
                const ids = r.importIds.length ? r.importIds : heads.filter(h => SALES_TYPES.includes(h.document_type as typeof SALES_TYPES[number])).map(h => h.import_id);
                const batches = imports.batches.filter(b => ids.includes(b.id));
                let facts = null;
                try { facts = batches.some(b => b.document.documentType === "clients_invoices") && batches.some(b => b.document.documentType === "clients_payments") ? buildClientsSalesFacts(scope, r.period, batches, r.id) : null; } catch (error) { salesFactsIssues[r.id] = error instanceof Error ? error.message : "CLIENT_SALES_SOURCES_INVALID"; }
                return [r.id, facts];
            }));
            const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, salesFacts, salesFactsIssues, salesFraming, lineageCurrent, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id,r.version])), imports: imports.batches.filter(b=>this.sourceTypes.includes(b.document.documentType)).map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: heads.filter(h=>this.sourceTypes.includes(h.document_type)),
                sourcesCurrent,
                ...(history && id ? { history: await repository.history(scope, id) } : {}) };
            if (Buffer.byteLength(JSON.stringify(response))>8*1024*1024) throw new ApiError("CLIENT_STATE_LIMIT","État trop volumineux pour cette recette.",413);
            return response;
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
        const mission = buildClientMission(scope, versions.filter(r=>["clients.frame","clients.sales"].includes(r.template.id)), imports.batches, heads.filter(h=>[...CLIENT_TYPES,...SALES_TYPES].includes(h.document_type as typeof SALES_TYPES[number])), selection, new Date(dossier.created_at).toISOString());
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
    async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: typeof CLIENT_TYPES[number] | typeof SALES_TYPES[number], key: string) {
        return this.previewSource(request,dossierId,period,file,mapping,type,key);
    }
    protected importAdapter(type:string): "investments.review" | "equity.review" | "clients.frame" | "clients.sales" | "payables.rpne" { return SALES_TYPES.includes(type as typeof SALES_TYPES[number]) ? "clients.sales" : "clients.frame"; }
    protected validateSource(batch: import("./imports").ImportBatch, period:AccountingPeriod) {
        if (!this.sourceTypes.includes(batch.document.documentType)) throw new Error("CLIENT_DOCUMENT_TYPE_INVALID");
        if (SALES_TYPES.includes(batch.document.documentType as typeof SALES_TYPES[number])) assertClientsSalesBatch(batch,period); else assertClientsBatch(batch,period.closingDate);
    }
    protected makePreview(file:File,scope:WorkpaperScope,mapping:ImportMapping,actor:Principal,type:string,_period:AccountingPeriod) { void _period; return previewImport(file,scope,mapping,actor,type,this.importAdapter(type)); }
    protected async previewSource(request:Request,dossierId:string,period:AccountingPeriod,file:File,mapping:ImportMapping,type:string,key:string) {
        return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
            if (file.size > 3 * 1024 * 1024) throw new ApiError("CLIENT_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
            const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
            let batch = await this.makePreview(safeFile, scope, mapping, actor, type, period);
            this.validateSource(batch,period);
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
            if (!this.sourceTypes.includes(batch.document.documentType)) throw new Error("DOCUMENT_TYPE_OUT_OF_SCOPE");
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
            const imports = await ClientsImports.load(tx, scope), repository = new ClientsWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
            const makeService = (sales: boolean) => new WorkpaperService(repository, imports, sales ? new ClientsSalesRegistry() : new ClientsFramingRegistry(), async () => actor, () => at, sales ? "clients.sales" : "clients.frame");
            if (command.command === "create" || command.command === "create_sales") {
                if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
                if (command.command === "create") return { run: await makeService(false).create(scope, command.period, CLIENT_FRAME_TEMPLATE, command.instanceKey) };
                const framing = await this.framingReference(tx, scope, command.framingId, command.framingVersion);
                const work = makeInitialClientsSalesWork(framing, command.period, actor.id, at);
                return { run: await makeService(true).create(scope, command.period, CLIENT_SALES_TEMPLATE, "clients-sales:" + framing.rootId, work) };
            }
            const current = await repository.get(scope, command.id);
            if (!current || !this.procedureIds.includes(current.template.id)) throw new Error("WORKPAPER_NOT_FOUND");
            const sales = current.template.id === "clients.sales", service = makeService(sales);
            if (current.clientsWork) clientsSalesWorkSchema.parse(current.clientsWork);
            if (command.command !== "revise" && command.command !== "freeze_sales") await this.assertCurrent(tx, scope, current);
            const id = command.id, v = command.expectedVersion;
            let run: WorkpaperRun;
            switch (command.command) {
                case "freeze": {
                    if (sales) throw new Error("CLIENT_TEMPLATE_REQUIRED");
                    const batches = command.importIds.map(i => imports.get(scope, i, actor)), heads = await this.heads(tx, scope);
                    if (CLIENT_TYPES.some(t => batches.filter(b => b.document.documentType === t).length !== 1) || batches.some(b => !heads.some(h => h.import_id === b.id))) throw new Error("CLIENT_CURRENT_THREE_SOURCES_REQUIRED");
                    batches.forEach(b => assertClientsBatch(b, current.period.closingDate));
                    const population = freezePopulation(scope, batches, "row", actor), selection = selectPopulation(population, { method: "targeted", criteria: "Population complète du cadrage Clients", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
                    run = await service.attachInputs(scope, id, v, population, selection);
                    for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source du cadrage Clients");
                    run = await service.transition(scope, id, run.version, "ready"); break;
                }
                case "freeze_sales": {
                    if (!sales || current.state !== "draft" || current.population) throw new Error("CLIENT_SALES_FREEZE_NOT_ALLOWED");
                    const framing = await this.framingReference(tx, scope, command.framingId, command.framingVersion);
                    const originalFraming = current.clientsWork?.framing ?? (await repository.history(scope, current.rootId)).find(r => r.clientsWork)?.clientsWork?.framing;
                    if (!originalFraming || originalFraming.rootId !== framing.rootId) throw new Error("CLIENT_FRAMING_ROOT_MISMATCH");
                    const heads = await this.heads(tx, scope), batches = command.importIds.map(i => imports.get(scope, i, actor));
                    if (batches.some(b => !SALES_TYPES.includes(b.document.documentType as typeof SALES_TYPES[number]) || !heads.some(h => h.import_id === b.id))) throw new Error("CLIENT_SALES_CURRENT_SOURCES_REQUIRED");
                    buildClientsSalesFacts(scope, current.period, batches, id);
                    const initial = makeInitialClientsSalesWork(framing, current.period, actor.id, at), draft = { ...clientsSalesDraftFromWork(initial), window: command.window, creditsAbsence: command.creditsAbsence };
                    const work = stampClientsSalesWork({ scope, period: current.period, runId: id, imports: batches, draft, framing, actor, at });
                    run = await service.configureClientsSales(scope, id, v, work);
                    const population = freezePopulation(scope, batches, "invoice", actor), selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les factures ouvertes à clôture ; encaissements et avoirs postérieurs dans la fenêtre documentée", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
                    run = await service.attachInputs(scope, id, run.version, population, selection);
                    for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source Clients et ventes");
                    run = await service.transition(scope, id, run.version, "ready"); break;
                }
                case "configure_sales": {
                    if (!sales || !current.population || !current.clientsWork) throw new Error("CLIENT_SALES_FROZEN_INPUTS_REQUIRED");
                    const batches = current.importIds.map(i => imports.get(scope, i, actor)), work = stampClientsSalesWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, framing: current.clientsWork.framing, actor, at, previous: current.clientsWork });
                    run = await service.configureClientsSales(scope, id, v, work); break;
                }
                case "execute": {
                    if (sales && !current.clientsWork) throw new Error("CLIENT_SALES_WORK_REQUIRED");
                    run = await service.execute(scope, id, v, sales ? { work: current.clientsWork, runId: id } : {});
                    if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
                        const exceptions = sales && run.result?.result && typeof run.result.result === "object" ? (run.result.result as { exceptions?: { id: string; message: string; amount: WorkpaperRun["notes"][number]["amount"] }[] }).exceptions ?? [] : [];
                        if (sales) { for (const exception of exceptions) run = await service.addNote(scope, id, run.version, { id: "clients-sales-exception:" + exception.id, kind: "observation", text: exception.message, amount: exception.amount, blocking: true }); }
                        else run = await service.addNote(scope, id, run.version, { id: "clients-frame-exception:" + run.result!.inputHash, kind: "observation", text: "Écarts ou périmètre incomplet dans le cadrage : examiner les lignes et documenter leur traitement.", amount: { kind: "unknown", reason: "Voir les résidus exacts des deux rapprochements ; aucune compensation." }, blocking: true });
                    }
                    break;
                }
                case "note": run = await service.addNote(scope, id, v, command.note); break;
                case "resolve": run = await service.resolveNote(scope, id, v, command.noteId, command.text); break;
                case "conclude": run = await service.conclude(scope, id, v, command.text); break;
                case "submit": run = await service.transition(scope, id, v, "awaiting_review"); break;
                case "review": run = await service.transition(scope, id, v, command.decision, command.text, command.submittedHash); break;
                case "lock": run = await service.lock(scope, id, v); break;
                case "revise": run = await service.revise(scope, id, v); break;
            }
            return { run };
        }));
    }
}
