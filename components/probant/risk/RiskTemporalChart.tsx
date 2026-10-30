"use client";

import { useMemo, useRef, useState } from "react";
import p from "@/components/charte/page.module.css";
import type { CycleRiskScore } from "@/lib/risk-mapping";
import { CURRENT_EXERCISE, isSimulatedExercise, simulateHistoricalComposite, type HistoricalExercise } from "@/lib/risk-mapping";
import { BAND_RANGE, compositeText, displayComposite } from "@/lib/risk-mapping/view";
import s from "./risk.module.css";

/**
 * Vue temporelle (Bloc 3) : évolution du composite de chaque cycle sélectionné
 * sur les trois exercices exposés par `lib/risk-mapping/historical.ts`.
 *
 * Seul `CURRENT_EXERCISE` (2024) est un exercice réel : sa valeur est le
 * composite réellement calculé. 2022/2023 sont ENTIÈREMENT SIMULÉS par
 * `simulateHistoricalComposite` (hash déterministe, jamais un vrai chiffre
 * d'audit) — les segments correspondants sont tracés en TIRETS dans une
 * zone hachurée, et un disclaimer permanent est affiché sous le graphique. Ce
 * composant ne calcule rien lui-même : il ne fait que projeter les
 * `CycleRiskScore` déjà produits par le moteur pur.
 *
 * Charte « instruments » : chaque série est distinguée par sa luminosité (encre, encre 2, encre 3) ET la forme de
 * ses repères (rond, carré, losange, triangle), reprise dans le sélecteur et l'étiquette de fin — jamais par la teinte
 * seule. Les bandes de criticité sont des filets tiretés nommés, sans aplat de couleur. L'export PNG sérialise le
 * <svg> avec ses couleurs résolues (les jetons de l'ambiance n'existent pas hors de la page).
 */

const EXERCISES: HistoricalExercise[] = [2022, 2023, CURRENT_EXERCISE];

type Marker = "circle" | "square" | "diamond" | "triangle";

/** Style de chaque série : luminosité + forme de repère (8 combinaisons distinctes). */
const SERIES_STYLE: { color: string; marker: Marker }[] = [
  { color: "var(--pb-ink)", marker: "circle" },
  { color: "var(--pb-ink-2)", marker: "square" },
  { color: "var(--pb-ink)", marker: "diamond" },
  { color: "var(--pb-ink-2)", marker: "triangle" },
  { color: "var(--pb-ink-3)", marker: "circle" },
  { color: "var(--pb-ink-3)", marker: "square" },
  { color: "var(--pb-ink-3)", marker: "diamond" },
  { color: "var(--pb-ink-3)", marker: "triangle" },
];

/** Nombre maximal de cycles affichables simultanément (lisibilité du graphe). */
const MAX_SELECTED = 8;

/** Bornes des bandes, lues dans la même source que la légende du registre. */
const BAND_LINES: { at: number; label: string }[] = [
  { at: BAND_RANGE.critique.min, label: "critique" },
  { at: BAND_RANGE.élevé.min, label: "élevé" },
  { at: BAND_RANGE.modéré.min, label: "modéré" },
];

// Géométrie du plot.
const VIEW_W = 960;
const VIEW_H = 420;
const PLOT_LEFT = 46;
const PLOT_RIGHT = 906;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 386;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

/** Graduations Y (repères de lecture 0-25-50-75-100). */
const Y_TICKS = [0, 25, 50, 75, 100] as const;

const MONO = { fontFamily: "var(--pb-font-mono)" } as const;

interface RiskTemporalChartProps {
  scores: CycleRiskScore[];
  cycles: string[];
}

/** Abscisse écran d'un exercice (2022 → gauche, 2024 → droite, réparti régulier). */
function xOfExercise(exercise: HistoricalExercise): number {
  const idx = EXERCISES.indexOf(exercise);
  if (EXERCISES.length <= 1) return PLOT_LEFT;
  return PLOT_LEFT + (idx / (EXERCISES.length - 1)) * PLOT_W;
}

/** Ordonnée écran d'une valeur composite (0-100), 0 en bas, 100 en haut. */
function yOfValue(value: number): number {
  return PLOT_BOTTOM - (Math.min(100, Math.max(0, value)) / 100) * PLOT_H;
}

function pointOf(exercise: HistoricalExercise, value: number): string {
  return `${xOfExercise(exercise).toFixed(1)},${yOfValue(value).toFixed(1)}`;
}

/** Chemin d'un repère centré en (0,0). */
function markerPath(marker: Marker, size: number): string {
  const h = size / 2;
  switch (marker) {
    case "square":
      return `M${-h} ${-h}h${size}v${size}h${-size}z`;
    case "diamond":
      return `M0 ${-h * 1.25}L${h * 1.25} 0L0 ${h * 1.25}L${-h * 1.25} 0z`;
    case "triangle":
      return `M0 ${-h * 1.2}L${h * 1.2} ${h}L${-h * 1.2} ${h}z`;
    default:
      return `M${-h} 0a${h} ${h} 0 1 0 ${size} 0a${h} ${h} 0 1 0 ${-size} 0`;
  }
}

function MarkerGlyph({ style }: { style: (typeof SERIES_STYLE)[number] }) {
  return (
    <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path d={markerPath(style.marker, 7)} style={{ fill: style.color }} />
    </svg>
  );
}

interface SeriesPoint {
  exercise: HistoricalExercise;
  value: number | null;
  simulated: boolean;
}

interface TemporalSeries {
  slug: string;
  style: (typeof SERIES_STYLE)[number];
  points: SeriesPoint[];
  /** Chemin du segment simulé (exercices ≤ 2023), tireté. */
  dSim: string;
  /** Chemin du segment réel (2023 → 2024), trait plein. */
  dReal: string;
  /** Valeur réelle courante (2024, entier affiché) et écart vs 2023 simulé, pour le libellé de fin. */
  endValue: number | null;
  endY: number | null;
  delta: number | null;
}

/** Copie du <svg> avec les couleurs, traits et polices résolus : l'image exportée ne connaît pas les jetons de la page. */
function resolvedClone(source: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const from = [source, ...Array.from(source.querySelectorAll<SVGElement>("*"))];
  const to = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];
  const props = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "letter-spacing"];
  from.forEach((el, i) => {
    const target = to[i];
    if (!target) return;
    const cs = getComputedStyle(el);
    for (const prop of props) target.style.setProperty(prop, cs.getPropertyValue(prop));
    target.style.setProperty("animation", "none");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return clone;
}

export function RiskTemporalChart({ scores, cycles }: RiskTemporalChartProps) {
  const scoreBySlug = useMemo(() => {
    const map = new Map<string, CycleRiskScore>();
    for (const sc of scores) map.set(sc.cycleSlug, sc);
    return map;
  }, [scores]);

  // Sélection par défaut : les 4 premiers cycles évalués (ordre stable des props).
  const defaultSelection = useMemo(() => cycles.filter((slug) => scoreBySlug.get(slug)?.composite != null).slice(0, 4), [cycles, scoreBySlug]);

  const [selectedCycles, setSelectedCycles] = useState<string[]>(defaultSelection);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  function toggleCycle(slug: string) {
    setSelectedCycles((prev) => {
      if (prev.includes(slug)) return prev.filter((x) => x !== slug);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, slug];
    });
  }

  // Chaque cycle → une série : points sur les 3 exercices, chemin simulé
  // (≤ 2023, dupliqué à la jonction 2023) et chemin réel (2023 → 2024). Rien
  // n'est recalculé ici : on projette `simulateHistoricalComposite` (2022/2023
  // déterministe, 2024 = composite réel du moteur, affiché en partie entière).
  const series: TemporalSeries[] = useMemo(
    () =>
      selectedCycles.map((slug, i) => {
        const style = SERIES_STYLE[i % SERIES_STYLE.length];
        const current = scoreBySlug.get(slug)?.composite ?? null;
        const points: SeriesPoint[] = EXERCISES.map((exercise) => ({
          exercise,
          value: simulateHistoricalComposite(slug, current, exercise),
          simulated: isSimulatedExercise(exercise),
        }));

        const simPts = points.filter((pt) => pt.exercise <= 2023 && pt.value !== null).map((pt) => pointOf(pt.exercise, pt.value as number));
        const dSim = simPts.length >= 2 ? `M${simPts.join(" L")}` : "";

        const realPts = points.filter((pt) => pt.exercise >= 2023 && pt.value !== null).map((pt) => pointOf(pt.exercise, pt.value as number));
        const dReal = realPts.length >= 2 ? `M${realPts.join(" L")}` : "";

        const endRaw = points.find((pt) => pt.exercise === CURRENT_EXERCISE)?.value ?? null;
        const endValue = displayComposite(endRaw);
        const prevValue = points.find((pt) => pt.exercise === 2023)?.value ?? null;
        const delta = endValue !== null && prevValue !== null ? endValue - prevValue : null;

        return { slug, style, points, dSim, dReal, endValue, endY: endRaw !== null ? yOfValue(endRaw) : null, delta };
      }),
    [selectedCycles, scoreBySlug],
  );

  const hasSelection = selectedCycles.length > 0;

  // Résumé textuel alternatif (sr-only) : le SVG n'est pas lisible par un lecteur d'écran.
  const textSummary = useMemo(() => {
    if (!hasSelection) return "";
    const lines = series.map((sr) => {
      const pts = sr.points.map((pt) => {
        const suffix = pt.simulated ? " (simulé)" : " (réel)";
        const reading = typeof pt.value === "number" ? `${compositeText(pt.value)}/100` : "non évalué";
        return `${pt.exercise}${suffix} : ${reading}`;
      });
      return `${sr.slug} — ${pts.join(", ")}`;
    });
    return `Évolution du composite pour ${selectedCycles.length} cycle(s) sur ${EXERCISES.length} exercices (2022 et 2023 simulés, ${CURRENT_EXERCISE} réel). ${lines.join(" · ")}.`;
  }, [hasSelection, series, selectedCycles.length]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    let best = Infinity;
    EXERCISES.forEach((ex, idx) => {
      const d = Math.abs(xOfExercise(ex) - vx);
      if (d < best) {
        best = d;
        nearest = idx;
      }
    });
    setHoverIdx(nearest);
  }

  const hoverExercise = hoverIdx !== null ? EXERCISES[hoverIdx] : null;
  const hoverX = hoverExercise !== null ? xOfExercise(hoverExercise) : null;
  const hoverRows = useMemo(() => {
    if (hoverExercise === null) return [];
    return series
      .map((sr) => ({ slug: sr.slug, style: sr.style, value: sr.points.find((pt) => pt.exercise === hoverExercise)?.value ?? null }))
      .filter((r) => r.value !== null);
  }, [hoverExercise, series]);

  function exportPng() {
    const svg = svgRef.current;
    const wrapper = chartWrapperRef.current;
    if (!svg || !wrapper) return;

    const rect = svg.getBoundingClientRect();
    const width = rect.width || VIEW_W;
    const height = rect.height || VIEW_H;
    const svgString = new XMLSerializer().serializeToString(resolvedClone(svg, width, height));
    const url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
    const background = getComputedStyle(wrapper).getPropertyValue("--pb-bg").trim() || "#111214";

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Facteur d'échelle pour un export plus net qu'un rendu écran 1:1.
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.scale(scale, scale);
      // Fond opaque : le SVG n'a pas de fond propre exportable.
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "cartographie-risques-vue-temporelle.png";
      link.click();
    };
    img.src = url;
  }

  const simZoneX = xOfExercise(2022);
  const simZoneW = xOfExercise(2023) - simZoneX;

  return (
    <div>
      <div className={s.seriesHead}>
        <span className={p.key}>
          Cycles affichés <span className={p.mono}>{selectedCycles.length}/{MAX_SELECTED}</span>
        </span>
        <button type="button" onClick={exportPng} disabled={!hasSelection} className={p.btnSecondary}>
          Exporter en PNG
        </button>
      </div>
      <div className={s.seriesPicker} role="group" aria-label={`Cycles à afficher, ${MAX_SELECTED} au plus`}>
        {cycles.map((slug) => {
          const index = selectedCycles.indexOf(slug);
          const active = index >= 0;
          const disabled = !active && selectedCycles.length >= MAX_SELECTED;
          return (
            <button key={slug} type="button" className={p.toggle} onClick={() => toggleCycle(slug)} disabled={disabled} aria-pressed={active}>
              <span className={s.seriesToggle}>
                {active && <MarkerGlyph style={SERIES_STYLE[index % SERIES_STYLE.length]} />}
                {slug}
              </span>
            </button>
          );
        })}
      </div>

      {hasSelection ? (
        <div role="region" aria-label="Évolution du composite, défilement horizontal" tabIndex={0} className={s.chartRegion}>
          <div ref={chartWrapperRef} className={`${s.chartInner} ${s.temporalInner}`}>
            {/* Résumé texte équivalent pour lecteur d'écran (le SVG est aria-hidden). */}
            <p className="sr-only">{textSummary}</p>

            {/* Le tracé laisse une marge à droite pour les libellés de fin de série (HTML). */}
            <div className={s.plotArea}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              aria-hidden="true"
              className={s.chart}
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                {/* Hachure diagonale de la zone simulée (2022→2023). */}
                <pattern id="pbSimHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="1.2" height="7" style={{ fill: "var(--pb-rule-strong)" }} />
                </pattern>
              </defs>

              {/* Zone simulée hachurée (2022 → 2023) + libellé. */}
              <rect x={simZoneX} y={PLOT_TOP} width={simZoneW} height={PLOT_H} fill="url(#pbSimHatch)" />
              <text x={simZoneX + simZoneW / 2} y={PLOT_TOP + 16} fontSize={12} textAnchor="middle" letterSpacing={1} style={{ ...MONO, fill: "var(--pb-ink-3)" }}>
                ZONE SIMULÉE
              </text>

              {/* Grille horizontale + graduations Y. */}
              {Y_TICKS.map((t) => {
                const gy = yOfValue(t);
                return (
                  <g key={`y-${t}`}>
                    <line x1={PLOT_LEFT} y1={gy} x2={PLOT_RIGHT} y2={gy} strokeWidth={1} style={{ stroke: "var(--pb-rule)" }} />
                    <text x={PLOT_LEFT - 8} y={gy + 4} fontSize={12} textAnchor="end" style={{ ...MONO, fill: "var(--pb-ink-3)" }}>
                      {t}
                    </text>
                  </g>
                );
              })}

              {/* Bornes des bandes de criticité : filets tiretés nommés (aucun aplat). */}
              {BAND_LINES.map((b) => {
                const gy = yOfValue(b.at);
                return (
                  <g key={b.label}>
                    <line x1={PLOT_LEFT} y1={gy} x2={PLOT_RIGHT} y2={gy} strokeWidth={1} strokeDasharray="4 4" style={{ stroke: "var(--pb-rule-strong)" }} />
                    <text x={PLOT_RIGHT - 6} y={gy - 6} fontSize={12} textAnchor="end" style={{ ...MONO, fill: "var(--pb-ink-3)" }}>
                      {b.label} ≥ {b.at}
                    </text>
                  </g>
                );
              })}

              {/* Axe X : ticks + années (l'exercice réel en encre pleine). */}
              {EXERCISES.map((ex) => {
                const gx = xOfExercise(ex);
                const isCurrent = ex === CURRENT_EXERCISE;
                return (
                  <g key={`x-${ex}`}>
                    <line x1={gx} y1={PLOT_BOTTOM} x2={gx} y2={PLOT_BOTTOM + 6} strokeWidth={1} style={{ stroke: "var(--pb-rule-strong)" }} />
                    <text x={gx} y={PLOT_BOTTOM + 22} fontSize={13} textAnchor="middle" style={{ ...MONO, fill: isCurrent ? "var(--pb-ink)" : "var(--pb-ink-3)" }}>
                      {ex}
                      {isCurrent ? " réel" : " simulé"}
                    </text>
                  </g>
                );
              })}

              {/* Crosshair au survol (sous les tracés). */}
              {hoverX !== null && <line x1={hoverX} y1={PLOT_TOP} x2={hoverX} y2={PLOT_BOTTOM} strokeWidth={1} style={{ stroke: "var(--pb-ink-3)" }} />}

              {/* Séries : segment simulé tireté + segment réel plein + repères. */}
              {series.map((sr, si) => (
                <g key={sr.slug}>
                  {sr.dSim && <path d={sr.dSim} fill="none" strokeWidth={1.6} strokeDasharray="6 5" style={{ stroke: sr.style.color, animation: "pbFadeIn .7s ease both" }} />}
                  {sr.dReal && (
                    <path
                      d={sr.dReal}
                      fill="none"
                      strokeWidth={2}
                      strokeLinecap="round"
                      pathLength={1}
                      style={{ stroke: sr.style.color, strokeDasharray: 1, animation: `pbDraw .8s ease ${(0.2 + si * 0.08).toFixed(2)}s both` }}
                    />
                  )}
                  {sr.points.map((pt) =>
                    pt.value === null ? null : (
                      <path
                        key={`${sr.slug}-${pt.exercise}`}
                        d={markerPath(sr.style.marker, pt.simulated ? 6 : 8)}
                        transform={`translate(${xOfExercise(pt.exercise).toFixed(1)} ${yOfValue(pt.value).toFixed(1)})`}
                        strokeWidth={pt.simulated ? 0 : 1.4}
                        style={{ fill: sr.style.color, stroke: "var(--pb-bg)", animation: "pbFadeIn .5s ease both" }}
                      />
                    ),
                  )}
                </g>
              ))}
            </svg>

            {/* Libellés de fin de série (HTML) : repère, cycle, valeur réelle, écart vs 2023 simulé. */}
            <div className={s.endLabels} aria-hidden="true">
              {series.map((sr) => {
                if (sr.endValue === null || sr.endY === null) return null;
                return (
                  <div key={`end-${sr.slug}`} className={s.endLabel} style={{ left: `${(PLOT_RIGHT / VIEW_W) * 100}%`, top: `${(sr.endY / VIEW_H) * 100}%` }}>
                    <MarkerGlyph style={sr.style} />
                    <span>{sr.slug}</span>
                    <span className={s.endValue}>{sr.endValue}</span>
                    {sr.delta !== null && sr.delta !== 0 && <span className={s.ref}>{sr.delta > 0 ? `+${sr.delta}` : `−${Math.abs(sr.delta)}`}</span>}
                  </div>
                );
              })}
            </div>
            </div>

            {/* Carte au survol : valeurs de chaque cycle à l'exercice pointé. */}
            {hoverExercise !== null && hoverRows.length > 0 && (
              <div className={s.card} style={hoverIdx !== null && hoverIdx >= EXERCISES.length - 1 ? { left: 14 } : { right: 14 }} aria-hidden="true">
                <p className={s.cardTitle}>
                  Exercice {hoverExercise} {isSimulatedExercise(hoverExercise) ? "(simulé)" : "(réel)"}
                </p>
                <ul className={s.cardList}>
                  {hoverRows.map((r) => (
                    <li key={r.slug}>
                      <MarkerGlyph style={r.style} />
                      <span>{r.slug}</span>
                      <span className={s.endValue}>{compositeText(r.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={s.emptyChart}>Sélectionnez au moins un cycle pour afficher son évolution.</div>
      )}

      <p className={p.note}>
        <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
          <line x1="0" y1="3" x2="22" y2="3" strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: "var(--pb-ink-2)" }} />
        </svg>
        <span>
          <strong className={p.soft}>2022 et 2023 sont entièrement simulés</strong> (variation déterministe autour du composite réel,
          aucun dossier ne les a produits) — seul l&apos;exercice {CURRENT_EXERCISE} est un exercice réel. Les segments simulés sont
          tracés en tirets pour rappeler cette nature ; le composite reste une heuristique interne non opposable.
        </span>
      </p>
    </div>
  );
}
