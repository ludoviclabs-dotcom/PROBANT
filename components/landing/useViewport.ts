"use client";

import { useSyncExternalStore } from "react";

/**
 * Dimensions de la fenêtre pour les mises en page que le CSS seul ne sait pas exprimer (géométrie du flux
 * FEC, hauteur de la piste collante). Valeurs de repli côté serveur : celles de la maquette (1440 × 900).
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, () => document.documentElement.clientWidth, () => 1440);
}

export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () => window.innerHeight, () => 900);
}

/** Seuil de disposition large de la landing (px). */
export const WIDE_MIN = 900;
