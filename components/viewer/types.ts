import type { Severity } from "@/lib/canonical-model";

/** Filtre actif de la toolbar : une gravité, « toutes », ou « lignes saines ». */
export type SeverityFilter = Severity | "all" | "sain";

/** Compteurs affichés dans la toolbar et utilisés par les filtres. */
export interface DocCounts {
  bloquant: number;
  majeur: number;
  mineur: number;
  informatif: number;
  /** Lignes/postes sans aucun flag. */
  sain: number;
  /** Lignes/postes au total (grand-livre ou états). */
  total: number;
  /** Nombre de constats. */
  findings: number;
}

/** L'élément (ligne/poste) correspond-il au filtre actif ? */
export function matchesFilter(
  filter: SeverityFilter,
  maxSeverity: Severity | null,
): boolean {
  if (filter === "all") return true;
  if (filter === "sain") return maxSeverity === null;
  return maxSeverity === filter;
}
