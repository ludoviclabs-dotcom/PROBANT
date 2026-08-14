"use client";

/**
 * Waterfall d'exposition : brut → doublons → écartés → en attente →
 * ajustements confirmés → fiscalité → effet net.
 *
 * SVG en barres horizontales — chaque étape porte son libellé ET son montant
 * en texte (l'information n'est jamais couleur seule). Les montants viennent
 * des `steps` du dataset, en centimes, jamais recalculés ici.
 */

import type { SynthesisDatasets } from "@/lib/visualization/types";
import { formatCents } from "@/lib/synthesis/money";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

export function ExposureWaterfall({ dataset }: { dataset: SynthesisDatasets["waterfall"] }) {
  const steps = dataset.steps;
  const maxAbs = Math.max(1, ...steps.map((s) => Math.abs(s.amountCents)));

  return (
    <ChartCard dataset={dataset} eyebrow="Exposition">
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step) => {
          const width = (Math.abs(step.amountCents) / maxAbs) * 100;
          const isTotalLike = step.kind === "subtotal" || step.kind === "total" || step.kind === "start";
          const color =
            step.kind === "total"
              ? T.positive
              : step.kind === "start"
                ? T.accent
                : step.kind === "subtotal"
                  ? T.violet
                  : step.amountCents < 0
                    ? T.orange
                    : T.warning;
          return (
            <div key={step.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: FONT.table,
                    fontWeight: isTotalLike ? 700 : 400,
                    color: isTotalLike ? T.text : T.muted,
                  }}
                >
                  {step.kind === "delta" ? (step.amountCents <= 0 ? "− " : "+ ") : ""}
                  {step.label}
                </span>
                <span
                  style={{
                    fontSize: FONT.table,
                    fontWeight: isTotalLike ? 700 : 500,
                    color,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatCents(step.amountCents)}
                </span>
              </div>
              <div style={{ height: isTotalLike ? 13 : 9, borderRadius: 5, background: T.surface3, overflow: "hidden", border: `1px solid ${T.border}` }}>
                <div
                  className="pbz-anim"
                  style={{ height: "100%", width: `${width}%`, background: color, transition: "width .4s ease" }}
                />
              </div>
              {step.note && (
                <div style={{ marginTop: 2, fontSize: FONT.meta, color: T.faint }}>{step.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
