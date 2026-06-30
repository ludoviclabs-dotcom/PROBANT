"use client";

/**
 * Icône « feuille de document » (style fichier Windows/Finder) affichée dans la
 * séquence finale de la visite guidée pour résumer le verdict du dossier démo.
 *
 *  - variant="ok"   → loupe grise + ✓ vert (tracé progressif), « Revue validée »
 *  - variant="risk" → loupe grise + ✗ rouge (scale + rotation), « Haut risque détecté »
 *
 * SVG inline (aucun import externe) pour garantir l'animation CSS. Le délai
 * `delay` décale l'entrée ET le tracé du symbole (utilisé pour échelonner deux
 * icônes côte à côte).
 */

import { useEffect, useState } from "react";

export type DemoDocVariant = "ok" | "risk";

export function DemoDocumentIcon({
  variant,
  delay = 0,
}: {
  variant: DemoDocVariant;
  delay?: number;
}) {
  const isOk = variant === "ok";
  const color = isOk ? "#22c55e" : "#ef4444";
  const label = isOk ? "Revue validée" : "Haut risque détecté";

  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDrawn(true), 300 + delay);
    return () => window.clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="flex flex-col items-center gap-2"
      style={{ animation: `pb-doc-in .4s ${delay}ms ease both` }}
    >
      <svg
        width="80"
        height="100"
        viewBox="0 0 80 100"
        fill="none"
        style={{ filter: "drop-shadow(0 8px 18px rgba(0,0,0,.45))" }}
        aria-hidden
      >
        {/* Feuille + coin supérieur droit plié */}
        <path
          d="M14 5 H49 L66 22 V93 A2 2 0 0 1 64 95 H16 A2 2 0 0 1 14 93 Z"
          fill="#f9f9f9"
          stroke="#cbd2dc"
          strokeWidth="2"
        />
        <path d="M49 5 V20 A2 2 0 0 0 51 22 H66 Z" fill="#e3e8ef" stroke="#cbd2dc" strokeWidth="2" />

        {/* Loupe grise */}
        <circle cx="33" cy="52" r="13" fill="#ffffff" stroke="#9aa6b6" strokeWidth="3" />
        <line x1="43" y1="62" x2="53" y2="72" stroke="#9aa6b6" strokeWidth="3.5" strokeLinecap="round" />

        {/* Symbole de verdict en superposition (centré dans la loupe) */}
        {isOk ? (
          <path
            d="M27 52 l4.5 5 l8.5 -10"
            stroke={color}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 30,
              strokeDashoffset: drawn ? 0 : 30,
              transition: "stroke-dashoffset .4s ease",
            }}
          />
        ) : (
          <g
            style={{
              transformOrigin: "33px 52px",
              transform: drawn ? "scale(1) rotate(0deg)" : "scale(0) rotate(-30deg)",
              transition: "transform .38s cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            <line x1="26" y1="45" x2="40" y2="59" stroke={color} strokeWidth="3.8" strokeLinecap="round" />
            <line x1="40" y1="45" x2="26" y2="59" stroke={color} strokeWidth="3.8" strokeLinecap="round" />
          </g>
        )}
      </svg>

      <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
