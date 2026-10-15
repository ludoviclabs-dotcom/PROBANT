import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cashMapping, cashPeriod } from "../lib/workpapers/__tests__/cash-reconciliation-fixtures";
import { periodId, type WorkpaperRun } from "../lib/workpapers/model";

/**
 * C07 — profil personnel local, écrans réels.
 *
 * S'exécute contre un profil personnel démarré par `npm run local:start` :
 *   PROBANT_E2E_LOCAL_HOME=<dossier du profil> PROBANT_E2E_BASE_URL=http://127.0.0.1:3210 npx playwright test e2e/c07-profil-local.spec.ts
 * Sans ces variables le parcours est ignoré (statut « non vérifié »), jamais simulé.
 * Aucune donnée réelle : pièces synthétiques de docs/recette/c07/pieces.
 */
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const CAPTURES = path.join(process.cwd(), "docs", "probant-lots", "c07-captures");
const PIECES = path.join(process.cwd(), "docs", "recette", "c07", "pieces");
const WIDTHS = [1440, 1024, 390] as const;
const PID = periodId(cashPeriod);
const TYPES = ["cash_ledger", "cash_statement", "cash_erb", "cash_settlements", "cash_support"] as const;
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

test.skip(!HOME || !process.env.PROBANT_E2E_BASE_URL, "Profil personnel local non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
test.describe.configure({ mode: "serial" });

function loginUrl(next = "/local") {
  const r = spawnSync(process.execPath, [path.join("scripts", "local", "probant-local.mjs"), "login", "--home", HOME, "--sans-navigateur", "--vers", next], { encoding: "utf8", windowsHide: true });
  const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(r.stdout ?? "")?.[1];
  if (!url) throw new Error("Lien de connexion introuvable : " + r.stdout + r.stderr);
  return url;
}
async function signedInPage(browser: Browser, width: number, next = "/local") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(loginUrl(next));
  return page;
}
async function noOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1);
}
async function axeSerious(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id);
  });
}
async function capture(page: Page, name: string) {
  mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, name + ".jpg"), type: "jpeg", quality: 82, fullPage: true });
}

type ApiInit = { json?: unknown; form?: Record<string, string | { name: string; type: string; text: string }> };
/** Appel d'API depuis la page : le cookie de session `Secure` de 127.0.0.1 n'est envoyé que par le navigateur. */
async function api(page: Page, path: string, init: ApiInit = {}) {
  return page.evaluate(async ({ path, init }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const headers: Record<string, string> = { "x-probant-csrf": session.csrfToken, "Idempotency-Key": crypto.randomUUID() };
    let body: BodyInit | undefined;
    if (init.form) { const form = new FormData(); for (const [k, v] of Object.entries(init.form)) form.set(k, typeof v === "string" ? v : new File([v.text], v.name, { type: v.type })); body = form; }
    else if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    const r = await fetch(path, { method: body ? "POST" : "GET", headers, body, cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { path, init });
}

/** Prépare par l'API, dans la session de la page, une feuille Trésorerie exécutée ; les attendus sont ceux de la recette C07. */
async function executedCashRun(page: Page, label: string) {
  const created = await api(page, "/api/local/dossiers", { json: { legalName: "Écrans C07 · " + label + " · " + Date.now(), financialYear: "2024" } });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const dossierId = created.body.dossier.id as string;
  const imports = "/api/workpapers/cash/imports?dossierId=" + dossierId + "&periodId=" + PID, base = "/api/workpapers/cash?dossierId=" + dossierId + "&periodId=" + PID;
  const ids: Record<string, string> = {};
  for (const type of TYPES) {
    const preview = await api(page, imports, { form: { file: { name: type + ".csv", type: "text/csv", text: readFileSync(path.join(PIECES, type + ".csv"), "utf8") }, mapping: JSON.stringify(cashMapping(type)), period: JSON.stringify(cashPeriod), documentType: type } });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const approved = await api(page, imports, { json: { command: "approve_import", importId: preview.body.batch.id, previewHash: preview.body.batch.previewHash, expectedSourceId: null } });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    ids[type] = preview.body.batch.id;
  }
  const command = async (body: object) => { const r = await api(page, base, { json: body }); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.run as WorkpaperRun; };
  const window = { startDate: "2025-01-01", endDate: "2025-02-28", coverage: "documented", note: "Relevés de janvier et février 2025 obtenus", evidenceImportIds: [ids.cash_settlements] };
  let run = await command({ command: "create", period: cashPeriod });
  run = await command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), window });
  run = await command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { window, exclusions: [], allocations: [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }], corrections: [] } });
  run = await command({ command: "execute", id: run.id, expectedVersion: run.version });
  return { dossierId, run, command };
}

test("page /local : profil, relecture, dossiers et liens de travail aux trois largeurs", async ({ browser }) => {
  for (const width of WIDTHS) {
    const page = await signedInPage(browser, width);
    await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
    await expect(page.getByLabel("Contexte d'exécution")).toContainText("Relecture personnelle nommée");
    await expect(page.locator("[data-review-kind=personal]")).toContainText("vous relisez votre propre travail");
    if (width === 1440) {
      await page.getByLabel("Raison sociale").fill("Écrans C07 SARL");
      await page.getByLabel("Exercice").fill("2024");
      await page.getByRole("button", { name: "Créer le dossier" }).click();
      await expect(page.getByRole("status").filter({ hasText: /Dossier créé|existait déjà/ })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: /^Travaux · / })).toBeVisible();
    // C13 : feuille Emprunts ajoutée (une entrée par route du registre, plus le dossier de clôture).
    await expect(page.locator("ul a[href*='?dossierId=']")).toHaveCount(13);
    expect(await noOverflow(page), "débordement horizontal à " + width).toBe(true);
    expect(await axeSerious(page), "axe serious/critical à " + width).toEqual([]);
    await capture(page, "local-" + width);
    await page.context().close();
  }
});

test("page /local sans session : connexion locale demandée, aucune donnée", async ({ browser }) => {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/local");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion locale requise" })).toBeVisible();
    await expect(page.getByText("Recette C07 SAS")).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    if (width === 390) await capture(page, "local-sans-session-390");
    await context.close();
  }
});

test("feuille Trésorerie : profil personnel affiché, relecture personnelle annoncée et possible", async ({ browser }) => {
  for (const width of WIDTHS) {
    const page = await signedInPage(browser, width);
    await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
    const { dossierId, run, command } = await executedCashRun(page, String(width));
    let next = await command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Pont concordant ; suspens documenté." });
    next = await command({ command: "resolve", id: next.id, expectedVersion: next.version, noteId: next.notes.find(n => n.blocking)!.id, text: "Chèque remis, débit attendu en mars." });
    next = await command({ command: "submit", id: next.id, expectedVersion: next.version });
    await page.goto("/tresorerie?dossierId=" + dossierId + "&periodId=" + PID + "&id=" + encodeURIComponent(next.id) + "&filter=review");
    await expect(page.getByText("Mission · profil personnel local · identité serveur")).toBeVisible();
    await expect(page.getByLabel("Contexte du dossier")).toContainText("réel — profil personnel local");
    await expect(page.locator("[data-review-kind=personal]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Approuver/ })).toBeVisible();
    expect(await noOverflow(page), "débordement horizontal à " + width).toBe(true);
    expect(await axeSerious(page), "axe serious/critical à " + width).toEqual([]);
    await capture(page, "tresorerie-relecture-" + width);
    await page.context().close();
  }
});

test("deux onglets : la sauvegarde de l'onglet périmé ouvre le conflit sans perdre sa saisie", async ({ browser }) => {
  const tabA = await signedInPage(browser, 1440);
  await expect(tabA.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  const { dossierId, run } = await executedCashRun(tabA, "onglets");
  const sheet = "/tresorerie?dossierId=" + dossierId + "&periodId=" + PID + "&id=" + encodeURIComponent(run.id) + "&filter=exceptions";
  const tabB = await tabA.context().newPage();
  await tabA.goto(sheet); await tabB.goto(sheet);
  for (const tab of [tabA, tabB]) await expect(tab.getByLabel("Conclusion", { exact: true })).toBeEditable();
  await tabB.getByLabel("Conclusion", { exact: true }).fill("Conclusion enregistrée depuis l'onglet B.");
  await tabB.getByRole("button", { name: "Sauvegarder la conclusion" }).click();
  await expect(tabB.getByRole("status").filter({ hasText: "Sauvegardée" })).toBeVisible();
  await tabA.getByLabel("Conclusion", { exact: true }).fill("Conclusion saisie dans l'onglet A, resté sur l'ancienne version.");
  await tabA.getByRole("button", { name: "Sauvegarder la conclusion" }).click();
  await expect(tabA.getByRole("alert").filter({ hasText: "Une autre modification a été sauvegardée" })).toBeVisible();
  await expect(tabA.getByLabel("Conclusion", { exact: true })).toHaveValue("Conclusion saisie dans l'onglet A, resté sur l'ancienne version.");
  await capture(tabA, "tresorerie-conflit-onglets-1440");
  await tabA.context().close();
});
