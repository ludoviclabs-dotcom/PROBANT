"use client";

import { useMemo } from "react";
import { useDemoCounter } from "./useDemoCounter";

/**
 * Callout card flottante « artefact connecté » : une mini-carte factuelle
 * (titre · valeur · note) reliée à la cible spotlightée par une ligne SVG qui
 * se dessine (`pb-draw-line`). Le contenu vient de `tour.ts` (étape courante)
 * — jamais un chiffre inventé ici.
 *
 * `countUp` anime les nombres contenus dans `value` (0 → n), avec une pastille
 * LIVE le temps de la montée. pointer-events:none : purement décoratif.
 */

const CALLOUT_W = 236;
const CALLOUT_EST_H = 92;

export type CalloutSide = "left" | "right" | "top" | "bottom";

/** Segments de `value` : les nombres sont animés, le reste est rendu tel quel. */
function splitNumericSegments(value: string): (string | number)[] {
  return value
    .split(/(\d+)/)
    .filter((s) => s !== "")
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

export function DemoCallout({
  title,
  value,
  note,
  countUp = false,
  anchorRect,
  side,
  viewport,
}: {
  title: string;
  value: string;
  note?: string;
  countUp?: boolean;
  anchorRect: DOMRect;
  side: CalloutSide;
  viewport: { w: number; h: number };
}) {
  // Progression partagée par tous les nombres de la valeur (easeOutQuart).
  const progress = useDemoCounter(1000, 1100, countUp) / 1000;
  const segments = useMemo(() => splitNumericSegments(value), [value]);
  const counting = countUp && progress < 1;

  const { card, line } = useMemo(() => {
    const gap = 42; // distance carte ↔ cible (la ligne vit dans cet espace)
    const cx = anchorRect.left + anchorRect.width / 2;
    const cy = anchorRect.top + anchorRect.height / 2;
    let left: number;
    let top: number;
    switch (side) {
      case "left":
        left = anchorRect.left - gap - CALLOUT_W;
        top = cy - CALLOUT_EST_H / 2 - 30;
        break;
      case "right":
        left = anchorRect.right + gap;
        top = cy - CALLOUT_EST_H / 2 - 30;
        break;
      case "top":
        left = cx + anchorRect.width * 0.22;
        top = anchorRect.top - gap - CALLOUT_EST_H;
        break;
      case "bottom":
      default:
        left = cx + anchorRect.width * 0.22;
        top = anchorRect.bottom + gap;
        break;
    }
    left = Math.max(12, Math.min(left, viewport.w - CALLOUT_W - 12));
    top = Math.max(12, Math.min(top, viewport.h - CALLOUT_EST_H - 12));

    // Extrémités de la ligne : bord de carte → bord de cible le plus proche.
    const cardEdge = { x: 0, y: 0 };
    const anchorEdge = { x: 0, y: 0 };
    if (side === "left" || side === "right") {
      cardEdge.x = side === "left" ? left + CALLOUT_W : left;
      cardEdge.y = top + CALLOUT_EST_H / 2;
      anchorEdge.x = side === "left" ? anchorRect.left : anchorRect.right;
      anchorEdge.y = Math.max(anchorRect.top + 16, Math.min(cardEdge.y, anchorRect.bottom - 16));
    } else {
      cardEdge.x = left + CALLOUT_W / 2;
      cardEdge.y = side === "top" ? top + CALLOUT_EST_H : top;
      anchorEdge.x = Math.max(anchorRect.left + 16, Math.min(cardEdge.x, anchorRect.right - 16));
      anchorEdge.y = side === "top" ? anchorRect.top : anchorRect.bottom;
    }
    // Légère courbure perpendiculaire pour éviter la ligne droite « outil debug ».
    const mx = (cardEdge.x + anchorEdge.x) / 2;
    const my = (cardEdge.y + anchorEdge.y) / 2;
    const bend = side === "left" || side === "right" ? { x: 0, y: 18 } : { x: 18, y: 0 };
    const d = `M ${cardEdge.x.toFixed(1)} ${cardEdge.y.toFixed(1)} Q ${(mx + bend.x).toFixed(1)} ${(my + bend.y).toFixed(1)}, ${anchorEdge.x.toFixed(1)} ${anchorEdge.y.toFixed(1)}`;
    return { card: { left, top }, line: { d, end: anchorEdge } };
  }, [anchorRect, side, viewport]);

  return (
    <>
      {/* Ligne de connexion carte → cible (se dessine, puis reste à 60 %). */}
      <svg
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 9995,
          pointerEvents: "none",
        }}
      >
        <path
          d={line.d}
          fill="none"
          stroke="var(--pb-accent, #5b9dff)"
          strokeWidth={1.5}
          strokeDasharray={300}
          style={{ animation: "pb-draw-line .7s ease .15s both" }}
        />
        <circle
          cx={line.end.x}
          cy={line.end.y}
          r={3}
          fill="var(--pb-accent, #5b9dff)"
          style={{ animation: "pbFadeIn .3s ease .6s both" }}
        />
      </svg>

      <div
        role="note"
        aria-label={`${title} : ${value}`}
        style={{
          position: "fixed",
          left: card.left,
          top: card.top,
          width: CALLOUT_W,
          zIndex: 9995,
          pointerEvents: "none",
          borderRadius: 12,
          border: "1px solid var(--pb-border-strong, #324563)",
          background: "color-mix(in srgb, var(--pb-surface, #111722) 96%, transparent)",
          boxShadow: "0 14px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(91,157,255,.12)",
          padding: "10px 13px 11px",
          animation: "pb-callout-in .32s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            color: "var(--pb-accent, #5b9dff)",
          }}
        >
          {title}
        </div>
        <div
          className="tnum"
          style={{
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--font-mono)",
            fontSize: 14.5,
            fontWeight: 700,
            color: "var(--pb-text, #e6edf6)",
          }}
        >
          <span>
            {countUp
              ? segments.map((seg, i) =>
                  typeof seg === "number" ? (
                    <span key={i}>{Math.round(seg * progress)}</span>
                  ) : (
                    <span key={i}>{seg}</span>
                  ),
                )
              : value}
          </span>
          {counting && <span className="pb-live-dot" aria-hidden />}
        </div>
        {note && (
          <div style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.4, color: "var(--pb-text-muted, #8a99af)" }}>
            {note}
          </div>
        )}
      </div>
    </>
  );
}
