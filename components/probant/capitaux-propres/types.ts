import type { EquityFactsView } from "@/lib/workpapers/capitaux-sources";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";

/** Read response of /api/workpapers/capitaux-propres: server facts and results only; nothing is recomputed in the browser. */
export interface EquityView {
  actorId: string; permissions: string[]; runs: WorkpaperRun[];
  facts: Record<string, EquityFactsView | null>; factsIssues: Record<string, { code: string; locator?: { row?: number; page?: number; sheet?: string; column?: string; value?: string } }>;
  sourcesCurrent: Record<string, boolean>; currentVersions?: Record<string, number>; lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
/** Selected item of the sheet: a decision line (« D: ») or a movement (« M: »). */
export type EquitySelection = { kind: "decision"; id: string } | { kind: "movement"; id: string } | null;
export function selectionFromItem(item?: string | null): EquitySelection {
  if (!item) return null;
  return item.startsWith("D:") ? { kind: "decision", id: item.slice(2) } : item.startsWith("M:") ? { kind: "movement", id: item.slice(2) } : null;
}
