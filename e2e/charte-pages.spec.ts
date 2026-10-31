import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Uniformisation à la charte — Cartographie, Revue par cloison, Fiscalité, Dossier & preuve, Tests complémentaires.
 *
 * Recette sur le build de production, dossier DEMO SA, aux trois largeurs de référence : le titre de page est rendu
 * dans l'ambiance « instruments » (attribut `data-ambiance` et police Newsreader), aucune carte n'introduit de
 * débordement horizontal du document, et la page ne garde aucune ombre portée. `CHARTE_OUT` (facultatif) dépose une
 * capture pleine page par écran et par largeur, hors des captures versionnées.
 */
const WIDTHS = [1440, 1024, 390] as const;

const PAGES = [
  { name: "risques", path: "/dashboard/risques", title: "Cartographie des risques" },
  { name: "cloisons", path: "/dashboard/cloisons", title: "Revue par cloison" },
  { name: "fiscalite", path: "/dashboard/fiscalite", title: "Fiscalité" },
  { name: "dossier", path: "/dashboard/dossier", title: "Dossier & preuve" },
  { name: "tests", path: "/dashboard/tests", title: "Tests complémentaires" },
] as const;

async function open(page: Page, route: string, title: string) {
  await page.goto(route);
  // Le corps lu juste après `goto` est l'écran « Lecture du dossier… » : attendre le vrai titre de la page.
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
}

async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(m.scrollWidth, "débordement horizontal du document").toBeLessThanOrEqual(m.clientWidth);
}

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const target of PAGES) {
      test(`${target.name} : titre dans l'ambiance instruments, sans débordement ni ombre portée`, async ({ page }) => {
        await open(page, target.path, target.title);
        const heading = page.locator('[data-ambiance="instruments"] h1').filter({ hasText: target.title });
        await expect(heading).toHaveCount(1);
        const family = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
        expect(family, "titre en Newsreader").toMatch(/Newsreader/i);

        const shadowed = await page.evaluate(() => {
          const root = document.querySelector("main") ?? document.body;
          return Array.from(root.querySelectorAll<HTMLElement>("*"))
            .filter((el) => el.offsetParent !== null && getComputedStyle(el).boxShadow !== "none")
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
        });
        expect(shadowed, "ombres portées dans le contenu de la page").toEqual([]);

        await noGlobalOverflow(page);

        const out = process.env.CHARTE_OUT;
        if (out) await page.screenshot({ path: path.join(out, `${target.name}-${width}.png`), fullPage: true });
      });
    }
  });
}
