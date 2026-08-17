import path from "node:path";
import { expect, test } from "@playwright/test";

const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

const VIEWPORTS = [
  { name: "mobile-compact", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-large", width: 1920, height: 1080 },
] as const;

async function readDownload(download: import("@playwright/test").Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Flux de téléchargement indisponible.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("TAX-10 — release gate E2E synthétique", () => {
  test("crée l'intention de dossier, dépose une balance synthétique et renseigne le profil d'onboarding", async ({ page }) => {
    await page.goto("/dashboard/depot");
    await page.getByRole("link", { name: "Nouveau dossier" }).click();
    await expect(page).toHaveURL(/dashboard\/depot/u);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "balance-tax-release-2026.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "Compte;Libellé;Débit;Crédit",
        "411000;Clients;1200;0",
        "706000;Prestations;0;1000",
        "445710;TVA collectée;0;200",
      ].join("\n"), "utf8"),
    });
    await expect(page.getByText("balance-tax-release-2026.csv", { exact: true })).toBeVisible();
    await expect(page.getByText("Contrôles de cohérence", { exact: true })).toBeVisible();

    await page.goto("/onboarding");
    await page.getByRole("button", { name: /Suivant/u }).click();
    await page.getByLabel(/Identité société/u).fill("SYNTHETIC TAX RELEASE SA");
    await page.getByLabel("Exercice").selectOption("2024");
    await page.getByRole("button", { name: /Suivant/u }).click();
    await expect(page.getByRole("heading", { name: /Prêt à générer/u })).toBeVisible();
  });

  test("capabilities → contrôles → waterfall → revue → preuve → note → export → manifeste", async ({ page }) => {
    await page.goto("/dashboard/fiscalite?impot=corporate_income_tax");
    await expect(page.getByRole("heading", { name: "Capacité et décision", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calcul", level: 2 })).toBeVisible();
    await expect(page.getByText(/Résultat comptable.*résultat fiscal/iu).first()).toBeVisible();

    const review = page.getByRole("region", { name: "Revue append-only des constats fiscaux" });
    await review.getByLabel("Commentaire de revue fiscale").fill("Revue synthétique TAX-10");
    await review.getByRole("button", { name: "Enregistrer la revue fiscale" }).click();
    await expect(review.getByRole("status")).toContainText("Événement append-only 1");

    await review.getByLabel("Action de revue fiscale").selectOption("attach_evidence");
    await review.getByLabel("Justificatif fiscal").setInputFiles({
      name: "justificatif-synthetique.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("TAX-10 SYNTHETIC EVIDENCE\n", "utf8"),
    });
    await review.getByRole("button", { name: "Enregistrer la revue fiscale" }).click();
    await expect(review.getByRole("status")).toContainText("Événement append-only 2");

    const exports = page.getByRole("region", { name: "Exports du dossier de preuve fiscal" });
    await exports.getByRole("button", { name: "Vérifier" }).click();
    await expect(exports.getByRole("status")).toContainText("Hashes vérifiés · 9 artefacts");

    const noteDownload = page.waitForEvent("download");
    await exports.getByRole("button", { name: "Note HTML" }).click();
    const note = await noteDownload;
    expect(note.suggestedFilename()).toBe("fiscal-note.html");
    expect(await readDownload(note)).toContain("Note fiscale");

    const manifestDownload = page.waitForEvent("download");
    await exports.getByRole("button", { name: "Manifeste" }).click();
    const manifest = JSON.parse(await readDownload(await manifestDownload)) as {
      artifacts: unknown[];
      reviewEventsDigest: string;
      sourceDocuments: { id: string }[];
    };
    expect(manifest.artifacts).toHaveLength(9);
    expect(manifest.reviewEventsDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.sourceDocuments.some((document) => document.id === "tax-evidence-demo-2")).toBe(true);
  });

  test("état d'erreur explicite pour un format non pris en charge", async ({ page }) => {
    await page.goto("/dashboard/depot");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "fixture-synthetique.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("synthetic", "utf8"),
    });
    await expect(page.getByText(/Format non supporté/u)).toBeVisible();
  });
});

test.describe("TAX-10 — QA visuelle du cockpit fiscal", () => {
  test("cinq viewports sans débordement horizontal", async ({ page }, testInfo) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard/fiscalite");
      await expect(page.getByRole("heading", { name: "Capacité et décision", level: 2 })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth, `${viewport.name} déborde horizontalement`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      await testInfo.attach(`tax-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  });

  test("console, réseau et navigation clavier restent propres", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "unknown";
      // Next précharge les routes RSC du menu puis peut annuler ces requêtes
      // lorsque l'URL est remplacée côté client. Ce n'est pas une panne réseau.
      if (failure === "net::ERR_ABORTED" && request.url().includes("_rsc=")) return;
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });
    await page.goto("/dashboard/fiscalite");
    await page.waitForLoadState("networkidle");

    const vat = page.getByRole("button", { name: "TVA", exact: true });
    await vat.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/impot=vat/u);
    await expect(vat).toHaveAttribute("aria-pressed", "true");
    const actionableConsoleErrors = consoleErrors.filter((message) =>
      !message.includes("upgrade-insecure-requests") || !message.includes("report-only"));
    expect(actionableConsoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("contrastes WCAG et reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/fiscalite");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await page.addScriptTag({ path: AXE_PATH });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } }).axe;
      const result = await axe.run({ runOnly: { type: "rule", values: ["color-contrast"] } });
      return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, count: violation.nodes.length }));
    });
    expect(violations.filter((violation) => violation.impact === "critical")).toEqual([]);
    const contrast = violations.find((violation) => violation.id === "color-contrast");
    expect(contrast?.count ?? 0).toBeLessThanOrEqual(10);
  });
});
