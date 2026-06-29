import { PageHeader } from "@/components/probant/PageHeader";
import { CloisonsWorkspace } from "@/components/probant/CloisonsWorkspace";
import { CloisonsViewLive } from "@/components/probant/CloisonsViewLive";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { SCENARIO_MAP } from "@/lib/demo/scenarios";

export default async function CloisonsPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; mode?: string }>;
}) {
  const params = await searchParams;

  /* ── Mode FEC réel (résultats stockés en sessionStorage) ── */
  if (params.mode === "live") {
    return (
      <div className="p-6">
        <PageHeader
          title="Revue par cloison"
          subtitle="Constats issus de l'analyse de votre FEC — groupés par cloison comptable. Les états reconstruits ne sont pas disponibles en mode FEC direct."
        />
        <CloisonsViewLive />
      </div>
    );
  }

  /* ── Mode scénario de simulation ── */
  const scenario = params.scenario ? SCENARIO_MAP[params.scenario] : null;
  const silos = scenario?.silos ?? DEMO_DOSSIER.silos;
  const meta = scenario
    ? { label: scenario.label, exercice: scenario.exercice }
    : { label: DEMO_DOSSIER.societe.raisonSociale, exercice: DEMO_DOSSIER.societe.exercice };

  const scenarioInfo = scenario
    ? { label: scenario.label, secteur: scenario.secteur, forme: scenario.forme, exercice: scenario.exercice }
    : null;

  return (
    <CloisonsWorkspace silos={silos} meta={meta} scenario={scenarioInfo} />
  );
}
