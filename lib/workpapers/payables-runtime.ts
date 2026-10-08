import { sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import { ClientsRuntime } from "./clients-runtime";
import { ClientsImports, ClientsWorkpaperRepository, rows, scopeWhere, type ClientsSql } from "./clients-persistence";
import { PAYABLE_TYPES, PAYABLE_PROCEDURES, assertPayablesBatch, stampPayablesWork, buildPayablesFacts, type PayableProcedure, type PayablesResult } from "./payables-investigation";
import { PayablesRegistry, payableTemplate, PAYABLE_REQUIRED } from "./payables-adapter";
import { WorkpaperService } from "./service";
import { freezePopulation, selectPopulation } from "./selection";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportMapping, ImportBatch } from "./imports";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { PayablesCommand } from "./payables-commands";
import { buildPayablesMission } from "./payables-mission";
import type { MissionSelection } from "./client-mission";
import { buildPayablesPackage } from "@/lib/evidence/payables-package";
export class PayablesRuntime extends ClientsRuntime {
    protected override readonly procedureIds: readonly string[] = PAYABLE_PROCEDURES;
    protected override readonly sourceTypes: readonly string[] = PAYABLE_TYPES;
    protected override importAdapter(): "payables.rpne" { return "payables.rpne"; }
    protected override validateSource(batch: ImportBatch, period: AccountingPeriod) { assertPayablesBatch(batch, period); }
    async previewPayables(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: typeof PAYABLE_TYPES[number], key: string) { return this.previewSource(request, dossierId, period, file, mapping, type, key); }
    async payablesRead(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
        const view = await super.read(request, dossierId, pid, id, history, version);
        const facts = await this.transaction(request, dossierId, pid, "read", async (tx, scope) => {
            const imports = await ClientsImports.load(tx, scope);
            return Object.fromEntries(view.runs.map(run => { const ids = run.importIds.length ? run.importIds : view.sourceHeads.filter(h=>run.template.id!=="payables.frame"||PAYABLE_REQUIRED["payables.frame"].includes(h.document_type)).map(h => h.import_id); const batches = imports.batches.filter(b => ids.includes(b.id) && b.approval); try {
                const f = buildPayablesFacts(scope, run.period, batches, run.id, run.template.id as PayableProcedure);
                return [run.id, { invoices: f.events.map(e => ({ id: e.id, party: e.party, flow: e.flow, eventId: e.cutoff.economicEventId, net: e.net, tax: e.tax, gross: e.gross, proofRowId: e.row.id })), payments: f.payments.map(p => ({ id: p.id, party: p.party, amount: p.value.amount, date: p.value.date, rowId: p.value.source.id })), ledger: f.ledger.map(l => ({ rowId: l.row.id, id: l.row.normalized!.key, amount: l.row.normalized!.amount })), proofRows: batches.flatMap(b => b.rows.map(r => ({ id: r.id, type: b.document.documentType, key: r.normalized!.key, locator: r.locator }))), issue: null }];
            }
            catch (error) {
                return [run.id, { issue: error instanceof Error ? error.message : "PAYABLE_SOURCE_INVALID" }];
            } }));
        });
        const response = { ...view, facts };
        if (Buffer.byteLength(JSON.stringify(response)) > 8 * 1024 * 1024)
            throw new ApiError("PAYABLE_STATE_LIMIT", "État trop volumineux.", 413);
        return response;
    }
    async payablesCommand(request: Request, dossierId: string, pid: string, command: PayablesCommand, key: string) {
        const permission = ["review", "lock"].includes(command.command) ? "review" : "prepare";
        return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "payables_command", ...command }, async () => {
            const repository = new ClientsWorkpaperRepository(tx), imports = await ClientsImports.load(tx, scope), at = new Date(this.now() * 1000).toISOString();
            const makeService = (procedure: PayableProcedure) => new WorkpaperService(repository, imports, new PayablesRegistry(procedure), async () => actor, () => at, procedure);
            if (command.command === "create_payables") {
                if (periodId(command.period) !== pid)
                    throw new Error("WORKPAPER_PERIOD_INVALID");
                return { run: await makeService(command.procedure).create(scope, command.period, payableTemplate(command.procedure), command.instanceKey) };
            }
            if (["create", "freeze", "create_sales", "freeze_sales", "configure_sales"].includes(command.command))
                throw new Error("PAYABLE_COMMAND_OUT_OF_SCOPE");
            if (!("id" in command))
                throw new Error("WORKPAPER_ID_REQUIRED");
            const current = await repository.get(scope, command.id);
            if (!current || !this.procedureIds.includes(current.template.id))
                throw new Error("WORKPAPER_NOT_FOUND");
            const procedure = current.template.id as PayableProcedure, service = makeService(procedure), id = current.id, v = command.expectedVersion;
            if (command.command !== "revise")
                await this.assertCurrent(tx, scope, current);
            let run: WorkpaperRun;
            switch (command.command) {
                case "freeze_payables": {
                    if (current.state !== "draft" || current.population)
                        throw new Error("INPUTS_ALREADY_FROZEN");
                    const heads = await this.heads(tx, scope), batches = command.importIds.map(i => imports.get(scope, i, actor));
                    if (batches.some(b => !this.sourceTypes.includes(b.document.documentType) || !heads.some(h => h.import_id === b.id)))
                        throw new Error("PAYABLE_CURRENT_SOURCES_REQUIRED");
                    if (PAYABLE_REQUIRED[procedure].some(t => !batches.some(b => b.document.documentType === t)))
                        throw new Error("REQUIRED_DOCUMENT_MISSING");
                    if(procedure==="payables.frame"&&(batches.length!==3||command.selection.method!=="all"||command.selection.exclusions.length))throw new Error("PAYABLE_FRAME_FULL_POPULATION_REQUIRED");
                    const work = stampPayablesWork(command.draft, batches, scope, current.period, id, actor.id, at);
                    buildPayablesFacts(scope, current.period, batches, id, procedure);
                    run = await service.configurePayables(scope, id, v, work);
                    const unit = procedure === "payables.purchases" ? "purchase_entry" : procedure === "payables.rpne" ? "subsequent_payment" : "row";
                    const population = freezePopulation(scope, batches, unit, actor), eligible = population.items.filter(i => !command.selection.exclusions.some(e => e.id === i.id));
                    const selection = selectPopulation(population, command.selection.method === "all" ? { method: "targeted", criteria: command.selection.criteria, exclusions: command.selection.exclusions, requestedSize: eligible.length, selectedIds: eligible.map(i => i.id) } : { ...command.selection, method: command.selection.method, requestedSize: command.selection.requestedSize ?? command.selection.selectedIds?.length ?? 0 }, actor);
                    run = await service.attachInputs(scope, id, run.version, population, selection);
                    for (const batch of batches)
                        run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source approuvée de l’investigation fournisseurs");
                    run = await service.transition(scope, id, run.version, "ready");
                    break;
                }
                case "configure_payables": {
                    if (!current.population)
                        throw new Error("PAYABLE_FROZEN_INPUTS_REQUIRED");
                    const batches = current.importIds.map(i => imports.get(scope, i, actor)), work = stampPayablesWork(command.draft, batches, scope, current.period, id, actor.id, at);
                    run = await service.configurePayables(scope, id, v, work);
                    break;
                }
                case "execute": {
                    if (!current.payablesWork)
                        throw new Error("PAYABLE_WORK_REQUIRED");
                    run = await service.execute(scope, id, v, { work: current.payablesWork, runId: id });
                    if (run.state === "executed") {
                        const value = run.result!.result as PayablesResult;
                        for (const exception of value.exceptions)
                            run = await service.addNote(scope, id, run.version, { id: "payable-exception:" + exception.id, kind: "observation", text: exception.message, amount: exception.amount, blocking: true });
                        if (run.result!.outcome !== "no_exception_detected" && !value.exceptions.length)
                            run = await service.addNote(scope, id, run.version, { id: "payable-diagnostic:" + run.result!.inputHash, kind: "limitation", text: "Cadrage incomplet ou écarts à expliquer ; consulter les comparaisons exactes.", amount: { kind: "unknown", reason: "Résidus par comparaison, sans somme transversale" }, blocking: true });
                    }
                    break;
                }
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
                default: throw new Error("PAYABLE_COMMAND_OUT_OF_SCOPE");
            }
            return { run };
        }));
    }
    private async payableData(tx: ClientsSql, scope: WorkpaperScope, selection: MissionSelection) {
        const [size] = await rows<{
            count: string;
            bytes: string;
        }>(tx, sql `SELECT count(*)::text AS count,coalesce(sum(octet_length(run::text)),0)::text AS bytes FROM clients_workpaper_versions WHERE ${scopeWhere(scope)}`);
        if (Number(size.count) > 500 || Number(size.bytes) > 24 * 1024 * 1024)
            throw new ApiError("PAYABLE_STATE_LIMIT", "Historique trop volumineux.", 413);
        const [sourceSize] = await rows<{
            bytes: string;
        }>(tx, sql `SELECT coalesce(sum(octet_length(preview::text) + octet_length(original_base64)),0)::text AS bytes FROM clients_imports WHERE ${scopeWhere(scope)}`);
        if (Number(sourceSize.bytes) > 24 * 1024 * 1024)
            throw new ApiError("PAYABLE_STATE_LIMIT", "Sources trop volumineuses pour cette recette.", 413);
        const imports = await ClientsImports.load(tx, scope), heads = await this.heads(tx, scope), versions = (await rows<{
            run: WorkpaperRun;
        }>(tx, sql `SELECT run FROM clients_workpaper_versions WHERE ${scopeWhere(scope)} ORDER BY id,version`)).map(r => r.run);
        const mission = buildPayablesMission(scope, versions, imports.batches.filter(b => this.sourceTypes.includes(b.document.documentType)), heads.filter(h => this.sourceTypes.includes(h.document_type)), selection);
        if (Buffer.byteLength(JSON.stringify(mission)) > 8 * 1024 * 1024)
            throw new ApiError("PAYABLE_STATE_LIMIT", "Synthèse trop volumineuse.", 413);
        const run = versions.find(r => r.id === mission.selectedRunId && r.version === mission.selectedVersion) ?? null;
        return { mission, run, imports: imports.batches };
    }
    async payablesMission(request: Request, dossierId: string, pid: string, selection: MissionSelection = {}) { return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => ({ actorId: actor.id, permissions: actor.grants[0].permissions, mission: (await this.payableData(tx, scope, selection)).mission })); }
    async payablesExport(request: Request, dossierId: string, pid: string, selection: MissionSelection, kind: "diagnostic" | "approved", expectedSnapshotHash: string) {
        const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { const data = await this.payableData(tx, scope, selection); if (data.mission.hash !== expectedSnapshotHash)
            throw new Error("EXPORT_SNAPSHOT_CONFLICT"); return data; });
        const at = data.run?.events.at(-1)?.at ?? "1970-01-01T00:00:00.000Z", pack = await buildPayablesPackage(data.mission, data.run, data.imports, kind, at);
        if (Buffer.byteLength(pack.canonicalJson) > 16 * 1024 * 1024 || Buffer.byteLength(pack.html) > 16 * 1024 * 1024 || pack.pdf.byteLength > 16 * 1024 * 1024)
            throw new ApiError("PAYABLE_EXPORT_LIMIT", "Export trop volumineux.", 413);
        await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.payableData(tx, scope, selection)).mission.hash !== expectedSnapshotHash)
            throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
        return pack;
    }
}
