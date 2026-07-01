"use client";

/**
 * Mini-card de statut affichée dans la séquence finale de la visite guidée pour
 * résumer le verdict du dossier démo : badge circulaire (loupe + symbole animé) +
 * titre + sous-ligne. La sous-ligne (`detail`) est fournie par l'appelant à partir
 * de vrais compteurs du dossier — jamais un chiffre ou un constat inventé ici.
 *
 *  - variant="ok"   → ✓ vert (tracé progressif), « Revue validée »
 *  - variant="risk" → ✗ rouge (scale + rotation), « Haut risque détecté »
 */

import { useEffect, useState } from "react";

export type DemoDocVariant = "ok" | "risk";

export function DemoDocumentIcon({
  variant,
  detail,
  delay = 0,
}: {
  variant: DemoDocVariant;
  /** Sous-ligne factuelle (issue de vrais compteurs, jamais inventée). */
  detail: string;
  delay?: number;
}) {
  const isOk = variant === "ok";
  const color = isOk ? "#22c55e" : "#ef4444";
  const title = isOk ? "Revue validée" : "Haut risque détecté";

  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDrawn(true), 300 + delay);
    return () => window.clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={`pb-demo-status-card pb-demo-status-${variant}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: 232,
        padding: "11px 14px",
        borderRadius: 13,
        background: "rgba(15,19,27,0.92)",
        border: `1px solid ${color}3d`,
        boxShadow: "0 10px 26px rgba(0,0,0,.4)",
        animation: `pb-doc-in .4s ${delay}ms ease both`,
        pointerEvents: "auto",
      }}
    >
      {/* Badge circulaire : loupe + symbole de verdict animé. */}
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" style={{ flexShrink: 0 }} aria-hidden>
        <circle cx="19" cy="19" r="18" fill={`${color}17`} stroke={`${color}55`} strokeWidth="1.3" />
        <circle cx="16" cy="16" r="6.4" fill="none" stroke={color} strokeWidth="2" opacity="0.55" />
        <line x1="20.5" y1="20.5" x2="25" y2="25" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />

        {isOk ? (
          <path
            d="M13.5 16 l2 2.4 l4 -5"
            stroke={color}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 14,
              strokeDashoffset: drawn ? 0 : 14,
              transition: "stroke-dashoffset .4s ease",
            }}
          />
        ) : (
          <g
            style={{
              transformOrigin: "16px 16px",
              transform: drawn ? "scale(1) rotate(0deg)" : "scale(0) rotate(-30deg)",
              transition: "transform .38s cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            <line x1="12.5" y1="12.5" x2="19.5" y2="19.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
            <line x1="19.5" y1="12.5" x2="12.5" y2="19.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
      </svg>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf6", lineHeight: 1.25 }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: "#8a99af", lineHeight: 1.35 }}>{detail}</div>
      </div>
    </div>
  );
}
