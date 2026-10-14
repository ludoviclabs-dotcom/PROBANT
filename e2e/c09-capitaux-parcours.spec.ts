import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { WorkpaperRun } from "../lib/workpapers/model";
import type { EquityResult } from "../lib/workpapers/capitaux-review";
import { parcoursHandler, type ParcoursRuntimes } from "../lib/workpapers/capitaux-parcours-http";
import { asCapitauxRule100, c09CapitauxRun, c09LegacyRun, c09Scope } from "../lib/workpapers/__tests__/capitaux-c09-fixtures";
import { createEquityHarness, EQ_DOSSIER, type EquityHarness } from "../lib/workpapers/__tests__/capitaux-harness";
import { eqDraft, eqScope } from "../lib/workpapers/__tests__/capitaux-fixtures";

/**
 * C09 — parcours Capitaux propres unique, recette navigateur. La route du parcours est servie par le vrai gestionnaire
 * (capitaux-parcours-http) sur les feuilles C09 exécutées par les deux moteurs ; la feuille /capitaux-propres l’est par
 * son runtime réel sur le magasin mémoire de TEST (ni persistance ni PostgreSQL). Attendus : docs/recette/c09/RECETTE.md.
 */
const OUT = process.env.C09_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c09-captures");
const WIDTHS = [1440, 1024, 390] as const;

async function session(page: Page) { await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } })); }
async function serveParcours(page: Page, options: { legacy?: boolean } = {}) {
  const cap = await c09CapitauxRun(), leg = await c09LegacyRun();
  const read = (run: WorkpaperRun, imports?: unknown) => async () => ({ runs: [run], sourcesCurrent: { [run.id]: true }, lineageCurrent: { [run.rootId]: { id: run.id, version: run.version, revision: run.revision } }, currentVersions: { [run.id]: run.version }, ...(imports ? { imports } : {}) });
  const runtimes: ParcoursRuntimes = { env: { PROBANT_CAPITAUX_DURABLE: "disposable", PROBANT_EQUITY_DURABLE: options.legacy === false ? "" : "disposable" },
    capitaux: () => ({ read: read(cap.run) }) as never, equity: () => ({ equityRead: read(leg.run, leg.imports) }) as never };
  const handler = parcoursHandler(runtimes);
  await session(page);
  await page.route("**/api/workpapers/capitaux-propres/parcours**", async route => {
    const url = new URL(route.request().url()), response = await handler(new Request("https://probant.test" + url.pathname + url.search));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
async function serveSheet(page: Page, h: EquityHarness) {
  await session(page);
  await page.route("**/api/workpapers/capitaux-propres?**", async route => {
    const req = route.request(), url = new URL(req.url()), sent = req.headers();
    const headers: Record<string, string> = { "x-test-session": "preparer", ...(sent["idempotency-key"] ? { "Idempotency-Key": sent["idempotency-key"] } : {}), ...(sent["content-type"] ? { "Content-Type": sent["content-type"] } : {}) };
    const posted = req.method() === "POST" ? req.postDataBuffer() : null;
    const response = await (req.method() === "POST" ? h.handlers.POST : h.handlers.GET)(new Request("https://probant.test" + url.pathname + url.search, { method: req.method(), headers, body: posted ? new Uint8Array(posted) : undefined }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}
const parcours = () => "/capitaux-propres/parcours?" + new URLSearchParams({ dossierId: c09Scope.dossierId, periodId: c09Scope.periodId });
const sheet = () => "/capitaux-propres?" + new URLSearchParams({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId });
const decisions = (page: Page) => page.getByRole("table", { name: /^Une ligne par décision économique/ });
const detail = (page: Page) => page.getByRole("complementary", { name: /^Décision du|^Détail d’une décision/ });
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
async function shot(page: Page, locator: Locator, name: string) {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 3600 });
  await locator.scrollIntoViewIfNeeded();
  await mkdir(OUT, { recursive: true });
  await locator.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 75 });
  await page.setViewportSize(viewport);
}

for (const width of WIDTHS) {
  test.describe(`C09 à ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("parcours unique : même PV compté une fois, dividende voté non payé, pièce absente à rapprocher, amendement, instrument incertain", async ({ page }) => {
      await serveParcours(page);
      await page.goto(parcours());
      await expect(page.getByRole("heading", { level: 1, name: "Capitaux propres — décisions, effets, comptabilisation, paiement" })).toBeVisible();
      const table = decisions(page);
      await expect(table.getByRole("row")).toHaveCount(6);
      const row = (name: RegExp) => table.getByRole("row").filter({ has: page.getByRole("button", { name }) });
      // Affectation 180 : transfert neutre, une décision reliée aux deux feuilles par le même PV.
      const aff = row(/20\/05\/2026 — Affectation du résultat/);
      await expect(aff).toContainText("Reliée · même PV"); await expect(aff).toContainText("−180,00 EUR"); await expect(aff).toContainText("+146,00 EUR"); await expect(aff).toContainText("2 feuilles");
      // Dividende 120 voté, comptabilisé, non payé.
      const div = row(/20\/05\/2026 — Distributions/);
      await expect(div).toContainText("Votée, non payée · reste 120,00 EUR"); await expect(div).toContainText("Reliée · même PV");
      // Distribution exceptionnelle amendée : 30 en vigueur, 50 remplacés.
      await expect(row(/10\/07\/2026 — Distributions/)).toContainText("remplace D-EXC-1");
      await expect(row(/10\/07\/2026 — Distributions/)).toContainText("Payée");
      // Pièce absente dans les deux feuilles : à rapprocher, jamais additionnée.
      await expect(row(/15\/11\/2026 — Augmentations de capital/)).toContainText("À rapprocher · non comptée");
      await expect(page.getByText("Décisions comptées", { exact: true }).locator("..")).toContainText("4");
      await expect(page.getByText("Payé à la date de revue", { exact: true }).locator("..")).toContainText("reste 120,00 EUR");
      // Autres fonds propres (ANC 2024-07) et repères légaux, venus de la feuille 1.1.0.
      const instruments = page.getByRole("table", { name: /^Classement par termes contractuels/ });
      await expect(instruments.getByRole("row", { name: /Titres participatifs émis en 2019/ })).toContainText("À qualifier");
      await expect(instruments.getByRole("row", { name: /Avance d’un organisme public/ })).toContainText("Qualifié");
      await expect(page.getByText("Total des autres fonds propres", { exact: true }).locator("..")).toContainText("1 instrument(s) ou compte(s) à qualifier");
      await expect(page.locator("section", { has: page.getByRole("heading", { name: "Repères légaux — aucune conclusion juridique" }) }).getByText("Aucun signal", { exact: true })).toHaveCount(3);
      await noGlobalOverflow(page);
      await shot(page, page.locator("main"), `c09-parcours-${width}.jpg`);

      // Clavier : la ligne ouvre le détail, focus sur son titre ; retour au tableau.
      const open = div.getByRole("button");
      await open.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Décision du 20/05/2026 — Distributions" })).toBeFocused();
      const panel = detail(page);
      await expect(panel).toContainText("Votée, non payée · voté 120,00 EUR · payé à la clôture 0,00 EUR · payé à la revue 0,00 EUR · reste 120,00 EUR");
      const links = panel.getByRole("link", { name: /Ouvrir dans la feuille d’origine/ });
      await expect(links).toHaveCount(2);
      expect(await links.nth(0).getAttribute("href")).toContain("/capitaux-propres?dossierId=" + c09Scope.dossierId);
      expect(await links.nth(0).getAttribute("href")).toContain("version=6&item=D%3AD-DIV");
      expect(await links.nth(1).getAttribute("href")).toContain("/equity?dossierId=" + c09Scope.dossierId);
      expect(await links.nth(1).getAttribute("href")).toContain("event=decision%3ADIV");
      await shot(page, panel, `c09-detail-${width}.jpg`);
      await panel.getByRole("button", { name: "Revenir au tableau des décisions" }).click();
      await expect(open).toBeFocused();
      await axe(page);
    });
  });
}

test("parcours unique sans la chaîne /equity : parcours signalé fermé, augmentation de capital comptée une fois", async ({ page }) => {
  await serveParcours(page, { legacy: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(parcours());
  await expect(page.getByText("Chaîne /equity non ouverte sur ce serveur")).toBeVisible();
  await expect(decisions(page).getByRole("row").filter({ has: page.getByRole("button", { name: /Augmentations de capital/ }) })).toContainText("Une feuille");
});

test("réduction des animations : le panneau de détail n’anime pas son ouverture", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await serveParcours(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(parcours());
  await decisions(page).getByRole("button", { name: /20\/05\/2026 — Distributions/ }).click();
  const name = await detail(page).evaluate(el => getComputedStyle(el).animationName);
  expect(name).toBe("none");
});

for (const width of WIDTHS) {
  test(`feuille /capitaux-propres de règle 1.0.0 à ${width} px : consultable, alerte de règle remplacée, révision vers la règle 1.1.0`, async ({ page }) => {
    const h = createEquityHarness(); const { run } = await h.executed();
    const list = Object.values(h.db.state.versions).map(v => (v as Record<string, WorkpaperRun[]>)[run.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === Math.max(...list.map(x => x.version))), stored = list[index];
    list[index] = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
      capitauxWork: { schemaVersion: "equity-1", convention: stored.capitauxWork!.convention, readings: stored.capitauxWork!.readings },
      result: { ...stored.result!, ruleVersion: "1.0.0", result: asCapitauxRule100(stored.result!.result as EquityResult) } } as WorkpaperRun;
    await serveSheet(page, h);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(sheet());
    const alert = page.getByRole("alert").filter({ hasText: "règle Capitaux propres 1.0.0" });
    await expect(alert).toContainText("Elle reste consultable telle quelle");
    await expect(page.getByText("Règle 1.0.0 : présentation des autres fonds propres, paiement par décision et repères légaux non établis pour cette version.")).toBeVisible();
    await noGlobalOverflow(page);
    await shot(page, alert, `c09-regle-1-0-0-${width}.jpg`);
    await alert.getByRole("button", { name: "Créer une révision (règle 1.1.0)" }).click();
    await expect(page.getByLabel("Contexte du dossier")).toContainText("r2 · v1");
    await expect(page.getByRole("alert").filter({ hasText: "règle Capitaux propres 1.0.0" })).toHaveCount(0);
  });

  test(`feuille /capitaux-propres 1.1.0 à ${width} px : forme sociale et avance déclarées depuis le formulaire, présentation et repères calculés par le serveur`, async ({ page }) => {
    const h = createEquityHarness(); await h.frozenRun({}, eqDraft());
    await serveSheet(page, h);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(sheet());
    await page.getByRole("tab", { name: /Population/ }).click();
    const form = page.locator("section", { has: page.getByRole("heading", { name: "Cadre déclaré : forme sociale et autres fonds propres" }) });
    await expect(form).toContainText("Texte antérieur à ANC 2024-07");
    await form.getByRole("combobox", { name: /^Forme sociale/ }).selectOption("sas");
    await form.getByRole("button", { name: "Enregistrer le cadre" }).click();
    await expect(page.getByText("Sauvegardée — accusé serveur reçu")).toBeVisible();
    await form.getByRole("button", { name: "Déclarer un instrument" }).click();
    await form.getByRole("textbox", { name: "Identifiant" }).fill("AV-ETAT");
    await form.getByRole("textbox", { name: "Libellé" }).fill("Avance conditionnée de l’État");
    await form.getByRole("textbox", { name: /^Comptes/ }).fill("167400");
    await form.getByRole("combobox", { name: /^Présentation retenue/ }).selectOption("autres_fonds_propres");
    const piece = form.getByRole("combobox", { name: /^Pièce contractuelle citée/ });
    await piece.selectOption((await piece.locator("option", { hasText: "PV-AGO-2024 ·" }).getAttribute("value"))!);
    await form.getByRole("button", { name: "Enregistrer l’instrument" }).click();
    await expect(form.getByRole("button", { name: "Modifier AV-ETAT" })).toBeVisible();
    await noGlobalOverflow(page);
    await page.getByRole("tab", { name: /Tests/ }).click();
    await page.getByRole("button", { name: "Exécuter la revue des capitaux propres" }).click();
    const presentation = page.locator("section", { has: page.getByRole("heading", { name: /^Autres fonds propres — présentation/ }) });
    await expect(presentation.getByRole("row", { name: /Avance conditionnée de l’État/ })).toContainText("Déclaré");
    await expect(presentation.getByText("Autres fonds propres (présentation déclarée)").first()).toBeVisible();
    await expect(page.getByText("SAS (y compris à associé unique)").first()).toBeVisible();
    await noGlobalOverflow(page);
    await shot(page, presentation, `c09-feuille-presentation-${width}.jpg`);
    await axe(page);
  });
}
