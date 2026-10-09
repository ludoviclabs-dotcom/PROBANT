import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { neutralizeFileName } from "@/lib/security/filename";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { buildFiscalMissionPackage, type FiscalExportKind } from "@/lib/evidence/fiscal-mission-package";
import { FiscalRegistry, VAT_TEMPLATE } from "./fiscal-adapter";
import { buildFiscalMission, type FiscalMissionSelection } from "./fiscal-mission";
import type { FiscalCommand } from "./fiscal-commands";
import { parseFiscalWork, type FiscalResult } from "./fiscal-review";
import { assertFiscalBatch, FiscalSourceError, FX_TABULAR_TYPES, fiscalRelevance, previewDeclaration, previewFec, vatPopulationExclusions, fiscalSourcesCurrent, type DeclarationForm, type FiscalTabularType } from "./fiscal-sources";
import { initialVatWork, stampVatWork, VAT_UNCERTAINTY_CODES } from "./fiscal-vat";
import { periodMatchesFrequency, resolveCitation, toNoteCitation, type FiscalCitationInput } from "./fiscal-work";
import { FiscalImports, FiscalWorkpaperRepository, type FiscalDatabase, type FiscalSourceHead, type FiscalTx } from "./fiscal-store";
import { previewImport, type ImportBatch, type ImportMapping } from "./imports";
import { periodId, type NoteCitation, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Permission, Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
const LIMITS = { versions: 500, bytes: 48 * 1024 * 1024, response: 10 * 1024 * 1024, file: 3 * 1024 * 1024, export: 16 * 1024 * 1024 };
/** Human decisions that must cite a frozen piece and its version. */
const CITED_NOTE_KINDS = ["judgment", "validated_anomaly"];
/** Rows returned to the browser for citation: declarations, payments and pieces are small; the FEC and the invoice inventory are summarized. */
const ROWS_SENT: Record<string, number> = { fx_fec: 0, fx_invoices: 0, fx_vat_return: 500, fx_cit_return: 500, fx_vat_payments: 500, fx_support: 2000 };

/** Durable server runtime of the fiscal sheets. Identity, permissions, dates, authors and citations come from the server only. */
export class FiscalRuntime {
  constructor(private readonly db: FiscalDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
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
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: FiscalTx, scope: WorkpaperScope, actor: Principal) => Promise<T>) {
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
  private async receipt<T>(tx: FiscalTx, scope: WorkpaperScope, actor: Principal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actor.id, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actor.id, key, hash, response);
    return response;
  }
  private async bounded(tx: FiscalTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.versions > LIMITS.versions || size.versionBytes > LIMITS.bytes || size.sourceBytes > LIMITS.bytes) throw new ApiError("FX_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
  }
  private expected(run: WorkpaperRun, heads: FiscalSourceHead[]) { const relevant = fiscalRelevance(run, heads); return heads.filter(h => relevant(h.document_type)).map(h => h.import_id).sort(); }
  private async assertCurrent(tx: FiscalTx, scope: WorkpaperScope, run: WorkpaperRun) {
    const heads = await tx.heads(scope);
    if (!fiscalSourcesCurrent(run.importIds, heads, fiscalRelevance(run, heads))) throw new Error("FX_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  /** A human decision cites a frozen document version (and one of its rows); file name, hash and locator are resolved here. */
  private citation(imports: FiscalImports, run: WorkpaperRun, input: FiscalCitationInput): NoteCitation {
    return toNoteCitation(resolveCitation(imports.batches.filter(b => run.importIds.includes(b.id)), input));
  }
  async read(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => {
      await this.bounded(tx, scope);
      const repository = new FiscalWorkpaperRepository(tx), imports = FiscalImports.from(await tx.imports(scope)), heads = await tx.heads(scope);
      const ids = id ? [id] : await tx.runIds(scope);
      const currentRuns = (await Promise.all(ids.map(r => repository.get(scope, r)))).filter((r): r is WorkpaperRun => !!r);
      const runs = version !== undefined && id ? (await repository.history(scope, id)).filter(r => r.version === version) : currentRuns;
      if (version !== undefined && !runs.length) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      const lineageCurrent: Record<string, { id: string; version: number; revision: number }> = {};
      for (const runId of await tx.runIds(scope)) { const r = await repository.get(scope, runId); if (r && (!lineageCurrent[r.rootId] || r.revision > lineageCurrent[r.rootId].revision)) lineageCurrent[r.rootId] = { id: r.id, version: r.version, revision: r.revision }; }
      const sourcesCurrent: Record<string, boolean> = {}, expectedSources: Record<string, string[]> = {};
      for (const r of runs) { const relevant = fiscalRelevance(r, heads); sourcesCurrent[r.id] = fiscalSourcesCurrent(r.importIds, heads, relevant); expectedSources[r.id] = this.expected(r, heads); }
      // Version history per head key: a replaced return stays visible with its hash, never silently overwritten.
      const versions: Record<string, { importId: string; documentVersionId: string; fileName: string; sha256: string; approvedAt: string; current: boolean }[]> = {};
      for (const b of imports.batches.filter(b => b.approval)) (versions[b.document.logicalId] ??= []).push({ importId: b.id, documentVersionId: b.document.id, fileName: b.document.fileName, sha256: b.document.byteHash, approvedAt: b.approval!.at,
        current: heads.some(h => h.document_type === b.document.logicalId && h.import_id === b.id) });
      for (const list of Object.values(versions)) list.sort((a, b) => a.approvedAt < b.approvedAt ? -1 : a.approvedAt > b.approvedAt ? 1 : a.importId < b.importId ? -1 : 1);
      const response = { actorId: actor.id, permissions: actor.grants[0].permissions, runs, sourcesCurrent, expectedSources, lineageCurrent, currentVersions: Object.fromEntries(currentRuns.map(r => [r.id, r.version])), versions,
        imports: imports.batches.map(b => ({ ...b, rows: b.rows.slice(0, ROWS_SENT[b.document.documentType] ?? 0), rowCount: b.rows.length })), sourceHeads: heads, ...(history && id ? { history: await repository.history(scope, id) } : {}) };
      if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("FX_STATE_LIMIT", "État trop volumineux pour cette recette.", 413);
      return response;
    });
  }
  private async missionData(tx: FiscalTx, scope: WorkpaperScope, selection: FiscalMissionSelection) {
    await this.bounded(tx, scope);
    const versions = await tx.allVersions(scope), imports = FiscalImports.from(await tx.imports(scope)), heads = await tx.heads(scope), createdAt = await tx.dossierCreatedAt(scope);
    if (!createdAt) throw new Error("WORKPAPER_NOT_FOUND");
    const mission = buildFiscalMission(scope, versions, imports.batches, heads, selection, createdAt);
    if (Buffer.byteLength(JSON.stringify(mission)) > LIMITS.response) throw new ApiError("FX_MISSION_LIMIT", "Synthèse trop volumineuse pour cette recette.", 413);
    return { mission, run: versions.find(r => r.id === mission.procedure.runId && r.version === mission.procedure.version) ?? null, imports: imports.batches };
  }
  async mission(request: Request, dossierId: string, pid: string, selection: FiscalMissionSelection = {}) {
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, actor) => ({ actorId: actor.id, permissions: actor.grants[0].permissions, mission: (await this.missionData(tx, scope, selection)).mission }));
  }
  async missionExport(request: Request, dossierId: string, pid: string, selection: FiscalMissionSelection, kind: FiscalExportKind, expectedSnapshotHash: string) {
    const data = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const data = await this.missionData(tx, scope, selection);
      if (data.mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      return data;
    });
    const pack = await buildFiscalMissionPackage(data.mission, data.run, data.imports, kind, data.mission.stateAsOf!);
    if (Buffer.byteLength(pack.canonicalJson) > LIMITS.export || pack.pdf.byteLength > LIMITS.export || Buffer.byteLength(pack.html) > LIMITS.export) throw new ApiError("FX_EXPORT_LIMIT", "Export trop volumineux pour cette recette.", 413);
    // Session, permission and state are checked again after rendering, before any byte is returned.
    await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.missionData(tx, scope, selection)).mission.hash !== expectedSnapshotHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
    return pack;
  }
  async download(request: Request, dossierId: string, pid: string, documentId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope, actor) => FiscalImports.from(await tx.imports(scope)).download(scope, documentId, actor));
  }
  private async stage(tx: FiscalTx, scope: WorkpaperScope, actor: Principal, key: string, period: AccountingPeriod, batch: ImportBatch, file: File) {
    assertFiscalBatch(batch);
    if (Buffer.byteLength(JSON.stringify(batch)) > LIMITS.file * 3) throw new ApiError("FX_PREVIEW_LIMIT", "Aperçu trop volumineux pour cette recette.", 413);
    const { previewHash: _hash, ...base } = batch; void _hash;
    // A table is one head per source type; the FEC and the returns already carry their server-built key.
    const tabular = (FX_TABULAR_TYPES as readonly string[]).includes(batch.document.documentType);
    base.document = { ...base.document, logicalId: tabular ? batch.document.documentType : batch.document.logicalId, storageRef: "postgres-fx:" + batch.id };
    const staged = { ...base, previewHash: stableSha256(base) };
    const original = Buffer.from(await file.arrayBuffer()).toString("base64");
    return this.receipt(tx, scope, actor, key, { operation: "preview", period, batchHash: staged.previewHash }, async () => {
      // The aggregate source budget is checked before storing: an append-only preview can never make the workspace unreadable.
      const size = await tx.sizes(scope);
      if (size.sourceBytes + Buffer.byteLength(JSON.stringify(staged)) + original.length > LIMITS.bytes) throw new ApiError("FX_STATE_LIMIT", "Volume des sources de cette recette atteint : aucune nouvelle pièce n’est conservée.", 413);
      await tx.insertImport(scope, staged.document.documentType, staged, original);
      return { batch: FiscalImports.from(await tx.imports(scope)).get(scope, staged.id, actor) };
    });
  }
  private async safeFile(file: File) {
    if (file.size > LIMITS.file) throw new ApiError("FX_FILE_LIMIT", "Fichier limité à 3 Mio pour cette recette.", 413);
    return new File([await file.arrayBuffer()], neutralizeFileName(file.name), { type: file.type });
  }
  async previewFec(request: Request, dossierId: string, period: AccountingPeriod, file: File, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => { const f = await this.safeFile(file); return this.stage(tx, scope, actor, key, period, await previewFec(f, scope, period, actor), f); });
  }
  async previewDeclaration(request: Request, dossierId: string, period: AccountingPeriod, file: File, form: DeclarationForm, key: string) {
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => {
      // Only VAT returns are accepted until the IS sub-lot is delivered.
      if (!["declaration_tva_ca3", "declaration_tva_ca12"].includes(form.documentType)) throw new Error("FX_DECLARATION_TYPE_NOT_ENABLED");
      const f = await this.safeFile(file); return this.stage(tx, scope, actor, key, period, await previewDeclaration(f, scope, period, form, actor), f);
    });
  }
  async preview(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: FiscalTabularType, key: string) {
    if (!(FX_TABULAR_TYPES as readonly string[]).includes(type)) throw new Error("FX_SOURCE_TYPE_INVALID");
    return this.transaction(request, dossierId, periodId(period), "prepare", async (tx, scope, actor) => { const f = await this.safeFile(file); return this.stage(tx, scope, actor, key, period, await previewImport(f, scope, mapping, actor, type, "tva.reconciliation"), f); });
  }
  async approveImport(request: Request, dossierId: string, pid: string, command: { importId: string; previewHash: string; expectedSourceId: string | null }, key: string) {
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "approve_import", ...command }, async () => {
      const batch = FiscalImports.from(await tx.imports(scope)).get(scope, command.importId, actor), head = batch.document.logicalId;
      if (batch.previewHash !== command.previewHash || batch.report.blocking.length || !batch.rows.length) throw new Error("IMPORT_REJECTED_OR_STALE");
      const current = (await tx.heads(scope)).find(h => h.document_type === head)?.import_id ?? null;
      if (batch.approval && current !== batch.id) throw new Error("FX_SOURCE_REPLACED_REVISION_REQUIRED");
      if (current !== command.expectedSourceId) throw new Error("FX_SOURCE_HEAD_CONFLICT");
      await tx.approveImport(scope, batch.id, actor.id, new Date(this.now() * 1000).toISOString(), batch.previewHash);
      await tx.setHead(scope, head, batch.id);
      return { batch: FiscalImports.from(await tx.imports(scope)).get(scope, batch.id, actor) };
    }));
  }
  async command(request: Request, dossierId: string, pid: string, command: FiscalCommand, key: string) {
    const permission = command.command === "review" || command.command === "lock" ? "review" : "prepare";
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, actor) => this.receipt(tx, scope, actor, key, command, async () => {
      const imports = FiscalImports.from(await tx.imports(scope)), repository = new FiscalWorkpaperRepository(tx), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new FiscalRegistry(), async () => actor, () => at, "tva.reconciliation");
      if (command.command === "create") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        const dp = command.declarativePeriod;
        if (dp.startDate > dp.endDate || dp.startDate < command.period.startDate || dp.endDate > command.period.closingDate) throw new Error("FX_DECLARATIVE_PERIOD_OUTSIDE_EXERCISE");
        if (!periodMatchesFrequency(dp, command.frequency)) throw new Error("FX_PERIOD_FREQUENCY_INVALID");
        const work = initialVatWork({ period: dp, frequency: command.frequency, formVintage: command.formVintage, actor, at });
        return { run: await service.create(scope, command.period, VAT_TEMPLATE, `vat:${dp.startDate}:${dp.endDate}`, undefined, work) };
      }
      const current = await repository.get(scope, command.id);
      if (!current) throw new Error("WORKPAPER_NOT_FOUND");
      if (!current.fiscalWork) throw new Error("FX_WORK_REQUIRED");
      parseFiscalWork(current.fiscalWork);
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const id = command.id, v = command.expectedVersion, work = current.fiscalWork;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze": {
          if (current.state !== "draft" || current.population) throw new Error("FX_FREEZE_NOT_ALLOWED");
          // The browser names the sources it reviewed; they must be exactly the current approved heads this period depends on.
          if (stableSha256([...command.importIds].sort()) !== stableSha256(this.expected(current, await tx.heads(scope)))) throw new Error("FX_CURRENT_SOURCES_REQUIRED");
          const batches = command.importIds.map(i => imports.get(scope, i, actor));
          batches.forEach(assertFiscalBatch);
          const stamped = stampVatWork({ scope, runId: id, imports: batches, draft: command.draft, actor, at, previous: work });
          const population = freezePopulation(scope, batches, "vat_entry", actor), exclusions = vatPopulationExclusions(batches, work.period.startDate, work.period.endDate);
          const selectedIds = population.items.map(i => i.id).filter(i => !exclusions.some(e => e.id === i));
          if (!selectedIds.length) throw new Error("FX_NO_VAT_ENTRY_IN_PERIOD");
          run = await service.configureFiscal(scope, id, v, stamped);
          const selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les écritures portant une ligne de TVA (comptes 4457 / 4456, table interne documentée) datées dans la période déclarative ; les autres sont exclues avec leur date", requestedSize: selectedIds.length, selectedIds, exclusions }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          for (const batch of batches) run = await service.addEvidence(scope, id, run.version, batch.id, batch.rows[0].id, "Source fiscale figée");
          run = await service.transition(scope, id, run.version, "ready"); break;
        }
        case "configure": {
          if (!current.population) throw new Error("FX_FROZEN_INPUTS_REQUIRED");
          const batches = current.importIds.map(i => imports.get(scope, i, actor));
          run = await service.configureFiscal(scope, id, v, stampVatWork({ scope, runId: id, imports: batches, draft: command.draft, actor, at, previous: work })); break;
        }
        case "execute": {
          run = await service.execute(scope, id, v, { work, runId: id });
          if (run.state === "executed" && run.result?.outcome !== "no_exception_detected") {
            const exceptions = (run.result!.result as FiscalResult).exceptions;
            // All generated notes land in a single version, however many exceptions the execution produced.
            if (exceptions.length) run = await service.addNotes(scope, id, run.version, exceptions.map(e => ({ id: "fx-exception:" + e.id, kind: VAT_UNCERTAINTY_CODES.includes(e.code) ? "missing_evidence" as const : "observation" as const, text: e.label + " — " + e.message, amount: e.amount, blocking: true })));
          }
          break;
        }
        case "note": {
          if (CITED_NOTE_KINDS.includes(command.note.kind) && !command.citation) throw new Error("FX_CITATION_REQUIRED");
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
export { FiscalSourceError };
