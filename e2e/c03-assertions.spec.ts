import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * C03 — assertions, tests suggérés et couverture : recette réelle sur le build de production.
 * Captures dans docs/probant-lots/c03-captures ; débordement global nul ; axe serious/critical = 0 sur le contenu.
 */
const OUT = process.env.C03_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c03-captures");
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => { const el = document.scrollingElement!; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; });
  expect(m.scrollWidth, "débordement horizontal global").toBeLessThanOrEqual(m.clientWidth);
}
async function shot(page: Page, name: string) {
  await noGlobalOverflow(page);
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
}
/** Capture d'un élément : la zone principale défile dans son conteneur, la capture pleine page s'arrête au viewport. */
async function shotOf(page: Page, locator: ReturnType<Page["locator"]>, name: string) {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 2600 });
  await locator.scrollIntoViewIfNeeded();
  await mkdir(OUT, { recursive: true });
  await locator.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 70 });
  await page.setViewportSize(viewport);
}
async function strictAxe(page: Page) {
  // Les entrées de la Synthèse sont des fondus finis : axe doit mesurer l'état final, pas un fondu en cours.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  // axe ne juge le contraste que des nœuds visibles : la zone principale défilant dans son conteneur, on déplie tout le contenu.
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 8000 });
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document.querySelector("main") ?? document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => ({ id: v.id, help: v.help, nodes: v.nodes.map(n => n.target.join(" ")).slice(0, 6) }));
  });
  await page.setViewportSize(viewport);
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
}

for (const width of [1440, 1024, 390] as const) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("Synthèse : couverture non qualifiée sans ratio fictif, matrice NEP 500, couverture des travaux non établie", async ({ page }) => {
      await page.goto("/dashboard/synthese");
      await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
      const decision = page.getByRole("region", { name: "Décision" });
      await expect(decision).toContainText(/non qualifiée/i);
      await expect(decision).not.toContainText(/Substantielle/i);
      const coverage = page.getByRole("img", { name: /Couverture non qualifiée/ });
      await expect(coverage).toBeVisible();
      await expect(coverage).toContainText("Population manquante");
      await expect(coverage).toContainText("Dénominateur non qualifié");
      await expect(coverage).not.toContainText("%");
      // La phrase de mesure dit que la couverture des travaux n'est pas établie ; le détail vit dans « Méthode ».
      await expect(decision).toContainText(/couverture des travaux non établie/i);
      await page.locator("details#methode > summary").click();
      const work = page.getByRole("region", { name: "Couverture des travaux" });
      await expect(work).toBeVisible();
      await expect(work.getByRole("status")).toContainText(/couverture des travaux non établie/i);
      const matrix = page.getByRole("region", { name: /Matrice des constats/ });
      await expect(matrix).toBeVisible();
      await expect(page.getByText(/NEP 500 §09/).first()).toBeVisible();
      // Un constat qualitatif (titres non dépréciés, sans effet financier) figure en « Évaluation et imputation · solde », pas en « non qualifiée ».
      await expect(matrix.getByText("Évaluation et imputation · solde", { exact: true }).first()).toBeVisible(); // en-tête de colonne (libellé complet pour les lecteurs d'écran)
      await shot(page, `synthese-${width}`);
      await shotOf(page, coverage.locator("xpath=ancestor::div[contains(@class,'measure')][1]"), `synthese-couverture-analyse-${width}`);
      await shotOf(page, work, `synthese-couverture-travaux-${width}`);
      await shotOf(page, matrix, `synthese-matrice-constats-${width}`);
      await strictAxe(page);
    });

    test("Tests : procédure par objectif, régime et période, procédure à définir explicite", async ({ page }) => {
      await page.goto("/dashboard/tests");
      await expect(page.getByRole("heading", { name: "Régime de la mission et période" })).toBeVisible();
      await expect(page.getByText(/Exercice 2024/).first()).toBeVisible();
      const litigieuse = page.getByRole("article").filter({ hasText: "Créance litigieuse échue non dépréciée" });
      await expect(litigieuse).toContainText("Revue de recouvrabilité documentée");
      await expect(litigieuse).toContainText("Évaluation et imputation");
      await expect(litigieuse).not.toContainText("418");
      const titres = page.getByRole("article").filter({ hasText: "Titres de participation non dépréciés" });
      await expect(titres).toContainText("Dossier de valeur des titres de participation");
      await expect(titres).toContainText("Résolue par la règle du constat");
      const dateFec = page.getByRole("article").filter({ hasText: "date hors format" });
      await expect(dateFec).toContainText("Localiser");
      await expect(dateFec).toContainText("Corriger à la source");
      await expect(dateFec).toContainText("aucune assertion sur les comptes");
      await expect(page.locator('[data-procedure-status="to_define"]').first()).toBeVisible();
      await shot(page, `tests-${width}`);
      await shotOf(page, litigieuse, `tests-creance-litigieuse-${width}`);
      await shotOf(page, page.locator('[data-procedure-status="to_define"]').first(), `tests-procedure-a-definir-${width}`);
      // Changement de régime : les références changent, pas les constats.
      const count = await page.getByRole("article").count();
      await page.getByRole("combobox", { name: "Régime de la mission", exact: true }).selectOption("examen_limite");
      const regimeSection = page.getByRole("region", { name: "Régime de la mission et période" });
      await expect(regimeSection.getByRole("link", { name: /NEP 2410/ })).toBeVisible();
      await expect(regimeSection).toContainText("ne sont pas requis par la norme");
      await expect(regimeSection.getByRole("link", { name: /NEP 330/ })).toHaveCount(0);
      expect(await page.getByRole("article").count()).toBe(count);
      await shot(page, `tests-examen-limite-${width}`);
      await strictAxe(page);
    });
  });
}
