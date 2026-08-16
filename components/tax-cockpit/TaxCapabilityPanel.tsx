"use client";

/**
 * NIVEAU 1 — capacité et décision. Huit cartes : impôts applicables,
 * documents, contrôles conclus / non conclus, anomalies confirmées, risques
 * potentiels, données manquantes, prochaine action. Les valeurs viennent du
 * dataset (compteurs des snapshots), jamais recomptées ici.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AccessibleTaxChartTable, TaxSourceFootnote } from "./TaxSourceFootnote";

export function TaxCapabilityPanel({
  dataset,
}: {
  dataset: TaxCockpitDatasets["capability"];
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
      <h3 style={{ margin: 0, fontSize: FONT.body, fontWeight: 600, color: T.text }}>
        {dataset.title}
      </h3>
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
        }}
      >
        {dataset.items.map((item) => {
          const toneColor = TONE_COLOR[item.tone];
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                background: T.surface3,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: FONT.meta, color: T.muted }}>{item.label}</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: item.id === "next-action" ? FONT.body : FONT.body + 4,
                  fontWeight: 700,
                  color: toneColor,
                  overflowWrap: "anywhere",
                }}
              >
                <span aria-hidden="true">{TONE_PREFIX[item.tone]} </span>
                {item.value}
              </div>
              {item.detail && (
                <p style={{ margin: "4px 0 0", fontSize: FONT.meta, color: T.muted }}>
                  {item.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <AccessibleTaxChartTable dataset={dataset} />
      <TaxSourceFootnote dataset={dataset} />
    </section>
  );
}
