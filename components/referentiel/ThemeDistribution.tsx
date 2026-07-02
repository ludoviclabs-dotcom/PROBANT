"use client";

import { useEffect, useState } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { useDemoCounter } from "@/components/demo/useDemoCounter";
import { THEME_META, THEME_ORDER } from "./themes";

/**
 * Répartition des sources par thème — barres horizontales en CSS pur
 * (aucune dépendance de graphe), couleurs cohérentes avec le thème dark.
 *
 * Entrée staggée (largeur 0 → valeur, 60ms/barre) + hover cross-highlight :
 * survoler une barre dimme les cartes des autres thèmes dans la grille
 * (piloté par le parent via `highlightedTheme`/`onHighlight`).
 */
export function ThemeDistribution({
  sources,
  highlightedTheme,
  onHighlight,
}: {
  sources: SourceNormative[];
  highlightedTheme: SourceTheme | null;
  onHighlight: (theme: SourceTheme | null) => void;
}) {
  const counts = THEME_ORDER.map((t) => {
    const themeSources = sources.filter((s) => s.theme === t);
    return {
      theme: t,
      hex: THEME_META[t].hex,
      n: themeSources.length,
      latestTwo: [...themeSources]
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
        .slice(0, 2),
    };
  }).filter((c) => c.n > 0);
  const max = Math.max(1, ...counts.map((c) => c.n));

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [hovered, setHovered] = useState<SourceTheme | null>(null);
  const tip = counts.find((c) => c.theme === hovered) ?? null;

  return (
    <div className="relative rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--pb-text)]">
        Répartition par thème
      </h3>
      <p className="mt-0.5 text-[11px] text-[var(--pb-text-muted)]">
        {sources.length} sources normatives versionnées.
      </p>
      <div className="mt-3 space-y-1.5">
        {counts.map((c, i) => (
          <BarRow
            key={c.theme}
            theme={c.theme}
            hex={c.hex}
            n={c.n}
            pct={(c.n / max) * 100}
            index={i}
            mounted={mounted}
            isSelf={hovered === c.theme}
            dimmed={highlightedTheme !== null && highlightedTheme !== c.theme}
            onEnter={() => {
              setHovered(c.theme);
              onHighlight(c.theme);
            }}
            onLeave={() => {
              setHovered(null);
              onHighlight(null);
            }}
          />
        ))}
      </div>

      {tip && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            minWidth: 180,
            maxWidth: 230,
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: tip.hex }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-text)" }}>
              {tip.theme}
            </span>
          </div>
          <div style={{ marginTop: 3, fontSize: 11, color: "var(--pb-text-muted)" }}>
            {tip.n} source{tip.n > 1 ? "s" : ""}
          </div>
          {tip.latestTwo.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {tip.latestTwo.map((s) => (
                <div
                  key={s.ref}
                  style={{ fontSize: 10.5, color: "var(--pb-text-faint)", lineHeight: 1.3 }}
                >
                  › {s.ref}{" "}
                  <span style={{ opacity: 0.65 }}>· v.{s.effectiveDate}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BarRow({
  theme,
  hex,
  n,
  pct,
  index,
  mounted,
  isSelf,
  dimmed,
  onEnter,
  onLeave,
}: {
  theme: SourceTheme;
  hex: string;
  n: number;
  pct: number;
  index: number;
  mounted: boolean;
  isSelf: boolean;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [rowActive, setRowActive] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => setRowActive(true), index * 60);
    return () => clearTimeout(t);
  }, [mounted, index]);
  const count = useDemoCounter(n, 600, rowActive);

  return (
    <div
      className="flex items-center gap-2"
      style={{ opacity: dimmed ? 0.35 : 1, transition: "opacity 200ms ease" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span className="w-36 shrink-0 truncate text-[11px] text-[var(--pb-text-muted)]">
        {theme}
      </span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--pb-surface-2)]">
        <div
          className="h-full rounded-full"
          style={{
            width: rowActive ? `${pct}%` : "0%",
            backgroundColor: hex,
            filter: dimmed ? "grayscale(45%)" : isSelf ? "brightness(1.25)" : "none",
            transition: `width 600ms ease-out, filter 150ms ease`,
          }}
        />
      </div>
      <span className="tnum w-5 shrink-0 text-right text-[11px] font-semibold text-[var(--pb-text)]">
        {count}
      </span>
    </div>
  );
}
