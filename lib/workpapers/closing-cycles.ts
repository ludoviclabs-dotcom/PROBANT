import { contentHash, validateRun, type WorkpaperRun, type WorkpaperState } from "./model";
import { CL_FAMILIES, engineProcedure, type CycleFamily } from "./closing-contract";
import type { ReviewKind } from "@/lib/auth/review-kind";

/**
 * Read-only observation of the cycle sheets (Missions 05 to 17, payroll C12) for the professional file.
 * The file copies their state, version, review and declared assertions; it never recalculates, approves or unlocks a cycle.
 */
export interface CycleObservation {
  family: CycleFamily; procedure: string; label: string; route: string | null; runId: string; rootId: string; revision: number; version: number; state: WorkpaperState;
  /** Execution and outcome of the sheet's own result: a locked sheet may keep an inconclusive result, shown as such. */
  execution: string | null; outcome: string | null; objective: string; assertions: { label: string; validation: string }[]; preparedBy: string; approval: { actorId: string; at: string; kind?: ReviewKind; reviewerName?: string } | null;
  contentHash: string; openBlockingNotes: number; populationSize: number | null; populationHash: string | null; sourceCount: number;
  /** Exercise or declarative period of the sheet (a VAT sheet covers its own period inside the exercise). */
  period: { startDate: string; closingDate: string; asOfDate: string };
  /** Frozen sources still the current heads of their family (family adapter); null when the heads were not read. */
  sourcesCurrent: boolean | null;
}
export interface CycleFingerprint { procedure: string; runId: string; version: number; state: WorkpaperState; contentHash: string; sourcesCurrent?: boolean | null }
export const fingerprint = (o: CycleObservation): CycleFingerprint => ({ procedure: o.procedure, runId: o.runId, version: o.version, state: o.state, contentHash: o.contentHash, ...(o.sourcesCurrent !== null ? { sourcesCurrent: o.sourcesCurrent } : {}) });
/**
 * A recorded fingerprint no longer matches the current observation (version, state, content, or a source replaced since).
 * A fingerprint recorded before C14 carries no freshness: a source now replaced counts as a change rather than being presumed already known.
 */
export const fingerprintChanged = (f: CycleFingerprint, now: CycleObservation | undefined) =>
  !now || now.version !== f.version || now.state !== f.state || now.contentHash !== f.contentHash
  || (typeof f.sourcesCurrent === "boolean" && typeof now.sourcesCurrent === "boolean" && now.sourcesCurrent !== f.sourcesCurrent)
  || (typeof f.sourcesCurrent !== "boolean" && now.sourcesCurrent === false);

/** Current heads of every cycle family, validated as workpaper runs; superseded revisions are kept out of the observation. */
export function observeRuns(rows: { family: CycleFamily; run: WorkpaperRun }[], sourcesCurrent: (row: { family: CycleFamily; run: WorkpaperRun }) => boolean | null = () => null): CycleObservation[] {
  return rows.filter(r => (CL_FAMILIES as readonly string[]).includes(r.family)).map(row => {
    const { family, run } = row;
    validateRun(run);
    const known = engineProcedure(run.template.id);
    return { family, procedure: run.template.id, label: known?.label ?? run.template.objective, route: known?.route ?? null, runId: run.id, rootId: run.rootId, revision: run.revision, version: run.version, state: run.state,
      execution: run.result?.execution ?? null, outcome: run.result?.outcome ?? null, objective: run.template.objective, assertions: run.template.assertions.map(a => ({ label: a.label, validation: a.validation })), preparedBy: run.preparedBy,
      approval: run.approval ? { actorId: run.approval.actorId, at: run.approval.at, ...(run.approval.kind ? { kind: run.approval.kind, ...(run.approval.reviewerName ? { reviewerName: run.approval.reviewerName } : {}) } : {}) } : null, contentHash: contentHash(run), openBlockingNotes: run.notes.filter(n => n.blocking && !n.resolution).length,
      populationSize: run.population ? run.population.items.length : null, populationHash: run.population?.hash ?? null, sourceCount: run.importIds.length,
      period: { startDate: run.period.startDate, closingDate: run.period.closingDate, asOfDate: run.period.asOfDate }, sourcesCurrent: sourcesCurrent(row) };
  }).filter(o => o.state !== "superseded").sort((a, b) => a.procedure < b.procedure ? -1 : a.procedure > b.procedure ? 1 : a.runId < b.runId ? -1 : 1);
}

/**
 * One lineage per root (population / perimeter of a sheet): its current sheet is the latest revision, then the latest version.
 * Earlier revisions stay listed but never count: a locked revision 1 does not cover the population of a revision 2 (C14).
 */
export interface SheetLineage { procedure: string; rootId: string; current: CycleObservation; previous: CycleObservation[] }
export function sheetLineages(observations: CycleObservation[], procedure?: string): SheetLineage[] {
  const byRoot = new Map<string, CycleObservation[]>();
  for (const o of observations) if (engineProcedure(o.procedure) && (!procedure || o.procedure === procedure)) byRoot.set(o.procedure + "|" + o.rootId, [...(byRoot.get(o.procedure + "|" + o.rootId) ?? []), o]);
  return [...byRoot.values()].map(list => {
    const sorted = [...list].sort((a, b) => b.revision - a.revision || b.version - a.version || (a.runId < b.runId ? -1 : 1));
    return { procedure: sorted[0].procedure, rootId: sorted[0].rootId, current: sorted[0], previous: sorted.slice(1) };
  }).sort((a, b) => a.procedure < b.procedure ? -1 : a.procedure > b.procedure ? 1 : a.rootId < b.rootId ? -1 : 1);
}
