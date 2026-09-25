import { assertScope, contentHash, frozen, validateRun, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
export interface WorkpaperRepository {
  get(scope: WorkpaperScope, id: string): Promise<WorkpaperRun | null>;
  create(run: WorkpaperRun): Promise<WorkpaperRun>;
  compareAndSwap(scope: WorkpaperScope, id: string, version: number, update: (current: WorkpaperRun) => WorkpaperRun): Promise<WorkpaperRun>;
  history(scope: WorkpaperScope, id: string): Promise<WorkpaperRun[]>;
  revise(scope: WorkpaperScope, id: string, version: number, create: (current: WorkpaperRun) => WorkpaperRun): Promise<WorkpaperRun>;
  lockAndProject(scope: WorkpaperScope, id: string, version: number, baseline: DossierSnapshot,
    lock: (run: WorkpaperRun) => WorkpaperRun, project: (snapshot: DossierSnapshot, run: WorkpaperRun) => DossierSnapshot): Promise<DossierSnapshot>;
  projection(scope: WorkpaperScope): Promise<DossierSnapshot | null>;
}
/** Isolated synthetic adapter. Real use requires durable transactions and auth. */
export class MemoryWorkpaperRepository implements WorkpaperRepository {
  private readonly records = new Map<string, WorkpaperRun[]>();
  private readonly projections = new Map<string, DossierSnapshot>();
  private key(scope: WorkpaperScope, id: string) {
    if (scope.mode !== "demo") throw new Error("DURABLE_WORKPAPER_STORAGE_UNAVAILABLE");
    return JSON.stringify([scope.organizationId, scope.dossierId, scope.periodId, id]);
  }
  async get(scope: WorkpaperScope, id: string) { const value = this.records.get(this.key(scope, id))?.at(-1); return value ? frozen(value) : null; }
  async create(run: WorkpaperRun) {
    validateRun(run); const key = this.key(run.scope, run.id);
    if (this.records.has(key)) throw new Error("WORKPAPER_ALREADY_EXISTS");
    this.records.set(key, [frozen(run)]); return frozen(run);
  }
  async compareAndSwap(scope: WorkpaperScope, id: string, version: number, update: (current: WorkpaperRun) => WorkpaperRun) {
    // Synchronous compare+commit: single-process atomicity, never a distributed lock.
    const key = this.key(scope, id), history = this.records.get(key), current = history?.at(-1);
    if (!current) throw new Error("WORKPAPER_NOT_FOUND");
    if (current.version !== version) throw new Error("STALE_WORKPAPER_VERSION");
    const next = validateRun(update(frozen(current)));
    if (["approved", "locked", "superseded"].includes(current.state) && (contentHash(next) !== contentHash(current) || (current.state === "approved" ? next.state !== "locked" : current.state === "locked" ? next.state !== "superseded" : true))) throw new Error("LOCKED_WORKPAPER_IMMUTABLE");
    assertScope(scope, next.scope);
    if (next.id !== id || next.version !== version + 1) throw new Error("WORKPAPER_VERSION_INVALID");
    history!.push(frozen(next)); return frozen(next);
  }
  async history(scope: WorkpaperScope, id: string) { return frozen(this.records.get(this.key(scope, id)) ?? []); }
  async revise(scope: WorkpaperScope, id: string, version: number, create: (current: WorkpaperRun) => WorkpaperRun) {
    const current = this.records.get(this.key(scope, id))?.at(-1);
    if (!current || current.version !== version) throw new Error("STALE_WORKPAPER_VERSION");
    if (!["changes_requested", "blocked", "failed", "locked"].includes(current.state)) throw new Error("REVISION_NOT_ALLOWED");
    const next = validateRun(create(frozen(current)));
    assertScope(scope, next.scope);
    if (next.rootId !== current.rootId || next.revision !== current.revision + 1 || next.supersedes !== current.id || next.state !== "draft" || next.version !== 1 || next.approval || next.result || next.submittedHash) throw new Error("REVISION_INVALID");
    const key = this.key(scope, next.id);
    if (this.records.has(key)) throw new Error("REVISION_ALREADY_EXISTS");
    this.records.set(key, [frozen(next)]); return frozen(next);
  }
  async projection(scope: WorkpaperScope) { return this.projections.get(this.key(scope, "projection")) ?? null; }
  async lockAndProject(scope: WorkpaperScope, id: string, version: number, baseline: DossierSnapshot,
    lock: (run: WorkpaperRun) => WorkpaperRun, project: (snapshot: DossierSnapshot, run: WorkpaperRun) => DossierSnapshot) {
    const key = this.key(scope, id), history = this.records.get(key), current = history?.at(-1), projectionKey = this.key(scope, "projection");
    if (!current) throw new Error("WORKPAPER_NOT_FOUND");
    const existing = this.projections.get(projectionKey);
    if (current.state === "locked" && current.version === version + 1 && existing?.workpaperProjection?.sourceRevisions.some((r) => r.id === id && r.version === current.version)) return frozen(existing);
    if (current.state !== "approved" || current.version !== version) throw new Error("STALE_WORKPAPER_VERSION");
    const next = validateRun(lock(frozen(current))); assertScope(scope, next.scope);
    if (next.id !== id || next.version !== version + 1 || next.state !== "locked" || contentHash(next) !== contentHash(current)) throw new Error("LOCK_INVALID");
    // All computation (including possible projection failure) precedes the synchronous commit.
    const projected = frozen(project(frozen(existing ?? baseline), frozen(next)));
    if (!projected.workpaperProjection?.sourceRevisions.some((r) => r.id === id && r.version === next.version)) throw new Error("PROJECTION_VERSION_MISSING");
    const previousHistory = next.previousLockedId ? this.records.get(this.key(scope, next.previousLockedId)) : undefined;
    const previous = previousHistory?.at(-1);
    const superseded = previous?.state === "locked" ? validateRun({ ...previous, state: "superseded", version: previous.version + 1,
      events: [...previous.events, { ...next.events.at(-1)!, id: `${previous.id}:${previous.version + 1}`, version: previous.version + 1, action: "superseded" }] }) : null;
    history!.push(frozen(next)); if (superseded) previousHistory!.push(frozen(superseded));
    this.projections.set(projectionKey, projected); return frozen(projected);
  }
}
