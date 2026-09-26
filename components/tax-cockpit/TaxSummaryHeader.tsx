"use client";

/**
 * ACTE 0 — barre de contexte sticky du cockpit fiscalité.
 *
 * Gauche : exercice, période, unité, import du FEC. Centre : stepper de la
 * revue (Données → Contrôles → Analyse → Décision). Droite : l'UNIQUE badge de
 * statut d'attention (`headlineStatus`, jamais un score) et l'empreinte du
 * snapshot, qui ouvre la méthodologie (politique de statut, moteurs).
 */

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Fingerprint, Upload } from "lucide-react";
import type { TaxCockpitSummary } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AMOUNT, FAMILY, HAIRLINE, INK_FAINT } from "./cockpit-style";
import { formatDay } from "./narrative";

export type ReviewStepId = "donnees" | "controles" | "analyse" | "decision";
export type ReviewStepState = "done" | "current" | "todo";

export interface ReviewStep {
  readonly id: ReviewStepId;
  readonly label: string;
  readonly state: ReviewStepState;
}

export function TaxSummaryHeader({
  summary,
  steps,
  attentionOpen,
  onStepSelect,
}: {
  summary: TaxCockpitSummary;
  steps: readonly ReviewStep[];
  /** Le point pulse tant que l'action d'attention n'a pas été traitée. */
  attentionOpen: boolean;
  onStepSelect?: (step: ReviewStepId) => void;
}) {
  const toneColor = TONE_COLOR[summary.headlineTone];
  const currentIndex = Math.max(0, steps.findIndex((step) => step.state === "current"));
  const pulsing = attentionOpen && summary.headlineTone !== "positive";

  return (
    <div
      role="region"
      aria-label="Synthèse fiscale du dossier"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "rgba(10,11,15,.82)",
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: "10px 20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontFamily: FAMILY.sans, fontSize: 13, fontWeight: 600, color: T.text }}>
              Exercice {summary.fiscalYear}
            </div>
            <div style={{ ...AMOUNT, fontSize: 11, color: INK_FAINT }}>
              {formatDay(summary.periodStart)} → {formatDay(summary.periodEnd)} · {summary.currency}
            </div>
          </div>
          <Link
            href="/dashboard/depot"
            className="pbz-focusable"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              borderRadius: 8,
              background: T.accent,
              padding: "7px 12px",
              fontSize: FONT.meta,
              fontWeight: 600,
              color: "#061019",
              whiteSpace: "nowrap",
            }}
          >
            <Upload aria-hidden="true" size={13} />
            Importer mon FEC
          </Link>
        </div>

        <nav
          aria-label="Étapes de la revue fiscale"
          style={{ margin: "0 auto", maxWidth: "100%", overflowX: "auto", scrollbarWidth: "none" }}
        >
          <div style={{ position: "relative", minWidth: steps.length * 108 }}>
          <ol
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
              margin: 0,
              padding: 0,
              listStyle: "none",
            }}
          >
            {steps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="pbz-focusable"
                  aria-current={step.state === "current" ? "step" : undefined}
                  onClick={() => onStepSelect?.(step.id)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    border: 0,
                    borderBottom: `2px solid ${step.state === "done" ? "rgba(34,197,94,.55)" : "transparent"}`,
                    background: "transparent",
                    padding: "6px 12px 8px",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    fontFamily: step.state === "current" ? FAMILY.sans : undefined,
                    fontSize: FONT.meta,
                    fontWeight: step.state === "current" ? 600 : 400,
                    color: step.state === "current" ? T.text : step.state === "done" ? T.muted : INK_FAINT,
                  }}
                >
                  {step.state === "done" ? (
                    <Check aria-hidden="true" size={13} color={T.positive} />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 99,
                        background: step.state === "current" ? T.warning : "transparent",
                        border: step.state === "current" ? 0 : `1px solid ${INK_FAINT}`,
                      }}
                    />
                  )}
                  {step.label}
                  <span style={visuallyHidden}>
                    {step.state === "done" ? " (franchie)" : step.state === "current" ? " (en cours)" : " (à venir)"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: `${100 / steps.length}%`,
                height: 2,
                background: T.warning,
                transform: `translateX(${currentIndex * 100}%)`,
                transition: "transform .35s cubic-bezier(.2,.7,.3,1)",
              }}
            />
          </div>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            role="status"
            title={summary.headlineDetail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              background: `${toneColor}1f`,
              padding: "6px 13px 6px 10px",
            }}
          >
            <span aria-hidden="true" style={{ position: "relative", display: "flex", width: 8, height: 8 }}>
              {pulsing && (
                <span
                  className="pbz-motion"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 99,
                    background: toneColor,
                    animation: "pbzPulseDot 2s ease-in-out infinite",
                  }}
                />
              )}
              <span style={{ position: "relative", width: 8, height: 8, borderRadius: 99, background: toneColor }} />
            </span>
            <span style={visuallyHidden}>Statut d&apos;attention prioritaire : </span>
            <span style={{ fontFamily: FAMILY.sans, fontSize: FONT.meta, fontWeight: 600, color: toneColor }}>
              <span aria-hidden="true">{TONE_PREFIX[summary.headlineTone]} </span>
              {summary.headlineLabel}
            </span>
          </div>
          <SnapshotMethodology summary={summary} />
        </div>
      </div>
    </div>
  );
}

function SnapshotMethodology({ summary }: { summary: TaxCockpitSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary.snapshotHash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="pbz-focusable"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Méthodologie et empreinte du snapshot ${summary.snapshotHash.slice(0, 8)}`}
        title={`${summary.snapshotHash.slice(0, 16)}…`}
        onClick={() => setOpen((value) => !value)}
        style={{
          ...AMOUNT,
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 8,
          background: "transparent",
          padding: "6px 10px",
          fontSize: 11,
          color: T.muted,
          cursor: "pointer",
        }}
      >
        <Fingerprint aria-hidden="true" size={13} />
        {summary.snapshotHash.slice(0, 8)}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Méthodologie et traçabilité"
          className="pbz-fade"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            width: 400,
            maxWidth: "calc(100vw - 32px)",
            zIndex: 50,
            border: `1px solid rgba(255,255,255,.1)`,
            borderRadius: 12,
            background: "#13161d",
            padding: "16px 18px",
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
          }}
        >
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", color: INK_FAINT }}>
            Méthodologie &amp; traçabilité
          </div>
          <dl style={{ margin: "12px 0 0", display: "grid", gap: 10, fontSize: FONT.meta }}>
            <div>
              <dt style={{ color: INK_FAINT }}>Empreinte du snapshot</dt>
              <dd style={{ ...AMOUNT, margin: "2px 0 0", color: T.text, whiteSpace: "normal", wordBreak: "break-all" }}>
                {summary.snapshotHash}
              </dd>
              <button
                type="button"
                className="pbz-focusable"
                onClick={() => void copy()}
                style={{
                  marginTop: 6,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 7,
                  background: "transparent",
                  padding: "3px 9px",
                  fontSize: FONT.meta,
                  color: T.muted,
                  cursor: "pointer",
                }}
              >
                {copied ? "Empreinte copiée" : "Copier l'empreinte"}
              </button>
            </div>
            <div>
              <dt style={{ color: INK_FAINT }}>Politique de statut</dt>
              <dd style={{ ...AMOUNT, margin: "2px 0 0", color: T.text }}>{summary.headlinePolicyVersion}</dd>
            </div>
            <div>
              <dt style={{ color: INK_FAINT }}>Moteurs</dt>
              <dd style={{ ...AMOUNT, margin: "2px 0 0", lineHeight: 1.7, color: T.text, whiteSpace: "normal" }}>
                {summary.engineVersions.length > 0
                  ? summary.engineVersions.map((version) => <div key={version}>{version}</div>)
                  : "aucun"}
              </dd>
            </div>
            <div>
              <dt style={{ color: INK_FAINT }}>Snapshot généré le</dt>
              <dd style={{ ...AMOUNT, margin: "2px 0 0", color: T.text }}>
                <time dateTime={summary.generatedAt}>{summary.generatedAt.slice(0, 10)}</time>
              </dd>
            </div>
          </dl>
          <p style={{ margin: "12px 0 0", fontSize: FONT.meta, lineHeight: 1.6, color: T.muted }}>
            {summary.headlineDetail}
          </p>
        </div>
      )}
    </div>
  );
}

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
