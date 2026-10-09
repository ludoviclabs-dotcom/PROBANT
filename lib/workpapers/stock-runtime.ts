import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { neutralizeFileName } from "@/lib/security/filename";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { STOCK_TEMPLATE, StockRegistry } from "./stock-adapter";
import type { StockCommand } from "./stock-commands";
import { evaluateStocks, resolveStockCitation, stampStockWork, stockNoteCitation, stockWorkSchema, ST_UNCERTAINTY_CODES, type StockCitationInput, type StockResult } from "./stock-review";
import { assertStockBatch, ST_TYPES, stockSourcesCurrent, StockSourceError, type StockSourceType } from "./stock-sources";
import { StockImports, StockWorkpaperRepository, type StockDatabase, type StockTx } from "./stock-store";
import { previewImport, type ImportBatch, type ImportMapping } from "./imports";
import { periodId, type NoteCitation, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Permission, Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
const LIMITS = { versions: 500, bytes: 48 * 1024 * 1024, response: 10 * 1024 * 1024, file: 3 * 1024 * 1024 };
/** Human decisions that must cite a frozen piece and its version. */
const CITED_NOTE_KINDS = ["judgment", "validated_anomaly"];
/** Rows returned to the browser: the citable pieces in full; counts, system and movements are summarized (the result carries the lines it uses). */
const ROWS_SENT: Record<StockSourceType, number> = { st_count: 5, st_system: 5, st_movements: 5, st_support: 2000, st_costs: 5, st_ledger: 500 };

/** Durable server runtime of the stock sheet. Identity, permissions, dates, authors and citations come from the server only. */
export class StockRuntime {
  constructor(private readonly db: StockDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
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
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: StockTx, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
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
  private async receipt<T>(tx: StockTx, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actor.id, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actor.id, key, hash, response);
    return response;
  }
  private async bounded(tx: StockTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.versions > LIMITS.versions || size.versionBytes > LIMITS.bytes || size.sourceBytes > LIMITS.bytes) throw new ApiError("ST_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
  }
  private async assertCurrent(tx: StockTx, scope: WorkpaperScope, run: WorkpaperRun) {
    if (!stockSourcesCurrent(run.importIds, await tx.heads(scope))) throw new Error("ST_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  /** A human decision cites a frozen document version (and one of its rows); file name, hash and locator are resolved here. */
  private citation(imports: StockImports, run: WorkpaperRun, input: StockCitationInput): NoteCitation {
    return stockNoteCitation(resolveStockCitation(imports.batches.filter(b => run.importIds.includes(b.id)), input));
  }
  async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
      await this.bounded(tx, scope);
      const repository = new StockWorkpaperRepository(tx), imports = StockImports.from(await tx.imports(scope)), heads = await tx.heads(scope);
      const ids = id ? [id] : await tx.runIds(scope);
      const currentRuns = (await Promise.all(ids.map(r => repository.get(scope, r)))).filter((r): r is WorkpaperRun => !!r);
      const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
      if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
      for (const runId of await tx.runIds(scope)) { const r = await repository.get(scope, runId); if (r && (!lineageCurrent[r.rootId] || r.revision > lineageCurrent[r.rootId].revision)) lineageCurrent[r.rootId] = { id: r.id, version: r.version, revision: r.revision }; }
      const stockHeads = heads.filter(h => (ST_TYPES as readonly string[]).includes(h.document_type)), sourcesCurrent: Record<string, boolean> = {};
      for (const r of runs) sourcesCurrent[r.id] = stockSourcesCurrent(r.importIds, heads);
      // Version history per source type: a replaced count sheet stays visible with its hash, never silently overwritten.
      const versions: Record<string, { importId: string; documentVersionId: string; fileName: string; sha256: string; approvedAt: string; current: boolean }[]> = {};
      for (const b of imports.batches.filter(b => b.approval)) (versions[b.document.documentType] ??= []).push({ importId: b.id, documentVersionId: b.document.id, fileName: b.document.fileName, sha256: b.document.byteHash, approvedAt: b.approval!.at,
        current: heads.some(h => h.document_type === b.document.documentType && h.import_id === b.id) });
      for (const list of Object.values(versions)) list.sort((a, b) => a.approvedAt < b.approvedAt ? -1 : a.approvedAt > b.approvedAt ? 1 : a.importId < b.importId ? -1 : 1);
      const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, sourcesCurrent, expectedSources: stockHeads.map(h => h.import_id).sort(), lineageCurrent, versions,
        currentVersions: Object.fromEntries(currentRuns.map(r => [r.id, r.version])),
        imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, ROWS_SENT[b.document.documentType as StockSourceType] ?? 0), rowCount: b.rows.length })), sourceHeads: heads, ...(history && id ? { history: await repository.history(scope, id) } : {}) };
      if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("ST_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
      return response;
    });
  }
  async download(request: Request, dossierId: string, pid: string, documentId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => StockImports.from(await tx.imports(scope)).download(scope, documentId, actor));
  }
  async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: StockSourceType, key: string) {
    if (!(ST_TYPES as readonly string[]).includes(type)) throw new Error("ST_SOURCE_TYPE_INVALID");
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      if (file.size > LIMITS.file) throw new ApiError("ST_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
      const safeFile = new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
      const batch = await previewImport(safeFile, scope, mapping, actor, type, "stocks.count");
      // A malformed line is refused at preview with its physical locator; nothing is stored.
      assertStockBatch(batch, period);
      if (Buffer.byteLength(JSON.stringify(batch)) > LIMITS.file * 3) throw new ApiError("ST_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
      const { previewHash: _hash, ...base } = batch; void _hash;
      base.document = { ...base.document, logicalId: type, storageRef: "postgres-st:" + batch.id };
      const staged: ImportBatch = { ...base, previewHash: stableSha256(base) };
      const original = Buffer.from(await safeFile.arrayBuffer()).toString("base64");
      return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: staged.previewHash }, async () => {
        // The aggregate source budget is checked before storing: an append-only preview can never make the workspace unreadable.
        const size = await tx.sizes(scope);
        if (size.sourceBytes + Buffer.byteLength(JSON.stringify(staged)) + original.length > LIMITS.bytes) throw new ApiError("ST_STATE_LIMIT", "Volume des sources de cette recette atteint : aucune nouvelle pièce n’est conservée.", 413);
        await tx.insertImport(scope, type, staged, original);
        return { batch: StockImports.from(await tx.imports(scope)).get(scope, staged.id, actor) };
      });
    });
  }
  async approveImport(request: Request, dossierId: string, pid: string, command: { importId: string; previewHash: string; expectedSourceId: string | null }, key: string) {
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
      const batch = StockImports.from(await tx.imports(scope)).get(scope, command.importId, actor), head = batch.document.documentType;
      if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length) throw new Error("IMPORT_REJECTED_OR_STALE");
      const current = (await tx.heads(scope)).find(h => h.document_type === head)?.import_id ?? null;
      if (batch.approval && current !== batch.id) throw new Error("ST_SOURCE_REPLACED_REVISION_REQUIRED");
      if (current !== command.expectedSourceId) throw new Error("ST_SOURCE_HEAD_CONFLICT");
      await tx.approveImport(scope, batch.id, actor.id, new Date(this.now() * 1000).toISOString(), batch.previewHash);
      await tx.setHead(scope, head, batch.id);
      return { batch: StockImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
    }));
  }
  async command(request: Request, dossierId: string, pid: string, command: StockCommand, key: string) {
    const permission = command.command === "review" || command.command === "lock" ? "review" : "prepare";
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
      const imports = StockImports.from(await tx.imports(scope)), repository = new StockWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new StockRegistry(), async () => actor, () => at, "stocks.count");
      if (command.command === "create") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, STOCK_TEMPLATE, "stocks-count") };
      }
      const current = await repository.get(scope, command.id);
      if (!current) throw new Error("WORKPAPER_NOT_FOUND");
      if (current.stockWork) stockWorkSchema.parse(current.stockWork);
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const id = command.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze": {
          if (current.state !== "draft" || current.population) throw new Error("ST_FREEZE_NOT_ALLOWED");
          const heads = (await tx.heads(scope)).filter(h => (ST_TYPES as readonly string[]).includes(h.document_type));
          // The browser names the sources it reviewed; they must be exactly the current approved heads.
          if (stableSha256([...command.importIds].sort()) !== stableSha256(heads.map(h => h.import_id).sort())) throw new Error("ST_CURRENT_SOURCES_REQUIRED");
          const batches = command.importIds.map(i => imports.get(scope, i, actor));
          const work = stampStockWork({ imports: batches, draft: command.draft, actor, at });
          const units = evaluateStocks(scope, current.period, batches, id, work).units, selectedIds = units.filter(u => u.inScope).map(u => u.unitId);
          if (!selectedIds.length) throw new Error("ST_NO_OWN_STOCK_UNIT");
          run = await service.configureStocks(scope, id, v, work);
          const population = freezePopulation(scope, batches, "stock_unit", actor);
          const selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les références / sites / lots de stock propre comptés ou portés par l’état théorique ; stocks de tiers, consignations, transits, en-cours, références exclues et sites non visités exclus avec leur motif",
            requestedSize: selectedIds.length, selectedIds, exclusions: units.filter(u => !u.inScope).map(u => ({ id: u.unitId, reason: u.reason })) }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source Stocks figée");
          run = await service.transition(scope, id, run.version, "ready"); break;
        }
        case "configure": {
          if (!current.population || !current.stockWork) throw new Error("ST_FROZEN_INPUTS_REQUIRED");
          const batches = current.importIds.map(i => imports.get(scope, i, actor));
          run = await service.configureStocks(scope, id, v, stampStockWork({ imports: batches, draft: command.draft, actor, at })); break;
        }
        case "execute": {
          if (!current.stockWork) throw new Error("ST_WORK_REQUIRED");
          run = await service.execute(scope, id, v, { work: current.stockWork, runId: id });
          if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
            const exceptions = (run.result!.result as StockResult).exceptions;
            // All generated notes land in a single version, however many exceptions the execution produced.
            if (exceptions.length) run = await service.addNotes(scope, id, run.version, exceptions.map(e => ({ id: "st-exception:" + e.id, kind: ST_UNCERTAINTY_CODES.includes(e.code) ? "missing_evidence" as const : "observation" as const, text: e.label + " — " + e.message, amount: e.amount, blocking: true })));
          }
          break;
        }
        case "note": {
          if (CITED_NOTE_KINDS.includes(command.note.kind) && !command.citation) throw new Error("ST_CITATION_REQUIRED");
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
export { StockSourceError };
