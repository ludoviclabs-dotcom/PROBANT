import type { Metadata } from "next";
import { FiscalWorkspace, type FiscalFilter } from "@/components/probant/fiscal/FiscalWorkspace";

export const metadata: Metadata = { title: "Fiscalité — TVA puis IS · PROBANT" };
const FILTERS: FiscalFilter[] = ["all", "blocked", "exceptions", "evidence", "review", "stale"];
export default async function FiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 200 ? p[k] as string : undefined;
  const version = value("version"), filter = value("filter"), period = value("period"), item = value("item");
  const range = period && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(period) ? { startDate: period.slice(0, 10), endDate: period.slice(11) } : undefined;
  return <FiscalWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, tax: value("tax") === "vat" ? "vat" : undefined, period: range, id: value("id"),
    version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined, filter: FILTERS.includes(filter as FiscalFilter) ? filter as FiscalFilter : "all",
    item: item && /^[LERB]:/.test(item) ? item : undefined, noteId: value("noteId") } : undefined}/>;
}
