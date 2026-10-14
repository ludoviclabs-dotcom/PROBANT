import type { Sql } from "postgres";

/**
 * C07 — une recette jetable n'écrit jamais dans la base d'un profil personnel
 * local, quel que soit son nom : le lanceur y pose `probant_local.profile`.
 */
export async function assertDisposableDatabase(client: Sql): Promise<void> {
  const [row] = await client`SELECT to_regclass('probant_local.profile') IS NOT NULL AS personal`;
  if (row?.personal) throw new Error("Personal local profile database: disposable recipes refused");
}
