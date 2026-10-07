import { ClientMissionSynthesis } from "@/components/probant/ClientMissionSynthesis";
export default async function ClientsSynthesisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  return <ClientMissionSynthesis initialDossierId={typeof p.dossierId === "string" ? p.dossierId : ""} initialPeriodId={typeof p.periodId === "string" ? p.periodId : ""} initialRootId={typeof p.rootId === "string" ? p.rootId : ""}/>;
}
