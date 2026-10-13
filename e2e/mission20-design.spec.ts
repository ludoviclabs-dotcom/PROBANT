import { expect, test } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createClosingHarness, CL_DOSSIER, CL_PERIOD_ID, lockedProvisionSource } from "../lib/workpapers/__tests__/closing-harness";
import { buildRecipe } from "../lib/workpapers/__tests__/closing-fixtures";

// Presentation/fault injection only. The durable browser recipe is separate.
test.setTimeout(180_000);
test("Mission 20 — table longue 128 procédures dont 127 applicables, chargement retardé, documents manquants, erreur serveur et récupération", async ({ page }) => {
  const h = createClosingHarness({ cycles: [await lockedProvisionSource()] });
  await buildRecipe(h);
  await h.ok({ command: "set_risk", riskId: "R-99", cycle: "clients", label: "Risque de recette longue", assertions: ["solde_existence"], assessment: null });
  for (let n = 100; n < 220; n++) await h.ok({ command: "set_procedure", procedureId: "P-" + n, riskIds: ["R-99"], assertions: ["solde_existence"], nature: "detail", label: "Procédure longue " + n, owner: "Préparateur synthétique" });
  const program = (await h.view()).evaluation;
  const procedures = program.procedures.length;
  const applicableProcedures = program.indicators.find(i => i.id === "revues")?.denominator;
  expect(procedures).toBe(128);
  expect(applicableProcedures).toBe(127);
  let fail = false, slow = true;
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/closing**", async route => {
    if (slow) await new Promise(resolve => setTimeout(resolve, 2000));
    if (fail) return route.fulfill({ status: 503, json: { error: "CL_DURABLE_UNAVAILABLE" } });
    const q = new URL(route.request().url());
    const response = await h.handlers.GET(new Request("https://probant.test" + q.pathname + q.search, { headers: { "x-test-session": "preparer" } }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const url = (tab = "programme") => "/dossier-cloture?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: CL_PERIOD_ID, tab });
  await mkdir(`docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}`, { recursive: true });
  await page.goto(url());
  await expect(page.getByRole("status").filter({ hasText: /Chargement/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir la fiche P-219 · Procédure longue 219", exact: true })).toBeVisible();
  slow = false;
  const layouts = [];
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    layouts.push({ width, scrollWidth });
    expect(scrollWidth).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}/long-table-` + width + ".png" });
  }
  await page.goto(url("pieces"));
  await expect(page.getByText("Population absente").first()).toBeVisible();
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(context: unknown, options: unknown): Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
  fail = true;
  await page.goto(url());
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "Service indisponible" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir la fiche P-219 · Procédure longue 219", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}/server-error-390.png` });
  fail = false;
  await page.goto(url());
  await expect(page.getByRole("button", { name: "Ouvrir la fiche P-219 · Procédure longue 219", exact: true })).toBeVisible();
  await writeFile(`docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}/design-faults.json`, JSON.stringify({ method: "real Chromium UI / runtime over test memory store / HTTP 503 and 2000ms delay injected", procedures, applicableProcedures,
    layouts, missingDocuments: "visible, no invented population", serverError: "visible, no false result", recovery: "passed", axeCriticalOrSerious: violations, screenReader: "NON VÉRIFIÉ" }, null, 2));
});
