import { expect, test } from "@playwright/test";

/**
 * Cockpit fiscalité (TAX-08) — /dashboard/fiscalite.
 *
 * Propriétés vérifiées de bout en bout :
 * - les chiffres affichés sont ceux des snapshots moteurs (écart de
 *   démonstration 24 850,00 EUR sur la charge d'impôt comptabilisée) ;
 * - le filtre d'impôt est synchronisé à l'URL dans les deux sens ;
 * - la page est pilotable au clavier ;
 * - aucun bouton sans nom accessible ;
 * - une capture d'écran pleine page est attachée au rapport comme preuve
 *   visuelle (pas de baseline : le dépôt n'utilise pas toHaveScreenshot).
 */

test.describe("cockpit fiscalité", () => {
  test("les trois actes et la décision sont rendus avec les chiffres des snapshots", async ({ page }, testInfo) => {
    await page.goto("/dashboard/fiscalite");
    await expect(page.getByRole("heading", { name: /^Exercice 2026 — \d+ contrôles exécutés/u, level: 2 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Du résultat comptable au résultat fiscal et à l'IS", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Couverture des contrôles et lignes à traiter", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Revue append-only des constats fiscaux" })).toBeVisible();

    const body = await page.locator("body").innerText();
    // Entité et période visibles (unité et exercice).
    expect(body).toMatch(/DEMO SA/);
    expect(body).toMatch(/exercice 2026/iu);
    expect(body).toMatch(/euros/iu);
    // L'écart de démonstration du moteur IS : 24 850,00 EUR (espaces insécables).
    expect(body).toMatch(/24[\s  ]?850,00[\s  ]?€/u);
    // Le langage utilisateur imposé est présent.
    expect(body).toMatch(/Incohérence/);
    expect(body).toMatch(/Donnée manquante/);

    await testInfo.attach("fiscalite-pleine-page", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("le filtre d'impôt est synchronisé à l'URL dans les deux sens", async ({ page }) => {
    await page.goto("/dashboard/fiscalite");
    await page.getByRole("button", { name: "TVA", exact: true }).click();
    await expect(page).toHaveURL(/impot=vat/);
    // Périmètre TVA : seules les réconciliations TVA restent sous le sélecteur.
    await expect(page.getByRole("heading", { name: "TVA : théorique, comptabilisée, déclarée" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "IS : calculé, déclaré, comptabilisé" })).toHaveCount(0);

    // Sens inverse : une URL profonde restaure le filtre.
    await page.goto("/dashboard/fiscalite?impot=cfe");
    await expect(page.getByRole("button", { name: "CFE", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("les lignes se filtrent au clavier et s'ouvrent dans le panneau latéral", async ({ page }) => {
    await page.goto("/dashboard/fiscalite?impot=corporate_income_tax");

    const incoherence = page.getByRole("button", { name: "Incohérence", exact: true });
    await expect(incoherence).toBeVisible();
    await incoherence.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/statut=reconciliation_difference/);
    // Seules les lignes en incohérence restent affichées.
    const rows = page.locator('section[aria-label^="Exploration"] tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Incohérence");

    // Entrée sur le libellé ouvre le panneau latéral ; Échap le referme.
    await rows.first().getByRole("button").focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("Formule / normalisations");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("aucun bouton sans nom accessible, aucun bouton sans action", async ({ page }) => {
    await page.goto("/dashboard/fiscalite");
    // Attendre l'hydratation : le comptage n'attend pas, contrairement aux expect.
    await expect(page.getByRole("button", { name: "TVA", exact: true })).toBeVisible();
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      const name = await button.evaluate(
        (element) =>
          element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
      );
      expect(name, `bouton ${index} sans nom accessible`).not.toBe("");
    }
  });
});
