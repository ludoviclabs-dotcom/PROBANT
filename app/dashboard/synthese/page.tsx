import Link from "next/link";
import { AlertOctagon, Scale, Microscope, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import {
  CLOISONS,
  computeCounts,
  type CloisonId,
  type Severity,
} from "@/lib/canonical-model";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { formatEUR } from "@/lib/utils";

export default function SynthesePage() {
  const d = DEMO_DOSSIER;
  const c = computeCounts(d);

  const cards = [
    {
      label: "Bloquantes d'admissibilité",
      value: c.bloquantesAdmissibilite,
      help: "Non-conformité FEC — analyse suspendue",
      hex: "#ef4444",
      icon: AlertOctagon,
      kind: "Non-conformité réglementaire",
    },
    {
      label: "Constats réglementaires",
      value: c.parFamille.hardLaw,
      help: "Droit dur (LPF, PCG)",
      hex: "#f87171",
      icon: Scale,
      kind: "Non-conformité réglementaire",
    },
    {
      label: "Présomptions d'audit",
      value: c.parFamille.methodology,
      help: "Méthode (ISA, ISRE)",
      hex: "#a78bfa",
      icon: Microscope,
      kind: "Signal analytique",
    },
    {
      label: "Paramètres internes",
      value: c.parFamille.internal,
      help: "Heuristiques PROBANT",
      hex: "#38bdf8",
      icon: SlidersHorizontal,
      kind: "Signal analytique",
    },
  ];

  const maxIncidence = Math.max(
    1,
    ...Object.values(c.incidenceParCloison).map((v) => v ?? 0),
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Synthèse"
        subtitle="Vue justifiable : ce qui relève d'une non-conformité réglementaire est distingué de ce qui n'est qu'un signal analytique à investiguer."
      />

      {/* Cartes de tête */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4" style={{ color: card.hex }} />
                <span className="text-[9px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                  {card.kind}
                </span>
              </div>
              <div
                className="tnum mt-3 text-3xl font-bold"
                style={{ color: card.hex }}
              >
                {card.value}
              </div>
              <div className="mt-1 text-[13px] font-medium text-[var(--pb-text)]">
                {card.label}
              </div>
              <div className="text-[11px] text-[var(--pb-text-faint)]">
                {card.help}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Répartition par gravité */}
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--pb-text)]">
            Répartition par gravité
          </h3>
          <div className="mt-4 space-y-3">
            {(["bloquant", "majeur", "mineur", "informatif"] as Severity[]).map(
              (sev) => {
                const n = c.parSeverite[sev];
                const total = c.totalFindings || 1;
                const pct = (n / total) * 100;
                const s = SEVERITY_STYLE[sev];
                return (
                  <div key={sev}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span style={{ color: s.hex }}>{s.label}</span>
                      <span className="tnum text-[var(--pb-text-muted)]">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--pb-surface-3)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: s.hex }}
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>
          <div className="mt-4 flex gap-4 border-t border-[var(--pb-border)] pt-3 text-[11px] text-[var(--pb-text-muted)]">
            <span>
              En attente :{" "}
              <span className="tnum font-semibold text-[var(--pb-text)]">
                {c.parStatut.en_attente}
              </span>
            </span>
            <span>
              Validés :{" "}
              <span className="tnum font-semibold text-[#22c55e]">
                {c.parStatut.valide}
              </span>
            </span>
            <span>
              Écartés :{" "}
              <span className="tnum font-semibold text-[#ef4444]">
                {c.parStatut.ecarte}
              </span>
            </span>
          </div>
        </div>

        {/* Incidence par cloison */}
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--pb-text)]">
            Incidence potentielle estimée
          </h3>
          <p className="mt-1 text-[11px] text-[var(--pb-text-faint)]">
            Somme des écarts chiffrés (EUR) par cloison. Indicatif.
          </p>
          <div className="mt-4 space-y-3">
            {Object.entries(c.incidenceParCloison)
              .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
              .map(([cloison, montant]) => {
                const label =
                  CLOISONS.find((x) => x.id === (cloison as CloisonId))?.label ??
                  cloison;
                const pct = ((montant ?? 0) / maxIncidence) * 100;
                return (
                  <div key={cloison}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[var(--pb-text-muted)]">{label}</span>
                      <span className="tnum font-semibold text-[var(--pb-text)]">
                        {formatEUR(montant ?? 0)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--pb-surface-3)]">
                      <div
                        className="h-full rounded-full bg-[var(--pb-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(c.incidenceParCloison).length === 0 && (
              <p className="text-[12px] text-[var(--pb-text-faint)]">
                Aucun écart chiffré à incidence directe.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <p className="text-[13px] text-[var(--pb-text-muted)]">
          {c.bloquantesAdmissibilite > 0
            ? "Des alertes bloquantes d'admissibilité subsistent : à traiter avant de conclure l'analyse financière."
            : "Aucune alerte bloquante d'admissibilité. L'analyse financière est exploitable."}
        </p>
        <Link
          href="/dashboard/cloisons"
          className="shrink-0 rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] transition-opacity hover:opacity-90"
        >
          Ouvrir la revue par cloison →
        </Link>
      </div>
    </div>
  );
}
