"use client";

/**
 * Écarts relevés et candidats de revue (dataset `exposure`), avec les
 * périodes concernées. Une somme d'écarts est une grandeur de revue : ni un
 * redressement, ni une exposition certaine — le rappel est porté en clair.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { FONT, T } from "@/components/synthesis/tokens";
import { AMOUNT, ELEVATION, EYEBROW, INK_FAINT } from "./cockpit-style";
import { formatDay } from "./narrative";
import { TaxChartCard } from "./TaxSourceFootnote";

export function TaxExposurePanel({
  dataset,
  periods,
}: {
  dataset: VisualizationDataset;
  periods: VisualizationDataset;
}) {
  const differences = dataset.rows.filter((row) => row.id.startsWith("differences-") && row.emphasis);
  const reading =
    differences.length === 0
      ? "Aucun écart de rapprochement hors tolérance sur ce périmètre."
      : `${differences.length} impôt(s) présentent des écarts de rapprochement hors tolérance, à qualifier ligne à ligne dans l'acte III.`;
  return (
    <TaxChartCard dataset={dataset} reading={reading}>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
        {dataset.rows.map((row, index) => {
          const highlighted = Boolean(row.emphasis);
          return (
            <li
              key={row.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 14,
                padding: "13px 2px",
                borderBottom: index === dataset.rows.length - 1 ? undefined : "1px solid rgba(255,255,255,.06)",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: FONT.table, color: highlighted ? "#f5d76b" : "#9ca7b8" }}>
                  {row.cells.label}
                </span>
                <span style={{ display: "block", marginTop: 2, fontSize: FONT.meta, color: INK_FAINT }}>
                  {row.cells.note}
                </span>
              </span>
              <span
                style={{
                  ...AMOUNT,
                  fontSize: highlighted ? 20 : 14,
                  fontWeight: highlighted ? 500 : 400,
                  color: highlighted ? T.warning : T.text,
                }}
              >
                {row.cells.amount}
              </span>
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 14, borderRadius: 12, background: ELEVATION[2], padding: "16px 18px" }}>
        <div style={{ ...EYEBROW, letterSpacing: ".14em" }}>Ce qu&apos;un écart n&apos;est pas</div>
        <p style={{ margin: "8px 0 0", fontSize: FONT.table, lineHeight: 1.65, color: "#9ca7b8" }}>
          Un écart n&apos;est ni un redressement ni une exposition certaine. L&apos;analyse ligne à ligne fait
          foi — voir l&apos;acte III.
        </p>
      </div>
      {periods.rows.length > 0 && (
        <dl style={{ margin: "16px 0 0", display: "grid", gap: 6, fontSize: FONT.meta }}>
          {periods.rows.map((row) => (
            <div key={row.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", color: INK_FAINT }}>
              <dt style={{ color: T.muted }}>{row.cells.tax}</dt>
              <dd style={{ ...AMOUNT, margin: 0 }}>
                {formatDay(String(row.cells.start))} → {formatDay(String(row.cells.end))} · {row.cells.frequency} ·
                période {row.cells.status}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </TaxChartCard>
  );
}
