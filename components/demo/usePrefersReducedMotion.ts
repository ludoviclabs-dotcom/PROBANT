"use client";

import { useEffect, useState } from "react";

/**
 * `prefers-reduced-motion` côté JS, pour les animations pilotées par
 * requestAnimationFrame / transitions programmées que la garde CSS globale
 * (`@media (prefers-reduced-motion: reduce)` dans globals.css) ne couvre pas.
 * Même patron que RiskFlowGraph (SMIL) — partagé par les composants de démo.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
