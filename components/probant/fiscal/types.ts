import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";

/** Read response of /api/workpapers/fiscal: server state and results only; nothing is recomputed in the browser. */
export interface FiscalView {
  actorId: string; permissions: string[]; runs: WorkpaperRun[];
  sourcesCurrent: Record<string, boolean>; expectedSources: Record<string, string[]>; currentVersions?: Record<string, number>; lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
  versions: Record<string, { importId: string; documentVersionId: string; fileName: string; sha256: string; approvedAt: string; current: boolean }[]>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
/** Selected item of the sheet: a declaration line (« L: »), a VAT entry (« E: »), an observed rate (« R: ») or a blocked rule (« B: »). */
export type FiscalSelection = { kind: "line"; id: string } | { kind: "entry"; id: string } | { kind: "rate"; id: string } | { kind: "rule"; id: string } | null;
export function selectionFromItem(item?: string | null): FiscalSelection {
  if (!item || item.length < 3) return null;
  const id = item.slice(2);
  return item.startsWith("L:") ? { kind: "line", id } : item.startsWith("E:") ? { kind: "entry", id } : item.startsWith("R:") ? { kind: "rate", id } : item.startsWith("B:") ? { kind: "rule", id } : null;
}
export const itemOf = (s: FiscalSelection) => s ? { line: "L:", entry: "E:", rate: "R:", rule: "B:" }[s.kind] + s.id : null;
