"use client";

import { Fragment, useMemo, useRef, useState, type Key } from "react";
import { Download } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CycleRiskScore } from "@/lib/risk-mapping";
import {
  CURRENT_EXERCISE,
  isSimulatedExercise,
  simulateHistoricalComposite,
  type HistoricalExercise,
} from "@/lib/risk-mapping";
import { cn } from "@/lib/utils";

/**
 * Vue temporelle (Bloc 3) : évolution du composite de chaque cycle sélectionné
 * sur les trois exercices exposés par `lib/risk-mapping/historical.ts`.
 *
 * Seul `CURRENT_EXERCISE` (2024) est un exercice réel : sa valeur est le
 * composite réellement calculé. 2022/2023 sont ENTIÈREMENT SIMULÉS par
 * `simulateHistoricalComposite` (hash déterministe, jamais un vrai chiffre
 * d'audit) — les lignes correspondantes sont tracées en pointillé pour
 * signaler visuellement leur nature simulée, et un disclaimer permanent est
 * affiché sous le graphique. Ce composant ne calcule rien lui-même : il ne
 * fait que projeter les `CycleRiskScore` déjà produits par le moteur pur.
 */

const EXERCISES: HistoricalExercise[] = [2022, 2023, CURRENT_EXERCISE];

/** Palette cyclique pour les lignes (une couleur par cycle affiché). */
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

interface RiskTemporalChartProps {
  scores: CycleRiskScore[];
  cycles: string[];
}

type ChartRow = { exercise: HistoricalExercise } & Record<string, number | null | HistoricalExercise>;

/** Clé de série pour le segment simulé (2022 → 2023) d'un cycle. */
function simulatedSegmentKey(slug: string): string {
  return `${slug}__simulated`;
}

/** Clé de série pour le segment réel (2023 → 2024) d'un cycle. */
function realSegmentKey(slug: string): string {
  return `${slug}__real`;
}

/** Props minimales exploitées du rendu `dot` custom de recharts `<Line>`. */
interface DotRendererProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  key?: Key | null;
}

export function RiskTemporalChart({ scores, cycles }: RiskTemporalChartProps) {
  const scoreBySlug = useMemo(() => {
    const map = new Map<string, CycleRiskScore>();
    for (const s of scores) map.set(s.cycleSlug, s);
    return map;
  }, [scores]);

  // Sélection par défaut : les 4 premiers cycles évalués (ordre stable des props).
  const defaultSelection = useMemo(() => {
    const evaluated = cycles.filter((slug) => scoreBySlug.get(slug)?.composite !== null);
    return evaluated.slice(0, 4);
  }, [cycles, scoreBySlug]);

  const [selectedCycles, setSelectedCycles] = useState<string[]>(defaultSelection);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);

  function toggleCycle(slug: string) {
    setSelectedCycles((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, slug];
    });
  }

  // Chaque cycle est éclaté en deux séries : le segment simulé (2022→2023,
  // pointillé) et le segment réel (2023→2024, trait plein). L'exercice 2023
  // est dupliqué dans les deux séries pour que les deux tracés se rejoignent
  // visuellement sans discontinuité au point de jonction.
  const chartData: ChartRow[] = useMemo(
    () =>
      EXERCISES.map((exercise) => {
        const row: ChartRow = { exercise };
        for (const slug of selectedCycles) {
          const score = scoreBySlug.get(slug);
          const current = score?.composite ?? null;
          const value = simulateHistoricalComposite(slug, current, exercise);
          const isBoundary = exercise === 2023;
          row[simulatedSegmentKey(slug)] = exercise <= 2023 ? value : null;
          row[realSegmentKey(slug)] = exercise >= 2023 ? value : null;
          if (isBoundary) {
            // Les deux clés portent la même valeur au point de jonction.
            row[simulatedSegmentKey(slug)] = value;
            row[realSegmentKey(slug)] = value;
          }
        }
        return row;
      }),
    [selectedCycles, scoreBySlug],
  );

  // Légende personnalisée (HTML, hors recharts) : un segment par cycle, sans
  // dupliquer l'entrée pour les deux `Line` (simulé + réel) sous-jacentes.
  const legendEntries = useMemo(
    () =>
      selectedCycles.map((slug, i) => ({
        slug,
        color: LINE_COLORS[i % LINE_COLORS.length],
      })),
    [selectedCycles],
  );

  // Résumé textuel alternatif (sr-only) : le SVG recharts n'est pas nativement
  // lisible par un lecteur d'écran, donc on relit `chartData` (déjà calculé,
  // aucune valeur recalculée ni inventée) pour produire une description
  // équivalente, cycle par cycle et exercice par exercice.
  const textSummary = useMemo(() => {
    if (selectedCycles.length === 0) return "";
    const lines = selectedCycles.map((slug) => {
      const points = chartData.map((row) => {
        const value =
          row[realSegmentKey(slug)] ?? row[simulatedSegmentKey(slug)] ?? null;
        const suffix = isSimulatedExercise(row.exercise) ? " (simulé)" : " (réel)";
        const reading = typeof value === "number" ? `${Math.round(value)}/100` : "non évalué";
        return `${row.exercise}${suffix} : ${reading}`;
      });
      return `${slug} — ${points.join(", ")}`;
    });
    return `Évolution du composite pour ${selectedCycles.length} cycle(s) sur ${EXERCISES.length} exercices (2022 et 2023 simulés, ${CURRENT_EXERCISE} réel). ${lines.join(" · ")}.`;
  }, [selectedCycles, chartData]);

  function exportPng() {
    const svg = chartWrapperRef.current?.querySelector("svg");
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const rect = svg.getBoundingClientRect();
    const width = rect.width || 640;
    const height = rect.height || 360;

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
      // Fond opaque : le SVG recharts n'a pas de fond propre.
      ctx.fillStyle = "#0b0f16";
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

  const hasSelection = selectedCycles.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Multi-sélection des cycles à tracer */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-3 py-2.5">
        <span className="text-[10px] font-medium text-[var(--pb-text-faint)]">
          Cycles affichés ({selectedCycles.length}/{MAX_SELECTED})
        </span>
        <div className="flex flex-wrap gap-1.5">
          {cycles.map((slug) => {
            const active = selectedCycles.includes(slug);
            const disabled = !active && selectedCycles.length >= MAX_SELECTED;
            const color = LINE_COLORS[selectedCycles.indexOf(slug) % LINE_COLORS.length];
            return (
              <label
                key={slug}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors",
                  active
                    ? "border-[var(--pb-accent)]/60 bg-[var(--pb-accent)]/10 text-[var(--pb-text)]"
                    : "border-[var(--pb-border)] text-[var(--pb-text-muted)]",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={disabled}
                  onChange={() => toggleCycle(slug)}
                  className="h-3 w-3 accent-[var(--pb-accent)]"
                />
                {active && (
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: color }}
                  />
                )}
                {slug}
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={exportPng}
          disabled={!hasSelection}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--pb-border)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          Exporter en PNG
        </button>
      </div>

      {/* Graphique */}
      <div ref={chartWrapperRef} className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3">
        {hasSelection ? (
          <>
            {/* Résumé texte équivalent pour lecteur d'écran : le SVG recharts
                ci-dessous est masqué aux technologies d'assistance (le rendu
                graphique de courbes n'y est pas nativement exploitable), ce
                paragraphe le remplace intégralement. */}
            <p className="sr-only">{textSummary}</p>
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  role="img"
                  desc={`Graphique montrant l'évolution du composite pour ${selectedCycles.length} cycle(s) sur ${EXERCISES.length} exercices`}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--pb-border)" />
                  <XAxis
                    dataKey="exercise"
                    tick={{ fill: "var(--pb-text-muted)", fontSize: 11 }}
                    tickFormatter={(value: number) =>
                      isSimulatedExercise(value as HistoricalExercise)
                        ? `${value} (simulé)`
                        : `${value}`
                    }
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "var(--pb-text-muted)", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--pb-surface)",
                      border: "1px solid var(--pb-border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelFormatter={(label) => {
                      const value = Number(label);
                      return isSimulatedExercise(value as HistoricalExercise)
                        ? `Exercice ${value} (simulé)`
                        : `Exercice ${value} (réel)`;
                    }}
                  />
                  {selectedCycles.map((slug, i) => {
                    const color = LINE_COLORS[i % LINE_COLORS.length];
                    const dotRenderer = (props: DotRendererProps) => {
                      const { cx, cy, payload, key } = props;
                      if (cx === undefined || cy === undefined || !payload) {
                        return <g key={key ?? undefined} />;
                      }
                      const simulated = isSimulatedExercise(payload.exercise);
                      return (
                        <circle
                          key={key ?? undefined}
                          cx={cx}
                          cy={cy}
                          r={simulated ? 3 : 3.5}
                          fill={color}
                          stroke={simulated ? "none" : "#fff"}
                          strokeWidth={simulated ? 0 : 1}
                        />
                      );
                    };
                    return (
                      <Fragment key={slug}>
                        {/* Segment simulé (2022 → 2023) : trait pointillé. */}
                        <Line
                          type="monotone"
                          dataKey={simulatedSegmentKey(slug)}
                          name={slug}
                          legendType="none"
                          stroke={color}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          connectNulls
                          dot={dotRenderer}
                          isAnimationActive={false}
                        />
                        {/* Segment réel (2023 → 2024) : trait plein. */}
                        <Line
                          type="monotone"
                          dataKey={realSegmentKey(slug)}
                          name={slug}
                          legendType="none"
                          stroke={color}
                          strokeWidth={2}
                          connectNulls
                          dot={dotRenderer}
                          isAnimationActive={false}
                        />
                      </Fragment>
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Légende personnalisée (HTML) : une entrée par cycle affiché. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {legendEntries.map((entry) => (
                <span
                  key={entry.slug}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--pb-text-muted)]"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: entry.color }}
                  />
                  {entry.slug}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-[11.5px] text-[var(--pb-text-faint)]">
            Sélectionnez au moins un cycle pour afficher son évolution.
          </div>
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
        <strong className="text-[var(--pb-text-muted)]">2022 et 2023 sont entièrement simulés</strong>{" "}
        (variation déterministe autour du composite réel, aucun dossier ne les a
        produits) — seul l'exercice {CURRENT_EXERCISE} est un exercice réel. Les
        lignes sont tracées en pointillé pour rappeler cette nature simulée ; le
        composite reste une heuristique interne non opposable.
      </p>
    </div>
  );
}
