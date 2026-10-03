import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { demoCycleSchema } from "../lib/workpapers/demo-cycles";
import { TARGET_CONTROL } from "../lib/workpapers/demo-assessment";

for (const cycle of demoCycleSchema.options) test(`contrat de résultat ${cycle} : atelier → synthèse → export`, async ({ page }) => {
  await page.goto("/dashboard/tests");
  const workshop = page.getByRole("region", { name: /Atelier des dix cycles/ });
  await workshop.getByRole("button", { name: "Ouvrir un dossier synthétique dédié" }).click();
  await workshop.getByRole("combobox", { name: "Cycle", exact: true }).selectOption(cycle);
  const scenario = workshop.getByRole("combobox", { name: "Scénario", exact: true });
  const target = workshop.locator(`[data-control-id="${TARGET_CONTROL[cycle].id}"]`);
  await workshop.getByRole("button", { name: "Exécuter ce cycle" }).click();
  await expect(target).toContainText("Aucune exception sur les éléments testés");
  for (const label of ["Test exécuté", "Résultat", "Incertitude", "Prochaine action"]) await expect(workshop.locator("dt", { hasText: new RegExp(`^${label}$`) })).toBeVisible();
  await expect(workshop.getByText("Détail technique — JSON et provenance du calcul", { exact: true })).toBeVisible();
  const note = workshop.getByLabel(/Note de préparation/);
  async function reviewAndLock() {
    await note.fill("Préparation et limites documentées");
    await workshop.getByRole("button", { name: "Soumettre", exact: true }).click();
    await note.fill("Revue simulée des éléments testés");
    await workshop.getByRole("button", { name: "Approuver", exact: true }).click();
    await note.fill("Verrouillage de la version revue");
    await workshop.getByRole("button", { name: "Verrouiller", exact: true }).click();
    await expect(workshop).toContainText("Verrouillé");
  }
  if (cycle !== "is") {
    await reviewAndLock();
    await scenario.selectOption("exception");
    await workshop.getByRole("button", { name: "Modifier : invalider la revue de ce cycle" }).click();
    await expect(workshop).toContainText("Revue périmée après modification");
    await expect(target).toContainText("Exception démontrée sur les éléments testés");
    await workshop.getByRole("link", { name: /Voir la synthèse/ }).click();
    await page.getByRole("button", { name: "Préparer l’export du dossier" }).click();
    await expect(page.getByRole("status").filter({ hasText: "STALE_REVIEW_EXPORT_BLOCKED" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snapshot JSON" })).toHaveCount(0);
    await page.getByRole("link", { name: /Revenir aux travaux/ }).click();
    await expect(target).toContainText("Exception démontrée sur les éléments testés");
    await reviewAndLock();
  } else {
    await expect(workshop.getByRole("button", { name: "Soumettre", exact: true })).toBeDisabled();
    await expect(workshop.locator('[data-control-id="is.tax-engine"]')).toContainText("Bloqué");
    await scenario.selectOption("exception");
    await workshop.getByRole("button", { name: "Corriger les paramètres et réexécuter" }).click();
    await expect(target).toContainText("Exception démontrée sur les éléments testés");
  }
  await workshop.getByRole("link", { name: /Voir la synthèse/ }).click();
  await expect(page.locator(`[data-control-id="${TARGET_CONTROL[cycle].id}"]`)).toContainText("Exception démontrée sur les éléments testés");
  await page.getByRole("button", { name: "Préparer l’export du dossier" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Snapshot JSON", exact: true }).click();
  const downloaded = await downloadPromise, path = await downloaded.path();
  const exported = JSON.parse(await readFile(path!, "utf8"));
  expect(exported.summary.rows[0].presentation.controls.find((c: { id: string }) => c.id === TARGET_CONTROL[cycle].id).outcome).toBe("exceptions_detected");
  expect(exported.summary.executed).toBe(cycle === "is" ? 0 : 1);
  expect(exported.summary.conclusive).toBe(0);
  await page.getByRole("link", { name: /Revenir aux travaux/ }).click();
  // New isolated journal: diagnostic export must also work without a previous lock.
  await workshop.getByRole("button", { name: "Remise à zéro explicite" }).click();
  await scenario.selectOption("invalid");
  await workshop.getByRole("button", { name: "Exécuter ce cycle" }).click();
  await expect(target).toContainText("Bloqué");
  await expect(workshop).toContainText("Montant source invalide");
  await expect(workshop).toContainText("0/10 cycles exécutés");
  await expect(workshop.getByRole("button", { name: "Soumettre", exact: true })).toBeDisabled();
  await workshop.getByRole("button", { name: "Préparer l’export", exact: true }).click();
  await expect(workshop.getByRole("button", { name: "Snapshot JSON" })).toBeVisible();
  await scenario.selectOption("nominal");
  await workshop.getByLabel("Pièce manquante").check();
  await workshop.getByRole("button", { name: "Corriger les paramètres et réexécuter" }).click();
  await expect(target).toContainText("Pièce requise absente");
  await expect(target.getByRole("link", { name: "Voir la source requise", exact: true })).toHaveAttribute("href", cycle === "is" ? "/dashboard/fiscalite" : "/dashboard/depot");
  await expect(workshop.getByRole("button", { name: "Verrouiller", exact: true })).toBeDisabled();
  await workshop.getByLabel("Pièce manquante").uncheck();
  await workshop.getByRole("button", { name: "Corriger les paramètres et réexécuter" }).click();
  await expect(target).toContainText("Aucune exception sur les éléments testés");
});
