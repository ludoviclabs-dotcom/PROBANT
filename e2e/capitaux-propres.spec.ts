import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createEquityHarness, EQ_DOSSIER, type EquityHarness } from "../lib/workpapers/__tests__/capitaux-harness";
import { EQ_CSV, eqPeriod, eqScope } from "../lib/workpapers/__tests__/capitaux-fixtures";

/**
 * Browser recipe of the Capitaux propres sheet. Requests are routed to the real EquityRuntime and handlers over the in-memory TEST store:
 * mutations go through the server code, but this is not a persistence, OIDC or PostgreSQL recipe (see equity-durable.integration.test.ts).
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
async function serve(page: Page, h: EquityHarness, session = "preparer") {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/capitaux-propres**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": session, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const handler = url.pathname.endsWith("/export") ? h.handlers.exportPOST : url.pathname.endsWith("/imports") ? h.handlers.importsPOST : req.method() === "POST" ? h.handlers.POST : h.handlers.GET;
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const sheet = (query: Record<string, string> = {}) => "/capitaux-propres?" + new URLSearchParams({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId, ...query });
const variation = (page: Page) => page.getByRole("table", { name: /^Tableau reconstitué|^Tableau fourni|^Écart fourni/ });
const panel = (page: Page) => page.getByRole("complementary", { name: "Détail et source" });
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

test("Capitaux propres — distribution votée 30, comptabilisée 25, payée 25 ; panneau PV à la page citée ; captures 1440 / 1024 / 390 et réduction des animations", async ({ page }, testInfo) => {
  const h = createEquityHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await expect(variation(page)).toBeVisible();
  const total = variation(page).getByRole("row", { name: /^Total des capitaux propres/ });
  await expect(total).toContainText("301,00"); await expect(total).toContainText("361,00");
  await expect(page.getByText(/effet sur le total 0,00/)).toBeVisible();
  await variation(page).getByRole("button", { name: "Résultat de l’exercice" }).click();
  await expect(page.getByRole("region", { name: "Mouvements de Résultat de l’exercice" }).getByRole("button")).toHaveCount(3);
  await page.getByRole("region", { name: /^Montant divergent \d/ }).getByRole("button", { name: /D1-DIV/ }).click();
  await expect(panel(page).getByRole("heading", { name: /AGO-2024 · D1-DIV — Dividende voté/ })).toBeFocused();
  const measures = panel(page).getByRole("group", { name: "Décision, comptabilisation et paiement" });
  await expect(measures).toContainText("−30,00"); await expect(measures).toContainText("−25,00"); await expect(measures).toContainText("25,00");
  const pv = panel(page).getByRole("region", { name: "Procès-verbal à la page citée" });
  await pv.getByRole("button", { name: "Afficher la page 3 du PV" }).click();
  await expect(pv.getByRole("img", { name: /PV de l’assemblée générale ordinaire du 30 mai 2024 — page 3/ })).toBeVisible();
  await pv.getByText("Texte de la page (couche texte du PDF, non interprétée)").click();
  await expect(pv).toContainText("Troisième résolution : dividende de 30,00");
  await pv.getByRole("button", { name: "Agrandir la page" }).click();
  await expect(pv.getByRole("button", { name: "Agrandir la page" })).toHaveAttribute("aria-pressed", "true");
  await pv.screenshot({ path: testInfo.outputPath("eq-pv-zoom.png") });
  if (process.env.PROBANT_CAPTURES_DIR) await pv.screenshot({ path: path.join(process.env.PROBANT_CAPTURES_DIR, "eq-pv-zoom-1440.png") });
  await pv.getByRole("button", { name: "Agrandir la page" }).click();
  await expect(page.getByText("Aucun rapport ne vaut conclusion juridique", { exact: true })).toBeVisible();
  await axe(page);
  await capture(page, testInfo, "eq-decision-pv-1440.png");
  await page.setViewportSize({ width: 1024, height: 768 });
  await capture(page, testInfo, "eq-decision-pv-1024.png");
  await noGlobalOverflow(page, 1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, "eq-decision-pv-390.png");
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await variation(page).getByRole("button", { name: "Autres réserves" }).click();
  const expansion = page.locator("#eq-expansion-autres_reserves > td > div");
  expect(await expansion.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.getByRole("region", { name: "Mouvements de Autres réserves" }).getByRole("button", { name: /E09/ }).click();
  const highlighted = page.getByRole("region", { name: "Mouvements de Autres réserves" }).getByRole("button", { name: /E09/ });
  await expect(highlighted).toHaveAttribute("aria-current", "true");
  expect(await highlighted.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await capture(page, testInfo, "eq-reduced-motion-movement-1440.png", false);
});

test("Capitaux propres — écriture sans décision, décision sans écriture, effet hors période, PV absent ; frise et tableau fourni", async ({ page }, testInfo) => {
  const h = createEquityHarness(); await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ item: "M:E09", component: "autres_reserves" }));
  await expect(page.getByRole("region", { name: "Mouvements de Autres réserves" }).getByRole("button", { name: /E09/ })).toHaveAttribute("aria-current", "true");
  await expect(panel(page)).toContainText("Sans décision — Nature appelant une décision");
  await expect(page.getByRole("region", { name: /^Décision sans écriture \d/ })).toContainText("D4-DIV");
  const timeline = page.getByRole("group", { name: "Frise des décisions" });
  await expect(timeline.getByRole("button")).toHaveCount(4);
  await timeline.getByRole("button", { name: /AGE-2024-12/ }).click();
  await expect(panel(page)).toContainText("PV absent : la pièce « PV-AGE-2024-12 » n’est pas fournie");
  await expect(panel(page)).toContainText("Effet postérieur à la clôture");
  await expect(page.getByRole("table", { name: /Une ligne par ligne de décision/ }).getByRole("row", { name: /D3-CAP/ })).toContainText("Effet hors période");
  await axe(page);
  await capture(page, testInfo, "eq-timeline-lists-1440.png");
  await page.getByRole("radio", { name: "Écarts fourni − reconstitué" }).click();
  const resultat = variation(page).getByRole("row", { name: /^Résultat de l’exercice/ });
  await expect(resultat.getByText(/^−5,00\sEUR$/)).toHaveCount(2);
  await capture(page, testInfo, "eq-statement-differences-1440.png", false);
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await capture(page, testInfo, "eq-timeline-lists-390.png");
});

test("Capitaux propres — lecture du PV avant exécution, puis exécution ; décision humaine citant la pièce et la version", async ({ page }, testInfo) => {
  const h = createEquityHarness(); await h.frozenRun(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet({ item: "D:D1-DIV" }));
  const pv = panel(page).getByRole("region", { name: "Procès-verbal à la page citée" });
  await pv.getByLabel(/Ce que vous avez vérifié à la page 3/).fill("Résolution 3 relue : dividende de 30,00.");
  await pv.getByRole("button", { name: "Valider la lecture — cite PV-AGO-2024 · page 3" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  await expect(pv).toContainText("Lecture validée par preparer-eq");
  await page.getByRole("button", { name: "Exécuter la revue des capitaux propres" }).click();
  await expect(variation(page)).toBeVisible();
  await expect(page.getByRole("region", { name: /^Montant divergent \d/ })).toContainText("D1-DIV");
  await page.getByRole("tab", { name: /^Exceptions/ }).click();
  await page.getByLabel("Traitement ou commentaire").fill("Distribution de 30 votée ; 25 comptabilisés et payés ; 5 à comptabiliser en dettes envers les associés.");
  const cited = page.getByRole("combobox", { name: /^Pièce citée/ });
  await cited.selectOption((await cited.locator("option", { hasText: /^PV-AGO-2024/ }).getAttribute("value"))!);
  await page.getByLabel(/Page \(1 à 3\)/).fill("3");
  const note = page.locator("li[id^=eq-note-]", { hasText: "Montant divergent entre décision et comptabilisation" });
  await note.getByRole("button", { name: "Documenter le traitement avec le texte et la pièce citée" }).click();
  await expect(note).toContainText("Pièce citée : PV-AGO-2024 · PV-AGO-2024.pdf · version");
  await expect(note).toContainText("page 3");
  await axe(page);
  await capture(page, testInfo, "eq-cited-decision-1440.png");
});

test("Capitaux propres — capital et réserves incomplets : composantes inconnues, total et rapports non calculés ; source manquante bloquante", async ({ page }, testInfo) => {
  const h = createEquityHarness();
  await h.executed({ eq_balances: EQ_CSV.eq_balances.split("\n").filter(l => !/^B11;|^B03;|^B13;/.test(l)).join("\n") });
  await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  await expect(variation(page).getByRole("row", { name: /^Capital/ }).first()).toContainText("Inconnu");
  await expect(variation(page).getByRole("row", { name: /^Total des capitaux propres/ })).toContainText("Inconnu");
  await expect(page.getByText("Total non calculé : au moins une composante est incomplète.")).toBeVisible();
  await expect(page.getByText("Cartographie ou sources incomplètes").first()).toBeVisible();
  await capture(page, testInfo, "eq-incomplete-1440.png");
  const empty = createEquityHarness(); await empty.importAll({}, ["eq_balances", "eq_decisions"], []); await empty.ok({ command: "create", period: eqPeriod });
  await page.unrouteAll({ behavior: "wait" }); await serve(page, empty);
  await page.goto(sheet({ filter: "stale" }));
  await expect(page.getByText("Source manquante bloquante : balance d’ouverture et de clôture et écritures de l’exercice approuvées requises avant de figer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Figer les sources courantes" })).toBeDisabled();
  await axe(page);
  await capture(page, testInfo, "eq-blocked-source-1440.png");
});

test("Synthèse Capitaux propres — aucune conclusion juridique, lien exact vers la décision et export diagnostic", async ({ page }, testInfo) => {
  const h = createEquityHarness(); const { run } = await h.executed(); await serve(page, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/capitaux-propres/synthese?" + new URLSearchParams({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId }));
  await expect(page.getByText("7 exception(s)", { exact: false })).toBeVisible();
  await expect(page.getByText("Aucune conclusion juridique").first()).toBeVisible();
  const link = page.getByRole("link", { name: "Montant divergent entre décision et comptabilisation" });
  await expect(link).toHaveAttribute("href", /item=D%3AD1-DIV/); await expect(link).toHaveAttribute("href", new RegExp("version=" + run.version));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML imprimable" }).first().click();
  const html = await readFile(await (await download).path(), "utf8");
  expect(html).toContain("Export diagnostic — ne constitue pas un paquet approuvé"); expect(html).toContain("Aucune règle juridique n’est implémentée"); expect(html).toContain("5.00 EUR");
  await axe(page);
  await capture(page, testInfo, "eq-synthesis-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await noGlobalOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await link.click();
  await expect(panel(page).getByRole("heading", { name: /D1-DIV/ })).toBeVisible();
  for (const tab of ["Population", "Exceptions", "Pièces", "Revue"]) {
    await page.getByRole("tab", { name: new RegExp("^" + tab) }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await axe(page);
  }
  await capture(page, testInfo, "eq-population-1440.png");
});
