import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import type { FindingFamily } from "@/lib/canonical-model/finding";
import { FAMILY_TEXT } from "@/lib/synthese-view/common";
import { THEME_ORDER, registryOf, type Registry } from "@/components/referentiel/themes";

/**
 * Modèle de vue de la page « Seuils & référentiel » : filtrage, comptes de l'index, regroupement par texte et frise
 * des millésimes. Pur et déterministe — aucun calcul dans le rendu React, toutes les valeurs affichées (27 / 19 / 8,
 * millésimes, longueurs de barre) dérivent des données de `lib/referentiel/sources.ts`.
 */

export interface LibraryFilters {
  query: string;
  theme: SourceTheme | "all";
  year: string | null;
  registry: Registry | "all";
}

export interface LibraryScope {
  /** Après recherche seule. */
  searched: SourceNormative[];
  /** Après recherche + millésime : périmètre des comptes par famille. */
  dated: SourceNormative[];
  /** Après recherche + millésime + famille : périmètre de l'index des thèmes. */
  regScope: SourceNormative[];
  /** Après tous les filtres : ce que montre la bibliothèque. */
  filtered: SourceNormative[];
}

/**
 * Famille d'affichage d'un registre du référentiel, alignée sur la Synthèse : le droit dur (LPF, PCG, Code de
 * commerce, CGI) est opposable ; les normes d'exercice professionnel (ISA, ISRE) relèvent de la méthode d'audit.
 * La famille « paramètre interne » est réservée aux seuils PROBANT (`SEUILS_INTERNES`), jamais à une source citée.
 */
export function registryFamily(registry: Registry): Exclude<FindingFamily, "internal"> {
  return registry === "droit-dur" ? "hardLaw" : "methodology";
}

/** Libellé de famille d'un registre : « Droit dur » ou « Méthode d’audit » (`FAMILY_TEXT`). */
export function registryLabel(registry: Registry): string {
  return registry === "droit-dur" ? FAMILY_TEXT.hardLaw.label : FAMILY_TEXT.methodology.long;
}

/** Famille des seuils internes PROBANT. */
export const SEUILS_FAMILY: FindingFamily = "internal";

/** « Paramètre interne · non opposable ». */
export const SEUILS_FAMILY_LABEL = `${FAMILY_TEXT.internal.label} · ${FAMILY_TEXT.internal.sub}`;

export function familyOf(ref: string): string {
  if (ref.startsWith("LPF")) return "Livre des procédures fiscales";
  if (ref.startsWith("PCG")) return "Plan comptable général";
  if (ref.startsWith("ISA") || ref.startsWith("ISRE")) return "Normes d'exercice professionnel";
  if (ref.startsWith("CGI")) return "Code général des impôts";
  return "Code de commerce";
}

export function yearOf(source: SourceNormative): string {
  return source.effectiveDate.slice(0, 4);
}

export function matchesQuery(source: SourceNormative, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    source.ref.toLowerCase().includes(q) ||
    source.citation.toLowerCase().includes(q) ||
    (source.theme ?? "").toLowerCase().includes(q) ||
    source.effectiveDate.includes(q)
  );
}

export function computeScope(sources: SourceNormative[], f: LibraryFilters): LibraryScope {
  const searched = sources.filter((s) => matchesQuery(s, f.query));
  const dated = f.year ? searched.filter((s) => yearOf(s) === f.year) : searched;
  const regScope = f.registry === "all" ? dated : dated.filter((s) => registryOf(s.theme) === f.registry);
  const filtered = f.theme === "all" ? regScope : regScope.filter((s) => s.theme === f.theme);
  return { searched, dated, regScope, filtered };
}

export function countRegistry(sources: SourceNormative[], registry: Registry): number {
  return sources.filter((s) => registryOf(s.theme) === registry).length;
}

/** Thèmes présents dans le périmètre, triés par volume décroissant (ordre stable). */
export function themeCounts(
  scope: SourceNormative[],
): { theme: SourceTheme; n: number; registry: Registry }[] {
  return THEME_ORDER.map((theme) => ({
    theme,
    n: scope.filter((s) => s.theme === theme).length,
    registry: registryOf(theme),
  }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
}

export interface IndexCounts {
  /** Comptes par famille sur `dated` : cliquer une famille remet le thème à « tous ». */
  registries: { all: number; "droit-dur": number; methode: number };
  /** Nombre d'entrées du périmètre de l'index des thèmes (`regScope`). */
  themesAll: number;
  /** Thèmes du périmètre ; le thème actif reste listé, même à zéro, pour pouvoir être retiré. */
  themes: { theme: SourceTheme; n: number; registry: Registry }[];
}

/**
 * Comptes de l'index : chaque compte vaut le nombre d'entrées qu'afficherait un clic sur ce filtre, les autres filtres
 * restant posés (recherche, millésime, et famille pour les thèmes).
 */
export function indexCounts(scope: LibraryScope, activeTheme: SourceTheme | "all"): IndexCounts {
  const themes = themeCounts(scope.regScope);
  if (activeTheme !== "all" && !themes.some((t) => t.theme === activeTheme)) {
    themes.push({ theme: activeTheme, n: 0, registry: registryOf(activeTheme) });
  }
  return {
    registries: {
      all: scope.dated.length,
      "droit-dur": countRegistry(scope.dated, "droit-dur"),
      methode: countRegistry(scope.dated, "methode"),
    },
    themesAll: scope.regScope.length,
    themes,
  };
}

export interface FamilyGroup {
  family: string;
  items: SourceNormative[];
}

/** Regroupement par famille de texte, dans l'ordre de première apparition. */
export function groupByFamily(sources: SourceNormative[]): FamilyGroup[] {
  const order: string[] = [];
  const map = new Map<string, SourceNormative[]>();
  for (const s of sources) {
    const f = familyOf(s.ref);
    if (!map.has(f)) {
      map.set(f, []);
      order.push(f);
    }
    map.get(f)!.push(s);
  }
  return order.map((family) => ({ family, items: map.get(family)! }));
}

export function groupByYear(sources: SourceNormative[]): Map<string, SourceNormative[]> {
  const map = new Map<string, SourceNormative[]>();
  for (const s of sources) {
    const y = yearOf(s);
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(s);
  }
  return map;
}

export interface FriezeYear {
  year: string;
  items: SourceNormative[];
  /** Nombre de textes entrés en vigueur cette année-là. */
  total: number;
  /** Dont droit dur. */
  hardLaw: number;
  /** Dont méthode d'audit. */
  methodology: number;
  /** Longueur de la part droit dur, en % de la barre du millésime le plus fourni. */
  hardLawPct: number;
  /** Longueur de la part méthode d'audit, en % de la barre du millésime le plus fourni. */
  methodologyPct: number;
}

/**
 * Frise des millésimes d'entrée en vigueur, du plus ancien au plus récent : une barre par année, longueur
 * proportionnelle au nombre de textes (le millésime le plus fourni vaut 100 %), partagée entre droit dur et méthode.
 */
export function buildFrieze(sources: SourceNormative[]): FriezeYear[] {
  const yearMap = groupByYear(sources);
  const years = [...yearMap.keys()].sort();
  const max = Math.max(1, ...years.map((y) => yearMap.get(y)!.length));
  return years.map((year) => {
    const items = yearMap.get(year)!;
    const hardLaw = countRegistry(items, "droit-dur");
    const methodology = items.length - hardLaw;
    return {
      year,
      items,
      total: items.length,
      hardLaw,
      methodology,
      hardLawPct: (hardLaw / max) * 100,
      methodologyPct: (methodology / max) * 100,
    };
  });
}
