import { expect, test } from "@playwright/test";

/**
 * Parcours 3 — FEC invalide.
 *
 * upload → rejet explicable → diagnostic → **aucun contrôle métier incohérent**
 *
 * La propriété la plus importante n'est pas que le rejet ait lieu, mais qu'il
 * n'entraîne *aucune* conclusion métier : un fichier refusé ne doit produire ni
 * constat, ni couverture, ni exposition.
 */
const REJECTED_FILES = [
  {
    label: "format non supporté",
    name: "liasse.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    body: Buffer.from("PK contenu de traitement de texte"),
    expected: /format non supporté|acceptés/iu,
  },
  {
    label: "XLS binaire historique",
    name: "balance-2025.xls",
    mimeType: "application/vnd.ms-excel",
    body: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]),
    expected: /xls historique|converti en xlsx/iu,
  },
];

test.describe("parcours FEC invalide", () => {
  for (const file of REJECTED_FILES) {
    test(`rejet explicable — ${file.label}`, async ({ page }) => {
      await page.goto("/dashboard/depot");

      const input = page.locator('input[type="file"]');
      await input.setInputFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.body,
      });

      // — rejet explicable : un message lisible, pas une trace technique ——
      const message = page.getByText(file.expected).first();
      await expect(message).toBeVisible({ timeout: 20_000 });
      const text = await message.innerText();
      expect(text, "le diagnostic ne doit pas être une trace de pile").not.toMatch(
        /at\s+\w+\s+\(|TypeError|undefined is not/u,
      );

      // — aucun contrôle métier incohérent ————————————————————
      // Le dossier reste celui d'avant le dépôt : aucun constat inventé.
      await page.goto("/dashboard/synthese");
      await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
      await expect(page.getByText(new RegExp(file.name.replace(".", "\\."), "u"))).toHaveCount(0);
    });
  }

  test("le dépôt FEC durable est refusé sans dossier persistant, avec une raison explicite", async ({
    page,
  }) => {
    await page.goto("/dashboard/depot");
    await page.locator('input[type="file"]').setInputFiles({
      name: "fec-2025.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise\n",
        "utf8",
      ),
    });

    // Le refus nomme la cause — absence de dossier persistant autorisé — au
    // lieu d'échouer silencieusement ou de basculer sur un traitement local.
    await expect(
      page.getByText(/dossier persistant|infrastructure|autorisé/iu).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
