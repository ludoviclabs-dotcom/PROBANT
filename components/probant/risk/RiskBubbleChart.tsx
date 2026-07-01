"use client";

import { useMemo } from "react";
import type { CycleRiskScore, CriticityBand } from "@/lib/risk-mapping";

/**
 * Nuage de bulles Probabilité × Gravité. Chaque cycle évalué est une bulle :
 * abscisse = probabilité, ordonnée = gravité (axe écran inversé — gravité forte
 * en haut), rayon = exposition, remplissage = bande de criticité du composite.
 *
 * Les valeurs proviennent des `CycleRiskScore` du moteur ; rien n'est inventé.
 * Les cycles « non évalués » (composite null) sont exclus du nuage : les placer
 * à l'origine suggérerait à tort un risque nul. Les quadrants sont annotés
 * sobrement (aide à la lecture, sans conclusion opposable).
 */

interface RiskBubbleChartProps {
  scores: CycleRiskScore[];
  onSelect: (slug: string) => void;
}

const VIEW_W = 560;
const VIEW_H = 460;
const PAD = 48;

const PLOT_W = VIEW_W - 2 * PAD;
const PLOT_H = VIEW_H - 2 * PAD;

const BAND_HEX: Record<CriticityBand, string> = {
  critique: "#ef4444",
  élevé: "#f97316",
  modéré: "#eab308",
  faible: "#3b82f6",
  non_évalué: "#5c6b82",
};

const BAND_LABEL: Record<CriticityBand, string> = {
  critique: "critique",
  élevé: "élevé",
  modéré: "modéré",
  faible: "faible",
  non_évalué: "non évalué",
};

/** Abscisse écran depuis la probabilité (0-100). */
function xOf(probabilite: number): number {
  return PAD + (Math.min(100, Math.max(0, probabilite)) / 100) * PLOT_W;
}

/** Ordonnée écran depuis la gravité (0-100), axe inversé (fort = haut). */
function yOf(gravite: number): number {
  return PAD + (1 - Math.min(100, Math.max(0, gravite)) / 100) * PLOT_H;
}

/** Rayon depuis l'exposition (0-100). */
function rOf(exposition: number): number {
  return 6 + (Math.min(100, Math.max(0, exposition)) / 100) * 16;
}

export function RiskBubbleChart({ scores, onSelect }: RiskBubbleChartProps) {
  const bubbles = useMemo(
    () => scores.filter((s) => s.composite !== null),
    [scores],
  );

  const midX = PAD + PLOT_W / 2;
  const midY = PAD + PLOT_H / 2;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      aria-label="Nuage Probabilité × Gravité des cycles"
      style={{ display: "block" }}
    >
      {/* Cadre du plot */}
      <rect
        x={PAD}
        y={PAD}
        width={PLOT_W}
        height={PLOT_H}
        fill="none"
        stroke="#243044"
        strokeWidth={1}
      />

      {/* Médianes de quadrants */}
      <line x1={midX} y1={PAD} x2={midX} y2={PAD + PLOT_H} stroke="#1a2029" strokeWidth={1} />
      <line x1={PAD} y1={midY} x2={PAD + PLOT_W} y2={midY} stroke="#1a2029" strokeWidth={1} />

      {/* Annotations sobres des quadrants */}
      <text x={PAD + 8} y={PAD + 14} fontSize={9.5} fill="#5c6b82">
        Gravité forte · probabilité faible
      </text>
      <text
        x={PAD + PLOT_W - 8}
        y={PAD + 14}
        fontSize={9.5}
        fill="#5c6b82"
        textAnchor="end"
      >
        Zone de vigilance prioritaire
      </text>
      <text x={PAD + 8} y={PAD + PLOT_H - 8} fontSize={9.5} fill="#5c6b82">
        Impact limité
      </text>
      <text
        x={PAD + PLOT_W - 8}
        y={PAD + PLOT_H - 8}
        fontSize={9.5}
        fill="#5c6b82"
        textAnchor="end"
      >
        Fréquent · gravité modérée
      </text>

      {/* Libellés d'axes */}
      <text
        x={PAD + PLOT_W / 2}
        y={VIEW_H - 12}
        fontSize={11}
        fontWeight={600}
        fill="#8a99af"
        textAnchor="middle"
      >
        Probabilité →
      </text>
      <text
        x={16}
        y={PAD + PLOT_H / 2}
        fontSize={11}
        fontWeight={600}
        fill="#8a99af"
        textAnchor="middle"
        transform={`rotate(-90 16 ${PAD + PLOT_H / 2})`}
      >
        Gravité →
      </text>

      {/* Bulles */}
      {bubbles.map((s) => {
        const cx = xOf(s.axes.probabilite.value);
        const cy = yOf(s.axes.gravite.value);
        const r = rOf(s.axes.exposition.value);
        const hex = BAND_HEX[s.criticityBand];
        return (
          <g
            key={s.cycleSlug}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(s.cycleSlug)}
          >
            <title>
              {`${s.cycleSlug}\nProbabilité ${Math.round(s.axes.probabilite.value)} · Gravité ${Math.round(
                s.axes.gravite.value,
              )} · Exposition ${Math.round(s.axes.exposition.value)}\nCriticité ${BAND_LABEL[s.criticityBand]}${
                s.composite !== null ? ` (${Math.round(s.composite)}/100, heuristique)` : ""
              }`}
            </title>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={`color-mix(in srgb, ${hex} 45%, transparent)`}
              stroke={hex}
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      <text x={PAD} y={PAD - 12} fontSize={9.5} fill="#5c6b82">
        Rayon ∝ exposition normative · heuristique interne, non opposable
      </text>
    </svg>
  );
}
