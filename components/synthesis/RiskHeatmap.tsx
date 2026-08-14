"use client";

/**
 * Heatmap cloison × assertion. Chaque cellule affiche SON NOMBRE (jamais la
 * couleur seule) ; l'intensité de fond n'est qu'un renfort. Cellules
 * focusables au clavier, tooltip au focus comme au survol.
 */

import { useState } from "react";
import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

export function RiskHeatmap({ dataset }: { dataset: VisualizationDataset }) {
  const [tip, setTip] = useState<string | null>(null);
  const valueColumns = dataset.columns.slice(1);
  const maxCell = Math.max(
    1,
    ...dataset.rows.flatMap((r) => valueColumns.map((c) => Number(r.cells[c.key] ?? 0))),
  );

  return (
    <ChartCard dataset={dataset} eyebrow="Analyse">
      <div role="img" aria-label={dataset.summary}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(88px,1fr) repeat(${valueColumns.length}, minmax(52px, 1fr))`,
            gap: 5,
            alignItems: "center",
          }}
        >
          <div />
          {valueColumns.map((c) => (
            <div
              key={c.key}
              style={{
                textAlign: "center",
                fontSize: FONT.meta - 1,
                fontWeight: 600,
                color: T.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={c.label}
            >
              {c.label}
            </div>
          ))}
          {dataset.rows.map((row) => (
            <div key={row.id} style={{ display: "contents" }}>
              <div
                style={{
                  fontSize: FONT.meta,
                  fontWeight: 500,
                  color: T.muted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.cells.cloison}
              </div>
              {valueColumns.map((c) => {
                const n = Number(row.cells[c.key] ?? 0);
                const inten = n / maxCell;
                const label = `${row.cells.cloison} × ${c.label} : ${n} constat${n > 1 ? "s" : ""}`;
                return (
                  <div
                    key={c.key}
                    tabIndex={0}
                    className="pbz-focusable"
                    aria-label={label}
                    onFocus={() => setTip(label)}
                    onBlur={() => setTip(null)}
                    onMouseEnter={() => setTip(label)}
                    onMouseLeave={() => setTip(null)}
                    style={{
                      height: 32,
                      borderRadius: 7,
                      border: `1px solid ${T.border}`,
                      background: n
                        ? `color-mix(in srgb, ${T.accent} ${(15 + inten * 65).toFixed(0)}%, transparent)`
                        : T.surface,
                      color: n ? T.text : "#3a4761",
                      fontSize: FONT.table,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "monospace",
                    }}
                  >
                    {n || "·"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p aria-live="polite" style={{ margin: "10px 0 0", minHeight: 18, fontSize: FONT.meta, color: T.faint }}>
          {tip ?? "Survoler ou naviguer au clavier pour le détail d'une cellule."}
        </p>
      </div>
    </ChartCard>
  );
}
