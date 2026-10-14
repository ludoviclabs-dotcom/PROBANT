// Recette de reprise du profil personnel local (mission C07).
//
//   npx tsx scripts/local/recette-c07.ts complete --home <profil de recette> [--out docs/recette/c07]
//
// Pilote l'API réelle d'un profil personnel lancé par scripts/local/probant-local.mjs :
// connexion locale, dossier, chaîne Trésorerie (importer → figer → exécuter → relire →
// verrouiller → exporter), double commande, conflit entre onglets ; puis arrêt de Next et
// de PostgreSQL, relance de nouveaux processus et relecture de la version, des sources, de
// la pièce et de l'export ; enfin sauvegarde, restauration dans un dossier distinct et
// relecture du profil restauré. Données synthétiques uniquement (docs/recette/c07/pieces).
//
// Attendus fixés avant exécution (fixture « pont bancaire ») : relevé 90,00 + remise non
// créditée 15,00 − chèque non débité 5,00 = 100,00 = solde du compte 512100 ; écart 0,00 ;
// R1 apurée par S1 (15,00 le 03/01/2025) ; P1 reste ouverte (aucun débit de −5,00 dans la
// fenêtre) ; trois comptes exclus avec motif (USD, caisse, VMP).
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { periodId } from "@/lib/workpapers/model";
import { cashMapping, cashPeriod } from "@/lib/workpapers/__tests__/cash-reconciliation-fixtures";
import type { CashSourceType } from "@/lib/workpapers/cash-sources";
import type { WorkpaperRun } from "@/lib/workpapers/model";

type Json = Record<string, unknown>;
const ROOT = resolve(__dirname, "..", "..");
const LAUNCHER = join(ROOT, "scripts", "local", "probant-local.mjs");
const PIECES = join(ROOT, "docs", "recette", "c07", "pieces");
const TYPES: CashSourceType[] = ["cash_ledger", "cash_statement", "cash_erb", "cash_settlements", "cash_support"];
const PID = periodId(cashPeriod);
const sha256 = (b: Buffer | Uint8Array | string) => createHash("sha256").update(b).digest("hex");

function args(argv: string[]) {
  const [phase = "complete", ...rest] = argv, o: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) o[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") || rest[i + 1] === undefined ? "true" : rest[++i];
  return { phase, o };
}
const { phase, o } = args(process.argv.slice(2));
if (!o.home) throw new Error("--home <profil de recette> requis");
const OUT = resolve(o.out ?? join(ROOT, "docs", "recette", "c07"));
mkdirSync(OUT, { recursive: true });
const journal: string[] = [];
const log = (line: string) => { journal.push(new Date().toISOString() + " " + line); process.stdout.write("[recette-c07] " + line + "\n"); };
const checks: { id: string; label: string; status: "PASS" | "FAIL"; detail: string }[] = [];
function check(id: string, label: string, ok: boolean, detail: unknown) {
  checks.push({ id, label, status: ok ? "PASS" : "FAIL", detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  log((ok ? "PASS " : "FAIL ") + id + " — " + label);
}

function launcher(command: string, home: string, extra: string[] = []) {
  const r = spawnSync(process.execPath, [LAUNCHER, command, "--home", home, ...extra], { encoding: "utf8", windowsHide: true, cwd: ROOT, timeout: 15 * 60_000 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  // Les codes de connexion (usage unique) ne sont jamais conservés dans les preuves.
  writeFileSync(join(OUT, "journal-lanceur.log"), out.split(/\r?\n/).filter(l => l.startsWith("[probant-local]")).map(l => new Date().toISOString() + " " + command + " " + l.replace(/code=[A-Za-z0-9_-]+/g, "code=<masqué>")).join("\n") + "\n", { flag: "a" });
  if (r.status !== 0) throw new Error("local:" + command + " a échoué :\n" + out);
  return out;
}
function profileOf(home: string) {
  const config = JSON.parse(readFileSync(join(home, "probant.local.json"), "utf8"));
  return { config, origin: "http://127.0.0.1:" + config.app.port, pgdata: join(home, "pgdata") };
}
function processes(home: string) {
  const state = existsSync(join(home, "run", "etat.json")) ? JSON.parse(readFileSync(join(home, "run", "etat.json"), "utf8")) : null;
  const pm = join(home, "pgdata", "postmaster.pid");
  return { nextPid: state?.nextPid ?? null as number | null, postmasterPid: existsSync(pm) ? Number(readFileSync(pm, "utf8").split(/\r?\n/)[0]) : null };
}
function alive(pid: number | null) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
/** La recette ne parle qu'au serveur local du profil : toute autre adresse est refusée avant l'envoi. */
function assertLoopback(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !/^\d{4,5}$/.test(u.port)) throw new Error("Adresse hors du serveur local refusée : " + u.origin);
  return u.href;
}
async function portOpen(origin: string) { try { await fetch(assertLoopback(origin + "/api/auth/session")); return true; } catch { return false; } }

/**
 * `fetch` rejoué une fois si la connexion est coupée avant toute réponse (connexion keep-alive
 * fermée par le serveur pendant une pause). Même requête, même clé d'idempotence : c'est le
 * mécanisme de rejeu du produit lui-même. Le rejeu est consigné au journal.
 */
async function send(url: string, init: RequestInit = {}): Promise<Response> {
  url = assertLoopback(url);
  try { return await fetch(url, init); }
  catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? "inconnue";
    log("Rejeu réseau (" + cause + ") : " + (init.method ?? "GET") + " " + url.replace(/code=[A-Za-z0-9_-]+/, "code=<masqué>").replace(/grant=[^&]+/, "grant=<masqué>"));
    return fetch(url, init);
  }
}

class Client {
  cookie = ""; csrf = ""; constructor(readonly origin: string) {}
  async login(home: string, simulation = false) {
    const out = launcher("login", home, ["--sans-navigateur", ...(simulation ? ["--simulation"] : [])]);
    const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(out)?.[1];
    if (!url) throw new Error("Lien de connexion absent de la sortie du lanceur");
    const r = await send(url, { redirect: "manual" });
    if (r.status !== 303) throw new Error("Connexion locale refusée : " + r.status + " " + await r.text());
    this.cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    const replay = await send(url, { redirect: "manual" });
    const session = await (await this.get("/api/auth/session")).json() as Json;
    this.csrf = String(session.csrfToken ?? "");
    return { session, replayStatus: replay.status };
  }
  headers(extra: Record<string, string> = {}) { return { cookie: this.cookie, origin: this.origin, "x-probant-csrf": this.csrf, ...extra }; }
  get(path: string) { return send(this.origin + path, { headers: this.headers() }); }
  post(path: string, body: unknown, key: string = randomUUID()) {
    return send(this.origin + path, { method: "POST", headers: this.headers({ "Content-Type": "application/json", "Idempotency-Key": key }), body: JSON.stringify(body) });
  }
  postForm(path: string, form: FormData, key: string = randomUUID()) {
    return send(this.origin + path, { method: "POST", headers: this.headers({ "Idempotency-Key": key }), body: form });
  }
}
async function body(r: Response) { const text = await r.text(); try { return { status: r.status, json: JSON.parse(text) as Json }; } catch { return { status: r.status, json: { raw: text.slice(0, 300) } as Json }; } }
const cashPath = (dossierId: string, extra = "") => "/api/workpapers/cash?dossierId=" + dossierId + "&periodId=" + PID + extra;

async function cashCommand(c: Client, dossierId: string, command: Json, key?: string) {
  const r = await body(await c.post(cashPath(dossierId), command, key));
  if (r.status !== 200) throw new Error("Commande " + command.command + " refusée : " + JSON.stringify(r.json));
  return r.json.run as WorkpaperRun;
}

// FEC synthétique valide (même forme que e2e/fec-persistent.spec.ts) : n ventes équilibrées 411000 / 707000.
function syntheticFec(lines: number, offset = 0) {
  const header = "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise";
  const rows = [header];
  for (let i = 1 + offset; i <= lines + offset; i++) {
    const amount = (i * 100).toFixed(2).replace(".", ","), num = "VE" + String(i).padStart(6, "0");
    rows.push(`VE|Ventes|${num}|20241231|411000|Clients|||FA${i}|20241231|Vente|${amount}|0,00|||20241231||`, `VE|Ventes|${num}|20241231|707000|Ventes|||FA${i}|20241231|Vente|0,00|${amount}|||20241231||`);
  }
  return Buffer.from(rows.join("\n") + "\n", "utf8");
}
async function startFec(c: Client, dossierId: string, name: string, bytes: Buffer, idempotencyKey: string) {
  const r = await body(await c.post("/api/dossiers/" + dossierId + "/uploads", { fileName: name, documentType: "fec", contentType: "text/plain", contentLength: bytes.length,
    checksumSha256Base64: createHash("sha256").update(bytes).digest("base64"), idempotencyKey }));
  if (![200, 201].includes(r.status)) throw new Error("Intention d'envoi FEC refusée : " + JSON.stringify(r.json));
  return r.json as { jobId: string; sourceDocumentId: string; status: string; upload: { method: string; url: string; headers: Record<string, string> } | null };
}
async function putFec(upload: { url: string; headers: Record<string, string> }, bytes: Buffer) {
  const r = await send(upload.url, { method: "PUT", headers: upload.headers, body: new Uint8Array(bytes) });
  return { status: r.status, body: await r.text() };
}
async function completeFec(c: Client, dossierId: string, jobId: string) {
  const r = await body(await c.post("/api/dossiers/" + dossierId + "/uploads/" + jobId + "/complete", {}));
  if (r.status !== 200) throw new Error("Finalisation FEC refusée : " + JSON.stringify(r.json));
  for (let i = 0; i < 120; i++) {
    const job = await body(await c.get("/api/dossiers/" + dossierId + "/ingestion-jobs/" + jobId));
    if (["completed", "failed", "quarantined"].includes(String(job.json.status))) return job.json;
    await new Promise(res => setTimeout(res, 500));
  }
  throw new Error("Traitement FEC non terminé en 60 s");
}
async function snapshotOf(c: Client, dossierId: string) {
  const r = await body(await c.get("/api/dossiers/" + dossierId + "/snapshot"));
  return { status: r.status, hash: r.json.snapshotHash as string | undefined, version: r.json.snapshotVersion as string | undefined, sourceKind: r.json.sourceKind as string | undefined, sources: (r.json.sourceDocuments as { id: string; fingerprint: string; location?: { provider: string } }[] | undefined) ?? [] };
}

async function exportAll(c: Client, dossierId: string, run: WorkpaperRun, missionHash: string, label: string) {
  const files: Record<string, { bytes: number; sha256: string }> = {};
  for (const format of ["json", "html", "pdf", "manifest"] as const) {
    const r = await c.post("/api/workpapers/cash/export", { dossierId, periodId: PID, id: run.id, version: run.version, kind: "approved", format, expectedSnapshotHash: missionHash });
    const bytes = Buffer.from(await r.arrayBuffer());
    if (r.status !== 200) throw new Error("Export " + format + " refusé : " + bytes.toString("utf8").slice(0, 300));
    files[format] = { bytes: bytes.length, sha256: sha256(bytes) };
    // Nom de fichier tiré d'un libellé interne de phase, jamais de la réponse ; le contenu est la preuve exportée elle-même.
    if (format === "html") writeFileSync(join(OUT, "export-" + label.toLowerCase().replace(/[^a-z0-9-]/g, "-") + ".html"), bytes);
  }
  return files;
}
async function readBack(c: Client, dossierId: string, runId: string, documentId: string) {
  const view = await body(await c.get(cashPath(dossierId, "&id=" + encodeURIComponent(runId))));
  const mission = await body(await c.get(cashPath(dossierId, "&operation=mission&id=" + encodeURIComponent(runId))));
  const piece = await c.get(cashPath(dossierId, "&operation=download&id=" + encodeURIComponent(documentId)));
  const pieceBytes = Buffer.from(await piece.arrayBuffer());
  const run = (view.json.runs as WorkpaperRun[])[0];
  const m = mission.json.mission as Json & { hash: string; procedure: { contentHash: string } };
  return { view: view.json, run, missionHash: m.hash, mission: m, pieceStatus: piece.status, pieceSha256: sha256(pieceBytes) };
}

async function phaseAvant(home: string) {
  const { origin } = profileOf(home), c = new Client(origin);
  const login = await c.login(home);
  check("C07-LOGIN", "connexion locale par code à usage unique ; le même lien rejoué est refusé", login.session.authenticated === true && login.session.reviewKind === "personal" && login.replayStatus === 401, { reviewKind: login.session.reviewKind, displayName: login.session.displayName, replay: login.replayStatus });
  const status = await body(await c.get("/api/local/status"));
  check("C07-PROFILE", "profil personnel : 12 chaînes ouvertes, base personnelle, 22 migrations", (status.json.chains as { enabled: boolean }[]).every(x => x.enabled) && (status.json.database as Json).name === "probant_personnel" && (status.json.database as Json).migrationsApplied === 22, status.json);
  // Dossier : un double envoi retrouve le même dossier.
  // Un dossier par exécution : la recette est rejouable sur le même profil.
  const dossierInput = { legalName: "Recette C07 SAS · " + new Date().toISOString().slice(0, 19), siren: "552100554", financialYear: "2024" };
  const [d1, d2] = await Promise.all([body(await c.post("/api/local/dossiers", dossierInput)), body(await c.post("/api/local/dossiers", dossierInput))]);
  const dossierId = String((d1.json.dossier as Json).id);
  check("C07-DOSSIER-DOUBLE", "double envoi de création du dossier : un seul dossier", (d1.json.dossier as Json).id === (d2.json.dossier as Json).id && [d1.json.created, d2.json.created].filter(Boolean).length === 1, { d1: d1.status, d2: d2.status });
  // Importer, approuver.
  const ids: Record<string, string> = {}, documents: Record<string, { documentId: string; sha256: string }> = {};
  for (const type of TYPES) {
    const bytes = readFileSync(join(PIECES, type + ".csv")), form = new FormData();
    form.set("file", new File([bytes], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(cashMapping(type))); form.set("period", JSON.stringify(cashPeriod)); form.set("documentType", type);
    const preview = await body(await c.postForm("/api/workpapers/cash/imports?dossierId=" + dossierId + "&periodId=" + PID, form));
    if (preview.status !== 200) throw new Error("Aperçu " + type + " refusé : " + JSON.stringify(preview.json));
    const batch = preview.json.batch as { id: string; previewHash: string; document: { id: string; byteHash: string } };
    const approved = await body(await c.post("/api/workpapers/cash/imports?dossierId=" + dossierId + "&periodId=" + PID, { command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: null }));
    if (approved.status !== 200) throw new Error("Approbation " + type + " refusée : " + JSON.stringify(approved.json));
    ids[type] = batch.id; documents[type] = { documentId: batch.document.id, sha256: sha256(bytes) };
    if (batch.document.byteHash !== sha256(bytes)) check("C07-BYTES-" + type, "empreinte de la pièce importée", false, batch.document.byteHash);
  }
  check("C07-IMPORT", "cinq pièces importées et approuvées ; empreinte serveur = empreinte du fichier", Object.keys(ids).length === 5, documents);
  // Figer, configurer, exécuter.
  let run = await cashCommand(c, dossierId, { command: "create", period: cashPeriod });
  const window = { startDate: "2025-01-01", endDate: "2025-02-28", coverage: "documented", note: "Relevés de janvier et février 2025 obtenus", evidenceImportIds: [ids.cash_settlements] };
  run = await cashCommand(c, dossierId, { command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), window });
  check("C07-FREEZE", "population figée : 1 compte retenu, 3 exclus avec motif", run.state === "ready" && run.selection?.selectedIds.length === 1 && run.selection?.exclusions.length === 3, run.selection?.exclusions.map(e => e.reason));
  run = await cashCommand(c, dossierId, { command: "configure", id: run.id, expectedVersion: run.version, draft: { window, exclusions: [], allocations: [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }], corrections: [] } });
  run = await cashCommand(c, dossierId, { command: "execute", id: run.id, expectedVersion: run.version });
  const result = run.result?.result as { accounts: { bridge: Json; items: { itemId: string; status: string }[] }[] };
  const bridge = result.accounts[0].bridge as { statement: { amount: { amount: string } }; reconstructed: { amount: string }; difference: { amount: string } };
  check("C07-EXECUTE", "pont 90,00 + 15,00 − 5,00 = 100,00, écart 0,00 ; R1 apurée, P1 ouverte", bridge.statement.amount.amount === "90.00" && bridge.reconstructed.amount === "100.00" && bridge.difference.amount === "0.00"
    && JSON.stringify(result.accounts[0].items.map(i => [i.itemId, i.status])) === JSON.stringify([["R1", "cleared"], ["P1", "open"]]) && run.result?.outcome === "exceptions_detected", { bridge, items: result.accounts[0].items });
  // Double commande : même clé deux fois → même réponse, une seule version.
  const key = "recette-c07-note-" + randomUUID().slice(0, 8), note = { command: "note", id: run.id, expectedVersion: run.version, note: { id: "obs-double", kind: "observation", text: "Observation enregistrée une fois", amount: { kind: "unknown", reason: "Sans montant" }, blocking: false } };
  const [n1, n2] = await Promise.all([body(await c.post(cashPath(dossierId), note, key)), body(await c.post(cashPath(dossierId), note, key))]);
  const afterDouble = (await readBack(c, dossierId, run.id, documents.cash_ledger.documentId)).run;
  const okCodes = [n1.status, n2.status].sort().join(",");
  check("C07-DOUBLE", "double commande (même clé d'idempotence, envois simultanés) : une seule version créée, réponse rejouée ou conflit explicite",
    afterDouble.version === run.version + 1 && afterDouble.notes.filter(n => n.id === "obs-double").length === 1 && (okCodes === "200,200" || okCodes === "200,409"), { statuses: [n1.status, n2.status], versionAvant: run.version, versionApres: afterDouble.version, bodies: [n1.json.error ?? "run", n2.json.error ?? "run"] });
  const replay = await body(await c.post(cashPath(dossierId), note, key));
  check("C07-REPLAY", "rejeu séquentiel de la même clé : même réponse, aucune version supplémentaire", replay.status === 200 && (replay.json.run as WorkpaperRun).version === afterDouble.version, { status: replay.status, version: (replay.json.run as WorkpaperRun | undefined)?.version });
  const reused = await body(await c.post(cashPath(dossierId), { ...note, note: { ...note.note, text: "Autre contenu" } }, key));
  check("C07-KEY-REUSE", "même clé pour un autre contenu : refus 409 IDEMPOTENCY_KEY_REUSED", reused.status === 409 && reused.json.error === "IDEMPOTENCY_KEY_REUSED", reused.json);
  // Conflit entre onglets : l'onglet A garde la version v, l'onglet B enregistre v+1.
  run = afterDouble;
  const tabA = run.version;
  const tabB = await cashCommand(c, dossierId, { command: "note", id: run.id, expectedVersion: run.version, note: { id: "obs-onglet-b", kind: "observation", text: "Saisie de l'onglet B", amount: { kind: "unknown", reason: "Sans montant" }, blocking: false } });
  const stale = await body(await c.post(cashPath(dossierId), { command: "note", id: run.id, expectedVersion: tabA, note: { id: "obs-onglet-a", kind: "observation", text: "Saisie de l'onglet A", amount: { kind: "unknown", reason: "Sans montant" }, blocking: false } }));
  const afterConflict = (await readBack(c, dossierId, run.id, documents.cash_ledger.documentId)).run;
  check("C07-TABS", "conflit entre onglets : 409 avec la version serveur, la saisie de B conservée, celle de A non écrite", stale.status === 409 && (stale.json.current as Json | undefined)?.version === tabB.version
    && afterConflict.notes.some(n => n.id === "obs-onglet-b") && !afterConflict.notes.some(n => n.id === "obs-onglet-a"), { status: stale.status, error: stale.json.error, expectedVersion: stale.json.expectedVersion, current: (stale.json.current as Json | undefined)?.version });
  run = afterConflict;
  // Conclure, soumettre, relire soi-même (relecture personnelle nommée), verrouiller.
  run = await cashCommand(c, dossierId, { command: "conclude", id: run.id, expectedVersion: run.version, text: "Pont concordant ; le chèque 1045 (5,00 EUR) reste non débité au 28/02/2025 : relance documentée." });
  const blocking = run.notes.find(n => n.blocking && !n.resolution)!;
  run = await cashCommand(c, dossierId, { command: "resolve", id: run.id, expectedVersion: run.version, noteId: blocking.id, text: "Chèque remis au fournisseur, débit attendu en mars ; aucune anomalie validée." });
  run = await cashCommand(c, dossierId, { command: "submit", id: run.id, expectedVersion: run.version });
  run = await cashCommand(c, dossierId, { command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash, text: "Relecture personnelle du pont, des suspens et des pièces citées." });
  check("C07-REVIEW", "relecture personnelle nommée enregistrée comme telle", run.approval?.kind === "personal" && run.approval.actorId === run.preparedBy && !!run.approval.reviewerName, run.approval);
  run = await cashCommand(c, dossierId, { command: "lock", id: run.id, expectedVersion: run.version });
  check("C07-LOCK", "version verrouillée", run.state === "locked", { version: run.version, state: run.state });
  const back = await readBack(c, dossierId, run.id, documents.cash_ledger.documentId);
  const exports = await exportAll(c, dossierId, run, back.missionHash, "avant");
  check("C07-EXPORT", "export approuvé de la version verrouillée (json, html, pdf, manifeste)", Object.keys(exports).length === 4, exports);
  check("C07-PIECE", "pièce téléchargée = octets originaux", back.pieceStatus === 200 && back.pieceSha256 === documents.cash_ledger.sha256, { status: back.pieceStatus, sha256: back.pieceSha256 });
  const html = readFileSync(join(OUT, "export-avant.html"), "utf8");
  check("C07-EXPORT-REVIEW", "l'export nomme la relecture personnelle", html.includes("Relecture personnelle nommée — "), html.match(/Relecture personnelle nommée — [^<]{0,80}/)?.[0] ?? "absent");
  // Dépôt FEC n° 1 : complet avant l'arrêt (stockage local + traitement local).
  const fec1 = syntheticFec(200), fecKey1 = "recette-c07-fec1-" + randomUUID().slice(0, 8);
  writeFileSync(join(PIECES, "552100554FEC20241231.txt"), fec1);
  const [s1, s1b] = await Promise.all([startFec(c, dossierId, "552100554FEC20241231.txt", fec1, fecKey1), startFec(c, dossierId, "552100554FEC20241231.txt", fec1, fecKey1)]);
  check("C07-FEC-DOUBLE", "double envoi de l'intention FEC (même clé) : un seul job", s1.jobId === s1b.jobId, { jobs: [s1.jobId, s1b.jobId] });
  const put1 = await putFec(s1.upload!, fec1);
  const job1 = await completeFec(c, dossierId, s1.jobId);
  const snap1 = await snapshotOf(c, dossierId);
  const local1 = join(home, "pieces", "organizations", String((login.session as Json).organizationId), "dossiers", dossierId, "documents", s1.sourceDocumentId, "source");
  check("C07-FEC-LOCAL", "FEC déposé sans S3 ni SQS : pièce écrite une fois sur le PC, traitée localement, synthèse persistante", put1.status === 200 && job1.status === "completed" && snap1.status === 200 && snap1.sourceKind === "persistent"
    && existsSync(local1) && sha256(readFileSync(local1)) === sha256(fec1) && snap1.sources.some(d => d.location?.provider === "local"), { put: put1.status, job: job1.status, snapshot: snap1.status, provider: snap1.sources.map(d => d.location?.provider) });
  const rePut = await putFec(s1.upload!, Buffer.from("X".repeat(fec1.length)));
  check("C07-FEC-WRITE-ONCE", "un second envoi vers la même autorisation ne remplace pas l'original", rePut.status >= 400 && sha256(readFileSync(local1)) === sha256(fec1), { status: rePut.status });
  // Dépôt FEC n° 2 : interrompu (octets reçus, finalisation non faite) par l'arrêt du serveur.
  const fec2 = syntheticFec(300, 1000), fecKey2 = "recette-c07-fec2-" + randomUUID().slice(0, 8);
  writeFileSync(join(PIECES, "552100554FEC20241231-v2.txt"), fec2);
  const s2 = await startFec(c, dossierId, "552100554FEC20241231-v2.txt", fec2, fecKey2);
  const put2 = await putFec(s2.upload!, fec2);
  check("C07-FEC-INTERRUPTED", "dépôt n° 2 reçu puis interrompu avant finalisation", put2.status === 200 && s2.status === "uploading", { put: put2.status, status: s2.status });
  const state = { fec: { snapshotHash: snap1.hash, snapshotVersion: snap1.version, job1: s1.jobId, job2: s2.jobId, key2: fecKey2, fec2Sha256: sha256(fec2), fec1Sha256: sha256(fec1), localPiece1: local1 },
    dossierId, runId: run.id, rootId: run.rootId, version: run.version, revision: run.revision, state: run.state, approval: run.approval, contentHash: back.mission.procedure.contentHash,
    missionHash: back.missionHash, importIds: ids, documents, exports, processes: processes(home) };
  writeFileSync(join(OUT, "etat-avant.json"), JSON.stringify(state, null, 2));
  return state;
}

async function phaseRelecture(home: string, label: string, expected: Awaited<ReturnType<typeof phaseAvant>>) {
  const { origin } = profileOf(home), c = new Client(origin);
  await c.login(home);
  const back = await readBack(c, expected.dossierId, expected.runId, expected.documents.cash_ledger.documentId);
  check("C07-" + label + "-VERSION", label + " : même feuille, même version verrouillée, même relecture", back.run.version === expected.version && back.run.state === "locked" && back.run.approval?.kind === "personal" && JSON.stringify(back.run.approval) === JSON.stringify(expected.approval),
    { version: back.run.version, state: back.run.state, approval: back.run.approval?.kind });
  const sources = (back.view.sourceHeads as { document_type: string; import_id: string }[]).map(h => [h.document_type, h.import_id]).sort();
  check("C07-" + label + "-SOURCES", label + " : mêmes sources courantes", JSON.stringify(sources) === JSON.stringify(Object.entries(expected.importIds).sort()), sources);
  const pieces: Record<string, boolean> = {};
  for (const [type, d] of Object.entries(expected.documents)) {
    const r = await c.get(cashPath(expected.dossierId, "&operation=download&id=" + encodeURIComponent(d.documentId)));
    pieces[type] = r.status === 200 && sha256(Buffer.from(await r.arrayBuffer())) === d.sha256;
  }
  check("C07-" + label + "-PIECES", label + " : les cinq pièces relues octet pour octet", Object.values(pieces).every(Boolean), pieces);
  check("C07-" + label + "-MISSION", label + " : même empreinte de synthèse et de contenu", back.missionHash === expected.missionHash && back.mission.procedure.contentHash === expected.contentHash, { missionHash: back.missionHash });
  const exports = await exportAll(c, expected.dossierId, back.run, back.missionHash, label);
  const same = Object.fromEntries(Object.entries(exports).map(([f, e]) => [f, e.sha256 === expected.exports[f].sha256]));
  check("C07-" + label + "-EXPORT", label + " : exports identiques octet pour octet", Object.values(same).every(Boolean), same);
  return { exports, missionHash: back.missionHash };
}

async function complete() {
  const home = resolve(o.home);
  writeFileSync(join(OUT, "journal-lanceur.log"), "");
  log("Profil de recette : " + home);
  launcher("start", home, ["--sans-navigateur"]);
  const first = processes(home);
  log("Processus initiaux : Next " + first.nextPid + ", postmaster " + first.postmasterPid);
  const avant = await phaseAvant(home);
  launcher("stop", home);
  const { origin } = profileOf(home);
  const stopped = { next: alive(first.nextPid), postmaster: alive(first.postmasterPid), port: await portOpen(origin), pgdataLock: existsSync(join(home, "pgdata", "postmaster.pid")) };
  check("C07-STOP", "arrêt : plus de Next, plus de PostgreSQL, port fermé, cluster fermé proprement", !stopped.next && !stopped.postmaster && !stopped.port && !stopped.pgdataLock, stopped);
  launcher("start", home, ["--sans-navigateur"]);
  const second = processes(home);
  check("C07-RESTART", "relance : nouveaux processus", !!second.nextPid && !!second.postmasterPid && second.nextPid !== first.nextPid && second.postmasterPid !== first.postmasterPid, { avant: first, apres: second });
  const apres = await phaseRelecture(home, "REPRISE", avant);
  {
    const c = new Client(profileOf(home).origin); await c.login(home);
    const snap = await snapshotOf(c, avant.dossierId);
    check("C07-REPRISE-FEC-SNAPSHOT", "REPRISE : même synthèse FEC persistante (empreinte et version)", snap.hash === avant.fec.snapshotHash && snap.version === avant.fec.snapshotVersion, { hash: snap.hash });
    // Comme l'écran Dépôt : rejouer l'intention (même clé), renvoyer le fichier si une autorisation revient, finaliser.
    const fec2 = readFileSync(join(PIECES, "552100554FEC20241231-v2.txt"));
    const again = await startFec(c, avant.dossierId, "552100554FEC20241231-v2.txt", fec2, avant.fec.key2);
    const rePut = again.upload ? await putFec(again.upload, fec2) : null;
    const job2 = await completeFec(c, avant.dossierId, avant.fec.job2);
    const snap2 = await snapshotOf(c, avant.dossierId);
    check("C07-REPRISE-FEC-RESUME", "REPRISE : le dépôt interrompu reprend depuis l'état PostgreSQL (même job ; renvoi des mêmes octets idempotent) et produit une nouvelle synthèse",
      again.jobId === avant.fec.job2 && (rePut === null || rePut.status === 200) && job2.status === "completed" && snap2.hash !== avant.fec.snapshotHash,
      { job: job2.status, sameJob: again.jobId === avant.fec.job2, rePut: rePut?.status ?? "aucun", newSnapshot: snap2.version });
  }
  // Sauvegarde cohérente puis restauration dans un dossier distinct.
  const backupOut = launcher("backup", home, ["--label", "recette-c07"]);
  const backupDir = /Sauvegarde cohérente : (.+?) \(/.exec(backupOut)?.[1];
  if (!backupDir) throw new Error("Dossier de sauvegarde introuvable dans la sortie");
  const manifest = JSON.parse(readFileSync(join(backupDir, "manifeste.json"), "utf8"));
  writeFileSync(join(OUT, "manifeste-sauvegarde.json"), JSON.stringify(manifest, null, 2));
  check("C07-BACKUP", "sauvegarde : dump vérifié par pg_restore --list, manifeste de contenu par table", manifest.format === "probant-local-backup-1" && Object.keys(manifest.tables).length > 30 && manifest.tables.cash_imports.rows === 5, { tables: Object.keys(manifest.tables).length, cash_imports: manifest.tables.cash_imports, dump: manifest.dump });
  const target = resolve(o.restore ?? join(home, "..", "restauration-" + Date.now()));
  const refused = spawnSync(process.execPath, [LAUNCHER, "restore", backupDir, "--home", home, "--vers", home], { encoding: "utf8", windowsHide: true, cwd: ROOT });
  check("C07-RESTORE-GUARD", "restauration sur le profil courant refusée", refused.status === 1 && /profil courant/.test(refused.stderr), refused.stderr.trim());
  launcher("restore", home, [backupDir, "--vers", target]);
  const report = JSON.parse(readFileSync(join(target, "restauration.json"), "utf8"));
  writeFileSync(join(OUT, "rapport-restauration.json"), JSON.stringify(report, null, 2));
  check("C07-RESTORE", "restauration dans un dossier distinct : toutes les tables identiques au manifeste", report.differences.length === 0, report);
  const stillThere = await phaseRelecture(home, "COURANT-APRES-RESTAURATION", avant);
  launcher("start", target, ["--sans-navigateur"]);
  try {
    const restored = await phaseRelecture(target, "RESTAURE", avant);
    check("C07-RESTORE-EXPORT", "le profil restauré exporte les mêmes octets que l'original", JSON.stringify(restored.exports) === JSON.stringify(avant.exports), restored.exports);
  } finally { launcher("stop", target); }
  void stillThere; void apres;
  launcher("stop", home);
  const failed = checks.filter(c => c.status === "FAIL");
  writeFileSync(join(OUT, "RESULTATS.json"), JSON.stringify({ executedAt: new Date().toISOString(), profile: home, restoredTo: target, backup: backupDir, node: process.version, checks, summary: { pass: checks.length - failed.length, fail: failed.length } }, null, 2));
  writeFileSync(join(OUT, "journal-recette.log"), journal.join("\n") + "\n");
  log(failed.length ? failed.length + " contrôle(s) en échec" : "Tous les contrôles réussis (" + checks.length + ")");
  process.exitCode = failed.length ? 1 : 0;
}

if (phase !== "complete") throw new Error("Phase inconnue : " + phase);
complete().catch(error => {
  writeFileSync(join(OUT, "journal-recette.log"), journal.join("\n") + "\n" + String(error?.stack ?? error) + "\n");
  writeFileSync(join(OUT, "RESULTATS.json"), JSON.stringify({ executedAt: new Date().toISOString(), aborted: String(error?.message ?? error), checks }, null, 2));
  process.stderr.write(String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
