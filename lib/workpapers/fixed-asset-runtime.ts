import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { buildFixedAssetMissionPackage, type FixedAssetExportKind } from "@/lib/evidence/fixed-asset-mission-package";
import { neutralizeFileName } from "@/lib/security/filename";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { FIXED_ASSETS_TEMPLATE, FixedAssetsRegistry } from "./fixed-asset-adapter";
import type { FixedAssetCommand } from "./fixed-asset-commands";
import { buildFixedAssetMission, fixedAssetResultOf, type FixedAssetMissionSelection } from "./fixed-asset-mission";
import { compareFixedAssetRecalculations, FA_UNCERTAINTY_CODES, fixedAssetWorkSchema, recalculationBasisHash, stampFixedAssetWork, type FixedAssetResult, type RecalculationComparisonRow } from "./fixed-asset-review";
import { assertFixedAssetBatch, buildFixedAssetFacts, FA_TYPES, fixedAssetFactsView, FixedAssetSourceError, type FixedAssetFactsView, type FixedAssetSourceType } from "./fixed-asset-sources";
import { FixedAssetImports, FixedAssetWorkpaperRepository, type FixedAssetDatabase, type FixedAssetTx } from "./fixed-asset-store";
import { previewImport, type ImportMapping } from "./imports";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Permission, Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
const LIMITS = { versions: 500, bytes: 32 * 1024 * 1024, response: 10 * 1024 * 1024, file: 3 * 1024 * 1024, export: 16 * 1024 * 1024 };
export interface FixedAssetComparison { from: { id: string; revision: number; version: number }; to: { id: string; revision: number; version: number }; rows: RecalculationComparisonRow[] }
export interface FixedAssetPendingChange { from: { id: string; revision: number; version: number }; methods: string[] }
/** Durable server runtime of the fixed-asset review. Identity, permissions, dates and authors come from the server session only. */
export class FixedAssetRuntime {
  constructor(private readonly db: FixedAssetDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
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
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: FixedAssetTx, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
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
  private async receipt<T>(tx: FixedAssetTx, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actor.id, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actor.id, key, hash, response);
    return response;
  }
  private async bounded(tx: FixedAssetTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.versions > LIMITS.versions || size.versionBytes > LIMITS.bytes || size.sourceBytes > LIMITS.bytes) throw new ApiError("FA_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
  }
  private async assertCurrent(tx: FixedAssetTx, scope: WorkpaperScope, run: WorkpaperRun) {
    const heads = await tx.heads(scope);
    if (run.importIds.some(id => !heads.some(h => h.import_id === id))) throw new Error("FA_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  /** Latest earlier executed version of the same lineage whose recalculation basis differs: the change is shown, never applied silently. */
  private comparisons(versions: WorkpaperRun[], run: WorkpaperRun) {
    const order = (v: WorkpaperRun) => v.revision * 1_000_000 + v.version;
    const earlier = versions.filter(v => v.rootId === run.rootId && order(v) < order(run)).map(v => ({ v, result: fixedAssetResultOf(v) })).filter((x): x is { v: WorkpaperRun; result: FixedAssetResult } => !!x.result).sort((a, b) => order(b.v) - order(a.v));
    const current = fixedAssetResultOf(run), ref = (v: WorkpaperRun) => ({ id: v.id, revision: v.revision, version: v.version });
    if (current) {
      const previous = earlier.find(x => recalculationBasisHash(x.result) !== recalculationBasisHash(current));
      return { comparison: previous ? { from: ref(previous.v), to: ref(run), rows: compareFixedAssetRecalculations(previous.result, current) } as FixedAssetComparison : null, pending: null };
    }
    const last = earlier[0], work = run.fixedAssetWork, lastWork = last?.v.fixedAssetWork;
    if (!last || !work || !lastWork) return { comparison: null, pending: null };
    const changed = [...new Set([...work.methods, ...lastWork.methods].map(m => m.id))].filter(mid => stableSha256(work.methods.find(m => m.id === mid) ?? null) !== stableSha256(lastWork.methods.find(m => m.id === mid) ?? null)).sort();
    return { comparison: null, pending: changed.length ? { from: ref(last.v), methods: changed } as FixedAssetPendingChange : null };
  }
  async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
      await this.bounded(tx, scope);
      const repository = new FixedAssetWorkpaperRepository(tx), imports = FixedAssetImports.from(await tx.imports(scope)), heads = await tx.heads(scope), all = await tx.allVersions(scope);
      const ids = id ? [id] : await tx.runIds(scope);
      const currentRuns = (await Promise.all(ids.map(r => repository.get(scope, r)))).filter((r): r is WorkpaperRun => !!r);
      const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
      if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
      for (const runId of await tx.runIds(scope)) { const r = await repository.get(scope, runId); if (r && (!lineageCurrent[r.rootId] || r.revision > lineageCurrent[r.rootId].revision)) lineageCurrent[r.rootId] = { id: r.id, version: r.version, revision: r.revision }; }
      const facts: Record<string, FixedAssetFactsView | null> = {}, factsIssues: Record<string, { code: string; locator?: FixedAssetSourceError["locator"] }> = {}, sourcesCurrent: Record<string, boolean> = {};
      const comparisons: Record<string, FixedAssetComparison | null> = {}, pendingChanges: Record<string, FixedAssetPendingChange | null> = {};
      for (const r of runs) {
        sourcesCurrent[r.id] = r.importIds.every(i => heads.some(h => h.import_id === i));
        const batchIds = r.importIds.length ? r.importIds : heads.map(h => h.import_id);
        const batches = imports.batches.filter(b => batchIds.includes(b.id) && b.approval);
        try { facts[r.id] = batches.some(b => b.document.documentType === "fa_register") && batches.some(b => b.document.documentType === "fa_ledger") ? fixedAssetFactsView(buildFixedAssetFacts(scope, r.period, batches, r.id)) : null; }
        catch (error) { facts[r.id] = null; factsIssues[r.id] = error instanceof FixedAssetSourceError ? { code: error.code, locator: error.locator } : { code: error instanceof Error ? error.message : "FA_SOURCES_INVALID" }; }
        const c = this.comparisons(all, r); comparisons[r.id] = c.comparison; pendingChanges[r.id] = c.pending;
      }
      const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, facts, factsIssues, sourcesCurrent, lineageCurrent, comparisons, pendingChanges, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id, r.version])),
        imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: heads, ...(history && id ? { history: await repository.history(scope, id) } : {}) };
      if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("FA_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
      return response;
    });
  }
  private async missionData(tx: FixedAssetTx, scope: WorkpaperScope, selection: FixedAssetMissionSelection) {
    await this.bounded(tx, scope);
    const versions = await tx.allVersions(scope), imports = FixedAssetImports.from(await tx.imports(scope)), heads = await tx.heads(scope), createdAt = await tx.dossierCreatedAt(scope);
    if (!createdAt) throw new Error("WORKPAPER_NOT_FOUND");
    const mission = buildFixedAssetMission(scope, versions, imports.batches, heads, selection, createdAt);
    if (Buffer.byteLength(JSON.stringify(mission)) > LIMITS.response) throw new ApiError("FA_MISSION_LIMIT", "Synthèse trop volumineuse pour cette recette.", 413);
    return { mission, run: versions.find(r => r.id === mission.procedure.runId && r.version === mission.procedure.version) ?? null, imports: imports.batches };
  }
  async mission(request: Request, dossierId: string, pid: string, selection: FixedAssetMissionSelection = {}) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => ({ actorId: actor.id, permissions: actor.grants[0].permissions, mission: (await this.missionData(tx, scope, selection)).mission }));
  }
  async missionExport(request: Request, dossierId: string, pid: string, selection: FixedAssetMissionSelection, kind: FixedAssetExportKind, expectedSnapshotHash: string) {
    const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const data = await this.missionData(tx, scope, selection);
      if (data.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      return data;
    });
    const pack = await buildFixedAssetMissionPackage(data.mission, data.run, data.imports, kind, data.mission.stateAsOf!);
    if (Buffer.byteLength(pack.canonicalJson) > LIMITS.export || pack.pdf.byteLength > LIMITS.export || Buffer.byteLength(pack.html) > LIMITS.export) throw new ApiError("FA_EXPORT_LIMIT", "Export trop volumineux pour cette recette.", 413);
    // Session, permission and state are checked again after rendering, before any byte is returned.
    await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.missionData(tx, scope, selection)).mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
    return pack;
  }
  async download(request: Request, dossierId: string, pid: string, documentId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => FixedAssetImports.from(await tx.imports(scope)).download(scope, documentId, actor));
  }
  async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: FixedAssetSourceType, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      if (file.size > LIMITS.file) throw new ApiError("FA_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
      const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
      let batch = await previewImport(safeFile, scope, mapping, actor, type, "fixed_assets.review");
      assertFixedAssetBatch(batch, period);
      if (Buffer.byteLength(JSON.stringify(batch)) > LIMITS.file) throw new ApiError("FA_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
      const { previewHash: _hash, ...base } = batch; void _hash;
      base.document = { ...base.document, logicalId: type, storageRef: "postgres-fa:" + batch.id };
      batch = { ...base, previewHash: stableSha256(base) };
      const original = Buffer.from(await safeFile.arrayBuffer()).toString("base64");
      return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: batch.previewHash }, async () => {
        await tx.insertImport(scope, type, batch, original);
        return { batch: FixedAssetImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
      });
    });
  }
  async approveImport(request: Request, dossierId: string, pid: string, command: { importId: string; previewHash: string; expectedSourceId: string | null }, key: string) {
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
      const batch = FixedAssetImports.from(await tx.imports(scope)).get(scope, command.importId, actor);
      if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length) throw new Error("IMPORT_REJECTED_OR_STALE");
      const head = (await tx.heads(scope)).find(h => h.document_type === batch.document.documentType)?.import_id ?? null;
      if (batch.approval && head !== batch.id) throw new Error("FA_SOURCE_REPLACED_REVISION_REQUIRED");
      if (head !== command.expectedSourceId) throw new Error("FA_SOURCE_HEAD_CONFLICT");
      await tx.approveImport(scope, batch.id, actor.id, new Date(this.now() * 1000).toISOString(), batch.previewHash);
      await tx.setHead(scope, batch.document.documentType, batch.id);
      return { batch: FixedAssetImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
    }));
  }
  async command(request: Request, dossierId: string, pid: string, command: FixedAssetCommand, key: string) {
    const permission = command.command === "review" || command.command === "lock" ? "review" : "prepare";
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
      const imports = FixedAssetImports.from(await tx.imports(scope)), repository = new FixedAssetWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new FixedAssetsRegistry(), async () => actor, () => at, "fixed_assets.review");
      if (command.command === "create") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, FIXED_ASSETS_TEMPLATE, "fixed-assets-review") };
      }
      const current = await repository.get(scope, command.id);
      if (!current) throw new Error("WORKPAPER_NOT_FOUND");
      if (current.fixedAssetWork) fixedAssetWorkSchema.parse(current.fixedAssetWork);
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const id = command.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze": {
          if (current.state !== "draft" || current.population) throw new Error("FA_FREEZE_NOT_ALLOWED");
          const heads = await tx.heads(scope), faHeads = heads.filter(h => FA_TYPES.includes(h.document_type as FixedAssetSourceType));
          // The browser names the sources it reviewed; they must be exactly the current approved heads.
          if (stableSha256([...command.importIds].sort()) !== stableSha256(faHeads.map(h => h.import_id).sort())) throw new Error("FA_CURRENT_SOURCES_REQUIRED");
          const batches = command.importIds.map(i => imports.get(scope, i, actor)), facts = buildFixedAssetFacts(scope, current.period, batches, id);
          const selectedIds = facts.units.filter(u => u.inScope).map(u => u.unitId);
          if (!selectedIds.length) throw new Error("FA_NO_ASSET_IN_SCOPE");
          run = await service.configureFixedAssets(scope, id, v, stampFixedAssetWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, actor, at }));
          const population = freezePopulation(scope, batches, "asset", actor);
          const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les actifs et composants du registre au traitement standard ; actifs complexes déclarés exclus avec motif", requestedSize: selectedIds.length, selectedIds,
            exclusions: facts.units.filter(u => !u.inScope).map(u => ({ id: u.unitId, reason: u.exclusionReason! })) }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source Immobilisations figée");
          run = await service.transition(scope, id, run.version, "ready"); break;
        }
        case "configure": {
          if (!current.population || !current.fixedAssetWork) throw new Error("FA_FROZEN_INPUTS_REQUIRED");
          const batches = current.importIds.map(i => imports.get(scope, i, actor));
          run = await service.configureFixedAssets(scope, id, v, stampFixedAssetWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, actor, at, previous: current.fixedAssetWork })); break;
        }
        case "execute": {
          if (!current.fixedAssetWork) throw new Error("FA_WORK_REQUIRED");
          run = await service.execute(scope, id, v, { work: current.fixedAssetWork, runId: id });
          if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
            const exceptions = (run.result!.result as FixedAssetResult).exceptions;
            for (const e of exceptions) run = await service.addNote(scope, id, run.version, { id: "fa-exception:" + e.id, kind: FA_UNCERTAINTY_CODES.includes(e.code) ? "missing_evidence" : "observation", text: e.label + " — " + e.message, amount: e.amount, blocking: true });
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
