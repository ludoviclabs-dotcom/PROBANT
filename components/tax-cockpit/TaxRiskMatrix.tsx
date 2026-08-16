"use client";

/**
 * Matrice impôt × cycle. Chaque cellule porte le nombre de contrôles et le
 * statut le plus prioritaire — en TEXTE, la couleur n'est qu'un renfort.
 * Cellules focusables au clavier ; le détail est annoncé dans une zone
 * `aria-live` (même patron que la heatmap de Synthèse).
 */

import { useState } from "react";
import type { TaxCockpitDatasets, TaxRiskMatrixCell } from "@/lib/tax/cockpit";
import { TAX_TYPE_SHORT_LABEL } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { TaxChartCard } from "./TaxSourceFootnote";

export function TaxRiskMatrix({ dataset }: { dataset: TaxCockpitDatasets["riskMatrix"] }) {
  const [announcement, setAnnouncement] = useState("");
  const cellFor = (taxType: TaxRiskMatrixCell["taxType"], cycle: string) =>
    dataset.cells.find((cell) => cell.taxType === taxType && cell.cycle === cycle);

  return (
    <TaxChartCard dataset={dataset} eyebrow="Analyse">
      {dataset.cells.length === 0 ? (
        <p style={{ margin: 0, fontSize: FONT.table, color: T.muted }}>
          Aucun contrôle exécuté sur ce périmètre.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `minmax(120px, 1fr) repeat(${dataset.taxes.length}, minmax(120px, 1fr))`,
              gap: 6,
              minWidth: 360,
            }}
          >
            <div />
            {dataset.taxes.map((taxType) => (
              <div
                key={taxType}
                style={{
                  fontSize: FONT.meta,
                  fontWeight: 600,
                  color: T.muted,
                  textAlign: "center",
                }}
              >
                {TAX_TYPE_SHORT_LABEL[taxType]}
              </div>
            ))}
            {dataset.cycles.map((cycle) => (
              <CycleRow
                key={cycle}
                cycle={cycle}
                taxes={dataset.taxes}
                cellFor={cellFor}
                onAnnounce={setAnnouncement}
              />
            ))}
          </div>
          <p aria-live="polite" style={{ margin: "8px 0 0", fontSize: FONT.meta, color: T.muted, minHeight: 18 }}>
            {announcement}
          </p>
        </div>
      )}
    </TaxChartCard>
  );
}

function CycleRow({
  cycle,
  taxes,
  cellFor,
  onAnnounce,
}: {
  cycle: string;
  taxes: TaxCockpitDatasets["riskMatrix"]["taxes"];
  cellFor: (taxType: TaxRiskMatrixCell["taxType"], cycle: string) => TaxRiskMatrixCell | undefined;
  onAnnounce: (message: string) => void;
}) {
  return (
    <>
      <div
        style={{
          fontSize: FONT.meta,
          color: T.muted,
          display: "flex",
          alignItems: "center",
        }}
      >
        {cycle}
      </div>
      {taxes.map((taxType) => {
        const cell = cellFor(taxType, cycle);
        if (!cell) {
          return (
            <div
              key={`${taxType}:${cycle}`}
              aria-hidden="true"
              style={{
                borderRadius: 8,
                border: `1px dashed ${T.border}`,
                minHeight: 44,
              }}
            />
          );
        }
        const label = `${cycle} × ${TAX_TYPE_SHORT_LABEL[taxType]} : ${cell.controlCount} contrôle(s), statut le plus prioritaire ${cell.worstOutcomeLabel ?? "aucun"}.`;
        return (
          <div
            key={`${taxType}:${cycle}`}
            tabIndex={0}
            className="pbz-focusable"
            aria-label={label}
            onFocus={() => onAnnounce(label)}
            onMouseEnter={() => onAnnounce(label)}
            style={{
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.surface3,
              padding: "6px 8px",
              minHeight: 44,
            }}
          >
            <div
              style={{
                fontSize: FONT.meta,
                fontWeight: 700,
                color: TONE_COLOR[cell.tone],
              }}
            >
              <span aria-hidden="true">{TONE_PREFIX[cell.tone]} </span>
              {cell.worstOutcomeLabel ?? "—"}
            </div>
            <div style={{ fontSize: FONT.meta, color: T.muted }}>
              <span className="tnum">{cell.controlCount}</span> contrôle(s)
            </div>
          </div>
        );
      })}
    </>
  );
}
