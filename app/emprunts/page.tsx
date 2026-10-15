import type { Metadata } from "next";
import { LoanWorkspace, type LoanRequested } from "@/components/probant/loans/LoanWorkspace";
import { periodHintFromSearch } from "@/lib/dossier/navigation-context";

export const metadata: Metadata = { title: "Emprunts et dettes financières · PROBANT" };
const TABS = ["population", "tests", "exceptions", "pieces", "revue"] as const;
const TONES = ["ok", "explain", "unknown", "excluded"] as const;
const CASES = ["", "simple", "long", "empty"] as const;

export default async function EmpruntsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams, value = (k: string) => typeof p[k] === "string" && (p[k] as string).length <= 300 ? p[k] as string : undefined;
  const version = value("version"), month = Number(value("month")), demoCase = value("case") ?? "";
  const shared = { tab: (TABS as readonly string[]).includes(value("tab") ?? "") ? value("tab") as LoanRequested["tab"] : undefined, contract: value("contract"), due: value("due"),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : undefined, q: value("q"), tone: (TONES as readonly string[]).includes(value("tone") ?? "") ? value("tone") as LoanRequested["tone"] : undefined };
  if (value("demo") === "1") return <LoanWorkspace demo demoCase={(CASES as readonly string[]).includes(demoCase) ? demoCase : ""} requested={{ periodId: "", ...shared }}/>;
  return <LoanWorkspace initialPeriodValue={periodHintFromSearch(p)} initialDossierId={value("dossierId")} requested={value("periodId") ? { periodId: value("periodId")!, id: value("id"),
    version: version && /^[1-9]\d*$/.test(version) ? Number(version) : undefined, ...shared } : undefined}/>;
}
