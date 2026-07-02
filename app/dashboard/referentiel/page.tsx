import { PageHeader } from "@/components/probant/PageHeader";
import {
  REFERENTIEL_VERSION,
  SEUILS_INTERNES,
  SOURCES,
} from "@/lib/referentiel/sources";
import { registryOf } from "@/components/referentiel/themes";
import { ReferentielMetrics } from "@/components/referentiel/ReferentielMetrics";
import { ReferentielWorkspace } from "@/components/referentiel/ReferentielWorkspace";

export default function ReferentielPage() {
  const sources = Object.values(SOURCES);
  const droitDur = sources.filter((s) => registryOf(s.theme) === "droit-dur").length;
  const methode = sources.filter((s) => registryOf(s.theme) === "methode").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Seuils & référentiel"
        subtitle="Sources normatives versionnées et paramètres internes. Le droit dur (opposable) et la méthode professionnelle sont distingués ; les citations sont des paraphrases d'affichage."
      />

      {/* Version */}
      <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-3 py-1.5 text-[12px] text-[var(--pb-text-muted)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pb-accent)] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--pb-accent)]" />
        </span>
        Référentiel{" "}
        <span className="tnum font-semibold text-[var(--pb-text)]">
          v.{REFERENTIEL_VERSION}
        </span>
      </span>

      {/* Métriques animées */}
      <div className="mt-3">
        <ReferentielMetrics total={sources.length} droitDur={droitDur} methode={methode} />
      </div>

      {/* Infographies + disclaimer + filtres/cartes (état de filtre partagé) */}
      <div className="mt-4">
        <ReferentielWorkspace sources={sources} />
      </div>

      {/* Paramètres internes (préservés, restylés) */}
      <div className="mt-4 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
          <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
          Paramètres internes PROBANT
          <span className="ml-1 rounded-full border border-[var(--pb-border)] px-2 py-0.5 text-[10px] font-normal text-[var(--pb-text-faint)]">
            non opposables
          </span>
        </h3>
        <div className="tnum mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
          <Param label="Matérialité (% bilan)" value={`${SEUILS_INTERNES.materialitePctBilan} %`} />
          <Param label="Matérialité (% CA)" value={`${SEUILS_INTERNES.materialitePctCA} %`} />
          <Param
            label="Variation CA atypique"
            value={`${SEUILS_INTERNES.variationCaAtypiquePct} %`}
          />
          <Param
            label="Écart taux amort."
            value={`${SEUILS_INTERNES.ecartTauxAmortPts} pts`}
          />
          <Param
            label="Fenêtre écriture tardive"
            value={`${SEUILS_INTERNES.fenetreEcritureTardiveJours} j`}
          />
          <Param
            label="Seuil faisceau"
            value={`${SEUILS_INTERNES.faisceauSeuilSignaux} signaux`}
          />
        </div>
      </div>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-[#38bdf8]">{value}</div>
    </div>
  );
}
