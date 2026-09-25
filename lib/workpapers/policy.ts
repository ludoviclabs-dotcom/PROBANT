import { assertScope, contentHash, type WorkpaperRun, type WorkpaperScope, type WorkpaperState } from "./model";
export type Permission = "read" | "prepare" | "review" | "download";
/** Supplied only by a trusted server session adapter, never request JSON. */
export interface Principal { id: string; grants: { scope: WorkpaperScope; permissions: Permission[] }[] }
export function authorize(principal: Principal | null, scope: WorkpaperScope, permission: Permission) {
  if (!principal?.id || !principal.grants.some((g) => {
    try { assertScope(scope, g.scope); return g.permissions.includes(permission); } catch { return false; }
  })) throw new Error("WORKPAPER_FORBIDDEN");
}
const transitions: Record<WorkpaperState, WorkpaperState[]> = {
  draft: ["ready"], ready: ["executed", "blocked", "failed"], executed: ["awaiting_review"],
  awaiting_review: ["approved", "changes_requested"], changes_requested: [],
  approved: ["locked"], locked: ["superseded"], superseded: [], blocked: [], failed: [],
};
export function assertTransition(run: WorkpaperRun, target: WorkpaperState, principal: Principal, expectedHash?: string) {
  if (!transitions[run.state]?.includes(target)) throw new Error("WORKPAPER_TRANSITION_FORBIDDEN");
  const review = ["approved", "changes_requested", "locked"].includes(target);
  authorize(principal, run.scope, review ? "review" : "prepare");
  if (review && principal.id === run.preparedBy) throw new Error("SELF_APPROVAL_FORBIDDEN");
  if (target === "ready" && run.template.kind === "calculated" && (!run.importIds.length || !run.population || !run.selection)) throw new Error("WORKPAPER_INPUTS_REQUIRED");
  if (target === "executed" && run.result?.execution !== "completed") throw new Error("COMPLETED_RESULT_REQUIRED");
  if (target === "blocked" && run.result?.execution !== "blocked") throw new Error("BLOCKED_RESULT_REQUIRED");
  if (target === "failed" && run.result?.execution !== "failed") throw new Error("FAILED_RESULT_REQUIRED");
  if (target === "awaiting_review" && (!run.conclusion?.trim() || !run.evidence.some((e) => e.status === "verified") || !run.result)) throw new Error("PREPARATION_INCOMPLETE");
  if (target === "approved" && (expectedHash !== run.submittedHash || contentHash(run) !== run.submittedHash)) throw new Error("STALE_REVIEW");
  if (target === "approved" && run.notes.some((n) => n.blocking && !n.resolution)) throw new Error("UNRESOLVED_BLOCKING_NOTE");
  if (target === "locked" && (!run.approval || run.approval.snapshotHash !== contentHash(run))) throw new Error("STALE_APPROVAL");
}
