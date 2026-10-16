import type { Money } from "@/lib/canonical-model/money";
import type { CalculationRun } from "@/lib/canonical-model/calculation";
import type { AuthenticatedPrincipal } from "@/lib/auth/principal";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { contentHash, periodId, WORKPAPER_SCHEMA_VERSION, type WorkpaperRun, type WorkpaperState } from "../model";
import type { CycleFamily } from "../closing-contract";
import { CL_DOSSIER, CL_ORG, CL_PERIOD, CL_PERIOD_ID, type ClosingHarness } from "./closing-harness";
import type { CycleSource } from "./closing-memory-database";

/**
 * C14 fixtures shared by the unit recipe and the browser recipe: a minimal file, the solo identity and synthetic cycle heads
 * (TEST DOUBLE of a family store, read-only like the PostgreSQL adapter). Synthetic data only: no real entity, person or document.
 */
export async function small(h: ClosingHarness, session = "preparer") {
  await h.ok({ command: "open", period: CL_PERIOD, entity: "BETA SAS (synthétique)" }, session);
  await h.ok({ command: "set_risk", riskId: "R-01", cycle: "tresorerie", label: "Soldes bancaires", assertions: ["solde_existence"], assessment: { level: "faible", rationale: "Un compte." } }, session);
  await h.ok({ command: "set_procedure", procedureId: "P-01", riskIds: ["R-01"], assertions: ["solde_existence"], nature: "detail", label: "Rapprochement bancaire", owner: "Collaborateur A" }, session);
  const bank = await h.piece("Relevé bancaire au 31/12/2026", "document", undefined, undefined, session);
  await h.ok({ command: "set_population", procedureId: "P-01", population: { status: "defined", description: "Compte B1", size: 1, citations: [] } }, session);
  await h.ok({ command: "record_work", procedureId: "P-01", step: "execution", performedOn: "2027-01-10", object: "Compte B1", done: "Rapprochement du relevé et du grand livre", itemsExamined: 1, result: "sans_exception", citations: [{ pieceVersionId: bank }] }, session);
  return bank;
}
/** Solo local profile: one identity, named personal review (C07). Never a second person. */
export function addSolo(h: ClosingHarness) {
  const base = h.auth.identities["preparer"];
  h.auth.identities["solo"] = { ...base, subject: "proprietaire-local", roles: ["preparer", "reviewer"], authenticationMethod: "local-session", reviewKind: "personal", displayName: "Camille Martin" } as AuthenticatedPrincipal;
}

/* ── Synthetic cycle heads (test double of a family store, read-only like the PostgreSQL adapter) ─────────────────────────── */
const base = { organizationId: CL_ORG, dossierId: CL_DOSSIER, periodId: CL_PERIOD_ID, mode: "real" as const };
export const euro = (amount: string): Money => ({ amount, currency: "EUR" });
export function sheet(o: { id: string; rootId?: string; revision?: number; version?: number; state: WorkpaperState; template?: string; outcome?: CalculationRun["outcome"]; population?: string[]; importIds?: string[];
  preparedBy?: string; approval?: { actorId: string; kind?: "personal"; reviewerName?: string }; period?: AccountingPeriod }): WorkpaperRun {
  const importIds = o.importIds ?? [], period = o.period ?? CL_PERIOD, scope = o.period ? { ...base, periodId: periodId(o.period) } : base;
  const run: WorkpaperRun = { id: o.id, rootId: o.rootId ?? o.id, revision: o.revision ?? 1, version: o.version ?? 4, schemaVersion: WORKPAPER_SCHEMA_VERSION, scope, period,
    template: { id: o.template ?? "cash.reconciliation", version: "1.0.0", objective: "Feuille synthétique", kind: "calculated", assertions: [], requiredDocumentTypes: [] }, state: o.state, preparedBy: o.preparedBy ?? "preparer-cash", importIds,
    evidence: [], findings: [], notes: [], events: [],
    ...(o.population ? { population: { id: o.id + ":population", scope, importIds, unit: "account" as const, items: o.population.map(id => ({ id, rowIds: [id + ":row"], amount: euro("100.00") })), hash: stableSha256(o.population) } } : {}),
    ...(o.outcome ? { result: { id: o.id + ":result", calculationKey: "synthetic", ruleVersion: "1.0.0", inputHash: stableSha256(o.id), scope: { organizationId: CL_ORG, dossierId: CL_DOSSIER, mode: "real" as const }, period,
      execution: "completed" as const, outcome: o.outcome, sourceRefs: [], input: null, result: null, findings: [], warnings: [], blockedControls: [] } } : {}) };
  if (["approved", "locked"].includes(o.state)) run.approval = { actorId: o.approval?.actorId ?? "reviewer-cash", note: "Revue synthétique de la feuille.", at: "2027-02-01T10:00:00.000Z", version: (o.version ?? 4) - 1, snapshotHash: contentHash(run),
    ...(o.approval?.kind ? { kind: o.approval.kind, reviewerName: o.approval.reviewerName } : {}) };
  return run;
}
export function source(family: CycleFamily, runs: WorkpaperRun[], heads: { document_type: string; import_id: string }[] = []): CycleSource & { runs_: WorkpaperRun[]; heads_: typeof heads } {
  const s = { family, runs_: runs, heads_: heads, async runs() { return structuredClone(s.runs_); }, async heads() { return structuredClone(s.heads_); } };
  return s;
}

