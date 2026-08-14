"use client";

/**
 * Carte d'admissibilité — la liste des alertes d'admissibilité, statutée.
 * Aucun recomptage : tout vient du dataset.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T, TONE_COLOR } from "./tokens";

export function AdmissibilityCard({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Niveau décision" tableOpen={dataset.rows.length > 0}>
      {dataset.rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: FONT.body, color: T.positive }}>
          <span aria-hidden="true">✓ </span>Aucune alerte d'admissibilité.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          {dataset.rows.map((row) => (
            <li
              key={row.id}
              style={{
                fontSize: FONT.body,
                lineHeight: 1.5,
                color: row.emphasis ? TONE_COLOR[row.emphasis] : T.text,
              }}
            >
              <strong>{row.cells.gravite}</strong> — {row.cells.constat}{" "}
              <span style={{ color: T.faint, fontFamily: "monospace", fontSize: FONT.meta }}>
                ({row.cells.regle})
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
