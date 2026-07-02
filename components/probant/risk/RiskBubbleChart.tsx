"use client";

import { useMemo, useState } from "react";
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

const VIEW_W = 960;
const VIEW_H = 520;

// Cadre de plot (aligné sur la maquette v2).
const PLOT_X = 64;
const PLOT_Y = 30;
const PLOT_W = 836;
const PLOT_H = 424;

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
  return PLOT_X + (Math.min(100, Math.max(0, probabilite)) / 100) * PLOT_W;
}

/** Ordonnée écran depuis la gravité (0-100), axe inversé (fort = haut). */
function yOf(gravite: number): number {
  return PLOT_Y + (1 - Math.min(100, Math.max(0, gravite)) / 100) * PLOT_H;
}

/** Rayon depuis l'exposition (0-100). */
function rOf(exposition: number): number {
  return 9 + (Math.min(100, Math.max(0, exposition)) / 100) * 24;
}

/** Graduations 0-25-50-75-100 sur les deux axes (repères de lecture). */
const TICKS = [0, 25, 50, 75, 100] as const;

export function RiskBubbleChart({ scores, onSelect }: RiskBubbleChartProps) {
  const bubbles = useMemo(
    () => scores.filter((s) => s.composite !== null),
    [scores],
  );

  const [hovered, setHovered] = useState<string | null>(null);

  const tip = useMemo(() => {
    if (hovered === null) return null;
    return bubbles.find((b) => b.cycleSlug === hovered) ?? null;
  }, [hovered, bubbles]);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 12,
        border: "1px solid var(--pb-border-soft)",
        background: "var(--pb-surface-inset)",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label="Nuage Probabilité × Gravité des cycles"
        style={{ display: "block" }}
      >
        <defs>
          {/* Dégradé radial 'zone de vigilance prioritaire' (haut-droite). */}
          <radialGradient id="pbVigilance" cx="92%" cy="8%" r="85%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.13} />
            <stop offset="55%" stopColor="#ef4444" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Halo de vigilance derrière la grille */}
        <rect
          x={PLOT_X}
          y={PLOT_Y}
          width={PLOT_W}
          height={PLOT_H}
          fill="url(#pbVigilance)"
        />

        {/* Grille + graduations */}
        {TICKS.map((t) => {
          const gx = xOf(t);
          const gy = yOf(t);
          const isEdge = t === 0 || t === 100;
          const stroke = isEdge ? "var(--pb-border)" : "var(--pb-border-soft)";
          const dash = isEdge ? undefined : "2 4";
          return (
            <g key={`grid-${t}`}>
              {/* Verticale (axe probabilité) */}
              <line
                x1={gx}
                y1={PLOT_Y}
                x2={gx}
                y2={PLOT_Y + PLOT_H}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray={dash}
              />
              {/* Horizontale (axe gravité) */}
              <line
                x1={PLOT_X}
                y1={gy}
                x2={PLOT_X + PLOT_W}
                y2={gy}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray={dash}
              />
              {/* Graduation X (sous le plot) */}
              <text
                x={gx}
                y={PLOT_Y + PLOT_H + 15}
                textAnchor="middle"
                fontSize={9}
                fill="var(--pb-text-faint)"
                fontFamily="'JetBrains Mono', monospace"
              >
                {t}
              </text>
              {/* Graduation Y (à gauche du plot) */}
              <text
                x={PLOT_X - 8}
                y={gy + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--pb-text-faint)"
                fontFamily="'JetBrains Mono', monospace"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Cadre du plot (au-dessus de la grille) */}
        <rect
          x={PLOT_X}
          y={PLOT_Y}
          width={PLOT_W}
          height={PLOT_H}
          fill="none"
          stroke="var(--pb-border)"
          strokeWidth={1}
        />

        {/* Annotations sobres des quadrants */}
        <text x={PLOT_X + 10} y={PLOT_Y + 16} fontSize={9.5} fill="var(--pb-text-faint)">
          Gravité forte · probabilité faible
        </text>
        <text
          x={PLOT_X + PLOT_W - 10}
          y={PLOT_Y + 16}
          fontSize={9.5}
          fill="var(--pb-text-muted)"
          textAnchor="end"
          fontWeight={600}
        >
          Zone de vigilance prioritaire
        </text>
        <text x={PLOT_X + 10} y={PLOT_Y + PLOT_H - 10} fontSize={9.5} fill="var(--pb-text-faint)">
          Impact limité
        </text>
        <text
          x={PLOT_X + PLOT_W - 10}
          y={PLOT_Y + PLOT_H - 10}
          fontSize={9.5}
          fill="var(--pb-text-faint)"
          textAnchor="end"
        >
          Fréquent · gravité modérée
        </text>

        {/* Libellés d'axes */}
        <text
          x={PLOT_X + PLOT_W / 2}
          y={VIEW_H - 16}
          fontSize={11}
          fontWeight={600}
          fill="var(--pb-text-muted)"
          textAnchor="middle"
        >
          Probabilité →
        </text>
        <text
          x={22}
          y={PLOT_Y + PLOT_H / 2}
          fontSize={11}
          fontWeight={600}
          fill="var(--pb-text-muted)"
          textAnchor="middle"
          transform={`rotate(-90 22 ${PLOT_Y + PLOT_H / 2})`}
        >
          Gravité →
        </text>

        {/* Bulles : x=probabilité, y=gravité (inversé), r=exposition.
            Triple <g> : position (translate) → pop-in (pbNodeIn) → flottement
            (pbFloat), pour que scale/float pivotent autour du centre local. */}
        {bubbles.map((s, i) => {
          const cx = xOf(s.axes.probabilite.value);
          const cy = yOf(s.axes.gravite.value);
          const r = rOf(s.axes.exposition.value);
          const hex = BAND_HEX[s.criticityBand];
          const isHover = hovered === s.cycleSlug;
          return (
            <g
              key={s.cycleSlug}
              transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(s.cycleSlug)}
              onMouseEnter={() => setHovered(s.cycleSlug)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>
                {`${s.cycleSlug}\nProbabilité ${Math.round(s.axes.probabilite.value)} · Gravité ${Math.round(
                  s.axes.gravite.value,
                )} · Exposition ${Math.round(s.axes.exposition.value)}\nCriticité ${BAND_LABEL[s.criticityBand]}${
                  s.composite !== null ? ` (${Math.round(s.composite)}/100, heuristique)` : ""
                }`}
              </title>
              <g
                style={{
                  animation: `pbNodeIn .5s cubic-bezier(.34,1.56,.64,1) ${(0.15 + i * 0.04).toFixed(2)}s both`,
                }}
              >
                <g
                  style={{
                    animation: `pbFloat ${(4.5 + (i % 5) * 0.4).toFixed(1)}s ease-in-out ${(i * 0.3).toFixed(1)}s infinite`,
                  }}
                >
                  {/* Disque principal */}
                  <circle
                    r={r}
                    fill={`color-mix(in srgb, ${hex} ${isHover ? 62 : 45}%, transparent)`}
                    stroke={hex}
                    strokeWidth={isHover ? 2 : 1.5}
                    style={{ transition: "fill .15s, stroke-width .15s" }}
                  />
                  {/* Anneau pointillé */}
                  <circle
                    r={r + 5}
                    fill="none"
                    stroke={`color-mix(in srgb, ${hex} ${isHover ? 70 : 42}%, transparent)`}
                    strokeWidth={1.2}
                    strokeDasharray="2 3"
                    style={{ transition: "stroke .15s" }}
                  />
                </g>
              </g>
            </g>
          );
        })}

        {/* Labels de bulles (au-dessus, halo stroke pour lisibilité) */}
        {bubbles.map((s) => {
          const cx = xOf(s.axes.probabilite.value);
          const cy = yOf(s.axes.gravite.value);
          const r = rOf(s.axes.exposition.value);
          return (
            <text
              key={`lbl-${s.cycleSlug}`}
              x={cx}
              y={cy + r + 13}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="var(--pb-text-bright)"
              style={{
                pointerEvents: "none",
                paintOrder: "stroke",
                stroke: "var(--pb-surface-inset)",
                strokeWidth: "3px",
              }}
            >
              {s.cycleSlug}
            </text>
          );
        })}

        <text x={PLOT_X} y={PLOT_Y - 12} fontSize={9.5} fill="var(--pb-text-faint)">
          Rayon ∝ exposition normative · heuristique interne, non opposable
        </text>
      </svg>

      {/* Tooltip au survol : slug, chip de bande, composite, mini-barres. */}
      {tip !== null && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 200,
            padding: "9px 11px",
            borderRadius: 10,
            border: "1px solid var(--pb-border-strong)",
            background: "color-mix(in srgb, var(--pb-surface-2) 96%, transparent)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            pointerEvents: "none",
            animation: "pbFadeIn .15s ease both",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--pb-text)",
              wordBreak: "break-all",
            }}
          >
            {tip.cycleSlug}
          </div>
          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                padding: "1px 7px",
                borderRadius: 99,
                color: BAND_HEX[tip.criticityBand],
                background: `color-mix(in srgb, ${BAND_HEX[tip.criticityBand]} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${BAND_HEX[tip.criticityBand]} 45%, transparent)`,
              }}
            >
              {BAND_LABEL[tip.criticityBand]}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--pb-text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tip.composite !== null
                ? `${Math.round(tip.composite)}/100`
                : "non chiffré"}
            </span>
          </div>
          <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
            {(
              [
                { label: "Probabilité", value: tip.axes.probabilite.value },
                { label: "Gravité", value: tip.axes.gravite.value },
                { label: "Exposition", value: tip.axes.exposition.value },
              ] as const
            ).map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 10,
                  color: "var(--pb-text-muted)",
                }}
              >
                <span style={{ width: 64, flexShrink: 0 }}>{row.label}</span>
                <span
                  style={{
                    display: "block",
                    flex: 1,
                    height: 3,
                    borderRadius: 99,
                    background: "var(--pb-track)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${Math.min(100, Math.max(0, row.value))}%`,
                      borderRadius: 99,
                      background: BAND_HEX[tip.criticityBand],
                    }}
                  />
                </span>
                <span
                  style={{
                    width: 22,
                    textAlign: "right",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--pb-text-bright)",
                  }}
                >
                  {Math.round(row.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
