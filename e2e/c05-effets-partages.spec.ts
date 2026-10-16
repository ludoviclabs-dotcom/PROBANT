import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * C05 (second passage) — projection des effets partagée entre Synthèse, revue par cloison et
 * cartographie des risques, sur le dossier démo. Attendus posés depuis le jeu démo : trois effets
 * explicites indépendants sur le résultat, tous en attente — 145 000 € (provisions) et 312 000 €
 * (chiffre d'affaires) en diminution, 18 000 € (charges constatées d'avance) en augmentation.
 * Captures dans docs/probant-lots/c05-captures ; débordement global nul.
 */
const OUT = process.env.C05_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c05-captures");

async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => { const el = document.scrollingElement!; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; });
  expect(m.scrollWidth, "débordement horizontal global").toBeLessThanOrEqual(m.clientWidth);
}
/** Capture d'un élément : la zone principale défile dans son conteneur, on déplie la hauteur le temps de la capture. */
async function shotOf(page: Page, locator: ReturnType<Page["locator"]>, name: string) {
  await noGlobalOverflow(page);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 2600 });
  await locator.scrollIntoViewIfNeeded();
  await mkdir(OUT, { recursive: true });
  await locator.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 75 });
  await page.setViewportSize(viewport);
}

for (const width of [1440, 1024, 390] as const) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("Synthèse : un pont par poste et sens, aucune exposition tous postes, aucun zéro négatif", async ({ page }) => {
      await page.goto("/dashboard/synthese");
      await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
      const waterfall = page.locator("figure[data-anim-group='wf']");
      await expect(waterfall).toBeVisible();
      const decrease = page.locator('[data-waterfall-group="Résultat · diminution"]');
      const increase = page.locator('[data-waterfall-group="Résultat · augmentation"]');
      await expect(decrease).toContainText("457 000 €");
      await expect(increase).toContainText("18 000 €");
      await expect(page.locator('[data-waterfall-group="Effet sur le résultat"]')).toContainText("Effet net sur le résultat après impôt");
      // Un graphique par poste et sens : jamais de total « tous postes ».
      await expect(page.locator("[data-waterfall-group]")).toHaveCount(3);
      await expect(waterfall).not.toContainText("Exposition brute détectée");
      await expect(waterfall).not.toContainText(/[−-]0(?:,00)? €/);
      // Les déductions portent le signe typographique « − » (U+2212), jamais un trait d'union.
      await expect(decrease).not.toContainText("-457");
      await expect(decrease.getByRole("img")).toHaveAttribute("aria-label", /En attente d'arbitrage −457\s000\s€/);
      await shotOf(page, waterfall, `synthese-waterfall-${width}`);
    });

    test("Revue par cloison : exposition initiale par poste et sens, plus de cumul d'écarts au seuil", async ({ page }) => {
      await page.goto("/dashboard/cloisons");
      const summary = page.locator("[data-effects-summary]");
      await expect(summary).toBeVisible();
      await expect(summary).toContainText(/Résultat − 457\s000 €/);
      await expect(summary).toContainText(/Résultat \+ 18\s000 €/);
      await expect(summary).toContainText(/signaux EUR sans effet chiffré/);
      await expect(page.getByText("Exposition cumulée")).toHaveCount(0);
      await shotOf(page, summary.locator("xpath=.."), `cloisons-entete-${width}`);
    });

    test("Cartographie des risques : la gravité lit la projection de la Synthèse (poste et sens le plus exposé)", async ({ page }) => {
      await page.goto("/dashboard/risques");
      await page.getByTitle("provisions-risques-charges", { exact: true }).first().click();
      const driver = page.getByText(/Poste et sens le plus exposé : Résultat · diminution, exposition initiale 145\s000 €/).first();
      await expect(driver).toBeVisible();
      await expect(page.getByText(/Même projection d'effets que la Synthèse/).first()).toBeVisible();
      await shotOf(page, driver.locator("xpath=ancestor::div[3]"), `risques-gravite-provisions-${width}`);
    });
  });
}
