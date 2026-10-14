import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createFixedAssetHarness, FA_DOSSIER, type FixedAssetHarness } from "../lib/workpapers/__tests__/fixed-asset-harness";
import { FA_C06_CSV, faScope } from "../lib/workpapers/__tests__/fixed-asset-fixtures";

/**
 * C06 — fin de plan d’amortissement, recette navigateur sur le runtime réel (magasin mémoire de TEST, même harnais que
 * e2e/fixed-assets.spec.ts). Attendus posés à la main dans lib/workpapers/__tests__/fixed-asset-fixtures.ts (FA_C06_CSV).
 * Captures dans docs/probant-lots/c06-captures (C06_OUT pour les déplacer).
 */
const OUT = process.env.C06_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c06-captures");

async function serve(page: Page, h: FixedAssetHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/immobilisations**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": "preparer", ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/export") ? h.handlers.exportPOST : url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (asset: string) => "/immobilisations?" + new URLSearchParams({ dossierId: FA_DOSSIER, periodId: faScope.periodId, table: "amortization", asset });
async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => ({ doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth], main: [document.querySelector("main")?.scrollWidth ?? 0, document.querySelector("main")?.clientWidth ?? 0] }));
  expect(m.doc[0], "débordement horizontal du document").toBeLessThanOrEqual(m.doc[1]);
  expect(m.main[0], "débordement horizontal de <main>").toBeLessThanOrEqual(m.main[1]);
}
async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
/** The detail panel scrolls in its own column: the viewport is made tall for the capture only, then restored. */
async function shot(page: Page, locator: ReturnType<Page["locator"]>, name: string) {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 3200 });
  await locator.scrollIntoViewIfNeeded();
  await mkdir(OUT, { recursive: true });
  await locator.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 75 });
  await page.setViewportSize(viewport);
}
async function recalcOf(page: Page, asset: string) {
  await page.goto(sheet(asset));
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  await expect(panel.getByRole("heading", { level: 2 })).toContainText(asset);
  return panel.getByRole("region", { name: "Recalcul documenté de la dotation" });
}

for (const width of [1440, 1024, 390] as const) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("plan inchangé : segment, cumul d’ouverture, restant, plafond, attendu et écart", async ({ page }) => {
      const h = createFixedAssetHarness(); await h.executed(FA_C06_CSV); await serve(page, h);
      // E-01 — 12 000, 60 mois, cumul 12 000 : plan échu le 31/12/2023, dotation attendue 0, comptabilisé 2 400 → écart +2 400.
      let recalc = await recalcOf(page, "E-01");
      await expect(recalc).toContainText("Plan d’origine inchangé");
      // The state chip wraps inside its column instead of being clipped.
      const chip = recalc.getByText("Plan d’origine inchangé", { exact: true });
      expect(await chip.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= el.closest("dd")!.getBoundingClientRect().right + 1)).toBe(true);
      await expect(recalc).toContainText("01/01/2019 → 31/12/2023");
      await expect(recalc).toContainText("plan échu avant l’ouverture");
      await expect(recalc).toContainText(/Cumul d’amortissement d’ouverture\s*12\s000,00/);
      await expect(recalc).toContainText("Plan échu avant l’ouverture : dotation attendue 0");
      await expect(recalc).toContainText(/Dotation attendue \(recalculée\)\s*0,00\sEUR/);
      await expect(recalc).toContainText(/Écart comptabilisé − recalculé\s*\+2\s400,00/);
      await expect(recalc.getByRole("region", { name: /Cumul d’ouverture — registre/ })).toBeVisible();
      await expect(recalc).toContainText("plafonnée au montant amortissable restant");
      await noGlobalOverflow(page);
      await shot(page, recalc, `c06-plan-echu-${width}.jpg`);
      // L-02 — dernière annuité : 2 400 × 12/12 plafonnée au restant 1 200.
      recalc = await recalcOf(page, "L-02");
      await expect(recalc).toContainText("01/07/2019 → 30/06/2024");
      await expect(recalc).toContainText("dernière annuité dans l’exercice");
      await expect(recalc).toContainText(/Restant à l’ouverture\s*\+?1\s200,00/);
      await expect(recalc).toContainText(/Annuité × prorata\s*2\s400,00/);
      await expect(recalc).toContainText("Appliqué : annuité ramenée au montant amortissable restant");
      await expect(recalc).toContainText(/Dotation attendue \(recalculée\)\s*1\s200,00\sEUR/);
      await noGlobalOverflow(page);
      await shot(page, recalc, `c06-plafond-${width}.jpg`);
      await axe(page);
    });

    test("cas isolés : cumul invalide, plan révisé sans base validée, dépréciation", async ({ page }) => {
      const h = createFixedAssetHarness(); await h.executed(FA_C06_CSV); await serve(page, h);
      let recalc = await recalcOf(page, "I-01");
      await expect(recalc).toContainText("Bloqué");
      await expect(recalc.getByRole("note").filter({ hasText: "Cumul incohérent avec le plan" })).toContainText("13000.00 EUR supérieur au montant amortissable 12000.00 EUR");
      await expect(recalc).toContainText(/Restant à l’ouverture\s*−1\s000,00/);
      await expect(recalc).toContainText("Non appliqué : dotation attendue inconnue");
      await noGlobalOverflow(page);
      await shot(page, recalc, `c06-cumul-invalide-${width}.jpg`);
      recalc = await recalcOf(page, "M-01");
      await expect(recalc).toContainText("Plan révisé");
      await expect(recalc).toContainText("01/01/2024 → fin non établie");
      await expect(recalc).toContainText("montant amortissable restant à cette date non validé");
      recalc = await recalcOf(page, "D-01");
      await expect(recalc).toContainText("Base modifiée par une dépréciation");
      await expect(recalc).toContainText("la VNC n’en tient pas lieu");
      await noGlobalOverflow(page);
      await shot(page, recalc, `c06-depreciation-${width}.jpg`);
    });
  });
}
