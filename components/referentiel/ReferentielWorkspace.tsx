"use client";

import { useState } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { ThemeDistribution } from "./ThemeDistribution";
import { VersionTimeline } from "./VersionTimeline";
import { ReferentielDisclaimer } from "./ReferentielDisclaimer";
import { ReferentielExplorer } from "./ReferentielExplorer";

/**
 * Orchestrateur client de la page Référentiel : possède l'état de filtre
 * (thème + année, combinables) et le thème survolé (cross-highlight bar
 * chart ↔ cartes), partagé entre les infographies et la grille.
 */
export function ReferentielWorkspace({ sources }: { sources: SourceNormative[] }) {
  const [themeFilter, setThemeFilter] = useState<SourceTheme | "all">("all");
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [highlightedTheme, setHighlightedTheme] = useState<SourceTheme | null>(null);

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ThemeDistribution
          sources={sources}
          highlightedTheme={highlightedTheme}
          onHighlight={setHighlightedTheme}
        />
        <VersionTimeline
          sources={sources}
          yearFilter={yearFilter}
          onYearToggle={(y) => setYearFilter((prev) => (prev === y ? null : y))}
        />
      </div>

      <div className="mt-4">
        <ReferentielDisclaimer />
      </div>

      <div className="mt-4">
        <ReferentielExplorer
          sources={sources}
          themeFilter={themeFilter}
          onThemeFilterChange={setThemeFilter}
          yearFilter={yearFilter}
          highlightedTheme={highlightedTheme}
        />
      </div>
    </div>
  );
}
