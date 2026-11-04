"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./tour.module.css";

/**
 * Particules de données de la visite guidée : des jetons monospace (comptes PCG, normes, valeurs du dossier)
 * quittent la zone de dépôt et rejoignent les écrans du rail — « les données irriguent les modules ».
 *
 * Trajectoires en arc via CSS Motion Path (`offset-path`), calculées depuis les rectangles réels. Cibles : les
 * liens VISIBLES de la navigation « Écrans du dossier » (rail dès 760 px, barre basse en dessous). Sans
 * `offset-path` ni cible visible, le composant se termine aussitôt. Neutralisé sous mouvement réduit (le
 * moteur ne le monte pas).
 */

const MAX_PARTICLES = 10;
const TRAVEL_MS = 1100;
const STAGGER_MS = 110;
const NAV_SELECTOR = 'nav[aria-label="Écrans du dossier"] a';

interface Particle {
  token: string;
  path: string;
  delay: number;
}

export function DataParticles({ fromRect, tokens, onDone }: { fromRect: DOMRect; tokens: string[]; onDone: () => void }) {
  const [supported, setSupported] = useState(true);
  const onDoneRef = useRef(onDone);
  useEffect(() => void (onDoneRef.current = onDone), [onDone]);

  const particles = useMemo<Particle[]>(() => {
    if (typeof document === "undefined") return [];
    const targets = Array.from(document.querySelectorAll<HTMLElement>(NAV_SELECTOR))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight)
      .slice(0, 8);
    if (targets.length === 0) return [];
    return tokens.slice(0, MAX_PARTICLES).map((token, i) => {
      const t = targets[i % targets.length];
      const fx = fromRect.left + fromRect.width * (0.38 + (i % 4) * 0.06);
      const fy = fromRect.top + fromRect.height * 0.45 + ((i % 5) - 2) * 9;
      const tx = t.left + Math.min(t.width / 2, 60);
      const ty = t.top + t.height / 2;
      const c1x = fx - (fx - tx) * 0.2;
      const c1y = fy - 120 - (i % 3) * 24;
      const c2x = tx + 140;
      const c2y = ty - 40;
      return {
        token,
        path: `M ${fx.toFixed(1)},${fy.toFixed(1)} C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`,
        delay: i * STAGGER_MS,
      };
    });
  }, [fromRect, tokens]);

  useEffect(() => {
    const ok = typeof CSS !== "undefined" && CSS.supports("offset-path", 'path("M 0 0 L 10 10")') && particles.length > 0;
    setSupported(ok);
    const total = ok ? TRAVEL_MS + (particles.length - 1) * STAGGER_MS + 200 : 0;
    const t = window.setTimeout(() => onDoneRef.current(), total);
    return () => window.clearTimeout(t);
  }, [particles]);

  if (!supported) return null;

  return (
    <div aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className={s.particle}
          style={{
            offsetPath: `path("${p.path}")`,
            animationDelay: `${p.delay}ms`,
          }}
        >
          {p.token}
        </span>
      ))}
    </div>
  );
}
