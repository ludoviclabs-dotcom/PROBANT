"use client";

import { useEffect, useState } from "react";

/**
 * Compteur animé 0 → `target` (easeOutQuart, requestAnimationFrame).
 * `active=false` maintient 0 ; le passage à `true` déclenche l'animation.
 * Sous `prefers-reduced-motion`, saute directement à la valeur cible.
 */
export function useDemoCounter(target: number, duration: number, active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    if (
      duration <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration, active]);

  return value;
}
