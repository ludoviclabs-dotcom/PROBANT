import { describe, expect, it } from "vitest";
import { createDemoSession } from "../demo-session";
import { demoCycleSchema, type DemoCycle } from "../demo-cycles";
import { TARGET_CONTROL } from "../demo-assessment";
import { syntheticBaseline } from "../browser-demo";
import { summarizeWorkpapers } from "../mission-summary";
import { buildWorkpaperPackage, hashExportText } from "../package";
import { resultPresentation } from "../result-contract";
import type { WorkpaperRun } from "../model";

const semanticExpectations: Record<DemoCycle, [string, unknown, unknown]> = {
  cash: ["difference.amount", "0.00", "-0.10"],
  cutoff: ["status", "already_treated", "candidate"],
  fournisseurs: ["rows.0.status", "booked_in_period", "omission_candidate"],
  clients: ["frame.generalToAuxiliary.gross.value.amount", "0.00", "10.00"],
  immobilisations: ["movements.rows.0.gross.difference.value.amount", "0.00", "-10.00"],
  capitaux: ["rows.0.difference.value.amount", "0.00", "-10.00"],
  achats: ["rows.0.difference.value.amount", "0.00", "0.10"],
  conges: ["bookedDifference.value.amount", "0.00", "6.67"],
  participations: ["bookedDifference.value.amount", "0.00", "-1.00"],
  is: ["accountingDifference.value.amount", "0.00", "10.00"],
};
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, value);
}
const target = (run: WorkpaperRun, cycle: DemoCycle) => run.result!.assessment!.subControls.find((c) => c.id === TARGET_CONTROL[cycle].id)!;
const snapshotWith = (id: string, run: WorkpaperRun) => ({ ...syntheticBaseline(id), workpapers: { version: "1.0.0" as const, runs: [run] } });
const create = (cycle: DemoCycle, scenario: "nominal" | "exception" | "invalid" = "nominal", missingEvidence = false, methodAvailable = true) => createDemoSession(`SYN-recipe-${cycle}`, { cycle, scenario, missingEvidence, methodAvailable });

for (const cycle of demoCycleSchema.options) describe(`recette sémantique ${cycle}`, () => {
  it("nominal : concordance du sous-contrôle visé et limites explicites", async () => {
    const s = await create(cycle), run = s.initial;
    expect(target(run, cycle)).toMatchObject({ execution: "completed", outcome: "no_exception_detected", mode: "demo", availability: "available" });
    expect(target(run, cycle).prerequisites.every((p) => p.status === "met")).toBe(true);
    expect(at(run.result?.result, `technical.${semanticExpectations[cycle][0]}`)).toBe(semanticExpectations[cycle][1]);
    expect(run.findings).toEqual([]);
    expect(run.result?.execution).toBe(cycle === "is" ? "blocked" : "completed");
    // Untested parts must survive even when the compared balances agree.
    expect(resultPresentation(run).incomplete).toBeGreaterThan(0);
    expect(summarizeWorkpapers(snapshotWith(s.scope.dossierId, run)).conclusive).toBe(0);
  });
  it("exception : variation métier exacte du sous-contrôle, malgré une autre partie non concluante", async () => {
    const s = await create(cycle, "exception"), nominal = await create(cycle);
    expect(target(s.initial, cycle).outcome).toBe("exceptions_detected");
    expect(at(s.initial.result?.result, `technical.${semanticExpectations[cycle][0]}`)).toBe(semanticExpectations[cycle][2]);
    expect(target(nominal.initial, cycle).outcome).toBe("no_exception_detected");
    expect(resultPresentation(s.initial)).toMatchObject({ exceptions: cycle === "clients" ? 2 : 1 });
    expect(resultPresentation(s.initial).incomplete).toBeGreaterThan(0);
    expect(s.initial.result?.outcome).toBe(cycle === "is" ? "inconclusive" : "exceptions_detected");
    if (cycle === "is") expect(at(s.initial.result?.result, "technical.taxEngine.status")).toBe("blocked");
  });
  for (const [kind, scenario, missing, method] of [
    ["donnée invalide", "invalid", false, true], ["preuve manquante", "nominal", true, true], ["méthode manquante", "nominal", false, false],
  ] as const) it(`${kind} : calcul bloqué, diagnostic exportable, aucune exécution réussie`, async () => {
    const s = await create(cycle, scenario, missing, method), run = s.initial;
    expect(run).toMatchObject({ state: "blocked", result: { execution: "blocked", outcome: "inconclusive" } });
    expect(target(run, cycle)).toMatchObject({ execution: "blocked", outcome: "inconclusive" });
    expect(target(run, cycle).prerequisites.some((p) => p.status === "missing")).toBe(true);
    const snapshot = snapshotWith(s.scope.dossierId, run), summary = summarizeWorkpapers(snapshot);
    expect(summary).toMatchObject({ planned: 1, executed: 0, approved: 0, conclusive: 0, blocked: 1, subControlsExecuted: 0 });
    const bundle = buildWorkpaperPackage(snapshot, s.scope, s.preparer), exported = JSON.parse(bundle.json);
    expect(exported.exportKind).toBe("blocked-diagnostics");
    expect(exported.diagnostics[0]).toMatchObject({ id: run.id, state: "blocked" });
    expect(exported.summary).toEqual(summary);
    expect(bundle.markdown).toContain("Diagnostic bloqué");
    expect(bundle.manifest.files[0].hash).toBe(hashExportText(bundle.json));
    await expect(s.submit(run, "Ne doit pas passer en revue")).rejects.toThrow();
    await expect(s.approve(run, "Ne doit pas être approuvé")).rejects.toThrow();
    await expect(s.lock(run, snapshot)).rejects.toThrow();
    const corrected = await s.editLocked(run, { cycle, scenario: "nominal", missingEvidence: false, methodAvailable: true });
    expect(corrected.revision).toBe(2);
    expect(corrected.approval).toBeUndefined();
    expect(target(corrected, cycle).outcome).toBe("no_exception_detected");
    expect(corrected.state).toBe(cycle === "is" ? "blocked" : "executed");
  });
  it("revue et verrouillage : la revue ne transforme pas la conclusion", async () => {
    const s = await create(cycle, "exception");
    if (cycle === "is") {
      await expect(s.submit(s.initial, "IS non raccordé")).rejects.toThrow();
      await expect(s.lock(s.initial, snapshotWith(s.scope.dossierId, s.initial))).rejects.toThrow();
      const pkg = buildWorkpaperPackage(snapshotWith(s.scope.dossierId, s.initial), s.scope, s.preparer);
      expect(JSON.parse(pkg.json).summary).toMatchObject({ executed: 0, conclusive: 0, approved: 0, subControlsExecuted: 1, exceptions: 1 });
      return;
    }
    const submitted = await s.submit(s.initial, "Exception et limites documentées"), approved = await s.approve(submitted, "Revue du travail, pas une opinion");
    expect(approved.result).toEqual(s.initial.result);
    const locked = await s.lock(approved, syntheticBaseline(s.scope.dossierId));
    expect(summarizeWorkpapers(locked)).toMatchObject({ approved: 1, inconclusive: 1, conclusive: 0 });
    const pkg = buildWorkpaperPackage(locked, s.scope, s.preparer), row = JSON.parse(pkg.json).summary.rows[0];
    expect(row.presentation).toEqual(resultPresentation((await s.service.get(s.scope, approved.id))!));
    expect(pkg.markdown).toContain("conclusion partielle");
  });
  it("modification : nouvelle révision, revue périmée et remplacement après nouvelle revue", async () => {
    const s = await create(cycle);
    if (cycle === "is") {
      // No fabricated locked IS workpaper: the gate must also forbid the locked path.
      await expect(s.lock(s.initial, syntheticBaseline(s.scope.dossierId))).rejects.toThrow();
      const revised = await s.editLocked(s.initial, { cycle, scenario: "exception", missingEvidence: false, methodAvailable: true });
      expect(revised.state).toBe("blocked");
      expect(target(revised, cycle).outcome).toBe("exceptions_detected");
      expect(revised.approval).toBeUndefined();
      return;
    }
    const approved = await s.approve(await s.submit(s.initial, "Préparation"), "Revue"), snapshot = await s.lock(approved, syntheticBaseline(s.scope.dossierId));
    const old = (await s.service.get(s.scope, approved.id))!;
    const revised = await s.editLocked(old, { cycle, scenario: "exception", missingEvidence: false, methodAvailable: true });
    expect(revised.approval).toBeUndefined(); expect(revised.submittedHash).toBeUndefined();
    expect(target(revised, cycle).outcome).toBe("exceptions_detected");
    const stale = { ...snapshot, workpapers: { version: "1.0.0" as const, runs: [revised] } };
    expect(summarizeWorkpapers(stale).rows[0].stale).toBe(true);
    expect(resultPresentation(revised).staleness).toContain("périmée");
    expect(() => buildWorkpaperPackage(stale, s.scope, s.preparer)).toThrow("STALE_REVIEW_EXPORT_BLOCKED");
    const reviewed = await s.approve(await s.submit(revised, "Nouvelle préparation"), "Nouvelle revue"), replaced = await s.lock(reviewed, stale);
    expect(replaced.workpaperProjection?.lockedRuns).toHaveLength(1);
    expect(replaced.workpaperProjection?.lockedRuns[0].revision).toBe(2);
    expect((await s.service.get(s.scope, old.id))?.state).toBe("superseded");
    expect(buildWorkpaperPackage(replaced, s.scope, s.preparer).json).toContain("exceptions_detected");
  });
});
