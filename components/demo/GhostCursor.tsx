"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Curseur fantôme de la visite guidée : voyage en « spring » vers la cible
 * `data-tour` de l'étape courante, puis émet un ripple de clic et notifie
 * l'arrivée (`onArrived`) — le spotlight s'ouvre alors côté GuidedTour.
 *
 * - `targetSelector: null` masque le curseur (étape sans cible) mais conserve
 *   sa dernière position pour que le voyage suivant parte du bon endroit.
 * - `travelKey` force un nouveau voyage même si le sélecteur est identique
 *   (deux étapes consécutives sur la même cible).
 * - Sous `prefers-reduced-motion`, le curseur saute instantanément.
 *
 * pointer-events:none partout — n'intercepte jamais l'interaction.
 */
export function GhostCursor({
  targetSelector,
  travelKey,
  onArrived,
}: {
  targetSelector: string | null;
  travelKey: number;
  onArrived: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [animated, setAnimated] = useState(false);
  const [rippleNonce, setRippleNonce] = useState(0);

  const posRef = useRef<{ x: number; y: number } | null>(null);
  const onArrivedRef = useRef(onArrived);
  useEffect(() => void (onArrivedRef.current = onArrived), [onArrived]);
  // « Tir unique » du voyage en cours — partagé entre transitionend et le
  // timeout de secours (transitionend ne vient pas si la position n'a pas bougé).
  const fireRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!targetSelector) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let timer = 0;
    let tries = 0;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      setRippleNonce((n) => n + 1);
      onArrivedRef.current();
    };
    fireRef.current = fire;

    const seek = () => {
      const el = document.querySelector<HTMLElement>(targetSelector);
      if (!el) {
        if (tries++ < 150) raf = requestAnimationFrame(seek);
        else fire(); // cible introuvable : ne bloque jamais la visite
        return;
      }
      const r = el.getBoundingClientRect();
      const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
      // Secours : si transitionend ne vient pas (position inchangée, onglet
      // masqué…), l'arrivée est déclarée après la durée du spring.
      timer = window.setTimeout(fire, 720);
    };
    seek();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
      fireRef.current = null;
    };
  }, [targetSelector, travelKey]);

  if (!pos) return null;

  return (
    <div
      aria-hidden
      onTransitionEnd={(e) => {
        if (e.propertyName === "transform") fireRef.current?.();
      }}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 9998,
        pointerEvents: "none",
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: animated
          ? "transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity .25s ease"
          : "opacity .25s ease",
        opacity: targetSelector ? 1 : 0,
        willChange: "transform",
      }}
    >
      {/* Ripple de clic — relancé à chaque arrivée via la clé. */}
      {rippleNonce > 0 && (
        <span
          key={rippleNonce}
          style={{
            position: "absolute",
            left: -11,
            top: -11,
            width: 22,
            height: 22,
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,0.85)",
            animation: "pb-cursor-click 400ms ease-out forwards",
          }}
        />
      )}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        style={{
          display: "block",
          opacity: 0.75,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,.55))",
          transform: "translate(-3px, -2px)",
        }}
      >
        <path
          d="M5 2 L5 17.6 L9.1 14.1 L11.5 19.6 L14 18.5 L11.6 13.1 L16.8 12.7 Z"
          fill="rgba(255,255,255,0.92)"
          stroke="rgba(10,14,20,0.9)"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
