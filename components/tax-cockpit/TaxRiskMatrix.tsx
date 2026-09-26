"use client";

/**
 * Infographie de couverture (acte III) : matrice impôt × cycle fusionnée avec
 * la barre de couverture. Chaque cellule porte le nombre de contrôles, une
 * micro-barre décomposant ses sorties et, en filet, le statut le plus
 * prioritaire — en TEXTE, la couleur n'est qu'un renfort. Cellules
 * focusables ; le détail est annoncé dans une zone `aria-live`.
 */

import { useState } from "react";
import type { TaxCockpitDatasets, TaxRiskMatrixCell } from "@/lib/tax/cockpit";
import { TAX_TYPE_LABEL } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AMOUNT, ELEVATION, FAMILY, INK_FAINT } from "./cockpit-style";
import { TaxControlCoverageBar } from "./TaxControlCoverageBar";
import { SourcesDisclosure, TaxMethodologyPopover } from "./TaxSourceFootnote";

const LABEL_WIDTH = 132;

function mixGradient(cell: TaxRiskMatrixCell): string {
  let at = 0;
  const stops = cell.outcomeMix.map((part) => {
    const from = (at / cell.controlCount) * 100;
    at += part.count;
    const to = (at / cell.controlCount) * 100;
    return `${TONE_COLOR[part.tone]} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  return stops.length > 0 ? `linear-gradient(90deg, ${stops.join(", ")})` : "rgba(255,255,255,.06)";
}

function mixText(cell: TaxRiskMatrixCell): string {
  return cell.outcomeMix.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(" · ");
}

export function TaxRiskMatrix({
  dataset,
  coverage,
}: {
  dataset: TaxCockpitDatasets["riskMatrix"];
  coverage?: TaxCockpitDatasets["coverage"];
}) {
  const [announcement, setAnnouncement] = useState("");

  return (
    <section aria-label={dataset.title}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <TaxMethodologyPopover dataset={dataset} />
      </div>
      {dataset.cells.length === 0 ? (
        <p style={{ margin: "12px 0 0", fontSize: FONT.table, color: T.muted }}>
          Aucun contrôle exécuté sur ce périmètre.
        </p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {dataset.taxes.map((taxType) => {
            const cells = dataset.cells.filter((cell) => cell.taxType === taxType);
            return (
              <div
                key={taxType}
                role="group"
                aria-label={TAX_TYPE_LABEL[taxType]}
                style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}
              >
                <div
                  style={{
                    width: LABEL_WIDTH,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    fontFamily: FAMILY.sans,
                    fontSize: FONT.table,
                    color: "#c7d3e4",
                  }}
                >
                  {TAX_TYPE_LABEL[taxType]}
                </div>
                <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {cells.map((cell) => {
                    const label = `${cell.cycle} × ${TAX_TYPE_LABEL[taxType]} : ${cell.controlCount} contrôle(s) — ${mixText(cell)}. Statut le plus prioritaire : ${cell.worstOutcomeLabel ?? "aucun"}.`;
                    return (
                      <div
                        key={`${taxType}:${cell.cycle}`}
                        tabIndex={0}
                        role="img"
                        aria-label={label}
                        title={label}
                        className="pbz-focusable pbz-hoverable"
                        onFocus={() => setAnnouncement(label)}
                        onMouseEnter={() => setAnnouncement(label)}
                        style={{
                          flex: "1 1 170px",
                          minWidth: 0,
                          borderRadius: 10,
                          background: ELEVATION[2],
                          padding: "12px 14px",
                          borderBottom: `3px solid ${TONE_COLOR[cell.tone]}`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ ...AMOUNT, fontSize: 18, color: T.text }}>{cell.controlCount}</span>
                          <span style={{ fontSize: FONT.meta, fontWeight: 600, color: TONE_COLOR[cell.tone] }}>
                            <span aria-hidden="true">{TONE_PREFIX[cell.tone]} </span>
                            {cell.worstOutcomeLabel ?? "—"}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: FONT.meta, color: "#c7d3e4" }}>{cell.cycle}</div>
                        <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4, color: INK_FAINT }}>{mixText(cell)}</div>
                        <div
                          aria-hidden="true"
                          className="pbz-bar"
                          style={{ marginTop: 10, height: 4, borderRadius: 3, background: mixGradient(cell) }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {coverage && (
        <div style={{ marginTop: 22 }}>
          <TaxControlCoverageBar dataset={coverage} labelWidth={LABEL_WIDTH} />
        </div>
      )}
      <p aria-live="polite" style={{ margin: "10px 0 0", minHeight: 18, fontSize: FONT.meta, color: T.muted }}>
        {announcement}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: FONT.meta, lineHeight: 1.6, color: INK_FAINT }}>
        Une sortie « non concluant » n&apos;est pas une anomalie : c&apos;est une procédure supplémentaire à
        programmer (ISA 330). Le niveau de preuve retenu est le plus faible niveau nécessaire à la conclusion,
        jamais une moyenne.
      </p>
      <SourcesDisclosure dataset={dataset} style={{ marginTop: 12 }} />
    </section>
  );
}
