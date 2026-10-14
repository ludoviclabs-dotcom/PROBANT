import "server-only";

import { sql } from "drizzle-orm";
import type { ProbantDatabase } from "@/lib/db/client";
import type { LocalLoginStore } from "./login";

/**
 * Lecture du schéma `probant_local`, créé par le lanceur du profil personnel
 * (`scripts/local/probant-local.mjs`) et jamais par les migrations partagées :
 * une base de recette n'en a pas, une base personnelle en a exactement un.
 */
export class DrizzleLocalLoginStore implements LocalLoginStore {
  constructor(private readonly db: ProbantDatabase) {}

  async profileId(): Promise<string | null> {
    const [marker] = [...await this.db.execute<{ present: boolean }>(sql`SELECT to_regclass('probant_local.profile') IS NOT NULL AS present`)];
    if (!marker?.present) return null;
    const rows = await this.db.execute<{ profile_id: string }>(sql`SELECT profile_id::text AS profile_id FROM probant_local.profile LIMIT 1`);
    return [...rows][0]?.profile_id ?? null;
  }

  async consumeCode(codeSha256: string): Promise<string | null> {
    const rows = await this.db.execute<{ subject: string }>(sql`
      UPDATE probant_local.login_codes SET used_at = now()
      WHERE code_sha256 = ${codeSha256} AND used_at IS NULL AND expires_at > now()
      RETURNING subject`);
    return [...rows][0]?.subject ?? null;
  }
}
