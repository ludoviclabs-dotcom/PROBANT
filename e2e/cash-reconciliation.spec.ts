import path from "node:path";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createCashHarness, CASH_DOSSIER, type CashHarness } from "../lib/workpapers/__tests__/cash-harness";
import { CASH_CSV, cashScope } from "../lib/workpapers/__tests__/cash-reconciliation-fixtures";

/**
 * Browser recipe of the Trésorerie sheet. Requests are routed to the real CashRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code, but this is not a persistence, OIDC or PostgreSQL recipe (see cash-durable.integration.test.ts).
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
async function serve(page: Page, h: CashHarness, session = "preparer") {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/cash**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/export") ? h.handlers.exportPOST : url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/tresorerie?" + new URLSearchParams({ dossierId: CASH_DOSSIER, periodId: cashScope.periodId, ...query });
const bridge = (page: Page) => page.getByRole("list", { name: /Pont de rapprochement/ });
const step = (page: Page, name: RegExp) => bridge(page).getByRole("button", { name });
const table = (page: Page) => page.getByRole("region", { name: "Suspens à la clôture — défilement clavier" });
async function noGlobalOverflow(page: Page, width: number) {
  const layout = await page.evaluate(() => {
    const outside = Array.from(document.querySelectorAll("main *")).filter(el => { const rect = el.getBoundingClientRect(); if (!rect.width || rect.right <= window.innerWidth + 1) return false; let p = el.parentElement; while (p) { if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false; p = p.parentElement; } return true; })
      .map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 60), right: Math.round(el.getBoundingClientRect().right) }));
    return { width: document.documentElement.scrollWidth, outside };
  });
  expect(layout.width, JSON.stringify(layout.outside)).toBeLessThanOrEqual(width);
}

test("Trésorerie — état nominal 90 + 15 − 5 = 100, suspens 5 ouvert ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createCashHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await expect(step(page, /Solde du relevé à la clôture : 90,00/)).toBeVisible();
  await expect(step(page, /Remises non créditées : \+15,00/)).toBeVisible();
  await expect(step(page, /Paiements non débités : −5,00/)).toBeVisible();
  await expect(step(page, /Solde comptable \(GL\) : 100,00/)).toBeVisible();
  await expect(step(page, /Écart du pont.*0,00/)).toContainText("aucun écart");
  await expect(table(page).getByRole("row", { name: /R1.*Apuré/ })).toBeVisible();
  await expect(table(page).getByRole("row", { name: /P1.*Ouvert/ })).toContainText("reste 5,00");
  await expect(page.getByText("Des totaux concordants ne donnent aucune assurance d’authenticité.", { exact: false }).first()).toBeVisible();
  await axe(page);
  await page.screenshot({ path: testInfo.outputPath("cash-nominal-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("cash-nominal-1024.png"), fullPage: true });
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("cash-nominal-390.png"), fullPage: true });
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await table(page).getByRole("row", { name: /P1/ }).click();
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  await expect(panel.getByRole("heading", { name: "Suspens P1 — Paiement non débité" })).toBeFocused();
  expect(await panel.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("cash-reduced-motion-1440.png"), fullPage: false });
});

test("Trésorerie — apurement partiel : 10 apurés sur 15, 5 restent à expliquer", async ({ page }, testInfo) => {
  const h = createCashHarness(); await h.executed({ partial: true }); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const r1 = table(page).getByRole("row", { name: /R1.*Partiellement apuré/ });
  await expect(r1).toContainText("10,00"); await expect(r1).toContainText("reste 5,00");
  await expect(r1).toContainText("Une partie seulement est retrouvée");
  await step(page, /Remises non créditées/).click();
  await expect(table(page).getByRole("row")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("cash-partial-1440.png"), fullPage: true });
  await page.getByRole("tab", { name: /Exceptions/ }).click();
  await expect(page.getByText("Suspens partiellement apuré", { exact: true })).toBeVisible();
  await axe(page);
  for (const tab of ["Population", "Pièces", "Revue"]) {
    await page.getByRole("tab", { name: new RegExp("^" + tab) }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await axe(page);
  }
  await page.getByRole("tab", { name: /^Population/ }).click();
  await expect(page.getByRole("table", { name: /Comptes du GL figé/ })).toContainText("Devise du compte non gérée (USD)");
  await page.screenshot({ path: testInfo.outputPath("cash-population-1440.png"), fullPage: true });
});

test("Trésorerie — clavier : pont → ligne → source → retour", async ({ page }, testInfo) => {
  const h = createCashHarness(); await h.executed(); await serve(page, h);
  await page.goto(sheet());
  const receipts = step(page, /Remises non créditées/);
  await receipts.focus(); await page.keyboard.press("Enter");
  const row = table(page).locator("tr[data-item=R1]");
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  await expect(panel.getByRole("heading", { name: "Suspens R1 — Remise non créditée" })).toBeFocused();
  await expect(panel.getByRole("region", { name: /Source du suspens \(ERB\) — cash_erb\.csv/ })).toContainText("ligne 4");
  await expect(panel.getByRole("region", { name: /Relevé postérieur — cash_settlements\.csv/ })).toContainText("ligne 2");
  await page.screenshot({ path: testInfo.outputPath("cash-keyboard-source-1440.png") });
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(receipts).toBeFocused();
});

test("Trésorerie — apurement documenté par le runtime : sauvegardé après accusé, puis exécuté", async ({ page }) => {
  const h = createCashHarness(); await h.frozenRun(); await serve(page, h);
  await page.goto(sheet());
  await expect(page.getByText(/Pont non calculé/)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le brouillon d’apurement" }).isDisabled();
  await page.getByLabel("Couverture").selectOption("documented");
  await page.getByRole("checkbox", { name: /cash_settlements\.csv/ }).check();
  await page.getByLabel("Note de documentation").fill("Relevés de janvier et février 2025 obtenus");
  await table(page).getByRole("row", { name: /R1/ }).click();
  const panel = page.getByRole("complementary", { name: "Détail et source" });
  await panel.getByLabel(/Règlement postérieur/).selectOption("S1");
  await panel.getByLabel(/Montant alloué/).fill("15,00");
  await panel.getByRole("button", { name: "Ajouter l’allocation au brouillon" }).click();
  await expect(table(page).getByText(/brouillon : allocation S1/)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le brouillon d’apurement" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await page.getByRole("button", { name: "Exécuter le pont" }).click();
  await expect(table(page).getByRole("row", { name: /R1.*Apuré/ })).toBeVisible();
  await expect(table(page).getByRole("row", { name: /P1.*Ouvert/ })).toBeVisible();
  await expect(step(page, /Écart du pont.*0,00/)).toBeVisible();
});

test("Trésorerie — refus lisibles : double allocation, mauvaise banque, devise, signe", async ({ page }) => {
  const h = createCashHarness();
  await h.frozenRun({ cash_erb: CASH_CSV.cash_erb + "\nR2;15.00;2024-12-30;BNK-A;FR76-0001;EUR;remise_non_creditee;Seconde remise;BRD-1231" });
  await serve(page, h);
  await page.goto(sheet());
  await page.getByLabel("Couverture").selectOption("documented");
  await page.getByRole("checkbox", { name: /cash_settlements\.csv/ }).check();
  for (const id of ["R1", "R2"]) {
    await table(page).getByRole("row", { name: new RegExp(id) }).click();
    const panel = page.getByRole("complementary", { name: "Détail et source" });
    await panel.getByLabel(/Règlement postérieur/).selectOption("S1"); await panel.getByLabel(/Montant alloué/).fill("15"); await panel.getByRole("button", { name: "Ajouter l’allocation au brouillon" }).click();
  }
  await page.getByRole("button", { name: "Enregistrer le brouillon d’apurement" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Double allocation");
  await expect(page.getByRole("status").filter({ hasText: "Échec de sauvegarde" })).toBeVisible();
  await page.getByRole("tab", { name: /Population/ }).click();
  await page.getByLabel("Type de pièce").selectOption("cash_statement");
  await page.getByLabel(/Fichier CSV ou XLSX/).setInputFiles({ name: "releve-usd.csv", mimeType: "text/csv", buffer: Buffer.from(CASH_CSV.cash_statement.replace("FR76-0001;EUR", "FR76-0001;USD")) });
  await page.getByRole("button", { name: "Analyser et conserver l’aperçu" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Devise non gérée");
  await expect(page.locator("main").getByRole("alert")).toContainText("ligne 2");
  await page.getByLabel("Type de pièce").selectOption("cash_erb");
  await page.getByLabel(/Fichier CSV ou XLSX/).setInputFiles({ name: "erb-signe.csv", mimeType: "text/csv", buffer: Buffer.from(CASH_CSV.cash_erb.replace("R1;15.00", "R1;-15.00")) });
  await page.getByRole("button", { name: "Analyser et conserver l’aperçu" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Signe incohérent");
  const wrongBank = createCashHarness(); const ids = await wrongBank.importAll({ cash_settlements: CASH_CSV.cash_settlements + "\nS9;20.00;2025-01-12;BNK-Z;FR76-0009;EUR;Virement autre banque;VIR-9" });
  await wrongBank.ok({ command: "create", period: { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-02-28", currency: "EUR", validation: "provisional" } });
  expect(Object.keys(ids)).toHaveLength(5);
  await page.unrouteAll({ behavior: "wait" }); await serve(page, wrongBank);
  await page.goto(sheet({ filter: "stale" }));
  await expect(page.locator("main").getByRole("alert").filter({ hasText: "Mauvaise banque" })).toContainText("BNK-Z / FR76-0009");
});

test("Synthèse Trésorerie — file de travail, lien exact vers la ligne et export diagnostic", async ({ page }) => {
  const h = createCashHarness(); const { run } = await h.executed({ partial: true }); await serve(page, h);
  await page.goto("/tresorerie/synthese?" + new URLSearchParams({ dossierId: CASH_DOSSIER, periodId: cashScope.periodId }));
  await expect(page.getByText("2 exception(s)", { exact: false })).toBeVisible();
  const link = page.getByRole("link", { name: "Suspens partiellement apuré" });
  await expect(link).toHaveAttribute("href", new RegExp("account=512100.*item=R1|item=R1.*account=512100"));
  await expect(link).toHaveAttribute("href", new RegExp("version=" + run.version));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML imprimable" }).first().click();
  const html = await readFile(await (await download).path(), "utf8");
  expect(html).toContain("Export diagnostic — ne constitue pas un paquet approuvé"); expect(html).toContain("aucune assurance d’authenticité"); expect(html).toContain("Partiellement apuré");
  await axe(page);
  await link.click();
  await expect(table(page).locator("tr[data-item=R1]")).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Détail et source" }).getByRole("heading", { name: "Suspens R1 — Remise non créditée" })).toBeVisible();
});
