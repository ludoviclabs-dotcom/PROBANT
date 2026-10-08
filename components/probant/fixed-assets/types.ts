import type { FixedAssetFactsView } from "@/lib/workpapers/fixed-asset-sources";
import type { FixedAssetComparison, FixedAssetPendingChange } from "@/lib/workpapers/fixed-asset-runtime";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";

/** Read response of /api/workpapers/immobilisations: server facts and results only; nothing is recomputed in the browser. */
export interface FixedAssetView {
  actorId: string; permissions: string[]; runs: WorkpaperRun[];
  facts: Record<string, FixedAssetFactsView | null>; factsIssues: Record<string, { code: string; locator?: { row?: number; sheet?: string; column?: string; value?: string } }>;
  sourcesCurrent: Record<string, boolean>; currentVersions?: Record<string, number>; lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
  comparisons: Record<string, FixedAssetComparison | null>; pendingChanges: Record<string, FixedAssetPendingChange | null>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
export type FactUnit = FixedAssetFactsView["units"][number];
export type FactLine = FactUnit["lines"][number];
export type FactSupport = FactUnit["supports"][number];
export type BridgeFilter = "addition" | "disposal" | "reversal" | "reclassification" | "difference" | null;
