"use client";

/**
 * Alternative tabulaire d'un graphique — TOUJOURS présente sous chaque
 * visualisation. Rend le même VisualizationDataset que le graphique : aucune
 * divergence possible entre ce que voit un utilisateur de lecteur d'écran et
 * ce que montre le dessin. Le repli (<details>) est navigable au clavier.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { FONT, T, TONE_COLOR } from "./tokens";

export function AccessibleChartTable({
  dataset,
  defaultOpen = false,
}: {
  dataset: VisualizationDataset;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary
        className="pbz-focusable"
        style={{
          cursor: "pointer",
          fontSize: FONT.meta,
          color: T.muted,
          padding: "4px 2px",
          listStyle: "revert",
        }}
      >
        Données du graphique « {dataset.title} »
      </summary>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.table }}
          aria-label={`Tableau de données : ${dataset.title}`}
        >
          <caption
            style={{
              captionSide: "top",
              textAlign: "left",
              fontSize: FONT.meta,
              color: T.faint,
              paddingBottom: 6,
            }}
          >
            {dataset.summary}
          </caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderStrong}` }}>
              {dataset.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{
                    padding: "7px 10px",
                    textAlign: c.align ?? "left",
                    fontSize: FONT.meta,
                    fontWeight: 600,
                    color: T.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label}
                  {c.unit ? ` (${c.unit})` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={dataset.columns.length}
                  style={{ padding: 14, color: T.faint, fontSize: FONT.table }}
                >
                  Aucune donnée.
                </td>
              </tr>
            ) : (
              dataset.rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  {dataset.columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: "7px 10px",
                        textAlign: c.align ?? "left",
                        color: row.emphasis ? TONE_COLOR[row.emphasis] : T.text,
                        fontFamily:
                          typeof row.cells[c.key] === "number" || c.align === "right"
                            ? "monospace"
                            : undefined,
                      }}
                    >
                      {row.cells[c.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
