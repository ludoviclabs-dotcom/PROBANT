import path from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClosingHarness, CL_DOSSIER, CL_PERIOD_ID, lockedProvisionSource, type ClosingHarness } from "../lib/workpapers/__tests__/closing-harness";
import { buildRecipe } from "../lib/workpapers/__tests__/closing-fixtures";

/**
 * Browser recipe of the professional file (Mission 19). Requests are routed to the real ClosingRuntime and handlers over the in-memory TEST store,
 * which observes a real provisions sheet locked through its own chain: this is not a persistence, OIDC or PostgreSQL recipe (see closing-durable.integration.test.ts).
 */
test.describe.configure({ timeout: 120_000 });
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
async function serve(page: Page, h: ClosingHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/closing**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session.current, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/pieces") ? h.handlers.piecesPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const file = (query: Record<string, string> = {}) => "/dossier-cloture?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: CL_PERIOD_ID, ...query });
const panel = (page: Page) => page.getByRole("complementary");
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
async function recipe(page: Page) { const h = createClosingHarness({ cycles: [await lockedProvisionSource()] }); const pc = await buildRecipe(h); await serve(page, h); return { h, pc }; }
test.beforeEach(() => { session.current = "preparer"; });

test("Dossier — cycle verrouillé mais dossier incomplet : programme par risque et assertion, carte de couverture, fiche de traçabilité ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  await recipe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(file());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dossier professionnel — contrôle interne et clôture");
  await expect(page.getByText("Des feuilles de cycle sont verrouillées, mais le dossier n’est pas complet.")).toBeVisible();
  const ledger = page.getByRole("group", { name: /^Procédures conclues et revues : 2 sur 7/ });
  await expect(ledger.getByRole("button")).toHaveCount(7);
  await expect(page.getByText("Exclu : 1 procédure non applicable motivée exclue.").first()).toBeVisible();
  await expect(page.getByRole("group", { name: /^Feuilles de cycle verrouillées : 1 sur 1/ })).toBeVisible();
  const gap = page.getByRole("button", { name: "R-03 · Évaluation et imputation · solde : aucune procédure applicable" });
  await expect(gap).toHaveText("✕");
  await page.getByRole("button", { name: /^R-02 · Séparation des exercices · flux : procédure en cours/ }).click();
  await expect(page.getByRole("row", { name: /P-03 · Rapprochement mensuel/ })).toHaveAttribute("data-lit", "true");
  const p3 = page.getByRole("button", { name: "Ouvrir la fiche P-03 · Rapprochement mensuel bons de livraison / factures" });
  await p3.click();
  await expect(panel(page).getByRole("heading", { name: "P-03 · Rapprochement mensuel bons de livraison / factures" })).toBeFocused();
  await expect(panel(page)).toContainText("Test de fonctionnement — non documentée");
  await expect(panel(page)).toContainText("Contrôle décrit, non testé");
  await expect(panel(page)).toContainText("W-01 · réalisé le 08/01/2027");
  await expect(panel(page)).toContainText("Par preparer-cl · enregistré par le serveur le");
  await expect(panel(page)).toContainText("Procédure écrite — rapprochement BL / factures · v1");
  await expect(page).toHaveURL(/p=P-03/);
  await axe(page);
  await capture(page, testInfo, "cl-programme-1440.png");
  await page.keyboard.press("Escape");
  await expect(p3).toBeFocused();
  await page.getByRole("button", { name: "Ouvrir la fiche P-01 · Registre des provisions et engagements" }).click();
  await expect(panel(page)).toContainText("Feuille de cycle observée");
  await expect(panel(page)).toContainText("verrouillée");
  await expect(panel(page)).toContainText("Le dossier observe cette feuille ; il ne la recalcule pas");
  await capture(page, testInfo, "cl-cycle-locked-1440.png", false);
  await page.setViewportSize({ width: 1024, height: 768 });
  await noGlobalOverflow(page, 1024);
  await capture(page, testInfo, "cl-programme-1024.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "cl-programme-390.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(file({ p: "P-05" }));
  await expect(panel(page)).toContainText("Approuvée — Travail et conclusion revus.");
  expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "cl-reduced-motion-1440.png", false);
});

test("Dossier — file des pièces manquantes, anomalies corrigées / non corrigées, contradiction non résolue, clôture refusée au professionnel habilité", async ({ page }, testInfo) => {
  await recipe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(file({ tab: "pieces" }));
  const queue = page.getByRole("list").filter({ hasText: "Population absente" }).first();
  await expect(queue.getByRole("listitem")).toHaveCount(4);
  await expect(queue).toContainText("Échantillon de rapprochements mensuels pour le test de fonctionnement");
  await expect(queue).toContainText("Demandée à Contrôle de gestion");
  await expect(queue).toContainText("Éléments corroborant la déclaration de la direction");
  await axe(page);
  await capture(page, testInfo, "cl-pieces-1440.png");
  await page.getByRole("tab", { name: /^Anomalies et limites/ }).click();
  await expect(page.getByRole("list", { name: "Totaux des anomalies" })).toContainText("Non corrigées : 3 000,00");
  await expect(page.getByRole("list", { name: "Totaux des anomalies" })).toContainText("1 montant inconnu");
  await expect(page.getByRole("row", { name: /A-01/ })).toContainText("Corrigée");
  await expect(page.getByRole("row", { name: /A-03/ })).toContainText("Inconnu");
  await expect(page.getByRole("article", { name: "Contradiction C-01" })).toContainText("Non résolue");
  await axe(page);
  await capture(page, testInfo, "cl-anomalies-1440.png");
  session.current = "signer";
  await page.goto(file({ tab: "cloture" }));
  await expect(page.getByText("Validation impossible tant que des travaux restent ouverts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer la validation de clôture" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: /^Contradictions et incohérences/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Registre des risques et engagements/ })).toContainText("P-01");
  await axe(page);
  await capture(page, testInfo, "cl-cloture-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "cl-cloture-390.png");
});

test("Dossier — travail manuel documenté depuis la fiche (pièce déposée puis citée), refus serveur expliqué, journal « qui, quoi, quand »", async ({ page }, testInfo) => {
  await recipe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(file({ tab: "pieces" }));
  await page.getByLabel("Libellé").fill("Échantillon de 12 rapprochements mensuels");
  await page.getByLabel(/^Fichier/).setInputFiles({ name: "echantillon.csv", mimeType: "text/csv", buffer: Buffer.from("Mois;Rapprochement\n2026-01;OK\n") });
  await page.getByRole("button", { name: "Déposer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Pièces versionnées/ })).toContainText("PC-10 · Échantillon de 12 rapprochements mensuels");
  await page.goto(file({ p: "P-03" }));
  await panel(page).getByText("Enregistrer un travail").click();
  const form = panel(page).locator("form").filter({ hasText: "Ce qui a été fait" });
  await form.getByLabel("Étape").selectOption("test_fonctionnement");
  await form.getByLabel("Réalisé le").fill("2027-01-20");
  await form.getByLabel("Sur quoi").fill("12 rapprochements mensuels de l’exercice");
  await form.getByLabel("Ce qui a été fait").fill("Réexécution des rapprochements et contrôle des visas");
  await form.getByLabel("Éléments examinés").fill("12");
  await form.getByLabel(/^Pièces citées/).selectOption("PC-10-v1");
  await form.getByRole("button", { name: "Enregistrer le travail" }).click();
  await expect(panel(page)).toContainText("Test de fonctionnement — documentée");
  await panel(page).getByText("Conclure").click();
  const conclude = panel(page).locator("form").filter({ hasText: "Conclusion du préparateur" });
  await conclude.getByLabel("Portée").selectOption("fonctionnement");
  await conclude.getByLabel("Conclusion du préparateur").fill("Contrôle efficace sur la période testée.");
  await conclude.getByRole("button", { name: "Enregistrer la conclusion" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pièce encore attendue" })).toContainText("clôturez la demande");
  const refusal = panel(page).getByText(/^Refus du serveur : Pièce encore attendue pour cette procédure/);
  await refusal.scrollIntoViewIfNeeded();
  await capture(page, testInfo, "cl-refus-1440.png", false);
  await page.getByRole("tab", { name: /^Journal/ }).click();
  await expect(page.getByRole("list").filter({ hasText: "W-06 · Test de fonctionnement réalisé le 2027-01-20" })).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "cl-journal-1440.png");
});
