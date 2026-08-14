"use client";

/**
 * Frise des référentiels et versions appliqués au snapshot — schéma, moteur,
 * jeu de règles, référentiel normatif, politique d'agrégation.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "@/components/synthesis/SourceFootnote";
import { FONT, T } from "@/components/synthesis/tokens";

export function StandardsTimeline({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Base de connaissance">
      <ol
        role="img"
        aria-label={dataset.summary}
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}
      >
        {dataset.rows.map((row, i) => (
          <li key={row.id} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                aria-hidden="true"
                style={{ width: 9, height: 9, borderRadius: "50%", background: T.accent, marginTop: 5, flexShrink: 0 }}
              />
              {i < dataset.rows.length - 1 && (
                <span aria-hidden="true" style={{ width: 1, flex: 1, background: T.borderStrong }} />
              )}
            </div>
            <div style={{ paddingBottom: i < dataset.rows.length - 1 ? 12 : 0 }}>
              <div style={{ fontSize: FONT.table, fontWeight: 600, color: T.text }}>{row.cells.element}</div>
              <div style={{ fontSize: FONT.meta, color: T.muted, fontFamily: "monospace" }}>{row.cells.version}</div>
            </div>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}
