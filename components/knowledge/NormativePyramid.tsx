"use client";

/**
 * Pyramide normative — la hiérarchie des trois familles de constats
 * (droit dur / présomption d'audit / paramètre interne), du plus opposable
 * au moins opposable. Les nombres sont dans chaque étage, en texte.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "@/components/synthesis/SourceFootnote";
import { FONT, T } from "@/components/synthesis/tokens";

const LEVEL_COLORS: Record<string, string> = {
  hardLaw: "#f87171",
  methodology: T.violet,
  internal: "#38bdf8",
};
const LEVEL_WIDTH: Record<string, string> = {
  hardLaw: "52%",
  methodology: "76%",
  internal: "100%",
};

export function NormativePyramid({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Base de connaissance">
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {dataset.rows.map((row) => {
          const color = LEVEL_COLORS[row.id] ?? T.accent;
          return (
            <div
              key={row.id}
              style={{
                width: LEVEL_WIDTH[row.id] ?? "100%",
                border: `1px solid ${color}55`,
                borderRadius: 9,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                padding: "9px 14px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: FONT.table, fontWeight: 700, color }}>
                {row.cells.niveau} — {row.cells.nombre} constat{Number(row.cells.nombre) > 1 ? "s" : ""}
              </div>
              <div style={{ marginTop: 2, fontSize: FONT.meta, color: T.muted }}>{row.cells.portee}</div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
