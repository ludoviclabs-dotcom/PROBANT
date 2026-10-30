import type { TaxControlOutcome } from "@/lib/canonical-model";
import { TAX_OUTCOME_LABEL } from "@/lib/tax/cockpit";
import x from "./fiscalite.module.css";

/**
 * Sorties de contrôle selon la charte : une FORME et un MOT, jamais la teinte seule. Les formes sont distinctes
 * des glyphes de gravité (carré plein, triangle plein, losange, cercle contour) :
 *   Vérifié              coche, trait ink-2
 *   Incohérence          croix, trait signal
 *   Anomalie confirmée   croix dans un carré contour, signal
 *   Risque potentiel     point d'exclamation, trait ink
 *   Donnée manquante     cercle en tirets
 *   Non concluant        anneau à point central (aussi « Analyse recommandée » : le mot les distingue)
 *   Aucune conclusion    anneau vide, ink-3
 * Le glyphe est décoratif : le libellé qui l'accompagne porte l'information.
 */
export type OutcomeKey = TaxControlOutcome | "none";

function shape(outcome: OutcomeKey) {
  switch (outcome) {
    case "passed":
      return <path d="M2 6.2 4.8 9 10 3" fill="none" strokeWidth={1.5} style={{ stroke: "var(--pb-ink-2)" }} />;
    case "reconciliation_difference":
      return <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" fill="none" strokeWidth={1.6} style={{ stroke: "var(--pb-signal)" }} />;
    case "confirmed_non_compliance":
      return (
        <>
          <rect x={0.75} y={0.75} width={10.5} height={10.5} fill="none" strokeWidth={1.2} style={{ stroke: "var(--pb-signal)" }} />
          <path d="M3.6 3.6 8.4 8.4M8.4 3.6 3.6 8.4" fill="none" strokeWidth={1.5} style={{ stroke: "var(--pb-signal)" }} />
        </>
      );
    case "potential_tax_risk":
      return (
        <>
          <path d="M6 1.4V7.6" fill="none" strokeWidth={1.8} style={{ stroke: "var(--pb-ink)" }} />
          <circle cx={6} cy={10.2} r={1.1} style={{ fill: "var(--pb-ink)" }} />
        </>
      );
    case "missing_information":
      return <circle cx={6} cy={6} r={4.5} fill="none" strokeWidth={1.2} strokeDasharray="2 2" style={{ stroke: "var(--pb-ink)" }} />;
    case "inconclusive":
    case "review_recommendation":
      return (
        <>
          <circle cx={6} cy={6} r={4.5} fill="none" strokeWidth={1.2} style={{ stroke: "var(--pb-ink-2)" }} />
          <circle cx={6} cy={6} r={1.6} style={{ fill: "var(--pb-ink-2)" }} />
        </>
      );
    default:
      return <circle cx={6} cy={6} r={4.5} fill="none" strokeWidth={1.2} style={{ stroke: "var(--pb-ink-3)" }} />;
  }
}

export function OutcomeGlyph({ outcome, size = 12 }: { outcome: OutcomeKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" className={x.glyph}>
      {shape(outcome)}
    </svg>
  );
}

/** Glyphe + mot. `label` remplace le libellé de la taxonomie (ex. « Aucune conclusion »). */
export function OutcomeMark({ outcome, label, className }: { outcome: OutcomeKey; label?: string; className?: string }) {
  const word = label ?? (outcome === "none" ? "Aucune conclusion" : TAX_OUTCOME_LABEL[outcome]);
  return (
    <span className={`${x.mark}${className ? ` ${className}` : ""}`} data-outcome={outcome}>
      <OutcomeGlyph outcome={outcome} />
      <span>{word}</span>
    </span>
  );
}

const BY_LABEL = new Map<string, TaxControlOutcome>(
  (Object.entries(TAX_OUTCOME_LABEL) as [TaxControlOutcome, string][]).map(([outcome, label]) => [label, outcome]),
);

/** Libellé de la taxonomie → sortie (les datasets portent parfois le seul libellé). Inconnu → `none`. */
export function outcomeOfLabel(label: string | null | undefined): OutcomeKey {
  return (label && BY_LABEL.get(label)) || "none";
}

/** Clé d'une sortie portée en chaîne par un dataset (`outcomeByRowId`). */
export function asOutcome(value: string | undefined): OutcomeKey {
  return value && value in TAX_OUTCOME_LABEL ? (value as TaxControlOutcome) : "none";
}
