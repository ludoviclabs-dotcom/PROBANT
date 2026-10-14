import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { AuthenticatedPrincipal } from "@/lib/auth/principal";
import type { ProbantDatabase } from "@/lib/db/client";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { DURABLE_CHAIN_FLAGS, durableChainEnabled, executionProfile, type RuntimeEnv } from "./profile";

/**
 * Dossiers du profil personnel local (C07).
 *
 * Les chaînes durables exigent une ligne `dossiers` de l'organisation locale
 * (clé étrangère de chaque table de cycle). Ce module crée cette ligne, rien
 * d'autre : ni feuille, ni source, ni copie d'un exercice de démonstration.
 * La référence externe est dérivée du contenu, si bien qu'un double envoi
 * retrouve le même dossier au lieu d'en créer deux.
 */
export const localDossierInput = z.object({
  legalName: z.string().trim().min(1).max(160),
  siren: z.string().regex(/^\d{9}$/).optional(),
  financialYear: z.string().trim().min(1).max(40),
}).strict();
export type LocalDossierInput = z.infer<typeof localDossierInput>;

export interface LocalDossier { id: string; externalRef: string; legalName: string | null; siren: string | null; financialYear: string | null; status: string; createdAt: string }

/** Les routes locales n'existent que dans le profil personnel, pour une session locale. */
export function assertLocalSession(principal: AuthenticatedPrincipal, env: RuntimeEnv = process.env): void {
  if (executionProfile(env) !== "personal_local" || principal.authenticationMethod !== "local-session") {
    throw new ApiError("LOCAL_PROFILE_DISABLED", "Réservé au profil personnel local.", 404);
  }
}

export function localExternalRef(input: LocalDossierInput): string {
  return "local-" + stableSha256({ legalName: input.legalName.normalize("NFC").toLowerCase(), siren: input.siren ?? null, financialYear: input.financialYear.normalize("NFC").toLowerCase() }).slice(0, 20);
}

type Row = { id: string; external_ref: string; legal_name: string | null; siren: string | null; financial_year: string | null; status: string; created_at: string | Date };
const toDossier = (r: Row): LocalDossier => ({ id: r.id, externalRef: r.external_ref, legalName: r.legal_name, siren: r.siren, financialYear: r.financial_year, status: r.status, createdAt: new Date(r.created_at).toISOString() });

export async function listLocalDossiers(db: ProbantDatabase, organizationId: string): Promise<LocalDossier[]> {
  const rows = await db.execute<Row>(sql`SELECT id::text, external_ref, legal_name, siren, financial_year, status::text, created_at FROM dossiers WHERE organization_id = ${organizationId} ORDER BY created_at DESC, id LIMIT 200`);
  return [...rows].map(toDossier);
}

export async function createLocalDossier(db: ProbantDatabase, organizationId: string, input: LocalDossierInput): Promise<{ dossier: LocalDossier; created: boolean }> {
  const externalRef = localExternalRef(input);
  return db.transaction(async tx => {
    const [org] = [...await tx.execute<{ id: string }>(sql`SELECT id::text FROM organizations WHERE id = ${organizationId}`)];
    if (!org) throw new ApiError("LOCAL_ORGANIZATION_MISSING", "Organisation locale absente : relancez npm run local:init.", 503);
    const inserted = [...await tx.execute<Row>(sql`
      INSERT INTO dossiers (id, organization_id, external_ref, legal_name, siren, financial_year)
      VALUES (gen_random_uuid(), ${organizationId}, ${externalRef}, ${input.legalName}, ${input.siren ?? null}, ${input.financialYear})
      ON CONFLICT (organization_id, external_ref) DO NOTHING
      RETURNING id::text, external_ref, legal_name, siren, financial_year, status::text, created_at`)];
    if (inserted[0]) return { dossier: toDossier(inserted[0]), created: true };
    const [existing] = [...await tx.execute<Row>(sql`SELECT id::text, external_ref, legal_name, siren, financial_year, status::text, created_at FROM dossiers WHERE organization_id = ${organizationId} AND external_ref = ${externalRef}`)];
    return { dossier: toDossier(existing!), created: false };
  });
}

export interface LocalRuntimeStatus {
  executionProfile: "personal_local";
  profileId: string | null;
  restoredFrom: string | null;
  database: { name: string; serverVersion: string; migrationsApplied: number; lastMigration: string | null };
  chains: { flag: string; enabled: boolean }[];
}

/** État lisible du runtime local ; aucune donnée de dossier, aucun secret. */
export async function localRuntimeStatus(db: ProbantDatabase, env: RuntimeEnv = process.env): Promise<LocalRuntimeStatus> {
  const [base] = [...await db.execute<{ name: string; version: string; marker: boolean; ledger: boolean }>(sql`
    SELECT current_database() AS name, current_setting('server_version') AS version,
      to_regclass('probant_local.profile') IS NOT NULL AS marker, to_regclass('public._probant_migrations') IS NOT NULL AS ledger`)];
  const [profile] = base?.marker ? [...await db.execute<{ profile_id: string; restored_from: string | null }>(sql`SELECT profile_id::text, restored_from FROM probant_local.profile LIMIT 1`)] : [];
  const [ledger] = base?.ledger ? [...await db.execute<{ applied: number; last: string | null }>(sql`SELECT count(*)::int AS applied, max(name) AS last FROM _probant_migrations`)] : [];
  return {
    executionProfile: "personal_local",
    profileId: profile?.profile_id ?? null,
    restoredFrom: profile?.restored_from ?? null,
    database: { name: base?.name ?? "", serverVersion: base?.version ?? "", migrationsApplied: ledger?.applied ?? 0, lastMigration: ledger?.last ?? null },
    chains: DURABLE_CHAIN_FLAGS.map(flag => ({ flag, enabled: durableChainEnabled(env, flag) })),
  };
}
