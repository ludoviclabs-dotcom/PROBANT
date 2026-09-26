"use client";

/**
 * Données manquantes et pièces requises : codes `missingData` du planificateur
 * (TAX-04) et limitations des moteurs, avec leur résolvabilité. Une pièce
 * absente de PROBANT ne signifie pas qu'elle n'a pas été produite à
 * l'administration — la nuance est portée par le dataset.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T } from "@/components/synthesis/tokens";
import { AMOUNT, ELEVATION, EYEBROW, INK_FAINT } from "./cockpit-style";
import { TaxChartCard } from "./TaxSourceFootnote";

export function TaxMissingDataPanel({
  dataset,
}: {
  dataset: TaxCockpitDatasets["requiredDocuments"];
}) {
  const expected = dataset.rows.filter((row) => row.emphasis);
  const limitations = dataset.rows.filter((row) => !row.emphasis);
  return (
    <TaxChartCard
      dataset={dataset}
      reading={
        dataset.rows.length === 0
          ? "Aucune donnée manquante déclarée par le planificateur ni par les moteurs sur ce périmètre."
          : "Une pièce absente de PROBANT ne présume pas d'un défaut de dépôt auprès de l'administration."
      }
    >
      {expected.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
          {expected.map((row, index) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "2px 14px",
                padding: "13px 2px",
                borderBottom: index === expected.length - 1 ? undefined : "1px solid rgba(255,255,255,.06)",
              }}
            >
              <span style={{ flex: "1 1 180px", fontSize: FONT.table, color: T.text }}>
                <span aria-hidden="true" style={{ color: T.warning }}>⚠ </span>
                {row.cells.piece}
              </span>
              <span style={{ fontSize: FONT.meta, color: T.warning }}>{row.cells.kind}</span>
              <span style={{ ...AMOUNT, flexBasis: "100%", fontSize: 11, color: INK_FAINT, whiteSpace: "normal" }}>
                {row.cells.controls}
              </span>
            </li>
          ))}
        </ul>
      )}
      {limitations.map((row) => (
        <div
          key={row.id}
          style={{ marginTop: 12, borderRadius: 12, background: ELEVATION[2], padding: "16px 18px" }}
        >
          <div style={{ ...EYEBROW, letterSpacing: ".14em" }}>Limitation documentée · {row.cells.kind}</div>
          <p style={{ margin: "8px 0 0", fontSize: FONT.table, lineHeight: 1.65, color: "#9ca7b8" }}>
            {row.cells.piece}
          </p>
        </div>
      ))}
    </TaxChartCard>
  );
}
