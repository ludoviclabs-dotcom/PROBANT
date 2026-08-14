"use client";

/**
 * Barres de couverture (écritures analysées, contrôles conclus).
 * Les pourcentages sont AFFICHÉS en texte à côté de chaque barre — la barre
 * n'est qu'un renfort visuel.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

export function CoverageStackedBar({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Niveau décision">
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {dataset.rows.map((row) => {
          const ratio = Number(row.cells.ratio ?? 0);
          return (
            <div key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: FONT.body, color: T.text }}>{row.cells.dimension}</span>
                <span style={{ fontSize: FONT.table, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>
                  {row.cells.fait}/{row.cells.total} · {ratio} %
                </span>
              </div>
              <div
                style={{ height: 12, borderRadius: 6, background: T.surface3, overflow: "hidden", border: `1px solid ${T.border}` }}
              >
                <div
                  className="pbz-anim"
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, ratio))}%`,
                    background: ratio >= 95 ? T.positive : ratio > 0 ? T.warning : T.critical,
                    transition: "width .4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
