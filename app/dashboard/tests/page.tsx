"use client";

import { FlaskConical, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import { SeverityBadge, FamilyBadge } from "@/components/probant/Badges";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { CycleDemonstration } from "@/components/probant/CycleDemonstration";

/** Procédures complémentaires suggérées selon le silo concerné. */
const PROCEDURES: Record<string, string[]> = {
  "immobilisations-corporelles": [
    "Rapprocher le plan d'amortissement N et N-1 par catégorie d'actif.",
    "Obtenir la justification du changement et vérifier la note en annexe.",
  ],
  provisions: [
    "Obtenir le suivi des contrats à marge et recalculer la perte à terminaison.",
    "Confirmer l'engagement ferme et la probabilité de sortie de ressources.",
  ],
  "chiffre-affaires": [
    "Tester le cut-off : rapprocher dates d'écriture et bons de livraison.",
    "Inspecter les écritures manuelles de fin de période sur comptes 70x.",
  ],
  cca: ["Recalculer l'étalement prorata temporis des charges payées d'avance."],
  stocks: ["Mener le test de dépréciation sur les références à rotation faible."],
  "creances-clients": [
    "Vérifier le rattachement des produits via le compte 418 à la clôture.",
  ],
};

export default function TestsPage() {
  const snapshot = useActiveDossierSnapshot();
  const cibles = snapshot.findings.filter(
    (f) => f.family !== "internal" && f.severity !== "informatif",
  );
  const synthetic = snapshot.dossier.organizationId === "SYNTHETIC-DEMO";

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Tests complémentaires"
        subtitle="Lorsqu'un constat laisse penser à une anomalie significative, des procédures supplémentaires sont requises (ISA 330 / ISRE 2400). Voici les tests suggérés par constat."
      />

      <CycleDemonstration />

      <section aria-labelledby="tests-list-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="tests-list-title" className="text-[15px] font-semibold text-[var(--pb-text)]">Tests suggérés par constat</h2>
          <p className="tnum text-[12px] text-[var(--pb-text-muted)]">{cibles.length} constat{cibles.length > 1 ? "s" : ""} · familles droit dur et présomption, gravité informative exclue</p>
        </div>
        {cibles.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--pb-border)] px-4 py-6 text-center text-[13px] text-[var(--pb-text-muted)]">
            {synthetic ? "Aucun constat historique dans ce scénario : les tests viennent des feuilles exécutées dans le laboratoire." : "Aucun constat ne requiert de test complémentaire dans ce dossier."}
          </p>
        )}
        {cibles.map((f) => {
          const procs = PROCEDURES[f.siloId] ?? [
            "Documenter le constat et obtenir les éléments probants associés.",
          ];
          return (
            <article
              key={f.id}
              className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 transition-colors hover:border-[var(--pb-border-strong)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--pb-accent)]" />
                <h3 className="min-w-0 text-sm font-semibold text-[var(--pb-text)]">
                  {f.titre}
                </h3>
                <SeverityBadge severity={f.severity} className="ml-1" />
                <FamilyBadge family={f.family} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {procs.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-[var(--pb-text-muted)]"
                  >
                    <ListChecks aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
