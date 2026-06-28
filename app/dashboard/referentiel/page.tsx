import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import {
  REFERENTIEL_VERSION,
  SEUILS_INTERNES,
  SOURCES,
} from "@/lib/referentiel/sources";

export default function ReferentielPage() {
  const sources = Object.values(SOURCES);
  const droitDur = sources.filter((s) => /LPF|PCG/u.test(s.ref));
  const methode = sources.filter((s) => /ISA|ISRE/u.test(s.ref));

  return (
    <div className="p-6">
      <PageHeader
        title="Seuils & référentiel"
        subtitle={`Référentiel versionné (v.${REFERENTIEL_VERSION}). Le droit dur et la méthode professionnelle sont distingués des paramètres internes PROBANT.`}
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#eab308]/40 bg-[#292207] p-4 text-[12px] text-[#eab308]">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p>
          Les citations sont des paraphrases destinées à l'affichage et ne se
          substituent pas au texte officiel opposable. Les seuils chiffrés
          externes (catégories d'entreprises, nomination CAC…) doivent être
          confrontés au Code de commerce et à ses décrets avant mise en
          production.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SourceGroup title="Droit dur — LPF / PCG" color="#f87171" items={droitDur} />
        <SourceGroup
          title="Méthode professionnelle — ISA / ISRE"
          color="#a78bfa"
          items={methode}
        />
      </div>

      {/* Seuils internes */}
      <div className="mt-4 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
          <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
          Paramètres internes PROBANT
          <span className="text-[11px] font-normal text-[var(--pb-text-faint)]">
            (non opposables, versionnés)
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

function SourceGroup({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: { ref: string; citation: string; effectiveDate: string }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </h3>
      <div className="mt-3 space-y-3">
        {items.map((s) => (
          <div
            key={s.ref}
            className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color }}>
                {s.ref}
              </span>
              <span className="tnum text-[10px] text-[var(--pb-text-faint)]">
                v.{s.effectiveDate}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
              {s.citation}
            </p>
          </div>
        ))}
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
