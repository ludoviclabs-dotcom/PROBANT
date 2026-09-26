import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) test(`dossier synthétique, revue, rechargement et export — ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/dashboard/tests");
  const workshop = page.getByRole("region", { name: /Atelier des dix cycles/ });
  await expect(workshop).toBeVisible();
  await workshop.getByRole("button", { name: "Ouvrir un dossier synthétique dédié" }).click();
  await expect(workshop).toContainText("SYN-");
  await workshop.getByRole("combobox", { name: "Cycle", exact: true }).selectOption("clients");
  await workshop.getByRole("button", { name: "Exécuter ce cycle" }).click();
  await expect(workshop.getByRole("button", { name: "Soumettre" })).toBeVisible();
  const note = workshop.getByLabel(/Note de préparation/);
  await note.fill("Préparation synthétique, limites conservées");
  await workshop.getByRole("button", { name: "Soumettre" }).click();
  await expect(workshop.getByRole("button", { name: "Approuver" })).toBeVisible();
  await page.reload();
  await expect(workshop.getByRole("button", { name: "Approuver" })).toBeVisible();
  await note.fill("Revue simulée, aucune opinion d’audit");
  await workshop.getByRole("button", { name: "Approuver" }).click();
  await note.fill("Projection du dossier synthétique");
  await workshop.getByRole("button", { name: "Verrouiller" }).click();
  await expect(workshop).toContainText("Verrouillé");
  await workshop.getByRole("link", { name: /Voir la synthèse/ }).click();
  await expect(page.getByRole("heading", { name: "Synthèse du dossier synthétique" })).toBeVisible();
  await expect(page.getByText(/1 prévues · 1 exécutées · 1 verrouillées/)).toBeVisible();
  await page.getByRole("button", { name: "Préparer l’export du dossier" }).click();
  await expect(page.getByRole("button", { name: "Snapshot JSON" })).toBeVisible();
});
