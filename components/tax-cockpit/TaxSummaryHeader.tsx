"use client";

/**
 * Bandeau de synthèse du cockpit fiscalité : entité, période, unité, statut
 * d'attention (`headlineStatus`) et empreinte du snapshot. Aucun score global —
 * le statut affiché est le premier de l'ordre de présentation de la taxonomie,
 * avec sa version de politique.
 */

import type { TaxCockpitSummary } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";

export function TaxSummaryHeader({ summary }: { summary: TaxCockpitSummary }) {
  const toneColor = TONE_COLOR[summary.headlineTone];
  return (
    <header
      aria-label="Synthèse fiscale du dossier"
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        background: T.surface2,
        padding: "16px 18px",
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 28px",
        alignItems: "baseline",
      }}
    >
      <div>
        <div
          style={{
            fontSize: FONT.meta - 2,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: ".09em",
            color: T.muted,
          }}
        >
          Fiscalité — contrôles &amp; réconciliations
        </div>
        <h2 style={{ margin: "3px 0 0", fontSize: FONT.body + 4, fontWeight: 700, color: T.text }}>
          {summary.entityName} · {summary.periodLabel}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: FONT.meta, color: T.muted }}>
          Montants en euros ({summary.currency}) · snapshot généré le{" "}
          <time dateTime={summary.generatedAt}>{summary.generatedAt.slice(0, 10)}</time>
        </p>
      </div>
      <div style={{ minWidth: 220 }}>
        <div style={{ fontSize: FONT.meta, color: T.muted }}>
          Statut d&apos;attention prioritaire
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: FONT.body,
            fontWeight: 700,
            color: toneColor,
          }}
        >
          <span aria-hidden="true">{TONE_PREFIX[summary.headlineTone]} </span>
          {summary.headlineLabel}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: FONT.meta, color: T.muted, maxWidth: 420 }}>
          {summary.headlineDetail}
        </p>
      </div>
      <dl
        style={{
          margin: 0,
          marginLeft: "auto",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 22px",
          fontSize: FONT.meta,
          color: T.muted,
        }}
      >
        <div>
          <dt style={{ color: T.muted }}>Empreinte du snapshot</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>
            {summary.snapshotHash.slice(0, 16)}…
          </dd>
        </div>
        <div>
          <dt style={{ color: T.muted }}>Politique de statut</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>{summary.headlinePolicyVersion}</dd>
        </div>
        <div>
          <dt style={{ color: T.muted }}>Moteurs</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>
            {summary.engineVersions.length > 0 ? summary.engineVersions.join(" · ") : "aucun"}
          </dd>
        </div>
      </dl>
    </header>
  );
}
