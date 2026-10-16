import { expect, test, type Page } from "@playwright/test";

/**
 * Landing (refonte « grand livre rendu vivant », ambiance papier).
 *
 * Contrôlé aux trois largeurs de recette : titre et deux entrées, quatre chapitres dans l'ordre, ancres de l'en-tête,
 * chaîne de preuve navigable (onglets), pied de page sans promesse de certification, aucun débordement horizontal
 * du document, et mouvement neutralisé sous `prefers-reduced-motion`. Les chiffres de l'index normatif viennent du
 * dépôt (cycles YAML) : on compare à la page, jamais à une valeur recopiée.
 */
const WIDTHS = [1440, 1024, 390] as const;
const CHAPTERS = ["Trois couches, séparées à chaque étape", "Revue par cloison", "Dossier de preuve", "Audit Normatif 360"];

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

    test("titre, deux entrées, quatre chapitres dans l'ordre, pied de page sans certification", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Du grand livre au constat opposable.", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: /Lancer la visite guidée/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Ouvrir la démo d’analyse FEC/ })).toHaveAttribute("href", "/dashboard/synthese");

      const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
      expect(headings.map((h) => h.trim())).toEqual(CHAPTERS);

      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toContainText("Aucun résultat ne vaut certification ni avis juridique.");
      await expect(footer).toContainText(/moteur \d+\.\d+\.\d+ · référentiel .+ · \d+ cycles · revue requise/);
      await noGlobalOverflow(page);
    });

    test("les ancres de l'en-tête mènent aux chapitres (dès 1080 px), l'entrée de la démo reste exposée", async ({ page }) => {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Sections" });
      if (width >= 1080) {
        // La navigation suit la largeur du conteneur : on attend son affichage avant de lire ses liens.
        await expect(nav.getByRole("link").first()).toBeVisible();
        const links = await nav.getByRole("link").all();
        expect(links.length).toBe(4);
        for (const link of links) {
          const href = await link.getAttribute("href");
          expect(href).toMatch(/^#(couches|cloisons|preuve|normatif)$/);
          await expect(page.locator(href!)).toHaveCount(1);
        }
      } else {
        // En dessous, la navigation par ancres est retirée de l'arbre d'accessibilité (pas de liens masqués focalisables).
        await expect(nav).toHaveCount(0);
      }
      await expect(page.getByRole("link", { name: /Ouvrir la démo →/ })).toHaveAttribute("href", "/dashboard/synthese");
    });

    test("la chaîne de preuve se parcourt par onglets, un constat à la fois", async ({ page }) => {
      await page.goto("/#preuve");
      const tablist = page.getByRole("tablist", { name: "Constats de démonstration" });
      await expect(tablist).toBeVisible();
      const tabs = tablist.getByRole("tab");
      expect(await tabs.count()).toBeGreaterThanOrEqual(2);
      await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
      const second = tabs.nth(1);
      await second.click();
      await expect(second).toHaveAttribute("aria-selected", "true");
      await expect(tabs.first()).toHaveAttribute("aria-selected", "false");
      // Un seul panneau est exposé, nommé par son onglet.
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      await expect(page.getByRole("tabpanel")).toHaveAccessibleName(await second.innerText());
      await noGlobalOverflow(page);
    });

    test("l'index normatif compte les cycles du dépôt, par famille", async ({ page }) => {
      await page.goto("/#normatif");
      const section = page.locator("section#normatif");
      await expect(section).toBeVisible();
      const footer = (await page.getByRole("contentinfo").innerText()).match(/(\d+) cycles/);
      expect(footer, "le pied de page annonce le nombre de cycles").not.toBeNull();
      const total = Number(footer![1]);
      expect(total).toBeGreaterThan(0);
      // Le texte du chapitre ne contredit pas le pied de page : le même nombre y apparaît.
      await expect(section).toContainText(String(total));
    });

    test("la visite guidée démarre sur le premier écran du parcours", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /Lancer la visite guidée/ }).click();
      await expect(page).toHaveURL(/\/dashboard\/depot\?.*guide=1.*etape=0|\/dashboard\/depot\?.*etape=0.*guide=1/);
    });
  });
}

test.describe("mouvement réduit", () => {
  test("aucune animation Web ne tourne et le contenu final est affiché", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Du grand livre au constat opposable.", level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, "animations en cours sous prefers-reduced-motion").toBe(0);
    const opacity = await page.getByRole("heading", { name: "Du grand livre au constat opposable.", level: 1 }).evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("1");
    await context.close();
  });
});
