"use client";

import { useSyncExternalStore } from "react";

/**
 * Mouvement de la charte : durées et courbes finies, déclenchées une fois, réduites sur demande.
 * Les animations pilotées en JavaScript (Web Animations) lisent la préférence ici ; les animations CSS
 * sont neutralisées par la règle `prefers-reduced-motion` de app/tokens.css.
 */

export const EASE = "cubic-bezier(.2,0,0,1)";
export const EASE_FLOW = "cubic-bezier(.45,0,.25,1)";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** Lecture ponctuelle (dans un effet ou un gestionnaire). */
export function prefersReducedMotion(): boolean {
  return snapshot();
}

/** Préférence système, réactive. Côté serveur : mouvement autorisé (le rendu initial est statique). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Les animations ne sont tentées que si le navigateur les connaît et que l'utilisateur ne les refuse pas. */
export function canAnimate(el: Element | null | undefined): el is Element {
  return Boolean(el) && typeof (el as Element).animate === "function" && !prefersReducedMotion();
}
