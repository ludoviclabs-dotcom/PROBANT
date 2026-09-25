import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, contentHash, frozen, periodId, validateRun, type WorkpaperRun, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export interface WorkpaperProjection {
  version: "1.0.0"; scope: WorkpaperScope;
  sourceRevisions: { rootId: string; id: string; revision: number; version: number; contentHash: string }[];
  lockedRuns: WorkpaperRun[]; hash: string;
}
/** Pure, reconstructible projection. Legacy findings/metrics remain explicitly separate. */
export function projectLockedWorkpaper(snapshot: DossierSnapshot, run: WorkpaperRun, actor: Principal): DossierSnapshot {
  authorize(actor, run.scope, "read"); authorize(actor, run.scope, "review"); validateRun(run);
  if (!snapshot.dossier.period) throw new Error("PROJECTION_PERIOD_REQUIRED");
  assertScope(run.scope, { organizationId: snapshot.dossier.organizationId ?? "", dossierId: snapshot.dossier.id,
    periodId: periodId(snapshot.dossier.period), mode: snapshot.dossier.demoMode ? "demo" : "real" });
  if (stableSha256(snapshot.dossier.period) !== stableSha256(run.period)) throw new Error("PROJECTION_PERIOD_CHANGED");
  if (run.state !== "locked" || !run.approval || run.approval.snapshotHash !== contentHash(run) || !run.result || run.result.execution !== "completed") throw new Error("PROJECTION_REQUIRES_LOCKED_RESULT");
  const previous = snapshot.workpaperProjection;
  if (previous) {
    assertScope(run.scope, previous.scope);
    const { hash, ...body } = previous;
    if (hash !== stableSha256(body)) throw new Error("PROJECTION_CORRUPTED");
  }
  const old = previous?.lockedRuns.find((r) => r.rootId === run.rootId);
  if (old) {
    if (run.revision < old.revision || (run.revision === old.revision && stableSha256(run) !== stableSha256(old))) throw new Error("PROJECTION_STALE_REVISION");
    if (stableSha256(run) === stableSha256(old)) return frozen(snapshot);
    if (run.previousLockedId !== old.id) throw new Error("PROJECTION_REVISION_GAP");
  }
  const lockedRuns = [...(previous?.lockedRuns ?? []).filter((r) => r.rootId !== run.rootId), run].sort((a, b) => a.rootId < b.rootId ? -1 : 1);
  const body = { version: "1.0.0" as const, scope: run.scope, sourceRevisions: lockedRuns.map((r) => ({ rootId: r.rootId, id: r.id, revision: r.revision, version: r.version, contentHash: contentHash(r) })), lockedRuns };
  const projection = { ...body, hash: stableSha256(body) };
  // Do not silently turn an old mission into a workpaper or merge unlike progress measures.
  const result = { ...snapshot, workpaperProjection: projection };
  const { snapshotHash: _oldHash, ...hashable } = result;
  void _oldHash;
  return frozen({ ...result, snapshotHash: stableSha256(hashable) });
}
