"use client";

import { useMemo } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { SourceCard } from "./SourceCard";
import { THEME_META, THEME_ORDER } from "./themes";

/**
 * Explorateur interactif : filtres par thème + année (combinables) et grille
 * de cartes responsive (2 colonnes desktop, 1 mobile). L'état de filtre vit
 * dans le parent (ReferentielWorkspace) pour piloter le cross-highlight avec
 * le bar chart et la chronologie.
 */
export function ReferentielExplorer({
  sources,
  themeFilter,
  onThemeFilterChange,
  yearFilter,
  highlightedTheme,
}: {
  sources: SourceNormative[];
  themeFilter: SourceTheme | "all";
  onThemeFilterChange: (t: SourceTheme | "all") => void;
  yearFilter: string | null;
  highlightedTheme: SourceTheme | null;
}) {
  const byYear = useMemo(
    () => (yearFilter === null ? sources : sources.filter((s) => s.effectiveDate.slice(0, 4) === yearFilter)),
    [sources, yearFilter],
  );

  // Seuls les thèmes représentés dans l'année filtrée gardent une pill —
  // évite les pills « 0 » mortes quand la chronologie restreint la période.
  const present = useMemo(
    () => THEME_ORDER.filter((t) => byYear.some((s) => s.theme === t)),
    [byYear],
  );
  const filtered = useMemo(
    () => (themeFilter === "all" ? byYear : byYear.filter((s) => s.theme === themeFilter)),
    [byYear, themeFilter],
  );

  // Clé de remontage de la grille : rejoue le stagger d'entrée à chaque
  // changement de combinaison de filtres (thème et/ou année).
  const gridKey = `${themeFilter}__${yearFilter ?? "any"}`;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Pill
          label="Tout"
          count={byYear.length}
          hex="#5b9dff"
          active={themeFilter === "all"}
          onClick={() => onThemeFilterChange("all")}
        />
        {present.map((t) => (
          <Pill
            key={t}
            label={t}
            count={byYear.filter((s) => s.theme === t).length}
            hex={THEME_META[t].hex}
            active={themeFilter === t}
            onClick={() => onThemeFilterChange(t)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-[12px] text-[var(--pb-text-faint)]">
          Aucune source pour cette combinaison de filtres.
        </p>
      ) : (
        <div key={gridKey} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((s, i) => (
            <div
              key={s.ref}
              style={{
                animation: "pbCardEnter 280ms ease both",
                animationDelay: `${Math.min(i, 20) * 40}ms`,
              }}
            >
              <SourceCard
                source={s}
                dimmed={highlightedTheme !== null && s.theme !== highlightedTheme}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  count,
  hex,
  active,
  onClick,
}: {
  label: string;
  count: number;
  hex: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200"
      style={
        active
          ? {
              borderColor: hex,
              backgroundColor: `${hex}22`,
              color: hex,
              boxShadow: `0 0 0 1px ${hex}40, 0 4px 12px ${hex}25`,
            }
          : {
              borderColor: "var(--pb-border)",
              color: "var(--pb-text-muted)",
            }
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
      {label}
      <span key={count} className="tnum opacity-70" style={{ animation: "pbCountFlip 260ms ease" }}>
        {count}
      </span>
    </button>
  );
}
