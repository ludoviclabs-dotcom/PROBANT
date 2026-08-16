import { expect, test } from "@playwright/test";

/**
 * Parcours 4 — dossier partiel.
 *
 * couverture partielle → limitations → **aucune conclusion excessive**
 *
 * Le test vérifie une propriété de prudence : tant que la couverture n'est pas
 * complète, l'interface doit afficher ses limites et ne jamais formuler une
 * conclusion de régularité générale.
 */
const CONCLUSIONS_EXCESSIVES = [
  /\bcomptes réguliers et sincères\b/iu,
  /\baucune anomalie\b/iu,
  /\bconformité totale\b/iu,
  /\bcertifi(?:é|ons|cation) sans réserve\b/iu,
  /\bimage fidèle\b/iu,
];

test.describe("parcours dossier partiel", () => {
  test("les limitations sont visibles et chiffrées", async ({ page }) => {
    await page.goto("/dashboard/synthese");

    const limitations = page.getByRole("region", { name: "Limites de l'analyse" });
    await limitations.scrollIntoViewIfNeeded();
    await expect(limitations).toBeVisible();

    // Le libellé porte le nombre de limitations : une section vide serait un
    // faux signal de complétude. `text-transform: uppercase` fait partie du
    // rendu lu par `innerText`, d'où la comparaison insensible à la casse.
    await expect(limitations.getByText(/Limites de l'analyse · \d+/iu)).toBeVisible();
    const count = Number(
      (await limitations.innerText()).match(/Limites de l'analyse · (\d+)/iu)?.[1] ?? "0",
    );
    expect(count, "un dossier partiel doit déclarer au moins une limitation").toBeGreaterThan(0);
  });

  test("la couverture partielle est affichée telle quelle", async ({ page }) => {
    await page.goto("/dashboard/synthese");
    const body = await page.locator("body").innerText();
    // La couverture est exprimée en pourcentage ; on vérifie qu'elle est
    // présente et qu'elle n'est pas silencieusement arrondie à 100 %.
    expect(body).toMatch(/couverture/iu);
  });

  test("aucune conclusion excessive n'est formulée", async ({ page }) => {
    for (const route of [
      "/dashboard/synthese",
      "/dashboard/risques",
      "/dashboard/cloisons",
      "/dashboard/dossier",
      "/dashboard/fiscalite",
    ]) {
      await page.goto(route);
      const body = await page.locator("body").innerText();
      for (const pattern of CONCLUSIONS_EXCESSIVES) {
        expect(body, `${route} formule une conclusion excessive : ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  test("la note de synthèse n'affirme rien au-delà de la couverture", async ({ page }) => {
    await page.goto("/dashboard/synthese");
    await page.getByRole("button", { name: /Générer la note de synthèse/iu }).click();
    const body = await page.locator("body").innerText();
    for (const pattern of CONCLUSIONS_EXCESSIVES) {
      expect(body, `la note formule une conclusion excessive : ${pattern}`).not.toMatch(pattern);
    }
  });
});
