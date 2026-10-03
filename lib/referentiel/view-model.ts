import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { THEME_ORDER, registryOf, type Registry } from "@/components/referentiel/themes";

/**
 * Modèle de vue de la page Référentiel : filtrage, regroupement par famille
 * et géométrie des strates. Pur et déterministe — aucun calcul dans le rendu
 * React, toutes les valeurs affichées (27 / 19 / 8, millésimes, épaisseurs)
 * dérivent des données de `lib/referentiel/sources.ts`.
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
  /** Après recherche + registre (périmètre de l'index des thèmes). */
  regScope: SourceNormative[];
  /** Après tous les filtres : ce que montre la bibliothèque. */
  filtered: SourceNormative[];
}

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
  const regScope =
    f.registry === "all" ? searched : searched.filter((s) => registryOf(s.theme) === f.registry);
  const byYear = f.year ? regScope.filter((s) => yearOf(s) === f.year) : regScope;
  const filtered = f.theme === "all" ? byYear : byYear.filter((s) => s.theme === f.theme);
  return { searched, regScope, filtered };
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

export interface Stratum {
  year: string;
  items: SourceNormative[];
  /** Position Z (px) du dessus de la strate dans la scène 3D. */
  z: number;
  /** Épaisseur (px) ∝ nombre de textes. */
  t: number;
  /** Part de droit dur dans le millésime, en %. */
  pct: number;
  /** Décalage d'entrée (ms), de bas en haut. */
  delay: number;
  /** Position verticale (px) de l'étiquette d'année à l'écran. */
  screenTop: number;
}

const thicknessOf = (n: number) => Math.round(4 + n * 2);
const GAP = 16;

/** Une strate par millésime d'entrée en vigueur, du plus ancien au plus récent. */
export function buildStrata(sources: SourceNormative[]): Stratum[] {
  const yearMap = groupByYear(sources);
  const years = [...yearMap.keys()].sort();
  const totalStack =
    years.reduce((acc, y) => acc + thicknessOf(yearMap.get(y)!.length), 0) +
    (years.length - 1) * GAP;
  let z = -totalStack / 2;
  return years.map((year, i) => {
    const items = yearMap.get(year)!;
    const dd = items.filter((s) => registryOf(s.theme) === "droit-dur").length;
    const t = thicknessOf(items.length);
    const row: Stratum = {
      year,
      items,
      z,
      t,
      pct: Math.round((dd / items.length) * 100),
      delay: (years.length - 1 - i) * 100,
      screenTop: Math.round(170 - z * 0.85),
    };
    z += t + GAP;
    return row;
  });
}
