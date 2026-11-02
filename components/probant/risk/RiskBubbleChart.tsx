"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import type { CycleRiskScore } from "@/lib/risk-mapping";
import { BAND_LABEL, axisText, compositeText, gaugeWidth } from "@/lib/risk-mapping/view";
import { BAND_COLOR, BandMark } from "./BandMark";
import s from "./risk.module.css";

/**
 * Nuage de bulles Probabilité × Gravité. Chaque cycle évalué est une bulle :
 * abscisse = probabilité, ordonnée = gravité (axe écran inversé — gravité forte
 * en haut), rayon = exposition, luminosité = niveau du composite.
 *
 * Les valeurs proviennent des `CycleRiskScore` du moteur ; rien n'est inventé.
 * Les cycles « non évalués » (composite null) sont exclus du nuage : les placer
 * à l'origine suggérerait à tort un risque nul. Les quadrants sont annotés
 * sobrement (aide à la lecture, sans conclusion opposable) ; la zone de vigilance
 * prioritaire est un plan, pas un dégradé. Chaque bulle est un bouton (Tab, Entrée / Espace).
 */

interface RiskBubbleChartProps {
  scores: CycleRiskScore[];
  onSelect: (slug: string, trigger?: HTMLElement | SVGElement | null) => void;
  selected?: string | null;
}

const VIEW_W = 960;
const VIEW_H = 520;

// Cadre de plot.
const PLOT_X = 64;
const PLOT_Y = 34;
const PLOT_W = 836;
const PLOT_H = 420;

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

const MONO = { fontFamily: "var(--pb-font-mono)" } as const;

function bubbleName(sc: CycleRiskScore): string {
  return `${sc.cycleSlug}, niveau ${BAND_LABEL[sc.criticityBand].toLowerCase()}, composite ${compositeText(sc.composite)} sur 100 ; probabilité ${axisText(
    sc.axes.probabilite.value,
  )}, gravité ${axisText(sc.axes.gravite.value)}, exposition ${axisText(sc.axes.exposition.value)}`;
}

export function RiskBubbleChart({ scores, onSelect, selected = null }: RiskBubbleChartProps) {
  const bubbles = useMemo(() => scores.filter((sc) => sc.composite !== null), [scores]);
  const [hovered, setHovered] = useState<string | null>(null);
  const tip = useMemo(() => (hovered === null ? null : (bubbles.find((b) => b.cycleSlug === hovered) ?? null)), [hovered, bubbles]);

  function onKey(event: KeyboardEvent<SVGGElement>, slug: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(slug, event.currentTarget);
    }
  }

  const midX = xOf(50);
  const midY = yOf(50);

  return (
    <div role="region" aria-label="Nuage probabilité × gravité, défilement horizontal" tabIndex={0} className={s.chartRegion}>
      <div className={s.chartInner}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label="Nuage Probabilité × Gravité des cycles" className={s.chart}>
          <g aria-hidden="true">
            {/* Zone de vigilance prioritaire (probabilité et gravité ≥ 50) : un plan, sans dégradé. */}
            <rect x={midX} y={PLOT_Y} width={PLOT_X + PLOT_W - midX} height={midY - PLOT_Y} style={{ fill: "var(--pb-plane-2)" }} />

            {TICKS.map((t) => {
              const gx = xOf(t);
              const gy = yOf(t);
              const isEdge = t === 0 || t === 100;
              const stroke = isEdge ? "var(--pb-rule-strong)" : "var(--pb-rule)";
              const dash = isEdge ? undefined : "2 4";
              return (
                <g key={`grid-${t}`}>
                  <line x1={gx} y1={PLOT_Y} x2={gx} y2={PLOT_Y + PLOT_H} strokeWidth={1} strokeDasharray={dash} style={{ stroke }} />
                  <line x1={PLOT_X} y1={gy} x2={PLOT_X + PLOT_W} y2={gy} strokeWidth={1} strokeDasharray={dash} style={{ stroke }} />
                  <text x={gx} y={PLOT_Y + PLOT_H + 18} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: "var(--pb-ink-3)" }}>
                    {t}
                  </text>
                  <text x={PLOT_X - 10} y={gy + 4} textAnchor="end" fontSize={12} style={{ ...MONO, fill: "var(--pb-ink-3)" }}>
                    {t}
                  </text>
                </g>
              );
            })}

            {/* Annotations sobres des quadrants */}
            <text x={PLOT_X + 12} y={PLOT_Y + 20} fontSize={13} style={{ fill: "var(--pb-ink-3)" }}>
              Gravité forte · probabilité faible
            </text>
            <text x={PLOT_X + PLOT_W - 12} y={PLOT_Y + 20} fontSize={13} textAnchor="end" style={{ fill: "var(--pb-ink)" }}>
              Zone de vigilance prioritaire
            </text>
            <text x={PLOT_X + 12} y={PLOT_Y + PLOT_H - 12} fontSize={13} style={{ fill: "var(--pb-ink-3)" }}>
              Impact limité
            </text>
            <text x={PLOT_X + PLOT_W - 12} y={PLOT_Y + PLOT_H - 12} fontSize={13} textAnchor="end" style={{ fill: "var(--pb-ink-3)" }}>
              Fréquent · gravité modérée
            </text>

            {/* Libellés d'axes */}
            <text x={PLOT_X + PLOT_W / 2} y={VIEW_H - 14} fontSize={13} textAnchor="middle" style={{ fill: "var(--pb-ink-2)" }}>
              Probabilité →
            </text>
            <text
              x={22}
              y={PLOT_Y + PLOT_H / 2}
              fontSize={13}
              textAnchor="middle"
              transform={`rotate(-90 22 ${PLOT_Y + PLOT_H / 2})`}
              style={{ fill: "var(--pb-ink-2)" }}
            >
              Gravité →
            </text>
            <text x={PLOT_X} y={PLOT_Y - 14} fontSize={12} style={{ fill: "var(--pb-ink-3)" }}>
              Rayon ∝ exposition normative · heuristique interne, non opposable
            </text>
          </g>

          {/* Bulles : x = probabilité, y = gravité (inversé), r = exposition. */}
          {bubbles.map((sc, i) => {
            const cx = xOf(sc.axes.probabilite.value);
            const cy = yOf(sc.axes.gravite.value);
            const r = rOf(sc.axes.exposition.value);
            const color = BAND_COLOR[sc.criticityBand];
            const isHover = hovered === sc.cycleSlug;
            const isSelected = selected === sc.cycleSlug;
            return (
              <g
                key={sc.cycleSlug}
                transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
                role="button"
                tabIndex={0}
                aria-label={bubbleName(sc)}
                aria-current={isSelected ? "true" : undefined}
                className={s.node}
                onClick={(e) => onSelect(sc.cycleSlug, e.currentTarget)}
                onKeyDown={(e) => onKey(e, sc.cycleSlug)}
                onMouseEnter={() => setHovered(sc.cycleSlug)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(sc.cycleSlug)}
                onBlur={() => setHovered(null)}
              >
                <g style={{ animation: `pbNodeIn .45s cubic-bezier(.2,0,0,1) ${(0.15 + i * 0.03).toFixed(2)}s both` }}>
                  <circle
                    r={r}
                    strokeWidth={isHover || isSelected ? 2 : 1.2}
                    style={{
                      fill: color,
                      fillOpacity: isHover ? 0.55 : 0.32,
                      stroke: isSelected ? "var(--pb-verif)" : color,
                      transition: "fill-opacity .15s",
                    }}
                  />
                  <circle className={s.nodeFocus} r={r + 5} fill="none" strokeWidth={2} style={{ stroke: "var(--pb-verif)" }} />
                </g>
              </g>
            );
          })}

          {/* Libellé de la bulle survolée / focalisée seulement : les positions se regroupent fortement. */}
          {tip && (
            <text
              x={xOf(tip.axes.probabilite.value)}
              y={yOf(tip.axes.gravite.value) + rOf(tip.axes.exposition.value) + 18}
              textAnchor="middle"
              fontSize={14}
              aria-hidden="true"
              style={{ fill: "var(--pb-ink)", pointerEvents: "none", paintOrder: "stroke", stroke: "var(--pb-bg)", strokeWidth: 4 }}
            >
              {tip.cycleSlug}
            </text>
          )}
        </svg>

        {/* Carte au survol / focus : cycle, niveau, composite, trois jauges. */}
        {tip !== null && (
          <div className={s.card} style={{ right: 12 }} aria-hidden="true">
            <p className={s.cardTitle}>{tip.cycleSlug}</p>
            <p className={s.cardLine}>
              <BandMark band={tip.criticityBand} />
              <span>{tip.composite !== null ? `${compositeText(tip.composite)}/100` : "non chiffré"}</span>
            </p>
            <div className={s.cardList} style={{ marginTop: 8 }}>
              {(
                [
                  { label: "Probabilité", value: tip.axes.probabilite.value },
                  { label: "Gravité", value: tip.axes.gravite.value },
                  { label: "Exposition", value: tip.axes.exposition.value },
                ] as const
              ).map((row) => (
                <div key={row.label} className={s.miniRow}>
                  <span>{row.label}</span>
                  <span className={s.miniBar}>
                    <span style={{ width: `${gaugeWidth(row.value)}%` }} />
                  </span>
                  <span>{axisText(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
