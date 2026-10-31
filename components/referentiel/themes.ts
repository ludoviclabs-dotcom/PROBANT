import type { SourceTheme } from "@/lib/canonical-model";

/**
 * Classement des thèmes normatifs en deux registres : « droit dur » (LPF, PCG, Code de commerce, CGI : opposable)
 * et « méthode » (ISA, ISRE : normes d'exercice professionnel). Le registre donne la famille affichée — trait plein
 * ou tirets, libellés de `FAMILY_TEXT` (lib/referentiel/view-model.ts) ; la couleur ne distingue ni thème ni registre.
 */

export type Registry = "droit-dur" | "methode";

export const THEME_META: Record<SourceTheme, { registry: Registry }> = {
  Admissibilité: { registry: "droit-dur" },
  Comptabilisation: { registry: "droit-dur" },
  Rattachement: { registry: "droit-dur" },
  Présentation: { registry: "droit-dur" },
  Fraude: { registry: "methode" },
  Risque: { registry: "methode" },
  Matérialité: { registry: "methode" },
  "Procédures analytiques": { registry: "methode" },
  "Éléments probants": { registry: "methode" },
  "Examen limité": { registry: "methode" },
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
