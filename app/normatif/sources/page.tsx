import { loadAllCycles, loadAllSources } from "@/lib/audit-cycles/loader";
import { PageHeader } from "@/components/probant/PageHeader";
import { SourceRegistryTable } from "@/components/normatif/SourceRegistryTable";

export default async function SourcesPage() {
  const [sources, cycles] = await Promise.all([loadAllSources(), loadAllCycles()]);

  // Compte des cycles référençant chaque source.
  const cyclesBySource: Record<string, number> = {};
  for (const c of cycles) {
    const refs = new Set<string>([
      ...(c.applicableStandards ?? []).map((s) => s.id),
      ...(c.officialSources ?? []).map((s) => s.id),
    ]);
    for (const id of refs) cyclesBySource[id] = (cyclesBySource[id] ?? 0) + 1;
  }

  const missingUrl = sources.filter(
    (s) => s.status === "OBLIGATOIRE" && !s.url,
  ).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Sources normatives"
        subtitle={`${sources.length} sources officielles centralisées (ISA, NEP, IAS/IFRS, PCG, UE, Code de commerce, CGI, AFA). Chaque fiche cycle référence ces sources par leur identifiant.`}
      />

      {missingUrl > 0 && (
        <div className="mb-4 rounded-lg border border-[#eab308]/40 bg-[#292207] px-3 py-2 text-[12px] text-[#eab308]">
          {missingUrl} source(s) obligatoire(s) sans URL — à compléter lors de la
          revue experte.
        </div>
      )}

      <SourceRegistryTable sources={sources} cyclesBySource={cyclesBySource} />
    </div>
  );
}
