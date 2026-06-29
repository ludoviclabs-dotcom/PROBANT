import type { SourceTheme } from "@/lib/canonical-model";

/**
 * Métadonnées d'affichage des thèmes normatifs.
 *
 * Deux registres : « droit dur » (LPF / PCG / Code de commerce, opposable) et
 * « méthode » (ISA / ISRE, normes d'exercice). Le registre détermine la couleur
 * de la barre de criticité des cartes ; chaque thème porte une teinte propre.
 */

export type Registry = "droit-dur" | "methode";

export const REGISTRY_META: Record<
  Registry,
  { label: string; short: string; hex: string }
> = {
  "droit-dur": {
    label: "Droit dur — LPF / PCG / Code de commerce",
    short: "Droit dur",
    hex: "#f87171",
  },
  methode: {
    label: "Méthode professionnelle — ISA / ISRE",
    short: "Méthode",
    hex: "#a78bfa",
  },
};

export const THEME_META: Record<SourceTheme, { registry: Registry; hex: string }> = {
  Admissibilité: { registry: "droit-dur", hex: "#ef4444" },
  Comptabilisation: { registry: "droit-dur", hex: "#f87171" },
  Rattachement: { registry: "droit-dur", hex: "#fb7185" },
  Présentation: { registry: "droit-dur", hex: "#fb923c" },
  Fraude: { registry: "methode", hex: "#a78bfa" },
  Risque: { registry: "methode", hex: "#8b5cf6" },
  Matérialité: { registry: "methode", hex: "#818cf8" },
  "Procédures analytiques": { registry: "methode", hex: "#c084fc" },
  "Éléments probants": { registry: "methode", hex: "#6366f1" },
  "Examen limité": { registry: "methode", hex: "#a855f7" },
};

/** Ordre d'affichage stable (droit dur puis méthode). */
export const THEME_ORDER: SourceTheme[] = [
  "Admissibilité",
  "Comptabilisation",
  "Rattachement",
  "Présentation",
  "Fraude",
  "Risque",
  "Matérialité",
  "Procédures analytiques",
  "Éléments probants",
  "Examen limité",
];

export function registryOf(theme: SourceTheme | undefined): Registry {
  return theme ? THEME_META[theme].registry : "droit-dur";
}
