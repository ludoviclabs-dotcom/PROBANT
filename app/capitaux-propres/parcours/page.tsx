import type { Metadata } from "next";
import { periodHintFromSearch } from "@/lib/dossier/navigation-context";
import { ParcoursWorkspace } from "@/components/probant/capitaux-propres/parcours/ParcoursWorkspace";

export const metadata: Metadata = { title: "Capitaux propres — parcours unique · PROBANT" };
/** Single entry of the Capitaux propres cycle (C09). */
export default async function CapitauxPropresParcoursPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, text = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 200 ? p[k] as string : undefined;
  const version = (k: string) => { const v = text(k); return v && /^[1-9]\d*$/.test(v) ? Number(v) : undefined; };
  return <ParcoursWorkspace initialPeriodValue={periodHintFromSearch(p)} requested={{ dossierId: text("dossierId") ?? "", periodId: text("periodId") ?? "",
    capitauxId: text("capitauxId"), capitauxVersion: version("capitauxVersion"), equityId: text("equityId"), equityVersion: version("equityVersion"), decision: text("decision") }}/>;
}
