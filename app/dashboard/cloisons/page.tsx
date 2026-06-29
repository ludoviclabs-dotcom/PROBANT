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
    : {
        label: DEMO_DOSSIER.societe.raisonSociale,
        exercice: DEMO_DOSSIER.societe.exercice,
      };

  return (
    <div className="p-6">
      <PageHeader
        title="Revue par cloison"
        subtitle="Chaque catégorie comptable est isolée en silo : l'élément financier reconstruit, l'anomalie entourée et reliée par une flèche au constat, avec montant, seuil, source officielle et explication."
      />

      {/* Bandeau scénario actif */}
      {scenario && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-4 py-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="rounded border border-[var(--pb-accent)]/40 bg-[var(--pb-accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--pb-accent)]">
              Simulation
            </span>
            <span className="font-semibold text-[var(--pb-text)]">{scenario.label}</span>
            <span className="text-[var(--pb-text-faint)]">
              · {scenario.secteur} · {scenario.forme} · {scenario.exercice}
            </span>
          </div>
          <a
            href="/dashboard/depot"
            className="text-[var(--pb-text-faint)] hover:text-[var(--pb-text)]"
          >
            ← Changer de scénario
          </a>
        </div>
      )}

      <CloisonsWorkspace silos={silos} meta={meta} />
    </div>
  );
}
