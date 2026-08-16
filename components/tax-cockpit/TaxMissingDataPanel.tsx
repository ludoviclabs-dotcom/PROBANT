"use client";

/**
 * Données manquantes et pièces requises : codes `missingData` du planificateur
 * (TAX-04) et limitations des moteurs, avec leur résolvabilité. Une pièce
 * absente de PROBANT ne signifie pas qu'elle n'a pas été produite à
 * l'administration — la nuance est portée par le dataset.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T } from "@/components/synthesis/tokens";
import { AccessibleTaxChartTable, TaxMethodologyPopover, TaxSourceFootnote } from "./TaxSourceFootnote";

export function TaxMissingDataPanel({
  dataset,
}: {
  dataset: TaxCockpitDatasets["requiredDocuments"];
}) {
  return (
    <section
      aria-label={dataset.title}
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        background: T.surface2,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <h3 style={{ margin: 0, fontSize: FONT.body, fontWeight: 600, color: T.text }}>
          {dataset.title} · <span className="tnum">{dataset.rows.length}</span>
        </h3>
        <TaxMethodologyPopover dataset={dataset} />
      </div>
      {dataset.rows.length === 0 ? (
        <p style={{ margin: "10px 0 0", fontSize: FONT.table, color: T.muted }}>
          Aucune donnée manquante déclarée par le planificateur ni par les moteurs sur ce périmètre.
        </p>
      ) : (
        <ul
          style={{
            margin: "10px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {dataset.rows.map((row) => (
            <li
              key={row.id}
              style={{
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                background: T.surface3,
                padding: "8px 12px",
                display: "flex",
                flexWrap: "wrap",
                gap: "2px 14px",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: FONT.table, fontWeight: 600, color: T.text }}>
                {row.cells.piece}
              </span>
              <span style={{ fontSize: FONT.meta, color: T.warning }}>{row.cells.kind}</span>
              <span style={{ fontSize: FONT.meta, color: T.muted, fontFamily: "monospace" }}>
                {row.cells.controls}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AccessibleTaxChartTable dataset={dataset} />
      <TaxSourceFootnote dataset={dataset} />
    </section>
  );
}
