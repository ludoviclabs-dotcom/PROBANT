import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LEASE_EU_TEXT } from "../lib/ifrs/leases/rule";
import { LEASE_PERIOD } from "../lib/workpapers/lease-fixture";
import { periodId } from "../lib/workpapers/model";
import * as local from "./ifrs-local-helpers";
import { api, axeSerious, csv, LEASE_TYPES as TYPES, noOverflow, runningMotion } from "./ifrs-local-helpers";

/**
 * Parcours réel en juridiction « IFRS adoptées dans l'UE » sur un profil personnel local **jetable**, après la relecture nommée du texte UE
 * (`LEASE_RULE_REVIEW_EU`, règlement (UE) 2023/1803 dans sa version d'origine) :
 *
 *   node scripts/local/probant-local.mjs start --home <dossier> --sans-navigateur
 *   PROBANT_E2E_LOCAL_HOME=<dossier> PROBANT_E2E_BASE_URL=http://127.0.0.1:<a> npx playwright test e2e/ifrs-ue-parcours-local.spec.ts
 *
 * Sans ces variables, ou sans relecture UE consignée, le parcours est ignoré (non vérifié), jamais simulé. La feuille choisit l'UE à l'écran,
 * déclare l'édition et l'empreinte du texte relu, calcule les mêmes montants que sous l'IASB (aucune divergence de traduction consignée) et
 * les exports nomment ce référentiel. Sources synthétiques de `lib/workpapers/lease-fixture.ts`.
 */
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const BASE = process.env.PROBANT_E2E_BASE_URL ?? "";
const OUT = path.join(process.cwd(), "docs", "ifrs", "captures", "ue");
const PID = periodId(LEASE_PERIOD);
const EU_FRAMEWORK = { standard: "IFRS 16", jurisdiction: "EU_adopted", edition: LEASE_EU_TEXT.edition, editionFingerprint: LEASE_EU_TEXT.sha256 };

test.skip(!HOME || !BASE, "Profil local jetable non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
test.describe.configure({ mode: "serial", timeout: 300_000 });

const signedInPage = (browser: Browser, width: number, next = "/local") => local.signedInPage(browser, HOME, width, next);
const capture = (page: Page, name: string) => local.capture(page, OUT, name);

const S = { dossierId: "", legalName: "", runId: "" };
const leasesUrl = () => "/api/workpapers/locations-ifrs16?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
const sheetHref = () => "/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
type Run = { id: string; version: number; state: string; conclusion?: string; leaseWork?: { framework: unknown } };
type Read = { runs: Run[]; contentHashes: Record<string, string>; capability: { jurisdictions: { jurisdiction: string }[] } };

test("UE-P1 · référentiel UE choisi à l'écran → calcul réel aux montants IASB → relecture personnelle → verrouillage → exports qui nomment le texte relu", async ({ browser }) => {
  const page = await signedInPage(browser, 1440);
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  S.legalName = "Recette UE SAS · " + new Date().toISOString().slice(0, 19);
  await page.getByLabel("Raison sociale").fill(S.legalName);
  await page.getByLabel("Exercice").fill("2026");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Dossier créé/ })).toBeVisible();
  S.dossierId = (await api(page, "/api/local/dossiers")).body.dossiers.find((d: { legalName: string }) => d.legalName === S.legalName).id;
  const sheet = async () => ((await api(page, leasesUrl())).body as Read).runs.find(r => r.id === S.runId)!;

  await page.goto("/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId }));
  await expect(page.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
  await page.getByLabel("Début d'exercice").fill(LEASE_PERIOD.startDate);
  await page.getByLabel("Clôture").fill(LEASE_PERIOD.closingDate);
  await page.getByLabel("Date de revue").fill(LEASE_PERIOD.asOfDate);
  await page.getByRole("button", { name: "Ouvrir la feuille" }).click();
  await page.getByRole("button", { name: "Créer la feuille de l'exercice" }).click();
  await expect(page.getByText("Accusé serveur reçu")).toBeVisible();
  // The server offers both jurisdictions once the EU text has its named review; otherwise this journey is not verifiable.
  const offered = ((await api(page, leasesUrl())).body as Read).capability.jurisdictions.map(j => j.jurisdiction);
  test.skip(!offered.includes("EU_adopted"), "Relecture nommée du texte UE non consignée : juridiction UE non proposée, parcours non vérifié.");
  expect(offered).toEqual(["IASB", "EU_adopted"]);

  for (const [type, label] of TYPES) {
    const file = await csv(type);
    await page.getByLabel("Type de source").selectOption(type);
    await page.getByLabel("Fichier CSV (Key ; Amount ; Date ; Details)").setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text, "utf8") });
    await page.getByRole("button", { name: "Lire et conserver l'aperçu" }).click();
    await page.getByRole("button", { name: /^Approuver cette version/ }).click();
    await expect(page.locator("section[aria-labelledby='l16-sources-title']").locator("li").filter({ has: page.getByText(label, { exact: true }) })).toContainText("approuvée le");
  }
  // The jurisdiction is chosen from the server's options; the saved work carries the edition and the fingerprint of the reviewed text.
  await page.getByLabel("Référentiel de la feuille").selectOption("EU_adopted");
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau")).toBeVisible();
  await page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau").selectOption("not_elected");
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByText("Enregistré — version serveur reçue")).toBeVisible();
  S.runId = ((await api(page, leasesUrl())).body as Read).runs[0].id;
  expect((await sheet()).leaseWork!.framework).toEqual(EU_FRAMEWORK);
  await expect(page.getByLabel("Référentiel de la feuille")).toHaveValue("EU_adopted");
  // The context band names the sheet's own framework, not a fixed IASB label.
  await expect(page.getByText("IFRS 16 · UE (règlement 2023/1803)")).toBeVisible();

  await page.getByRole("button", { name: "Figer la population" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("ready");
  await page.getByRole("button", { name: "Calculer" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("executed");
  // Same oracle figures as the IASB journey (L16-06): no translation difference was recorded.
  await expect(page.getByText(/22\s819,76/).first()).toBeVisible();
  await expect(page.getByText(/X33/)).toHaveCount(0);
  await capture(page, "ue-calcule-1440");

  const review = page.locator("section[aria-labelledby='l16-review-title']");
  await review.getByLabel("Conclusion de la feuille").fill("Dette et droit d'utilisation recalculés sous IFRS adoptées dans l'UE (règlement 2023/1803) ; loyers cadrés sur la base PCG ; impôt non calculé.");
  await review.getByRole("button", { name: "Enregistrer la conclusion citée" }).click();
  await expect.poll(async () => !!(await sheet()).conclusion).toBe(true);
  await review.getByRole("button", { name: "Soumettre à la relecture" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("awaiting_review");
  await review.getByLabel("Note de relecture").fill("Relecture personnelle de la feuille en juridiction UE.");
  await review.getByRole("button", { name: "Approuver cette version" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("approved");
  await review.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("locked");

  const reviewed = page.getByRole("group", { name: "Export revu" });
  const [html] = await Promise.all([page.waitForEvent("download"), reviewed.getByRole("button", { name: "Rapport HTML imprimable" }).click()]);
  const report = readFileSync((await html.path())!, "utf8");
  expect(report).toContain("Revu sur ce périmètre");
  expect(report).toContain("<td>Référentiel</td><td>IFRS 16 · EU_adopted · " + LEASE_EU_TEXT.edition + " · empreinte du texte " + LEASE_EU_TEXT.sha256 + "</td>");
  expect(report).toContain("débit 51 901,17 €, crédit 51 901,17 €");
  const run = await sheet(), read = (await api(page, leasesUrl())).body as Read;
  const json = await api(page, "/api/workpapers/locations-ifrs16/export?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { id: run.id, version: run.version, expectedHash: read.contentHashes[run.id], format: "json", kind: "reviewed" } });
  expect(json.status).toBe(200);
  await review.scrollIntoViewIfNeeded();
  await capture(page, "ue-revu-verrouille-1440");
  await page.context().close();
});

test("UE-P2 · états réels à 1440, 1024 et 390 : référentiel UE affiché, sans débordement, axe sans violation grave, mouvement réduit", async ({ browser }) => {
  test.skip(!S.runId, "UE-P1 non exécuté : non vérifié.");
  for (const width of [1440, 1024, 390]) {
    const page = await signedInPage(browser, width, sheetHref());
    await expect(page.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
    await expect(page.getByText(/r1 · v\d+ · verrouillée/)).toBeVisible();
    const select = page.getByLabel("Référentiel de la feuille");
    await expect(select).toHaveValue("EU_adopted");
    await expect(select).toBeDisabled();
    expect(await noOverflow(page), "débordement à " + width).toBe(true);
    expect(await axeSerious(page), "axe à " + width).toEqual([]);
    expect(await runningMotion(page), "animation à " + width).toBe(0);
    await select.scrollIntoViewIfNeeded();
    await capture(page, "ue-referentiel-" + width);
    await page.context().close();
  }
});
