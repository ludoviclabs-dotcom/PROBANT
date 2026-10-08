import { previewImport } from "../imports";
import { CLIENT_FRAME_RULE, CLIENT_FRAME_TEMPLATE, ClientsFramingRegistry } from "../clients-adapter";
import { freezePopulation, selectPopulation } from "../selection";
import { contentHash, periodId, type WorkpaperRun } from "../model";
import type { Principal } from "../policy";
import { mapping, period, csv } from "./clients-framing-fixtures";
export async function clientMissionFixture() {
  const scope = { organizationId: "real-organization", dossierId: "11111111-1111-4111-8111-111111111111", periodId: periodId(period), mode: "real" as const };
  const actor: Principal = { id: "actual-preparer", grants: [{ scope, permissions: ["read", "prepare"] }] };
  const imports = await Promise.all(["clients_general", "clients_auxiliary", "clients_aged"].map(async type => {
    const b = await previewImport(new File([csv(type)], type + ".csv", { type: "text/csv" }), scope, mapping, actor, type, "clients.frame");
    return { ...b, approval: { actorId: actor.id, at: "2025-02-01T00:00:00Z", previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } };
  }));
  const population = freezePopulation(scope, imports, "row", actor), selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les lignes", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const result = new ClientsFramingRegistry().execute({ scope, period, rule: CLIENT_FRAME_RULE, imports, population, selection, parameters: {} });
  const run: WorkpaperRun = { id: "real-pilot", rootId: "real-pilot", revision: 1, version: 10, schemaVersion: "1.0.0", scope, period, template: CLIENT_FRAME_TEMPLATE, state: "awaiting_review", preparedBy: actor.id, importIds: imports.map(i => i.id), population, selection, result, evidence: [], findings: [],
    conclusion: "Résidus A +10 EUR et B -10 EUR examinés séparément.", notes: [{ id: "exception-treatment", kind: "observation", text: "Résidus à expliquer", amount: { kind: "unknown", reason: "Résidus séparés" }, authorId: actor.id, blocking: true, resolution: { text: "Traitement documenté, résidus conservés.", authorId: actor.id, at: "2025-02-01T00:00:00Z" } }],
    events: [{ id: "real-pilot:10", action: "awaiting_review", actorId: actor.id, at: "2025-02-01T00:00:00Z", version: 10 }] };
  run.submittedHash = contentHash(run);
  const approved: WorkpaperRun = { ...run, state: "approved", version: 11, approval: { actorId: "actual-reviewer", at: "2025-02-02T00:00:00Z", version: 10, note: "Cadrage revu, exceptions maintenues.", snapshotHash: contentHash(run) }, events: [...run.events, { id: "real-pilot:11", action: "approved", actorId: "actual-reviewer", at: "2025-02-02T00:00:00Z", version: 11 }] };
  const locked: WorkpaperRun = { ...approved, state: "locked", version: 12, events: [...approved.events, { id: "real-pilot:12", action: "lock", actorId: "actual-reviewer", at: "2025-02-02T00:00:00Z", version: 12 }] };
  const heads = imports.map(i => ({ document_type: i.document.documentType, import_id: i.id }));
  return { scope, run, approved, locked, imports, heads };
}
