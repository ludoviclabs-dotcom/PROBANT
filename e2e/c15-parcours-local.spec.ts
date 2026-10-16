import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { periodId } from "../lib/workpapers/model";

/**
 * C15 — recette finale : parcours réel sur le profil personnel local (PostgreSQL 17 + `next start` lancés par le lanceur).
 *
 *   PROBANT_E2E_LOCAL_HOME=<profil> PROBANT_E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test e2e/c15-parcours-local.spec.ts
 *
 * Sans ces variables le parcours est ignoré (non vérifié), jamais simulé. Aucune fixture mémoire : chaque étape passe par le
 * serveur du profil, et la reprise arrête puis relance Next et PostgreSQL avant de relire. Pièces synthétiques de
 * docs/recette/c15/pieces ; attendus écrits à la main dans docs/recette/c15/attendus.json avant l'exécution.
 */
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const BASE = process.env.PROBANT_E2E_BASE_URL ?? "";
const OUT = path.join(process.cwd(), "docs", "recette", "c15");
const PIECES = path.join(OUT, "pieces");
const CAPTURES = path.join(OUT, "captures");
const A = JSON.parse(readFileSync(path.join(OUT, "attendus.json"), "utf8"));
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
const PERIOD = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-02-01", currency: "EUR" as const, validation: "provisional" as const };
const PID = periodId(PERIOD);
const SOURCES = [["clients_general", "Grand livre Clients"], ["clients_auxiliary", "Auxiliaire Clients"], ["clients_aged", "Balance âgée"]] as const;
const CLIENT_FORMATS = ["json", "html", "pdf", "manifest", "exceptions_csv", "decisions_csv", "procedures_csv", "sources_csv"] as const;
const CLOSING_FORMATS = ["json", "html", "pdf", "procedures_csv", "sheets_csv", "findings_csv", "journal_csv", "manifest"] as const;
const OWNER = "Camille Recette";
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const eur = (amount: string) => amount + " EUR";

test.skip(!HOME || !BASE, "Profil personnel local non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
test.describe.configure({ mode: "serial", timeout: 300_000 });

/* ── Lanceur et session ─────────────────────────────────────────────────────────────────────────────────────────────── */
function launcher(command: string, extra: string[] = []) {
  const r = spawnSync(process.execPath, [path.join("scripts", "local", "probant-local.mjs"), command, "--home", HOME, ...extra], { encoding: "utf8", windowsHide: true, timeout: 600_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function loginUrl(next = "/local") {
  const r = launcher("login", ["--sans-navigateur", "--vers", next]);
  const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(r.out)?.[1];
  if (!url) throw new Error("Lien de connexion introuvable : " + r.out);
  return url;
}
async function signedInPage(browser: Browser, width: number, next = "/local") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(loginUrl(next));
  return page;
}
const portOpen = (port: number) => new Promise<boolean>(resolve => { const s = connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); }); s.on("error", () => resolve(false)); });
const profileConfig = () => JSON.parse(readFileSync(path.join(HOME, "probant.local.json"), "utf8")) as { postgres: { port: number }; app: { port: number } };
function pidsOf() {
  const etat = JSON.parse(readFileSync(path.join(HOME, "run", "etat.json"), "utf8")) as { nextPid?: number };
  const pgFile = path.join(HOME, "pgdata", "postmaster.pid");
  return { next: etat.nextPid ?? null, postgres: existsSync(pgFile) ? Number(readFileSync(pgFile, "utf8").split(/\r?\n/)[0]) || null : null };
}

/* ── Contrôles transverses d'écran ─────────────────────────────────────────────────────────────────────────────────── */
async function noOverflow(page: Page) { return page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1); }
async function axeSerious(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id + " " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | "));
  });
}
/** Mouvement réduit : aucune animation ni transition ne tourne plus de 10 ms. */
async function runningMotion(page: Page) {
  return page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 10).length);
}
async function capture(page: Page, name: string) {
  mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, name + ".jpg"), type: "jpeg", quality: 78, fullPage: true });
}

/* ── API depuis la page (le cookie `__Host-` de 127.0.0.1 n'est envoyé que par le navigateur) ─────────────────────── */
type ApiInit = { json?: unknown; form?: Record<string, string | { name: string; type: string; text: string }> };
async function api(page: Page, url: string, init: ApiInit = {}) {
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
/** Octets d'une réponse : empreinte SHA-256 calculée dans le navigateur, taille, type et en-têtes d'identité. */
async function bytes(page: Page, url: string, json?: unknown) {
  return page.evaluate(async ({ url, json }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const headers: Record<string, string> = { "x-probant-csrf": session.csrfToken };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    const r = await fetch(url, { method: json === undefined ? "GET" : "POST", headers, body: json === undefined ? undefined : JSON.stringify(json), cache: "no-store" });
    const buf = await r.arrayBuffer(), digest = await crypto.subtle.digest("SHA-256", buf);
    const text = /json|html|csv|text/.test(r.headers.get("content-type") ?? "") ? new TextDecoder().decode(buf) : null;
    return { status: r.status, sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""), length: buf.byteLength, type: r.headers.get("content-type"),
      snapshot: r.headers.get("x-probant-snapshot"), disposition: r.headers.get("content-disposition"), text };
  }, { url, json });
}

/* ── État partagé entre les étapes (sérielles) ; preuves écrites dans docs/recette/c15 ─────────────────────────────── */
type Fingerprint = { status: number; sha256: string; length: number; type: string | null; snapshot: string | null; disposition: string | null };
type Bytes = Awaited<ReturnType<typeof bytes>>;
type Artifact = { format: string; fileName: string; mediaType: string; sha256: string; byteLength: number };
/** Le manifeste décrit les octets réellement servis : chaque artefact listé correspond à un export (nom, taille, empreinte). */
function describedBytes(artifacts: Artifact[], exports: Record<string, Fingerprint>) {
  const byName = new Map(Object.values(exports).map(f => [/filename="([^"]+)"/.exec(f.disposition ?? "")?.[1] ?? "", f]));
  return artifacts.map(a => { const f = byName.get(a.fileName); return { file: a.fileName, served: !!f, sameBytes: !!f && f.sha256 === a.sha256 && f.length === a.byteLength }; });
}
const strip = (f: Bytes): Fingerprint => ({ status: f.status, sha256: f.sha256, length: f.length, type: f.type, snapshot: f.snapshot, disposition: f.disposition });
const S = { dossierId: "", legalName: "", runId: "", rootId: "", version: 0, importIds: {} as Record<string, string> };
const clientsUrl = (extra: Record<string, string> = {}) => "/api/workpapers/clients?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, ...extra });
const closingUrl = (extra: Record<string, string> = {}) => "/api/workpapers/closing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, ...extra });
const sheetHref = (id = S.runId, version = S.version) => "/clients-framing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, id, version: String(version) });
const synthesisHref = () => "/clients-framing/synthesis?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: String(S.version) });
async function closingCommand(page: Page, command: Record<string, unknown>) {
  const view = await api(page, closingUrl());
  expect(view.status, JSON.stringify(view.body)).toBe(200);
  return api(page, closingUrl(), { json: { ...command, expectedSeq: view.body.seq } });
}

/** Relecture complète de l'état serveur : feuille, sources, octets des exports Clients et du dossier de clôture. */
async function readBack(page: Page) {
  const view = await api(page, clientsUrl());
  expect(view.status, JSON.stringify(view.body)).toBe(200);
  const run = (view.body.runs as { id: string; rootId: string; version: number; state: string; approval: unknown; importIds: string[]; result?: { inputHash: string } }[]).find(r => r.id === S.runId)!;
  const history = await api(page, clientsUrl({ operation: "version", id: S.runId, version: String(S.version) }));
  const mission = await api(page, clientsUrl({ operation: "mission", rootId: S.rootId, id: S.runId, version: String(S.version) }));
  expect(mission.status, JSON.stringify(mission.body)).toBe(200);
  const hash = mission.body.mission.hash as string;
  const clientExports: Record<string, Fingerprint> = {};
  for (const format of CLIENT_FORMATS) {
    const r = await bytes(page, "/api/workpapers/clients/export", { dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: S.version, kind: "approved", format, expectedSnapshotHash: hash });
    expect(r.status, format + " " + (r.text ?? "").slice(0, 300)).toBe(200);
    expect(r.snapshot).toBe(hash);
    clientExports[format] = strip(r);
  }
  const html = await bytes(page, "/api/workpapers/clients/export", { dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: S.version, kind: "approved", format: "html", expectedSnapshotHash: hash });
  const manifest = JSON.parse((await bytes(page, "/api/workpapers/clients/export", { dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: S.version, kind: "approved", format: "manifest", expectedSnapshotHash: hash })).text!);
  const sources: Record<string, { importId: string; documentId: string; sha256: string }> = {};
  for (const [type] of SOURCES) {
    const batch = (view.body.imports as { id: string; document: { id: string; documentType: string } }[]).find(b => b.id === S.importIds[type])!;
    sources[type] = { importId: batch.id, documentId: batch.document.id, sha256: (await bytes(page, clientsUrl({ operation: "download", id: batch.document.id }))).sha256 };
  }
  const closing = await api(page, closingUrl());
  expect(closing.status, JSON.stringify(closing.body)).toBe(200);
  const closingExports: Record<string, Fingerprint> = {};
  let closingManifest: { artifacts: Artifact[] } = { artifacts: [] };
  for (const format of CLOSING_FORMATS) {
    const r = await bytes(page, closingUrl({ operation: "export", format, snapshot: closing.body.projection.hash }));
    expect(r.status, format + " " + (r.text ?? "").slice(0, 300)).toBe(200);
    closingExports[format] = strip(r);
    if (format === "manifest") closingManifest = JSON.parse(r.text!);
  }
  return {
    closingManifestArtifacts: closingManifest.artifacts,
    sheet: { id: run.id, rootId: run.rootId, version: run.version, state: run.state, approval: run.approval, importIds: run.importIds, inputHash: run.result?.inputHash ?? null, versionRead: history.status },
    sourceHeads: view.body.sourceHeads, sources, missionHash: hash, clientExports, clientHtmlProfile: /Procédures de mission · ([^<]+)</.exec(html.text ?? "")?.[1] ?? null, manifestArtifacts: manifest.artifacts,
    closing: { seq: closing.body.seq, headHash: closing.body.headHash, projectionHash: closing.body.projection.hash, denominators: closing.body.evaluation.denominators,
      procedure: closing.body.evaluation.procedures.find((p: { procedureId: string }) => p.procedureId === "P-01"), completion: closing.body.projection.completion, exports: closingExports },
  };
}

let saved: Awaited<ReturnType<typeof readBack>> | null = null;

/* ═══ 1. Parcours réel avant arrêt ══════════════════════════════════════════════════════════════════════════════════ */
test("C15-P1 · dossier → imports approuvés → gel → calcul → résultat → preuve → écart → relecture personnelle → verrouillage → synthèse → export", async ({ browser }) => {
  const m1 = A.M1_clients_residus;
  const page = await signedInPage(browser, 1440);
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  S.legalName = "Recette C15 SAS · " + new Date().toISOString().slice(0, 19);
  await page.getByLabel("Raison sociale").fill(S.legalName);
  await page.getByLabel("Exercice").fill("2024");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Dossier créé/ })).toBeVisible();
  S.dossierId = (await api(page, "/api/local/dossiers")).body.dossiers.find((d: { legalName: string }) => d.legalName === S.legalName).id;

  // Ouvrir le dossier puis l'exercice : lien de travail de /local, dates saisies sur la feuille (premier écran explicite).
  await page.locator(`a[href="/clients-framing?dossierId=${S.dossierId}"]`).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cadrage Clients" })).toBeVisible();
  await expect(page.getByText(/Aucune feuille chargée : saisissez le début, la clôture et la date de revue/)).toBeVisible();
  await expect(page.getByLabel("Début")).toBeVisible();
  await capture(page, "p1-clients-premier-ecran-1440");
  await page.getByLabel("Début").fill(PERIOD.startDate);
  await page.getByLabel("Clôture").fill(PERIOD.closingDate);
  await page.getByLabel("Date de revue").fill(PERIOD.asOfDate);
  await page.getByRole("button", { name: "Charger le cadrage" }).click();
  await expect(page.getByText("Mission · profil personnel local · identité serveur")).toBeVisible();

  // Importer puis approuver chaque source (aperçu conservé, mapping approuvé, source courante).
  for (const [type, label] of SOURCES) {
    await page.getByRole("combobox", { name: /^Source/ }).selectOption(type);
    await page.getByLabel("Fichier CSV ou XLSX (3 Mio maximum)").setInputFiles(path.join(PIECES, type + ".csv"));
    await page.getByRole("button", { name: "Analyser et sauvegarder l’aperçu" }).click();
    const article = page.locator("article").filter({ has: page.getByRole("heading", { name: `${label} · ${type}.csv` }) });
    await expect(article).toContainText("Mapping à approuver");
    await article.getByRole("button", { name: "Approuver ce mapping" }).click();
    await expect(article).toContainText("Approuvé par proprietaire-local");
    await expect(article).toContainText("Source courante");
  }
  const imported = await api(page, clientsUrl());
  for (const [type] of SOURCES) S.importIds[type] = (imported.body.sourceHeads as { document_type: string; import_id: string }[]).find(h => h.document_type === type)!.import_id;

  // Figer, calculer.
  await page.getByRole("button", { name: "Initialiser la feuille Clients pour ce dossier" }).click();
  await page.getByRole("button", { name: "Figer la population complète" }).click();
  await page.getByRole("button", { name: "Exécuter le cadrage" }).click();
  const treat = page.getByRole("button", { name: "Documenter le traitement avec ce texte" });
  await expect(treat.first()).toBeVisible();
  await capture(page, "p1-clients-calcule-1440");

  // Résultat serveur comparé aux attendus manuels M1.
  let run = (await api(page, clientsUrl())).body.runs.at(-1);
  expect(run.state).toBe("executed");
  expect(run.result.outcome).toBe("exceptions_detected");
  expect(run.result.result.generalToAuxiliary.net).toEqual({ kind: "known", value: { amount: m1.ecart_gl_auxiliaire, currency: "EUR" } });
  expect(run.result.result.auxiliaryToAged.net).toEqual({ kind: "known", value: { amount: m1.ecart_auxiliaire_agee_global, currency: "EUR" } });
  expect(run.result.result.auxiliaryToAged.gross).toEqual({ kind: "known", value: { amount: m1.residus_bruts_valeur_absolue, currency: "EUR" } });
  expect(Object.fromEntries(run.result.result.auxiliaryToAged.rows.map((r: { key: string; difference: { value: { amount: string } } }) => [r.key, r.difference.value.amount]))).toEqual(m1.residus_par_cle);

  // Traiter l'écart : justification du point bloquant, conclusion, soumission.
  await page.getByLabel("Commentaire ou justification").fill("Résidus C1 +10,00 / C2 −10,00 : balance âgée arrêtée avant le dernier avoir de C2, rapprochée pièce par pièce.");
  await treat.first().click();
  await expect(page.getByRole("button", { name: /^Traitement documenté : Résidus C1/ })).toBeVisible();
  await page.getByLabel("Conclusion").fill("Cadrage concordant en agrégat ; résidus par client expliqués, aucune compensation retenue.");
  await page.getByRole("button", { name: "Sauvegarder la conclusion" }).click();
  await expect(page.getByRole("button", { name: "Soumettre cette version" })).toBeEnabled();
  await page.getByRole("button", { name: "Soumettre cette version" }).click();

  // Relecture personnelle nommée, puis verrouillage.
  await expect(page.locator("[data-review-kind=personal]")).toContainText("Relecture personnelle nommée");
  await page.getByLabel("Note de revue").fill("Relu : sources, résidus et traitement de l'écart.");
  await page.getByRole("button", { name: "Approuver le cadrage" }).click();
  await page.getByRole("button", { name: "Verrouiller cette version approuvée" }).click();
  await expect(page.getByText(new RegExp(`Décision : Relecture personnelle nommée · ${OWNER} \\(proprietaire-local\\)`))).toBeVisible();
  run = (await api(page, clientsUrl())).body.runs.at(-1);
  expect(run.state).toBe("locked");
  expect(run.approval).toMatchObject({ actorId: "proprietaire-local", kind: "personal", reviewerName: OWNER });
  S.runId = run.id; S.rootId = run.rootId; S.version = run.version;
  await capture(page, "p1-clients-verrouille-1440");

  // Synthèse Clients : ligne source, pièce et formule.
  await page.goto(synthesisHref());
  await expect(page.getByRole("heading", { level: 1, name: "Revue et Synthèse Clients" })).toBeVisible();
  await expect(page.getByText("Mission · profil personnel local", { exact: true })).toBeVisible();
  const decisions = page.getByRole("region", { name: "Décisions détaillées — défilement clavier" });
  for (const [key, amount] of Object.entries(m1.residus_par_cle as Record<string, string>)) await expect(decisions.getByRole("row", { name: "Auxiliaire / balance âgée " + key })).toContainText(eur(amount));
  const examine = page.getByRole("button", { name: "Examiner les preuves de C1" });
  await examine.click();
  await expect(examine).toBeFocused();
  const panel = page.getByRole("complementary", { name: "Panneau de preuve" });
  await expect(panel).toContainText("Gauche 100.00 EUR");
  await expect(panel).toContainText("Droite 90.00 EUR");
  for (const type of ["clients_auxiliary", "clients_aged"]) {
    const block = panel.locator("div").filter({ has: page.getByText(type + ".csv", { exact: true }) }).first();
    await block.getByText("Identité et version de la preuve").click();
    await expect(block).toContainText("SHA-256 " + sha256(path.join(PIECES, type + ".csv")));
  }
  await expect(page.getByRole("heading", { name: "Périmètre testé" }).locator("..")).toContainText("résidus non compensés");
  await capture(page, "p1-synthese-preuve-1440");

  // Dossier de clôture : ouverture, programme, synthèse des travaux, marquage personnel, export.
  await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  const openForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ouvrir le dossier professionnel" }) });
  await expect(openForm).toBeVisible();
  await openForm.getByLabel("Entité").fill(S.legalName);
  await openForm.getByLabel("Début d’exercice").fill(PERIOD.startDate);
  await openForm.getByLabel("Clôture").fill(PERIOD.closingDate);
  await openForm.getByLabel("Date de revue").fill(PERIOD.asOfDate);
  await openForm.getByRole("button", { name: "Ouvrir le dossier" }).click();
  await expect(page.getByRole("tab", { name: /^Synthèse des travaux/ })).toBeVisible();
  expect((await closingCommand(page, { command: "set_risk", riskId: "R-01", cycle: "clients", label: "Créances clients au bilan", assertions: ["solde_existence"], assessment: { level: "modere", rationale: "Résidus par client à expliquer." } })).status).toBe(200);
  expect((await closingCommand(page, { command: "set_procedure", procedureId: "P-01", riskIds: ["R-01"], assertions: ["solde_existence"], nature: "engine", engine: "clients.frame", label: "Cadrage Clients", owner: OWNER })).status).toBe(200);
  // La décision de clôture professionnelle reste refusée sur le profil solo.
  expect((await closingCommand(page, { command: "validate_closing", text: "Tentative de validation solo." })).body.error).toBe("CL_CLOSING_AUTHORITY_FORBIDDEN");

  await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, tab: "synthese" }));
  await expect(page.getByRole("tab", { name: /^Synthèse des travaux/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("synthesis-denominator")).toBeVisible();
  await capture(page, "p1-cloture-synthese-1440");
  const closing = (await api(page, closingUrl())).body;
  expect(closing.evaluation.procedures.find((p: { procedureId: string }) => p.procedureId === "P-01")).toMatchObject({ status: "cycle_verrouille", engine: { binding: { mode: "implicite" }, retained: { runId: S.runId, version: S.version, state: "locked", sourcesCurrent: true } } });
  // Attendus manuels : 1 procédure applicable, relue personnellement (0 revue par une autre personne) ; 1 feuille retenue verrouillée sous relecture personnelle.
  expect(closing.evaluation.denominators.procedures).toMatchObject({ declared: 1, applicable: 1, notApplicable: 0, done: 0, donePersonal: 1 });
  expect(closing.evaluation.denominators.engines).toMatchObject({ applicable: 1, locked: 1, toBind: 0 });
  expect(closing.evaluation.denominators.sheets).toMatchObject({ lineages: 1, retained: 1, toAssign: 0, sourcesReplaced: 0 });

  await page.getByRole("tab", { name: /^Clôture/ }).click();
  const solo = page.locator("section").filter({ has: page.getByRole("heading", { name: "Dossier personnel (mode solo)" }) });
  await solo.getByLabel(/^Note de fin de dossier/).fill("Dossier personnel terminé : cadrage Clients relu ; limites listées ci-dessous.");
  await solo.getByRole("button", { name: "Marquer le dossier personnel terminé" }).click();
  await expect(solo).toContainText("Marqué terminé");
  await expect(solo).toContainText(`relecture personnelle nommée : ${OWNER}`);
  await capture(page, "p1-cloture-solo-1440");

  // Export : même projection dans l'écran et dans le JSON exporté.
  await page.getByRole("tab", { name: /^Synthèse des travaux/ }).click();
  const href = await page.getByRole("link", { name: "JSON canonique" }).getAttribute("href");
  expect(href).toMatch(/operation=export&format=json&snapshot=[a-f0-9]{64}/);
  const exported = JSON.parse((await bytes(page, href!)).text!);
  const now = (await api(page, closingUrl())).body;
  expect(exported.projection.hash).toBe(now.projection.hash);
  expect(exported.projection.denominators).toEqual(now.evaluation.denominators);

  saved = await readBack(page);
  expect(saved.clientHtmlProfile).toBe("profil personnel local");
  // Formats livrés : les manifestes Clients et clôture décrivent exactement les octets servis pour chaque autre format.
  for (const [manifest, exports] of [[saved.manifestArtifacts, saved.clientExports], [saved.closingManifestArtifacts, saved.closing.exports]] as [Artifact[], Record<string, Fingerprint>][]) {
    const described = describedBytes(manifest, exports);
    expect(described.length).toBeGreaterThanOrEqual(Object.keys(exports).length - 1);
    expect(described.filter(d => !d.served || !d.sameBytes)).toEqual([]);
  }
  for (const [type] of SOURCES) expect(saved.sources[type].sha256, type).toBe(sha256(path.join(PIECES, type + ".csv")));
  writeFileSync(path.join(OUT, "etat-avant.json"), JSON.stringify({ capturedAt: new Date().toISOString(), dossierId: S.dossierId, periodId: PID, pids: pidsOf(), ...saved }, null, 2) + "\n");
  await page.context().close();
});

/* ═══ 2. Arrêt et reprise : nouveaux processus, mêmes versions et mêmes octets ════════════════════════════════════════ */
test("C15-P2 · arrêt de Next et de PostgreSQL, reprise, relecture identique", async ({ browser }) => {
  expect(saved, "le parcours P1 doit avoir réussi").not.toBeNull();
  const cfg = profileConfig(), pidsBefore = pidsOf();
  const stopped = launcher("stop");
  expect(stopped.status, stopped.out).toBe(0);
  expect(await portOpen(cfg.app.port), "Next arrêté").toBe(false);
  expect(await portOpen(cfg.postgres.port), "PostgreSQL arrêté").toBe(false);
  expect(existsSync(path.join(HOME, "pgdata", "postmaster.pid")), "verrou PostgreSQL levé").toBe(false);
  const started = launcher("start", ["--sans-navigateur"]);
  expect(started.status, started.out).toBe(0);
  expect(started.out, "aucune recompilation entre l'arrêt et la reprise").not.toMatch(/Compilation de production/);
  const after = pidsOf();
  expect(after.next).not.toBe(pidsBefore.next);
  expect(after.postgres).not.toBe(pidsBefore.postgres);

  const page = await signedInPage(browser, 1440);
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText(S.legalName);
  const back = await readBack(page);
  expect(back.sheet).toEqual(saved!.sheet);
  expect(back.sourceHeads).toEqual(saved!.sourceHeads);
  expect(back.sources).toEqual(saved!.sources);
  expect(back.missionHash).toBe(saved!.missionHash);
  expect(back.closing.seq).toBe(saved!.closing.seq);
  expect(back.closing.headHash).toBe(saved!.closing.headHash);
  expect(back.closing.projectionHash).toBe(saved!.closing.projectionHash);
  // Octets identiques, format par format (Clients : 8 formats du paquet approuvé ; clôture : 8 formats).
  const diff = (a: Record<string, Fingerprint>, b: Record<string, Fingerprint>) => Object.keys(a).filter(k => a[k].sha256 !== b[k].sha256 || a[k].length !== b[k].length);
  expect(diff(back.clientExports, saved!.clientExports)).toEqual([]);
  expect(diff(back.closing.exports, saved!.closing.exports)).toEqual([]);

  // L'écran de la version verrouillée se rouvre à l'identique, contexte compris.
  await page.goto(sheetHref());
  await expect(page.getByText(new RegExp(`Décision : Relecture personnelle nommée · ${OWNER} \\(proprietaire-local\\) · Version ${S.version - 1}|Décision : Relecture personnelle nommée · ${OWNER}`))).toBeVisible();
  await expect(page.getByText("Mission · profil personnel local · identité serveur")).toBeVisible();
  writeFileSync(path.join(OUT, "etat-apres.json"), JSON.stringify({ capturedAt: new Date().toISOString(), dossierId: S.dossierId, periodId: PID, pidsBefore, pidsAfter: after, ...back }, null, 2) + "\n");
  await page.context().close();
});

/* ═══ 3. Invalidation : source remplacée après verrouillage ══════════════════════════════════════════════════════════ */
test("C15-P3 · balance âgée remplacée après verrouillage : version ancienne lisible, travail courant périmé, dossier signalé, révision", async ({ browser }) => {
  const m12 = A.M12_bis_balance_agee_remplacee;
  const page = await signedInPage(browser, 1440);
  await page.goto("/clients-framing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  await expect(page.getByRole("heading", { level: 1, name: "Cadrage Clients" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Source/ })).toBeVisible();
  await page.getByRole("combobox", { name: /^Source/ }).selectOption("clients_aged");
  await page.getByLabel("Fichier CSV ou XLSX (3 Mio maximum)").setInputFiles({ name: "clients_aged_remplacee.csv", mimeType: "text/csv", buffer: readFileSync(path.join(PIECES, "clients_aged_remplacee.csv")) });
  await page.getByRole("button", { name: "Analyser et sauvegarder l’aperçu" }).click();
  const article = page.locator("article").filter({ has: page.getByRole("heading", { name: "Balance âgée · clients_aged_remplacee.csv" }) });
  await article.getByRole("button", { name: "Approuver ce mapping" }).click();
  await expect(article).toContainText("Source courante");
  await expect(page.getByRole("alert").filter({ hasText: "Une source a été remplacée" })).toBeVisible();

  // Version verrouillée : inchangée, lisible et exportable (diagnostic) avec ses anciennes sources ; paquet « approuvé » refusé.
  const old = await api(page, clientsUrl({ operation: "version", id: S.runId, version: String(S.version) }));
  expect(old.status).toBe(200);
  const mission = await api(page, clientsUrl({ operation: "mission", rootId: S.rootId, id: S.runId, version: String(S.version) }));
  expect(mission.body.mission.procedure.stale).toBe(true);
  const diag = await bytes(page, "/api/workpapers/clients/export", { dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: S.version, kind: "diagnostic", format: "html", expectedSnapshotHash: mission.body.mission.hash });
  expect(diag.status).toBe(200);
  expect(diag.text).toContain("Travail périmé");
  expect(diag.text).toContain("Source remplacée / périmée");
  expect(diag.text).toContain("Feuille " + S.runId + " · révision 1 · version " + S.version);
  const approved = await bytes(page, "/api/workpapers/clients/export", { dossierId: S.dossierId, periodId: PID, rootId: S.rootId, id: S.runId, version: S.version, kind: "approved", format: "json", expectedSnapshotHash: mission.body.mission.hash });
  expect(approved.status).not.toBe(200);
  expect(approved.text).toContain("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");

  // Dossier de clôture : la procédure signale la source remplacée ; le marquage personnel est périmé.
  const closing = (await api(page, closingUrl())).body;
  expect(closing.evaluation.procedures.find((p: { procedureId: string }) => p.procedureId === "P-01")).toMatchObject({ status: "cycle_source_remplacee", done: false });
  expect(closing.evaluation.denominators.sheets.sourcesReplaced).toBe(1);
  expect(closing.projection.completion.personal.status).toBe("perime"); // vocabulaire du contrat C14 : marquage « périmé », validation « périmée »
  await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, tab: "synthese" }));
  await expect(page.getByTestId("synthesis-denominator")).toBeVisible();
  await capture(page, "p3-cloture-source-remplacee-1440");

  // Révision : r2 calculée sur la nouvelle balance, attendus M12 bis ; r1 reste dans l'historique.
  await page.goto("/clients-framing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  await page.getByRole("button", { name: "Créer une nouvelle révision" }).click();
  await page.getByRole("button", { name: "Figer la population complète" }).click();
  await page.getByRole("button", { name: "Exécuter le cadrage" }).click();
  await expect(page.getByRole("button", { name: "Documenter le traitement avec ce texte" }).first()).toBeVisible();
  const runs = (await api(page, clientsUrl())).body.runs as { id: string; rootId: string; revision: number; state: string; result?: { result: { auxiliaryToAged: { rows: { key: string; difference: { value: { amount: string } } }[]; gross: { value: { amount: string } }; net: { value: { amount: string } } } } } }[];
  const r2 = runs.find(r => r.rootId === S.rootId && r.revision === 2)!;
  expect(r2.state).toBe("executed");
  expect(Object.fromEntries(r2.result!.result.auxiliaryToAged.rows.map(r => [r.key, r.difference.value.amount]))).toEqual(m12.residus_par_cle_nouvelle_source);
  expect(r2.result!.result.auxiliaryToAged.gross.value.amount).toBe(m12.residus_bruts_nouvelle_source);
  expect(r2.result!.result.auxiliaryToAged.net.value.amount).toBe(m12.ecart_auxiliaire_agee_global_nouvelle_source);
  const r1 = await api(page, clientsUrl({ operation: "version", id: S.runId, version: String(S.version) }));
  expect(r1.status).toBe(200);
  await capture(page, "p3-clients-revision-1440");
  writeFileSync(path.join(OUT, "etat-invalidation.json"), JSON.stringify({ capturedAt: new Date().toISOString(), lockedRun: { id: S.runId, version: S.version }, r2: { id: r2.id, state: r2.state, residues: m12.residus_par_cle_nouvelle_source },
    closingProcedure: closing.evaluation.procedures.find((p: { procedureId: string }) => p.procedureId === "P-01"), personalCompletion: closing.projection.completion.personal, diagnosticSha256: diag.sha256 }, null, 2) + "\n");
  await page.context().close();
});

/* ═══ 4. Écrans du parcours aux trois largeurs ═══════════════════════════════════════════════════════════════════════ */
test("C15-P4 · écrans du parcours à 1440, 1024 et 390 : débordement, axe serious/critical, focus, mouvement réduit", async ({ browser }) => {
  for (const width of WIDTHS) {
    const page = await signedInPage(browser, width);
    const screens: [string, string, () => Promise<void>][] = [
      ["local", "/local", async () => { await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible(); }],
      ["feuille-r1", sheetHref(), async () => { await expect(page.getByText(/Décision : Relecture personnelle nommée/)).toBeVisible(); }],
      ["synthese-clients", synthesisHref(), async () => {
        await expect(page.getByRole("heading", { level: 1, name: "Revue et Synthèse Clients" })).toBeVisible();
        const examine = page.getByRole("button", { name: "Examiner les preuves de C1" });
        await examine.focus(); await page.keyboard.press("Enter");
        await expect(examine).toBeFocused();
        for (const d of await page.getByRole("complementary", { name: "Panneau de preuve" }).locator("details").all()) await d.evaluate(e => (e as HTMLDetailsElement).open = true);
      }],
      ["cloture-synthese", "/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID, tab: "synthese" }), async () => { await expect(page.getByTestId("synthesis-denominator")).toBeVisible(); }],
    ];
    for (const [name, url, ready] of screens) {
      await page.goto(url);
      await ready();
      expect(await noOverflow(page), `débordement horizontal ${name} à ${width}`).toBe(true);
      expect(await axeSerious(page), `axe ${name} à ${width}`).toEqual([]);
      expect(await runningMotion(page), `animation en cours ${name} à ${width}`).toBe(0);
      await capture(page, `p4-${name}-${width}`);
    }
    await page.context().close();
  }
});
