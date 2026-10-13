"use client";

/**
 * Couverture des travaux (C03) — procédures réalisées, pièces et versions du dossier.
 * Vue distincte de la matrice des constats : une ligne par feuille de travail, avec les assertions
 * qu'elle vise, son état, son résultat, ses pièces et sa version. Sans travail, aucune cellule
 * n'est verte : l'état vide le dit.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { ChartCard } from "./SourceFootnote";
import { FONT, T, TONE_COLOR } from "./tokens";

const TONE: Record<NonNullable<VisualizationDataset["rows"][number]["emphasis"]>, string> = {
  critical: TONE_COLOR.critical, warning: TONE_COLOR.warning, positive: TONE_COLOR.positive, muted: TONE_COLOR.muted,
};

export function WorkCoverageTable({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <ChartCard dataset={dataset} eyebrow="Niveau décision" tableOpen={false}>
      {dataset.rows.length === 0 ? (
        <p role="status" style={{ margin: 0, fontSize: FONT.body, lineHeight: 1.5, color: T.text, borderLeft: `3px solid ${T.warning}`, paddingLeft: 12 }}>
          Aucune procédure réalisée dans ce dossier : couverture des travaux <strong>non établie</strong>. Aucune assertion n'est réputée couverte sans travail, pièce et version.
        </p>
      ) : (
        <div role="region" aria-label="Couverture des travaux — défilement horizontal" tabIndex={0} style={{ overflowX: "auto", position: "relative" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: FONT.table }} aria-label={dataset.title}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.borderStrong}` }}>
                {dataset.columns.map((c) => (
                  <th key={c.key} scope="col" style={{ padding: "7px 10px", textAlign: c.align ?? "left", fontSize: FONT.meta, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: T.muted, whiteSpace: "nowrap" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}`, verticalAlign: "top" }}>
                  {dataset.columns.map((c, i) => {
                    const value = row.cells[c.key];
                    const tone = c.key === "travail" && row.emphasis ? TONE[row.emphasis] : undefined;
                    return (
                      <td key={c.key} style={{ padding: "8px 10px", textAlign: c.align ?? "left", color: tone ?? (i === 0 ? T.text : T.muted), fontWeight: i === 0 || tone ? 600 : 400, fontVariantNumeric: "tabular-nums", maxWidth: c.key === "assertions" ? 320 : undefined, overflowWrap: "anywhere" }}>
                        {value === null || value === undefined ? "—" : String(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
