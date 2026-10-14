/**
 * Profils d'exécution — mission C07.
 *
 * Trois choix d'exécution, jamais confondus :
 * - `browser_demo` : démo navigateur, aucune chaîne durable ouverte ;
 * - `disposable_recipe` : recette jetable (CI, base `*_ci` / `*_test`), drapeaux
 *   `PROBANT_*_DURABLE=disposable`, refusée sur Vercel production ;
 * - `personal_local` : outil personnel sur le PC, PostgreSQL local dédié,
 *   drapeaux `PROBANT_*_DURABLE=personal`, lancé par `scripts/local/probant-local.mjs`.
 *
 * Le profil est un choix d'exécution du serveur. Il ne dit rien du type de
 * dossier (historique, scénario, local persistant : `CapabilityMode`) ni du type
 * de relecture (`ReviewKind`), qui restent des axes distincts.
 *
 * Module sans dépendance Node : le registre des capacités, importé côté
 * navigateur, l'utilise pour décrire la configuration.
 */
export type ExecutionProfile = "browser_demo" | "disposable_recipe" | "personal_local";
export type RuntimeEnv = Record<string, string | undefined>;

export const EXECUTION_PROFILE_LABELS: Record<ExecutionProfile, string> = {
  browser_demo: "Démo navigateur",
  disposable_recipe: "Recette jetable",
  personal_local: "Profil personnel local",
};

/** Libellé d'exécution des écrans de feuilles ; sans vue serveur, rien n'est affirmé. */
export function executionProfileLabel(profile: ExecutionProfile | undefined): string {
  return profile ? EXECUTION_PROFILE_LABELS[profile].toLowerCase() : "exécution serveur";
}

/** Drapeaux des chaînes durables existantes (un par chaîne, inchangés depuis leurs missions). */
export const DURABLE_CHAIN_FLAGS = [
  "PROBANT_CLIENTS_DURABLE",
  "PROBANT_PAYABLES_DURABLE",
  "PROBANT_EQUITY_DURABLE",
  "PROBANT_INVESTMENT_DURABLE",
  "PROBANT_EXCEPTIONAL_DURABLE",
  "PROBANT_CASH_DURABLE",
  "PROBANT_FIXED_ASSETS_DURABLE",
  "PROBANT_CAPITAUX_DURABLE",
  "PROBANT_FISCAL_DURABLE",
  "PROBANT_STOCKS_DURABLE",
  "PROBANT_PROVISIONS_DURABLE",
  "PROBANT_CLOSING_DURABLE",
] as const;
export type DurableChainFlag = (typeof DURABLE_CHAIN_FLAGS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Une base de recette jetable porte un nom `*_ci` ou `*_test` : jamais une base personnelle. */
export function isDisposableDatabaseName(name: string): boolean {
  return /_(ci|test)$/i.test(name);
}

export function isPersonalProfileRequested(env: RuntimeEnv): boolean {
  return env.PROBANT_RUNTIME_PROFILE === "personal";
}

/**
 * Conditions du profil personnel. Une liste vide signifie « valide ».
 * Le lanceur local vérifie en plus le marqueur de la base (cluster personnel)
 * avant de démarrer Next ; la connexion locale le revérifie côté serveur.
 */
export function personalProfileIssues(env: RuntimeEnv): string[] {
  const issues: string[] = [];
  if (env.VERCEL || env.VERCEL_ENV) issues.push("LOCAL_PROFILE_ON_VERCEL");
  if (!UUID.test(env.PROBANT_LOCAL_PROFILE_ID ?? "")) issues.push("LOCAL_PROFILE_ID_MISSING");
  if (!env.PROBANT_LOCAL_HOME?.trim()) issues.push("LOCAL_HOME_MISSING");
  let url: URL | null = null;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { issues.push("LOCAL_DATABASE_URL_INVALID"); }
  if (url) {
    if (!/^postgres(ql)?:$/.test(url.protocol)) issues.push("LOCAL_DATABASE_URL_INVALID");
    if (!LOOPBACK.has(url.hostname)) issues.push("LOCAL_DATABASE_NOT_LOOPBACK");
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!name || isDisposableDatabaseName(name)) issues.push("LOCAL_DATABASE_IS_DISPOSABLE");
  }
  return issues;
}

export function executionProfile(env: RuntimeEnv): ExecutionProfile {
  if (isPersonalProfileRequested(env)) return "personal_local";
  return DURABLE_CHAIN_FLAGS.some(flag => env[flag] === "disposable") ? "disposable_recipe" : "browser_demo";
}

/**
 * Ouverture d'une chaîne durable.
 * - Profil personnel valide : seul `personal` ouvre la chaîne (pas de mélange avec `disposable`).
 * - Sinon : comportement antérieur inchangé, seul `disposable` hors Vercel production.
 */
export function durableChainEnabled(env: RuntimeEnv, flag: string): boolean {
  if (isPersonalProfileRequested(env)) return env[flag] === "personal" && personalProfileIssues(env).length === 0;
  return env.VERCEL_ENV !== "production" && env[flag] === "disposable";
}

/** Motif lisible d'une chaîne fermée, sans révéler la configuration sensible. */
export function durableChainRefusal(env: RuntimeEnv, flag: string): string | null {
  if (durableChainEnabled(env, flag)) return null;
  if (isPersonalProfileRequested(env)) {
    const issues = personalProfileIssues(env);
    if (issues.length) return "Profil personnel local invalide : " + issues.join(", ") + ".";
    return env[flag] === "disposable" ? "Le profil personnel local refuse une chaîne marquée « disposable »." : "Chaîne non activée dans le profil personnel local.";
  }
  return "Chaîne réservée à la recette jetable ou au profil personnel local.";
}
