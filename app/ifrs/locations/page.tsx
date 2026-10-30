import type { Metadata } from "next";
import { LeaseWorkspace } from "@/components/probant/ifrs/LeaseWorkspace";
import { parseSelection } from "@/components/probant/ifrs/selection-url";
import { periodHintFromSearch } from "@/lib/dossier/navigation-context";

export const metadata: Metadata = { title: "Locations IFRS 16 · PROBANT" };

export default async function LocationsIfrs16Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 300 ? p[k] as string : undefined;
  const search = new URLSearchParams(Object.entries(p).flatMap(([k, v]) => typeof v === "string" ? [[k, v]] : [])).toString(), selection = parseSelection(search);
  if (value("demo") === "1") return <LeaseWorkspace demo initialSelection={selection}/>;
  return <LeaseWorkspace initialDossierId={value("dossierId")} initialPeriod={periodHintFromSearch(p)} initialPeriodId={value("periodId")} initialSelection={selection}/>;
}
