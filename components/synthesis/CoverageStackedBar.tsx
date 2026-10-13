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
          // C03 — sans dénominateur qualifié, aucun ratio n'est affiché ni dessiné : l'état de la population le remplace.
          const qualified = row.cells.ratio !== null && row.cells.ratio !== undefined;
          const ratio = qualified ? Number(row.cells.ratio) : 0;
          return (
            <div key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: FONT.body, color: T.text }}>{row.cells.dimension}</span>
                <span style={{ fontSize: FONT.table, fontWeight: 700, color: qualified ? T.text : T.warning, fontFamily: "monospace" }}>
                  {qualified ? `${row.cells.fait}/${row.cells.total} · ${ratio} %` : `${row.cells.statut} · ${row.cells.fait} réalisé(s), dénominateur —`}
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
                    background: !qualified ? "transparent" : ratio >= 95 ? T.positive : ratio > 0 ? T.warning : T.critical,
                    transition: "width .4s ease",
                  }}
                />
              </div>
              {!qualified && <p style={{ margin: "4px 0 0", fontSize: FONT.meta, color: T.muted }}>{row.cells.base}</p>}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
