"use client";

/**
 * Waterfall d'exposition : un pont par poste et par sens (détecté → répétitions →
 * versions → hors agrégat → écartés → exposition initiale → en attente → corrigé →
 * anomalies non corrigées), puis l'effet sur le résultat (signé → impôt → net).
 *
 * SVG en barres horizontales — chaque étape porte son libellé ET son montant
 * en texte (l'information n'est jamais couleur seule). Les montants viennent
 * des `steps` du dataset, en centimes, jamais recalculés ici ; les ponts ne sont
 * jamais additionnés entre eux.
 */

import type { SynthesisDatasets, WaterfallStep } from "@/lib/visualization/types";
import { formatCents } from "@/lib/synthesis/money";
import { ChartCard } from "./SourceFootnote";
import { FONT, T } from "./tokens";

function groupSteps(steps: WaterfallStep[]): { group: string; steps: WaterfallStep[] }[] {
  const groups: { group: string; steps: WaterfallStep[] }[] = [];
  for (const step of steps) {
    const group = step.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.group === group) last.steps.push(step);
    else groups.push({ group, steps: [step] });
  }
  return groups;
}

export function ExposureWaterfall({ dataset }: { dataset: SynthesisDatasets["waterfall"] }) {
  const steps = dataset.steps;
  const maxAbs = Math.max(1, ...steps.map((s) => Math.abs(s.amountCents ?? 0)));

  return (
    <ChartCard dataset={dataset} eyebrow="Exposition">
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {groupSteps(steps).map(({ group, steps: groupItems }, gi) => (
          <div key={group || gi} data-waterfall-group={group} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: gi === 0 ? 0 : 12, borderTop: gi === 0 ? "none" : `1px solid ${T.border}` }}>
            {group && (
              <div style={{ fontSize: FONT.meta, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.faint }}>
                {group}
              </div>
            )}
            {groupItems.map((step) => {
              const unknown = step.amountCents === null;
              const width = unknown ? 0 : (Math.abs(step.amountCents as number) / maxAbs) * 100;
              const isTotalLike = step.kind === "subtotal" || step.kind === "total" || step.kind === "start";
              const color =
                step.kind === "total"
                  ? T.positive
                  : step.kind === "start"
                    ? T.accent
                    : step.kind === "subtotal"
                      ? T.violet
                      : (step.amountCents ?? 0) < 0
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
                      {step.kind === "delta" && !unknown ? ((step.amountCents as number) <= 0 ? "− " : "+ ") : ""}
                      {step.label}
                    </span>
                    <span
                      style={{
                        fontSize: FONT.table,
                        fontWeight: isTotalLike ? 700 : 500,
                        color: unknown ? T.warning : color,
                        fontFamily: "monospace",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {/* Une déduction porte son signe dans le libellé (« − ») : le montant s'affiche en valeur absolue. */}
                      {unknown ? "inconnu" : formatCents(step.kind === "delta" ? Math.abs(step.amountCents as number) : (step.amountCents as number))}
                    </span>
                  </div>
                  <div style={{ height: isTotalLike ? 13 : 9, borderRadius: 5, background: T.surface3, overflow: "hidden", border: `1px solid ${T.border}` }}>
                    <div
                      className="pbz-anim"
                      style={{ height: "100%", width: `${width}%`, background: color, transition: "width .4s ease" }}
                    />
                  </div>
                  {step.note && (
                    <div style={{ marginTop: 2, fontSize: FONT.meta, color: T.faint, overflowWrap: "anywhere" }}>{step.note}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
