import { sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { LEASE_RULE_BASIS } from "@/lib/ifrs/leases/rule";
import { ClientsRuntime } from "./clients-runtime";
import { ClientsImports, ClientsWorkpaperRepository, rows, type ClientsSql } from "./clients-persistence";
import type { ImportBatch, ImportMapping } from "./imports";
import { LEASE_ENGINE_NOT_AVAILABLE, LEASE_TEMPLATE, LeaseRegistry } from "./lease-adapter";
import type { LeaseCommand } from "./lease-commands";
import { assertLeaseBatch, isLeaseType, LEASE_REQUIRED_TYPES, LEASE_TYPES, resolveLeaseCitation, type LeaseType } from "./lease-sources";
import { leaseDraftOf, stampLeaseWork } from "./lease-work";
import { periodId, type NoteCitation, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
import { WorkpaperService } from "./service";

/** Erreur métier de l'atelier, avec les prérequis absents quand l'opération est impossible (C00 § 8 : `{ error, missing? }`). */
export class LeaseError extends Error {
  constructor(code: string, readonly missing?: string[]) { super(code); }
}
/** Refus du lecteur de fichier (format, colonnes, lignes) : donnée invalide, jamais une indisponibilité technique. */
export class LeaseImportError extends Error {}
type Head = { document_type: string; import_id: string };
/** Sources figées toujours têtes de leurs types, et aucune source de ces types ajoutée après le gel (même règle que l'adaptateur de clôture). */
const sourcesCurrentFor = (run: WorkpaperRun, heads: Head[]) => run.importIds.every(i => heads.some(h => h.import_id === i)) && (!run.population || heads.every(h => run.importIds.includes(h.import_id)));
/** Règle courante : gabarit et règle à la version de l'adaptateur ; une autre version se révise, jamais ne se réexécute. */
const ruleCurrentFor = (run: WorkpaperRun) => run.template.version === LEASE_TEMPLATE.version && run.template.rule?.version === LEASE_TEMPLATE.rule!.version;
const citationText = (c: NoteCitation) => "\nPièce : " + c.fileName + " ; version " + c.sha256 + " ; ligne " + (c.row ?? "non applicable");

/**
 * Locations IFRS 16 (socle IFRS C01) sur le store partagé « Clients » : mêmes sessions, CSRF, autorisation du dossier, verrou transactionnel,
 * historique des versions et reçus d'idempotence qu'Emprunts. Sources, population, sélection, travail et règle sont hachés et versionnés ;
 * une source remplacée ou ajoutée, ou une règle remplacée, rend la feuille à réviser. Aucun moteur : l'exécution trace une incapacité explicite.
 */
export class LeaseRuntime extends ClientsRuntime {
  protected override readonly procedureIds = ["ifrs16.leases"];
  protected override readonly sourceTypes = LEASE_TYPES;
  protected override importAdapter(): "ifrs16.leases" { return "ifrs16.leases"; }
  protected override validateSource(batch: ImportBatch, period: AccountingPeriod) { assertLeaseBatch(batch, period); }
  protected override async makePreview(file: File, scope: WorkpaperScope, mapping: ImportMapping, actor: Principal, type: string, period: AccountingPeriod) {
    try { return await super.makePreview(file, scope, mapping, actor, type, period); }
    catch (error) { if (error instanceof ApiError || !(error instanceof Error)) throw error; throw new LeaseImportError(/^[A-Z][A-Z0-9_]*$/.test(error.message) ? error.message : "L16_IMPORT_SCHEMA_INVALID"); }
  }
  private async leaseHeads(tx: ClientsSql, scope: WorkpaperScope) { return (await this.heads(tx, scope)).filter(h => isLeaseType(h.document_type)); }
  protected override async assertCurrent(tx: ClientsSql, scope: WorkpaperScope, run: WorkpaperRun) {
    if (!sourcesCurrentFor(run, await this.leaseHeads(tx, scope))) throw new Error("L16_SOURCE_REPLACED_REVISION_REQUIRED");
    if (!ruleCurrentFor(run)) throw new Error("L16_RULE_REPLACED_REVISION_REQUIRED");
  }
  async previewLease(request: Request, dossierId: string, period: AccountingPeriod, file: File, mapping: ImportMapping, type: LeaseType, key: string) {
    return this.previewSource(request, dossierId, period, file, mapping, type, key);
  }
  /** Dernière révision d'une lignée : une révision antérieure reste lisible, jamais modifiable. */
  private async latestRevisionId(tx: ClientsSql, scope: WorkpaperScope, rootId: string) {
    const [latest] = await rows<{ id: string }>(tx, sql`SELECT h.id FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId} AND v.run->>'rootId'=${rootId} ORDER BY (v.run->>'revision')::int DESC LIMIT 1`);
    return latest?.id ?? null;
  }
  /** Lecture : feuilles, têtes courantes et, par feuille, fraîcheur des sources et de la règle. La capacité dit ce qui n'est pas exécuté. */
  async leaseRead(request: Request, dossierId: string, pid: string, id?: string, history = false, version?: number) {
    const view = await super.read(request, dossierId, pid, id, history, version);
    const extra = await this.transaction(request, dossierId, pid, "read", async (tx, scope) => {
      const heads = await this.leaseHeads(tx, scope), sourcesCurrent: Record<string, boolean> = {}, ruleCurrent: Record<string, boolean> = {};
      for (const run of view.runs) { sourcesCurrent[run.id] = sourcesCurrentFor(run, heads); ruleCurrent[run.id] = ruleCurrentFor(run); }
      return { sourcesCurrent, ruleCurrent };
    });
    const response = { ...view, ...extra, capability: { engine: "not_available", code: LEASE_ENGINE_NOT_AVAILABLE, rule: { id: LEASE_TEMPLATE.rule!.id, version: LEASE_TEMPLATE.version, basisStatus: LEASE_RULE_BASIS.status }, requiredTypes: LEASE_REQUIRED_TYPES } };
    if (Buffer.byteLength(JSON.stringify(response)) > 8 * 1024 * 1024) throw new ApiError("L16_LIMIT_EXCEEDED", "État trop volumineux.", 413);
    return response;
  }
  async leaseCommand(request: Request, dossierId: string, pid: string, command: LeaseCommand, key: string) {
    return this.transaction(request, dossierId, pid, ["review", "lock"].includes(command.command) ? "review" : "prepare", async (tx, scope, actor) => this.receipt(tx, scope, actor, key, { operation: "lease_command", ...command }, async () => {
      const repository = new ClientsWorkpaperRepository(tx), imports = await ClientsImports.load(tx, scope), at = new Date(this.now() * 1000).toISOString();
      const service = new WorkpaperService(repository, imports, new LeaseRegistry(), async () => actor, () => at, "ifrs16.leases");
      if (command.command === "create_leases") {
        if (periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        return { run: await service.create(scope, command.period, LEASE_TEMPLATE, command.instanceKey) };
      }
      const current = await repository.get(scope, command.id);
      if (!current || current.template.id !== "ifrs16.leases") throw new Error("L16_NOT_FOUND");
      if (await this.latestRevisionId(tx, scope, current.rootId) !== current.id) throw new Error("L16_REVISION_REPLACED");
      if (command.command !== "revise") await this.assertCurrent(tx, scope, current);
      const heads = await this.leaseHeads(tx, scope);
      const cite = (ref: { documentVersionId: string; rowId: string }, allowed: readonly string[] = current.importIds) => resolveLeaseCitation(imports.batches, allowed, ref);
      const id = current.id, v = command.expectedVersion;
      let run: WorkpaperRun;
      switch (command.command) {
        case "configure_leases": {
          // Before the freeze, a citation points to a current approved head; after, only to the frozen sources.
          const allowed = current.population ? current.importIds : heads.map(h => h.import_id);
          run = await service.configureLeases(scope, id, v, stampLeaseWork(command.work, ref => cite(ref, allowed), actor.id, at));
          break;
        }
        case "freeze_leases": {
          if (current.state !== "draft" || current.population) throw new Error("INPUTS_ALREADY_FROZEN");
          if (!current.leaseWork) throw new LeaseError("L16_WORK_REQUIRED", ["configure_leases"]);
          const batches = command.importIds.map(i => imports.get(scope, i, actor)), types = batches.map(b => b.document.documentType);
          const missing = LEASE_REQUIRED_TYPES.filter(t => !types.includes(t));
          if (batches.some(b => !isLeaseType(b.document.documentType) || !heads.some(h => h.import_id === b.id)) || new Set(types).size !== types.length
            || heads.some(h => !command.importIds.includes(h.import_id)) || missing.length) throw new LeaseError("L16_CURRENT_SOURCES_REQUIRED", missing);
          batches.forEach(b => assertLeaseBatch(b, current.period));
          // Configure on the frozen sources: every confirmation is cited again on the exact versions frozen.
          run = await service.configureLeases(scope, id, v, stampLeaseWork(leaseDraftOf(current.leaseWork), ref => cite(ref, command.importIds), actor.id, at));
          const population = freezePopulation(scope, batches, "lease_contract", actor, current.period);
          const selection = selectPopulation(population, { method: "targeted", criteria: command.criteria, exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
          run = await service.attachInputs(scope, id, run.version, population, selection);
          run = await service.transition(scope, id, run.version, "ready");
          break;
        }
        case "execute": {
          if (!current.leaseWork) throw new LeaseError("L16_WORK_REQUIRED", ["configure_leases"]);
          run = await service.execute(scope, id, v, { runId: id, work: current.leaseWork });
          break;
        }
        case "resolve": run = await service.resolveNote(scope, id, v, command.noteId, command.text, cite(command.citation)); break;
        case "conclude": run = await service.conclude(scope, id, v, command.text + citationText(cite(command.citation))); break;
        case "submit": run = await service.transition(scope, id, v, "awaiting_review"); break;
        case "review": run = await service.transition(scope, id, v, command.decision, command.text + citationText(cite(command.citation)), command.submittedHash); break;
        case "lock": run = await service.lock(scope, id, v); break;
        // A revision adopts the current template: an earlier rule version is never re-executed (C00, D18).
        case "revise": run = await service.revise(scope, id, v, LEASE_TEMPLATE); break;
      }
      return { run };
    }));
  }
}
