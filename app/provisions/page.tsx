import type { Metadata } from "next";
import { ProvisionWorkspace, type ProvisionTab } from "@/components/probant/provisions/ProvisionWorkspace";

export const metadata: Metadata = { title: "Provisions et engagements · PROBANT" };
const KINDS = ["difference", "annex", "unsupported", "uncertain", "ok", "off", "apart"] as const;
const TABS = ["registre", "pont", "exceptions", "pieces", "revue"] as const;
const FOCUS = ["dotation", "utilisation", "reprise"] as const;
export default async function ProvisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 300 ? p[k] as string : undefined;
  const version = value("version"), kinds = (value("kinds") ?? "").split(",").filter((k): k is typeof KINDS[number] => (KINDS as readonly string[]).includes(k)), tab = value("tab"), focus = value("focus");
  return <ProvisionWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined,
    item: value("item"), tab: (TABS as readonly string[]).includes(tab ?? "") ? tab as ProvisionTab : undefined,
    filters: { kinds, type: value("type") ?? "", state: value("state") ?? "", q: value("q") ?? "", view: value("view") === "table" ? "table" : "grid", focus: (FOCUS as readonly string[]).includes(focus ?? "") ? focus as typeof FOCUS[number] : "" } } : undefined}/>;
}
