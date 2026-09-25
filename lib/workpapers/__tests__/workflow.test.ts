import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { MemoryWorkpaperRepository } from "../repository";
import { WorkpaperService } from "../service";
import { syntheticRegistry, SYNTHETIC_SUM_RULE } from "../calculations";
import { projectLockedWorkpaper } from "../projection";
import type { Principal } from "../policy";
import { contentHash, type WorkpaperRun } from "../model";
import { importedFixture, populationFixture } from "./import-fixtures";
import { fixtureRun, scope, preparer, reviewer, period } from "./fixtures";
function baseline() {
  const snapshot = buildDemoDossierSnapshot();
  return { ...snapshot, dossier: { ...snapshot.dossier, id: scope.dossierId, organizationId: scope.organizationId, period, demoMode: true } };
}
async function fixture() {
  const { batch, repo: imports } = await importedFixture(), repository = new MemoryWorkpaperRepository();
  let actor: Principal | null = preparer;
  const service = new WorkpaperService(repository, imports, syntheticRegistry(), async () => actor, () => "2024-08-01T00:00:00Z");
  let run = await service.create(scope, period, { ...fixtureRun().template, kind: "calculated", rule: SYNTHETIC_SUM_RULE }, "synthetic-case");
  const { population, selection } = populationFixture(batch);
  run = await service.attachInputs(scope, run.id, run.version, population, selection);
  run = await service.transition(scope, run.id, run.version, "ready");
  run = await service.execute(scope, run.id, run.version, {});
  run = await service.addEvidence(scope, run.id, run.version, batch.id, batch.rows[0].id, "Synthetic source", "B2");
  run = await service.conclude(scope, run.id, run.version, "Somme synthétique exacte, aucune opinion d’audit.");
  return { service, repository, run, batch, setActor: (next: Principal | null) => { actor = next; } };
}
async function submitAndApprove(f: Awaited<ReturnType<typeof fixture>>, run = f.run) {
  run = await f.service.transition(scope, run.id, run.version, "awaiting_review");
  f.setActor(reviewer);
  return f.service.transition(scope, run.id, run.version, "approved", "Travail revu, pas une opinion sur les comptes", run.submittedHash);
}
describe("CORE-205/206 isolated workflow integration", () => {
  it("import → calculation → evidence → human review → atomic projection without a Finding", async () => {
    const f = await fixture(), approved = await submitAndApprove(f), before = baseline();
    const projected = await f.service.lockAndProject(scope, approved.id, approved.version, before);
    expect(projected.workpaperProjection?.lockedRuns[0].result?.result).toEqual({ amount: "0.30", currency: "EUR" });
    expect(projected.workpaperProjection?.lockedRuns[0].findings).toEqual([]);
    expect(projected.findings).toEqual(before.findings); expect(projected.calculationContext).toEqual(before.calculationContext);
    expect(projected.workpaperProjection?.sourceRevisions[0].id).toBe(approved.id);
    expect(await f.service.lockAndProject(scope, approved.id, approved.version, before)).toEqual(projected);
    expect(buildSynthesisSnapshot(projected, { clock: () => "2024-08-01T00:00:00Z" }).workpaperProjection?.hash).toBe(projected.workpaperProjection?.hash);
    f.setActor(preparer);
    await expect(f.service.conclude(scope, approved.id, approved.version + 1, "changed")).rejects.toThrow();
    expect((await f.service.history(scope, approved.id)).length).toBeGreaterThan(6);
  });
  it("rejects missing identity, direct cross-scope reads/actions/download/projection and auto-review", async () => {
    const f = await fixture(), other = { ...scope, dossierId: "other" };
    f.setActor(null); await expect(f.service.get(scope, f.run.id)).rejects.toThrow("FORBIDDEN");
    f.setActor(preparer);
    await expect(f.service.get(other, f.run.id)).rejects.toThrow("FORBIDDEN");
    await expect(f.service.download(other, f.batch.document.id)).rejects.toThrow("FORBIDDEN");
    await expect(f.service.conclude(other, f.run.id, f.run.version, "x")).rejects.toThrow("FORBIDDEN");
    await expect(f.service.projection(other)).rejects.toThrow("FORBIDDEN");
    const submitted = await f.service.transition(scope, f.run.id, f.run.version, "awaiting_review");
    await expect(f.service.transition(scope, submitted.id, submitted.version, "approved", "x", submitted.submittedHash)).rejects.toThrow("FORBIDDEN");
    f.setActor({ ...reviewer, id: preparer.id });
    await expect(f.service.transition(scope, submitted.id, submitted.version, "approved", "x", submitted.submittedHash)).rejects.toThrow("SELF_APPROVAL");
    f.setActor(reviewer);
    await expect(f.service.transition(scope, submitted.id, submitted.version, "approved", "x", "old-hash")).rejects.toThrow("STALE_REVIEW");
    await expect(f.service.transition(scope, submitted.id, submitted.version - 1, "approved", "x", submitted.submittedHash)).rejects.toThrow("STALE_WORKPAPER_VERSION");
  });
  it("return for correction retains blocking-note history in a new revision", async () => {
    const f = await fixture();
    let run = await f.service.transition(scope, f.run.id, f.run.version, "awaiting_review"); f.setActor(reviewer);
    run = await f.service.transition(scope, run.id, run.version, "changes_requested", "Expliquer la limite", run.submittedHash);
    f.setActor(preparer); let next = await f.service.revise(scope, run.id, run.version);
    expect(next.result).toBeUndefined(); expect(next.notes[0].blocking).toBe(true);
    next = await f.service.resolveNote(scope, next.id, next.version, next.notes[0].id, "Limite documentée");
    expect(next.notes[0].text).toBe("Expliquer la limite"); expect(next.notes[0].resolution?.text).toBe("Limite documentée");
    expect((await f.service.get(scope, run.id))?.notes[0].resolution).toBeUndefined();
    await expect(f.service.revise(scope, run.id, run.version)).rejects.toThrow("REVISION_ALREADY_EXISTS");
  });
  it("an uncorrected documented anomaly does not prohibit approving the work", async () => {
    const f = await fixture();
    const run = await f.service.addNote(scope, f.run.id, f.run.version, { id: "anomaly", kind: "validated_anomaly", text: "Anomalie synthétique non corrigée", amount: { kind: "unknown", reason: "Non chiffrée" }, blocking: false });
    const approved = await submitAndApprove(f, run);
    expect(approved.state).toBe("approved"); expect(approved.notes[0].kind).toBe("validated_anomaly");
  });
  it("refuses unresolved blocking notes and a source changed after submission", async () => {
    const f = await fixture();
    let run = await f.service.addNote(scope, f.run.id, f.run.version, { id: "missing", kind: "missing_evidence", text: "Justification attendue", amount: { kind: "unknown", reason: "Pièce absente" }, blocking: true });
    run = await f.service.transition(scope, run.id, run.version, "awaiting_review"); f.setActor(reviewer);
    await expect(f.service.transition(scope, run.id, run.version, "approved", "x", run.submittedHash)).rejects.toThrow("UNRESOLVED_BLOCKING_NOTE");
    const changed = await f.repository.compareAndSwap(scope, run.id, run.version, (r) => ({ ...r, version: r.version + 1, importIds: [...r.importIds, "source-changed"] }));
    await expect(f.service.transition(scope, changed.id, changed.version, "approved", "x", run.submittedHash)).rejects.toThrow("STALE_REVIEW");
  });
  it("projection failure preserves the approved version; next locked revision supersedes atomically", async () => {
    const f = await fixture(), approved = await submitAndApprove(f);
    await expect(f.service.lockAndProject(scope, approved.id, approved.version, { ...baseline(), dossier: { ...baseline().dossier, id: "other" } })).rejects.toThrow();
    expect(await f.service.get(scope, approved.id)).toEqual(approved);
    const first = await f.service.lockAndProject(scope, approved.id, approved.version, baseline());
    const oldLocked = first.workpaperProjection!.lockedRuns[0]; f.setActor(preparer);
    let next = await f.service.revise(scope, oldLocked.id, oldLocked.version);
    next = await f.service.transition(scope, next.id, next.version, "ready");
    next = await f.service.execute(scope, next.id, next.version, { invalid: true });
    expect(next.state).toBe("failed");
    next = await f.service.revise(scope, next.id, next.version);
    next = await f.service.transition(scope, next.id, next.version, "ready");
    next = await f.service.execute(scope, next.id, next.version, {});
    next = await f.service.conclude(scope, next.id, next.version, "Révision documentée");
    const nextApproved = await submitAndApprove(f, next);
    const second = await f.service.lockAndProject(scope, next.id, nextApproved.version, baseline());
    expect(second.workpaperProjection?.lockedRuns).toHaveLength(1);
    expect(second.workpaperProjection?.sourceRevisions[0].revision).toBe(3);
    expect((await f.service.get(scope, oldLocked.id))?.state).toBe("superseded");
    expect(() => projectLockedWorkpaper(second, oldLocked, reviewer)).toThrow("STALE_REVISION");
    expect(contentHash((await f.service.history(scope, oldLocked.id)).at(-1)!)).toBe(contentHash(oldLocked));
  });
  it("records failure/blocked states and supports separately entered manual observations", async () => {
    const f = await fixture();
    let manual = await f.service.create(scope, period, fixtureRun().template, "manual");
    manual = await f.service.transition(scope, manual.id, manual.version, "ready");
    manual = await f.service.recordManual(scope, manual.id, manual.version, "Pièce non suffisante", "inconclusive");
    expect(manual.result?.outcome).toBe("inconclusive");
    for (const kind of ["failed", "blocked"] as const) {
      const run: WorkpaperRun = { ...fixtureRun(), id: kind, rootId: kind, state: "ready", template: { ...f.run.template, rule: kind === "blocked" ? { ...SYNTHETIC_SUM_RULE, id: "unavailable" } : SYNTHETIC_SUM_RULE }, importIds: f.run.importIds, population: f.run.population, selection: f.run.selection };
      await f.repository.create(run);
      const result = await f.service.execute(scope, run.id, 1, kind === "failed" ? { invalid: true } : {});
      expect(result.state).toBe(kind); expect(result.findings).toEqual([]);
      expect((await f.service.revise(scope, run.id, result.version)).state).toBe("draft");
    }
  });
});
