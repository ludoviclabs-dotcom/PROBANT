import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createFixedAssetHarness, FA_DOSSIER, type FixedAssetHarness } from "../lib/workpapers/__tests__/fixed-asset-harness";
import { FA_CSV, faScope } from "../lib/workpapers/__tests__/fixed-asset-fixtures";

/**
 * Browser recipe of the Immobilisations sheet. Requests are routed to the real FixedAssetRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code, but this is not a persistence, OIDC or PostgreSQL recipe (see fixed-asset-durable.integration.test.ts).
 */
async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
async function serve(page: Page, h: FixedAssetHarness, session = "preparer") {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/immobilisations**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/export") ? h.handlers.exportPOST : url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/immobilisations?" + new URLSearchParams({ dossierId: FA_DOSSIER, periodId: faScope.periodId, ...query });
const bridge = (page: Page) => page.getByRole("list", { name: /^Pont (Brut|Amortissements|Dépréciations) —/ });
const step = (page: Page, name: RegExp) => bridge(page).getByRole("button", { name });
const table = (page: Page) => page.getByRole("region", { name: /^Actifs et composants — .* — défilement clavier$/ });
const family = (page: Page, name: string) => page.getByRole("radiogroup", { name: "Sélecteur de famille" }).getByRole("radio", { name: new RegExp(name) }).click();
/** Captures land in the test output and, when PROBANT_CAPTURES_DIR is set, in the handoff folder (ignored by Git). */
async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage });
  if (process.env.PROBANT_CAPTURES_DIR) { await mkdir(process.env.PROBANT_CAPTURES_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.PROBANT_CAPTURES_DIR, name), fullPage }); }
}
async function noGlobalOverflow(page: Page, width: number) {
  const layout = await page.evaluate(() => {
    const outside = Array.from(document.querySelectorAll("main *")).filter(el => { const rect = el.getBoundingClientRect(); if (!rect.width || rect.right <= window.innerWidth + 1) return false; let p = el.parentElement; while (p) { if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false; p = p.parentElement; } return true; })
      .map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 60), right: Math.round(el.getBoundingClientRect().right) }));
    return { width: document.documentElement.scrollWidth, outside };
  });
  expect(layout.width, JSON.stringify(layout.outside)).toBeLessThanOrEqual(width);
}

test("Immobilisations — pont Brut 100 + 20 − 10 = 110 attendu, 109 observé : écart −1 ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createFixedAssetHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await family(page, "Matériel industriel");
  await expect(step(page, /^Ouverture : 205,00/)).toBeVisible();
  await expect(step(page, /^\+ Entrées : \+60,00/)).toBeVisible();
  await expect(step(page, /^− Sorties : −10,00/)).toBeVisible();
  await expect(step(page, /^Écart.*−1,00/)).toContainText("à expliquer");
  await step(page, /^Écart/).click();
  await expect(table(page).locator("tr[data-unit]")).toHaveCount(1);
  const a001 = table(page).getByRole("row", { name: /^A-001/ });
  await expect(a001).toContainText("100,00"); await expect(a001).toContainText("20,00"); await expect(a001).toContainText("10,00"); await expect(a001).toContainText("110,00"); await expect(a001).toContainText("109,00"); await expect(a001).toContainText("−1,00");
  await a001.click();
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  await expect(panel.getByRole("heading", { name: /A-001 — Presse hydraulique/ })).toBeFocused();
  await expect(panel.getByRole("list", { name: /Chronologie Brut de A-001/ }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("VNC arithmétique ≠ valeur")).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "fa-gross-1440.png");
  await page.setViewportSize({ width: 1024, height: 768 });
  await capture(page, testInfo, "fa-gross-1024.png");
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, "fa-gross-390.png");
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await table(page).getByRole("row", { name: /^A-001/ }).click();
  expect(await panel.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await panel.getByRole("button", { name: "Ouvrir la ligne et sa pièce" }).first().click();
  await expect(panel.getByRole("region", { name: /Pièce FAC-001 \(acquisition\)/ })).toBeVisible();
  expect(await panel.locator("[class*=reveal]").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "fa-reduced-motion-piece-1440.png", false);
});

test("Immobilisations — recalcul documenté : entrées, formule, arrondi, provenance ; résiduel incohérent, méthode absente, mise en service après clôture", async ({ page }, testInfo) => {
  const h = createFixedAssetHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ table: "amortization", asset: "A-002" }));
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  const recalc = panel.getByRole("region", { name: "Recalcul documenté de la dotation" });
  await expect(recalc).toContainText("LIN-2024 v1"); await expect(recalc).toContainText("60 mois"); await expect(recalc).toContainText("12 / 12"); await expect(recalc).toContainText("Au centime, demi supérieur");
  await expect(recalc).toContainText("Dotation recalculée = (coût − valeur résiduelle) × 12 ÷ durée en mois");
  await expect(recalc.getByRole("region", { name: /Paramètres d’amortissement de l’actif/ })).toContainText("ligne 2");
  await expect(recalc.getByRole("region", { name: /Pièce de mise en service/ })).toBeVisible();
  await capture(page, testInfo, "fa-recalc-1440.png");
  await table(page).getByRole("row", { name: /^A-005/ }).click();
  await expect(recalc).toContainText("Valeur résiduelle 50.00 EUR supérieure au coût 45.00 EUR");
  await table(page).getByRole("row", { name: /^A-004/ }).click();
  await expect(recalc).toContainText("Mise en service postérieure à clôture");
  await expect(table(page).getByRole("row", { name: /^A-001/ })).toContainText("Sortie partielle");
  await family(page, "Logiciels");
  await expect(table(page).getByRole("row", { name: /^A-003/ })).toContainText("SOURCE REQUISE : méthode absente des paramètres.");
  await axe(page);
});

test("Immobilisations — changement de méthode : résultat retiré, exécution explicite, comparaison versionnée", async ({ page }, testInfo) => {
  const h = createFixedAssetHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ table: "amortization" }));
  await family(page, "Matériel industriel");
  const methods = page.getByRole("region", { name: "Méthodes et comparaison versionnée" });
  await methods.getByRole("button", { name: "Modifier" }).click();
  await methods.getByLabel("Version").fill("2");
  await methods.getByLabel("Source citée").fill("Politique d’amortissement révisée (pièce synthétique)");
  await methods.getByRole("button", { name: "Mettre à jour la méthode dans le brouillon" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Méthodes modifiées — non sauvegardées" })).toBeVisible();
  await methods.getByRole("button", { name: "Enregistrer les méthodes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await expect(page.getByText(/Revue non exécutée : exécutez-la/)).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: /Méthodes modifiées depuis la version exécutée r1 v\d+ \(LIN-2024\)/ })).toContainText("aucun recalcul silencieux");
  await capture(page, testInfo, "fa-method-pending-1440.png", false);
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await page.getByRole("button", { name: "Exécuter la revue des immobilisations" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await page.getByRole("tab", { name: "Amortissements" }).click();
  const comparison = page.getByRole("table", { name: /Comparaison r1 v\d+ → r1 v\d+/ });
  await expect(comparison).toContainText("LIN-2024 v1"); await expect(comparison).toContainText("LIN-2024 v2");
  await expect(comparison.getByRole("row", { name: /^A-002/ })).toContainText("0,00");
  await capture(page, testInfo, "fa-method-comparison-1440.png");
});

test("Immobilisations — source manquante bloquante et refus lisible avec localisateur", async ({ page }, testInfo) => {
  const h = createFixedAssetHarness(); await h.importAll({}, ["fa_register", "fa_parameters", "fa_support"]); await h.ok({ command: "create", period: { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-03-31", currency: "EUR", validation: "provisional" } });
  await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ filter: "stale" }));
  await expect(page.getByText("Source manquante bloquante : registre et GL / balance approuvés requis avant de figer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Figer les sources courantes" })).toBeDisabled();
  await expect(page.getByText("Requis — absent (bloquant)")).toBeVisible();
  await page.getByLabel("Type de pièce").selectOption("fa_register");
  await page.getByLabel(/Fichier CSV ou XLSX/).setInputFiles({ name: "registre-signe.csv", mimeType: "text/csv", buffer: Buffer.from(FA_CSV.fa_register.replace("L02;20.00", "L02;-20.00")) });
  await page.getByRole("button", { name: "Analyser et conserver l’aperçu" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Signe incohérent");
  await expect(page.locator("main").getByRole("alert")).toContainText("ligne 3");
  await axe(page);
  await capture(page, testInfo, "fa-blocked-source-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "fa-blocked-source-390.png");
});

test("Synthèse Immobilisations — file de travail, lien exact vers l’actif et export diagnostic", async ({ page }, testInfo) => {
  const h = createFixedAssetHarness(); const { run } = await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/immobilisations/synthese?" + new URLSearchParams({ dossierId: FA_DOSSIER, periodId: faScope.periodId }));
  await expect(page.getByText("1 exception(s)", { exact: false })).toBeVisible();
  const link = page.getByRole("link", { name: "Écart du pont des mouvements à expliquer" });
  await expect(link).toHaveAttribute("href", /asset=A-001/); await expect(link).toHaveAttribute("href", new RegExp("version=" + run.version));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML imprimable" }).first().click();
  const html = await readFile(await (await download).path(), "utf8");
  expect(html).toContain("Export diagnostic — ne constitue pas un paquet approuvé"); expect(html).toContain("pas une conclusion de valeur"); expect(html).toContain("-1.00 EUR");
  await axe(page);
  await capture(page, testInfo, "fa-synthesis-1440.png");
  await link.click();
  await expect(table(page).locator("tr[data-unit=A-001]")).toBeFocused();
  for (const tab of ["Population", "Exceptions", "Pièces", "Revue"]) {
    await page.getByRole("tab", { name: new RegExp("^" + tab) }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await axe(page);
  }
});
