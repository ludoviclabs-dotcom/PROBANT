"use client";

/**
 * Chaîne de preuve — du document source empreinté au snapshot hashé, en
 * passant par les constats et la revue humaine. Flux linéaire, lisible au
 * clavier comme au lecteur d'écran (liste ordonnée).
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "@/components/synthesis/SourceFootnote";
import { FONT, T } from "@/components/synthesis/tokens";

const LINK_COLOR: Record<string, string> = {
  "Document source": T.accent,
  Constats: "#f87171",
  "Revue humaine": T.warning,
  "Snapshot de synthèse": T.positive,
};

export function EvidenceFlow({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Preuve">
      <ol
        role="img"
        aria-label={dataset.summary}
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}
      >
        {dataset.rows.map((row, i) => {
          const maillon = String(row.cells.maillon);
          const color = LINK_COLOR[maillon] ?? T.accent;
          return (
            <li key={row.id} style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px", minWidth: 180 }}>
              <div
                style={{
                  flex: 1,
                  border: `1px solid ${color}55`,
                  borderRadius: 10,
                  background: `color-mix(in srgb, ${color} 9%, transparent)`,
                  padding: "9px 12px",
                  height: "100%",
                }}
              >
                <div style={{ fontSize: FONT.meta, fontWeight: 700, color }}>{maillon}</div>
                <div style={{ marginTop: 2, fontSize: FONT.table, color: T.text, overflowWrap: "anywhere" }}>
                  {row.cells.valeur}
                </div>
                <div style={{ marginTop: 2, fontSize: FONT.meta - 1, color: T.faint, fontFamily: "monospace", overflowWrap: "anywhere" }}>
                  {row.cells.empreinte}
                </div>
              </div>
              {i < dataset.rows.length - 1 && (
                <span aria-hidden="true" style={{ color: T.faint, fontSize: 15, flexShrink: 0 }}>→</span>
              )}
            </li>
          );
        })}
      </ol>
    </ChartCard>
  );
}
