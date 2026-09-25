import { describe, expect, it } from "vitest";
import { assertScope, contentHash, knownAmountSchema, migrateWorkpaperSnapshot, moneySchema, validateRun, type WorkpaperState } from "../model";
import { assertTransition } from "../policy";
import { MemoryWorkpaperRepository } from "../repository";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { fixtureRun, preparer, reviewer, scope } from "./fixtures";
describe("CORE-201 domain", () => {
  it("validates money, unknowns, dates, enums and cross-scope references", () => {
    expect(moneySchema.parse({ amount: "9007199254740993.01", currency: "EUR" }).amount).toBe("9007199254740993.01");
    for (const amount of [1.2, "1.234", "NaN", "1e3"]) expect(moneySchema.safeParse({ amount, currency: "EUR" }).success).toBe(false);
    expect(knownAmountSchema.safeParse({ kind: "unknown", reason: "" }).success).toBe(false);
    expect(() => validateRun(fixtureRun({ period: { ...fixtureRun().period, closingDate: "2024-02-30" } }))).toThrow();
    expect(() => validateRun(fixtureRun({ state: "fake" as never }))).toThrow();
    expect(() => assertScope(scope, { ...scope, periodId: "other" })).toThrow();
    expect(() => assertScope(scope, { ...scope, dossierId: "other" })).toThrow();
  });
  it("supports manual preparation without inventing a Finding", () => {
    const r = fixtureRun(); validateRun(r); assertTransition(r, "ready", preparer);
    expect(r.findings).toEqual([]);
    expect(() => assertTransition({ ...r, template: { ...r.template, kind: "calculated" } }, "ready", preparer)).toThrow("WORKPAPER_INPUTS_REQUIRED");
  });
  it("refuses all unspecified transition pairs", () => {
    const allowed: Record<WorkpaperState, WorkpaperState[]> = { draft: ["ready"], ready: ["executed", "blocked", "failed"], executed: ["awaiting_review"], awaiting_review: ["approved", "changes_requested"], changes_requested: [], approved: ["locked"], locked: ["superseded"], superseded: [], blocked: [], failed: [] };
    for (const from of Object.keys(allowed) as WorkpaperState[]) for (const to of Object.keys(allowed) as WorkpaperState[]) {
      if (!allowed[from].includes(to)) expect(() => assertTransition(fixtureRun({ state: from }), to, reviewer)).toThrow("WORKPAPER_TRANSITION_FORBIDDEN");
    }
  });
  it("rejects stale review and self-approval", () => {
    const r = fixtureRun({ state: "awaiting_review", conclusion: "Documented" });
    r.submittedHash = contentHash(r);
    assertTransition(r, "approved", reviewer, r.submittedHash);
    expect(() => assertTransition(r, "approved", reviewer, "stale")).toThrow("STALE_REVIEW");
    expect(() => assertTransition(r, "approved", { ...reviewer, id: r.preparedBy }, r.submittedHash)).toThrow("SELF_APPROVAL_FORBIDDEN");
  });
  it("migrates additively, idempotently, with original data untouched", () => {
    const old = buildDemoDossierSnapshot(), before = JSON.stringify(old);
    const first = migrateWorkpaperSnapshot(old), again = migrateWorkpaperSnapshot(first);
    expect(again).toEqual(first); expect(first.workpapers?.runs).toEqual([]);
    expect(first.findings).toEqual(old.findings); expect(JSON.stringify(old)).toBe(before);
    expect(first.dossier.id).toBe(old.dossier.id); expect(first.snapshotHash).toBe(old.snapshotHash);
  });
  it("has atomic version checks, history, immutable locked content and no real memory fallback", async () => {
    const repo = new MemoryWorkpaperRepository(); await repo.create(fixtureRun());
    const updates = await Promise.allSettled([1, 2].map(() => repo.compareAndSwap(scope, "WP1", 1, (r) => ({ ...r, version: 2, state: "ready" }))));
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await repo.history(scope, "WP1")).toHaveLength(2);
    const locked = fixtureRun({ id: "locked", state: "locked" });
    locked.approval = { actorId: reviewer.id, snapshotHash: contentHash(locked), note: "synthetic review", at: "2024-08-01T00:00:00Z", version: 1 };
    await repo.create(locked);
    await expect(repo.compareAndSwap(scope, "locked", 1, (r) => ({ ...r, version: 2, conclusion: "changed" }))).rejects.toThrow();
    await expect(repo.create(fixtureRun({ scope: { ...scope, mode: "real" } }))).rejects.toThrow("STORAGE_UNAVAILABLE");
  });
});
