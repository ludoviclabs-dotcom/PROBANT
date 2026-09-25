import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { frozen, contentHash, validateRun } from "./model";
import type { WorkpaperProjection } from "./projection";
import { demoCycleSchema, type DemoCycle } from "./demo-cycles";
export interface DemoFlags { enabled: boolean; disabledCycles: DemoCycle[] }
export function parseDemoFlags(enabled: string | undefined, disabled: string | undefined): DemoFlags {
  const cycles = disabled ? disabled.split(",").map((s) => demoCycleSchema.parse(s.trim())) : [];
  return { enabled: enabled === "true", disabledCycles: cycles };
}
export const technicalEventSchema = z.object({ event: z.enum(["import", "calculation", "export", "rejected"]), cycle: demoCycleSchema, durationMs: z.number().nonnegative().finite(), rows: z.number().int().min(0).max(50000), status: z.enum(["completed", "failed", "blocked"]) }).strict();
/** Local bounded telemetry only; unknown fields (salary, IBAN, source, note, identity) rejected. */
export class DemoTelemetry {
  private events: z.infer<typeof technicalEventSchema>[] = [];
  record(event: unknown) { this.events.push(technicalEventSchema.parse(event)); if (this.events.length > 100) this.events.shift(); }
  snapshot() { return frozen(this.events); }
}
export function restoreProjection(candidate: WorkpaperProjection, current: WorkpaperProjection): WorkpaperProjection {
  for (const p of [candidate, current]) {
    const { hash, ...body } = p; if (hash !== stableSha256(body)) throw new Error("RESTORE_HASH_INVALID");
    p.lockedRuns.forEach((r) => { validateRun(r); if (r.state !== "locked" || r.approval?.snapshotHash !== contentHash(r)) throw new Error("RESTORE_RUN_INVALID"); });
  }
  if (stableSha256(candidate.scope) !== stableSha256(current.scope) || current.sourceRevisions.some((r) => !candidate.sourceRevisions.some((c) => c.rootId === r.rootId && c.revision === r.revision && c.contentHash === r.contentHash))) throw new Error("RESTORE_STALE_OR_WRONG_SCOPE");
  return frozen(candidate);
}
export interface RetentionPolicy { id: string; version: string; source: string; approvedBy: string; scope: "synthetic_demo" | "real"; retentionDays: number | null }
/** Planning port only: no purge, database deletion or legal duration invented. */
export function retentionPlan(policy: RetentionPolicy | null) {
  if (!policy || !policy.id || !policy.version || !policy.source || !policy.approvedBy || policy.retentionDays === null || !Number.isSafeInteger(policy.retentionDays) || policy.retentionDays < 0) return { status: "SOURCE REQUISE", deletionEnabled: false, reason: "Politique de conservation approuvée absente" };
  return { status: "plan_only", deletionEnabled: false, policy, reason: "Exécution de purge exige un mandat distinct ; aucune conservation illimitée justifiée par hash" };
}
