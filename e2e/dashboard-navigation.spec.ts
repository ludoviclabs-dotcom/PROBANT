import { expect, test, type Page } from "@playwright/test";

/**
 * Tableau de bord — navigation des écrans du dossier (refonte « salle d'instruments »).
 *
 * Remplace le tiroir de navigation d'avant la refonte : dès 760 px un rail (184 px, 216 px dès 1200) porte les
 * écrans dans l'ordre du registre de capacités ; en dessous, une barre basse porte quatre écrans et « Plus ».
 * Contrôlé aux trois largeurs de recette (1440, 1024, 390) : exactement une navigation exposée à la fois, position
 * courante annoncée (`aria-current`), cibles ≥ 44 px, aucun débordement horizontal du document, focus et Échap du
 * menu « Plus », mouvement neutralisé sous `prefers-reduced-motion`.
 */
const WIDTHS = [1440, 1024, 390] as const;
const RAIL_BREAKPOINT = 760;
const PRIMARY_BOTTOM = ["Dépôt", "Synthèse", "Risques", "Cloisons"];

async function ready(page: Page) {
  await page.goto("/dashboard/synthese");
  await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
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

    test("une seule navigation est exposée, la position courante est annoncée", async ({ page }) => {
      await ready(page);
      const nav = page.getByRole("navigation", { name: "Écrans du dossier" });
      await expect(nav).toHaveCount(1);
      const current = nav.getByRole("link", { name: "Synthèse" });
      await expect(current).toHaveAttribute("aria-current", "page");
      await noGlobalOverflow(page);
    });

    if (width >= RAIL_BREAKPOINT) {
      test("rail : largeur selon le point de rupture, ordre du registre, cibles de 44 px", async ({ page }) => {
        await ready(page);
        const nav = page.getByRole("navigation", { name: "Écrans du dossier" });
        const box = (await nav.boundingBox())!;
        expect(Math.round(box.x)).toBe(0);
        expect(Math.round(box.width)).toBe(width >= 1200 ? 216 : 184);
        // Le contenu commence là où le rail finit : navigation en flux, rien ne recouvre la page.
        const mainLeft = await page.evaluate(() => Math.round(document.querySelector("main")!.getBoundingClientRect().left));
        expect(mainLeft).toBe(Math.round(box.width));

        const labels = await nav.locator("li a").allInnerTexts();
        expect(labels.length).toBeGreaterThanOrEqual(7);
        expect(labels[0]).toContain("Dépôt");
        expect(labels[1]).toContain("Synthèse");
        expect(labels[2]).toContain("Cartographie des risques");
        // Les numéros 01, 02… suivent l'ordre du registre, sans trou.
        labels.forEach((text, i) => expect(text.trim().startsWith(String(i + 1).padStart(2, "0"))).toBe(true));
        for (const link of await nav.locator("li a").all()) {
          expect((await link.boundingBox())!.height, "cible de navigation").toBeGreaterThanOrEqual(44);
        }
        // La barre basse n'existe pas à cette largeur.
        await expect(page.locator("#bottom-more")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Plus", exact: true })).toHaveCount(0);
      });

      test("rail : Tab atteint chaque écran dans l'ordre et le focus est visible", async ({ page }) => {
        await ready(page);
        const nav = page.getByRole("navigation", { name: "Écrans du dossier" });
        await nav.getByRole("link", { name: "PROBANT" }).focus();
        await page.keyboard.press("Tab");
        const first = nav.locator("li a").first();
        await expect(first).toBeFocused();
        const outline = await first.evaluate((el) => {
          const style = getComputedStyle(el);
          return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, shadow: style.boxShadow };
        });
        expect(outline.style !== "none" && outline.width > 0 || outline.shadow !== "none", "indicateur de focus").toBe(true);
      });
    } else {
      test("barre basse : quatre écrans et « Plus », cibles de 44 px, le rail est absent", async ({ page }) => {
        await ready(page);
        const bar = page.getByRole("navigation", { name: "Écrans du dossier" });
        const links = bar.getByRole("link");
        await expect(links).toHaveCount(4);
        expect(await links.allInnerTexts()).toEqual(PRIMARY_BOTTOM);
        const more = bar.getByRole("button", { name: "Plus", exact: true });
        await expect(more).toHaveAttribute("aria-expanded", "false");
        for (const target of [...(await links.all()), more]) {
          expect((await target.boundingBox())!.height, "cible de la barre basse").toBeGreaterThanOrEqual(44);
        }
        // Pas de colonne de rail : le contenu occupe toute la largeur.
        const main = await page.evaluate(() => {
          const r = document.querySelector("main")!.getBoundingClientRect();
          return { left: Math.round(r.left), width: Math.round(r.width) };
        });
        expect(main.left).toBe(0);
        expect(main.width).toBe(width);
      });

      test("« Plus » : Échap referme et rend le focus ; un appui dehors referme ; un lien navigue et referme", async ({ page }) => {
        await ready(page);
        const bar = page.getByRole("navigation", { name: "Écrans du dossier" });
        const more = bar.getByRole("button", { name: "Plus", exact: true });
        const menu = page.locator("#bottom-more");
        await expect(menu).toHaveCount(0);

        await more.focus();
        await page.keyboard.press("Enter");
        await expect(more).toHaveAttribute("aria-expanded", "true");
        await expect(more).toHaveAttribute("aria-controls", "bottom-more");
        await expect(menu).toBeVisible();
        const others = await menu.getByRole("link").count();
        expect(others).toBeGreaterThanOrEqual(3);
        await page.keyboard.press("Escape");
        await expect(more).toHaveAttribute("aria-expanded", "false");
        await expect(menu).toHaveCount(0);
        await expect(more).toBeFocused();

        await more.click();
        await expect(menu).toBeVisible();
        await page.mouse.click(200, 300);
        await expect(menu).toHaveCount(0);

        await more.click();
        await menu.getByRole("link", { name: /Fiscalité/ }).click();
        await expect(page).toHaveURL(/\/dashboard\/fiscalite/);
        await expect(menu).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Écrans du dossier" }).getByRole("button", { name: "Plus", exact: true })).toHaveAttribute("aria-expanded", "false");
        await noGlobalOverflow(page);
      });

      test("un écran de la barre basse garde le contexte du dossier dans l'adresse", async ({ page }) => {
        await ready(page);
        const bar = page.getByRole("navigation", { name: "Écrans du dossier" });
        await bar.getByRole("link", { name: "Risques" }).click();
        await expect(page).toHaveURL(/\/dashboard\/risques/);
        const query = new URL(page.url()).searchParams;
        expect(query.get("context")).toBe("1");
        expect(query.get("dossierId")).toBeTruthy();
      });
    }
  });
}

test.describe("mouvement réduit", () => {
  test("le trait de position du rail ne glisse pas", async ({ browser }) => {
    const motion = async (reducedMotion: "no-preference" | "reduce") => {
      const context = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await ready(page);
      const duration = await page.locator("nav[aria-label='Écrans du dossier'] [class*='railIndicator']").evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
      await context.close();
      return duration;
    };
    expect(await motion("no-preference")).toBeCloseTo(0.2, 2);
    expect(await motion("reduce")).toBe(0);
  });
});
