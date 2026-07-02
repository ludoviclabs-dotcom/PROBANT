"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SourceNormative } from "@/lib/canonical-model";
import { THEME_META } from "./themes";

const HEIGHT = 108;
const LINE_Y = 22;
const PAD_X = 18;

interface YearPoint {
  year: string;
  items: SourceNormative[];
}

/**
 * Chronologie des versions — bâtie sur les dates d'effet RÉELLES des textes
 * cités (aucune version inventée). Chaque jalon agrège les sources entrées en
 * vigueur cette année-là.
 *
 * Ligne SVG tracée au chargement (stroke-dashoffset, dégradé gris → indigo),
 * points de taille proportionnelle au nombre de textes, cliquables pour
 * filtrer la grille sur cette année (combinable avec le filtre thème).
 */
export function VersionTimeline({
  sources,
  yearFilter,
  onYearToggle,
}: {
  sources: SourceNormative[];
  yearFilter: string | null;
  onYearToggle: (year: string) => void;
}) {
  const points = useMemo<YearPoint[]>(() => {
    const byYear = new Map<string, SourceNormative[]>();
    for (const s of sources) {
      const year = s.effectiveDate.slice(0, 4);
      const arr = byYear.get(year);
      if (arr) arr.push(s);
      else byYear.set(year, [s]);
    }
    return [...byYear.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, items]) => ({ year, items }));
  }, [sources]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gradId = useId();

  const compute = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
  }, []);

  useLayoutEffect(() => {
    compute();
    const el = containerRef.current;
    const ro = new ResizeObserver(() => compute());
    if (el) ro.observe(el);
    window.addEventListener("resize", compute);
    const raf = requestAnimationFrame(compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
      cancelAnimationFrame(raf);
    };
  }, [compute]);

  const n = points.length;
  const usable = Math.max(0, width - PAD_X * 2);
  const xs = points.map((_, i) => (n <= 1 ? width / 2 : PAD_X + (usable * i) / (n - 1)));

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--pb-text)]">
            Chronologie des versions
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--pb-text-muted)]">
            Dates d'effet des textes cités — réelles, non inventées.
          </p>
        </div>
        {yearFilter && (
          <button
            type="button"
            onClick={() => onYearToggle(yearFilter)}
            className="shrink-0 rounded-full border border-[var(--pb-accent)]/50 bg-[var(--pb-accent)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--pb-accent)]"
          >
            {yearFilter} · réinitialiser ×
          </button>
        )}
      </div>

      <div ref={containerRef} className="relative mt-6" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            style={{ overflow: "visible", position: "absolute", inset: 0 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0%" x2="100%" y1="0" y2="0">
                <stop offset="0%" stopColor="#6b7280" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="1" />
              </linearGradient>
            </defs>

            {n > 1 && (
              <path
                d={`M ${xs[0]} ${LINE_Y} L ${xs[n - 1]} ${LINE_Y}`}
                stroke={`url(#${gradId})`}
                strokeWidth={2}
                fill="none"
                pathLength={1}
                strokeDasharray={1}
                style={{ animation: "pbDraw 1.2s ease-out both" }}
              />
            )}

            {points.map((p, i) => {
              const r = Math.max(6, Math.min(14, 4 + p.items.length * 1.5));
              const active = yearFilter === p.year;
              return (
                <g
                  key={p.year}
                  style={{
                    cursor: "pointer",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: `pbNodeIn .4s cubic-bezier(.34,1.56,.64,1) ${(1.15 + i * 0.12).toFixed(2)}s both`,
                  }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => onYearToggle(p.year)}
                >
                  {active && (
                    <circle
                      cx={xs[i]}
                      cy={LINE_Y}
                      r={r + 6}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={2}
                      style={{
                        transformBox: "fill-box",
                        transformOrigin: "center",
                        animation: "pbRingPulse 2s ease-in-out infinite",
                      }}
                    />
                  )}
                  <circle
                    cx={xs[i]}
                    cy={LINE_Y}
                    r={r}
                    fill="var(--pb-accent)"
                    stroke="var(--pb-bg)"
                    strokeWidth={2}
                    style={{
                      filter: hoverIdx === i ? "brightness(1.35)" : "none",
                      transition: "filter 120ms ease",
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {points.map((p, i) => (
          <div
            key={p.year}
            className="absolute flex flex-col items-center"
            style={{ left: xs[i], top: LINE_Y + 14, transform: "translateX(-50%)" }}
          >
            <span
              className="tnum text-[12px] font-semibold"
              style={{ color: yearFilter === p.year ? "#818cf8" : "var(--pb-text)" }}
            >
              {p.year}
            </span>
            <span className="text-[10px] text-[var(--pb-text-faint)]">
              {p.items.length} texte{p.items.length > 1 ? "s" : ""}
            </span>
          </div>
        ))}

        {hoverPoint && (
          <div
            style={{
              position: "absolute",
              top: 0,
              ...(xs[hoverIdx ?? 0] > width / 2
                ? { right: Math.max(4, width - (xs[hoverIdx ?? 0] ?? 0) + 14) }
                : { left: Math.max(4, (xs[hoverIdx ?? 0] ?? 0) + 14) }),
              minWidth: 170,
              maxWidth: 220,
              padding: "9px 11px",
              borderRadius: 10,
              border: "1px solid var(--pb-border-strong)",
              background: "color-mix(in srgb, var(--pb-surface-2) 96%, transparent)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              pointerEvents: "none",
              animation: "pbFadeIn .15s ease both",
              zIndex: 20,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-text)" }}>
              {hoverPoint.year}
              <span style={{ marginLeft: 6, fontWeight: 500, fontSize: 10.5, color: "var(--pb-text-faint)" }}>
                {hoverPoint.items.length} texte{hoverPoint.items.length > 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {hoverPoint.items.map((s) => (
                <div key={s.ref} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.theme ? THEME_META[s.theme].hex : "var(--pb-text-faint)" }}
                  />
                  <span style={{ fontSize: 10.5, color: "var(--pb-text-muted)", lineHeight: 1.3 }}>
                    {s.ref}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
