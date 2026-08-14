import { expect, test } from "@playwright/test";

/**
 * Parcours 2 — FEC valide, pipeline durable.
 *
 * upload → job → qualité → synthèse → empreinte → décision → export
 *
 * ⚠️ Ce parcours exige l'infrastructure persistante complète : PostgreSQL,
 * stockage objet S3, file SQS, identité OIDC. Il est donc **ignoré par défaut**
 * et n'est exécuté que lorsque `PROBANT_E2E_PERSISTENT=1` désigne un
 * environnement réellement provisionné.
 *
 * Il n'est pas remplacé par une simulation : un parcours simulé qui passerait
 * en CI donnerait une fausse assurance sur la chaîne la plus critique du
 * produit. Tant qu'il n'est pas exécuté, son statut de release est
 * `NOT_TESTED` — cf. `docs/release/TEST_REPORT.md`.
 */
const PERSISTENT = process.env.PROBANT_E2E_PERSISTENT === "1";
const DOSSIER_ID = process.env.PROBANT_E2E_DOSSIER_ID ?? "";

const VALID_FEC_HEADER =
  "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise";

function validFec(lineCount: number): Buffer {
  const lines = [VALID_FEC_HEADER];
  for (let index = 1; index <= lineCount; index += 1) {
    const amount = (index * 100).toFixed(2).replace(".", ",");
    lines.push(
      `VE|Ventes|VE${String(index).padStart(6, "0")}|20250131|411000|Clients||` +
        `|FA${index}|20250131|Vente|${amount}|0,00|||20250131||`,
      `VE|Ventes|VE${String(index).padStart(6, "0")}|20250131|707000|Ventes||` +
        `|FA${index}|20250131|Vente|0,00|${amount}|||20250131||`,
    );
  }
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

test.describe("parcours FEC valide — pipeline durable", () => {
  test.skip(
    !PERSISTENT,
    "Infrastructure persistante absente (PROBANT_E2E_PERSISTENT != 1) — statut de release NOT_TESTED.",
  );
  test.skip(!DOSSIER_ID, "PROBANT_E2E_DOSSIER_ID non fourni.");

  test("upload → job → qualité → synthèse → empreinte → décision → export", async ({ page }) => {
    test.setTimeout(180_000);

    // — upload ————————————————————————————————————————————
    await page.goto(`/dashboard/depot?dossier=${encodeURIComponent(DOSSIER_ID)}`);
    await page.locator('input[type="file"]').setInputFiles({
      name: "fec-2025.txt",
      mimeType: "text/plain",
      buffer: validFec(500),
    });

    // — job : la progression doit refléter un état serveur, pas une animation
    await expect(page.getByText(/fingerprint|parsing|contrôles|snapshot/iu).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/terminé|completed|succès/iu).first()).toBeVisible({
      timeout: 150_000,
    });

    // — qualité : les 18 zones réglementaires du FEC ——————————
    await page.goto("/dashboard/synthese");
    const quality = page.getByText(/18/u).first();
    await expect(quality).toBeVisible();

    // — synthèse + empreinte ————————————————————————————
    await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
    const body = await page.locator("body").innerText();
    const fingerprint = body.match(/\b[0-9a-f]{12,64}\b/u)?.[0];
    expect(fingerprint, "l'empreinte du snapshot doit être affichée").toBeTruthy();

    // — décision ————————————————————————————————————————
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect(page.getByText(/enregistrée|décision/iu).first()).toBeVisible();

    // — export ————————————————————————————————————————————
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("region", { name: "Exports du dossier de preuve" })
      .getByRole("button", { name: "Exporter JSON" })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/u);

    // L'empreinte affichée doit se retrouver dans l'export : sans cela, la
    // synthèse consultée et le dossier de preuve exporté ne sont pas le même
    // objet.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toContain(fingerprint!);
  });
});
