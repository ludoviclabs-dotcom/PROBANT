import type { Metadata } from "next";
import { StockWorkspace } from "@/components/probant/stocks/StockWorkspace";

export const metadata: Metadata = { title: "Stocks — quantités et mouvements · PROBANT" };
const KINDS = ["ok", "quantity", "ownership", "blocked", "uncertain", "apart"] as const;
const TABS = ["population", "tests", "exceptions", "pieces", "revue"] as const;
export default async function StocksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 300 ? p[k] as string : undefined;
  const version = value("version"), kinds = (value("kinds") ?? "").split(",").filter((k): k is typeof KINDS[number] => (KINDS as readonly string[]).includes(k)), tab = value("tab");
  return <StockWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined,
    item: value("item"), tab: (TABS as readonly string[]).includes(tab ?? "") ? tab as typeof TABS[number] : undefined,
    filters: { kinds, site: value("site") ?? "", lot: value("lot") ?? "", q: value("q") ?? "", view: value("view") === "table" ? "table" : "grid" } } : undefined}/>;
}
