"use client";

/**
 * Niveau DÉCISION — la première chose lue.
 *
 * Verdict catégoriel du moteur + les six éléments de décision (admissibilité,
 * blocages, couverture, revue, exposition validée, prochaine action). Aucun
 * compteur animé depuis zéro, aucune pulsation : les chiffres sont affichés
 * tels que le snapshot les porte.
 */

import type { SynthesisDatasets } from "@/lib/visualization/types";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "./tokens";

export function DecisionHeader({
  decision,
  onDownloadNote,
}: {
  decision: SynthesisDatasets["decision"];
  onDownloadNote: () => void;
}) {
  const tone = TONE_COLOR[decision.verdictTone];
  return (
    <section
      aria-label="Décision"
      style={{
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 16,
        background: `linear-gradient(135deg,${T.surface2} 0%,${T.surface} 60%)`,
        padding: "20px 24px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 420px", minWidth: 280 }}>
          <div
            style={{
              fontSize: FONT.meta - 2,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: T.faint,
            }}
          >
            État du dossier — verdict du moteur de Synthèse
          </div>
          <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: tone }}>
            <span aria-hidden="true">{TONE_PREFIX[decision.verdictTone]} </span>
            {decision.verdictHeadline}
          </h2>
          <p style={{ margin: "8px 0 0", maxWidth: 640, fontSize: FONT.body, lineHeight: 1.55, color: T.text }}>
            {decision.verdictDetail}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 210 }}>
          <button
            type="button"
            className="pbz-focusable"
            onClick={onDownloadNote}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              border: `1px solid ${T.border}`,
              borderRadius: 11,
              background: T.surface2,
              color: T.text,
              padding: "11px 16px",
              fontSize: FONT.body,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round">
              <path d="M14 3v4a1 1 0 0 0 1 1h4" />
              <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M9 13h6" />
              <path d="M9 17h3" />
            </svg>
            Générer la note de synthèse
          </button>
          <div style={{ fontSize: FONT.meta, color: T.faint, fontFamily: "monospace", textAlign: "center" }}>
            snapshot <span title={decision.snapshotHash}>{decision.snapshotHash.slice(0, 12)}…</span> · moteur {decision.engineVersion}
          </div>
        </div>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 10,
          margin: "18px 0 0",
        }}
      >
        {decision.items.map((item) => (
          <div
            key={item.id}
            style={{
              border: `1px solid ${T.border}`,
              borderTop: `2px solid ${TONE_COLOR[item.tone]}`,
              borderRadius: 12,
              background: T.surface2,
              padding: "12px 14px",
            }}
          >
            <dt style={{ fontSize: FONT.meta, fontWeight: 600, color: T.muted }}>{item.label}</dt>
            <dd style={{ margin: "4px 0 0", fontSize: item.id === "prochaine-action" ? FONT.body : 18, fontWeight: item.id === "prochaine-action" ? 500 : 700, lineHeight: 1.45, color: T.text }}>
              {item.tone !== "neutral" && <span aria-hidden="true">{TONE_PREFIX[item.tone]} </span>}
              {item.value}
            </dd>
            {item.detail && (
              <dd style={{ margin: "3px 0 0", fontSize: FONT.meta, color: T.faint }}>{item.detail}</dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
