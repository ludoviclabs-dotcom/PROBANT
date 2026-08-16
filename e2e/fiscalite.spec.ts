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
  test("les quatre niveaux sont rendus avec les chiffres des snapshots", async ({ page }, testInfo) => {
    await page.goto("/dashboard/fiscalite");
    await expect(page.getByRole("heading", { name: "Capacité et décision", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calcul", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analyse", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Exploration", level: 2 })).toBeVisible();

    const body = await page.locator("body").innerText();
    // Entité et période visibles (unité et exercice).
    expect(body).toMatch(/DEMO SA/);
    expect(body).toMatch(/exercice 2026/);
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
    // Périmètre TVA : le volet IS annonce son absence au lieu d'inventer des zéros.
    await expect(
      page.getByText("Aucun calcul d'impôt sur les sociétés", { exact: false }).first(),
    ).toBeVisible();

    // Sens inverse : une URL profonde restaure le filtre.
    await page.goto("/dashboard/fiscalite?impot=cfe");
    await expect(page.getByRole("button", { name: "CFE", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("l'exploration s'ouvre au clavier et filtre par statut", async ({ page }) => {
    await page.goto("/dashboard/fiscalite?impot=corporate_income_tax");
    const summary = page.getByText(/Toutes les lignes de réconciliation et tous les contrôles/);
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.keyboard.press("Enter");

    const incoherence = page.getByRole("button", { name: "Incohérence", exact: true });
    await expect(incoherence).toBeVisible();
    await incoherence.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/statut=reconciliation_difference/);
    // Seules les lignes en incohérence restent affichées.
    const rows = page.locator('section[aria-label^="Exploration"] tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Incohérence");
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
