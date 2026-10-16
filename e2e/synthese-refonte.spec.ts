import { expect, test, type Page } from "@playwright/test";

/**
 * Synthèse (refonte « grand livre », ambiance instruments) — recette réelle sur le build de production, dossier DEMO SA.
 *
 * Trois niveaux de lecture (Décision, Analyse, Exploration) et leurs gestes : le filtre croisé par gravité et
 * cloison, le volet de détail d'une cellule de la mosaïque (focus piégé, Échap rend le focus), la chaîne de preuve
 * et la décision de revue, l'accordéon « Méthode », la variante B de composition. Aux trois largeurs : aucun
 * débordement horizontal du document. Les attendus (comptes de constats) sont relus dans la page et recoupés entre
 * eux — le même constat est compté par le Sankey, la mosaïque, la concentration et le journal.
 */
const WIDTHS = [1440, 1024, 390] as const;

async function open(page: Page, query = "") {
  await page.goto(`/dashboard/synthese${query}`);
  await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Décision" })).toBeVisible();
}

async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(m.scrollWidth, "débordement horizontal du document").toBeLessThanOrEqual(m.clientWidth);
}

/** Nombre annoncé par la barre du filtre croisé (« … · 19 constats »). */
async function filterCount(page: Page): Promise<number> {
  const text = await page.locator("[aria-live='polite']").filter({ hasText: "Filtre croisé" }).first().innerText();
  return Number(/(\d+)\s+constats?/.exec(text)?.[1] ?? NaN);
}

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("décision : verdict, signal subordonné, trois mesures, registre des cycles", async ({ page }) => {
      await open(page);
      const decision = page.getByRole("region", { name: "Décision" });
      await expect(decision).toContainText(/1 alerte bloque l’admissibilité du FEC/);
      await expect(decision).toContainText(/Signal subordonné au verdict ; ce n’est pas un score de conformité/);
      for (const label of ["Admissibilité du FEC", "Couverture de l’analyse", "Avancement de la revue"]) await expect(decision.getByText(label, { exact: true })).toBeVisible();
      const register = page.getByRole("heading", { name: "Registre des cycles du dossier" });
      await expect(register).toBeVisible();
      // Cinq cycles d'abord, puis tout le registre à la demande.
      const rows = page.locator("section#registre tbody tr[class*='registerRow']");
      await expect(rows).toHaveCount(5);
      await page.getByRole("button", { name: /^Afficher les \d+ cycles$/ }).click();
      expect(await rows.count()).toBeGreaterThan(5);
      await noGlobalOverflow(page);
    });

    test("filtre croisé : une gravité réduit l'analyse au même nombre de constats partout", async ({ page }) => {
      await open(page);
      const severities = page.getByRole("group", { name: "Filtrer par gravité" });
      const major = severities.getByRole("button", { name: "Majeur" });
      await expect(major).toHaveAttribute("aria-pressed", "false");
      await major.scrollIntoViewIfNeeded();
      await major.click();
      await expect(major).toHaveAttribute("aria-pressed", "true");
      const announced = await filterCount(page);
      expect(announced).toBeGreaterThan(0);
      // Le tableau « cloison × gravité » (alternative au Sankey) totalise la colonne Majeur au même nombre.
      await page.getByText("Alternative tableau : cloison × gravité").click();
      const table = page.locator("figure", { hasText: "Flux cloison → gravité" }).locator("table");
      const column = (await table.locator("thead th").allInnerTexts()).findIndex((t) => t.trim() === "Majeur");
      const cells = await table.locator("tbody tr td:nth-child(" + (column + 1) + ")").allInnerTexts();
      expect(cells.map(Number).reduce((a, b) => a + b, 0)).toBe(announced);
      await page.getByRole("button", { name: "Effacer le filtre" }).click();
      await expect(major).toHaveAttribute("aria-pressed", "false");
      await noGlobalOverflow(page);
    });

    test("mosaïque : le volet liste les constats de la cellule, Tab reste dedans, Échap rend le focus", async ({ page }) => {
      await open(page);
      const cell = page.getByRole("button", { name: /Bilan — Actif × Existence · solde : \d+ constats/ });
      await cell.scrollIntoViewIfNeeded();
      const expected = Number(/: (\d+) constats/.exec((await cell.getAttribute("aria-label"))!)![1]);
      await cell.click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Fermer le détail" })).toBeFocused();
      await expect(drawer.getByRole("button", { name: "Ouvrir la chaîne de preuve" })).toHaveCount(expected);
      // Tab ne sort pas du volet : après un tour complet, le focus est toujours dans le dialogue.
      for (let i = 0; i < expected + 2; i++) await page.keyboard.press("Tab");
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(cell).toBeFocused();
    });

    test("chaîne de preuve : depuis le volet jusqu'à la décision, annulable", async ({ page }) => {
      await open(page);
      const cell = page.getByRole("button", { name: /Bilan — Actif × Existence · solde/ });
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.getByRole("dialog").getByRole("button", { name: "Ouvrir la chaîne de preuve" }).first().click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const chain = page.locator("#chaine");
      await expect(chain).toBeVisible();
      await expect(chain.getByText("Source", { exact: true })).toBeVisible();
      await expect(chain.getByText("Décision", { exact: true })).toBeVisible();
      await expect(chain).toContainText(/En attente de revue/);

      await chain.getByRole("button", { name: "Valider" }).click();
      await expect(chain).toContainText(/Validé par l’auditeur/);
      await expect(chain).toContainText(/ne vaut pas certification/);
      await expect(page.getByRole("region", { name: "Décision" })).toContainText(/1\s*\/\s*43|1 constat arbitré sur 43/);
      await chain.getByRole("button", { name: "Annuler la décision" }).click();
      await expect(chain).toContainText(/En attente de revue/);
      await noGlobalOverflow(page);
    });

    test("méthode : repliée par défaut, ouverte elle donne capacités, versions et empreintes", async ({ page }) => {
      await open(page);
      const method = page.locator("details#methode");
      await expect(method).not.toHaveAttribute("open", "");
      await method.locator(":scope > summary").click();
      await expect(method.getByRole("heading", { name: "Versions appliquées" })).toBeVisible();
      await expect(method.getByRole("heading", { name: "Empreintes et chaîne du snapshot" })).toBeVisible();
      await expect(method.getByRole("heading", { name: /Zones réglementaires du FEC/ })).toBeVisible();
      await noGlobalOverflow(page);
    });

    test("limites : toujours affichées, numérotées, dont l'admissibilité rejetée", async ({ page }) => {
      await open(page);
      const limits = page.getByRole("region", { name: /Limites de l.analyse/ });
      await limits.scrollIntoViewIfNeeded();
      await expect(limits.getByRole("listitem").first()).toBeVisible();
      await expect(limits).toContainText(/Mode démo : société fictive DEMO SA/);
      await expect(limits).toContainText(/Admissibilité rejetée/);
      await noGlobalOverflow(page);
    });

    test("variante B : même verdict, autre composition", async ({ page }) => {
      await open(page);
      const verdict = () => page.getByRole("region", { name: "Décision" }).getByRole("heading", { name: /1 alerte bloque/ });
      const verdictA = (await verdict().innerText()).replace(/\s+/g, " ");
      await open(page, "?variante=B");
      const verdictB = (await verdict().innerText()).replace(/\s+/g, " ");
      expect(verdictB).toBe(verdictA);
      await expect(page.getByText("Ajustement proposé", { exact: true }).first()).toBeVisible();
      await noGlobalOverflow(page);
    });
  });
}

test.describe("mouvement réduit", () => {
  test("aucune animation Web ne tourne sur la Synthèse", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await open(page);
    await page.waitForTimeout(800);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, "animations en cours sous prefers-reduced-motion").toBe(0);
    await context.close();
  });
});
