import path from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createProvisionHarness, PV_DOSSIER, type ProvisionHarness } from "../lib/workpapers/__tests__/provision-harness";
import { pvScope } from "../lib/workpapers/__tests__/provision-fixtures";

/**
 * Browser recipe of the provisions and commitments register (Mission 16). Requests are routed to the real ProvisionRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code and the engine, but this is not a persistence, OIDC or PostgreSQL recipe (see provision-durable.integration.test.ts).
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
async function serve(page: Page, h: ProvisionHarness) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/provisions**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session.current, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/provisions?" + new URLSearchParams({ dossierId: PV_DOSSIER, periodId: pvScope.periodId, ...query });
const panel = (page: Page) => page.getByRole("complementary", { name: "Fiche d’événement" });
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

test("Provisions — estimation 80 contre provision 50 : case, fiche (scénarios, chronologie, pièces), pont animé et mise en évidence ; filtres ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createProvisionHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const strip = page.getByRole("region", { name: "Pont de provision de l’exercice" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Pont de provision de l’exercice" }) }));
  await expect(strip).toContainText("95,00");
  await expect(strip).toContainText("Clôture calculée = grand livre");
  const ev1 = tile(page, /^EV-01 Litige commercial n°1 — Différence à examiner, différence \+30,00\s€, confidentiel/);
  await expect(ev1).toContainText("+30,00");
  await ev1.click();
  await expect(panel(page).getByRole("heading", { name: "EV-01 · Litige commercial n°1" })).toBeFocused();
  await expect(panel(page)).toContainText("Client Alpha SAS (fictif)");
  await expect(panel(page).getByRole("img", { name: /Provision 50,00\s€, estimation retenue 80,00\s€, différence \+30,00\s€/ })).toBeVisible();
  await expect(panel(page)).toContainText("Central — hypothèse la plus probable : 80,00");
  await expect(panel(page)).toContainText("différence à examiner, ni anomalie validée ni correction proposée");
  await expect(panel(page)).toContainText("Lettre de l’avocat — litige Client Alpha");
  await expect(panel(page).getByRole("list").filter({ hasText: "Naissance de l’événement" })).toContainText("15/10/2025");
  await page.keyboard.press("Escape");
  await expect(ev1).toBeFocused();
  // The « − Reprises » case of the bridge highlights the events carrying an unused reversal.
  await page.getByRole("button", { name: /^− Reprises 15,00/ }).click();
  await expect(tile(page, /^EV-02 Garanties clients/)).toHaveAttribute("data-dim", "false");
  await expect(ev1).toHaveAttribute("data-dim", "true");
  await expect(page).toHaveURL(/focus=reprise/);
  await page.getByRole("button", { name: "Retirer la mise en évidence" }).click();
  await page.getByRole("combobox", { name: "État" }).selectOption("clos");
  await expect(tile(page, /^EV-04 Litige fournisseur Beta — Clos — provision soldée/)).toBeVisible();
  await expect(page).toHaveURL(/state=clos/);
  await page.getByRole("combobox", { name: "État" }).selectOption("");
  const noEntry = page.locator("section", { has: page.getByRole("heading", { name: "Engagements et passifs sans écriture" }) });
  await expect(noEntry.getByRole("button")).toHaveCount(2);
  await expect(noEntry).toContainText("200,00");
  await expect(noEntry).toContainText("absent — à examiner");
  await axe(page);
  await capture(page, testInfo, "pv-register-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Tableau" }).click();
  await expect(page.getByRole("table", { name: /différence = estimation retenue − provision/ }).getByRole("row", { name: /EV-01/ })).toContainText("+30,00");
  await capture(page, testInfo, "pv-table-1440.png");
  await page.getByRole("group", { name: "Présentation" }).getByRole("button", { name: "Cases" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await capture(page, testInfo, "pv-register-1024.png");
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, "pv-register-390.png");
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const again = tile(page, /^EV-01 Litige commercial n°1/);
  expect(await again.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await again.click();
  expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "pv-reduced-motion-1440.png", false);
});

test("Provisions — sans habilitation confidentielle : contenu retiré par le serveur, montants comptabilisés conservés, original confidentiel non proposé", async ({ page }, testInfo) => {
  const h = createProvisionHarness(); await h.executed(); await serve(page, h);
  session.current = "reviewer";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ item: "EV-01" }));
  await expect(page.getByText(/Lecture sans habilitation confidentielle/)).toBeVisible();
  await tile(page, /^EV-01 Litige commercial n°1/).click();
  await expect(panel(page)).toContainText("Masqué — habilitation confidentielle requise");
  await expect(panel(page)).toContainText("Clôture calculée");
  await expect(panel(page)).toContainText("50,00");
  await expect(panel(page)).toContainText("Libellé masqué selon vos droits");
  await expect(panel(page)).toContainText("Original réservé à une habilitation confidentielle");
  const text = await page.locator("main").innerText();
  for (const secret of ["Client Alpha", "assignation", "Issue défavorable", "80,00", "SYN-06"]) expect(text).not.toContain(secret);
  await expect(tile(page, /^EV-02 Garanties clients/)).toContainText("Provision 10,00");
  await axe(page);
  await capture(page, testInfo, "pv-masked-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "pv-masked-390.png");
});

test("Provisions — pont et cadrage par compte, tableau des provisions, exceptions (reprise sans justificatif, estimation absente, passif éventuel absent de l’annexe)", async ({ page }, testInfo) => {
  const h = createProvisionHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tab: "pont" }));
  const ledger = page.getByRole("table", { name: /Écart = grand livre − registre/ });
  await expect(ledger.getByRole("row", { name: /^1511/ })).toContainText("Cadré");
  await expect(ledger.getByRole("row", { name: /^1512/ })).toContainText("10,00");
  await expect(page.getByRole("row", { name: /Provisions pour risques \(151\)/ })).toContainText("60,00");
  await axe(page);
  await capture(page, testInfo, "pv-ledger-1440.png");
  await page.getByRole("tab", { name: /^Exceptions/ }).click();
  await expect(page.getByText(/^Reprise sans justificatif — EV-02 Garanties clients/)).toBeVisible();
  await expect(page.getByText(/^Estimation absente — EV-05/)).toBeVisible();
  await expect(page.getByText(/^Absent de l’annexe — EV-06/)).toBeVisible();
  await expect(page.getByText(/^Estimation documentée ≠ provision — EV-01/)).toContainText("différence +30,00");
  await capture(page, testInfo, "pv-exceptions-1440.png");
});

test("Provisions — préparation et revue dans l’interface : informations des avocats citées, gel, calcul, traitements cités, revue par une autre identité, verrouillage", async ({ page }, testInfo) => {
  const h = createProvisionHarness(); const sources = await h.importAll(); await h.create(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ tab: "revue" }));
  await page.getByRole("radio", { name: /Obtenues — citer la pièce figée/ }).check();
  const citation = page.getByRole("combobox", { name: "Pièce citée (version figée)" });
  await citation.selectOption((await citation.locator("option", { hasText: /LET-AVOCATS/ }).getAttribute("value"))!);
  await page.getByRole("button", { name: "Figer les sources et la population" }).click();
  await expect(page.getByText("Sauvegardée — accusé serveur reçu")).toBeVisible();
  await page.getByRole("button", { name: "Calculer les ponts et comparaisons" }).click();
  await expect(page.getByRole("tab", { name: /^Exceptions/ })).toContainText("4");
  let run = (await h.read()).body.runs[0];
  const comite = sources.pv_support!.rows.find(r => r.original.Piece === "PV-COMITE-12")!;
  for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Différence examinée avec la direction ; appréciation au procès-verbal.", citation: { documentId: sources.pv_support!.document.id, rowId: comite.id } });
  await page.reload();
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByRole("textbox", { name: "Conclusion de la préparation" }).fill("Différences examinées et documentées ; aucune issue juridique déduite.");
  await page.getByRole("button", { name: "Enregistrer la conclusion" }).click();
  await expect(page.getByText("Sauvegardée — accusé serveur reçu")).toBeVisible();
  await page.getByRole("button", { name: "Soumettre à la revue" }).click();
  await expect(page.getByText("Revue attendue par une autre identité autorisée.")).toBeVisible();
  session.current = "reviewer";
  await page.reload();
  await page.getByRole("tab", { name: /^Revue/ }).click();
  await page.getByRole("textbox", { name: "Décision motivée du réviseur" }).fill("Revue indépendante du registre.");
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await page.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect(page.getByLabel("Contexte du dossier")).toContainText("verrouillée");
  await expect(page.getByText(/^Déclaration retenue :/).locator("..")).toContainText("informations des avocats obtenues et citées");
  await axe(page);
  await capture(page, testInfo, "pv-locked-1440.png");
});
