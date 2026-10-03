import { expect, it } from "vitest";
import { assessmentOutcome, assessmentSchema, resultPresentation } from "../result-contract";
import { createDemoSession } from "../demo-session";
import { summarizeWorkpapers } from "../mission-summary";
import { syntheticBaseline, withDemoRun } from "../browser-demo";
import { validateRun } from "../model";

it("un solde et une indemnité non nuls ne sont pas une exception", async () => {
  for (const cycle of ["cash", "conges"] as const) {
    const s = await createDemoSession(`SYN-positive-${cycle}`, { cycle, scenario: "nominal", missingEvidence: false, methodAvailable: true });
    const report = s.initial.result?.result as { technical: { referenceBookBalance?: { amount: string }; indemnityForSpecifiedRights?: { value: { amount: string } } } };
    expect(cycle === "cash" ? report.technical.referenceBookBalance?.amount : report.technical.indemnityForSpecifiedRights?.value.amount).not.toBe("0.00");
    expect(s.initial.result?.assessment?.subControls[0].outcome).toBe("no_exception_detected");
    expect(resultPresentation(s.initial).exceptions).toBe(0);
  }
});
it("une exception subsiste avec un autre contrôle non concluant ; un diagnostic bloqué ne conclut pas la procédure", async () => {
  const s = await createDemoSession("SYN-contract", { cycle: "cash", scenario: "exception", missingEvidence: false, methodAvailable: true });
  const a = s.initial.result!.assessment!;
  expect(assessmentOutcome(a)).toBe("exceptions_detected");
  expect(assessmentOutcome({ ...a, execution: "blocked" })).toBe("inconclusive");
  expect(() => assessmentSchema.parse({ ...a, subControls: [{ ...a.subControls[0], execution: "blocked" }] })).toThrow();
  expect(() => assessmentSchema.parse({ ...a, subControls: [a.subControls[0], a.subControls[0]] })).toThrow();
  expect(() => validateRun({ ...s.initial, result: { ...s.initial.result!, outcome: "no_exception_detected" } })).toThrow("RESULT_ASSESSMENT_MISMATCH");
});
it("les anciens résultats sont signalés périmés et retirés des compteurs d’exécution", async () => {
  const s = await createDemoSession("SYN-old-contract", { cycle: "cash", missingEvidence: false, methodAvailable: true });
  const legacy = { ...s.initial, result: { ...s.initial.result!, assessment: undefined } };
  const summary = summarizeWorkpapers(withDemoRun(syntheticBaseline(s.scope.dossierId), legacy));
  expect(summary).toMatchObject({ executed: 0, conclusive: 0 });
  expect(summary.rows[0]).toMatchObject({ stale: true, presentation: { contractOutdated: true } });
});
