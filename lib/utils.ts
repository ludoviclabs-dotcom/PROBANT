import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant en euros, police tabulaire côté UI. */
export function formatEUR(value: number, opts?: { sign?: boolean }): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  if (opts?.sign && value < 0) return `(${formatted})`;
  return value < 0 ? `-${formatted}` : formatted;
}

/** Formate un pourcentage. */
export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)} %`;
}

/** Convertit une date FEC AAAAMMJJ en JJ/MM/AAAA pour affichage. */
export function formatFecDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}
