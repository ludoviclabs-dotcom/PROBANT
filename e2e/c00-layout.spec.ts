import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { clientMissionFixture } from "../lib/workpapers/__tests__/client-mission-fixture";
import { createClosingHarness, CL_DOSSIER, CL_PERIOD_ID, lockedProvisionSource } from "../lib/workpapers/__tests__/closing-harness";
import { buildRecipe } from "../lib/workpapers/__tests__/closing-fixtures";
import { linkImportedEvidence } from "../lib/workpapers/evidence";
import { contentHash } from "../lib/workpapers/model";

// Presentation only: existing server fixtures/handlers, explicitly intercepted HTTP.
// No migration, PostgreSQL write, identity exchange or new accounting calculation.
const output = `docs/recette/c00/${process.env.PROBANT_C00_PHASE ?? "after"}`;
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });
async function record(page: Page, info: TestInfo, name: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const audit = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[]; failureSummary?: string }[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) }));
  });
  const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    scrollContainers: Array.from(document.querySelectorAll("main *")).filter(el => ["auto", "scroll"].includes(getComputedStyle(el).overflowX)).map(el => ({ tag: el.tagName, label: el.getAttribute("aria-label"), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })) }));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${output}/${name}-viewport.png` });
  const file = `${output}/${name}.json`;
  await writeFile(file, JSON.stringify({ observedAt: new Date().toISOString(), browser: page.context().browser()?.version(), method: "compiled local Next / existing synthetic fixtures and HTTP interception / network idle / fonts ready / reduced motion / axe WCAG 2.1 AA", layout, audit }, null, 2));
  await info.attach(name, { path: file, contentType: "application/json" });
  expect.soft(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
  expect.soft(audit.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  return layout;
}

for (const width of [390, 1024, 1440]) {
  test(`C00 Clients — version verrouillée et identifiants sources à ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await clientMissionFixture();
    // Complete the fixture with the same source links used by WorkpaperService
    // during the Clients freeze command. The original lightweight fixture has none.
    const actor = { id: f.run.preparedBy, grants: [{ scope: f.scope, permissions: ["read", "prepare"] as ("read" | "prepare")[] }] };
    const evidence = f.imports.map(batch => linkImportedEvidence(f.run, batch, batch.rows[0].id, "Source du cadrage Clients", actor));
    f.run = { ...f.run, evidence };
    f.run.submittedHash = contentHash(f.run);
    f.approved = { ...f.approved, evidence, approval: { ...f.approved.approval!, snapshotHash: contentHash(f.run) } };
    f.locked = { ...f.locked, evidence, approval: f.approved.approval };
    await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "synthetic-c00" } }));
    await page.route("**/api/workpapers/clients?**", r => r.fulfill({ json: { actorId: "actual-reviewer", permissions: ["read", "review", "download"], runs: [f.locked], imports: f.imports, sourceHeads: f.heads, sourcesCurrent: { [f.locked.id]: true }, currentVersions: { [f.locked.id]: f.locked.version } } }));
    await page.goto("/clients-framing?" + new URLSearchParams({ dossierId: f.scope.dossierId, periodId: f.scope.periodId, id: f.locked.id, version: String(f.locked.version), filter: "all" }));
    await expect(page.getByText(/Examen de la version 12/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feuilles de travail" })).toBeVisible();
    // The real fixture carries complete SHA-256 identifiers, never shortened to make the layout pass.
    expect(f.locked.population?.hash).toHaveLength(64);
    await expect(page.getByRole("listitem").filter({ hasText: evidence[0].documentVersionId }).first()).toBeVisible();
    await record(page, info, `clients-${width}`);
    const filter = page.getByRole("button", { name: "Exceptions", exact: true });
    await filter.focus();
    await expect(filter).toBeFocused();
    expect(await filter.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  });

  test(`C00 Programme — 128 procédures et défilement interne à ${width}px`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const h = createClosingHarness({ cycles: [await lockedProvisionSource()] });
    await buildRecipe(h);
    await h.ok({ command: "set_risk", riskId: "R-99", cycle: "clients", label: "Risque de recette longue", assertions: ["solde_existence"], assessment: null });
    for (let n = 100; n < 220; n++) await h.ok({ command: "set_procedure", procedureId: "P-" + n, riskIds: ["R-99"], assertions: ["solde_existence"], nature: "detail", label: "Procédure longue " + n, owner: "Préparateur synthétique" });
    expect((await h.view()).evaluation.procedures).toHaveLength(128);
    await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "synthetic-c00" } }));
    await page.route("**/api/workpapers/closing**", async route => {
      const url = new URL(route.request().url());
      const response = await h.handlers.GET(new Request("https://probant.test" + url.pathname + url.search, { headers: { "x-test-session": "preparer" } }));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: CL_PERIOD_ID, tab: "programme" }));
    const last = page.getByRole("button", { name: "Ouvrir la fiche P-219 · Procédure longue 219", exact: true });
    await expect(last).toBeVisible();
    const layout = await record(page, info, `programme-${width}`);
    // Coverage tables keep their horizontal scrolling, rather than clipping their content.
    expect.soft(layout.scrollContainers.some(c => c.tag === "DIV" && c.scrollWidth > c.clientWidth)).toBe(true);
    const tableRegion = page.getByRole("region", { name: "Carte de couverture risques × assertions" });
    const canScroll = await tableRegion.evaluate(el => el.scrollWidth > el.clientWidth);
    if (canScroll) {
      await tableRegion.focus();
      await expect(tableRegion).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => tableRegion.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    await last.focus();
    await expect(last).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /P-219/ })).toBeVisible();
    await record(page, info, `programme-detail-${width}`);
    await page.keyboard.press("Escape");
    await expect(last).toBeFocused();
  });
}
