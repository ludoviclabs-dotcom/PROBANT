// Fonctions pures du profil personnel local (C07) : chemins, configuration,
// environnement de Next, garde-fous et comparaison des manifestes de sauvegarde.
// Aucun effet de bord ici : tout ce qui touche au disque ou aux processus vit
// dans probant-local.mjs, ce module est testé seul.
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const CONFIG_FILE = "probant.local.json";
export const SECRETS_FILE = "secrets.local.json";
export const STATE_FILE = join("run", "etat.json");
export const PG_MAJOR = 17;
export const DEFAULT_PG_PORT = 54329;
export const DEFAULT_APP_PORT = 3210;
export const APP_ROLE = "probant_app";
export const SUPER_ROLE = "probant_admin";
export const DATABASE = "probant_personnel";
export const OWNER_SUBJECT = "proprietaire-local";
export const SIMULATION_SUBJECT = "simulation-seconde-identite";

/** Les quatorze drapeaux des chaînes durables (miroir de lib/runtime/profile.ts, vérifié par test). */
export const DURABLE_CHAIN_FLAGS = [
  "PROBANT_CLIENTS_DURABLE", "PROBANT_PAYABLES_DURABLE", "PROBANT_EQUITY_DURABLE", "PROBANT_INVESTMENT_DURABLE",
  "PROBANT_EXCEPTIONAL_DURABLE", "PROBANT_CASH_DURABLE", "PROBANT_FIXED_ASSETS_DURABLE", "PROBANT_CAPITAUX_DURABLE",
  "PROBANT_FISCAL_DURABLE", "PROBANT_STOCKS_DURABLE", "PROBANT_PROVISIONS_DURABLE", "PROBANT_CLOSING_DURABLE", "PROBANT_PAYROLL_DURABLE", "PROBANT_LOANS_DURABLE",
];

/**
 * Variables neutralisées dans l'environnement de Next : rien du profil local ne
 * doit atteindre un stockage, une file, un IdP ou une plateforme distants. Une
 * valeur vide n'est pas remplacée par les fichiers `.env*` de Next.
 */
export const REMOTE_KEYS = [
  "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID",
  "S3_PRIVATE_BUCKET", "AWS_REGION", "AWS_ROLE_ARN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "INGESTION_QUEUE_URL", "OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI",
  "PROBANT_CONTEXT_HMAC_SECRET", "PROBANT_DEMONSTRATION_ENABLED", "PROBANT_DEMONSTRATION_ORIGIN",
  "PROBANT_CLIENTS_TEST_DATABASE_URL", "PROBANT_CLIENTS_TEST_POSTGRES_CONTAINER",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {Record<string, string | undefined>} env @param {string} platform @param {string} homedir @returns {string} */
export function defaultHome(env = process.env, platform = process.platform, homedir = "") {
  if (env.PROBANT_LOCAL_HOME?.trim()) return resolve(env.PROBANT_LOCAL_HOME.trim());
  if (platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "PROBANT", "personnel");
  return join(homedir || env.HOME || ".", ".local", "share", "probant", "personnel");
}

/** @param {Record<string, string | undefined>} env @param {string} platform */
export function defaultPgBinCandidates(env = process.env, platform = process.platform) {
  const exe = platform === "win32" ? ".exe" : "";
  const list = [];
  if (env.PROBANT_PG_BIN?.trim()) list.push(resolve(env.PROBANT_PG_BIN.trim()));
  if (platform === "win32") {
    if (env.LOCALAPPDATA) list.push(join(env.LOCALAPPDATA, "PROBANT", "pgsql-" + PG_MAJOR, "bin"));
    list.push(join(env.ProgramFiles ?? "C:\\Program Files", "PostgreSQL", String(PG_MAJOR), "bin"));
  } else {
    list.push("/usr/lib/postgresql/" + PG_MAJOR + "/bin", "/opt/homebrew/opt/postgresql@" + PG_MAJOR + "/bin", "/usr/local/opt/postgresql@" + PG_MAJOR + "/bin");
  }
  return { exe, list };
}

/** @param {string} name @returns {boolean} */
export function isDisposableDatabaseName(name) {
  return /_(ci|test)$/i.test(name);
}

/** @param {any} config @returns {string[]} */
export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return ["configuration absente"];
  if (config.formatVersion !== 1) errors.push("formatVersion doit valoir 1");
  if (!UUID.test(config.profileId ?? "")) errors.push("profileId invalide");
  if (!UUID.test(config.organizationId ?? "")) errors.push("organizationId invalide");
  const name = config.owner?.name;
  if (typeof name !== "string" || !name.trim() || name.length > 120) errors.push("owner.name requis (120 caractères au plus)");
  if (!["personal", "distinct_identity"].includes(config.review)) errors.push("review doit valoir personal ou distinct_identity");
  if (typeof config.simulation !== "boolean") errors.push("simulation doit être un booléen");
  const pg = config.postgres ?? {};
  if (typeof pg.bin !== "string" || !isAbsolute(pg.bin)) errors.push("postgres.bin doit être un chemin absolu");
  if (!Number.isInteger(pg.port) || pg.port < 1024 || pg.port > 65535) errors.push("postgres.port invalide");
  if (pg.database !== DATABASE) errors.push("postgres.database doit valoir " + DATABASE);
  if (isDisposableDatabaseName(pg.database ?? "")) errors.push("une base *_ci ou *_test est une base de recette jetable");
  const app = config.app ?? {};
  if (app.host !== "127.0.0.1") errors.push("app.host doit valoir 127.0.0.1");
  if (!Number.isInteger(app.port) || app.port < 1024 || app.port > 65535 || app.port === pg.port) errors.push("app.port invalide");
  return errors;
}

/** @param {any} config @param {any} secrets @param {string} [role] @returns {string} */
export function databaseUrl(config, secrets, role = APP_ROLE) {
  const password = role === SUPER_ROLE ? secrets.superPassword : secrets.appPassword;
  return "postgresql://" + role + ":" + encodeURIComponent(password) + "@127.0.0.1:" + config.postgres.port + "/" + (role === SUPER_ROLE ? "postgres" : config.postgres.database);
}

/**
 * URL du serveur local du profil : hôte boucle locale fixe, port entier validé. Aucun autre hôte
 * n'est joignable par le lanceur, quelle que soit la configuration lue sur disque.
 * @param {unknown} port @param {string} path @returns {string}
 */
export function loopbackUrl(port, path) {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("Port local invalide : " + String(port));
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) throw new Error("Chemin local invalide : " + path);
  return "http://127.0.0.1:" + String(value) + path;
}

/** @param {any} config @returns {string} */
export function appOrigin(config) {
  return "http://" + config.app.host + ":" + config.app.port;
}

/** Clés documentées de `.env.example`, neutralisées par une valeur vide quand le profil ne les fixe pas. */
/** @param {string} text @returns {string[]} */
export function envExampleKeys(text) {
  return [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gmu)].map(m => m[1]);
}

/** Environnement complet du serveur Next du profil personnel. */
/**
 * @param {{ config: any, secrets: any, home: string, baseEnv: Record<string, string | undefined>, documentedKeys?: string[] }} input
 * @returns {Record<string, string>}
 */
export function childEnv({ config, secrets, home, baseEnv, documentedKeys = [] }) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (/^(PROBANT_|AUTH_|DATABASE_|OIDC_|AWS_|S3_|BLOB_|VERCEL|INGESTION_|DIRECT_UPLOAD|UPLOAD_|NEXT_)/.test(key)) continue;
    if (value !== undefined) env[key] = value;
  }
  for (const key of [...documentedKeys, ...REMOTE_KEYS]) env[key] = "";
  Object.assign(env, {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: databaseUrl(config, secrets),
    DATABASE_POOL_SIZE: "5",
    AUTH_SESSION_SECRET: secrets.sessionSecret,
    AUTH_APP_ORIGIN: appOrigin(config),
    AUTH_SESSION_IDLE_TTL_SECONDS: "14400",
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: "86400",
    CSP_MODE: baseEnv.CSP_MODE === "enforce" ? "enforce" : "report-only",
    // Ingestion FEC locale : limites documentées de docs/ingestion/INGESTION_LIMITS.md ; quotas = choix interne du profil local.
    DIRECT_UPLOAD_TTL_SECONDS: "900",
    MAX_UPLOAD_BYTES: "134217728",
    MAX_FEC_LINES: "250000",
    MAX_LINE_BYTES: "262144",
    MAX_FIELD_BYTES: "65536",
    MAX_PARSE_DURATION_MS: "300000",
    MAX_CONCURRENT_JOBS_PER_ORG: "2",
    UPLOAD_RATE_LIMIT_PER_MINUTE: "30",
    UPLOAD_QUOTA_FILES_PER_DAY: "500",
    UPLOAD_QUOTA_BYTES_PER_DAY: "2147483648",
    PROBANT_RUNTIME_PROFILE: "personal",
    PROBANT_LOCAL_HOME: home,
    PROBANT_LOCAL_PROFILE_ID: config.profileId,
    PROBANT_LOCAL_ORGANIZATION_ID: config.organizationId,
    PROBANT_LOCAL_OWNER_NAME: config.owner.name,
    PROBANT_LOCAL_REVIEW: config.review,
      PROBANT_LOCAL_HR: "enabled",
    PROBANT_LOCAL_SIMULATION: config.simulation ? "enabled" : "",
  });
  for (const flag of DURABLE_CHAIN_FLAGS) env[flag] = "personal";
  return env;
}

/** Une restauration va dans un dossier distinct : jamais le profil source, ni dedans, ni autour. */
/** @param {string} sourceHome @param {string} targetHome @param {boolean} targetExistsNonEmpty @returns {string[]} */
export function restoreTargetIssues(sourceHome, targetHome, targetExistsNonEmpty) {
  const issues = [];
  const a = resolve(sourceHome), b = resolve(targetHome);
  /** @param {string} parent @param {string} child */
  const inside = (parent, child) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
  if (a.toLowerCase() === b.toLowerCase()) issues.push("la cible est le profil courant");
  else if (inside(a, b)) issues.push("la cible est à l'intérieur du profil courant");
  else if (inside(b, a)) issues.push("la cible contient le profil courant");
  if (targetExistsNonEmpty) issues.push("la cible existe et n'est pas vide");
  return issues;
}

/** @param {Date} [date] @returns {string} */
export function timestamp(date = new Date()) {
  /** @param {number} n */
  const p = n => String(n).padStart(2, "0");
  return date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) + "-" + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
}

/** Différences entre deux manifestes de contenu (tables publiques : nombre de lignes et empreinte). */
/**
 * @typedef {{ tables?: Record<string, { rows: number, digest: string }>, pieces?: { key: string, sha256: string | null }[] }} ContentManifest
 * @param {ContentManifest} expected @param {ContentManifest} actual @returns {string[]}
 */
export function compareManifests(expected, actual) {
  /** @type {string[]} */
  const differences = [];
  const names = new Set([...Object.keys(expected.tables ?? {}), ...Object.keys(actual.tables ?? {})]);
  for (const name of [...names].sort()) {
    const e = expected.tables?.[name], a = actual.tables?.[name];
    if (!e) differences.push(name + " : table inattendue");
    else if (!a) differences.push(name + " : table absente");
    else if (e.rows !== a.rows) differences.push(name + " : " + e.rows + " lignes attendues, " + a.rows + " lues");
    else if (e.digest !== a.digest) differences.push(name + " : empreinte différente");
  }
  const ep = expected.pieces ?? [], ap = actual.pieces ?? [];
  if (JSON.stringify(ep) !== JSON.stringify(ap)) differences.push("pièces locales : inventaire différent");
  return differences;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const [command = "aide", ...rest] = argv;
  /** @type {Record<string, string | true>} */
  const options = {};
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) options[key] = inline;
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith("--")) options[key] = rest[++i];
    else options[key] = true;
  }
  return { command, options, positional };
}

/**
 * Fichier d'une pièce sous `root`, ou `null` si la clé n'a pas la forme écrite par le stockage
 * local (segments [A-Za-z0-9_-] séparés par « / ») ou sortirait du dossier. Une clé lue dans un
 * manifeste de sauvegarde n'est jamais jointe à un chemin sans ce contrôle.
 * @param {string} root @param {unknown} key @returns {string | null}
 */
export function pieceFile(root, key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(key)) return null;
  const file = join(root, ...key.split("/"));
  return withinDirectory(root, file) ? file : null;
}

/** @param {string} root @param {string} candidate @returns {boolean} */
export function withinDirectory(root, candidate) {
  const r = relative(resolve(root), resolve(candidate));
  return r !== "" && !r.startsWith("..") && !isAbsolute(r) && !r.split(sep).includes("..");
}
