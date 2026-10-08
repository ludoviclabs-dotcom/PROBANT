import { ClientFramingWorkspace } from "@/components/probant/ClientFramingWorkspace";
import type { MissionFilter } from "@/lib/workpapers/client-mission";
export default async function ClientsFramingPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" ? p[k] as string : undefined;
  const filter = value("filter"), version = value("version");
  return <ClientFramingWorkspace initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"), version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined, filter: (["all","blocked","exceptions","evidence","review","stale"].includes(filter ?? "") ? filter : "all") as MissionFilter, noteId: value("noteId"), procedure: value("procedure") === "clients.sales" ? "clients.sales" : undefined } : undefined}/>;
}
