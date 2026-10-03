"use client";

/**
 * Acte I — le verdict. Une phrase de synthèse générée depuis les datasets, un
 * ruban de cinq métriques (pas de cartes), la chaîne de preuve en 3D et UNE
 * seule prochaine action. Le statut d'attention n'apparaît qu'une fois, dans la
 * barre de contexte.
 */

import { AlertTriangle } from "lucide-react";
import {
  buildRibbon,
  buildVerdictHeadline,
  buildVerdictSupport,
  type StepperStep,
  type TaxCockpitDatasets,
} from "@/lib/tax/cockpit";
import { BODY, C, MONO, SANS, SERIF, TONE } from "./fiscal-style";
import { TaxProofChainScene } from "./TaxProofChainScene";
import { ReviewStepper } from "./TaxContextBar";

/** « Confirmer le taux… » → « confirmer le taux… » ; un sigle en tête (« IS … ») reste intact. */
const lowerFirst = (text: string) =>
  /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

const TONE_VALUE: Record<string, string> = {
  critical: C.red,
  warning: C.amber,
  positive: C.text,
  neutral: C.text,
};

export function TaxVerdict({
  datasets,
  steps,
  show3d = true,
  onTreatNextAction,
}: {
  datasets: TaxCockpitDatasets;
  /** Fil d'Ariane, repris ici sur mobile (la barre sticky n'a plus la place). */
  steps: readonly StepperStep[];
  show3d?: boolean;
  /** Ouvre la revue sur les constats liés à la recommandation. */
  onTreatNextAction?: (controlIds: readonly string[]) => void;
}) {
  const ribbon = buildRibbon(datasets);
  const next = datasets.capability.nextAction;
  return (
    <section
      aria-labelledby="tax-verdict-title"
      className="fx-section"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px 0" }}
    >
      <ReviewStepper steps={steps} className="fx-stepper-m" tone={TONE[datasets.summary.headlineTone]} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 440px", minWidth: 0, animation: "fxRiseIn .45s ease-out both" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".16em", color: C.faint }}>
            Acte I · Le verdict
          </div>
          <h2
            id="tax-verdict-title"
            className="fx-h-verdict"
            style={{
              margin: "14px 0 0",
              fontFamily: SERIF,
              fontSize: 42,
              fontWeight: 400,
              lineHeight: 1.18,
              letterSpacing: "-.01em",
              color: C.text,
              textWrap: "pretty",
            }}
          >
            {buildVerdictHeadline(datasets)}
          </h2>
          <p
            style={{
              margin: "16px 0 0",
              maxWidth: "62ch",
              fontSize: 14,
              lineHeight: 1.7,
              color: C.muted,
              textWrap: "pretty",
            }}
          >
            {buildVerdictSupport(datasets)}
          </p>

          <dl
            className="fx-ribbon"
            style={{ margin: "32px 0 0", display: "flex", flexWrap: "wrap", rowGap: 22, alignItems: "flex-start" }}
          >
            {ribbon.map((metric, index) => (
              <div
                key={metric.id}
                title={metric.tooltip}
                style={{
                  display: "flex",
                  flexDirection: "column-reverse",
                  padding:
                    index === 0 ? "0 28px 0 0" : index === ribbon.length - 1 ? "0 0 0 28px" : "0 28px",
                  borderLeft: index === 0 ? undefined : "1px solid rgba(255,255,255,.08)",
                  animation: `fxRiseIn .45s ease-out ${0.08 * (index + 1)}s both`,
                }}
              >
                <dd
                  style={{
                    margin: 0,
                    fontFamily: MONO,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 34,
                    fontWeight: 500,
                    lineHeight: 1,
                    color: TONE_VALUE[metric.tone],
                  }}
                >
                  {metric.value}
                  {metric.suffix && <span style={{ fontSize: 18, color: C.faint }}>{metric.suffix}</span>}
                </dd>
                <dt style={{ marginTop: 7, fontSize: 11.5, color: C.faint }}>{metric.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        {show3d && <TaxProofChainScene tone={datasets.summary.headlineTone} />}
      </div>

      {next && (
        <div
          className="fx-next"
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            borderRadius: 14,
            background: "linear-gradient(90deg, rgba(234,179,8,.14), rgba(234,179,8,.03))",
            padding: "18px 22px",
            animation: "fxRiseIn .45s ease-out .48s both",
          }}
        >
          <AlertTriangle size={20} color={TONE[datasets.capability.items.find((item) => item.id === "next-action")?.tone ?? "warning"]} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: C.amberSoft }}>
              Prochaine action — {lowerFirst(next.title)}
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.body }}>{next.action}</p>
          </div>
          <button
            type="button"
            className="fx-btn-amber"
            onClick={() => onTreatNextAction?.(next.controlIds)}
            disabled={!onTreatNextAction}
            style={{
              border: 0,
              borderRadius: 9,
              background: C.amber,
              padding: "10px 16px",
              fontFamily: BODY,
              fontSize: 13,
              fontWeight: 600,
              color: "#1A1403",
              cursor: onTreatNextAction ? "pointer" : "default",
              whiteSpace: "nowrap",
            }}
          >
            Traiter dans la revue
          </button>
        </div>
      )}
    </section>
  );
}
