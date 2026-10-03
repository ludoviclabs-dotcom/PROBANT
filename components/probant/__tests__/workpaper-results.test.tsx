// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { createDemoSession } from "@/lib/workpapers/demo-session";
import { demoCycleSchema } from "@/lib/workpapers/demo-cycles";
import { TARGET_CONTROL } from "@/lib/workpapers/demo-assessment";
import { syntheticBaseline, withDemoRun } from "@/lib/workpapers/browser-demo";
import { buildWorkpaperPackage } from "@/lib/workpapers/package";
import { WorkpaperPanel } from "../WorkpaperPanel";
import { SyntheticSummary } from "../SyntheticSummary";
import { OUTCOME_LABELS } from "@/lib/workpapers/result-contract";

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(cleanup);
for (const cycle of demoCycleSchema.options) for (const scenario of ["nominal", "exception", "invalid", "missing"] as const) it(`${cycle}/${scenario} : écran, Synthèse et export gardent le même sens`, async () => {
  const s = await createDemoSession(`SYN-screen-${cycle}`, { cycle, scenario: scenario === "missing" ? "nominal" : scenario, missingEvidence: scenario === "missing", methodAvailable: true });
  const run = s.initial;
  let snapshot = withDemoRun(syntheticBaseline(s.scope.dossierId), run);
  if (run.state === "executed") {
    snapshot = await s.lock(await s.approve(await s.submit(run, "Préparation limitée aux éléments testés"), "Revue simulée avec limites"), snapshot);
  }
  const bundle = buildWorkpaperPackage(snapshot, s.scope, s.preparer), exported = JSON.parse(bundle.json);
  const expected = scenario === "nominal" ? "no_exception_detected" : scenario === "exception" ? "exceptions_detected" : "inconclusive";
  const exportedControl = exported.summary.rows[0].presentation.controls.find((c: { id: string }) => c.id === TARGET_CONTROL[cycle].id);
  expect(exportedControl.outcome).toBe(expected);
  const panel = render(<WorkpaperPanel runs={[run]} />);
  expect(panel.container.querySelector(`[data-control-id="${TARGET_CONTROL[cycle].id}"]`)?.textContent).toContain(OUTCOME_LABELS[expected]);
  for (const label of ["Test exécuté", "Résultat", "Incertitude", "Prochaine action"]) expect([...panel.container.querySelectorAll("dt")].map((dt) => dt.textContent)).toContain(label);
  const technical = [...panel.container.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent?.includes("Détail technique"));
  expect(technical?.open).toBe(false);
  expect(panel.container.querySelector(`[data-control-id="${TARGET_CONTROL[cycle].id}"] a`)?.getAttribute("href")).toMatch(/^\/dashboard\//);
  cleanup();
  const summary = render(<SyntheticSummary snapshot={snapshot} />);
  expect(summary.container.querySelector(`[data-control-id="${TARGET_CONTROL[cycle].id}"]`)?.textContent).toContain(OUTCOME_LABELS[expected]);
  expect(bundle.markdown).toContain(OUTCOME_LABELS[expected]);
  expect(summary.container.textContent).toContain(`${exported.summary.executed} exécutées`);
  expect(summary.container.textContent).toContain(`${exported.summary.blocked} bloquées`);
});
