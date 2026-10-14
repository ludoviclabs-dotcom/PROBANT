import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { WorkpaperRun } from "../lib/workpapers/model";
import type { StockResult } from "../lib/workpapers/stock-contract";
import { createStockHarness, ST_DOSSIER, type StockHarness, type StockSources } from "../lib/workpapers/__tests__/stock-harness";
import { C08_CSV, legacyStockResult } from "../lib/workpapers/__tests__/stock-c08-fixtures";
import { stScope } from "../lib/workpapers/__tests__/stock-fixtures";

/**
 * C08 — bornes de valeur, coûts et périmètre Stocks, recette navigateur sur le runtime réel (magasin mémoire de TEST, même
 * harnais que e2e/stocks.spec.ts : ni persistance ni PostgreSQL). Attendus posés à la main dans docs/recette/c08/RECETTE.md.
 * Captures dans docs/probant-lots/c08-captures (C08_OUT pour les déplacer).
 */
const OUT = process.env.C08_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c08-captures");

async function serve(page: Page, h: StockHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/stocks**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": "preparer", ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
async function c08Harness() {
  const h = createStockHarness(1_801_000_000, { valued: true }), sources: StockSources = {};
  for (const type of ["st_count", "st_system", "st_support", "st_costs", "st_ledger", "st_value"] as const) sources[type] = await h.accept(await h.preview(type, C08_CSV[type]));
  const { run } = await h.executed(sources);
  return { h, run };
}
const sheet = () => "/stocks?" + new URLSearchParams({ dossierId: ST_DOSSIER, periodId: stScope.periodId });
const panel = (page: Page) => page.getByRole("complementary", { name: "Comptage et pièce" });
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
/** Sections scroll inside the page: the viewport is made tall for the capture only, then restored. */
async function shot(page: Page, locator: Locator, name: string) {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 3200 });
  await locator.scrollIntoViewIfNeeded();
  await mkdir(OUT, { recursive: true });
  await locator.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 75 });
  await page.setViewportSize(viewport);
}

for (const width of [1440, 1024, 390] as const) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("revue bornée : valeur négative, complément à qualifier, quantité partielle, repli de coût, populations", async ({ page }) => {
      const { h } = await c08Harness(); await serve(page, h);
      await page.goto(sheet());
      const section = page.getByRole("region", { name: "Revue de valeur — hypothèses citées" });
      const review = page.getByRole("table", { name: /Revue de valeur par référence/ });
      // REF-N — 10 unités, coût 10,00, valeur actuelle 2,00 − 5,00 = −3,00 : comparaison 130,00, actif 100,00, complément 30,00, rien de comptabilisé.
      const n = review.getByRole("row", { name: /REF-N · ENTREPOT-NORD/ });
      for (const text of ["10,00 €", "−3,00 €", "2,00 € − 5,00 € par unite · DEV-N du 15/01/2027", "10 unite", "rapprochée", "130,00 €", "valeur comptable 100,00 €", "30,00 €", "obligation à qualifier", "0,00 €", "+100,00 €"]) await expect(n).toContainText(text);
      // REF-Q — 6 comptées pour 10 : estimation partielle, jamais une différence établie.
      const q = review.getByRole("row", { name: /REF-Q · ENTREPOT-NORD/ });
      await expect(q).toContainText("Sous le coût · estimation partielle");
      await expect(q).toContainText("théorique non rapprochée · reconstituée 6 unite");
      await expect(q).toContainText("partielle");
      await expect(review.getByRole("row", { name: /REF-L · ENTREPOT-NORD · lot L2/ })).toContainText("repli sur la référence");
      await expect(review.getByRole("row", { name: /REF-M · ENTREPOT-NORD/ })).toContainText("Coût absent · revue incomplète");
      await expect(review.getByRole("row", { name: /REF-U · ENTREPOT-NORD/ })).toContainText("Unités incompatibles · revue incomplète");
      await expect(review.getByRole("row", { name: /REF-T/ })).toHaveCount(0);
      const totals = section.getByRole("list");
      await expect(totals.getByRole("listitem").filter({ hasText: "Estimation complète" })).toContainText(/4\sunités.*comparaison économique 255,00\s€.*perte de valeur de l’actif 225,00\s€.*complément à qualifier 30,00\s€/);
      await expect(totals.getByRole("listitem").filter({ hasText: "Estimation partielle" })).toContainText(/1\sunité sur quantité théorique non rapprochée, non additionnée au total complet.*perte de valeur 10,00\s€/);
      await expect(totals.getByRole("listitem").filter({ hasText: "Part non revue" })).toContainText(/2\sunités sans hypothèse.*35,00\s€ au coût documenté \+ 1\sunité de valeur inconnue/);
      await expect(totals.getByRole("listitem").filter({ hasText: "Hors revue" })).toContainText("Stock détenu pour le compte de tiers : 1 (300,00 € déclarés)");
      await expect(totals.getByRole("listitem").filter({ hasText: "Dépréciations" })).toContainText(/détail de l’état théorique 125,00\s€.*comptes 39 au grand livre 125,00\s€.*écart de cadrage 0,00\s€/);
      await expect(page.getByText(/Population : 9 référence\(s\) \/ site\(s\) \/ lot\(s\) testée\(s\) au coût, dont 7 valorisée\(s\) et 2 de valeur inconnue/)).toBeVisible();
      await expect(page.getByText(/ne reconstitue ni coût moyen pondéré ni premier entré, premier sorti/).first()).toBeVisible();
      await noGlobalOverflow(page);
      await shot(page, section, `c08-revue-bornee-${width}.jpg`);
      // Keyboard: the row button opens the detail panel, focus moves to its heading, Escape returns to the button.
      const button = n.getByRole("button", { name: /REF-N · ENTREPOT-NORD/ });
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(panel(page).getByRole("heading", { name: "REF-N · ENTREPOT-NORD" })).toBeFocused();
      for (const text of ["Base de jugement", "valeur négative conservée", "quantité retenue 10 unite — quantité théorique rapprochée", "Perte de valeur de l’actif", "(bornée à la valeur comptable)", "30,00 € — obligation éventuelle, ni dépréciation ni provision automatique", "Coût moyen pondéré déclaré (PCG art. 213-34, 214-26) — non reconstitué", "coût déclaré, non reconstitué depuis les transactions"])
        await expect(panel(page)).toContainText(text);
      await noGlobalOverflow(page);
      await shot(page, panel(page), `c08-detail-valeur-negative-${width}.jpg`);
      await page.keyboard.press("Escape");
      await expect(button).toBeFocused();
      await axe(page);
    });

    test("feuille établie en 1.0.0 : consultable, périmée, révision vers la règle 1.1.0", async ({ page }) => {
      const { h, run } = await c08Harness();
      const list = Object.values(h.db.state.versions).map(v => v[run.id]).find(Boolean)!;
      const index = list.findIndex(v => v.version === Math.max(...list.map(x => x.version))), stored = list[index];
      list[index] = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
        result: { ...stored.result!, ruleVersion: "1.0.0", result: legacyStockResult(stored.result!.result as StockResult) } } as WorkpaperRun;
      await serve(page, h);
      await page.goto(sheet());
      const alert = page.getByRole("alert").filter({ hasText: "Feuille établie avec la règle Stocks 1.0.0" });
      await expect(alert).toContainText("programme 1.1.0 : résultat périmé");
      const legacy = page.getByRole("region", { name: "Revue de valeur — règle 1.0.0 (périmée)" });
      await expect(legacy).toContainText("l’écart indicatif n’y est ni borné à la valeur comptable");
      // As the 1.0.0 engine wrote it (docs/recette/c08/AVANT-1.0.0.json): 130,00 unbounded, +130,00 compared with nothing booked.
      await expect(legacy.getByRole("row", { name: /REF-N · ENTREPOT-NORD/ })).toContainText("130,00 €");
      await expect(legacy.getByRole("row", { name: /REF-N · ENTREPOT-NORD/ })).toContainText("+130,00 €");
      await noGlobalOverflow(page);
      await shot(page, legacy, `c08-regle-1-0-0-${width}.jpg`);
      await axe(page);
      await alert.getByRole("button", { name: "Créer une révision (règle 1.1.0)" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Feuille établie avec la règle Stocks" })).toHaveCount(0);
      await expect(page.getByText(/Feuille\s*r2 · v1/)).toBeVisible();
    });
  });
}

for (const width of [1440, 1024, 390] as const) {
  test(`registre C01 : capacité Stocks sans inventaire physique annoncé, ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/synthese");
    await page.getByRole("link", { name: "Ouvrir Stocks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Stocks", exact: true })).toBeVisible();
    const scope = page.getByText(/^Feuille versionnée : quantités comptées transcrites/);
    await expect(scope).toContainText("coûts déclarés (non reconstitués), revue de valeur bornée à la valeur comptable");
    await expect(scope).toContainText("Aucun inventaire physique certifié.");
    await expect(page.getByText(/Coûts CUMP \/ PEPS déclarés, non reconstitués depuis les transactions/)).toBeVisible();
    await expect(page.getByText(/Aucune dépréciation ni provision automatique \(complément au-delà de la valeur comptable : à qualifier\)/)).toBeVisible();
    await noGlobalOverflow(page);
    await shot(page, page.locator("main"), `c08-capacite-stocks-${width}.jpg`);
  });
}

test("réduction des animations : cases et jauges sans animation", async ({ page }) => {
  const { h } = await c08Harness(); await serve(page, h);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await expect(page.getByRole("table", { name: /Revue de valeur par référence/ })).toBeVisible();
  const animations = await page.evaluate(() => [...document.querySelectorAll("main button[aria-pressed]")].map(el => getComputedStyle(el).animationName).filter(n => n !== "none"));
  expect(animations).toEqual([]);
});
