import type { Metadata } from "next";
import { CashReconciliationWorkspace } from "@/components/probant/cash/CashReconciliationWorkspace";
import type { CashMissionFilter } from "@/lib/workpapers/cash-mission";

export const metadata: Metadata = { title: "Trésorerie — pont bancaire · PROBANT" };
const FILTERS: CashMissionFilter[] = ["all", "blocked", "exceptions", "evidence", "review", "stale"];
export default async function TresoreriePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 200 ? p[k] as string : undefined;
  const version = value("version"), filter = value("filter");
  return <CashReconciliationWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined,
    filter: FILTERS.includes(filter as CashMissionFilter) ? filter as CashMissionFilter : "all", account: value("account"), item: value("item"), noteId: value("noteId") } : undefined}/>;
}
