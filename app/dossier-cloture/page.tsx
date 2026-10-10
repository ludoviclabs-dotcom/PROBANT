import type { Metadata } from "next";
import { ClosingWorkspace } from "@/components/probant/closing/ClosingWorkspace";
import type { ClosingTab } from "@/components/probant/closing/format";

export const metadata: Metadata = { title: "Dossier professionnel et clôture · PROBANT" };
const TABS = ["programme", "pieces", "anomalies", "revue", "cloture", "journal"] as const;
export default async function DossierCloturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 300 ? p[k] as string : undefined;
  const tab = value("tab"), procedure = value("p");
  return <ClosingWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, tab: (TABS as readonly string[]).includes(tab ?? "") ? tab as ClosingTab : undefined,
    p: procedure && /^P-\d{2,3}$/.test(procedure) ? procedure : undefined, filters: { nature: value("nature") ?? "", status: value("status") ?? "", owner: value("owner") ?? "", q: value("q") ?? "" } } : undefined}/>;
}
