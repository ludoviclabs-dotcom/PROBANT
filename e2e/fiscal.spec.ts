import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createFiscalHarness, FX_DOSSIER, type FiscalHarness } from "../lib/workpapers/__tests__/fiscal-harness";
import { CA3_T2_CORRECTED, CA3_T3, fxPeriod, fxScope, T2, T3 } from "../lib/workpapers/__tests__/fiscal-fixtures";

/**
 * Browser recipe of the fiscal sheets (Mission 13, VAT). Requests are routed to the real FiscalRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code and the TAX engines, but this is not a persistence, OIDC or PostgreSQL recipe (see fiscal-durable.integration.test.ts).
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
async function serve(page: Page, h: FiscalHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/fiscal**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session.current, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/export") ? h.handlers.exportPOST : url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/fiscal?" + new URLSearchParams({ dossierId: FX_DOSSIER, periodId: fxScope.periodId, ...query });
const panel = (page: Page) => page.getByRole("complementary", { name: "Détail et source" });
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

test("TVA T2 2026 — comptabilisé / déclaré / écart, pont explicatif, case 16 → écritures → pièce ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createFiscalHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tax: "vat", period: T2.startDate + "_" + T2.endDate }));
  const compare = page.getByRole("table", { name: /^TVA de la période 01\/04\/2026 → 30\/06\/2026/ });
  await expect(compare.getByRole("row", { name: /^TVA collectée/ })).toContainText("230,00");
  await expect(compare.getByRole("row", { name: /^TVA nette/ })).toContainText("120,00");
  await expect(compare.getByRole("row", { name: /^TVA nette/ })).toContainText("+100,00 EUR · écart");
  await expect(page.getByText("Résidu non expliqué :")).toContainText("0,00 EUR · aucun écart");
  await expect(page.getByRole("button", { name: "TVA · T2 2026" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "IS — sous-lot suivant" })).toHaveAttribute("aria-disabled", "true");
  // Declaration line → entries → piece.
  const box16 = page.getByRole("button", { name: /^Case 16/ });
  await box16.click();
  await expect(box16).toHaveAttribute("aria-expanded", "true");
  const entries = page.getByRole("list", { name: "Écritures liées à la case 16" });
  await expect(entries.getByRole("button")).toHaveCount(3);
  await expect(panel(page).getByRole("heading", { name: /Case 16/ })).toBeFocused();
  await entries.getByRole("button", { name: /VE VE2003/ }).click();
  await expect(panel(page).getByRole("heading", { name: /VE VE2003 — TVA collectée \(avoir\)/ })).toBeFocused();
  await expect(panel(page)).toContainText("AV-2003");
  await expect(panel(page)).toContainText("fx_invoices.csv · ligne 6");
  await expect(panel(page)).toContainText("constat, non approuvé comme taux légal");
  await page.keyboard.press("Escape");
  await expect(entries.getByRole("button", { name: /VE VE2003/ })).toBeFocused();
  // Observed rates show their origin; blocked rules list the source required.
  await expect(page.getByRole("table", { name: /Taux constatés par sens/ })).toContainText("Taux constaté sur 1 écriture(s) : TVA 445712 ÷ base 707000");
  await expect(page.getByRole("heading", { name: /Taux légaux de TVA : aucun barème publié dans le registre/ })).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "fx-vat-t2-1440.png");
  await page.setViewportSize({ width: 1024, height: 768 });
  await capture(page, testInfo, "fx-vat-t2-1024.png");
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, "fx-vat-t2-390.png");
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const box23 = page.getByRole("button", { name: /^Case 23/ });
  await box23.click();
  expect(await page.locator("#fx-line-23").evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
  expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "fx-vat-reduced-motion-1440.png", false);
});

test("TVA — source expirée (T3 2026) et profil inconnu : règles bloquées avec source requise, montants inconnus jamais nuls", async ({ page }, testInfo) => {
  const h = createFiscalHarness();
  const sources = await h.importAll(); await h.accept(await h.previewReturn(T3, CA3_T3));
  let t3 = await h.create(T3);
  t3 = await h.ok({ command: "freeze", id: t3.id, expectedVersion: t3.version, importIds: await h.expected(t3.id), draft: { ...(await h.draft(sources)), explanations: [] } });
  await h.ok({ command: "execute", id: t3.id, expectedVersion: t3.version });
  await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tax: "vat", period: T3.startDate + "_" + T3.endDate }));
  const rule = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Contrôles TVA bloqués : source non couverte sur la période/ }) });
  await expect(rule).toContainText("Code general des impots, article 269 (Legifrance) : version applicable à compter du 01/09/2026 non publiée dans le registre PROBANT");
  await expect(rule.getByRole("link", { name: "Code general des impots, article 269" })).toHaveAttribute("href", /legifrance\.gouv\.fr/);
  await rule.getByRole("button", { name: "Ouvrir le détail" }).click();
  await expect(panel(page)).toContainText("non couvert à partir du 01/09/2026");
  await expect(page.getByText(/Sources partiellement couvrantes \(rupture au 01\/09\/2026\)/)).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "fx-vat-source-expired-1440.png");
  // Profile unknown on T2: blocked engine, every amount unknown.
  const blocked = createFiscalHarness(); await blocked.executed(T2, { profile: { vatRegime: "unknown", vatGroupStatus: "unknown", siren: null, evidence: null } });
  await page.unrouteAll({ behavior: "wait" }); await serve(page, blocked);
  await page.goto(sheet({ tax: "vat", period: T2.startDate + "_" + T2.endDate }));
  await expect(page.getByText(/Moteur TVA bloqué : profil, millésime ou périmètre à compléter/)).toBeVisible();
  await expect(page.getByRole("table", { name: /^TVA de la période/ }).getByRole("row", { name: /^TVA collectée/ })).toContainText("Inconnu");
  await expect(page.getByRole("heading", { name: /^Profil fiscal à confirmer/ }).first()).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "fx-vat-profile-unknown-1440.png");
});

test("TVA — préparation et revue dans l’interface : profil cité, explication du pont, exécution, traitement cité, revue par une autre identité", async ({ page }, testInfo) => {
  const h = createFiscalHarness(); await h.importAll(); await h.create(T2); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tax: "vat", period: T2.startDate + "_" + T2.endDate, filter: "review" }));
  const prep = page.getByRole("region", { name: /^Préparation/ });
  await prep.getByRole("combobox", { name: "Régime de TVA" }).selectOption("real_normal");
  await prep.getByRole("combobox", { name: "Groupe TVA" }).selectOption("none");
  const evidence = prep.getByRole("combobox", { name: "Pièce confirmant le profil" });
  await evidence.selectOption((await evidence.locator("option", { hasText: /ATT-REGIME/ }).getAttribute("value"))!);
  await prep.getByLabel("Identifiant").fill("CREDIT-T1");
  await prep.getByLabel("Libellé").fill("Crédit du T1 reporté en case 22");
  await prep.getByLabel("Montant signé (EUR)").fill("-100,00");
  const cited = prep.getByRole("combobox", { name: "Pièce citée" });
  await cited.selectOption((await cited.locator("option", { hasText: /CA3-2026-04-01\.csv · case 22/ }).getAttribute("value"))!);
  await prep.getByRole("button", { name: "Ajouter l’explication au brouillon" }).click();
  await prep.getByRole("button", { name: "Figer les sources, la population et le profil" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await expect(prep).toContainText("confirmé par preparer-fx");
  await page.getByRole("button", { name: "Exécuter le moteur TVA" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await page.getByRole("tab", { name: /^Exceptions/ }).click();
  const note = page.locator("li[id^=fx-note-]", { hasText: "VAT.NET" });
  await note.getByLabel("Traitement documenté").fill("Écart de 100 = crédit du T1 reporté en case 22 (case 27 de la CA3 T1).");
  const noteCite = note.getByRole("combobox", { name: /^Pièce citée/ });
  await noteCite.selectOption((await noteCite.locator("option", { hasText: /CA3-2026-01-01\.csv · case 27/ }).getAttribute("value"))!);
  await note.getByRole("button", { name: "Enregistrer le traitement cité" }).click();
  await expect(note).toContainText("Traitement : Écart de 100");
  await expect(note).toContainText("CA3-2026-01-01.csv · version");
  await axe(page);
  await capture(page, testInfo, "fx-vat-cited-decision-1440.png");
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByLabel("Conclusion de la préparation").fill("TVA T2 rapprochée ; écart net expliqué par le crédit reporté cité ; aucune conformité déclarée.");
  await page.getByRole("button", { name: "Enregistrer la conclusion" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await page.getByRole("button", { name: "Soumettre à la revue" }).click();
  await expect(page.getByText("Revue attendue par une autre identité autorisée.")).toBeVisible();
  session.current = "reviewer";
  await page.reload();
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByLabel("Décision motivée du réviseur").fill("Revue indépendante : pont, citations et règles bloquées vérifiés.");
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await page.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect(page.getByRole("button", { name: "TVA · T2 2026" })).toContainText("verrouillée");
  await capture(page, testInfo, "fx-vat-locked-1440.png");
});

test("TVA — déclaration remplacée : feuille périmée, versions conservées ; Synthèse par impôt et période, export diagnostic sans feu vert", async ({ page }, testInfo) => {
  const h = createFiscalHarness(); const { run } = await h.executed();
  await h.accept(await h.previewReturn(T2, CA3_T2_CORRECTED));
  await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tax: "vat", period: T2.startDate + "_" + T2.endDate }));
  await expect(page.getByRole("alert").filter({ hasText: /^Travail périmé/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "TVA · T2 2026" })).toContainText("Périmée");
  await page.getByRole("tab", { name: /^Pièces/ }).click();
  await expect(page.getByText(/1\sversion remplacée conservée/)).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "fx-vat-replaced-1440.png");
  await page.goto("/fiscal/synthese?" + new URLSearchParams({ dossierId: FX_DOSSIER, periodId: fxScope.periodId }));
  const periods = page.getByRole("table", { name: /Une ligne par période déclarative TVA/ });
  await expect(periods.getByRole("row", { name: /TVA · T2 2026/ })).toContainText("Périmée");
  await expect(page.getByText("Aucune liquidation, aucune conformité déclarée").first()).toBeVisible();
  await expect(page.getByText(/Autres impôts, capacités séparées non couvertes/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML imprimable" }).first().click();
  const html = await readFile(await (await download).path(), "utf8");
  expect(html).toContain("Export diagnostic — ne constitue pas un paquet approuvé");
  expect(html).toContain("Versions remplacées (conservées)");
  expect(html).not.toMatch(/déclaration conforme|impôt définitif/i);
  await expect(page.getByRole("button", { name: "HTML imprimable" }).nth(1)).toBeDisabled();
  await axe(page);
  await capture(page, testInfo, "fx-synthesis-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "fx-synthesis-390.png");
  expect(run.state).toBe("executed");
  expect(fxPeriod.closingDate).toBe("2026-12-31");
});
