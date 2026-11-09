"use client";

import { useSyncExternalStore } from "react";
import { daysBetween } from "@/lib/audit-cycles/veille";
import n from "./normatif.module.css";

/** Au-delà de ce délai, la veille elle-même est signalée comme ancienne. */
export const VEILLE_STALE_DAYS = 90;

const noop = () => () => {};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Âge de la veille, calculé dans le navigateur à la date du jour : la page est générée une fois, mais l'écart avec
 * la date d'arrêté doit rester exact chaque jour où on l'ouvre. Rien n'est rendu côté serveur (pas de date
 * système figée dans le HTML) ; au-delà de 90 jours, l'âge passe en signal.
 */
export function VeilleAge({ arreteAu }: { arreteAu: string }) {
  const now = useSyncExternalStore(noop, today, () => null);
  if (!now) return null;
  const age = daysBetween(arreteAu, now);
  if (age < 0) return null;
  const text = age === 0 ? "aujourd'hui" : `il y a ${age} jour${age > 1 ? "s" : ""}`;
  return age > VEILLE_STALE_DAYS ? (
    <strong className={n.stale}>{text} — veille à relancer</strong>
  ) : (
    <span>{text}</span>
  );
}
