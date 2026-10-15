import { sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { ClientsRuntime } from "./clients-runtime";
import { ClientsImports, ClientsWorkpaperRepository, rows, type ClientsSql } from "./clients-persistence";
import type { ImportBatch, ImportMapping } from "./imports";
import { LoanRegistry, LOAN_TEMPLATE } from "./loan-adapter";
import type { LoanCommand } from "./loan-commands";
import { loanDiagnostic } from "./loan-package";
import { assertLoanBatch, initialLoanDraft, loanFacts, loanReviewPoints, LOAN_TYPES, stampLoanWork, type LoanResult, type LoanType } from "./loan-review";
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

/**
 * Emprunts (C13) on the shared Clients store: same sessions, CSRF, dossier authorization, transactional lock,
 * version history and idempotency receipts. Sources, population, selection, work, rule and result are hashed
 * and versioned; a replaced or added loans source makes the sheet stale until a revision.
 */
export class LoanRuntime extends ClientsRuntime {
  protected override readonly procedureIds = ["loans.review"];
  protected override readonly sourceTypes = LOAN_TYPES;
  protected override importAdapter(): "loans.review" { return "loans.review"; }
  protected override validateSource(batch: ImportBatch, period: AccountingPeriod) { assertLoanBatch(batch, period); }
  protected override async assertCurrent(tx: ClientsSql, scope: WorkpaperScope, run: WorkpaperRun) {
    await super.assertCurrent(tx, scope, run);
    const heads = await this.heads(tx, scope);
    if (run.population && heads.some(h => this.sourceTypes.includes(h.document_type as LoanType) && !run.importIds.includes(h.import_id))) throw new Error("LOAN_SOURCE_REPLACED_REVISION_REQUIRED");
  }
  async previewLoan(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: LoanType, key: string) {
    return this.previewSource(request, dossierId, period, file, mapping, type, key);
  }
  /** Read model: runs, current heads and, per run, the facts of its frozen sources (or of the current heads before freezing). */
  async loanRead(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    const view = await super.read(request, dossierId, pid, id, history, version);
    const extra = await this.transaction(request, dossierId, pid, "read", async (tx, scope) => {
      const imports = await ClientsImports.load(tx, scope), heads = (await this.heads(tx, scope)).filter(h => this.sourceTypes.includes(h.document_type as LoanType));
      const facts: Record<string, ReturnType<typeof loanFacts>> = {}, sourcesCurrent: Record<string, boolean> = {}, factsIssues: Record<string, string> = {};
      for (const run of view.runs) {
        const ids = run.importIds.length ? run.importIds : heads.map(h => h.import_id);
        sourcesCurrent[run.id] = run.importIds.every(i => heads.some(h => h.import_id === i)) && (!run.population || heads.every(h => run.importIds.includes(h.import_id)));
        try { facts[run.id] = loanFacts(scope, run.period, imports.batches.filter(b => ids.includes(b.id) && b.approval), run.id); }
        catch (error) { facts[run.id] = []; factsIssues[run.id] = error instanceof Error ? error.message : "LOAN_SOURCES_INVALID"; }
      }
      return { facts, sourcesCurrent, factsIssues };
    });
    const response = { ...view, ...extra };
    if (Buffer.byteLength(JSON.stringify(response)) > 8 * 1024 * 1024) throw new ApiError("LOAN_STATE_LIMIT", "État trop volumineux.", 413);
    return response;
  }
  /** Latest revision of a lineage: an older revision stays readable and exportable, never editable. */
  private async latestRevisionId(tx: ClientsSql, scope: WorkpaperScope, rootId: string) {
    const [latest] = await rows<{ id: string }>(tx, sql`SELECT h.id FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId} AND v.run->>'rootId'=${rootId} ORDER BY (v.run->>'revision')::int DESC LIMIT 1`);
    return latest?.id ?? null;
  }
  /**
   * Diagnostic of the requested version, rebuilt from that version's own frozen sources. A preserved earlier version, a replaced
   * revision or a version whose sources changed since the freeze stays exportable and is labelled as such, never as the current sheet.
   */
  async loanExport(request: Request, dossierId: string, pid: string, id: string, version: number, expectedHash: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const repository = new ClientsWorkpaperRepository(tx), head = await repository.get(scope, id);
      if (!head || head.template.id !== "loans.review") throw new Error("WORKPAPER_NOT_FOUND");
      const run = head.version === version ? head : (await repository.history(scope, id)).find(r => r.version === version);
      if (!run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
      if (contentHash(run) !== expectedHash) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      const imports = await ClientsImports.load(tx, scope), heads = (await this.heads(tx, scope)).filter(h => this.sourceTypes.includes(h.document_type as LoanType));
      const standing = { headVersion: head.version, latestRevision: await this.latestRevisionId(tx, scope, run.rootId) === run.id,
        sourcesCurrent: run.importIds.every(i => heads.some(h => h.import_id === i)) && (!run.population || heads.every(h => run.importIds.includes(h.import_id))) };
      return loanDiagnostic(run, loanFacts(scope, run.period, imports.batches.filter(b => run.importIds.includes(b.id) && b.approval), run.id), standing);
    });
  }
  async loanCommand(request: Request, dossierId: string, pid: string, command: LoanCommand, key: string) {
    return this.transaction(request, dossierId, pid, ["review", "lock"].includes(command.command) ? "review" : "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "loan_command", ...command }, async () => {
      const repository = new ClientsWorkpaperRepository(tx), imports = await ClientsImports.load(tx, scope), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new LoanRegistry(), async () => actor, () => at, "loans.review");
      if (command.command === "create_loans") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, LOAN_TEMPLATE, command.instanceKey) };
      }
      const current = await repository.get(scope, command.id);
      if (!current || current.template.id !== "loans.review") throw new Error("WORKPAPER_NOT_FOUND");
      if (await this.latestRevisionId(tx, scope, current.rootId) !== current.id) throw new Error("LOAN_REVISION_REPLACED");
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      // A decision cites one approved row of the frozen sources: document, pack, page, clause and local version.
      const cite = (c: { documentVersionId: string; rowId: string }, text: string) => {
        const b = imports.batches.find(x => current.importIds.includes(x.id) && x.approval && x.document.id === c.documentVersionId), r = b?.rows.find(x => x.id === c.rowId);
        if (!b || !r || r.errors.length) throw new Error("LOAN_CITATION_INVALID");
        const s = JSON.parse(r.original.Details ?? "{}").source as { title: string; pack: string; date: string; page: number | null; clause: string } | undefined;
        if (!s) throw new Error("LOAN_CITATION_INVALID");
        return text + "\nDocument : " + s.title + " ; pack " + s.pack + " ; page " + (s.page ?? "non applicable") + " ; clause " + s.clause + " ; date source " + s.date
          + "\nPièce : " + b.document.fileName + " ; version " + b.document.byteHash + " ; ligne " + r.locator.row + " ; date " + r.normalized?.date;
      };
      const id = current.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "freeze_loans": {
          if (current.state !== "draft" || current.population) throw new Error("INPUTS_ALREADY_FROZEN");
          const heads = await this.heads(tx, scope), batches = command.importIds.map(i => imports.get(scope, i, actor));
          const loanHeads = heads.filter(h => this.sourceTypes.includes(h.document_type as LoanType));
          if (batches.some(b => !this.sourceTypes.includes(b.document.documentType as LoanType) || !heads.some(h => h.import_id === b.id)) || new Set(batches.map(b => b.document.documentType)).size !== batches.length
            || loanHeads.some(h => !command.importIds.includes(h.import_id))) throw new Error("LOAN_CURRENT_SOURCES_REQUIRED");
          const facts = loanFacts(scope, current.period, batches, id), work = stampLoanWork(initialLoanDraft(facts), batches, scope, current.period, id, actor.id, at);
          run = await service.configureLoans(scope, id, v, work);
          const population = freezePopulation(scope, batches, "loan_contract_due", actor, current.period);
          const selection = selectPopulation(population, { method: "targeted", criteria: command.criteria, exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          run = await service.transition(scope, id, run.version, "ready");
          break;
        }
        case "execute": {
          if (!current.loanWork) throw new Error("LOAN_WORK_REQUIRED");
          run = await service.execute(scope, id, v, { work: current.loanWork, runId: id });
          if (run.state === "executed") {
            const result = run.result!.result as LoanResult;
            const points = loanReviewPoints(result);
            // One compare-and-swap for all generated points (the store caps a dossier's versions). Each point carries only its own amount;
            // an unknown or not-applicable amount is never shown as zero.
            if (points.length) run = await service.addNotes(scope, id, run.version, points.map(p => ({ id: "loan:" + p.key, kind: "observation" as const, text: p.issue.text,
              amount: p.issue.amount ?? { kind: "unknown" as const, reason: "Point à documenter, sans montant attribué" }, blocking: true })));
          }
          break;
        }
        case "resolve": run = await service.resolveNote(scope, id, v, command.noteId, cite(command.citation, command.text)); break;
        case "conclude": run = await service.conclude(scope, id, v, cite(command.citation, command.text)); break;
        case "review": run = await service.transition(scope, id, v, command.decision, cite(command.citation, command.text), command.submittedHash); break;
        case "submit": run = await service.transition(scope, id, v, "awaiting_review"); break;
        case "lock": run = await service.lock(scope, id, v); break;
        case "revise": run = await service.revise(scope, id, v); break;
      }
      return { run };
    }));
  }
}
