import path from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createStockHarness, ST_DOSSIER, type StockHarness } from "../lib/workpapers/__tests__/stock-harness";
import { COUNT_ROWS, countCsv, stScope } from "../lib/workpapers/__tests__/stock-fixtures";

/**
 * Browser recipe of the stock sheet (Mission 15, sub-lot 1). Requests are routed to the real StockRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code and the stock engine, but this is not a persistence, OIDC or PostgreSQL recipe (see stock-durable.integration.test.ts).
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
const session = { current: "preparer" };
async function serve(page: Page, h: StockHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/stocks**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session.current, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/stocks?" + new URLSearchParams({ dossierId: ST_DOSSIER, periodId: stScope.periodId, ...query });
const panel = (page: Page) => page.getByRole("complementary", { name: "Comptage et pièce" });
const tile = (page: Page, name: RegExp) => page.getByRole("button", { name });
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
test.beforeEach(() => { session.current = "preparer"; });

test("Stocks — 98 comptées contre 100 : case, pont inventaire → clôture, comptage puis pièce ; filtres ; compensation ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createStockHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const a = tile(page, /^REF-A lot L1, ENTREPOT-NORD — Écart de quantité, écart −2 unite/);
  await expect(a).toContainText("−2");
  await a.click();
  await expect(panel(page).getByRole("heading", { name: "REF-A · ENTREPOT-NORD · lot L1" })).toBeFocused();
  await expect(panel(page)).toContainText("98 unite");
  await expect(panel(page)).toContainText("100 unite");
  await expect(panel(page)).toContainText("−2 unite");
  await panel(page).getByRole("button", { name: /^C001 · FC-01/ }).click();
  await expect(panel(page)).toContainText("Pièce FC-01 — Fiche de comptage FC-01 (Entrepôt Nord), signée par deux compteurs");
  await expect(panel(page)).toContainText("st_count.csv");
  await page.keyboard.press("Escape");
  await expect(a).toBeFocused();
  // Filters by kind, site and lot keep the context in the URL.
  await page.getByRole("group", { name: "Filtrer par nature d’écart" }).getByRole("button", { name: /^Écart de quantité/ }).click();
  await expect(page.getByRole("list").filter({ has: page.getByRole("button", { name: /^REF-/ }) }).getByRole("button")).toHaveCount(4);
  await expect(page).toHaveURL(/kinds=quantity/);
  await page.getByRole("combobox", { name: "Lot" }).selectOption("L7");
  await expect(tile(page, /^REF-E lot L7, ENTREPOT-NORD/)).toBeVisible();
  await expect(tile(page, /^REF-E lot L7, ENTREPOT-SUD/)).toBeVisible();
  const net = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Brut" }) });
  await expect(net.getByRole("row", { name: /REF-E/ })).toContainText("Écarts compensés : le net masque 10 unite d’écarts");
  await page.getByRole("combobox", { name: "Lot" }).selectOption("");
  await page.getByRole("group", { name: "Filtrer par nature d’écart" }).getByRole("button", { name: /^Écart de quantité/ }).click();
  await axe(page);
  await capture(page, testInfo, "st-grid-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Tableau" }).click();
  await expect(page.getByRole("table", { name: /Quantités en unités de comptage/ }).getByRole("row", { name: /REF-D/ })).toContainText("45");
  await capture(page, testInfo, "st-table-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Cases" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await capture(page, testInfo, "st-grid-1024.png");
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, "st-grid-390.png");
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const again = tile(page, /^REF-A lot L1, ENTREPOT-NORD/);
  expect(await again.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await again.click();
  expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "st-reduced-motion-1440.png", false);
});

test("Stocks — roulement du 20/12, unité incompatible, propriété, stock tiers et site non visité : inconnus jamais nuls", async ({ page }, testInfo) => {
  const h = createStockHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ item: "REF-D|ENTREPOT-SUD|" }));
  const d = tile(page, /^REF-D, ENTREPOT-SUD — Sans écart de quantité, écart 0 unite/);
  await d.click();
  const bridge = panel(page).getByRole("figure");
  await expect(bridge).toContainText("Comptage du 20/12/2026");
  await expect(bridge).toContainText("+ Entrées jusqu’à la clôture");
  await expect(panel(page)).toContainText("hors période intercalaire");
  await panel(page).getByRole("button", { name: /^M001 · BR-1001/ }).click();
  await expect(panel(page)).toContainText("Pièce BR-1001 — Bon de réception REF-D");
  await capture(page, testInfo, "st-rollforward-1440.png");
  await tile(page, /^REF-B, ENTREPOT-NORD — Unité incompatible — bloqué/).click();
  await expect(panel(page)).toContainText("Aucune conversion n’est appliquée sans facteur documenté");
  await tile(page, /^REF-T, ENTREPOT-NORD — Hors stock propre/).click();
  await expect(panel(page)).toContainText("Stock détenu pour le compte de tiers");
  await tile(page, /^REF-F, ENTREPOT-NORD — Écart de propriété/).click();
  await expect(panel(page)).toContainText("Théorique : Consignation reçue · Compté : Stock propre");
  await page.getByRole("combobox", { name: "Site" }).selectOption("DEPOT-OUEST");
  await expect(page.getByText("Site non visité — aucune feuille de comptage")).toBeVisible();
  await tile(page, /^REF-W, DEPOT-OUEST — Site non visité/).click();
  await expect(panel(page)).toContainText("NEP 501 § 06");
  await axe(page);
  await capture(page, testInfo, "st-ownership-site-1440.png");
  await page.getByRole("tab", { name: /^Exceptions/ }).click();
  await expect(page.getByText(/Écarts compensés — REF-E — Total net 0 unite pour des écarts bruts de 10 unite/)).toBeVisible();
  await capture(page, testInfo, "st-exceptions-1440.png");
});

test("Stocks — préparation et revue dans l’interface : convention citée, gel, calcul, revue par une autre identité, verrouillage", async ({ page }, testInfo) => {
  const h = createStockHarness(); const sources = await h.importAll(); await h.create(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tab: "revue" }));
  await page.getByRole("radio", { name: /réputés antérieurs au comptage/ }).check();
  const citation = page.getByRole("combobox", { name: "Instructions d’inventaire citées (version figée)" });
  await citation.selectOption((await citation.locator("option", { hasText: /INSTR-INV/ }).getAttribute("value"))!);
  await page.getByRole("button", { name: "Figer les sources et la population" }).click();
  await expect(page.getByText("Sauvegardée — accusé serveur reçu")).toBeVisible();
  await page.getByRole("button", { name: "Calculer les quantités de clôture" }).click();
  await expect(page.getByRole("tab", { name: /^Exceptions/ })).toContainText("9");
  // Notes are resolved by the preparer through the server (cited piece), then the conclusion and submission go through the interface.
  let run = (await h.read()).body.runs[0];
  const fiche = sources.st_support!.rows.find(r => r.original.Piece === "FC-01")!;
  for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Recompté le 02/01 ; écart expliqué.", citation: { documentId: sources.st_support!.document.id, rowId: fiche.id } });
  await page.reload();
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByRole("textbox", { name: "Conclusion de la préparation" }).fill("Quantités rapprochées et expliquées ; aucune valeur établie ; présence physique non certifiée.");
  await page.getByRole("button", { name: "Enregistrer la conclusion" }).click();
  await expect(page.getByText("Sauvegardée — accusé serveur reçu")).toBeVisible();
  await page.getByRole("button", { name: "Soumettre à la revue" }).click();
  await expect(page.getByText("Revue attendue par une autre identité autorisée.")).toBeVisible();
  session.current = "reviewer";
  await page.reload();
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByRole("textbox", { name: "Décision motivée du réviseur" }).fill("Revue indépendante des quantités.");
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await page.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect(page.getByLabel("Contexte du dossier")).toContainText("verrouillée");
  await expect(page.getByText(/^Convention retenue :/).locator("..")).toContainText("réputés antérieurs au comptage");
  await axe(page);
  await capture(page, testInfo, "st-locked-1440.png");
});

test("Stocks — sous-lot 2 : écart potentiel −24,00 €, écart de prix, cadrage par compte et valeur sur bien non détenu ; captures 1440 / 390", async ({ page }, testInfo) => {
  const h = createStockHarness(1_801_000_000, { valued: true }); await h.executed(await h.importAll(["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"])); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const a = tile(page, /^REF-A lot L1, ENTREPOT-NORD — Écart de quantité/);
  await expect(a).toContainText("Écart potentiel −24,00 €");
  await expect(tile(page, /^REF-C, ENTREPOT-NORD/)).toContainText("Écart de prix +10,00 €");
  await a.click();
  const cost = panel(page);
  await expect(cost.getByText("Coût et valeur")).toBeVisible();
  await expect(cost).toContainText("12,00 € par unite · Coût moyen pondéré (PCG art. 213-34) · pièce FA-501");
  await expect(cost).toContainText("−24,00 € (écart potentiel)");
  const framing = page.getByRole("table", { name: /Cadrage par compte de stock/ });
  await expect(framing.getByRole("row", { name: /^321000/ })).toContainText("+10,00 €");
  await expect(framing.getByRole("row", { name: /^321000/ })).toContainText("Écart à expliquer");
  await expect(framing.getByRole("row", { name: /^371000/ })).toContainText("1 800,00 € hors propriété exclus");
  await expect(page.getByText(/Comptes de dépréciation au grand livre : 397000/)).toContainText("revue de valeur (sous-lot 3)");
  await expect(page.getByText(/Total net −24,00\s€ · écarts bruts 64,00\s€/)).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "st-valuation-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Tableau" }).click();
  await expect(page.getByRole("table", { name: /Quantités en unités de comptage/ }).getByRole("row", { name: /^REF-A/ })).toContainText("−24,00 €");
  await capture(page, testInfo, "st-valuation-table-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Cases" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "st-valuation-390.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: /^Exceptions/ }).click();
  await expect(page.getByText(/Valeur portée sur un bien non détenu — REF-F/)).toBeVisible();
  await expect(page.getByText(/Cadrage état valorisé ↔ grand livre — 321000/)).toBeVisible();
});

test("Stocks — sous-lot 3 : revue de valeur sur hypothèse citée, différence −25,00 €, rotation simple indice, cadrage des comptes 39 ; captures 1440 / 390", async ({ page }, testInfo) => {
  const h = createStockHarness(1_801_000_000, { valued: true }); await h.executed(await h.importAll(["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger", "st_value"])); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await expect(tile(page, /^REF-C, ENTREPOT-NORD/)).toContainText("Valeur à apprécier −25,00 €");
  await expect(tile(page, /^REF-E lot L7, ENTREPOT-NORD/)).toContainText("Dépréciation sans hypothèse");
  const review = page.getByRole("table", { name: /Revue de valeur par référence/ });
  const c = review.getByRole("row", { name: /REF-C · ENTREPOT-NORD/ });
  await expect(c).toContainText("5,50 €");
  await expect(c).toContainText("125,00 €");
  await expect(c).toContainText("150,00 €");
  await expect(c).toContainText("−25,00 €");
  await expect(c).toContainText("FV-901");
  const d = review.getByRole("row", { name: /REF-D · ENTREPOT-SUD/ });
  await expect(d).toContainText("355 j avant la clôture) — indice, aucun calcul");
  await expect(d).toContainText("0,00 €");
  await expect(page.getByText(/écart de cadrage −20,00\s€/)).toBeVisible();
  await expect(page.getByText(/l’outil ne propose ni ne comptabilise aucune dépréciation/).first()).toBeVisible();
  await c.getByRole("button", { name: /REF-C · ENTREPOT-NORD/ }).click();
  await expect(panel(page)).toContainText("Ventes de janvier 2027 à 6,00 € l’unité, remise de fin de série");
  await expect(panel(page)).toContainText("6,00 € − 0,50 € = 5,50 €");
  await axe(page);
  await capture(page, testInfo, "st-value-review-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "st-value-review-390.png");
});

test("Stocks — inventaire décalé sans mouvements puis feuille de comptage remplacée : non concluant, puis périmé", async ({ page }, testInfo) => {
  const h = createStockHarness(); await h.executed(await h.importAll(["st_count", "st_system", "st_support"])); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const d = tile(page, /^REF-D, ENTREPOT-SUD — Mouvements incomplets — non concluant/);
  await d.click();
  await expect(panel(page)).toContainText("aucun journal de mouvements intercalaires approuvé");
  await expect(panel(page).getByRole("figure")).toContainText("Inconnu");
  await capture(page, testInfo, "st-no-movements-1440.png");
  h.clock.now += 60;
  await h.accept(await h.preview("st_count", countCsv(COUNT_ROWS.map(r => r[0] === "C001" ? [...r.slice(0, 5), "100", ...r.slice(6)] : r))));
  await page.reload();
  await expect(page.getByText(/Travail périmé : une source/)).toBeVisible();
  await page.getByRole("tab", { name: /^Pièces/ }).click();
  await expect(page.getByText(/1\sversion remplacée conservée/)).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "st-replaced-1440.png");
});
