import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { buildCashMissionPackage, type CashExportKind } from "@/lib/evidence/cash-mission-package";
import { neutralizeFileName } from "@/lib/security/filename";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CASH_RECONCILIATION_TEMPLATE, CashReconciliationRegistry } from "./cash-adapter";
import type { CashCommand } from "./cash-commands";
import { buildCashMission, type CashMissionSelection } from "./cash-mission";
import { cashWorkSchema, stampCashWork, type CashResult } from "./cash-reconciliation";
import { assertCashBatch, buildCashFacts, cashFactsView, CashSourceError, CASH_TYPES, type CashFactsView, type CashSourceType } from "./cash-sources";
import { CashImports, CashWorkpaperRepository, type CashDatabase, type CashTx } from "./cash-store";
import { previewImport, type ImportMapping } from "./imports";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Permission, Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
const LIMITS = { versions: 500, bytes: 24 * 1024 * 1024, response: 8 * 1024 * 1024, file: 3 * 1024 * 1024, export: 16 * 1024 * 1024 };
/** Durable server runtime of the bank bridge. Identity, permissions, dates and authors come from the server session only. */
export class CashRuntime {
  constructor(private readonly db: CashDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
  async check(request: Request, dossierId: string, permission: Permission) { await this.identity(request, dossierId, permission); }
  private async identity(request: Request, dossierId: string, permission: Permission) {
    const identity = await this.authorizer.authorize(request, { dossierId, permission: permissions[permission] });
    assertDossierPermission(identity, dossierId, permissions[permission]);
    if (isExpired(identity, this.now())) throw new Error("SESSION_INVALID");
    return identity;
  }
  private actor(identity: AuthenticatedPrincipal, scope: WorkpaperScope): Principal {
    return { id: identity.subject, grants: [{ scope, permissions: (Object.keys(permissions) as Permission[]).filter(p => hasPermission(identity.roles, permissions[p])) }] };
  }
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: CashTx, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
    const identity = await this.identity(request, dossierId, permission);
    const scope: WorkpaperScope = { organizationId: identity.organizationId, dossierId, periodId: pid, mode: "real" };
    return this.db.transaction(async tx => {
      if (!(await tx.ownsDossierForUpdate(scope))) throw new Error("WORKPAPER_FORBIDDEN");
      if (isExpired(identity, this.now())) throw new Error("SESSION_INVALID");
      const result = await body(tx, scope, this.actor(identity, scope));
      // Authorization is rechecked at the end of the transaction: an expired session commits nothing.
      if (isExpired(identity, this.now())) throw new Error("SESSION_INVALID");
      return result;
    });
  }
  private async receipt<T>(tx: CashTx, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actor.id, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actor.id, key, hash, response);
    return response;
  }
  private async bounded(tx: CashTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.versions > LIMITS.versions || size.versionBytes > LIMITS.bytes || size.sourceBytes > LIMITS.bytes) throw new ApiError("CASH_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
  }
  private async assertCurrent(tx: CashTx, scope: WorkpaperScope, run: WorkpaperRun) {
    const heads = await tx.heads(scope);
    if (run.importIds.some(id => !heads.some(h => h.import_id === id))) throw new Error("CASH_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
      await this.bounded(tx, scope);
      const repository = new CashWorkpaperRepository(tx), imports = CashImports.from(await tx.imports(scope)), heads = await tx.heads(scope);
      const ids = id ? [id] : await tx.runIds(scope);
      const currentRuns = (await Promise.all(ids.map(r => repository.get(scope, r)))).filter((r): r is WorkpaperRun => !!r);
      const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
      if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
      for (const runId of await tx.runIds(scope)) { const r = await repository.get(scope, runId); if (r && (!lineageCurrent[r.rootId] || r.revision > lineageCurrent[r.rootId].revision)) lineageCurrent[r.rootId] = { id: r.id, version: r.version, revision: r.revision }; }
      const facts: Record<string, CashFactsView | null> = {}, factsIssues: Record<string, { code: string; locator?: CashSourceError["locator"] }> = {}, sourcesCurrent: Record<string, boolean> = {};
      for (const r of runs) {
        sourcesCurrent[r.id] = r.importIds.every(i => heads.some(h => h.import_id === i));
        const batchIds = r.importIds.length ? r.importIds : heads.map(h => h.import_id);
        const batches = imports.batches.filter(b => batchIds.includes(b.id) && b.approval);
        try { facts[r.id] = batches.some(b => b.document.documentType === "cash_ledger") && batches.some(b => b.document.documentType === "cash_statement") && batches.some(b => b.document.documentType === "cash_erb") ? cashFactsView(buildCashFacts(scope, r.period, batches, r.id)) : null; }
        catch (error) { facts[r.id] = null; factsIssues[r.id] = error instanceof CashSourceError ? { code: error.code, locator: error.locator } : { code: error instanceof Error ? error.message : "CASH_SOURCES_INVALID" }; }
      }
      const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, facts, factsIssues, sourcesCurrent, lineageCurrent, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id, r.version])),
        imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: heads, ...(history && id ? { history: await repository.history(scope, id) } : {}) };
      if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("CASH_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
      return response;
    });
  }
  private async missionData(tx: CashTx, scope: WorkpaperScope, selection: CashMissionSelection) {
    await this.bounded(tx, scope);
    const versions = (await tx.allVersions(scope)), imports = CashImports.from(await tx.imports(scope)), heads = await tx.heads(scope), createdAt = await tx.dossierCreatedAt(scope);
    if (!createdAt) throw new Error("WORKPAPER_NOT_FOUND");
    const mission = buildCashMission(scope, versions, imports.batches, heads, selection, createdAt);
    if (Buffer.byteLength(JSON.stringify(mission)) > LIMITS.response) throw new ApiError("CASH_MISSION_LIMIT", "Synthèse trop volumineuse pour cette recette.", 413);
    return { mission, run: versions.find(r => r.id === mission.procedure.runId && r.version === mission.procedure.version) ?? null, imports: imports.batches };
  }
  async mission(request: Request, dossierId: string, pid: string, selection: CashMissionSelection = {}) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => ({ actorId: actor.id, permissions: actor.grants[0].permissions, mission: (await this.missionData(tx, scope, selection)).mission }));
  }
  async missionExport(request: Request, dossierId: string, pid: string, selection: CashMissionSelection, kind: CashExportKind, expectedSnapshotHash: string) {
    const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const data = await this.missionData(tx, scope, selection);
      if (data.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      return data;
    });
    const pack = await buildCashMissionPackage(data.mission, data.run, data.imports, kind, data.mission.stateAsOf!);
    if (Buffer.byteLength(pack.canonicalJson) > LIMITS.export || pack.pdf.byteLength > LIMITS.export || Buffer.byteLength(pack.html) > LIMITS.export) throw new ApiError("CASH_EXPORT_LIMIT", "Export trop volumineux pour cette recette.", 413);
    // Session, permission and state are checked again after rendering, before any byte is returned.
    await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.missionData(tx, scope, selection)).mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
    return pack;
  }
  async download(request: Request, dossierId: string, pid: string, documentId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => CashImports.from(await tx.imports(scope)).download(scope, documentId, actor));
  }
  async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: CashSourceType, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      if (file.size > LIMITS.file) throw new ApiError("CASH_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
      const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
      let batch = await previewImport(safeFile, scope, mapping, actor, type, "cash.reconciliation");
      assertCashBatch(batch, period);
      if (Buffer.byteLength(JSON.stringify(batch)) > LIMITS.file) throw new ApiError("CASH_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
      const { previewHash: _hash, ...base } = batch; void _hash;
      base.document = { ...base.document, logicalId: type, storageRef: "postgres-cash:" + batch.id };
      batch = { ...base, previewHash: stableSha256(base) };
      const original = Buffer.from(await safeFile.arrayBuffer()).toString("base64");
      return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: batch.previewHash }, async () => {
        await tx.insertImport(scope, type, batch, original);
        return { batch: CashImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
      });
    });
  }
  async approveImport(request: Request, dossierId: string, pid: string, command: { importId: string; previewHash: string; expectedSourceId: string | null }, key: string) {
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
      const batch = CashImports.from(await tx.imports(scope)).get(scope, command.importId, actor);
      if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length) throw new Error("IMPORT_REJECTED_OR_STALE");
      const head = (await tx.heads(scope)).find(h => h.document_type === batch.document.documentType)?.import_id ?? null;
      if (batch.approval && head !== batch.id) throw new Error("CASH_SOURCE_REPLACED_REVISION_REQUIRED");
      if (head !== command.expectedSourceId) throw new Error("CASH_SOURCE_HEAD_CONFLICT");
      await tx.approveImport(scope, batch.id, actor.id, new Date(this.now() * 1000).toISOString(), batch.previewHash);
      await tx.setHead(scope, batch.document.documentType, batch.id);
      return { batch: CashImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
    }));
  }
  async command(request: Request, dossierId: string, pid: string, command: CashCommand, key: string) {
    const permission = command.command === "review" || command.command === "lock" ? "review" : "prepare";
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
      const imports = CashImports.from(await tx.imports(scope)), repository = new CashWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new CashReconciliationRegistry(), async () => actor, () => at, "cash.reconciliation");
      if (command.command === "create") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, CASH_RECONCILIATION_TEMPLATE, "cash-reconciliation") };
      }
      const current = await repository.get(scope, command.id);
      if (!current) throw new Error("WORKPAPER_NOT_FOUND");
      if (current.cashWork) cashWorkSchema.parse(current.cashWork);
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const id = command.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze": {
          if (current.state !== "draft" || current.population) throw new Error("CASH_FREEZE_NOT_ALLOWED");
          const heads = await tx.heads(scope), cashHeads = heads.filter(h => CASH_TYPES.includes(h.document_type as CashSourceType));
          // The browser names the sources it reviewed; they must be exactly the current approved heads.
          if (stableSha256([...command.importIds].sort()) !== stableSha256(cashHeads.map(h => h.import_id).sort())) throw new Error("CASH_CURRENT_SOURCES_REQUIRED");
          const batches = command.importIds.map(i => imports.get(scope, i, actor)), facts = buildCashFacts(scope, current.period, batches, id);
          const selectedIds = facts.accounts.filter(a => a.inScope).map(a => a.ledger.rowId);
          if (!selectedIds.length) throw new Error("CASH_NO_BANK_ACCOUNT_IN_SCOPE");
          const work = stampCashWork({ scope, period: current.period, runId: id, imports: batches, draft: { window: command.window, exclusions: [], allocations: [], corrections: [] }, actor, at });
          run = await service.configureCash(scope, id, v, work);
          const population = freezePopulation(scope, batches, "account", actor);
          const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les comptes bancaires EUR du GL de clôture ; caisse, VMP et devises exclues avec motif", requestedSize: selectedIds.length, selectedIds,
            exclusions: facts.accounts.filter(a => !a.inScope).map(a => ({ id: a.ledger.rowId, reason: a.accountId + " — " + a.exclusionReason })) }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source Trésorerie figée");
          run = await service.transition(scope, id, run.version, "ready"); break;
        }
        case "configure": {
          if (!current.population || !current.cashWork) throw new Error("CASH_FROZEN_INPUTS_REQUIRED");
          const batches = current.importIds.map(i => imports.get(scope, i, actor));
          run = await service.configureCash(scope, id, v, stampCashWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, actor, at, previous: current.cashWork })); break;
        }
        case "execute": {
          if (!current.cashWork) throw new Error("CASH_WORK_REQUIRED");
          run = await service.execute(scope, id, v, { work: current.cashWork, runId: id });
          if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
            const exceptions = (run.result!.result as CashResult).exceptions;
            for (const e of exceptions) run = await service.addNote(scope, id, run.version, { id: "cash-exception:" + e.id, kind: e.code === "WINDOW_INCOMPLETE" || e.code === "BRIDGE_SOURCE_MISSING" ? "missing_evidence" : "observation", text: e.label + " — " + e.message, amount: e.amount, blocking: true });
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
