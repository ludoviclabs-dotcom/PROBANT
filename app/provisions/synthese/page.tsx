import type { Metadata } from "next";
import { ProvisionMissionSynthesis } from "@/components/probant/provisions/ProvisionMissionSynthesis";

export const metadata: Metadata = { title: "Synthèse Provisions et engagements · PROBANT" };
export default async function ProvisionsSynthesePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, text = (v: string | string[] | undefined) => typeof v === "string" && v.length <= 200 ? v : "";
  const id = text(p.id), raw = text(p.version), version = /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
  // An exact version is named by its sheet and its number together; anything else is refused rather than guessed.
  if ((p.id !== undefined || p.version !== undefined) && (!id || !version)) return <main><p role="alert">La version de feuille demandée est invalide.</p></main>;
  return <ProvisionMissionSynthesis initialDossierId={text(p.dossierId)} initialPeriodId={text(p.periodId)} initialRootId={text(p.rootId)} initialRunId={id} initialVersion={version}/>;
}
