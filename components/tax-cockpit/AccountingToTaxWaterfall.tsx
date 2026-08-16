"use client";

/**
 * Waterfall résultat comptable → résultat fiscal → IS (moteur TAX-05).
 *
 * Règle d'affichage héritée du moteur : une étape « proposée » (candidat de
 * revue) montre sa magnitude mais reste VISUELLEMENT DISJOINTE du cumul —
 * barre en pointillés, libellé « hors cumul ». Le composant ne recalcule
 * jamais un montant : deltas et cumuls viennent du snapshot.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { FONT, T } from "@/components/synthesis/tokens";
import { TaxChartCard } from "./TaxSourceFootnote";

export function AccountingToTaxWaterfall({
  dataset,
}: {
  dataset: TaxCockpitDatasets["waterfall"];
}) {
  const steps = dataset.steps;
  if (steps.length === 0) {
    return (
      <TaxChartCard dataset={dataset} eyebrow="Calcul">
        <p style={{ margin: 0, fontSize: FONT.table, color: T.muted }}>{dataset.summary}</p>
      </TaxChartCard>
    );
  }
  const maxAbs = Math.max(
    1,
    ...steps.map((step) => Math.max(Math.abs(step.deltaCents), Math.abs(step.runningTotalCents))),
  );
  return (
    <TaxChartCard dataset={dataset} eyebrow="Calcul">
      <div
        role="img"
        aria-label={dataset.summary}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {steps.map((step) => {
          const isTotalLike = step.kind === "base" || step.kind === "subtotal" || step.kind === "total";
          const amount = isTotalLike ? step.runningTotalCents : step.deltaCents;
          const unavailable = step.status === "unavailable";
          const width = unavailable ? 0 : (Math.abs(amount) / maxAbs) * 100;
          const proposed = step.status === "proposed";
          const color = proposed
            ? T.warning
            : step.kind === "total"
              ? T.positive
              : step.kind === "base"
                ? T.accent
                : step.kind === "subtotal"
                  ? T.violet
                  : amount < 0
                    ? T.orange
                    : T.warning;
          return (
            <div key={step.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: FONT.table,
                    fontWeight: isTotalLike ? 700 : 400,
                    color: isTotalLike ? T.text : T.muted,
                  }}
                >
                  {step.kind === "delta" && !unavailable ? (amount < 0 ? "− " : "+ ") : ""}
                  {step.label}
                </span>
                <span
                  style={{
                    fontSize: FONT.table,
                    fontWeight: isTotalLike ? 700 : 500,
                    color: unavailable ? T.muted : color,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {unavailable ? "non disponible" : formatCents(amount)}
                </span>
              </div>
              <div
                style={{
                  height: isTotalLike ? 13 : 9,
                  borderRadius: 5,
                  background: T.surface3,
                  overflow: "hidden",
                  border: proposed ? `1px dashed ${T.warning}` : `1px solid ${T.border}`,
                }}
              >
                <div
                  className="pbz-anim"
                  style={{
                    height: "100%",
                    width: `${width}%`,
                    background: proposed ? "transparent" : color,
                    backgroundImage: proposed
                      ? `repeating-linear-gradient(45deg, ${T.warning}55 0 6px, transparent 6px 12px)`
                      : undefined,
                    transition: "width .4s ease",
                  }}
                />
              </div>
              {step.note && (
                <div style={{ marginTop: 2, fontSize: FONT.meta, color: T.muted }}>{step.note}</div>
              )}
            </div>
          );
        })}
        <p style={{ margin: "6px 0 0", fontSize: FONT.meta, color: T.muted }}>
          Résultat fiscal retenu :{" "}
          <strong style={{ color: T.text, fontFamily: "monospace" }}>
            {dataset.confirmedTaxResultCents === null
              ? "non disponible"
              : formatCents(dataset.confirmedTaxResultCents)}
          </strong>{" "}
          · borne intégrant les candidats :{" "}
          <strong style={{ color: T.text, fontFamily: "monospace" }}>
            {dataset.proposedTaxResultCents === null
              ? "non disponible"
              : formatCents(dataset.proposedTaxResultCents)}
          </strong>
        </p>
      </div>
    </TaxChartCard>
  );
}
