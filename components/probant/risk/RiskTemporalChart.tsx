"use client";

import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { CriticityBand, CycleRiskScore } from "@/lib/risk-mapping";
import {
  CURRENT_EXERCISE,
  isSimulatedExercise,
  simulateHistoricalComposite,
  type HistoricalExercise,
} from "@/lib/risk-mapping";

/**
 * Vue temporelle (Bloc 3) : évolution du composite de chaque cycle sélectionné
 * sur les trois exercices exposés par `lib/risk-mapping/historical.ts`.
 *
 * Seul `CURRENT_EXERCISE` (2024) est un exercice réel : sa valeur est le
 * composite réellement calculé. 2022/2023 sont ENTIÈREMENT SIMULÉS par
 * `simulateHistoricalComposite` (hash déterministe, jamais un vrai chiffre
 * d'audit) — les segments correspondants sont tracés en POINTILLÉ dans une
 * zone hachurée, et un disclaimer permanent est affiché sous le graphique. Ce
 * composant ne calcule rien lui-même : il ne fait que projeter les
 * `CycleRiskScore` déjà produits par le moteur pur.
 *
 * Rendu SVG custom (v2) : recharts ne permet pas les bandes de criticité de
 * fond, la zone simulée hachurée, le tracé réel animé (`pathLength`) ni le
 * crosshair fidèles à la maquette. L'export PNG (sérialisation du <svg>) reste
 * inchangé.
 */

const EXERCISES: HistoricalExercise[] = [2022, 2023, CURRENT_EXERCISE];

/** Palette cyclique pour les séries (une couleur par cycle affiché). */
const LINE_COLORS = [
  "#38bdf8",
  "#f97316",
  "#a78bfa",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#ec4899",
  "#14b8a6",
];

/** Nombre maximal de cycles affichables simultanément (lisibilité du graphe). */
const MAX_SELECTED = 8;

/** Couleur sémantique de chaque bande de criticité (identique aux autres vues v2). */
const BAND_HEX: Record<CriticityBand, string> = {
  critique: "#ef4444",
  élevé: "#f97316",
  modéré: "#eab308",
  faible: "#3b82f6",
  non_évalué: "#5c6b82",
};

/**
 * Bandes de criticité tracées en fond du graphe : bornes alignées sur
 * `criticityBand` (scoring.ts) — faible [0,25[, modéré [25,55[, élevé [55,75[,
 * critique [75,100].
 */
const CRITICITY_BANDS: { band: CriticityBand; from: number; to: number; label: string }[] = [
  { band: "critique", from: 75, to: 100, label: "critique" },
  { band: "élevé", from: 55, to: 75, label: "élevé" },
  { band: "modéré", from: 25, to: 55, label: "modéré" },
  { band: "faible", from: 0, to: 25, label: "faible" },
];

// Géométrie du plot (viewBox aligné sur la maquette v2).
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

/** Point (x,y) d'un exercice pour une valeur donnée, arrondi pour un `d` propre. */
function pointOf(exercise: HistoricalExercise, value: number): string {
  return `${xOfExercise(exercise).toFixed(1)},${yOfValue(value).toFixed(1)}`;
}

interface SeriesPoint {
  exercise: HistoricalExercise;
  value: number | null;
  simulated: boolean;
}

interface TemporalSeries {
  slug: string;
  color: string;
  points: SeriesPoint[];
  /** Chemin du segment simulé (exercices ≤ 2023), pointillé. */
  dSim: string;
  /** Chemin du segment réel (2023 → 2024), trait plein animé. */
  dReal: string;
  /** Valeur réelle courante (2024) et delta vs. 2023 simulé, pour le label de fin. */
  endValue: number | null;
  endY: number | null;
  delta: number | null;
}

export function RiskTemporalChart({ scores, cycles }: RiskTemporalChartProps) {
  const scoreBySlug = useMemo(() => {
    const map = new Map<string, CycleRiskScore>();
    for (const s of scores) map.set(s.cycleSlug, s);
    return map;
  }, [scores]);

  // Sélection par défaut : les 4 premiers cycles évalués (ordre stable des props).
  const defaultSelection = useMemo(() => {
    const evaluated = cycles.filter((slug) => scoreBySlug.get(slug)?.composite != null);
    return evaluated.slice(0, 4);
  }, [cycles, scoreBySlug]);

  const [selectedCycles, setSelectedCycles] = useState<string[]>(defaultSelection);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  function toggleCycle(slug: string) {
    setSelectedCycles((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, slug];
    });
  }

  // Chaque cycle → une série : points sur les 3 exercices, chemin simulé
  // (≤ 2023, dupliqué à la jonction 2023) et chemin réel (2023 → 2024). Rien
  // n'est recalculé ici : on projette `simulateHistoricalComposite` (2022/2023
  // déterministe, 2024 = composite réel du moteur).
  const series: TemporalSeries[] = useMemo(
    () =>
      selectedCycles.map((slug, i) => {
        const color = LINE_COLORS[i % LINE_COLORS.length];
        const current = scoreBySlug.get(slug)?.composite ?? null;
        const points: SeriesPoint[] = EXERCISES.map((exercise) => ({
          exercise,
          value: simulateHistoricalComposite(slug, current, exercise),
          simulated: isSimulatedExercise(exercise),
        }));

        // Segment simulé : exercices ≤ 2023 (inclut la jonction 2023).
        const simPts = points
          .filter((p) => p.exercise <= 2023 && p.value !== null)
          .map((p) => pointOf(p.exercise, p.value as number));
        const dSim = simPts.length >= 2 ? `M${simPts.join(" L")}` : "";

        // Segment réel : exercices ≥ 2023 (jonction 2023 → 2024 réel).
        const realPts = points
          .filter((p) => p.exercise >= 2023 && p.value !== null)
          .map((p) => pointOf(p.exercise, p.value as number));
        const dReal = realPts.length >= 2 ? `M${realPts.join(" L")}` : "";

        const endValue = points.find((p) => p.exercise === CURRENT_EXERCISE)?.value ?? null;
        const prevValue = points.find((p) => p.exercise === 2023)?.value ?? null;
        const delta =
          endValue !== null && prevValue !== null ? endValue - prevValue : null;

        return {
          slug,
          color,
          points,
          dSim,
          dReal,
          endValue,
          endY: endValue !== null ? yOfValue(endValue) : null,
          delta,
        };
      }),
    [selectedCycles, scoreBySlug],
  );

  const hasSelection = selectedCycles.length > 0;

  // Résumé textuel alternatif (sr-only) : le SVG n'est pas nativement lisible
  // par un lecteur d'écran, donc on relit `series` (déjà calculé, aucune valeur
  // recalculée ni inventée) pour produire une description équivalente.
  const textSummary = useMemo(() => {
    if (!hasSelection) return "";
    const lines = series.map((s) => {
      const points = s.points.map((p) => {
        const suffix = p.simulated ? " (simulé)" : " (réel)";
        const reading = typeof p.value === "number" ? `${Math.round(p.value)}/100` : "non évalué";
        return `${p.exercise}${suffix} : ${reading}`;
      });
      return `${s.slug} — ${points.join(", ")}`;
    });
    return `Évolution du composite pour ${selectedCycles.length} cycle(s) sur ${EXERCISES.length} exercices (2022 et 2023 simulés, ${CURRENT_EXERCISE} réel). ${lines.join(" · ")}.`;
  }, [hasSelection, series, selectedCycles.length]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    // Position du curseur ramenée dans le repère du viewBox.
    const vx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    // Exercice le plus proche.
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
      .map((s) => ({
        slug: s.slug,
        color: s.color,
        value: s.points.find((p) => p.exercise === hoverExercise)?.value ?? null,
      }))
      .filter((r) => r.value !== null);
  }, [hoverExercise, series]);

  function exportPng() {
    const svg = chartWrapperRef.current?.querySelector("svg");
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const rect = svg.getBoundingClientRect();
    const width = rect.width || VIEW_W;
    const height = rect.height || VIEW_H;

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
      ctx.fillStyle = "#0b0f17";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "cartographie-risques-vue-temporelle.png";
      link.click();
    };
    img.src = url;
  }

  // Abscisse (en %) de la zone simulée : de 2022 à 2023.
  const simZoneX = xOfExercise(2022);
  const simZoneW = xOfExercise(2023) - simZoneX;

  return (
    <div className="flex flex-col gap-3">
      {/* En-tête : compteur, export, chips de sélection des cycles */}
      <div
        style={{
          borderRadius: 11,
          border: "1px solid var(--pb-border-soft)",
          background: "var(--pb-surface-inset)",
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--pb-text-faint)" }}>
            Cycles affichés {selectedCycles.length}/{MAX_SELECTED}
          </span>
          <button
            type="button"
            onClick={exportPng}
            disabled={!hasSelection}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: "var(--pb-border)",
              background: "transparent",
              color: "var(--pb-text-muted)",
            }}
            onMouseEnter={(e) => {
              if (hasSelection) {
                e.currentTarget.style.background = "var(--pb-surface-3)";
                e.currentTarget.style.color = "var(--pb-text)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--pb-text-muted)";
            }}
          >
            <Download className="h-3 w-3" />
            Exporter en PNG
          </button>
        </div>
        <div
          className="pb-scroll"
          style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 88, overflowY: "auto" }}
        >
          {cycles.map((slug) => {
            const active = selectedCycles.includes(slug);
            const disabled = !active && selectedCycles.length >= MAX_SELECTED;
            const color = LINE_COLORS[selectedCycles.indexOf(slug) % LINE_COLORS.length];
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleCycle(slug)}
                disabled={disabled}
                aria-pressed={active}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 8,
                  border: `1px solid ${
                    active
                      ? "color-mix(in srgb, var(--pb-accent) 60%, transparent)"
                      : "var(--pb-border)"
                  }`,
                  background: active
                    ? "color-mix(in srgb, var(--pb-accent) 12%, transparent)"
                    : "transparent",
                  padding: "3px 9px",
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: active ? "var(--pb-text)" : "var(--pb-text-muted)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  transition: "background .15s, border-color .15s, color .15s",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: active ? color : "var(--pb-border-strong)",
                  }}
                />
                {slug}
              </button>
            );
          })}
        </div>
      </div>

      {/* Graphique */}
      {hasSelection ? (
        <div
          ref={chartWrapperRef}
          style={{
            position: "relative",
            borderRadius: 12,
            border: "1px solid var(--pb-border-soft)",
            background: "var(--pb-surface-inset)",
            padding: "10px 6px 4px",
          }}
        >
          {/* Résumé texte équivalent pour lecteur d'écran (le SVG est aria-hidden). */}
          <p className="sr-only">{textSummary}</p>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            aria-hidden="true"
            style={{ display: "block" }}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              {/* Hachure diagonale de la zone simulée (2022→2023). */}
              <pattern
                id="pbSimHatch"
                width="7"
                height="7"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="7" height="7" fill="transparent" />
                <rect width="1.5" height="7" fill="var(--pb-track)" />
              </pattern>
            </defs>

            {/* Bandes de criticité en fond (rect translucides par plage). */}
            {CRITICITY_BANDS.map((b) => {
              const yTop = yOfValue(b.to);
              const yBottom = yOfValue(b.from);
              const hex = BAND_HEX[b.band];
              return (
                <g key={b.band}>
                  <rect
                    x={PLOT_LEFT}
                    y={yTop}
                    width={PLOT_W}
                    height={yBottom - yTop}
                    fill={`color-mix(in srgb, ${hex} 7%, transparent)`}
                  />
                  <text
                    x={PLOT_RIGHT - 6}
                    y={yTop + 11}
                    fontSize={8.5}
                    fontWeight={600}
                    fill={`color-mix(in srgb, ${hex} 62%, transparent)`}
                    textAnchor="end"
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}

            {/* Zone simulée hachurée (2022 → 2023) + libellé. */}
            <rect
              x={simZoneX}
              y={PLOT_TOP}
              width={simZoneW}
              height={PLOT_H}
              fill="url(#pbSimHatch)"
              opacity={0.6}
            />
            <text
              x={simZoneX + simZoneW / 2}
              y={PLOT_TOP + 14}
              fontSize={9}
              fill="var(--pb-text-faint)"
              textAnchor="middle"
              letterSpacing={1}
            >
              zone simulée
            </text>

            {/* Grille horizontale + graduations Y (JetBrains Mono). */}
            {Y_TICKS.map((t) => {
              const gy = yOfValue(t);
              return (
                <g key={`y-${t}`}>
                  <line
                    x1={PLOT_LEFT}
                    y1={gy}
                    x2={PLOT_RIGHT}
                    y2={gy}
                    stroke="var(--pb-track)"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                  <text
                    x={PLOT_LEFT - 8}
                    y={gy + 3}
                    fontSize={9}
                    fill="var(--pb-text-faint)"
                    textAnchor="end"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            {/* Axe X : ticks + années (2024 en gras, accentué). */}
            {EXERCISES.map((ex) => {
              const gx = xOfExercise(ex);
              const isCurrent = ex === CURRENT_EXERCISE;
              return (
                <g key={`x-${ex}`}>
                  <line
                    x1={gx}
                    y1={PLOT_BOTTOM}
                    x2={gx}
                    y2={PLOT_BOTTOM + 6}
                    stroke="var(--pb-border)"
                    strokeWidth={1}
                  />
                  <text
                    x={gx}
                    y={PLOT_BOTTOM + 19}
                    fontSize={10}
                    fill={isCurrent ? "var(--pb-text-bright)" : "var(--pb-text-faint)"}
                    textAnchor="middle"
                    fontWeight={isCurrent ? 700 : 400}
                  >
                    {ex}
                  </text>
                </g>
              );
            })}

            {/* Crosshair au survol (sous les tracés). */}
            {hoverX !== null && (
              <line
                x1={hoverX}
                y1={PLOT_TOP}
                x2={hoverX}
                y2={PLOT_BOTTOM}
                stroke="var(--pb-border-strong)"
                strokeWidth={1}
              />
            )}

            {/* Séries : segment simulé pointillé + segment réel plein animé + points. */}
            {series.map((s, si) => (
              <g key={s.slug}>
                {s.dSim && (
                  <path
                    d={s.dSim}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    opacity={0.75}
                    style={{ animation: "pbFadeIn .7s ease both" }}
                  />
                )}
                {s.dReal && (
                  <path
                    d={s.dReal}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    pathLength={1}
                    style={{
                      strokeDasharray: 1,
                      animation: `pbDraw .8s ease ${(0.2 + si * 0.08).toFixed(2)}s both`,
                    }}
                  />
                )}
                {s.points.map((p) =>
                  p.value === null ? null : (
                    <circle
                      key={`${s.slug}-${p.exercise}`}
                      cx={xOfExercise(p.exercise)}
                      cy={yOfValue(p.value)}
                      r={p.simulated ? 3 : 3.6}
                      fill={s.color}
                      stroke={p.simulated ? "none" : "var(--pb-surface-inset)"}
                      strokeWidth={p.simulated ? 0 : 1.4}
                      style={{ animation: "pbFadeIn .5s ease both" }}
                    />
                  ),
                )}
              </g>
            ))}
          </svg>

          {/* Labels de fin de série (HTML overlay) : slug, valeur réelle, delta. */}
          {series.map((s) => {
            if (s.endValue === null || s.endY === null) return null;
            const topPct = (s.endY / VIEW_H) * 100;
            const deltaPositive = (s.delta ?? 0) >= 0;
            const deltaHex = s.delta === null ? "var(--pb-text-faint)" : deltaPositive ? "#ef4444" : "#22c55e";
            return (
              <div
                key={`end-${s.slug}`}
                style={{
                  position: "absolute",
                  left: `${(PLOT_RIGHT / VIEW_W) * 100}%`,
                  top: `${topPct}%`,
                  transform: "translate(8px, -50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 10,
                  color: "var(--pb-text-muted)",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  animation: "pbFadeIn .6s ease .6s both",
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 7, height: 7, borderRadius: 99, background: s.color, flexShrink: 0 }}
                />
                <span
                  style={{
                    maxWidth: 118,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.slug}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: "var(--pb-text)",
                  }}
                >
                  {Math.round(s.endValue)}
                </span>
                {s.delta !== null && Math.round(s.delta) !== 0 && (
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: deltaHex,
                    }}
                  >
                    {deltaPositive ? "+" : ""}
                    {Math.round(s.delta)}
                  </span>
                )}
              </div>
            );
          })}

          {/* Tooltip au survol : valeurs de chaque cycle à l'exercice pointé. */}
          {hoverExercise !== null && hoverRows.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 14,
                // Ancré à gauche quand on survole la colonne la plus à droite
                // (2024), à droite sinon, pour ne pas masquer les points visés.
                ...(hoverIdx !== null && hoverIdx >= EXERCISES.length - 1
                  ? { left: 14 }
                  : { right: 14 }),
                minWidth: 180,
                maxWidth: 230,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--pb-border-strong)",
                background: "color-mix(in srgb, var(--pb-surface-2) 96%, transparent)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                pointerEvents: "none",
                animation: "pbFadeIn .15s ease both",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--pb-text-bright)", marginBottom: 5 }}>
                Exercice {hoverExercise} {isSimulatedExercise(hoverExercise) ? "(simulé)" : "(réel)"}
              </div>
              {hoverRows.map((r) => (
                <div
                  key={r.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 10,
                    color: "var(--pb-text-muted)",
                    padding: "1.5px 0",
                  }}
                >
                  <span
                    aria-hidden
                    style={{ width: 7, height: 7, borderRadius: 99, background: r.color, flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      maxWidth: 130,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.slug}
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--pb-text)",
                      fontWeight: 600,
                    }}
                  >
                    {Math.round(r.value as number)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            height: 180,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            border: "1px dashed var(--pb-border)",
            fontSize: 11.5,
            color: "var(--pb-text-faint)",
          }}
        >
          Sélectionnez au moins un cycle pour afficher son évolution.
        </div>
      )}

      <p className="text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
        <strong className="text-[var(--pb-text-muted)]">2022 et 2023 sont entièrement simulés</strong>{" "}
        (variation déterministe autour du composite réel, aucun dossier ne les a
        produits) — seul l&apos;exercice {CURRENT_EXERCISE} est un exercice réel. Les
        segments simulés sont tracés en pointillé pour rappeler cette nature ; le
        composite reste une heuristique interne non opposable.
      </p>
    </div>
  );
}
