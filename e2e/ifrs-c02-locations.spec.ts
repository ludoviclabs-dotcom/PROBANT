import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * IFRS C02 — poste « Locations IFRS 16 » sur un build de production.
 * 1. Scénario synthétique en lecture seule (/ifrs/locations?demo=1), calculé par le moteur côté serveur, aux trois largeurs.
 * 2. Dossier réel sans session : l'écran dit la cause et l'action, sans chiffre ni écran fictivement terminé.
 * Captures : docs/ifrs/captures/c02 (IFRS_C02_OUT pour les déplacer). Données exclusivement synthétiques.
 */
const OUT = process.env.IFRS_C02_OUT ?? path.join(process.cwd(), "docs", "ifrs", "captures", "c02");
const WIDTHS = [1440, 1024, 390] as const;
const AXE = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({ doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth], main: [document.querySelector("main")?.scrollWidth ?? 0, document.querySelector("main")?.clientWidth ?? 0] }));
  expect(m.doc[0], "débordement horizontal du document").toBeLessThanOrEqual(m.doc[1] + 1);
  expect(m.main[0], "débordement horizontal de <main>").toBeLessThanOrEqual(m.main[1] + 1);
}
async function axe(page: Page) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
async function capture(page: Page, name: string, full = true) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78, fullPage: full });
}
const matrix = (page: Page) => page.getByRole("region", { name: /Matrice de complétude — défilement/ });

test.describe("IFRS C02 · scénario synthétique en lecture seule", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : contexte, étapes, matrice, inspecteur, filtre et accessibilité`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
      await page.goto("/ifrs/locations?demo=1");
      await expect(page.getByRole("heading", { name: "Matrice de complétude" })).toBeVisible();
      await expect(page.getByRole("note").filter({ hasText: "Simulation non revue" })).toBeVisible();
      await expect(page.getByLabel("Contexte de la feuille")).toContainText("ifrs16.leases 1.0.0 · à revoir");
      await expect(matrix(page).getByRole("row")).toHaveCount(7);
      // The synthetic scenario is read-only: no action bar, no policy editor, no upload form.
      await expect(page.getByRole("group", { name: "Actions de la feuille" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Lire et conserver l'aperçu" })).toHaveCount(0);
      await noOverflow(page); await axe(page);
      await capture(page, "scenario-" + width);

      const cell = matrix(page).getByRole("button", { name: "D04 · Taux : à compléter" });
      await cell.click();
      await expect(page).toHaveURL(/contrat=D04&colonne=rate/);
      const inspector = width >= 1400 ? page.getByRole("complementary", { name: "Inspecteur — Contrat D04" }) : page.getByRole("dialog", { name: "Inspecteur — Contrat D04" });
      await expect(inspector).toBeVisible();
      if (width >= 1400) await expect(inspector.getByRole("heading", { name: "Contrat D04" })).toBeFocused();
      else { await expect(inspector.getByRole("button", { name: "Fermer l'inspecteur" })).toBeFocused(); expect(await inspector.evaluate(el => getComputedStyle(el).animationName)).toBe("none"); }
      await expect(inspector.getByText(/Taux nominal : à convertir en taux annuel effectif/)).toBeVisible();
      await noOverflow(page);
      await capture(page, "inspecteur-" + width, false);
      await page.keyboard.press("Escape");
      await expect(cell).toBeFocused();
      await expect(page).not.toHaveURL(/contrat=/);

      await page.getByRole("button", { name: "À qualifier", exact: true }).click();
      await expect(matrix(page).getByRole("row")).toHaveCount(2);
      await expect(page).toHaveURL(/filtre=a_qualifier/);
      await expect(page.getByText(/Affichage filtré : 1 contrat sur 6 — la population figée et l'export ne changent pas/)).toBeVisible();
      await context.close();
    });
  }

  test("lien direct : le contrat et le filtre de l'URL rouvrent la même vue ; les chiffres viennent du moteur", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" }), page = await context.newPage();
    await page.goto("/ifrs/locations?demo=1&contrat=F03");
    const inspector = page.getByRole("complementary", { name: "Inspecteur — Contrat F03" });
    await expect(inspector).toBeVisible();
    // F03 over 2026 = oracle F03 over its first year: debt 33 421,27 → 22 819,76; interest 1 398,49; depreciation 11 140,42.
    for (const amount of ["33 421,27 €", "22 819,76 €", "1 398,49 €", "11 140,42 €"]) await expect(inspector.getByText(amount, { exact: true }).first()).toBeVisible();
    await page.goto("/ifrs/locations?demo=1&filtre=hors_scope_v1");
    await expect(matrix(page).getByRole("row")).toHaveCount(2);
    await expect(matrix(page).getByRole("rowheader")).toContainText("D06");
    await context.close();
  });
});

test.describe("IFRS C02 · dossier réel sans session", () => {
  test("l'écran dit la cause et l'action, sans chiffre ni étape terminée", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, locale: "fr-FR" }), page = await context.newPage();
    await page.goto("/ifrs/locations?dossierId=11111111-1111-4111-8111-111111111111&periodId=period-sans-session");
    const alert = page.getByRole("alert").filter({ hasText: "Action impossible" });
    await expect(alert).toContainText("Session requise ou expirée");
    await expect(alert.getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matrice de complétude" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Étapes du travail" })).toHaveCount(0);
    await noOverflow(page); await axe(page);
    await capture(page, "reel-sans-session-1024");
    await context.close();
  });
});
