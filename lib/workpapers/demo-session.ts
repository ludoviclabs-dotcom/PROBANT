import { z } from "zod";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { CalculationRegistry } from "./calculations";
import { SyntheticImportRepository, syntheticImport } from "./synthetic-import";
import { MemoryWorkpaperRepository } from "./repository";
import { WorkpaperService } from "./service";
import { freezePopulation, selectPopulation } from "./selection";
import { periodId, type WorkpaperRun, type WorkpaperScope, type RuleReference } from "./model";
import type { Principal } from "./policy";
import { computeDemoCycle, demoParameterSchema, type DemoParameters } from "./demo-cycles";
export const DEMO_PERIOD = { startDate: "2023-07-01", closingDate: "2024-06-30", asOfDate: "2024-07-31", currency: "EUR" as const, validation: "provisional" as const };
/** Volatile isolated teaching session. Role switching is openly simulated, NOT authentication. */
export async function createDemoSession(id: string, params: DemoParameters) {
  demoParameterSchema.parse(params);
  let currentParams = params;
  if (!/^SYN-[A-Za-z0-9-]+$/.test(id)) throw new Error("SYNTHETIC_SESSION_ID_REQUIRED");
  const scope: WorkpaperScope = { organizationId: "SYNTHETIC-DEMO", dossierId: id, periodId: periodId(DEMO_PERIOD), mode: "demo" };
  const preparer: Principal = { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "prepare", "download"] }] };
  const reviewer: Principal = { id: "SYN-REVIEWER", grants: [{ scope, permissions: ["read", "review", "download"] }] };
  let actor = preparer;
  const batch = syntheticImport(scope, params.cycle);
  const imports = new SyntheticImportRepository(batch);
  const population = freezePopulation(scope, [batch], "row", preparer), selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les deux lignes synthétiques ; aucune extrapolation", requestedSize: 2, selectedIds: population.items.map((i) => i.id), exclusions: [] }, preparer);
  const rule: RuleReference = { id: `demo.cycle.${params.cycle}`, version: "1.0.0", authority: "internal", source: "PROBANT v1.1 ; paramètres synthétiques indépendants du guide", effectiveFrom: "2000-01-01", validation: "provisional" };
  const registry = new CalculationRegistry();
  registry.register(rule, z.array(z.unknown()), demoParameterSchema, z.unknown(), (_rows, p) => computeDemoCycle(p, { scope, period: DEMO_PERIOD, purpose: "synthetic_technical" }, batch, population, selection, preparer), () => "inconclusive", (r) => { if (r.scope.mode !== "demo" || r.scope.dossierId !== id) throw new Error("DEMO_SCOPE_REQUIRED"); });
  const repository = new MemoryWorkpaperRepository(), service = new WorkpaperService(repository, imports, registry, async () => actor, () => "2024-08-01T00:00:00Z");
  let run = await service.create(scope, DEMO_PERIOD, { id: rule.id, version: "1.0.0", objective: `Démonstration ${params.cycle}, aucune opinion d’audit`, kind: "calculated", assertions: [{ label: "Mapping pédagogique à confirmer pour la mission", validation: "proposed" }], requiredDocumentTypes: [], rule }, "demo");
  run = await service.attachInputs(scope, run.id, run.version, population, selection);
  run = await service.transition(scope, run.id, run.version, "ready");
  run = await service.execute(scope, run.id, run.version, params);
  if (run.state !== "executed") throw new Error("DEMO_EXECUTION_FAILED");
  run = await service.addEvidence(scope, run.id, run.version, batch.id, batch.rows[0].id, "Fixture synthétique et paramètres reproductibles ; aucune PBC réelle");
  return { scope, service, repository, imports, params, initial: run,
    async submit(current: WorkpaperRun, note: string) { actor = preparer; let r = await service.conclude(scope, current.id, current.version, note); r = await service.transition(scope, r.id, r.version, "awaiting_review"); return r; },
    async approve(current: WorkpaperRun, note: string) { actor = reviewer; return service.transition(scope, current.id, current.version, "approved", note, current.submittedHash); },
    async requestChanges(current: WorkpaperRun, note: string) { actor = reviewer; return service.transition(scope, current.id, current.version, "changes_requested", note, current.submittedHash); },
    async revise(current: WorkpaperRun, note: string) {
      if (current.state !== "changes_requested") throw new Error("DEMO_CORRECTION_NOT_REQUESTED");
      actor = preparer;
      let next = await service.revise(scope, current.id, current.version);
      for (const item of next.notes.filter((n) => n.blocking && !n.resolution)) next = await service.resolveNote(scope, next.id, next.version, item.id, note);
      next = await service.transition(scope, next.id, next.version, "ready");
      return service.execute(scope, next.id, next.version, currentParams);
    },
    async editLocked(current: WorkpaperRun, nextParameters: DemoParameters) {
      if (current.state !== "locked" || nextParameters.cycle !== params.cycle) throw new Error("LOCKED_REVISION_REQUIRED");
      currentParams = demoParameterSchema.parse(nextParameters);
      actor = preparer;
      let next = await service.revise(scope, current.id, current.version);
      next = await service.transition(scope, next.id, next.version, "ready");
      return service.execute(scope, next.id, next.version, currentParams);
    },
    async lock(current: WorkpaperRun, baseline: DossierSnapshot) { actor = reviewer; return service.lockAndProject(scope, current.id, current.version, baseline); },
    reviewer, preparer,
  };
}
