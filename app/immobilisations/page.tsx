import type { Metadata } from "next";
import { FixedAssetsWorkspace } from "@/components/probant/fixed-assets/FixedAssetsWorkspace";
import type { FixedAssetMissionFilter } from "@/lib/workpapers/fixed-asset-mission";
import type { FaTable } from "@/lib/workpapers/fixed-asset-sources";

export const metadata: Metadata = { title: "Immobilisations — mouvements et recalcul · PROBANT" };
const FILTERS: FixedAssetMissionFilter[] = ["all", "blocked", "exceptions", "evidence", "review", "stale"];
const TABLES: FaTable[] = ["gross", "amortization", "impairment"];
export default async function ImmobilisationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 200 ? p[k] as string : undefined;
  const version = value("version"), filter = value("filter"), table = value("table");
  return <FixedAssetsWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined,
    filter: FILTERS.includes(filter as FixedAssetMissionFilter) ? filter as FixedAssetMissionFilter : "all", asset: value("asset"), table: TABLES.includes(table as FaTable) ? table as FaTable : undefined, noteId: value("noteId") } : undefined}/>;
}
