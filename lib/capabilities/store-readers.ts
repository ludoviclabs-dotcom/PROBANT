import { sql, type SQL } from "drizzle-orm";
import { STORE_FAMILIES, ENGINE_PROCEDURES, type StoreFamily } from "./registry";
import { assertScope, validateRun, type WorkpaperRun, type WorkpaperScope } from "@/lib/workpapers/model";

export interface CycleSqlReader { execute(query: SQL): PromiseLike<unknown> }
/** Closed table names; read existing heads and versions without renaming or writing to any family. */
export const STORE_READ_ADAPTERS = STORE_FAMILIES.map(family => ({ family,
  heads: sql.raw(family + "_workpaper_heads"), versions: sql.raw(family + "_workpaper_versions") }));
export function scopedFamilyRuns(scope: WorkpaperScope, rows: { family: StoreFamily; run: WorkpaperRun }[]) {
  return rows.map(row => {
    assertScope(scope, row.run.scope); validateRun(row.run);
    const procedure = ENGINE_PROCEDURES.find(p => p.id === row.run.template.id);
    if (!procedure || procedure.family !== row.family) throw new Error("CAPABILITY_STORE_PROCEDURE_MISMATCH");
    return row;
  });
}
/** Current source heads of each family (document type → approved import), read without writing: the observation adapters compare a sheet's frozen sources to them. */
export async function readSourceHeads(db: CycleSqlReader, scope: WorkpaperScope, families: readonly StoreFamily[] = STORE_FAMILIES) {
  if (scope.mode !== "real") throw new Error("CL_REAL_SCOPE_REQUIRED");
  const out: Partial<Record<StoreFamily, { document_type: string; import_id: string }[]>> = {};
  for (const family of families) out[family] = await db.execute(sql`SELECT document_type,import_id FROM ${sql.raw(family + "_source_heads")}
      WHERE organization_id=${scope.organizationId} AND dossier_id=${scope.dossierId} AND period_id=${scope.periodId} ORDER BY document_type`) as { document_type: string; import_id: string }[];
  return out;
}
export async function readStoreHeads(db: CycleSqlReader, scope: WorkpaperScope, families: readonly StoreFamily[] = STORE_FAMILIES) {
  if (scope.mode !== "real") throw new Error("CL_REAL_SCOPE_REQUIRED");
  const out: { family: StoreFamily; run: WorkpaperRun }[] = [];
  for (const adapter of STORE_READ_ADAPTERS.filter(a => families.includes(a.family))) {
    const data = await db.execute(sql`SELECT v.run FROM ${adapter.versions} v JOIN ${adapter.heads} h USING (organization_id,dossier_id,period_id,id,version)
      WHERE v.organization_id=${scope.organizationId} AND v.dossier_id=${scope.dossierId} AND v.period_id=${scope.periodId} ORDER BY v.id`) as { run: WorkpaperRun }[];
    out.push(...data.map(r => ({ family: adapter.family, run: r.run })));
  }
  return scopedFamilyRuns(scope, out);
}
