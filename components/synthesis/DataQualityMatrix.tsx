"use client";

/**
 * Matrice des 18 zones réglementaires du FEC (art. A.47 A-1).
 *
 * Chaque cellule montre le nom de la zone, son format et son statut d'alerte.
 * Le statut est doublé en texte (jamais couleur seule). Le dataset est
 * construit par build-datasets — le composant n'exécute aucun contrôle.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

export function DataQualityMatrix({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Qualité FEC">
      <div
        role="img"
        aria-label={dataset.summary}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
          gap: 7,
        }}
      >
        {dataset.rows.map((row) => {
          const alert = row.emphasis === "critical";
          return (
            <div
              key={row.id}
              style={{
                border: `1px solid ${alert ? "rgba(239,68,68,.5)" : T.border}`,
                borderRadius: 9,
                background: alert ? "#2a1416" : T.surface3,
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: FONT.table, fontWeight: 600, color: alert ? T.critical : T.text, fontFamily: "monospace" }}>
                  {row.cells.zone}
                </span>
                <span style={{ fontSize: FONT.meta - 2, color: T.faint, fontFamily: "monospace" }}>
                  {row.cells.position}/18
                </span>
              </div>
              <div style={{ marginTop: 2, fontSize: FONT.meta, color: T.faint }}>{row.cells.format}</div>
              <div style={{ marginTop: 3, fontSize: FONT.meta, color: alert ? T.critical : T.muted }}>
                {alert ? "⚠ " : ""}
                {row.cells.statut}
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
