"use client";

import { useMemo } from "react";
import { useDemoCounter } from "./useDemoCounter";
import s from "./tour.module.css";

/**
 * Fiche « artefact connecté » : titre · valeur · note, reliée au cadre de l'étape par un filet qui se dessine.
 * Le contenu vient du script (`lib/demo/tour.ts`) ou d'une lecture du DOM rendu — jamais un chiffre inventé ici.
 *
 * Placement : autour du cadre (à droite, à gauche, dessous, dessus), ramené dans l'écran, la première position
 * qui ne recouvre ni la carte de narration ni la cible ; à défaut (cible plus grande que l'écran), un coin haut
 * du cadre, toujours hors de la carte.
 * `countUp` anime les nombres contenus dans `value`. pointer-events:none : purement informatif.
 */

const CALLOUT_W = 240;
const CALLOUT_EST_H = 96;
const GAP = 28;
const MARGIN = 12;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Segments de `value` : les nombres sont animés, le reste est rendu tel quel. */
function splitNumericSegments(value: string): (string | number)[] {
  return value
    .split(/(\d+)/)
    .filter((part) => part !== "")
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function DemoCallout({
  title,
  value,
  note,
  countUp = false,
  anchorRect,
  avoid,
  allowInside = true,
  viewport,
}: {
  title: string;
  value: string;
  note?: string;
  countUp?: boolean;
  anchorRect: DOMRect;
  /** Rectangles à ne pas recouvrir : carte de narration, bouton d'un moment « À vous ». */
  avoid: (DOMRect | null)[];
  /** Repli dans un coin du cadre autorisé (non sur mobile : la fiche y masquerait la cible). */
  allowInside?: boolean;
  /** Zone utile de l'écran (hauteur sans la frise). */
  viewport: { w: number; h: number };
}) {
  const progress = useDemoCounter(1000, 1100, countUp) / 1000;
  const segments = useMemo(() => splitNumericSegments(value), [value]);

  const layout = useMemo(() => {
    const a = anchorRect;
    const cy = Math.max(a.top + 40, Math.min(a.top + a.height / 2, a.bottom - 40));
    const cx = a.left + a.width / 2;
    const clampBox = (c: { left: number; top: number }) => ({
      left: Math.max(MARGIN, Math.min(c.left, viewport.w - CALLOUT_W - MARGIN)),
      top: Math.max(MARGIN, Math.min(c.top, viewport.h - CALLOUT_EST_H - MARGIN)),
    });
    const box = (c: { left: number; top: number }): Box => ({ left: c.left, top: c.top, right: c.left + CALLOUT_W, bottom: c.top + CALLOUT_EST_H });
    const avoidBoxes: Box[] = avoid
      .filter((r): r is DOMRect => r !== null)
      .map((r) => ({ left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 }));
    const anchorBox: Box = { left: a.left + 4, top: a.top + 4, right: a.right - 4, bottom: a.bottom - 4 };
    const free = (b: Box) => !avoidBoxes.some((x) => intersects(b, x));

    // 1. Autour du cadre, ramené dans l'écran : ni sur la carte, ni sur la cible.
    const around: { side: "left" | "right" | "top" | "bottom"; left: number; top: number }[] = [
      { side: "right", left: a.right + GAP, top: cy - CALLOUT_EST_H / 2 },
      { side: "left", left: a.left - GAP - CALLOUT_W, top: cy - CALLOUT_EST_H / 2 },
      { side: "bottom", left: cx - CALLOUT_W / 2, top: a.bottom + GAP },
      { side: "top", left: cx - CALLOUT_W / 2, top: a.top - GAP - CALLOUT_EST_H },
    ];
    let pick: { side: "left" | "right" | "top" | "bottom" | "inside"; left: number; top: number } | null = null;
    for (const c of around) {
      const k = clampBox(c);
      if (free(box(k)) && !intersects(box(k), anchorBox)) {
        pick = { side: c.side, ...k };
        break;
      }
    }
    // 2. Sinon, dans un coin haut du cadre (cible plus grande que l'écran), toujours hors de la carte.
    if (!pick && allowInside) {
      const inside = [
        { left: a.right - CALLOUT_W - 16, top: Math.max(a.top, MARGIN) + 16 },
        { left: a.left + 16, top: Math.max(a.top, MARGIN) + 16 },
      ].map(clampBox);
      const k = inside.find((c) => free(box(c)));
      if (k) pick = { side: "inside", ...k };
    }
    if (!pick) return null;
    const { left, top } = pick;

    // Filet : du bord de la fiche au bord du cadre le plus proche (aucun filet si la fiche est dans le cadre).
    if (pick.side === "inside") return { left, top, line: null };
    const card = { x: 0, y: 0 };
    const end = { x: 0, y: 0 };
    if (pick.side === "left" || pick.side === "right") {
      card.x = pick.side === "left" ? left + CALLOUT_W : left;
      card.y = top + CALLOUT_EST_H / 2;
      end.x = pick.side === "left" ? a.left : a.right;
      end.y = Math.max(a.top + 12, Math.min(card.y, a.bottom - 12));
    } else {
      card.x = left + CALLOUT_W / 2;
      card.y = pick.side === "top" ? top + CALLOUT_EST_H : top;
      end.x = Math.max(a.left + 12, Math.min(card.x, a.right - 12));
      end.y = pick.side === "top" ? a.top : a.bottom;
    }
    // Coude orthogonal : un filet de la charte, pas une courbe d'outil de débogage.
    const d =
      pick.side === "left" || pick.side === "right"
        ? `M ${card.x} ${card.y} H ${(card.x + end.x) / 2} V ${end.y} H ${end.x}`
        : `M ${card.x} ${card.y} V ${(card.y + end.y) / 2} H ${end.x} V ${end.y}`;
    return { left, top, line: { d, end } };
  }, [anchorRect, avoid, allowInside, viewport]);

  if (!layout) return null;

  return (
    <>
      {layout.line && (
        <svg aria-hidden className={s.calloutLink} width="100%" height="100%">
          <path d={layout.line.d} />
          <circle cx={layout.line.end.x} cy={layout.line.end.y} r={2.5} />
        </svg>
      )}
      <div role="note" aria-label={`${title} : ${value}`} className={s.callout} style={{ left: layout.left, top: layout.top }}>
        <div className={s.calloutKey}>{title}</div>
        <div className={s.calloutValue}>
          {countUp
            ? segments.map((seg, i) => (typeof seg === "number" ? <span key={i}>{Math.round(seg * progress)}</span> : <span key={i}>{seg}</span>))
            : value}
        </div>
        {note && <div className={s.calloutNote}>{note}</div>}
      </div>
    </>
  );
}
