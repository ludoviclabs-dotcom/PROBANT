import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loanSyntheticFiles, LOAN_PERIOD } from "../lib/workpapers/loan-fixture";
import { periodId, type WorkpaperRun } from "../lib/workpapers/model";

/**
 * C13 — feuille Emprunts, écrans réels.
 * 1. Exemple synthétique en lecture seule (/emprunts?demo=1), calculé par le moteur côté serveur : toujours joué.
 * 2. Parcours persistant sur un profil personnel local démarré (`npm run local:start`) :
 *    PROBANT_E2E_LOCAL_HOME=<profil> PROBANT_E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test e2e/c13-emprunts.spec.ts
 *    Sans ces variables, ce parcours est ignoré (non vérifié), jamais simulé.
 * Captures : docs/probant-lots/c13-captures (C13_OUT pour les déplacer). Données exclusivement synthétiques.
 */
const OUT = process.env.C13_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c13-captures");
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const LOCAL = !!HOME && !!process.env.PROBANT_E2E_BASE_URL;
const WIDTHS = [1440, 1024, 390] as const;
const PID = periodId(LOAN_PERIOD);
const AXE = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({ doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth], main: [document.querySelector("main")?.scrollWidth ?? 0, document.querySelector("main")?.clientWidth ?? 0] }));
  expect(m.doc[0], "débordement horizontal du document").toBeLessThanOrEqual(m.doc[1] + 1);
  expect(m.main[0], "débordement horizontal de <main>").toBeLessThanOrEqual(m.main[1] + 1);
}
async function axe(page: Page) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
async function capture(page: Page, name: string, full = true) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78, fullPage: full });
}
const panel = (page: Page) => page.getByRole("complementary", { name: "Contrat, échéance et preuves" });
const dues = (page: Page) => page.getByRole("region", { name: /Échéancier — défilement/ });

test.describe("C13 · exemple synthétique en lecture seule", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : échéancier, filtre par mois, panneau de détail, cadrage et accessibilité`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
      await page.goto("/emprunts?demo=1");
      await expect(page.getByRole("heading", { name: "Échéances de l’exercice" })).toBeVisible();
      await expect(page.getByText("Non concluant sur une partie de la population")).toBeVisible();
      await noOverflow(page); await axe(page);
      await capture(page, "exemple-" + width);
      const rows = await dues(page).getByRole("row").count();
      await page.getByRole("button", { name: /^Oct\. : 3\séchéances/ }).click();
      await expect(page.getByRole("heading", { name: "Échéances · Oct." })).toBeVisible();
      await expect(dues(page).getByRole("row")).toHaveCount(4);
      await page.getByRole("button", { name: /Année entière/ }).click();
      await expect(dues(page).getByRole("row")).toHaveCount(rows);
      const trigger = page.getByRole("region", { name: /Contrats — défilement/ }).getByRole("button", { name: /Atlas/ });
      await trigger.click();
      await expect(panel(page).getByRole("heading", { name: /Atlas/ })).toBeFocused();
      await expect(panel(page).getByText("Résidu à expliquer")).toBeVisible();
      await expect(panel(page).getByText("+10 000,00 EUR")).toBeVisible();
      await expect(panel(page).getByText("Aucun ratio calculé ; aucune conformité de financement déduite.")).toBeVisible();
      expect(await panel(page).evaluate(el => getComputedStyle(el).animationName)).toBe("none");
      await noOverflow(page); await axe(page);
      await panel(page).scrollIntoViewIfNeeded();
      await capture(page, "exemple-panneau-" + width);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      const framing = page.getByRole("region", { name: /Cadrage — défilement/ });
      await expect(framing).toContainText("168100");
      await expect(framing).toContainText("+15 000,00 EUR");
      await context.close();
    });
  }

  test("recette simple : 100 000 − 10 000 = 90 000 et 250 en 30/360, aucune différence ; segment visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/emprunts?demo=1&case=simple");
    await expect(page.getByText("Aucune différence relevée sur la population testée")).toBeVisible();
    await dues(page).getByRole("button", { name: /C13-SIMPLE-E20260201/ }).click();
    await expect(panel(page)).toContainText("100 000,00 EUR × taux fixe 3 % × 30 jours / 360 (30/360)");
    await expect(panel(page)).toContainText("90 000,00 EUR");
    await capture(page, "recette-simple-1440");
  });

  test("taux absent, vue vide, export du diagnostic et chaîne persistante fermée sans profil", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/emprunts?demo=1&contract=C13-VARIABLE");
    await expect(page.getByRole("region", { name: /Intérêts courus — défilement/ })).toContainText("Taux absent : index « Euribor 3 mois » non fourni pour la révision du 2026-10-01");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Diagnostic de la version (HTML)" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("EXEMPLE-emprunts-diagnostic-v1.html");
    const html = await (await page.request.get("/api/workpapers/emprunts/demo?format=html")).text();
    expect(html).toContain("Résidu de principal à expliquer"); expect(html).toContain("PCG consolidé au 1er janvier 2026");
    await page.goto("/emprunts?demo=1&case=empty");
    await expect(page.getByRole("heading", { name: "Aucun contrat dans cette vue" })).toBeVisible();
    const closed = await page.request.get("/api/workpapers/emprunts?dossierId=11111111-1111-4111-8111-111111111111&periodId=" + PID);
    expect(closed.status()).toBe(503);
    expect(await closed.json()).toEqual({ error: "LOAN_DURABLE_DISABLED" });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/emprunts?dossierId=11111111-1111-4111-8111-111111111111&periodId=" + PID);
    await expect(page.locator("main").getByRole("alert")).toContainText(/Session requise|fermée sur ce serveur/);
    await noOverflow(page);
    await capture(page, "sans-session-390");
  });
});

/* ── Profil personnel local : parcours persistant complet ───────────────────────────────────────────── */

function loginUrl(next: string) {
  const r = spawnSync(process.execPath, [path.join("scripts", "local", "probant-local.mjs"), "login", "--home", HOME, "--sans-navigateur", "--vers", next], { encoding: "utf8", windowsHide: true });
  const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(r.stdout ?? "")?.[1];
  if (!url) throw new Error("Lien de connexion introuvable : " + r.stdout + r.stderr);
  return url;
}
async function signedIn(browser: Browser, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(loginUrl("/local"));
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  return page;
}
async function api(page: Page, url: string, init: { json?: unknown; form?: Record<string, string | { name: string; type: string; text: string }> } = {}) {
  return page.evaluate(async ({ url, init }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const headers: Record<string, string> = { "x-probant-csrf": session.csrfToken, "Idempotency-Key": crypto.randomUUID() };
    let body: BodyInit | undefined;
    if (init.form) { const form = new FormData(); for (const [k, v] of Object.entries(init.form)) form.set(k, typeof v === "string" ? v : new File([v.text], v.name, { type: v.type })); body = form; }
    else if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    const r = await fetch(url, { method: body ? "POST" : "GET", headers, body, cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { url, init });
}
async function newDossier(page: Page, label: string) {
  const created = await api(page, "/api/local/dossiers", { json: { legalName: "Emprunts C13 · " + label + " · " + Date.now(), financialYear: "2026" } });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.dossier.id as string;
}
const sheet = (dossierId: string) => "/emprunts?" + new URLSearchParams({ dossierId, periodId: PID });

test.describe("C13 · profil personnel local, chaîne persistante", () => {
  test.skip(!LOCAL, "Profil personnel local non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
  test.describe.configure({ mode: "serial" });

  test("import par l’écran → population → calcul → relecture personnelle nommée → verrouillage → export", async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await signedIn(browser, 1440), dossierId = await newDossier(page, "écran");
    await page.goto("/emprunts?dossierId=" + dossierId);
    for (const [label, value] of [["Début d’exercice", LOAN_PERIOD.startDate], ["Clôture", LOAN_PERIOD.closingDate], ["Date de revue", LOAN_PERIOD.asOfDate]] as const) await page.getByLabel(label).fill(value);
    await page.getByRole("button", { name: "Charger la feuille" }).click();
    await expect(page.getByRole("heading", { name: "Feuille Emprunts de l’exercice" })).toBeVisible();
    await expect(page.getByText("Mission · profil personnel local · identité serveur")).toBeVisible();
    for (const [type, file] of Object.entries(loanSyntheticFiles("simple"))) {
      await page.getByLabel(/Fichier CSV ou XLSX/).setInputFiles({ name: type + ".csv", mimeType: "text/csv", buffer: Buffer.from(await file.text()) });
      await expect(page.getByLabel("Type de source")).toHaveValue(type);
      await page.getByRole("button", { name: "Lire et conserver l’aperçu" }).click();
      await page.getByRole("button", { name: /^Approuver cette version/ }).first().click();
      await expect(page.getByRole("button", { name: /^Approuver cette version/ })).toHaveCount(0);
      await expect(page.getByText("Enregistré — accusé serveur reçu")).toBeVisible();
    }
    await capture(page, "local-sources-1440");
    await page.getByRole("button", { name: "Créer la feuille Emprunts" }).click();
    await page.getByRole("tab", { name: "Revue" }).click();
    await page.getByRole("button", { name: "Figer les sources et calculer" }).click();
    await page.getByRole("tab", { name: /Tests/ }).click();
    await expect(page.getByText("Aucune différence relevée sur la population testée")).toBeVisible();
    await page.getByRole("tab", { name: "Revue" }).click();
    await page.getByLabel("Conclusion motivée de la préparation").fill("Recette simple : principal 90 000 et intérêt de janvier 250 concordants sur les sources fournies.");
    await page.getByLabel("Pièce citée").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Enregistrer la conclusion" }).click();
    await expect(page.getByText(/^Conclusion :/)).toBeVisible();
    await page.getByRole("button", { name: "Soumettre à la relecture" }).click();
    await expect(page.locator("[data-review-kind=personal]")).toContainText("vous relisez votre propre travail");
    await page.getByLabel("Décision motivée de relecture").fill("Relecture personnelle des liens échéance / GL / paiement et du calcul 30/360.");
    await page.getByLabel("Pièce citée").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Approuver cette version" }).click();
    await expect(page.getByText(/Relecture personnelle nommée/)).toBeVisible();
    await page.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
    await expect(page.getByText(/État : verrouillée/)).toBeVisible();
    await noOverflow(page); await axe(page);
    await capture(page, "local-verrouillee-1440");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Diagnostic de la version (HTML)" }).click();
    const file = await download, saved = path.join(OUT, "local-diagnostic.html");
    mkdirSync(OUT, { recursive: true }); await file.saveAs(saved);
    await page.context().close();
  });

  test("pack complet persistant : exceptions, panneau et cadrage aux trois largeurs ; échéancier remplacé → périmée", async ({ browser }) => {
    test.setTimeout(240_000);
    const first = await signedIn(browser, 1440), dossierId = await newDossier(first, "pack complet");
    const imports = "/api/workpapers/emprunts/imports?dossierId=" + dossierId + "&periodId=" + PID, base = "/api/workpapers/emprunts?dossierId=" + dossierId + "&periodId=" + PID;
    const ids: string[] = [];
    for (const [type, file] of Object.entries(loanSyntheticFiles("complete"))) {
      const preview = await api(first, imports, { form: { file: { name: type + ".csv", type: "text/csv", text: await file.text() }, mapping: JSON.stringify({ version: "loans-review-1", headerRow: 1, delimiter: ";", decimal: ".", dateFormat: "ISO", currency: "EUR", sign: 1, columns: { key: "Key", amount: "Amount", date: "Date" } }), period: JSON.stringify(LOAN_PERIOD), documentType: type } });
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      const approved = await api(first, imports, { json: { command: "approve_import", importId: preview.body.batch.id, previewHash: preview.body.batch.previewHash, expectedSourceId: null } });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      ids.push(preview.body.batch.id);
    }
    const command = async (body: object) => { const r = await api(first, base, { json: body }); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.run as WorkpaperRun; };
    let run = await command({ command: "create_loans", period: LOAN_PERIOD, instanceKey: "c13-e2e" });
    run = await command({ command: "freeze_loans", id: run.id, expectedVersion: run.version, importIds: ids, criteria: "Pack complet C13" });
    run = await command({ command: "execute", id: run.id, expectedVersion: run.version });
    await first.context().close();
    for (const width of WIDTHS) {
      const page = await signedIn(browser, width);
      await page.goto(sheet(dossierId) + "&id=" + encodeURIComponent(run.id));
      await expect(page.getByText("Non concluant sur une partie de la population")).toBeVisible();
      await page.getByRole("region", { name: /Contrats — défilement/ }).getByRole("button", { name: /Atlas/ }).click();
      await expect(panel(page).getByText("Résidu à expliquer")).toBeVisible();
      await noOverflow(page); await axe(page);
      await capture(page, "local-pack-" + width);
      await page.getByRole("tab", { name: /Exceptions/ }).click();
      await expect(page.getByText(/Mismatch de périmètre au compte 168100/)).toBeVisible();
      await noOverflow(page);
      if (width === 390) await capture(page, "local-exceptions-390");
      await page.context().close();
    }
    const last = await signedIn(browser, 1024);
    const rows = loanSyntheticFiles("complete").loan_schedule, text = (await rows.text()).replace("\"\"contractVersion\"\":\"\"2\"\",\"\"start\"\":\"\"2026-07-01\"\"", "\"\"contractVersion\"\":\"\"1\"\",\"\"start\"\":\"\"2026-07-01\"\"");
    const preview = await api(last, imports, { form: { file: { name: "loan_schedule.csv", type: "text/csv", text }, mapping: JSON.stringify({ version: "loans-review-1", headerRow: 1, delimiter: ";", decimal: ".", dateFormat: "ISO", currency: "EUR", sign: 1, columns: { key: "Key", amount: "Amount", date: "Date" } }), period: JSON.stringify(LOAN_PERIOD), documentType: "loan_schedule" } });
    expect(preview.status).toBe(200);
    const head = (await api(last, base)).body.sourceHeads.find((h: { document_type: string }) => h.document_type === "loan_schedule").import_id;
    expect((await api(last, imports, { json: { command: "approve_import", importId: preview.body.batch.id, previewHash: preview.body.batch.previewHash, expectedSourceId: head } })).status).toBe(200);
    await last.goto(sheet(dossierId) + "&id=" + encodeURIComponent(run.id));
    await expect(last.getByText(/Feuille périmée : une source a été remplacée/)).toBeVisible();
    await capture(last, "local-perimee-1024");
    await last.context().close();
  });
});
