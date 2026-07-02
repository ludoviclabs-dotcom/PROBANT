"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Particules de données de la visite guidée : des mini-badges monospace
 * (comptes PCG, normes, valeurs du dossier) s'envolent de la dropzone vers les
 * premiers items de la navigation — « les données irriguent les modules ».
 *
 * Trajectoires en arc via CSS Motion Path (`offset-path: path(...)`) calculées
 * depuis les getBoundingClientRect réels. 10 particules max, stagger 120 ms,
 * pointer-events:none, aucun layout shift (position:fixed). Si `offset-path`
 * n'est pas supporté, le composant se termine immédiatement (aucun fallback
 * approximatif). La garde CSS reduced-motion neutralise l'animation.
 */

const MAX_PARTICLES = 10;
const TRAVEL_MS = 1100;
const STAGGER_MS = 120;
/** Sélecteur des cibles : items de la navigation latérale (5 premiers). */
const NAV_SELECTOR = "aside nav a";

interface Particle {
  token: string;
  path: string;
  delay: number;
}

export function DataParticles({
  fromRect,
  tokens,
  onDone,
}: {
  fromRect: DOMRect;
  tokens: string[];
  onDone: () => void;
}) {
  const [supported, setSupported] = useState(true);
  const onDoneRef = useRef(onDone);
  useEffect(() => void (onDoneRef.current = onDone), [onDone]);

  const particles = useMemo<Particle[]>(() => {
    if (typeof document === "undefined") return [];
    const targets = Array.from(document.querySelectorAll<HTMLElement>(NAV_SELECTOR))
      .slice(0, 5)
      .map((el) => el.getBoundingClientRect());
    if (targets.length === 0) return [];
    return tokens.slice(0, MAX_PARTICLES).map((token, i) => {
      const t = targets[i % targets.length];
      // Départ : cœur de la dropzone, légèrement dispersé pour éviter la file
      // indienne ; arrivée : centre de l'item de nav.
      const fx = fromRect.left + fromRect.width * (0.42 + (i % 4) * 0.05);
      const fy = fromRect.top + fromRect.height * 0.5 + ((i % 5) - 2) * 9;
      const tx = t.left + t.width / 2;
      const ty = t.top + t.height / 2;
      // Arc : les poignées tirent la trajectoire vers le haut puis vers la nav.
      const c1x = fx - (fx - tx) * 0.18;
      const c1y = fy - 110 - (i % 3) * 26;
      const c2x = tx + 150;
      const c2y = ty - 42;
      return {
        token,
        path: `M ${fx.toFixed(1)},${fy.toFixed(1)} C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`,
        delay: i * STAGGER_MS,
      };
    });
  }, [fromRect, tokens]);

  useEffect(() => {
    const ok =
      typeof CSS !== "undefined" &&
      CSS.supports("offset-path", 'path("M 0 0 L 10 10")') &&
      particles.length > 0;
    setSupported(ok);
    const total = ok ? TRAVEL_MS + (particles.length - 1) * STAGGER_MS + 250 : 0;
    const t = window.setTimeout(() => onDoneRef.current(), total);
    return () => window.clearTimeout(t);
  }, [particles]);

  if (!supported) return null;

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "none" }}>
      {particles.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: "fixed",
              left: 0,
              top: 0,
              offsetPath: `path("${p.path}")`,
              offsetRotate: "0deg",
              animation: `pb-particle-move ${TRAVEL_MS}ms cubic-bezier(.45,.05,.55,.95) ${p.delay}ms both`,
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: ".02em",
              color: "var(--pb-accent, #5b9dff)",
              background: "color-mix(in srgb, var(--pb-surface-2, #161d2b) 92%, transparent)",
              border: "1px solid color-mix(in srgb, var(--pb-accent, #5b9dff) 45%, transparent)",
              borderRadius: 6,
              padding: "2px 6px",
              boxShadow: "0 4px 14px rgba(0,0,0,.4)",
            } as React.CSSProperties
          }
        >
          {p.token}
        </span>
      ))}
    </div>
  );
}
