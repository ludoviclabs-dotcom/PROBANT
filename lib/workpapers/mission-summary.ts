import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { assertScope, contentHash, periodId, validateRun, type WorkpaperRun } from "./model";
/** Projection consumer only: never recalculates a cycle or merges the five legacy dimensions. */
export function summarizeWorkpapers(snapshot: DossierSnapshot) {
  const drafts = snapshot.workpapers?.runs ?? [], projection = snapshot.workpaperProjection;
  if (projection || drafts.length) {
    if (!snapshot.dossier.period || !snapshot.dossier.organizationId) throw new Error("WORKPAPER_SCOPE_REQUIRED");
    const scope = { organizationId: snapshot.dossier.organizationId, dossierId: snapshot.dossier.id, periodId: periodId(snapshot.dossier.period), mode: snapshot.dossier.demoMode ? "demo" as const : "real" as const };
    if (projection) assertScope(scope, projection.scope);
    [...drafts, ...(projection?.lockedRuns ?? [])].forEach((r) => { validateRun(r); assertScope(scope, r.scope); });
  }
  if (projection) { const { hash, ...body } = projection; if (stableSha256(body) !== hash) throw new Error("PROJECTION_CORRUPTED"); }
  const locked = projection?.lockedRuns ?? [];
  locked.forEach((r) => { validateRun(r); if (r.state !== "locked" || r.approval?.snapshotHash !== contentHash(r)) throw new Error("LOCKED_RUN_INVALID"); });
  const latest = new Map<string, WorkpaperRun>();
  [...locked, ...drafts].forEach((r) => { const old = latest.get(r.rootId); if (!old || r.revision > old.revision || (r.revision === old.revision && r.version > old.version)) latest.set(r.rootId, r); });
  const rows = [...latest.values()].sort((a, b) => canonicalCompare(a.rootId, b.rootId)).map((r) => {
    const projected = locked.find((l) => l.rootId === r.rootId);
    return { id: r.id, rootId: r.rootId, label: r.template.objective, state: r.state, revision: r.revision, executed: r.result?.execution === "completed", inconclusive: r.result?.outcome === "inconclusive", projectedRevision: projected?.revision ?? null, stale: !!projected && (r.revision > projected.revision || contentHash(r) !== contentHash(projected)), assertions: r.template.assertions, notes: r.notes, link: `#wp-${encodeURIComponent(r.id)}` };
  });
  return { sourceRevisions: projection?.sourceRevisions ?? [], rows, planned: rows.length, executed: rows.filter((r) => r.executed).length, approved: locked.length, inconclusive: rows.filter((r) => r.inconclusive).length, coverage: rows.length ? { numerator: locked.length, denominator: rows.length, unit: "procédures projetées / prévues", excluded: "Non applicables non définis ; non concluants inclus et signalés" } : { reason: "Aucune population de procédures définie : non calculable" }, exposures: { kind: "unknown" as const, reason: "Montants conservés par travail ; aucune somme entre catégories ou événements sans regroupement validé" } };
}
/** Exact table paths link each displayed value to its immutable result, not a new computation. */
export function resultCells(value: unknown, path = "result"): { path: string; value: string }[] {
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  if (o.kind === "unknown" || o.kind === "not_applicable") return [{ path, value: `${o.kind} : ${String(o.reason)}` }];
  if (typeof o.amount === "string" && o.currency === "EUR") return [{ path, value: `${o.amount} EUR` }];
  return Object.entries(o).flatMap(([key, v]) => resultCells(v, `${path}.${key}`));
}
