import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { buildEquityMissionPackage, type EquityExportKind } from "@/lib/evidence/equity-mission-package";
import { neutralizeFileName } from "@/lib/security/filename";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { EQUITY_TEMPLATE, EquityRegistry } from "./equity-adapter";
import type { EquityCitationInput, EquityCommand } from "./equity-commands";
import { buildEquityMission, type EquityMissionSelection } from "./equity-mission";
import { previewMinutes } from "./equity-minutes";
import { EQ_UNCERTAINTY_CODES, equityWorkSchema, stampEquityWork, type EquityResult } from "./equity-review";
import { assertEquityBatch, buildEquityFacts, equityFactsView, equityHeadKey, equityPopulationExclusions, equitySourcesCurrent, EquitySourceError, type EquityFactsView, type EquityMinutesForm, type EquityTabularType } from "./equity-sources";
import { EquityImports, EquityWorkpaperRepository, type EquityDatabase, type EquityTx } from "./equity-store";
import { previewImport, type ImportBatch, type ImportMapping } from "./imports";
import { periodId, type NoteCitation, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Permission, Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
const LIMITS = { versions: 500, bytes: 48 * 1024 * 1024, response: 10 * 1024 * 1024, file: 3 * 1024 * 1024, export: 16 * 1024 * 1024 };
/** Human decisions that must cite a frozen piece and its version. */
const CITED_NOTE_KINDS = ["judgment", "validated_anomaly"];
/** Durable server runtime of the equity review. Identity, permissions, dates, authors and citations come from the server only. */
export class EquityRuntime {
  constructor(private readonly db: EquityDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
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
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: EquityTx, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
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
  private async receipt<T>(tx: EquityTx, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actor.id, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actor.id, key, hash, response);
    return response;
  }
  private async bounded(tx: EquityTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.versions > LIMITS.versions || size.versionBytes > LIMITS.bytes || size.sourceBytes > LIMITS.bytes) throw new ApiError("EQ_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
  }
  private async assertCurrent(tx: EquityTx, scope: WorkpaperScope, run: WorkpaperRun) {
    if (!equitySourcesCurrent(run.importIds, await tx.heads(scope))) throw new Error("EQ_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  /** A human decision cites a frozen document version (and a page of a PV); everything else is resolved here, never typed by the browser. */
  private citation(imports: EquityImports, run: WorkpaperRun, input: EquityCitationInput): NoteCitation {
    const batch = imports.batches.find(b => b.document.id === input.documentId && run.importIds.includes(b.id));
    if (!batch) throw new Error("EQ_CITATION_SOURCE_REQUIRED");
    const pdf = batch.document.format === "pdf";
    if (pdf ? !input.page || input.page > batch.rows.length : input.page !== undefined) throw new Error("EQ_CITATION_PAGE_INVALID");
    return { documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash, ...(pdf ? { pieceRef: batch.mapping.equity?.pieceRef, page: input.page } : {}) };
  }
  async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
      await this.bounded(tx, scope);
      const repository = new EquityWorkpaperRepository(tx), imports = EquityImports.from(await tx.imports(scope)), heads = await tx.heads(scope);
      const ids = id ? [id] : await tx.runIds(scope);
      const currentRuns = (await Promise.all(ids.map(r => repository.get(scope, r)))).filter((r): r is WorkpaperRun => !!r);
      const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
      if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
      for (const runId of await tx.runIds(scope)) { const r = await repository.get(scope, runId); if (r && (!lineageCurrent[r.rootId] || r.revision > lineageCurrent[r.rootId].revision)) lineageCurrent[r.rootId] = { id: r.id, version: r.version, revision: r.revision }; }
      const facts: Record<string, EquityFactsView | null> = {}, factsIssues: Record<string, { code: string; locator?: EquitySourceError["locator"] }> = {}, sourcesCurrent: Record<string, boolean> = {};
      for (const r of runs) {
        sourcesCurrent[r.id] = equitySourcesCurrent(r.importIds, heads);
        const batchIds = r.importIds.length ? r.importIds : heads.map(h => h.import_id);
        const batches = imports.batches.filter(b => batchIds.includes(b.id) && b.approval);
        try { facts[r.id] = batches.some(b => b.document.documentType === "eq_balances") && batches.some(b => b.document.documentType === "eq_entries") ? equityFactsView(buildEquityFacts(scope, r.period, batches, r.id)) : null; }
        catch (error) { facts[r.id] = null; factsIssues[r.id] = error instanceof EquitySourceError ? { code: error.code, locator: error.locator } : { code: error instanceof Error ? error.message : "EQ_SOURCES_INVALID" }; }
      }
      const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, facts, factsIssues, sourcesCurrent, lineageCurrent, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id, r.version])),
        imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: heads, ...(history && id ? { history: await repository.history(scope, id) } : {}) };
      if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("EQ_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
      return response;
    });
  }
  private async missionData(tx: EquityTx, scope: WorkpaperScope, selection: EquityMissionSelection) {
    await this.bounded(tx, scope);
    const versions = await tx.allVersions(scope), imports = EquityImports.from(await tx.imports(scope)), heads = await tx.heads(scope), createdAt = await tx.dossierCreatedAt(scope);
    if (!createdAt) throw new Error("WORKPAPER_NOT_FOUND");
    const mission = buildEquityMission(scope, versions, imports.batches, heads, selection, createdAt);
    if (Buffer.byteLength(JSON.stringify(mission)) > LIMITS.response) throw new ApiError("EQ_MISSION_LIMIT", "Synthèse trop volumineuse pour cette recette.", 413);
    return { mission, run: versions.find(r => r.id === mission.procedure.runId && r.version === mission.procedure.version) ?? null, imports: imports.batches };
  }
  async mission(request: Request, dossierId: string, pid: string, selection: EquityMissionSelection = {}) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => ({ actorId: actor.id, permissions: actor.grants[0].permissions, mission: (await this.missionData(tx, scope, selection)).mission }));
  }
  async missionExport(request: Request, dossierId: string, pid: string, selection: EquityMissionSelection, kind: EquityExportKind, expectedSnapshotHash: string) {
    const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const data = await this.missionData(tx, scope, selection);
      if (data.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      return data;
    });
    const pack = await buildEquityMissionPackage(data.mission, data.run, data.imports, kind, data.mission.stateAsOf!);
    if (Buffer.byteLength(pack.canonicalJson) > LIMITS.export || pack.pdf.byteLength > LIMITS.export || Buffer.byteLength(pack.html) > LIMITS.export) throw new ApiError("EQ_EXPORT_LIMIT", "Export trop volumineux pour cette recette.", 413);
    // Session, permission and state are checked again after rendering, before any byte is returned.
    await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.missionData(tx, scope, selection)).mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
    return pack;
  }
  async download(request: Request, dossierId: string, pid: string, documentId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => EquityImports.from(await tx.imports(scope)).download(scope, documentId, actor));
  }
  private async stage(tx: EquityTx, scope: WorkpaperScope, actor: Principal, key: string, period: AccountingPeriod, batch: ImportBatch, file: File) {
    assertEquityBatch(batch, period);
    if (Buffer.byteLength(JSON.stringify(batch)) > LIMITS.file) throw new ApiError("EQ_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
    const { previewHash: _hash, ...base } = batch; void _hash;
    base.document = { ...base.document, logicalId: batch.document.documentType === "eq_minutes" ? batch.document.logicalId : batch.document.documentType, storageRef: "postgres-eq:" + batch.id };
    const staged = { ...base, previewHash: stableSha256(base) };
    const original = Buffer.from(await file.arrayBuffer()).toString("base64");
    return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: staged.previewHash }, async () => {
      // The aggregate source budget is checked before storing: an append-only preview can never make the workspace unreadable.
      const size = await tx.sizes(scope);
      if (size.sourceBytes + Buffer.byteLength(JSON.stringify(staged)) + original.length > LIMITS.bytes) throw new ApiError("EQ_STATE_LIMIT", "Volume des sources de cette recette atteint : aucune nouvelle pièce n’est conservée.", 413);
      await tx.insertImport(scope, staged.document.documentType, staged, original);
      return { batch: EquityImports.from(await tx.imports(scope)).get(scope, staged.id, actor) };
    });
  }
  async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: EquityTabularType, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      if (file.size > LIMITS.file) throw new ApiError("EQ_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
      const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
      return this.stage(tx, scope, actor, key, period, await previewImport(safeFile, scope, mapping, actor, type, "equity.review"), safeFile);
    });
  }
  async previewMinutes(request: Request, dossierId: string, period: AccountingPeriod, file: File, form: EquityMinutesForm, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      if (file.size > LIMITS.file) throw new ApiError("EQ_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
      const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
      return this.stage(tx, scope, actor, key, period, await previewMinutes(safeFile, scope, form, actor), safeFile);
    });
  }
  async approveImport(request: Request, dossierId: string, pid: string, command: { importId: string; previewHash: string; expectedSourceId: string | null }, key: string) {
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
      const batch = EquityImports.from(await tx.imports(scope)).get(scope, command.importId, actor), head = equityHeadKey(batch);
      if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length) throw new Error("IMPORT_REJECTED_OR_STALE");
      const current = (await tx.heads(scope)).find(h => h.document_type === head)?.import_id ?? null;
      if (batch.approval && current !== batch.id) throw new Error("EQ_SOURCE_REPLACED_REVISION_REQUIRED");
      if (current !== command.expectedSourceId) throw new Error("EQ_SOURCE_HEAD_CONFLICT");
      await tx.approveImport(scope, batch.id, actor.id, new Date(this.now() * 1000).toISOString(), batch.previewHash);
      await tx.setHead(scope, head, batch.id);
      return { batch: EquityImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
    }));
  }
  async command(request: Request, dossierId: string, pid: string, command: EquityCommand, key: string) {
    const permission = command.command === "review" || command.command === "lock" ? "review" : "prepare";
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
      const imports = EquityImports.from(await tx.imports(scope)), repository = new EquityWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new EquityRegistry(), async () => actor, () => at, "equity.review");
      if (command.command === "create") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, EQUITY_TEMPLATE, "equity-review") };
      }
      const current = await repository.get(scope, command.id);
      if (!current) throw new Error("WORKPAPER_NOT_FOUND");
      if (current.equityWork) equityWorkSchema.parse(current.equityWork);
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const id = command.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze": {
          if (current.state !== "draft" || current.population) throw new Error("EQ_FREEZE_NOT_ALLOWED");
          const heads = (await tx.heads(scope)).filter(h => h.document_type.startsWith("eq_"));
          // The browser names the sources it reviewed; they must be exactly the current approved heads, PV included.
          if (stableSha256([...command.importIds].sort()) !== stableSha256(heads.map(h => h.import_id).sort())) throw new Error("EQ_CURRENT_SOURCES_REQUIRED");
          const batches = command.importIds.map(i => imports.get(scope, i, actor)), facts = buildEquityFacts(scope, current.period, batches, id);
          const population = freezePopulation(scope, batches, "decision_movement", actor), exclusions = equityPopulationExclusions(facts);
          const selectedIds = population.items.map(i => i.id).filter(i => !exclusions.some(e => e.id === i));
          if (!selectedIds.length) throw new Error("EQ_NO_ITEM_IN_SCOPE");
          run = await service.configureEquity(scope, id, v, stampEquityWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, actor, at }));
          const selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les écritures de l’exercice et toutes les lignes de décision des composantes de capitaux propres ; autres fonds propres exclus avec motif", requestedSize: selectedIds.length, selectedIds, exclusions }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source Capitaux propres figée");
          run = await service.transition(scope, id, run.version, "ready"); break;
        }
        case "configure": {
          if (!current.population || !current.equityWork) throw new Error("EQ_FROZEN_INPUTS_REQUIRED");
          const batches = current.importIds.map(i => imports.get(scope, i, actor));
          run = await service.configureEquity(scope, id, v, stampEquityWork({ scope, period: current.period, runId: id, imports: batches, draft: command.draft, actor, at, previous: current.equityWork })); break;
        }
        case "execute": {
          if (!current.equityWork) throw new Error("EQ_WORK_REQUIRED");
          run = await service.execute(scope, id, v, { work: current.equityWork, runId: id });
          if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
            const exceptions = (run.result!.result as EquityResult).exceptions;
            // All generated notes land in a single version, however many exceptions the execution produced.
            if (exceptions.length) run = await service.addNotes(scope, id, run.version, exceptions.map(e => ({ id: "eq-exception:" + e.id, kind: EQ_UNCERTAINTY_CODES.includes(e.code) ? "missing_evidence" as const : "observation" as const, text: e.label + " — " + e.message, amount: e.amount, blocking: true })));
          }
          break;
        }
        case "note": {
          if (CITED_NOTE_KINDS.includes(command.note.kind) && !command.citation) throw new Error("EQ_CITATION_REQUIRED");
          run = await service.addNote(scope, id, v, { ...command.note, ...(command.citation ? { citation: this.citation(imports, current, command.citation) } : {}) }); break;
        }
        case "resolve": run = await service.resolveNote(scope, id, v, command.noteId, command.text, this.citation(imports, current, command.citation)); break;
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
