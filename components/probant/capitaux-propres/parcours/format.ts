import { createElement } from "react";
import type { KnownAmount } from "@/lib/canonical-model/money";
import { PAYMENT_STATUS_LABELS, type PaymentState } from "@/lib/workpapers/capitaux-payment";
import { eur, knownLabel } from "../format";

/** Display only: server amounts and exact fractions are formatted, never recomputed or rounded into a verdict. */
const fromCents = (raw: string) => { const n = BigInt(raw), abs = n < 0n ? -n : n; return (n < 0n ? "-" : "") + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0"); };
export function valueLabel(v: KnownAmount | { kind: "fraction"; numerator: string; denominator: string; unit: "cents" | "cents_ratio" }) {
  if (v.kind !== "fraction") return knownLabel(v);
  if (v.unit === "cents_ratio") return eur(fromCents(v.numerator)) + " / " + eur(fromCents(v.denominator));
  const n = BigInt(v.numerator), d = BigInt(v.denominator);
  return n % d === 0n ? eur(fromCents((n / d).toString())) : eur(fromCents(v.numerator)) + " / " + v.denominator + " (fraction exacte)";
}
/** A known amount as a figure; an unknown or not applicable one as its reason, in the reason style. */
export function amountNode(k: KnownAmount, reasonClass: string) { return k.kind === "known" ? eur(k.value) : createElement("span", { className: reasonClass }, k.reason); }
export function paymentLabel(p: PaymentState | null, note?: string) {
  if (!p) return note ?? "Non comparé";
  if (p.status === "not_applicable") return PAYMENT_STATUS_LABELS.not_applicable;
  const rest = p.remainingAtReview.kind === "known" && p.remainingAtReview.value.amount !== "0.00" ? " · reste " + eur(p.remainingAtReview.value) : "";
  return PAYMENT_STATUS_LABELS[p.status] + rest;
}
export const CORRESPONDENCE_LABELS = {
  single: "Une feuille", linked_concordant: "Reliée · même PV", linked_divergent: "Reliée · montants divergents", to_reconcile: "À rapprocher · non comptée",
} as const;
export const PARCOURS_FAILURES: Record<string, string> = {
  PARCOURS_QUERY_INVALID: "Paramètres de lecture invalides : dossier, période et versions exactes attendus.",
  PARCOURS_UNAVAILABLE: "Le parcours est indisponible. Réessayez la lecture.",
  SESSION_INVALID: "Session requise ou expirée. Reconnectez-vous pour reprendre.",
  WORKPAPER_FORBIDDEN: "Accès refusé pour ce dossier.",
};
export const JOURNEY_CODES: Record<string, string> = {
  EQ_DURABLE_DISABLED: "Chaîne /capitaux-propres non ouverte sur ce serveur (profil personnel local ou recette jetable requis).",
  EQUITY_DURABLE_DISABLED: "Chaîne /equity non ouverte sur ce serveur (profil personnel local ou recette jetable requis).",
  DURABLE_UNAVAILABLE: "Lecture indisponible : ses décisions ne sont pas réputées absentes.",
  WORKPAPER_NOT_FOUND: "Aucune feuille pour ce dossier et cette période.", WORKPAPER_VERSION_NOT_FOUND: "Version demandée introuvable.",
};
