import { expect, test } from "@playwright/test";
import { AUDIT_CYCLES, documentTypesForCycle, type DocumentType } from "../lib/rapprochement/catalog";

const headers: Record<string, string> = { compte: "Compte", tiers: "Tiers", piece: "Pièce", montant: "Montant", date: "Date", echeance: "Échéance", libelle: "Libellé", lettre: "Lettrage" };
function file(type: DocumentType, rows: Array<[string, number | string]>) {
  const fields = [...new Set([...type.champsRequis, ...(type.champsOptionnels ?? []).filter((key) => ["piece", "compte", "tiers"].includes(key))])];
  const csv = [fields.map((key) => headers[key]).join(";"), ...rows.map(([key, amount]) => fields.map((field) => field === "montant" ? String(amount).replace(".", ",") : field === "compte" ? key === "" ? "" : "411" : key).join(";"))].join("\n");
  return { name: `${type.id}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) };
}
async function qualify(panel: import("@playwright/test").Locator) {
  await panel.getByLabel("Entité", { exact: true }).fill("Entité recette");
  await panel.getByLabel("Début de période").fill("2024-01-01");
  await panel.getByLabel("Clôture", { exact: true }).fill("2024-12-31");
  await panel.getByLabel("Date de revue").fill("2025-02-01");
  await panel.getByRole("checkbox").check();
}
async function upload(panel: import("@playwright/test").Locator, cycleId: string, a: Array<[string, number | string]>, b: Array<[string, number | string]>) {
  for (const type of documentTypesForCycle(cycleId)) {
    await panel.getByLabel(`Fichier ${type.libelle}`, { exact: true }).setInputFiles(file(type, type.role === "source" ? a : b));
  }
  await expect(panel.getByRole("button", { name: /Comparer — diagnostic bloqué|Comparer les documents/ })).toBeEnabled();
}
for (const cycle of AUDIT_CYCLES) test(`${cycle.id} : dépôt seul, compensation, détails et réimport nominal`, async ({ page }) => {
  await page.goto(`/dashboard/depot?cycle=${cycle.id}`);
  const panel = page.getByRole("region", { name: "Dépôt historique des onze cycles" });
  await qualify(panel);
  await upload(panel, cycle.id, [["K", 100], ["K", -100]], [["K", 0]]);
  await expect(panel.getByLabel("Résultat de comparaison")).toHaveCount(0);
  await panel.getByRole("button", { name: "Comparer les documents", exact: true }).click();
  const result = panel.getByLabel("Résultat de comparaison");
  await expect(result).toContainText("Comparaison partiellement non concluante");
  await expect(result.locator("dd").nth(2)).toHaveText("0,00 €");
  await expect(result.locator("dd").nth(3)).toHaveText("200,00 €");
  await expect(result).toContainText("Part de lignes univoques concordantes : 0.0 %");
  await result.getByRole("button", { name: /^Détails/ }).click();
  await expect(result.getByRole("region", { name: /^Sources du groupe/ })).toContainText("ligne 2");
  await expect(result.getByRole("region", { name: /^Sources du groupe/ })).toContainText("ligne 3");
  await expect(result.locator("details")).not.toHaveAttribute("open", "");
  await upload(panel, cycle.id, [["K", 100]], [["K", 100]]);
  await expect(panel.getByLabel("Résultat de comparaison")).toHaveCount(0);
  await panel.getByRole("button", { name: "Comparer les documents", exact: true }).click();
  await expect(result).toContainText("Version 2");
  await expect(result).toContainText("0 constat(s) actif(s)");
  await expect(result).toContainText("Part de lignes univoques concordantes : 100.0 %");
  await expect(panel).toContainText("exécution(s) périmée(s)");
  await expect(panel).not.toContainText("cycle couvert");
});

test("période inconnue, clé absente et montant ambigu gardent leur blocage", async ({ page }) => {
  await page.goto("/dashboard/depot?cycle=clients");
  const panel = page.getByRole("region", { name: "Dépôt historique des onze cycles" });
  await upload(panel, "clients", [["", 100]], [["K", 100]]);
  await panel.getByRole("button", { name: "Comparer — diagnostic bloqué" }).click();
  const result = panel.getByLabel("Résultat de comparaison");
  await expect(result).toContainText("Bloquée — diagnostic exportable, aucun contrôle concluant");
  await expect(result).toContainText("Période inconnue");
  await expect(result).toContainText("Non testables");
  const type = documentTypesForCycle("clients").find((type) => type.role === "source")!;
  await panel.getByLabel(`Fichier ${type.libelle}`).setInputFiles(file(type, [["K", "12.500"]]));
  await expect(panel).toContainText("Montant invalide");
  await expect(result).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Comparer — diagnostic bloqué" })).toBeDisabled();
});

test("deux cycles successifs sont conservés après navigation et rechargement", async ({ page }) => {
  await page.goto("/dashboard/depot?cycle=clients");
  let panel = page.getByRole("region", { name: "Dépôt historique des onze cycles" });
  await qualify(panel);
  await upload(panel, "clients", [["K", 100]], [["K", 90]]);
  await panel.getByRole("button", { name: "Comparer les documents", exact: true }).click();
  await expect(panel.getByLabel("Résultat de comparaison")).toContainText("1 constat(s) actif(s)");
  await panel.getByRole("button", { name: /^Achats \/ Fournisseurs/ }).click();
  await upload(panel, "fournisseurs", [["K", 200]], [["K", 200]]);
  await panel.getByRole("button", { name: "Comparer les documents", exact: true }).click();
  await expect(panel.getByLabel("Résultat de comparaison")).toContainText("0 constat(s) actif(s)");
  await page.reload();
  panel = page.getByRole("region", { name: "Dépôt historique des onze cycles" });
  await panel.getByRole("button", { name: /^Achats \/ Fournisseurs/ }).click();
  await expect(panel.getByLabel("Résultat de comparaison")).toContainText("200,00 €");
  await panel.getByRole("button", { name: /^Ventes \/ Clients/ }).click();
  await expect(panel.getByLabel("Résultat de comparaison")).toContainText("1 constat(s) actif(s)");
  await page.goto("/dashboard/risques");
  await expect(page.locator("body")).toContainText("comparés (dépôt limité)");
  await expect(page.locator("body")).not.toContainText("couverts (dépôt)");
});
