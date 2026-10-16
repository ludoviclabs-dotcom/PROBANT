"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/charte/motion";

/**
 * Compteur de la charte : quand la valeur change, il part de la valeur AFFICHÉE (jamais d'un zéro artificiel) et
 * l'atteint en 600 ms, courbe cubique. Au premier rendu, la valeur réelle s'affiche directement. Sous
 * `prefers-reduced-motion`, la valeur saute à sa cible. Réservé aux compteurs d'éléments ; les montants en euros
 * ne s'animent jamais (une valeur intermédiaire n'est pas un montant du dossier).
 */
export function useCountTo(value: number, duration = 600): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    if (current.current === value) return;
    if (prefersReducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      current.current = start + (value - start) * eased;
      setShown(current.current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}
