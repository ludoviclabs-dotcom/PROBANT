import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LEASE_PERIOD, leaseFiles } from "../lib/workpapers/lease-fixture";
import { LEASE_MAPPING, type LeaseType } from "../lib/workpapers/lease-sources";
import { periodId } from "../lib/workpapers/model";

/**
 * L16-06 — parcours réel de l'atelier Locations sur un profil personnel local **jetable** (PostgreSQL 17 + `next start` lancés par le lanceur) :
 *
 *   node scripts/local/probant-local.mjs init --home <dossier vide> --nom "Camille Recette" --port-pg <p> --port-app <a>
 *   node scripts/local/probant-local.mjs start --home <dossier> --sans-navigateur
 *   PROBANT_E2E_LOCAL_HOME=<dossier> PROBANT_E2E_BASE_URL=http://127.0.0.1:<a> npx playwright test e2e/ifrs-l16-06-parcours-local.spec.ts
 *
 * Sans ces variables le parcours est ignoré (non vérifié), jamais simulé. La règle `ifrs16.leases` porte la relecture personnelle nommée
 * consignée (juridiction IASB) : le parcours va de l'import à l'export revu et à la sélection au dossier de clôture, puis constate la péremption
 * après remplacement d'une source. Sources synthétiques de `lib/workpapers/lease-fixture.ts`.
 */
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const BASE = process.env.PROBANT_E2E_BASE_URL ?? "";
const OUT = path.join(process.cwd(), "docs", "ifrs", "captures", "l16-06");
const STATE = path.join(process.cwd(), "docs", "ifrs", "recette", "l16-06-parcours.json");
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const PID = periodId(LEASE_PERIOD);
const TYPES: [LeaseType, string][] = [["lease_contracts", "Contrats"], ["lease_assumptions", "Hypothèses"], ["lease_schedule", "Échéances et règlements"], ["lease_ledger", "Comptabilité (612 / 613 / 614)"]];

test.skip(!HOME || !BASE, "Profil local jetable non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
test.describe.configure({ mode: "serial", timeout: 300_000 });

function launcher(command: string, extra: string[] = []) {
  const r = spawnSync(process.execPath, [path.join("scripts", "local", "probant-local.mjs"), command, "--home", HOME, ...extra], { encoding: "utf8", windowsHide: true, timeout: 900_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function loginUrl(next = "/local") {
  const r = launcher("login", ["--sans-navigateur", "--vers", next]);
  const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(r.out)?.[1];
  if (!url) throw new Error("Lien de connexion introuvable : " + r.out);
  return url;
}
async function signedInPage(browser: Browser, width: number, next = "/local") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(loginUrl(next));
  return page;
}
const portOpen = (port: number) => new Promise<boolean>(resolve => { const s = connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); }); s.on("error", () => resolve(false)); });
const profileConfig = () => JSON.parse(readFileSync(path.join(HOME, "probant.local.json"), "utf8")) as { postgres: { port: number }; app: { port: number }; owner: { name: string } };
async function noOverflow(page: Page) { return page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1); }
async function axeSerious(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id + " " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | "));
  });
}
async function runningMotion(page: Page) { return page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 10).length); }
async function capture(page: Page, name: string, fullPage = false) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78, fullPage }); }
/** Server API from the page: the `__Host-` cookie of 127.0.0.1 is only sent by the browser. */
async function api(page: Page, url: string, init: { json?: unknown; form?: Record<string, string | { name: string; type: string; text: string }> } = {}) {
  return page.evaluate(async ({ url, init }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const headers: Record<string, string> = { "x-probant-csrf": session.csrfToken, "Idempotency-Key": crypto.randomUUID() };
    let body: BodyInit | undefined;
    if (init.form) { const form = new FormData(); for (const [k, v] of Object.entries(init.form)) form.set(k, typeof v === "string" ? v : new File([v.text], v.name, { type: v.type })); body = form; }
    else if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    const r = await fetch(url, { method: body ? "POST" : "GET", headers, body, cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => null), hash: r.headers.get("X-Probant-Business-Hash") };
  }, { url, init });
}
async function csv(type: LeaseType, edit?: Parameters<typeof leaseFiles>[0]) { const file = leaseFiles(edit)[type]!; return { name: file.name, text: await file.text() }; }

const S = { dossierId: "", legalName: "", runId: "", version: 0 };
const leasesUrl = (extra: Record<string, string> = {}) => "/api/workpapers/locations-ifrs16?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, ...extra });
const sheetHref = () => "/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
type Read = { runs: { id: string; version: number; state: string; conclusion?: string; importIds: string[]; leaseWork?: { policies: unknown[] }; population?: { hash: string } }[]; sourceHeads: { document_type: string; import_id: string }[];
  qualification: Record<string, { contracts: { contractId: string; status: string }[] } | null>; contentHashes: Record<string, string>; workspace: Record<string, { actions: Record<string, { allowed: boolean; reason: string | null }>; freshness: string }> };
/** What must survive a restart: the sheet, its frozen sources, its qualification, its allowed actions, and the bytes of its diagnostic export. */
async function readBack(page: Page) {
  const read = await api(page, leasesUrl());
  expect(read.status, JSON.stringify(read.body).slice(0, 400)).toBe(200);
  const v = read.body as Read, run = v.runs.find(r => r.id === S.runId)!;
  const exported = await api(page, "/api/workpapers/locations-ifrs16/export?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { id: run.id, version: run.version, expectedHash: v.contentHashes[run.id], format: "json", kind: "diagnostic" } });
  expect(exported.status).toBe(200);
  const closing = await api(page, "/api/workpapers/closing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  return { run: { id: run.id, version: run.version, state: run.state, importIds: run.importIds, policies: run.leaseWork?.policies ?? null, population: run.population?.hash ?? null },
    sourceHeads: v.sourceHeads, qualification: v.qualification[run.id]?.contracts.map(c => [c.contractId, c.status]) ?? null, contentHash: v.contentHashes[run.id],
    actions: Object.fromEntries(Object.entries(v.workspace[run.id].actions).map(([k, a]) => [k, a.allowed ? "permise" : a.reason])), exportHash: exported.hash,
    ifrsWorks: closing.status === 200 ? closing.body.projection.ifrsWorks : null };
}
let saved: Awaited<ReturnType<typeof readBack>> | null = null;

test("L16-06-P1 · dossier → feuille → sources approuvées → cadre et politiques → gel → calcul → conclusion → relecture personnelle → verrouillage → export revu → sélection au dossier de clôture", async ({ browser }) => {
  const page = await signedInPage(browser, 1440);
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  S.legalName = "Recette L16-06 SAS · " + new Date().toISOString().slice(0, 19);
  await page.getByLabel("Raison sociale").fill(S.legalName);
  await page.getByLabel("Exercice").fill("2026");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Dossier créé/ })).toBeVisible();
  S.dossierId = (await api(page, "/api/local/dossiers")).body.dossiers.find((d: { legalName: string }) => d.legalName === S.legalName).id;
  const sheet = async () => ((await api(page, leasesUrl())).body as Read).runs.find(r => r.id === S.runId)!;

  // Open the sheet of the exercise from its dates, then create it. The rule is reviewed: no « real calculation blocked » notice.
  await page.goto("/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId }));
  await expect(page.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
  await page.getByLabel("Début d'exercice").fill(LEASE_PERIOD.startDate);
  await page.getByLabel("Clôture").fill(LEASE_PERIOD.closingDate);
  await page.getByLabel("Date de revue").fill(LEASE_PERIOD.asOfDate);
  await page.getByRole("button", { name: "Ouvrir la feuille" }).click();
  await expect(page.getByRole("button", { name: "Créer la feuille de l'exercice" })).toBeEnabled();
  await expect(page.getByText("Calcul réel bloqué : règle à revoir")).toHaveCount(0);
  await expect(page.getByText(/ifrs16\.leases 1\.0\.0 · validée/)).toBeVisible();
  await page.getByRole("button", { name: "Créer la feuille de l'exercice" }).click();
  await expect(page.getByText("Accusé serveur reçu")).toBeVisible();
  // L16-06 fix: once the sheet exists, the address names its dossier and exercise, so a reload reopens it.
  await expect(page).toHaveURL(new RegExp("dossierId=" + S.dossierId + ".*periodId=" + PID + "|periodId=" + PID + ".*dossierId=" + S.dossierId));

  // Each source: preview kept, then approved; the head becomes the current version.
  for (const [type, label] of TYPES) {
    const file = await csv(type);
    await page.getByLabel("Type de source").selectOption(type);
    await page.getByLabel("Fichier CSV (Key ; Amount ; Date ; Details)").setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text, "utf8") });
    await page.getByRole("button", { name: "Lire et conserver l'aperçu" }).click();
    await page.getByRole("button", { name: /^Approuver cette version/ }).click();
    const sources = page.locator("section[aria-labelledby='l16-sources-title']");
    await expect(sources.locator("li").filter({ has: page.getByText(label, { exact: true }) })).toContainText("approuvée le");
  }
  // L16-06 fix: the first save of a new sheet is allowed without any prior edit; categories then appear for the policies.
  await expect(page.getByText(/Enregistrez d'abord le cadre de la feuille/)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau")).toBeVisible();
  await page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau").selectOption("not_elected");
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByText("Enregistré — version serveur reçue")).toBeVisible();
  const qualified = (await api(page, leasesUrl())).body as Read;
  S.runId = qualified.runs[0].id;
  expect(qualified.qualification[S.runId]!.contracts.map(c => [c.contractId, c.status])).toEqual([["F01", "eligible_v1"], ["F03", "eligible_v1"]]);

  await page.getByRole("button", { name: "Figer la population" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("ready");
  // Real calculation from the screen: F01 and F03 at the oracle's figures, framed on the PCG base, adjustment proposed.
  await page.getByRole("button", { name: "Calculer" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("executed");
  await expect(page.getByText(/22\s819,76/).first()).toBeVisible();
  await expect(page.getByLabel("Synthèse de revue", { exact: true })).toContainText("0 point(s) bloquant(s) ouvert(s)");
  await capture(page, "reel-calcule-1440");

  // Cited conclusion, submission, named personal review, lock: each step read back from the server.
  const review = page.locator("section[aria-labelledby='l16-review-title']");
  await review.getByLabel("Conclusion de la feuille").fill("Dette et droit d'utilisation recalculés sur paramètres sourcés ; loyers cadrés sur la base PCG ; retraitement proposé, impôt non calculé.");
  await review.getByRole("button", { name: "Enregistrer la conclusion citée" }).click();
  await expect.poll(async () => !!(await sheet()).conclusion).toBe(true);
  await review.getByRole("button", { name: "Soumettre à la relecture" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("awaiting_review");
  await review.getByLabel("Note de relecture").fill("Relecture personnelle des paramètres, de l'échéancier, du cadrage et des preuves citées.");
  await review.getByRole("button", { name: "Approuver cette version" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("approved");
  await review.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect.poll(async () => (await sheet()).state).toBe("locked");

  // Reviewed export of the locked version, from the screen: « revu sur ce périmètre », named reviewer, totals of the adjustment.
  const reviewed = page.getByRole("group", { name: "Export revu" });
  const [html] = await Promise.all([page.waitForEvent("download"), reviewed.getByRole("button", { name: "Rapport HTML imprimable" }).click()]);
  const report = readFileSync((await html.path())!, "utf8");
  expect(report).toContain("Revu sur ce périmètre");
  expect(report).toContain("relecture personnelle nommée de " + profileConfig().owner.name);
  expect(report).toContain("débit 51\u202f901,17\u00a0€, crédit 51\u202f901,17\u00a0€");
  expect(report).not.toMatch(/simulation non revue|conforme IFRS(?! ni)/);
  await review.scrollIntoViewIfNeeded();
  await capture(page, "reel-revu-verrouille-1440");

  // Closing file: the reviewed lineage is selected for the declared base; never an anomaly, posting still not documented.
  await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  const openForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ouvrir le dossier professionnel" }) });
  await openForm.getByLabel("Entité").fill(S.legalName);
  await openForm.getByLabel("Début d’exercice").fill(LEASE_PERIOD.startDate);
  await openForm.getByLabel("Clôture").fill(LEASE_PERIOD.closingDate);
  await openForm.getByLabel("Date de revue").fill(LEASE_PERIOD.asOfDate);
  await openForm.getByRole("button", { name: "Ouvrir le dossier" }).click();
  await page.getByRole("tab", { name: /^Programme/ }).click();
  const works = page.getByRole("region", { name: /Travaux IFRS/ });
  await expect(works).toContainText("1 lignée(s) IFRS observée(s) · 1 revue(s)");
  await works.getByText("Sélectionner ce retraitement pour la base de l'exercice").click();
  await works.getByRole("button", { name: /^Sélectionner r1 · v\d+$/ }).click();
  await expect(works).toContainText("Sélectionné pour la base déclarée");
  await expect(works).toContainText("non documentée : la sélection et le verrouillage ne la prouvent pas");
  await works.scrollIntoViewIfNeeded();
  await capture(page, "cloture-travaux-ifrs-1440");
  saved = await readBack(page);
  expect(saved.ifrsWorks.lineages[0].selection.status).toBe("selectionne");
  await page.context().close();
});

test("L16-06-P2 · arrêt de Next et de PostgreSQL, reprise : même feuille, mêmes sources, mêmes décisions, même empreinte d'export", async ({ browser }) => {
  expect(saved, "le parcours P1 doit avoir réussi").not.toBeNull();
  const cfg = profileConfig(), stopped = launcher("stop");
  expect(stopped.status, stopped.out).toBe(0);
  expect(await portOpen(cfg.app.port), "Next arrêté").toBe(false);
  expect(await portOpen(cfg.postgres.port), "PostgreSQL arrêté").toBe(false);
  const started = launcher("start", ["--sans-navigateur"]);
  expect(started.status, started.out).toBe(0);
  const page = await signedInPage(browser, 1440, sheetHref());
  await expect(page.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
  await expect(page.getByText(/r1 · v\d+ · verrouillée/)).toBeVisible();
  const back = await readBack(page);
  expect(back).toEqual(saved);
  writeFileSync(STATE, JSON.stringify({ capturedAt: new Date().toISOString(), dossierId: S.dossierId, periodId: PID, owner: cfg.owner.name, beforeRestart: saved, afterRestart: back }, null, 2) + "\n");
  await page.context().close();
});

test("L16-06-P3 · source remplacée après le verrouillage (par l'API : l'écran passe par une révision) : feuille à réexaminer, export revu refusé, sélection de clôture à réexaminer", async ({ browser }) => {
  const page = await signedInPage(browser, 1440, sheetHref());
  const before = (await api(page, leasesUrl())).body as Read;
  const ledger = await csv("lease_ledger", rows => { rows.lease_ledger[0].details = { ...rows.lease_ledger[0].details, fields: { ...(rows.lease_ledger[0].details.fields as object), piece: "FA-F01-2026-01-CORRIGEE" } }; });
  const preview = await api(page, "/api/workpapers/locations-ifrs16/imports?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { form: { file: { name: ledger.name, type: "text/csv", text: ledger.text }, documentType: "lease_ledger", mapping: JSON.stringify(LEASE_MAPPING), period: JSON.stringify(LEASE_PERIOD) } });
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const approved = await api(page, "/api/workpapers/locations-ifrs16/imports?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { command: "approve_import", importId: preview.body.batch.id, previewHash: preview.body.batch.previewHash, expectedSourceId: before.sourceHeads.find(h => h.document_type === "lease_ledger")!.import_id } });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Source remplacée — à réexaminer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer une révision" })).toBeEnabled();
  await expect(page.getByRole("group", { name: "Export revu" })).toContainText("Source remplacée ou ajoutée : créer une révision");
  // The closing file keeps the selection and says it is to re-examine.
  const closing = await api(page, "/api/workpapers/closing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  expect(closing.body.projection.ifrsWorks.lineages[0].selection).toMatchObject({ status: "a_reexaminer", reasons: ["source remplacée ou ajoutée"] });
  const after = (await api(page, leasesUrl())).body as Read;
  expect(after.workspace[S.runId].freshness).toBe("source_replaced");
  expect(after.workspace[S.runId].actions.configure).toEqual({ allowed: false, reason: "Source remplacée ou ajoutée : créer une révision" });
  // The frozen version and its proofs stay readable: same sheet version, same frozen sources.
  expect(after.runs.find(r => r.id === S.runId)!.importIds).toEqual(saved!.run.importIds);
  await capture(page, "reel-source-remplacee-1440");
  await page.context().close();
});

test("L16-06-P4 · états réels à 1440, 1024, 720 (zoom 200 %) et 390 : sans débordement, axe sans violation grave, clavier, mouvement réduit", async ({ browser }) => {
  for (const width of [1440, 1024, 720, 390]) {
    const page = await signedInPage(browser, width, sheetHref());
    await expect(page.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Source remplacée — à réexaminer" })).toBeVisible();
    expect(await noOverflow(page), "débordement à " + width).toBe(true);
    expect(await axeSerious(page), "axe à " + width).toEqual([]);
    expect(await runningMotion(page), "animation à " + width).toBe(0);
    // Keyboard only: reach the « Calcul » step of the rail and follow it.
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) { await page.keyboard.press("Tab"); reached = await page.evaluate(() => document.activeElement?.closest("nav[aria-label='Étapes du travail']") !== null && /Calcul/.test(document.activeElement?.textContent ?? "")); }
    expect(reached, "étape Calcul atteinte au clavier à " + width).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#l16-portfolio-title$/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, "reel-poste-" + width);
    await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
    await page.getByRole("tab", { name: /^Programme/ }).click();
    const works = page.getByRole("region", { name: /Travaux IFRS/ });
    await expect(works).toContainText(/r1 · v\d+ · verrouillée · source remplacée/);
    await expect(works).toContainText("À réexaminer");
    expect(await noOverflow(page), "débordement clôture à " + width).toBe(true);
    expect(await axeSerious(page), "axe clôture à " + width).toEqual([]);
    await works.scrollIntoViewIfNeeded();
    await capture(page, "cloture-travaux-ifrs-" + width);
    await page.context().close();
  }
  expect(existsSync(STATE)).toBe(true);
});
