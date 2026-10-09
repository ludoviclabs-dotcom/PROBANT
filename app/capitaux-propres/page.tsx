import type { Metadata } from "next";
import { EquityWorkspace } from "@/components/probant/capitaux-propres/EquityWorkspace";
import type { EquityMissionFilter } from "@/lib/workpapers/capitaux-mission";
import { EQ_COMPONENTS, type EqComponent } from "@/lib/workpapers/capitaux-sources";

export const metadata: Metadata = { title: "Capitaux propres — décisions et mouvements · PROBANT" };
const FILTERS: EquityMissionFilter[] = ["all", "blocked", "exceptions", "evidence", "review", "stale"];
export default async function CapitauxPropresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 200 ? p[k] as string : undefined;
  const version = value("version"), filter = value("filter"), component = value("component"), item = value("item");
  return <EquityWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined,
    filter: FILTERS.includes(filter as EquityMissionFilter) ? filter as EquityMissionFilter : "all", component: (EQ_COMPONENTS as readonly string[]).includes(component ?? "") ? component as EqComponent : undefined,
    item: item && /^[DM]:/.test(item) ? item : undefined, noteId: value("noteId") } : undefined}/>;
}
