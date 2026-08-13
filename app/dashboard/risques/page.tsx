import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { RiskMappingView } from "@/components/probant/risk/RiskMappingView";

export const metadata = {
  title: "Cartographie des risques · PROBANT",
};

export default async function RisquesPage() {
  const cycles = await loadAllCycles();
  return (
    <RiskMappingView cycles={cycles} />
  );
}
