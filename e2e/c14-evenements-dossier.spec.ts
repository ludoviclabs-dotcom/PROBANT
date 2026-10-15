import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildPayablesMission } from "../lib/workpapers/payables-mission";
import { CL_DOSSIER, type ClosingHarness } from "../lib/workpapers/__tests__/closing-harness";
import { dossierMap, eventsHarness, eventsProgramme, EV_PERIOD_ID, evScope } from "../lib/workpapers/__tests__/closing-events-fixtures";

/**
 * C14 suite — effets des événements transversaux versés dans le dossier de clôture. Les requêtes du dossier passent par le vrai
 * ClosingRuntime (magasin mémoire de TEST) ; sa carte est construite par le vrai moteur C11 sur la recette docs/recette/c11/RECETTE.md,
 * et la page /cutoff reçoit la même carte. Ce n'est ni une recette PostgreSQL ni une recette OIDC. États réels à 1440, 1024 et 390 px.
 */
test.describe.configure({ timeout: 120_000 });
const CAPTURES = path.join(process.cwd(), "docs", "probant-lots", "c14-evenements-captures");
// Attendu posé à la main (recette C11 : 4 effets, 7 observations porteuses, 11 événements ; cas 8 sans effet).
const SENTENCE = "4 effets d’événements transversaux comptés une fois (7 observations avec candidat, 11 événements) · étape C05 : 4 en attente, 0 apprécié(s) non corrigé(s), 0 corrigé(s) · 1 candidat sans effet compté — catégorie distincte des anomalies journalisées";

async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
async function noGlobalOverflow(page: Page, width: number) {
  const layout = await page.evaluate(() => {
    const outside = Array.from(document.querySelectorAll("main *")).filter(el => { const rect = el.getBoundingClientRect(); if (!rect.width || rect.right <= window.innerWidth + 1) return false; let p = el.parentElement; while (p) { if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false; p = p.parentElement; } return true; })
      .map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 60), right: Math.round(el.getBoundingClientRect().right) }));
    return { width: document.documentElement.scrollWidth, outside };
  });
  expect(layout.width, JSON.stringify(layout.outside)).toBeLessThanOrEqual(width);
}
const session = { current: "preparer" };
async function serve(page: Page, h: ClosingHarness, map: ReturnType<typeof dossierMap>) {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  // Every dossier request (reads and decisions) goes to the real ClosingRuntime of the harness, under the session chosen by the test.
  await page.route("**/api/workpapers/closing**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers(), posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const headers: Record<string, string> = { "x-test-session": session.current, ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const request = new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined });
    const response = await (req.method() === "POST" ? h.handlers.POST : h.handlers.GET)(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  // La carte C11 de /cutoff : la même que celle que lit le dossier (operation=events).
  await page.route("**/api/workpapers/payables?**", r => new URL(r.request().url()).searchParams.get("operation") === "events"
    ? r.fulfill({ json: { actorId: "real-preparer", map, reason: null } }) : r.fulfill({ json: { actorId: "real-preparer", permissions: ["read"], mission: buildPayablesMission(evScope, [], [], []) } }));
}
const text = async (page: Page, testId: string) => (await page.getByTestId(testId).innerText()).replace(/\s+/g, " ").trim();

test.beforeEach(() => { session.current = "preparer"; });
for (const width of [1440, 1024, 390]) {
  test(`C14 suite à ${width} px — effets des événements dans le bandeau, la carte de couverture, la synthèse et l’export ; même carte sur /cutoff`, async ({ page }) => {
    const map = dossierMap(), h = eventsHarness(map);
    await eventsProgramme(h);
    await serve(page, h, map);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: EV_PERIOD_ID }));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dossier professionnel — contrôle interne et clôture");
    // Bandeau et carte de couverture : la même phrase, établie par le serveur.
    expect(await text(page, "cockpit-events")).toBe(SENTENCE);
    expect(await text(page, "matrix-events")).toBe(SENTENCE);
    await noGlobalOverflow(page, width);
    await page.getByRole("tab", { name: /^Synthèse des travaux/ }).click();
    const section = page.getByRole("region", { name: /^Effets des événements transversaux/ });
    await expect(section).toBeVisible();
    expect(await text(page, "synthesis-events")).toBe(SENTENCE);
    const effects = section.getByRole("region", { name: "Effets des événements : compté une fois, étape et feuilles sources" });
    await expect(effects.locator("tbody tr")).toHaveCount(4);
    // Dès 1024 px, toutes les colonnes tiennent (feuilles sources comprises) ; en dessous, le tableau défile dans sa région focalisable.
    if (width >= 1024) expect(await effects.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const f102 = effects.locator('tr[data-event="F-102"]');
    await expect(f102).toContainText("2 000,00");
    await expect(f102).toContainText("baisse du résultat · 2 observation(s)");
    await expect(f102).toContainText("En attente — correction ou appréciation à documenter");
    await expect(f102).toContainText("Recherche de passifs non enregistrés · RUN-RPNE r1 v1 — candidat compté dans l’effet · version courante de la lignée · Retenue au programme par P-02");
    await expect(f102).toContainText("Ventes, encaissements et avoirs · RUN-CLI r1 v1 — solde ouvert observé · version courante de la lignée · Hors programme");
    await expect(section.getByRole("list", { name: "Pont C05 des effets par poste et sens" })).toContainText("Résultat · baisse — en attente 3 500,00");
    await expect(section.getByRole("list", { name: "Pont C05 des effets par poste et sens" })).toContainText("Résultat · hausse — en attente 1 000,00");
    // Cas 8 : sans effet compté, montant inconnu, jamais zéro.
    const fs203 = section.locator('li[data-event="FS-203"]');
    await expect(fs203).toContainText("Non concluant");
    await expect(fs203).toContainText("montant inconnu, aucun effet compté");
    await expect(fs203).toContainText("candidat · version courante de la lignée · Retenue au programme par P-01 · montant observé 400,00 € HT, non compté");
    // À côté des anomalies journalisées, sans total commun.
    await expect(page.getByRole("heading", { name: /^Corrections, preuves nouvelles et anomalies résiduelles/ })).toBeVisible();
    await noGlobalOverflow(page, width);
    // Export : le lien nomme la projection lue ; le JSON et le HTML portent les mêmes dénominateurs.
    const href = await page.getByRole("link", { name: "JSON canonique" }).getAttribute("href");
    const exported = await page.evaluate(async url => (await fetch(url!)).json(), href);
    expect(exported.projection.denominators.events).toMatchObject({ status: "lue", events: 11, observations: 19, candidateObservations: 7, countedEffects: 4, withoutEffect: 1, byStage: { pending: 4, corrected: 0 } });
    const html = await page.evaluate(async url => (await fetch(url!)).text(), href!.replace("format=json", "format=html"));
    expect(html).toContain(SENTENCE);
    if (width === 1440) { await page.setViewportSize({ width, height: 6000 }); await axe(page); }
    await page.setViewportSize({ width, height: width === 390 ? 3400 : 1800 });
    await section.screenshot({ path: path.join(CAPTURES, `c14-evenements-synthese-${width}.jpg`), type: "jpeg", quality: 80 });
    // La carte C11 elle-même affiche les mêmes nombres.
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/cutoff?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: EV_PERIOD_ID }));
    await expect(page.getByRole("heading", { name: "Carte des événements transversaux" })).toBeVisible();
    const bridge = page.locator("[data-bridge]");
    await expect(bridge).toContainText("11 événements");
    await expect(bridge).toContainText("7 observations avec candidat");
    await expect(bridge).toContainText("4 effets comptés une fois");
  });
}

// Attendus posés à la main : F-101 corrigé 600,00 sur 1 000,00 (résiduel 400,00) ; FS-202 apprécié non corrigé ; restent F-102 et AV-106 en attente.
const AFTER = "4 effets d’événements transversaux comptés une fois (7 observations avec candidat, 11 événements) · étape C05 : 2 en attente, 1 apprécié(s) non corrigé(s), 1 corrigé(s) · 1 candidat sans effet compté — catégorie distincte des anomalies journalisées";
for (const width of [1440, 1024, 390]) {
  test(`C14 suite à ${width} px — décisions de revue d’un effet depuis l’onglet Anomalies : correction partielle par le préparateur, appréciation par le relecteur`, async ({ page }) => {
    const map = dossierMap(), h = eventsHarness(map);
    await eventsProgramme(h);
    const pc = await h.piece("Écriture FAE F-101 passée au 31/03/2026");
    await serve(page, h, map);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: CL_DOSSIER, periodId: EV_PERIOD_ID }));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dossier professionnel — contrôle interne et clôture");
    await page.getByRole("tab", { name: /^Anomalies et limites/ }).click();
    const region = page.getByRole("region", { name: "Effets des événements à traiter : étape, décision et feuilles sources" });
    await expect(region.locator("tbody tr")).toHaveCount(4);
    if (width >= 1024) expect(await region.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await noGlobalOverflow(page, width);
    // Préparateur : correction partielle de F-101 citant une pièce du dossier.
    const f101 = region.locator('tr[data-event="F-101"]');
    await f101.getByText("Documenter la correction").click();
    await f101.getByLabel("Correction (écriture passée par l’entité, référence)").fill("Écriture FAE passée le 15/04/2026, pour 600,00 seulement");
    await f101.getByLabel(/^Montant corrigé si partiel/).fill("600.00");
    await f101.getByLabel("Pièces du dossier qui établissent la correction").selectOption(pc);
    await f101.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(f101).toContainText("Corrigé partiellement — reste résiduel");
    await expect(f101).toContainText("Résiduel 400,00");
    await expect(f101).toContainText("Correction partielle 600,00 € — s’applique");
    // Relecteur : appréciation de FS-202, non corrigé.
    session.current = "reviewer";
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dossier professionnel — contrôle interne et clôture");
    await page.getByRole("tab", { name: /^Anomalies et limites/ }).click();
    const fs202 = page.getByRole("region", { name: "Effets des événements à traiter : étape, décision et feuilles sources" }).locator('tr[data-event="FS-202"]');
    await fs202.getByText("Apprécier l’effet non corrigé").click();
    await fs202.getByLabel("Appréciation (humaine, sans opinion générée)").fill("FNP 1 000,00 non comptabilisée : effet non corrigé, apprécié au regard du résultat");
    await fs202.getByRole("button", { name: "Enregistrer l’appréciation" }).click();
    await expect(fs202).toContainText("Non corrigé — apprécié (anomalie résiduelle)");
    await expect(fs202).toContainText("Apprécié non corrigé 1 000,00");
    // Mêmes dénominateurs dans le bandeau, l'onglet, la carte de couverture, la synthèse et l'export.
    expect(await text(page, "cockpit-events")).toBe(AFTER);
    expect(await text(page, "anomalies-events")).toBe(AFTER);
    await page.getByRole("tab", { name: /^Programme/ }).click();
    expect(await text(page, "matrix-events")).toBe(AFTER);
    await page.getByRole("tab", { name: /^Synthèse des travaux/ }).click();
    expect(await text(page, "synthesis-events")).toBe(AFTER);
    await expect(page.getByRole("list", { name: "Pont C05 des effets par poste et sens" })).toContainText("Résultat · hausse — en attente 0,00 € · apprécié non corrigé 0,00 € · corrigé 600,00 € · résiduel 400,00 €");
    const href = await page.getByRole("link", { name: "JSON canonique" }).getAttribute("href");
    const exported = await page.evaluate(async url => (await fetch(url!)).json(), href);
    expect(exported.projection.denominators.events).toMatchObject({ byStage: { pending: 2, proposed: 1, corrected: 1 }, decided: 2, toReexamine: 0 });
    await page.getByRole("tab", { name: /^Anomalies et limites/ }).click();
    await noGlobalOverflow(page, width);
    if (width === 1440) { await page.setViewportSize({ width, height: 7000 }); await axe(page); }
    await page.setViewportSize({ width, height: width === 390 ? 3600 : 2000 });
    await page.getByRole("region", { name: /^Effets des événements transversaux/ }).screenshot({ path: path.join(CAPTURES, `c14-evenements-decisions-${width}.jpg`), type: "jpeg", quality: 80 });
  });
}
