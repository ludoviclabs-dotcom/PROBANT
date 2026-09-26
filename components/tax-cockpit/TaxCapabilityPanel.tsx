"use client";

/**
 * ACTE I — le verdict. Phrase de synthèse générée depuis les compteurs du
 * dataset, ruban de cinq métriques inline (pas de cartes), une seule
 * « prochaine action » et la scène de la chaîne de preuve. Les huit
 * indicateurs du dataset restent consultables dans « Sources et
 * méthodologie ». Aucune valeur n'est recomptée ici.
 */

import { AlertTriangle } from "lucide-react";
import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR } from "@/components/synthesis/tokens";
import { AMOUNT, EYEBROW, FAMILY, HAIRLINE, INK_FAINT } from "./cockpit-style";
import { verdictContext, verdictSentence } from "./narrative";
import { Reveal } from "./Reveal";
import { SourcesDisclosure } from "./TaxSourceFootnote";
import { proofLayersFrom, TaxProofChainScene, type ProofLayerTarget } from "./TaxProofChainScene";

interface RibbonMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly suffix?: string;
  readonly color: string;
  readonly explainer: string;
}

function ribbonMetrics(datasets: TaxCockpitDatasets): RibbonMetric[] {
  const { capability, coverage } = datasets;
  const find = (id: string) => capability.items.find((candidate) => candidate.id === id);
  const metrics: RibbonMetric[] = [];
  const taxes = find("applicable-taxes");
  if (taxes) {
    metrics.push({
      id: taxes.id,
      label: taxes.label,
      value: taxes.value,
      color: T.text,
      explainer: `Impôts applicables au dossier : ${taxes.detail ?? "aucun"}.`,
    });
  }
  const concluded = find("controls-concluded");
  if (concluded) {
    metrics.push({
      id: concluded.id,
      label: concluded.label,
      value: concluded.value,
      suffix: `/${coverage.totalControls}`,
      color: T.text,
      explainer: `${concluded.value} contrôle(s) sur ${coverage.totalControls} exécuté(s) ont abouti à une conclusion. ${concluded.detail ?? ""}`.trim(),
    });
  }
  const difference = coverage.segments.find((segment) => segment.key === "difference");
  if (difference) {
    metrics.push({
      id: "incoherences",
      label: difference.count > 1 ? "Incohérences" : "Incohérence",
      value: String(difference.count),
      color: difference.count > 0 ? TONE_COLOR.critical : T.text,
      explainer: "Contrôles dont la sortie est « Incohérence » ou « Anomalie confirmée » : un écart de rapprochement entre deux sources, à analyser.",
    });
  }
  const risks = find("potential-risks");
  if (risks) {
    metrics.push({
      id: risks.id,
      label: "Écarts à qualifier",
      value: risks.value,
      color: T.text,
      explainer: risks.detail ?? risks.label,
    });
  }
  const missing = find("missing-data");
  if (missing) {
    metrics.push({
      id: missing.id,
      label: Number(missing.value) > 1 ? "Données manquantes" : "Donnée manquante",
      value: missing.value,
      color: Number(missing.value) > 0 ? TONE_COLOR.warning : T.text,
      explainer: `Contrôles bloqués par une information absente du dossier. ${missing.detail ?? ""}`.trim(),
    });
  }
  return metrics;
}

export function TaxCapabilityPanel({
  datasets,
  show3d = true,
  onPrepareNextAction,
  onNavigate,
}: {
  datasets: TaxCockpitDatasets;
  show3d?: boolean;
  /** Pré-remplit la barre de décision avec le constat visé par la prochaine action. */
  onPrepareNextAction?: () => void;
  onNavigate?: (target: ProofLayerTarget) => void;
}) {
  const dataset = datasets.capability;
  const metrics = ribbonMetrics(datasets);
  const nextAction = dataset.nextAction;

  return (
    <section
      id="tax-act-verdict"
      aria-labelledby="tax-act-verdict-title"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px 0", scrollMarginTop: 72 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <Reveal style={{ flex: "1 1 440px", minWidth: 0 }}>
          <div style={EYEBROW}>Acte I · Le verdict</div>
          <h2
            id="tax-act-verdict-title"
            style={{
              margin: "14px 0 0",
              fontFamily: FAMILY.editorial,
              fontSize: "clamp(28px, 3.4vw, 42px)",
              fontWeight: 400,
              lineHeight: 1.18,
              letterSpacing: "-.01em",
              color: T.text,
              textWrap: "pretty",
            }}
          >
            {verdictSentence(datasets)}
          </h2>
          <p style={{ margin: "16px 0 0", maxWidth: "62ch", fontSize: FONT.body, lineHeight: 1.7, color: T.muted }}>
            {verdictContext(datasets)}
          </p>

          <dl
            aria-label={dataset.title}
            style={{ margin: "32px 0 0", display: "flex", flexWrap: "wrap", rowGap: 22, alignItems: "flex-start" }}
          >
            {metrics.map((metric, index) => (
              <div
                key={metric.id}
                title={metric.explainer}
                className="pbz-reveal-in"
                style={{
                  display: "flex",
                  flexDirection: "column-reverse",
                  padding: index === 0 ? "0 28px 0 0" : index === metrics.length - 1 ? "0 0 0 28px" : "0 28px",
                  borderLeft: index === 0 ? undefined : `1px solid ${HAIRLINE}`,
                  animationDelay: `${80 * (index + 1)}ms`,
                }}
              >
                <dt style={{ marginTop: 7, fontSize: 12, color: INK_FAINT }}>{metric.label}</dt>
                <dd
                  style={{
                    ...AMOUNT,
                    margin: 0,
                    fontSize: 34,
                    fontWeight: 500,
                    lineHeight: 1,
                    color: metric.color,
                  }}
                >
                  {metric.value}
                  {metric.suffix && <span style={{ fontSize: 18, color: INK_FAINT }}>{metric.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {show3d && (
          <Reveal delay={200} style={{ flex: "1 1 300px", maxWidth: 340, minWidth: 0 }}>
            <TaxProofChainScene layers={proofLayersFrom(datasets)} onSelect={onNavigate} />
          </Reveal>
        )}
      </div>

      <Reveal delay={120}>
        <div
          role="note"
          aria-label="Prochaine action"
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            borderRadius: 14,
            background: nextAction
              ? "linear-gradient(90deg, rgba(234,179,8,.14), rgba(234,179,8,.03))"
              : "rgba(255,255,255,.035)",
            padding: "18px 22px",
          }}
        >
          <AlertTriangle
            aria-hidden="true"
            size={20}
            color={nextAction ? T.warning : INK_FAINT}
            style={{ flexShrink: 0 }}
          />
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ fontFamily: FAMILY.sans, fontSize: 15, fontWeight: 600, color: nextAction ? "#f5d76b" : T.text }}>
              Prochaine action — {nextAction ? nextAction.title.toLowerCase() : "aucune action proposée"}
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.6, color: "#9ca7b8" }}>
              {nextAction
                ? `${nextAction.action}${nextAction.priority === "required" ? " Action requise par le planificateur de contrôles." : ""}`
                : "Les moteurs n'ont proposé aucune diligence complémentaire sur ce dossier."}
            </p>
          </div>
          {nextAction && onPrepareNextAction && (
            <button
              type="button"
              className="pbz-focusable"
              onClick={onPrepareNextAction}
              style={{
                border: 0,
                borderRadius: 9,
                background: T.warning,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#1a1403",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Préparer la décision
            </button>
          )}
        </div>
      </Reveal>
      <SourcesDisclosure dataset={dataset} style={{ marginTop: 14 }} />
    </section>
  );
}
