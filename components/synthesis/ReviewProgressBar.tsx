"use client";

/**
 * Progression de la revue humaine. Le pourcentage vient du snapshot (jamais
 * recalculé) ; la ventilation par statut est le tableau du dataset.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

export function ReviewProgressBar({
  dataset,
  pct,
}: {
  dataset: VisualizationDataset;
  /** Pourcentage issu de snapshot.review.pct — passé tel quel. */
  pct: number;
}) {
  return (
    <ChartCard dataset={dataset} eyebrow="Niveau décision">
      <div role="img" aria-label={dataset.summary}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: FONT.body, color: T.text }}>Constats arbitrés</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>{pct} %</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression de la revue"
          style={{ height: 14, borderRadius: 7, background: T.surface3, overflow: "hidden", border: `1px solid ${T.border}` }}
        >
          <div
            className="pbz-anim"
            style={{
              height: "100%",
              width: `${pct}%`,
              background: pct === 100 ? T.positive : T.accent,
              transition: "width .4s ease",
            }}
          />
        </div>
      </div>
    </ChartCard>
  );
}
