import path from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildSnapshotFromFecDepot } from "../lib/dossier/snapshot-builder";
import { computeDossierSnapshotHash } from "../lib/dossier/snapshot-state";
import { contextParams, navigationContext } from "../lib/dossier/navigation-context";
import { makeEffect, makeFinding } from "../lib/synthesis/__tests__/fixtures";
import { createFiscalHarness, FX_DOSSIER, type FiscalHarness } from "../lib/workpapers/__tests__/fiscal-harness";
import { fxPeriod, fxScope } from "../lib/workpapers/__tests__/fiscal-fixtures";

/**
 * C05 / C10 — incidence fiscale des ajustements dans la Synthèse d'un dossier persistant. Le dossier est servi par
 * interception HTTP ; la base IS vient du vrai FiscalRuntime (magasin de test en mémoire) : feuille IS de l'exercice
 * 2026, résultat fiscal 71 800 €, non éligible au taux réduit → 17 950 €. Ajustement validé +1 000 € qualifié
 * déductible : 72 800 × 25 % = 18 200 €, effet d'impôt −250,00 € et net +750,00 € (calcul à la main).
 */
const ORG = fxScope.organizationId;
function persistentSnapshot() {
  const value = buildSnapshotFromFecDepot({ dossierId: FX_DOSSIER, nomFichier: "fixture-2026.txt", fingerprint: "fixture-2026", siren: "123456789", referentielVersion: "fixture-pcg",
    admissibilite: [], analyse: [], entries: [], entriesTruncated: false, generatedAt: "2027-02-01T00:00:00Z" });
  value.sourceKind = "persistent";
  value.dossier = { ...value.dossier, organizationId: ORG, period: fxPeriod, societe: { raisonSociale: "ENTITÉ LOCALE · recette C10", siren: "123456789", exercice: "2026", dateCloture: "20261231" } };
  value.findings = [makeFinding("ADJ-1", { statutRevue: "valide", titre: "Charge à payer omise", financialEffect: makeEffect({ amountCents: 100_000, taxQualification: "deductible", period: "2026" }), lignesSource: [1] })];
  value.snapshotHash = computeDossierSnapshotHash(value);
  return value;
}
async function serve(page: Page, h: FiscalHarness) {
  const snapshot = persistentSnapshot(), context = { organizationId: ORG, dossierId: FX_DOSSIER };
  await page.addInitScript(({ snapshot, context, org }) => {
    sessionStorage.setItem(`probant:dossier:v1:index:${encodeURIComponent(org)}`, JSON.stringify([context]));
    sessionStorage.setItem(`probant:dossier:v1:snapshot:${encodeURIComponent(org)}:${encodeURIComponent(snapshot.dossier.id)}`, JSON.stringify(snapshot));
  }, { snapshot, context, org: ORG });
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "synthetic-c10" } }));
  await page.route("**/api/dossiers/*/snapshot", r => r.fulfill({ json: snapshot }));
  await page.route("**/api/workpapers/fiscal?**", async route => {
    const url = new URL(route.request().url());
    const response = await h.handlers.GET(new Request("https://probant.test" + url.pathname + url.search, { headers: { "x-test-session": "preparer" } }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  return navigationContext(snapshot, context);
}
async function lockedSheet(h: FiscalHarness) {
  let { run } = await h.citExecuted();
  run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Résultat cadré ; impôt du moteur égal à la charge comptabilisée." });
  run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
  run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante IS." }, "reviewer");
  return h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
}
async function check(page: Page, width: number, info: TestInfo, name: string) {
  const state = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(state.scrollWidth, name).toBeLessThanOrEqual(width);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document.querySelector("[aria-label='Incidence fiscale des ajustements']"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations, name).toEqual([]);
  await page.getByRole("region", { name: "Incidence fiscale des ajustements" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(name) });
  if (process.env.PROBANT_CAPTURES_DIR) { await mkdir(process.env.PROBANT_CAPTURES_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.PROBANT_CAPTURES_DIR, name) }); }
}
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

for (const width of [390, 1024, 1440]) {
  test(`Synthèse — feuille IS verrouillée : effet d'impôt −250 € par scénario d'IS, ${width}px`, async ({ page }, info) => {
    const h = createFiscalHarness(); const sheet = await lockedSheet(h);
    await page.setViewportSize({ width, height: 900 });
    const nav = await serve(page, h);
    await page.goto("/dashboard/synthese?" + contextParams(nav));
    const notice = page.getByRole("region", { name: "Incidence fiscale des ajustements" });
    await expect(notice).toHaveAttribute("data-incidence", "available");
    await expect(notice).toContainText(`Scénario d'IS avant/après sur la feuille IS verrouillée (v${sheet.version}, moteur tax-05-corporate-income-tax-1.1.0) : 1 ajustement(s)`);
    await expect(notice.getByRole("link", { name: `Ouvrir la feuille IS (v${sheet.version})` })).toHaveAttribute("href", /\/fiscal\?.*tax=cit/);
    const amountOf = (label: string) => page.locator("span", { hasText: label }).first().locator("xpath=following-sibling::span[1]");
    await expect(amountOf("Effet d'impôt — résultat (connu)")).toHaveText(/^250,00\s€$/);
    await expect(page.locator("span", { hasText: "Effet d'impôt — résultat (connu)" }).first()).toContainText("− ");
    await expect(amountOf("Effet net sur le résultat après impôt")).toHaveText(/^750,00\s€$/);
    await check(page, width, info, `c10-synthese-incidence-${width}.png`);
  });
}

test("Synthèse — feuille IS non verrouillée : incidence inconnue, motif et lien vers la feuille, 1024px", async ({ page }, info) => {
  const h = createFiscalHarness(); await h.citExecuted();
  await page.setViewportSize({ width: 1024, height: 900 });
  const nav = await serve(page, h);
  await page.goto("/dashboard/synthese?" + contextParams(nav));
  const notice = page.getByRole("region", { name: "Incidence fiscale des ajustements" });
  await expect(notice).toHaveAttribute("data-incidence", "unavailable");
  await expect(notice).toContainText("Feuille IS non verrouillée (executed) : le calcul de base n'a pas été approuvé en revue.");
  await expect(notice.getByRole("link", { name: /Ouvrir la feuille IS/ })).toBeVisible();
  await expect(page.locator("span", { hasText: "Effet d'impôt — résultat (inconnu)" }).first().locator("xpath=following-sibling::span[1]")).toHaveText("inconnu");
  await check(page, 1024, info, "c10-synthese-incidence-inconnue-1024.png");
});
