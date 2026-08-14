"use client";

/**
 * Concentration des constats et de l'exposition par cloison — barres
 * empilées par gravité, chiffres affichés en clair, exposition en colonne.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

const SEV_COLORS: Record<string, string> = {
  bloquant: T.critical,
  majeur: T.orange,
  mineur: T.warning,
  informatif: T.accent,
};
const SEV_KEYS = ["bloquant", "majeur", "mineur", "informatif"] as const;

export function FindingConcentrationChart({ dataset }: { dataset: VisualizationDataset }) {
  const totals = dataset.rows.map((r) =>
    SEV_KEYS.reduce((sum, k) => sum + Number(r.cells[k] ?? 0), 0),
  );
  const maxTotal = Math.max(1, ...totals);

  return (
    <ChartCard dataset={dataset} eyebrow="Analyse">
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {dataset.rows.map((row, i) => {
          const total = totals[i];
          return (
            <div key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: FONT.table, color: T.text }}>
                  {row.cells.cloison}{" "}
                  <span style={{ color: T.faint }}>
                    ({total} constat{total > 1 ? "s" : ""}
                    {SEV_KEYS.filter((k) => Number(row.cells[k] ?? 0) > 0)
                      .map((k) => ` · ${row.cells[k]} ${k}`)
                      .join("")}
                    )
                  </span>
                </span>
                <span style={{ fontSize: FONT.table, fontWeight: 600, color: T.orange, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {row.cells.exposition}
                </span>
              </div>
              <div style={{ display: "flex", height: 11, borderRadius: 6, overflow: "hidden", background: T.surface3, border: `1px solid ${T.border}`, width: `${(total / maxTotal) * 100}%`, minWidth: total > 0 ? 24 : 0 }}>
                {SEV_KEYS.map((k) => {
                  const n = Number(row.cells[k] ?? 0);
                  if (!n) return null;
                  return (
                    <div
                      key={k}
                      style={{ width: `${(n / total) * 100}%`, background: SEV_COLORS[k] }}
                      title={`${k} : ${n}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {SEV_KEYS.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FONT.meta, color: T.muted }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: SEV_COLORS[k], display: "inline-block" }} />
            {k}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
