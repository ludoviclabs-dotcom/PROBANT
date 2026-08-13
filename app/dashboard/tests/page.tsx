"use client";

import { FlaskConical, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import { SeverityBadge, FamilyBadge } from "@/components/probant/Badges";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";

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

  return (
    <div className="p-6">
      <PageHeader
        title="Tests complémentaires"
        subtitle="Lorsqu'un constat laisse penser à une anomalie significative, des procédures supplémentaires sont requises (ISA 330 / ISRE 2400). Voici les tests suggérés par constat."
      />

      <div className="space-y-3">
        {cibles.map((f) => {
          const procs = PROCEDURES[f.siloId] ?? [
            "Documenter le constat et obtenir les éléments probants associés.",
          ];
          return (
            <div
              key={f.id}
              className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <FlaskConical className="h-4 w-4 text-[var(--pb-accent)]" />
                <span className="text-sm font-semibold text-[var(--pb-text)]">
                  {f.titre}
                </span>
                <SeverityBadge severity={f.severity} className="ml-1" />
                <FamilyBadge family={f.family} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {procs.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-[var(--pb-text-muted)]"
                  >
                    <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
