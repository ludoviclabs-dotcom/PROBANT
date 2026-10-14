#!/usr/bin/env node
// Lanceur du profil personnel local de PROBANT (mission C07).
//
//   npm run local:init -- --nom "Prénom Nom"   crée le profil : cluster PostgreSQL dédié, base, migrations
//   npm run local:start                         démarre PostgreSQL puis Next (127.0.0.1) et ouvre la connexion
//   npm run local:stop                          arrête Next puis PostgreSQL
//   npm run local:status                        état du profil, des processus et des migrations
//   npm run local:login                         nouveau lien de connexion à usage unique
//   npm run local:backup                        sauvegarde cohérente (base + pièces) avec manifeste
//   npm run local:restore -- <sauvegarde> --vers <dossier>   restauration dans un dossier distinct
//   npm run local:migrate                       migrations en attente, précédées d'une sauvegarde
//
// Le profil vit hors du dépôt (par défaut %LOCALAPPDATA%\PROBANT\personnel, ou
// PROBANT_LOCAL_HOME / --home). Il n'utilise jamais une base de recette jetable
// (*_ci, *_test) ni un cluster qu'il n'a pas créé : la base porte un marqueur
// `probant_local.profile` et son data_directory est revérifié à chaque démarrage.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import postgres from "postgres";
import { migrationFiles, projectRoot } from "../db/migration-utils.mjs";
import {
  APP_ROLE, CONFIG_FILE, DATABASE, DEFAULT_APP_PORT, DEFAULT_PG_PORT, OWNER_SUBJECT, PG_MAJOR, SECRETS_FILE, SIMULATION_SUBJECT, STATE_FILE, SUPER_ROLE,
  appOrigin, childEnv, compareManifests, loopbackUrl, databaseUrl, defaultHome, defaultPgBinCandidates, envExampleKeys, isDisposableDatabaseName, parseArgs, pieceFile,
  restoreTargetIssues, timestamp, validateConfig,
} from "./local-lib.mjs";

class LocalError extends Error {
  constructor(message, hint) { super(message); this.hint = hint; }
}
const say = message => process.stdout.write("[probant-local] " + message + "\n");
const exe = process.platform === "win32" ? ".exe" : "";
const sha256 = buffer => createHash("sha256").update(buffer).digest("hex");
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8"); };
/**
 * Dossier de profil réservé à l'utilisateur courant : secrets, base, pièces et sauvegardes y vivent.
 * Sous Windows, %LOCALAPPDATA% est déjà privé et les modes POSIX sont sans effet ; ailleurs, 0700 / 0600.
 */
function privateDirectory(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(dir, 0o700);
}
function writeSecrets(file, secrets) {
  writeFileSync(file, JSON.stringify(secrets, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
  if (process.platform !== "win32") chmodSync(file, 0o600);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nonEmptyDir = dir => existsSync(dir) && readdirSync(dir).length > 0;

// ── Profil ──────────────────────────────────────────────────────────────
function homeFrom(options) {
  return options.home ? resolve(String(options.home)) : defaultHome(process.env, process.platform, homedir());
}
function loadProfile(home) {
  const configFile = join(home, CONFIG_FILE), secretsFile = join(home, SECRETS_FILE);
  if (!existsSync(configFile)) throw new LocalError("Aucun profil personnel dans " + home + ".", "Créez-le avec : npm run local:init -- --nom \"Prénom Nom\"");
  const config = readJson(configFile), errors = validateConfig(config);
  if (errors.length) throw new LocalError("Configuration invalide (" + configFile + ") : " + errors.join(" ; "), "Corrigez le fichier ou recréez le profil dans un autre dossier.");
  if (!existsSync(secretsFile)) throw new LocalError("Fichier de secrets absent : " + secretsFile, "Il est créé par local:init ; sans lui la base n'est plus accessible.");
  const secrets = readJson(secretsFile);
  if (!secrets.appPassword || !secrets.superPassword || !secrets.sessionSecret || secrets.sessionSecret.length < 32) throw new LocalError("Secrets incomplets dans " + secretsFile + ".");
  return { home, config, secrets, pgdata: join(home, "pgdata"), logs: join(home, "logs") };
}

// ── PostgreSQL ──────────────────────────────────────────────────────────
function pgTool(bin, tool) {
  const file = join(bin, tool + exe);
  if (!existsSync(file)) throw new LocalError("Outil PostgreSQL introuvable : " + file, "Installez PostgreSQL " + PG_MAJOR + " (voir docs/local/RUNTIME_PERSONNEL.md) puis indiquez son dossier bin dans postgres.bin.");
  return file;
}
function pgMajor(bin) {
  const out = spawnSync(pgTool(bin, "postgres"), ["--version"], { encoding: "utf8", windowsHide: true });
  const match = /(\d+)(?:\.(\d+))?/.exec(out.stdout ?? "");
  if (out.status !== 0 || !match) throw new LocalError("Version de PostgreSQL illisible dans " + bin + ".");
  return { major: Number(match[1]), text: (out.stdout ?? "").trim() };
}
function findPgBin(explicit) {
  const { list } = defaultPgBinCandidates(process.env, process.platform);
  for (const dir of explicit ? [resolve(String(explicit))] : list) {
    if (existsSync(join(dir, "pg_ctl" + exe)) && existsSync(join(dir, "postgres" + exe))) return dir;
  }
  throw new LocalError("PostgreSQL " + PG_MAJOR + " introuvable (cherché : " + (explicit ? explicit : list.join(", ")) + ").",
    "Installez les binaires PostgreSQL " + PG_MAJOR + " puis relancez avec --pg-bin <dossier bin> (voir docs/local/RUNTIME_PERSONNEL.md).");
}
function pgEnv(password) {
  // Messages des outils en anglais ASCII : lisibles dans toute console Windows, sans mojibake.
  return { ...process.env, PGPASSWORD: password, PGCLIENTENCODING: "UTF8", LC_MESSAGES: "C", PGCONNECT_TIMEOUT: "5" };
}
function run(file, args, { env, input, quiet } = {}) {
  const result = spawnSync(file, args, { cwd: projectRoot, encoding: "utf8", windowsHide: true, env: env ?? process.env, input, maxBuffer: 64 * 1024 * 1024 });
  if (!quiet && result.status !== 0) process.stderr.write((result.stdout ?? "") + (result.stderr ?? ""));
  return result;
}
function portFree(port) {
  return new Promise(resolvePort => {
    const server = createServer().once("error", () => resolvePort(false)).once("listening", () => server.close(() => resolvePort(true)));
    server.listen(port, "127.0.0.1");
  });
}
function pgRunning(p) {
  if (!existsSync(join(p.pgdata, "PG_VERSION"))) return false;
  return run(pgTool(p.config.postgres.bin, "pg_ctl"), ["status", "-D", p.pgdata], { quiet: true }).status === 0;
}
function logTail(file, lines = 25) {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").split(/\r?\n/).slice(-lines).join("\n");
}
async function startPostgres(p) {
  if (!existsSync(join(p.pgdata, "PG_VERSION"))) throw new LocalError("Cluster PostgreSQL absent : " + p.pgdata, "Le profil est incomplet ; restaurez une sauvegarde dans un nouveau dossier (local:restore).");
  if (pgRunning(p)) return false;
  if (!(await portFree(p.config.postgres.port))) {
    throw new LocalError("Le port PostgreSQL " + p.config.postgres.port + " est déjà utilisé par un autre programme.",
      "Arrêtez ce programme, ou changez postgres.port dans " + join(p.home, CONFIG_FILE) + " (le profil ne se connecte jamais à un serveur qu'il n'a pas démarré).");
  }
  mkdirSync(p.logs, { recursive: true });
  const logFile = join(p.logs, "postgresql.log"), ctlLog = join(p.logs, "pg_ctl.log");
  // Pas de tube : le serveur hérite des descripteurs de pg_ctl, et spawnSync attendrait la fin de postgres.
  const out = openSync(ctlLog, "a");
  let result;
  try {
    result = spawnSync(pgTool(p.config.postgres.bin, "pg_ctl"), ["start", "-D", p.pgdata, "-l", logFile, "-w", "-t", "90"], { env: pgEnv(""), windowsHide: true, stdio: ["ignore", out, out] });
  } finally { closeSync(out); }
  if (result.status !== 0) throw new LocalError("PostgreSQL n'a pas démarré.", "Journaux (" + ctlLog + ", " + logFile + ") :\n" + logTail(ctlLog, 5) + "\n" + logTail(logFile));
  say("PostgreSQL démarré (port " + p.config.postgres.port + ").");
  return true;
}
function stopPostgres(p) {
  if (!pgRunning(p)) { say("PostgreSQL déjà arrêté."); return; }
  const result = run(pgTool(p.config.postgres.bin, "pg_ctl"), ["stop", "-D", p.pgdata, "-m", "fast", "-w", "-t", "90"], { env: pgEnv("") });
  if (result.status !== 0) throw new LocalError("Arrêt de PostgreSQL impossible.", logTail(join(p.logs, "postgresql.log")));
  say("PostgreSQL arrêté proprement.");
}
function connect(p, role = APP_ROLE) {
  return postgres(databaseUrl(p.config, p.secrets, role), { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 5, onnotice: () => {} });
}
async function withSql(p, body, role = APP_ROLE) {
  const sql = connect(p, role);
  try { return await body(sql); }
  catch (error) {
    if (error?.code === "ECONNREFUSED") throw new LocalError("Connexion refusée par PostgreSQL sur 127.0.0.1:" + p.config.postgres.port + ".", "Le serveur est-il démarré ? npm run local:status");
    if (error?.code === "28P01") throw new LocalError("Mot de passe refusé par PostgreSQL.", "Le fichier " + SECRETS_FILE + " ne correspond plus à ce cluster.");
    if (error?.code === "3D000") throw new LocalError("Base " + p.config.postgres.database + " absente du cluster.", "Le profil est incomplet ; restaurez une sauvegarde dans un nouveau dossier.");
    throw error;
  } finally { await sql.end({ timeout: 2 }); }
}
const samePath = (a, b) => resolve(a).replaceAll("\\", "/").toLowerCase() === resolve(b).replaceAll("\\", "/").toLowerCase();
/** La base ouverte est-elle bien celle de ce profil ? Nom, cluster (data_directory) et marqueur. */
async function verifyDatabase(p, sql) {
  const [row] = await sql`SELECT current_database() AS name, current_setting('data_directory') AS data_directory, to_regclass('probant_local.profile') IS NOT NULL AS marker`;
  if (isDisposableDatabaseName(row.name)) throw new LocalError("La base " + row.name + " est une base de recette jetable : refus.");
  if (row.name !== DATABASE) throw new LocalError("Base inattendue : " + row.name + ".");
  if (!samePath(row.data_directory, p.pgdata)) throw new LocalError("Le serveur sur ce port n'utilise pas le cluster du profil (" + row.data_directory + ").", "Un autre PostgreSQL écoute sur le port configuré.");
  if (!row.marker) throw new LocalError("Marqueur du profil personnel absent : cette base n'a pas été créée par local:init.");
  const [profile] = await sql`SELECT profile_id::text AS id, kind, restored_from FROM probant_local.profile`;
  if (profile?.id !== p.config.profileId || profile.kind !== "personal") throw new LocalError("Le marqueur de la base (" + profile?.id + ") ne correspond pas au profil " + p.config.profileId + ".");
  return profile;
}
async function pendingMigrations(sql) {
  const [{ ledger }] = await sql`SELECT to_regclass('public._probant_migrations') IS NOT NULL AS ledger`;
  const applied = ledger ? new Set((await sql`SELECT name FROM _probant_migrations`).map(r => r.name)) : new Set();
  return migrationFiles().filter(name => !applied.has(name));
}
function runMigrations(p) {
  const result = spawnSync(process.execPath, [join(projectRoot, "scripts", "db", "migrate.mjs")], { stdio: "inherit", windowsHide: true, cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl(p.config, p.secrets) } });
  if (result.status !== 0) throw new LocalError("Migration interrompue : la base reste à la dernière migration complète (chaque fichier et son inscription au registre sont atomiques).",
    "Restaurez au besoin la sauvegarde « avant-migration » prise juste avant (npm run local:restore).");
}
async function migrateWithBackup(p, sql) {
  const pending = await pendingMigrations(sql);
  if (!pending.length) return [];
  const applied = (await sql`SELECT to_regclass('public._probant_migrations') IS NOT NULL AS ledger`)[0].ledger ? Number((await sql`SELECT count(*)::int AS n FROM _probant_migrations`)[0].n) : 0;
  if (applied > 0) {
    say(pending.length + " migration(s) en attente : sauvegarde préalable.");
    await backup(p, { label: "avant-migration" });
  }
  runMigrations(p);
  return pending;
}

// ── Next ────────────────────────────────────────────────────────────────
const stateFile = p => join(p.home, STATE_FILE);
function readState(p) { try { return readJson(stateFile(p)); } catch { return null; } }
function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } }
function killTree(pid) {
  if (process.platform === "win32") return run("taskkill", ["/PID", String(pid), "/T", "/F"], { quiet: true }).status === 0;
  try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch { return false; } }
  return true;
}
function gitStamp() {
  const head = run("git", ["rev-parse", "HEAD"], { quiet: true });
  if (head.status !== 0) return null;
  // Seules les entrées de l'application compilée comptent : documentation, scripts et tests ne périment pas le build.
  const inputs = ["app", "lib", "components", "public", "data", "middleware.ts", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs",
    ":(exclude)**/__tests__/**", ":(exclude)**/*.test.ts", ":(exclude)**/*.test.tsx"];
  const diff = run("git", ["diff", "HEAD", "--", ...inputs], { quiet: true }).stdout ?? "";
  // Fichiers nouveaux non suivis : leur contenu compte aussi, pas seulement leur nom.
  const untracked = (run("git", ["ls-files", "--others", "--exclude-standard", "--", ...inputs], { quiet: true }).stdout ?? "").split(/\r?\n/).filter(Boolean)
    .map(file => file + ":" + sha256(readFileSync(join(projectRoot, file)))).join("\n");
  return { head: head.stdout.trim(), worktree: sha256(diff + "\n" + untracked) };
}
function buildIsCurrent() {
  const id = join(projectRoot, ".next", "BUILD_ID"), stampFile = join(projectRoot, ".next", "probant-local-build.json");
  if (!existsSync(id)) return { current: false, reason: "aucun build de production" };
  const stamp = gitStamp();
  if (!stamp) return { current: true, reason: "git indisponible : build existant réutilisé" };
  if (!existsSync(stampFile)) return { current: false, reason: "build non estampillé pour ce profil" };
  const previous = readJson(stampFile);
  return previous.head === stamp.head && previous.worktree === stamp.worktree ? { current: true, reason: "build à jour (" + stamp.head.slice(0, 7) + ")" } : { current: false, reason: "code modifié depuis le dernier build" };
}
function buildNext() {
  say("Compilation de production (next build) : quelques minutes au premier lancement…");
  const result = spawnSync(process.execPath, [join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "build"], { stdio: "inherit", cwd: projectRoot, windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (result.status !== 0) throw new LocalError("next build a échoué.", "Corrigez l'erreur ci-dessus ; le profil et la base ne sont pas modifiés.");
  const stamp = gitStamp();
  if (stamp) writeJson(join(projectRoot, ".next", "probant-local-build.json"), { ...stamp, builtAt: new Date().toISOString() });
}
/** Attente du serveur local : seule l'adresse de boucle locale du port configuré est interrogée. */
async function waitHttp(port, timeoutMs) {
  const url = loopbackUrl(port, "/api/auth/session");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { cache: "no-store" }); if (response.status < 500) return true; } catch { /* encore en démarrage */ }
    await sleep(500);
  }
  return false;
}
function startNext(p, mode) {
  const logFile = join(p.logs, "next.log");
  mkdirSync(p.logs, { recursive: true });
  const out = openSync(logFile, "a");
  const documentedKeys = existsSync(join(projectRoot, ".env.example")) ? envExampleKeys(readFileSync(join(projectRoot, ".env.example"), "utf8")) : [];
  const env = childEnv({ config: p.config, secrets: p.secrets, home: p.home, baseEnv: process.env, documentedKeys });
  if (mode === "dev") env.NODE_ENV = "development";
  const args = [join(projectRoot, "node_modules", "next", "dist", "bin", "next"), mode === "dev" ? "dev" : "start", "-H", p.config.app.host, "-p", String(p.config.app.port)];
  const child = spawn(process.execPath, args, { cwd: projectRoot, env, detached: true, windowsHide: true, stdio: ["ignore", out, out] });
  child.unref(); closeSync(out);
  return { pid: child.pid, logFile };
}
function openBrowser(url) {
  const opener = process.platform === "win32" ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(opener[0], opener[1], { detached: true, stdio: "ignore", windowsHide: true }).unref(); } catch { /* l'adresse est affichée de toute façon */ }
}
async function issueLogin(p, sql, subject = OWNER_SUBJECT, next = "/local") {
  const code = randomBytes(32).toString("base64url");
  await sql`INSERT INTO probant_local.login_codes (code_sha256, subject, expires_at) VALUES (${sha256(code)}, ${subject}, now() + interval '10 minutes')`;
  await sql`DELETE FROM probant_local.login_codes WHERE expires_at < now() - interval '1 day'`;
  return appOrigin(p.config) + "/api/auth/local?code=" + code + "&next=" + encodeURIComponent(next);
}

// ── Commandes ───────────────────────────────────────────────────────────
async function createCluster(home, config, secrets) {
  const pgdata = join(home, "pgdata"), logs = join(home, "logs");
  mkdirSync(logs, { recursive: true }); mkdirSync(join(home, "run"), { recursive: true });
  const pwfile = join(home, "run", "initdb.pw");
  writeFileSync(pwfile, secrets.superPassword, { encoding: "utf8", mode: 0o600 });
  try {
    const result = run(pgTool(config.postgres.bin, "initdb"), ["-D", pgdata, "-U", SUPER_ROLE, "--pwfile=" + pwfile, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C", "--data-checksums"], { env: pgEnv(""), quiet: true });
    if (result.status !== 0) throw new LocalError("initdb a échoué.", (result.stdout ?? "") + (result.stderr ?? ""));
  } finally { rmSync(pwfile, { force: true }); }
  // Écoute locale uniquement, port dédié, messages serveur en ASCII.
  writeFileSync(join(pgdata, "postgresql.conf"), readFileSync(join(pgdata, "postgresql.conf"), "utf8") + [
    "", "# --- PROBANT profil personnel local (C07) ---",
    "listen_addresses = '127.0.0.1'", "port = " + config.postgres.port, "max_connections = 40", "password_encryption = 'scram-sha-256'",
    "lc_messages = 'C'", "log_timezone = 'UTC'", "timezone = 'UTC'", "",
  ].join("\n"), "utf8");
  writeFileSync(join(pgdata, "pg_hba.conf"), [
    "# PROBANT profil personnel local : connexions TCP locales authentifiées uniquement.",
    "host all all 127.0.0.1/32 scram-sha-256", "host all all ::1/128 scram-sha-256", "",
  ].join("\n"), "utf8");
  const p = { home, config, secrets, pgdata, logs };
  await startPostgres(p);
  await withSql(p, async sql => {
    await sql.unsafe("CREATE ROLE " + APP_ROLE + " LOGIN PASSWORD '" + secrets.appPassword.replaceAll("'", "''") + "'");
    await sql.unsafe("GRANT pg_read_all_settings TO " + APP_ROLE);
    await sql.unsafe("CREATE DATABASE " + DATABASE + " OWNER " + APP_ROLE + " ENCODING 'UTF8' TEMPLATE template0");
  }, SUPER_ROLE);
  return p;
}
async function createMarker(sql, profileId, restoredFrom = null) {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS probant_local;
    CREATE TABLE IF NOT EXISTS probant_local.profile (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), profile_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind = 'personal'), created_at timestamptz NOT NULL DEFAULT now(), restored_from text);
    CREATE TABLE IF NOT EXISTS probant_local.login_codes (code_sha256 text PRIMARY KEY CHECK (code_sha256 ~ '^[a-f0-9]{64}$'), subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, used_at timestamptz);`);
  // Requête paramétrée : `restored_from` vaut NULL pour un profil créé, jamais la chaîne « null ».
  await sql.unsafe("INSERT INTO probant_local.profile (profile_id, kind, restored_from) VALUES ($1, 'personal', $2) "
    + "ON CONFLICT (singleton) DO UPDATE SET profile_id = EXCLUDED.profile_id, restored_from = EXCLUDED.restored_from", [profileId, restoredFrom ?? null]);
}
function newSecrets() {
  return { appPassword: randomBytes(24).toString("base64url"), superPassword: randomBytes(24).toString("base64url"), sessionSecret: randomBytes(48).toString("base64url") };
}

async function init(options) {
  const home = homeFrom(options);
  if (existsSync(join(home, CONFIG_FILE))) throw new LocalError("Un profil existe déjà dans " + home + ".", "npm run local:start pour le démarrer ; un nouveau profil se crée dans un autre dossier (--home).");
  if (nonEmptyDir(home)) throw new LocalError("Le dossier " + home + " n'est pas vide.", "Choisissez un dossier vide avec --home.");
  const name = typeof options.nom === "string" ? options.nom.trim() : "";
  if (!name) throw new LocalError("Nom requis pour la relecture personnelle nommée.", "npm run local:init -- --nom \"Prénom Nom\"");
  const bin = findPgBin(options["pg-bin"]), version = pgMajor(bin);
  if (version.major !== PG_MAJOR) throw new LocalError("PostgreSQL " + version.major + " trouvé ; le profil exige la version " + PG_MAJOR + " (celle de la CI).");
  const config = {
    formatVersion: 1, profileId: randomUUID(), organizationId: randomUUID(), owner: { name },
    review: options.relecture === "distincte" ? "distinct_identity" : "personal", simulation: options.simulation === true,
    postgres: { bin, port: Number(options["port-pg"] ?? DEFAULT_PG_PORT), database: DATABASE },
    app: { host: "127.0.0.1", port: Number(options["port-app"] ?? DEFAULT_APP_PORT) }, restoredFrom: null,
  };
  const errors = validateConfig(config);
  if (errors.length) throw new LocalError("Paramètres invalides : " + errors.join(" ; "));
  const secrets = newSecrets();
  privateDirectory(home);
  writeSecrets(join(home, SECRETS_FILE), secrets);
  say("Création du cluster PostgreSQL " + version.text + " dans " + join(home, "pgdata"));
  const p = await createCluster(home, config, secrets);
  try {
    await withSql(p, async sql => {
      await createMarker(sql, config.profileId);
      runMigrations(p);
      await sql`INSERT INTO organizations (id, name) VALUES (${config.organizationId}, 'Dossiers personnels') ON CONFLICT (id) DO NOTHING`;
    });
  } finally { stopPostgres(p); }
  writeJson(join(home, CONFIG_FILE), config);
  say("Profil créé : " + home);
  say("Étape suivante : npm run local:start" + (options.home ? " -- --home \"" + home + "\"" : ""));
}

async function start(options) {
  const p = loadProfile(homeFrom(options));
  const state = readState(p);
  if (state && alive(state.nextPid)) {
    say("Next tourne déjà (PID " + state.nextPid + ") sur " + appOrigin(p.config) + ".");
    await startPostgres(p);
    const url = await withSql(p, async sql => { await verifyDatabase(p, sql); return issueLogin(p, sql); });
    say("Lien de connexion (usage unique, 10 min) : " + url);
    if (!options["sans-navigateur"]) openBrowser(url);
    return;
  }
  const startedPg = await startPostgres(p);
  let next = null;
  try {
    await withSql(p, async sql => {
      const profile = await verifyDatabase(p, sql);
      if (profile.restored_from) say("Profil restauré depuis " + profile.restored_from + ".");
      const applied = await migrateWithBackup(p, sql);
      if (applied.length) say(applied.length + " migration(s) appliquée(s) : " + applied.join(", "));
    });
    const mode = options.dev ? "dev" : "start";
    if (mode === "start") {
      const build = options.build ? { current: false, reason: "--build demandé" } : buildIsCurrent();
      say("Build : " + build.reason + ".");
      if (!build.current) buildNext();
    }
    if (!(await portFree(p.config.app.port))) throw new LocalError("Le port " + p.config.app.port + " est déjà utilisé.", "Fermez l'autre serveur, ou changez app.port dans " + join(p.home, CONFIG_FILE) + ".");
    next = startNext(p, mode);
    writeJson(stateFile(p), { nextPid: next.pid, mode, startedAt: new Date().toISOString(), origin: appOrigin(p.config) });
    say("Next démarré (PID " + next.pid + ", journal " + next.logFile + ") ; attente de " + appOrigin(p.config) + "…");
    if (!(await waitHttp(p.config.app.port, mode === "dev" ? 180_000 : 90_000))) {
      throw new LocalError("Next ne répond pas.", "Journal (" + next.logFile + ") :\n" + logTail(next.logFile));
    }
    const url = await withSql(p, sql => issueLogin(p, sql));
    say("Prêt. Lien de connexion (usage unique, 10 min) : " + url);
    say("Arrêt : npm run local:stop · nouveau lien : npm run local:login · sauvegarde : npm run local:backup");
    if (!options["sans-navigateur"]) openBrowser(url);
  } catch (error) {
    // Échec du démarrage : rien ne reste à moitié lancé.
    if (next?.pid && alive(next.pid)) killTree(next.pid);
    rmSync(stateFile(p), { force: true });
    if (startedPg) stopPostgres(p);
    throw error;
  }
}

async function stop(options) {
  const p = loadProfile(homeFrom(options));
  const state = readState(p);
  if (state?.nextPid && alive(state.nextPid)) {
    killTree(state.nextPid);
    for (let i = 0; i < 20 && alive(state.nextPid); i++) await sleep(250);
    say(alive(state.nextPid) ? "Next (PID " + state.nextPid + ") ne s'est pas arrêté." : "Next arrêté (PID " + state.nextPid + ").");
  } else say("Next n'était pas démarré par ce profil.");
  rmSync(stateFile(p), { force: true });
  if (!options["garder-postgres"]) stopPostgres(p);
}

async function status(options) {
  const p = loadProfile(homeFrom(options));
  const state = readState(p), running = pgRunning(p);
  say("Profil " + p.config.profileId + " · " + p.home);
  say("Identité : " + p.config.owner.name + " · relecture " + (p.config.review === "personal" ? "personnelle nommée" : "par une autre identité") + (p.config.simulation ? " · simulation de seconde identité ouverte" : ""));
  say("PostgreSQL : " + (running ? "démarré" : "arrêté") + " (127.0.0.1:" + p.config.postgres.port + ", " + p.config.postgres.bin + ")");
  say("Next : " + (state && alive(state.nextPid) ? "démarré, PID " + state.nextPid + " (" + state.mode + ") sur " + state.origin : "arrêté"));
  if (running) await withSql(p, async sql => {
    await verifyDatabase(p, sql);
    const pending = await pendingMigrations(sql);
    say("Migrations : " + (pending.length ? pending.length + " en attente (" + pending.join(", ") + ")" : "à jour"));
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM dossiers`;
    say("Dossiers : " + n);
  });
  const backups = join(p.home, "sauvegardes");
  const last = existsSync(backups) ? readdirSync(backups).filter(d => existsSync(join(backups, d, "manifeste.json"))).sort().at(-1) : null;
  say("Dernière sauvegarde : " + (last ? join(backups, last) : "aucune"));
}

async function login(options) {
  const p = loadProfile(homeFrom(options));
  if (!pgRunning(p)) throw new LocalError("PostgreSQL est arrêté.", "npm run local:start");
  const subject = options.simulation ? SIMULATION_SUBJECT : OWNER_SUBJECT;
  if (subject === SIMULATION_SUBJECT && !p.config.simulation) throw new LocalError("La seconde identité de simulation n'est pas ouverte dans ce profil.", "Mettez \"simulation\": true dans " + join(p.home, CONFIG_FILE) + " puis redémarrez.");
  const url = await withSql(p, async sql => { await verifyDatabase(p, sql); return issueLogin(p, sql, subject, typeof options.vers === "string" ? options.vers : "/local"); });
  say((subject === SIMULATION_SUBJECT ? "Lien de la seconde identité (SIMULATION)" : "Lien de connexion") + " (usage unique, 10 min) : " + url);
  if (!options["sans-navigateur"] && !options.simulation) openBrowser(url);
}

// Sauvegarde : une seule image cohérente. La transaction exporte son instantané
// (pg_export_snapshot) ; pg_dump lit ce même instantané, et le manifeste de
// contenu est calculé dans la même transaction.
async function contentManifest(sql) {
  await sql`SET LOCAL TimeZone = 'UTC'`; await sql`SET LOCAL DateStyle = 'ISO, YMD'`; await sql`SET LOCAL IntervalStyle = 'postgres'`;
  await sql`SET LOCAL extra_float_digits = 1`; await sql`SET LOCAL bytea_output = 'hex'`;
  const tables = await sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const out = {};
  for (const { name } of tables) {
    const ident = '"' + name.replaceAll('"', '""') + '"';
    const [row] = await sql.unsafe(`SELECT count(*)::bigint::text AS rows, encode(sha256(convert_to(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), ''), 'UTF8')), 'hex') AS digest FROM public.${ident} t`);
    out[name] = { rows: Number(row.rows), digest: row.digest };
  }
  return out;
}
async function pieceInventory(sql, home) {
  const [{ present }] = await sql`SELECT to_regclass('public.source_documents') IS NOT NULL AS present`;
  if (!present) return [];
  // Toute pièce locale citée par la base est inventoriée avec sa notice (taille, type, empreinte, rattachement).
  // Seule une intention d'envoi jamais reçue (pending_upload, fichier absent) n'a pas d'octets à conserver.
  const rows = await sql`SELECT storage_key AS key, sha256, status::text AS status FROM source_documents WHERE storage_provider = 'local' ORDER BY storage_key`;
  return rows.flatMap(r => {
    const file = pieceFile(join(home, "pieces"), r.key);
    if (!file) throw new LocalError("Clé de pièce invalide ou hors du dossier des pièces : " + r.key);
    if (!existsSync(file) && r.status === "pending_upload") return [];
    const notice = existsSync(file + ".notice.json") ? JSON.parse(readFileSync(file + ".notice.json", "utf8")) : null;
    return [{ key: r.key, sha256: existsSync(file) ? sha256(readFileSync(file)) : null, notice: !!notice, noticeSha256: notice?.sha256 ?? null, recorded: r.sha256 ?? null }];
  });
}
async function backup(p, options = {}) {
  const startedPg = await startPostgres(p);
  const name = timestamp() + (options.label ? "-" + String(options.label).replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) : "");
  const dir = join(p.home, "sauvegardes", name);
  if (existsSync(dir)) throw new LocalError("La sauvegarde " + dir + " existe déjà.");
  mkdirSync(dir, { recursive: true });
  try {
    const manifest = await withSql(p, async sql => {
      await verifyDatabase(p, sql);
      return sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
        const [{ snapshot }] = await tx`SELECT pg_export_snapshot() AS snapshot`;
        const [{ version }] = await tx`SELECT current_setting('server_version') AS version`;
        const migrations = (await tx`SELECT name FROM _probant_migrations ORDER BY name`).map(r => r.name);
        const content = await contentManifest(tx);
        const pieces = await pieceInventory(tx, p.home);
        const dump = run(pgTool(p.config.postgres.bin, "pg_dump"), ["-h", "127.0.0.1", "-p", String(p.config.postgres.port), "-U", APP_ROLE, "-d", p.config.postgres.database,
          "-Fc", "--snapshot=" + snapshot, "--no-password", "-f", join(dir, "base.dump")], { env: pgEnv(p.secrets.appPassword) });
        if (dump.status !== 0) throw new LocalError("pg_dump a échoué.", "Aucune sauvegarde n'est valide dans " + dir + ".");
        for (const piece of pieces) {
          if (!piece.sha256) throw new LocalError("Pièce référencée absente du disque : " + piece.key, "La base cite une pièce qui n'est plus dans " + join(p.home, "pieces") + ".");
          // Une pièce modifiée sur disque n'est jamais certifiée : son empreinte doit être celle que la base et sa notice ont enregistrée.
          if ((piece.recorded && piece.recorded !== piece.sha256) || (piece.noticeSha256 && piece.noticeSha256 !== piece.sha256)) {
            throw new LocalError("Pièce modifiée sur disque depuis son enregistrement : " + piece.key, "Empreinte enregistrée " + (piece.recorded ?? piece.noticeSha256) + ", lue " + piece.sha256 + ". Aucune sauvegarde n'est produite ; restaurez la pièce d'origine.");
          }
          const from = pieceFile(join(p.home, "pieces"), piece.key), target = pieceFile(join(dir, "pieces"), piece.key);
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(from, target);
          if (piece.notice) copyFileSync(from + ".notice.json", target + ".notice.json");
          if (sha256(readFileSync(target)) !== piece.sha256) throw new LocalError("Copie de pièce altérée : " + piece.key);
        }
        return { serverVersion: version, migrations, content, pieces };
      });
    });
    const list = run(pgTool(p.config.postgres.bin, "pg_restore"), ["--list", join(dir, "base.dump")], { quiet: true });
    if (list.status !== 0) throw new LocalError("Le fichier de sauvegarde est illisible par pg_restore.");
    const dumpBytes = readFileSync(join(dir, "base.dump"));
    writeJson(join(dir, "manifeste.json"), {
      format: "probant-local-backup-1", createdAt: new Date().toISOString(), label: options.label ?? null,
      profileId: p.config.profileId, organizationId: p.config.organizationId, owner: p.config.owner, review: p.config.review,
      postgres: { serverVersion: manifest.serverVersion, major: PG_MAJOR }, migrations: manifest.migrations,
      dump: { file: "base.dump", bytes: dumpBytes.length, sha256: sha256(dumpBytes) },
      tables: manifest.content, pieces: manifest.pieces.map(({ key, sha256: digest }) => ({ key, sha256: digest })),
    });
    say("Sauvegarde cohérente : " + dir + " (" + Object.keys(manifest.content).length + " tables, " + manifest.pieces.length + " pièce(s) sur disque, dump " + dumpBytes.length + " octets).");
    return dir;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  } finally {
    if (startedPg) stopPostgres(p);
  }
}

async function restore(options, positional) {
  const source = positional[0] ? resolve(positional[0]) : null;
  if (!source || !existsSync(join(source, "manifeste.json"))) throw new LocalError("Sauvegarde introuvable : indiquez son dossier (celui qui contient manifeste.json).", "npm run local:restore -- <dossier de sauvegarde> --vers <nouveau dossier>");
  if (typeof options.vers !== "string") throw new LocalError("Dossier cible requis (--vers).", "La restauration ne remplace jamais le profil courant : elle crée un profil distinct.");
  const target = resolve(options.vers), currentHome = homeFrom(options);
  const issues = restoreTargetIssues(currentHome, target, nonEmptyDir(target));
  if (issues.length) throw new LocalError("Restauration refusée : " + issues.join(" ; ") + ".");
  const manifest = readJson(join(source, "manifeste.json"));
  if (manifest.format !== "probant-local-backup-1") throw new LocalError("Format de sauvegarde inconnu : " + manifest.format);
  const dumpFile = join(source, manifest.dump.file);
  if (!existsSync(dumpFile) || sha256(readFileSync(dumpFile)) !== manifest.dump.sha256) throw new LocalError("Le fichier base.dump ne correspond pas au manifeste (altéré ou incomplet).");
  if (!Array.isArray(manifest.pieces)) throw new LocalError("Manifeste de sauvegarde invalide : liste des pièces absente.");
  for (const piece of manifest.pieces) {
    // Le manifeste n'est pas signé : chaque clé est confinée aux dossiers source et cible avant toute lecture ou copie.
    const file = pieceFile(join(source, "pieces"), piece?.key);
    if (!file || !pieceFile(join(target, "pieces"), piece.key)) throw new LocalError("Clé de pièce invalide dans le manifeste : " + String(piece?.key));
    if (!existsSync(file) || sha256(readFileSync(file)) !== piece.sha256) throw new LocalError("Pièce de la sauvegarde absente ou altérée : " + piece.key);
  }
  let current = null;
  try { current = loadProfile(currentHome).config; } catch { /* pas de profil courant : binaires détectés */ }
  const bin = findPgBin(options["pg-bin"] ?? current?.postgres.bin);
  const config = {
    formatVersion: 1, profileId: randomUUID(), organizationId: manifest.organizationId, owner: manifest.owner, review: manifest.review ?? "personal", simulation: false,
    postgres: { bin, port: Number(options["port-pg"] ?? (current ? current.postgres.port + 10 : DEFAULT_PG_PORT + 10)), database: DATABASE },
    app: { host: "127.0.0.1", port: Number(options["port-app"] ?? (current ? current.app.port + 10 : DEFAULT_APP_PORT + 10)) },
    restoredFrom: manifest.profileId + " @ " + source,
  };
  const errors = validateConfig(config);
  if (errors.length) throw new LocalError("Paramètres de restauration invalides : " + errors.join(" ; "));
  const secrets = newSecrets();
  privateDirectory(target);
  writeSecrets(join(target, SECRETS_FILE), secrets);
  say("Restauration de " + source + " vers " + target + " (nouveau profil " + config.profileId + ", PostgreSQL " + config.postgres.port + ", Next " + config.app.port + ").");
  const p = await createCluster(target, config, secrets);
  let differences = [];
  try {
    const restored = run(pgTool(bin, "pg_restore"), ["-h", "127.0.0.1", "-p", String(config.postgres.port), "-U", APP_ROLE, "-d", DATABASE, "--no-owner", "--no-acl", "--exit-on-error", "--no-password", dumpFile], { env: pgEnv(secrets.appPassword) });
    if (restored.status !== 0) throw new LocalError("pg_restore a échoué ; le dossier cible est à supprimer avant un nouvel essai.");
    for (const piece of manifest.pieces) {
      const from = pieceFile(join(source, "pieces"), piece.key), to = pieceFile(join(target, "pieces"), piece.key);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      if (existsSync(from + ".notice.json")) copyFileSync(from + ".notice.json", to + ".notice.json");
    }
    const actual = await withSql(p, async sql => {
      await sql`UPDATE probant_local.profile SET profile_id = ${config.profileId}, restored_from = ${config.restoredFrom}`;
      await sql`DELETE FROM probant_local.login_codes`;
      return sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => ({ tables: await contentManifest(tx), pieces: (await pieceInventory(tx, target)).map(({ key, sha256: digest }) => ({ key, sha256: digest })) }));
    });
    differences = compareManifests({ tables: manifest.tables, pieces: manifest.pieces }, actual);
  } finally { stopPostgres(p); }
  writeJson(join(target, CONFIG_FILE), config);
  writeJson(join(target, "restauration.json"), { at: new Date().toISOString(), source, sourceProfileId: manifest.profileId, profileId: config.profileId, tables: Object.keys(manifest.tables).length, pieces: manifest.pieces.length, differences });
  if (differences.length) throw new LocalError("Restauration incomplète : " + differences.join(" ; "), "Le profil restauré est conservé pour examen dans " + target + ".");
  say("Restauration vérifiée : " + Object.keys(manifest.tables).length + " tables et " + manifest.pieces.length + " pièce(s) identiques à la sauvegarde.");
  say("Démarrer le profil restauré : npm run local:start -- --home \"" + target + "\"");
}

async function migrate(options) {
  const p = loadProfile(homeFrom(options));
  const startedPg = await startPostgres(p);
  try {
    await withSql(p, async sql => {
      await verifyDatabase(p, sql);
      const applied = await migrateWithBackup(p, sql);
      say(applied.length ? applied.length + " migration(s) appliquée(s)." : "Aucune migration en attente.");
    });
  } finally { if (startedPg) stopPostgres(p); }
}

const HELP = `Profil personnel local de PROBANT (mission C07)
  local:init -- --nom "Prénom Nom" [--pg-bin <dossier>] [--port-pg 54329] [--port-app 3210] [--relecture personnelle|distincte] [--simulation] [--home <dossier>]
  local:start [-- --dev] [--build] [--sans-navigateur]      local:stop [-- --garder-postgres]
  local:status    local:login [-- --simulation]    local:backup [-- --label texte]    local:migrate
  local:restore -- <dossier de sauvegarde> --vers <nouveau dossier> [--port-pg N] [--port-app N]
Voir docs/local/RUNTIME_PERSONNEL.md.`;

const { command, options, positional } = parseArgs(process.argv.slice(2));
const commands = {
  init: () => init(options), start: () => start(options), stop: () => stop(options), status: () => status(options), login: () => login(options),
  backup: async () => { await backup(loadProfile(homeFrom(options)), { label: options.label }); }, restore: () => restore(options, positional), migrate: () => migrate(options),
};
try {
  if (!commands[command]) { process.stdout.write(HELP + "\n"); process.exitCode = command === "aide" ? 0 : 1; }
  else await commands[command]();
} catch (error) {
  if (error instanceof LocalError) {
    process.stderr.write("[probant-local] ERREUR : " + error.message + "\n" + (error.hint ? "  → " + error.hint.replaceAll("\n", "\n    ") + "\n" : ""));
  } else {
    process.stderr.write("[probant-local] ERREUR inattendue : " + (error?.stack ?? String(error)) + "\n");
  }
  process.exitCode = 1;
}
