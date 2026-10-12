import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Measure the eight historical pages without silently counting their allowed
// contrast debt as a clean audit. The complete observed result is published.
test("Mission 20 — mesure du contraste sur huit pages historiques", async ({ page }) => {
  test.setTimeout(120_000);
  const measurements = [];
  const output = `docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}`;
  await mkdir(output, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  for (const route of ["/", "/dashboard/depot", "/dashboard/synthese", "/dashboard/risques", "/dashboard/cloisons", "/dashboard/referentiel", "/dashboard/dossier", "/dashboard/fiscalite"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
    });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    measurements.push({ route, width, scrollWidth, violations });
    if (["/", "/dashboard/synthese", "/dashboard/cloisons"].includes(route)) {
      await page.screenshot({ path: `${output}/historical-${route === "/" ? "launcher" : route.split("/").at(-1)}-${width}.png`, fullPage: true });
    }
  }
  }
  await writeFile(`docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}/historical-axe.json`, JSON.stringify({ method: "actual Chromium / reduced motion / network idle / axe WCAG 2.1 AA", measurements, screenReader: "NON VÉRIFIÉ" }, null, 2));
  expect(measurements.flatMap(m => m.violations.filter(v => v.impact === "critical" || v.impact === "serious"))).toEqual([]);
});
