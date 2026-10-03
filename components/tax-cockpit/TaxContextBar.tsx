"use client";

/**
 * Acte 0 — barre de contexte sticky : exercice + CTA d'import, fil d'Ariane
 * de la revue, UN SEUL badge de statut d'attention et empreinte du snapshot.
 * Le référentiel, la politique de statut et les moteurs vivent dans le
 * popover « Méthodologie & traçabilité » (jamais affichés en permanence).
 */

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Fingerprint, Upload } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { REFERENTIEL_VERSION } from "@/lib/referentiel/sources";
import { formatIsoDate, type StepperStep, type TaxCockpitSummary } from "@/lib/tax/cockpit";
import { BODY, C, MONO, SANS, TONE } from "./fiscal-style";

export function TaxContextBar({
  summary,
  steps,
}: {
  summary: TaxCockpitSummary;
  steps: readonly StepperStep[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyHash = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(summary.snapshotHash).then(
      () => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  const tone = TONE[summary.headlineTone];
  const attention = summary.headlineTone === "warning" || summary.headlineTone === "critical";
  const badgeBg =
    summary.headlineTone === "critical"
      ? "rgba(239,68,68,.12)"
      : summary.headlineTone === "positive"
        ? "rgba(34,197,94,.12)"
        : summary.headlineTone === "neutral"
          ? "rgba(91,157,255,.12)"
          : "rgba(234,179,8,.12)";
  const badgeText = summary.headlineTone === "warning" ? C.amberSoft : tone;
  const shortHash = summary.snapshotHash.slice(0, 8);

  return (
    <div
      ref={rootRef}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        backdropFilter: "blur(14px)",
        background: "rgba(10,11,15,.82)",
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div
        className="fx-ctx-inner"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text }}>
              Exercice {summary.fiscalYear}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>
              {summary.periodStartDate && summary.periodEndDate
                ? `${formatIsoDate(summary.periodStartDate)} → ${formatIsoDate(summary.periodEndDate)} · ${summary.currency}`
                : summary.currency}
            </div>
          </div>
          <Link
            href="/onboarding"
            className="fx-btn-primary fx-cta"
            onClick={() => track("cta_clicked", { location: "demo_banner", variant: "banner" })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: 0,
              borderRadius: 8,
              background: C.accent,
              padding: "7px 12px",
              fontFamily: BODY,
              fontSize: 12,
              fontWeight: 600,
              color: "#061019",
              cursor: "pointer",
            }}
          >
            <Upload size={13} aria-hidden="true" />
            Importer mon FEC
          </Link>
        </div>

        <ReviewStepper steps={steps} className="fx-stepper" tone={tone} />

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            title={summary.headlineDetail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              background: badgeBg,
              padding: "6px 13px 6px 10px",
            }}
          >
            <span style={{ position: "relative", display: "flex", width: 8, height: 8 }} aria-hidden="true">
              {attention && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 99,
                    background: tone,
                    animation: "fxPulseDot 2s ease-in-out infinite",
                  }}
                />
              )}
              <span style={{ position: "relative", width: 8, height: 8, borderRadius: 99, background: tone }} />
            </span>
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: badgeText }}>
              {summary.headlineLabel}
            </span>
          </div>
          <button
            type="button"
            className="fx-btn-hash"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`Méthodologie et empreinte du snapshot ${shortHash}`}
            title={`${summary.snapshotHash.slice(0, 16)}…`}
            onClick={() => setOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 8,
              background: "transparent",
              padding: "6px 10px",
              fontFamily: MONO,
              fontSize: 11,
              color: C.muted,
              cursor: "pointer",
            }}
          >
            <Fingerprint size={13} aria-hidden="true" />
            <span className="fx-hash-text">{shortHash}</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          className="fx-pop"
          style={{
            position: "absolute",
            right: 24,
            top: "100%",
            width: 400,
            zIndex: 50,
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 12,
            background: C.panel,
            padding: "16px 18px",
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            animation: "fxFadeIn .18s ease-out both",
          }}
        >
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", color: C.muted }}>
            Méthodologie &amp; traçabilité
          </div>
          <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "1fr", gap: 10, fontSize: 12 }}>
            <PopRow term="Empreinte du snapshot">
              <span style={{ wordBreak: "break-all" }}>{summary.snapshotHash.slice(0, 16)}…</span>
              <button
                type="button"
                className="fx-link"
                onClick={copyHash}
                style={{
                  marginLeft: 10,
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  fontFamily: BODY,
                  fontSize: 11.5,
                  color: C.muted,
                  cursor: "pointer",
                }}
              >
                {copied ? "Empreinte copiée" : "Copier l'empreinte"}
              </button>
            </PopRow>
            <PopRow term="Politique de statut">{summary.headlinePolicyVersion}</PopRow>
            <PopRow term="Moteurs">
              {summary.engineVersions.length > 0
                ? summary.engineVersions.map((version) => (
                    <span key={version} style={{ display: "block", lineHeight: 1.7 }}>
                      {version}
                    </span>
                  ))
                : "aucun"}
            </PopRow>
            <PopRow term="Référentiel">
              v.{REFERENTIEL_VERSION} · snapshot généré le {summary.generatedAt.slice(0, 10)}
            </PopRow>
          </dl>
          <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.6, color: C.muted }}>
            Le statut affiché est le premier de l&apos;ordre de présentation de la taxonomie, pas une note
            globale.
          </p>
        </div>
      )}
    </div>
  );
}

function PopRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ color: C.faint }}>{term}</dt>
      <dd style={{ margin: "2px 0 0", fontFamily: MONO, color: C.text }}>{children}</dd>
    </div>
  );
}

/** Fil d'Ariane Données → Contrôles → Analyse → Décision (barre de contexte ; repris dans l'acte I sur mobile). */
export function ReviewStepper({
  steps,
  className,
  tone,
}: {
  steps: readonly StepperStep[];
  className: string;
  tone: string;
}) {
  return (
    <ol
      aria-label="Étapes de la revue fiscale"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        margin: "0 auto",
        padding: 0,
        listStyle: "none",
      }}
    >
      {steps.map((step, index) => {
        const accent = step.id === "analysis" || step.id === "data" ? tone : C.amber;
        const underline =
          step.state === "done"
            ? "rgba(34,197,94,.55)"
            : step.state === "current"
              ? step.id === "decision"
                ? C.accent
                : accent
              : "transparent";
        return (
          <li
            key={step.id}
            style={{ display: "flex", alignItems: "center" }}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                style={{ width: 18, height: 1, background: "rgba(255,255,255,.1)" }}
              />
            )}
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px 8px",
                borderBottom: `2px solid ${underline}`,
                whiteSpace: "nowrap",
              }}
            >
              {step.state === "done" ? (
                <Check size={13} color={C.green} aria-hidden="true" />
              ) : step.state === "current" ? (
                <span
                  aria-hidden="true"
                  style={{ width: 6, height: 6, borderRadius: 99, background: underline }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    border: `1px solid ${C.faint}`,
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: step.state === "current" ? SANS : undefined,
                  fontSize: 12,
                  fontWeight: step.state === "current" ? 600 : 400,
                  color:
                    step.state === "current" ? C.text : step.state === "done" ? C.muted : C.faint,
                }}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === "done" ? " — franchie" : step.state === "current" ? " — en cours" : " — à venir"}
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
