import { contentHash, validateRun, type WorkpaperRun, type WorkpaperState } from "./model";
import { CL_FAMILIES, engineProcedure, type CycleFamily } from "./closing-contract";

/**
 * Read-only observation of the cycle sheets (Missions 05 to 17) for the professional file.
 * The file copies their state, version, review and declared assertions; it never recalculates, approves or unlocks a cycle.
 */
export interface CycleObservation {
  family: CycleFamily; procedure: string; label: string; route: string | null; runId: string; rootId: string; revision: number; version: number; state: WorkpaperState;
  outcome: string | null; objective: string; assertions: { label: string; validation: string }[]; preparedBy: string; approval: { actorId: string; at: string } | null;
  contentHash: string; openBlockingNotes: number; populationSize: number | null; sourceCount: number;
}
export interface CycleFingerprint { procedure: string; runId: string; version: number; state: WorkpaperState; contentHash: string }
export const fingerprint = (o: CycleObservation): CycleFingerprint => ({ procedure: o.procedure, runId: o.runId, version: o.version, state: o.state, contentHash: o.contentHash });

/** Current heads of every cycle family, validated as workpaper runs; superseded revisions are kept out of the observation. */
export function observeRuns(rows: { family: CycleFamily; run: WorkpaperRun }[]): CycleObservation[] {
  return rows.filter(r => (CL_FAMILIES as readonly string[]).includes(r.family)).map(({ family, run }) => {
    validateRun(run);
    const known = engineProcedure(run.template.id);
    return { family, procedure: run.template.id, label: known?.label ?? run.template.objective, route: known?.route ?? null, runId: run.id, rootId: run.rootId, revision: run.revision, version: run.version, state: run.state,
      outcome: run.result?.outcome ?? null, objective: run.template.objective, assertions: run.template.assertions.map(a => ({ label: a.label, validation: a.validation })), preparedBy: run.preparedBy,
      approval: run.approval ? { actorId: run.approval.actorId, at: run.approval.at } : null, contentHash: contentHash(run), openBlockingNotes: run.notes.filter(n => n.blocking && !n.resolution).length,
      populationSize: run.population ? run.population.items.length : null, sourceCount: run.importIds.length };
  }).filter(o => o.state !== "superseded").sort((a, b) => a.procedure < b.procedure ? -1 : a.procedure > b.procedure ? 1 : a.runId < b.runId ? -1 : 1);
}
const RANK: Record<WorkpaperState, number> = { locked: 8, approved: 7, awaiting_review: 6, executed: 5, ready: 4, draft: 3, changes_requested: 2, blocked: 1, failed: 1, superseded: 0 };
/** The most advanced current sheet of a procedure; the others stay listed, never merged. */
export function bestObservation(observations: CycleObservation[], procedure: string) {
  const list = observations.filter(o => o.procedure === procedure).sort((a, b) => RANK[b.state] - RANK[a.state] || b.revision - a.revision || (a.runId < b.runId ? -1 : 1));
  return { best: list[0] ?? null, all: list };
}
