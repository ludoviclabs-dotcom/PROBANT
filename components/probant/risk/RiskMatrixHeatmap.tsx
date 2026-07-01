"use client";

import { useMemo } from "react";
import type { CycleRiskScore, CriticityBand, RiskAxisId } from "@/lib/risk-mapping";
import { RISK_AXES } from "@/lib/risk-mapping";
import { cn } from "@/lib/utils";

/**
 * Matrice thermique des cycles : une ligne par cycle (triée par composite
 * décroissant), quatre colonnes d'axes + une colonne composite. L'intensité de
 * chaque cellule est produite par `color-mix(in srgb, <hex axe> X%, transparent)`
 * — même pattern que la heatmap de la Synthèse (color-mix sur l'accent de
 * gravité). Une cellule « non évaluée » est rendue en fond hachuré gris, JAMAIS
 * en vert : un cycle sans constat ni standard obligatoire ne doit pas suggérer
 * un risque maîtrisé et prouvé.
 *
 * Aucune valeur affichée n'est inventée : tout provient des `CycleRiskScore`
 * calculés par le moteur `lib/risk-mapping`. Le composite reste une heuristique
 * interne non opposable (disclaimer en pied).
 */

interface RiskMatrixHeatmapProps {
  scores: CycleRiskScore[];
  selected: string | null;
  onSelect: (slug: string) => void;
}

/** Couleur d'accent par axe, pour l'intensité color-mix des cellules. */
const AXIS_HEX: Record<RiskAxisId, string> = {
  gravite: "#ef4444",
  probabilite: "#f97316",
  detectabilite: "#38bdf8",
  exposition: "#a78bfa",
};

/** Couleur d'accent par bande de criticité (colonne composite). */
const BAND_HEX: Record<CriticityBand, string> = {
  critique: "#ef4444",
  élevé: "#f97316",
  modéré: "#eab308",
  faible: "#3b82f6",
  non_évalué: "#5c6b82",
};

const BAND_LABEL: Record<CriticityBand, string> = {
  critique: "Critique",
  élevé: "Élevé",
  modéré: "Modéré",
  faible: "Faible",
  non_évalué: "Non évalué",
};

/** Fond hachuré gris pour les cellules non évaluées (jamais de vert). */
const HATCH =
  "repeating-linear-gradient(45deg, #1a2029 0, #1a2029 5px, #10151c 5px, #10151c 10px)";

/**
 * Intensité color-mix d'une cellule d'axe. La détectabilité est INVERSÉE :
 * un score élevé = bonne détection = risque moindre, donc l'intensité suit
 * `100 − value`. Les autres axes suivent directement `value`.
 */
function axisCellBg(axis: RiskAxisId, value: number, evaluated: boolean): string {
  if (!evaluated) return HATCH;
  const risk = axis === "detectabilite" ? 100 - value : value;
  const pct = 12 + (risk / 100) * 72;
  return `color-mix(in srgb, ${AXIS_HEX[axis]} ${pct.toFixed(0)}%, transparent)`;
}

/** Intensité color-mix de la colonne composite (bande de criticité). */
function compositeCellBg(band: CriticityBand, composite: number | null): string {
  if (composite === null) return HATCH;
  const pct = 20 + (composite / 100) * 68;
  return `color-mix(in srgb, ${BAND_HEX[band]} ${pct.toFixed(0)}%, transparent)`;
}

export function RiskMatrixHeatmap({ scores, selected, onSelect }: RiskMatrixHeatmapProps) {
  // Tri par composite décroissant ; les cycles non évalués (composite null)
  // repoussés en fin de liste, sans jamais être traités comme un « 0 ».
  const rows = useMemo(() => {
    return [...scores].sort((a, b) => {
      const ca = a.composite ?? -1;
      const cb = b.composite ?? -1;
      return cb - ca;
    });
  }, [scores]);

  const gridTemplate = `160px repeat(${RISK_AXES.length}, 1fr) 84px`;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="grid"
        aria-label="Matrice thermique des cycles"
        className="grid items-center gap-1.5 text-[var(--pb-text)]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* En-tête */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)]">
          Cycle
        </div>
        {RISK_AXES.map((axis) => (
          <div
            key={axis.id}
            title={axis.doctrine}
            className="text-center text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: AXIS_HEX[axis.id] }}
          >
            {axis.short}
          </div>
        ))}
        <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)]">
          Comp.
        </div>

        {/* Lignes */}
        {rows.map((s) => {
          const evaluated = s.evaluation === "évalué";
          const isSelected = s.cycleSlug === selected;
          return (
            <div key={s.cycleSlug} className="contents">
              <button
                type="button"
                onClick={() => onSelect(s.cycleSlug)}
                title={s.cycleSlug}
                className={cn(
                  "flex min-w-0 items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                  isSelected
                    ? "bg-[var(--pb-surface-3)] text-[var(--pb-text)]"
                    : "text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)]",
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: BAND_HEX[s.criticityBand] }}
                />
                <span className="truncate">{s.cycleSlug}</span>
              </button>

              {RISK_AXES.map((axis) => {
                const score = s.axes[axis.id];
                return (
                  <button
                    key={axis.id}
                    type="button"
                    onClick={() => onSelect(s.cycleSlug)}
                    title={
                      evaluated
                        ? `${axis.label} : ${Math.round(score.value)}/100`
                        : `${axis.label} : non évalué`
                    }
                    aria-label={`${s.cycleSlug} — ${axis.label} ${
                      evaluated ? Math.round(score.value) : "non évalué"
                    }`}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-md border font-mono text-xs font-bold transition-transform hover:scale-[1.04]",
                      isSelected
                        ? "border-[var(--pb-accent)]"
                        : "border-[var(--pb-border)]",
                    )}
                    style={{
                      background: axisCellBg(axis.id, score.value, evaluated),
                      color: evaluated ? "#fff" : "#3a4761",
                    }}
                  >
                    {evaluated ? Math.round(score.value) : "·"}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => onSelect(s.cycleSlug)}
                title={
                  s.composite === null
                    ? "Composite : non évalué"
                    : `Composite : ${Math.round(s.composite)}/100 · ${BAND_LABEL[s.criticityBand]} (heuristique)`
                }
                aria-label={`${s.cycleSlug} — composite ${
                  s.composite === null ? "non évalué" : Math.round(s.composite)
                }`}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md border font-mono text-xs font-extrabold transition-transform hover:scale-[1.04]",
                  isSelected ? "border-[var(--pb-accent)]" : "border-[var(--pb-border)]",
                )}
                style={{
                  background: compositeCellBg(s.criticityBand, s.composite),
                  color: s.composite === null ? "#3a4761" : "#fff",
                }}
              >
                {s.composite === null ? "·" : Math.round(s.composite)}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
        Intensité proportionnelle au score de l'axe (détectabilité inversée : plus
        elle est faible, plus la cellule est chaude). Cellule hachurée = cycle non
        évalué, jamais assimilé à un risque maîtrisé. Le composite est une heuristique
        interne d'aide à la hiérarchisation, non opposable.
      </p>
    </div>
  );
}
