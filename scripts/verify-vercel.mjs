#!/usr/bin/env node
/**
 * Vérification de la configuration Vercel — PR-08.
 *
 * Règle absolue de ce script : **il ne devine rien**.
 *
 * En particulier, il n'infère jamais une région de données depuis un en-tête
 * `x-vercel-id`. Cet en-tête nomme le point de présence qui a servi la
 * requête, pas la région où s'exécute la Function, encore moins celle où
 * résident PostgreSQL ou le stockage objet. Tout contrôle qui ne peut pas être
 * prouvé par une source d'autorité sort en `NOT_VERIFIED`.
 *
 * Sources d'autorité acceptées, par ordre de préférence :
 *   1. l'API Vercel (`VERCEL_API_TOKEN`) pour le projet et ses variables ;
 *   2. les variables d'environnement du déploiement lui-même ;
 *   3. la configuration du dépôt (`vercel.json` / `vercel.ts`).
 *
 * Usage :
 *   node scripts/verify-vercel.mjs                 # rapport texte
 *   node scripts/verify-vercel.mjs --json          # rapport machine
 *   node scripts/verify-vercel.mjs --strict        # code de sortie 1 si un FAIL
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const STATUS = {
  pass: "PASS",
  limited: "PASS_WITH_LIMITATIONS",
  fail: "FAIL",
  notVerified: "NOT_VERIFIED",
};

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const strict = args.has("--strict");

const checks = [];

function record(id, status, evidence, note) {
  checks.push({ id, status, evidence, note });
}

const API = "https://api.vercel.com";
const token = process.env.VERCEL_API_TOKEN?.trim();
const projectId = process.env.VERCEL_PROJECT_ID?.trim();
const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";

async function api(pathname) {
  if (!token || !projectId) return null;
  try {
    const response = await fetch(`${API}${pathname}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 1. Régions                                                          */
/* ------------------------------------------------------------------ */

const project = await api(`/v9/projects/${projectId}${teamQuery}`);

if (project) {
  const regions = project.serverlessFunctionRegion
    ? [project.serverlessFunctionRegion]
    : [];
  record(
    "vercel.function_regions",
    regions.length > 0 ? STATUS.pass : STATUS.notVerified,
    regions.length > 0
      ? `API Vercel : serverlessFunctionRegion = ${regions.join(", ")}`
      : "API Vercel jointe mais aucune région de Function déclarée sur le projet",
    regions.length > 0
      ? undefined
      : "Sans région explicite, Vercel choisit la région par défaut de l'équipe : à fixer avant la mise en production.",
  );
} else {
  record(
    "vercel.function_regions",
    STATUS.notVerified,
    "API Vercel non interrogée (VERCEL_API_TOKEN et/ou VERCEL_PROJECT_ID absents)",
    "Ne jamais déduire la région d'exécution d'un en-tête x-vercel-id : il désigne le PoP, pas la Function.",
  );
}

/* ------------------------------------------------------------------ */
/* 2. Région PostgreSQL et stockage objet                              */
/* ------------------------------------------------------------------ */

/**
 * La région d'une base ne se lit pas dans une URL de connexion de façon
 * fiable : selon le fournisseur, le nom d'hôte peut la contenir, la masquer,
 * ou pointer vers un routeur global. On ne renvoie donc PASS que si une
 * variable la déclare explicitement.
 */
const declaredDatabaseRegion = process.env.DATABASE_REGION?.trim();
record(
  "vercel.postgres_region",
  declaredDatabaseRegion ? STATUS.pass : STATUS.notVerified,
  declaredDatabaseRegion
    ? `DATABASE_REGION = ${declaredDatabaseRegion}`
    : "Aucune variable DATABASE_REGION déclarée",
  declaredDatabaseRegion
    ? undefined
    : "La région ne doit pas être déduite du nom d'hôte de DATABASE_URL : plusieurs fournisseurs exposent un routeur global.",
);

const bucketRegion = process.env.AWS_REGION?.trim();
const bucket = process.env.S3_PRIVATE_BUCKET?.trim();
record(
  "vercel.object_storage_region",
  bucketRegion && bucket ? STATUS.pass : STATUS.notVerified,
  bucketRegion && bucket
    ? `AWS_REGION = ${bucketRegion} · bucket configuré`
    : "AWS_REGION et/ou S3_PRIVATE_BUCKET absents",
  bucketRegion && bucket
    ? "Région déclarée par la configuration du workload ; la localisation effective du bucket doit être confirmée côté AWS."
    : undefined,
);

/* ------------------------------------------------------------------ */
/* 3. Proximité                                                        */
/* ------------------------------------------------------------------ */

const functionRegion = project?.serverlessFunctionRegion;
if (functionRegion && declaredDatabaseRegion && bucketRegion) {
  const aligned =
    normalizeRegion(functionRegion) === normalizeRegion(declaredDatabaseRegion) &&
    normalizeRegion(functionRegion) === normalizeRegion(bucketRegion);
  record(
    "vercel.region_proximity",
    aligned ? STATUS.pass : STATUS.fail,
    `function=${functionRegion} · postgres=${declaredDatabaseRegion} · objets=${bucketRegion}`,
    aligned
      ? undefined
      : "Régions divergentes : chaque requête de données traverse une liaison inter-régions.",
  );
} else {
  record(
    "vercel.region_proximity",
    STATUS.notVerified,
    "Au moins une des trois régions n'est pas prouvée",
    "La proximité ne peut pas être évaluée tant qu'une région reste NOT_VERIFIED.",
  );
}

/* ------------------------------------------------------------------ */
/* 4. Variables Preview / Production                                   */
/* ------------------------------------------------------------------ */

const REQUIRED_PRODUCTION_KEYS = [
  "DATABASE_URL",
  "DATABASE_POOL_SIZE",
  "AWS_REGION",
  "AWS_ROLE_ARN",
  "S3_PRIVATE_BUCKET",
  "INGESTION_QUEUE_URL",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
  "AUTH_SESSION_SECRET",
  "AUTH_APP_ORIGIN",
  "MAX_UPLOAD_BYTES",
  "MAX_FEC_LINES",
  "MAX_LINE_BYTES",
  "MAX_FIELD_BYTES",
  "MAX_PARSE_DURATION_MS",
  "MAX_CONCURRENT_JOBS_PER_ORG",
  "UPLOAD_RATE_LIMIT_PER_MINUTE",
  "UPLOAD_QUOTA_FILES_PER_DAY",
  "UPLOAD_QUOTA_BYTES_PER_DAY",
];

const envs = await api(`/v9/projects/${projectId}/env${teamQuery}`);
if (envs?.envs) {
  const byTarget = (target) =>
    new Set(
      envs.envs
        .filter((entry) => (entry.target ?? []).includes(target))
        .map((entry) => entry.key),
    );
  const production = byTarget("production");
  const preview = byTarget("preview");
  const missingProduction = REQUIRED_PRODUCTION_KEYS.filter((key) => !production.has(key));
  record(
    "vercel.production_env",
    missingProduction.length === 0 ? STATUS.pass : STATUS.fail,
    missingProduction.length === 0
      ? `${production.size} variables déclarées en Production`
      : `Manquantes en Production : ${missingProduction.join(", ")}`,
  );

  /**
   * Une Preview qui partage les secrets de Production est un défaut de
   * cloisonnement : n'importe quelle branche ouverte y accéderait.
   */
  const sharedSecrets = ["AUTH_SESSION_SECRET", "OIDC_CLIENT_SECRET", "DATABASE_URL"].filter(
    (key) => {
      const entries = envs.envs.filter((entry) => entry.key === key);
      return entries.some(
        (entry) =>
          (entry.target ?? []).includes("production") &&
          (entry.target ?? []).includes("preview"),
      );
    },
  );
  record(
    "vercel.preview_env_isolation",
    sharedSecrets.length === 0 ? STATUS.pass : STATUS.fail,
    sharedSecrets.length === 0
      ? `${preview.size} variables Preview, aucun secret partagé avec Production`
      : `Secrets partagés Preview/Production : ${sharedSecrets.join(", ")}`,
  );
} else {
  record(
    "vercel.production_env",
    STATUS.notVerified,
    "API Vercel non interrogée : variables d'environnement non listables",
  );
  record(
    "vercel.preview_env_isolation",
    STATUS.notVerified,
    "API Vercel non interrogée : cloisonnement Preview/Production non vérifiable",
  );
}

/* ------------------------------------------------------------------ */
/* 5. Cache privé et limites de Functions — vérifiables dans le dépôt  */
/* ------------------------------------------------------------------ */

const repoRoot = process.cwd();

async function readIfExists(relative) {
  try {
    return await readFile(path.join(repoRoot, relative), "utf8");
  } catch {
    return null;
  }
}

const routeFiles = [
  "app/api/dossiers/[dossierId]/snapshot/route.ts",
  "app/api/dossiers/[dossierId]/ledger/route.ts",
  "app/api/dossiers/[dossierId]/review-events/route.ts",
  "app/api/export/route.ts",
  "app/api/auth/session/route.ts",
];
const cacheFindings = [];
for (const file of routeFiles) {
  const source = await readIfExists(file);
  if (source === null) {
    cacheFindings.push(`${file}: absent`);
    continue;
  }
  if (!/no-store/u.test(source)) cacheFindings.push(`${file}: pas de no-store`);
}
record(
  "vercel.private_cache",
  cacheFindings.length === 0 ? STATUS.pass : STATUS.fail,
  cacheFindings.length === 0
    ? `${routeFiles.length} routes privées répondent en no-store`
    : cacheFindings.join(" · "),
);

const vercelConfig =
  (await readIfExists("vercel.json")) ?? (await readIfExists("vercel.ts"));
record(
  "vercel.function_limits",
  vercelConfig ? STATUS.pass : STATUS.notVerified,
  vercelConfig
    ? "Configuration de projet présente dans le dépôt"
    : "Ni vercel.json ni vercel.ts : durées et mémoire des Functions restent aux valeurs par défaut de la plateforme",
  vercelConfig ? undefined : "Les valeurs par défaut ne sont pas un choix documenté.",
);

/* ------------------------------------------------------------------ */
/* 6. Mode démo / persistant                                           */
/* ------------------------------------------------------------------ */

const persistentKeys = ["DATABASE_URL", "S3_PRIVATE_BUCKET", "INGESTION_QUEUE_URL"];
const persistentConfigured = persistentKeys.every((key) => process.env[key]?.trim());
const authConfigured = ["OIDC_ISSUER", "AUTH_SESSION_SECRET"].every((key) =>
  process.env[key]?.trim(),
);
record(
  "vercel.mode",
  persistentConfigured && !authConfigured ? STATUS.fail : STATUS.pass,
  persistentConfigured
    ? authConfigured
      ? "Mode persistant : base, stockage, file et identité configurés"
      : "Mode persistant configuré SANS identité utilisateur"
    : "Mode démo : aucune infrastructure persistante configurée",
  persistentConfigured && !authConfigured
    ? "Le mode persistant doit échouer fermé sans identité (ADR-007). Configurer OIDC avant d'ouvrir l'accès."
    : undefined,
);

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

function normalizeRegion(value) {
  // `iad1` (Vercel) et `us-east-1` (AWS) désignent la même zone géographique.
  const map = { iad1: "us-east-1", cdg1: "eu-west-3", fra1: "eu-central-1", dub1: "eu-west-1" };
  const lower = String(value).toLowerCase();
  return map[lower] ?? lower;
}

if (asJson) {
  process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`);
} else {
  const width = Math.max(...checks.map((check) => check.id.length));
  for (const check of checks) {
    process.stdout.write(
      `${check.status.padEnd(21)} ${check.id.padEnd(width)}  ${check.evidence}\n`,
    );
    if (check.note) process.stdout.write(`${" ".repeat(22)}↳ ${check.note}\n`);
  }
  const counts = checks.reduce((accumulator, check) => {
    accumulator[check.status] = (accumulator[check.status] ?? 0) + 1;
    return accumulator;
  }, {});
  process.stdout.write(`\n${JSON.stringify(counts)}\n`);
}

if (strict && checks.some((check) => check.status === STATUS.fail)) {
  process.exit(1);
}
