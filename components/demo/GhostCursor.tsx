"use client";

import { useEffect, useRef, useState } from "react";
import s from "./tour.module.css";

/**
 * Point visé : le milieu du tracé pour une forme SVG (un flux de Sankey est une bande courbe, le centre de sa
 * boîte englobante peut tomber à côté), sinon le centre de l'élément ; toujours borné à la partie visible.
 */
function aimPoint(el: Element): { x: number; y: number } {
  let x: number;
  let y: number;
  const geo = el as SVGGeometryElement;
  const ctm = typeof geo.getScreenCTM === "function" ? geo.getScreenCTM() : null;
  if (typeof geo.getTotalLength === "function" && ctm) {
    const p = geo.getPointAtLength(geo.getTotalLength() / 2);
    x = ctm.a * p.x + ctm.c * p.y + ctm.e;
    y = ctm.b * p.x + ctm.d * p.y + ctm.f;
  } else {
    const r = el.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + Math.min(r.height / 2, 160);
  }
  return { x: Math.max(12, Math.min(window.innerWidth - 12, x)), y: Math.max(12, Math.min(window.innerHeight - 80, y)) };
}

/**
 * Curseur fantôme de la visite guidée : il voyage vers l'élément que `resolve` désigne (cible de l'étape, ou
 * bouton à cliquer pendant un moment « À vous »), marque son arrivée d'un anneau, puis notifie `onArrived`.
 *
 * - `resolve: null` masque le curseur mais garde sa dernière position (le voyage suivant part du bon endroit) ;
 * - `travelKey` force un nouveau voyage même si l'élément est le même ;
 * - sous `prefers-reduced-motion`, le curseur saute sans voyager.
 *
 * Dessin de la charte : flèche ivoire cernée d'un filet graphite, sans ombre portée. pointer-events:none.
 */
export function GhostCursor({
  resolve,
  travelKey,
  onArrived,
}: {
  resolve: (() => Element | null) | null;
  travelKey: string;
  onArrived: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [animated, setAnimated] = useState(false);
  const [ringNonce, setRingNonce] = useState(0);

  const posRef = useRef<{ x: number; y: number } | null>(null);
  const onArrivedRef = useRef(onArrived);
  useEffect(() => void (onArrivedRef.current = onArrived), [onArrived]);
  const resolveRef = useRef(resolve);
  useEffect(() => void (resolveRef.current = resolve), [resolve]);
  // Tir unique du voyage en cours, partagé entre `transitionend` et le minuteur de secours.
  const fireRef = useRef<(() => void) | null>(null);

  const visible = resolve !== null;

  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let timer = 0;
    let tries = 0;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      setRingNonce((n) => n + 1);
      onArrivedRef.current();
    };
    fireRef.current = fire;

    const seek = () => {
      const el = resolveRef.current?.();
      if (!el) {
        if (tries++ < 150) raf = requestAnimationFrame(seek);
        else fire(); // cible introuvable : ne bloque jamais la visite
        return;
      }
      const to = aimPoint(el);
      const from = posRef.current;
      posRef.current = to;
      if (reduced || !from) {
        setAnimated(false);
        setPos(to);
        timer = window.setTimeout(fire, 40);
        return;
      }
      setAnimated(true);
      setPos(to);
      timer = window.setTimeout(fire, 720);
    };
    seek();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
      fireRef.current = null;
    };
  }, [visible, travelKey]);

  if (!pos) return null;

  return (
    <div
      aria-hidden
      className={s.cursor}
      onTransitionEnd={(e) => {
        if (e.propertyName === "transform") fireRef.current?.();
      }}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: animated ? "transform 640ms cubic-bezier(.45,0,.25,1), opacity 240ms ease" : "opacity 240ms ease",
        opacity: visible ? 1 : 0,
      }}
    >
      {ringNonce > 0 && <span key={ringNonce} className={s.cursorRing} />}
      <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block", transform: "translate(-3px, -2px)" }}>
        <path
          d="M5 2 L5 17.6 L9.1 14.1 L11.5 19.6 L14 18.5 L11.6 13.1 L16.8 12.7 Z"
          fill="var(--pb-ink)"
          stroke="var(--pb-bg)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
