import { ClientMissionSynthesis } from "@/components/probant/ClientMissionSynthesis";
export default async function ClientsSynthesisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const text = (value: string | string[] | undefined) => typeof value === "string" && value.length <= 200 ? value : "";
  const id = text(p.id), rawVersion = text(p.version), version = /^[1-9]\d*$/.test(rawVersion) ? Number(rawVersion) : undefined;
  if ((p.id !== undefined || p.version !== undefined) && (!id || !Number.isSafeInteger(version) || version! < 1)) return <main><p role="alert">La version de feuille demandée est invalide.</p></main>;
  return <ClientMissionSynthesis initialDossierId={text(p.dossierId)} initialPeriodId={text(p.periodId)} initialRootId={text(p.rootId)} initialRunId={id} initialVersion={version}/>;
}
