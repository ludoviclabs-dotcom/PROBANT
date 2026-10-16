import type { Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";

/**
 * Filtre croisé de la section Analyse : une cloison et/ou une gravité, posés par un clic sur un flux, un nœud ou
 * un bouton du Sankey. Il pilote tous les graphiques de la section et le journal. Un filtre n'enlève jamais un
 * constat du dossier : il atténue ce qui n'y répond pas.
 */
export interface CrossFilter {
  clo: CloisonId | null;
  sev: Severity | null;
}

export const NO_FILTER: CrossFilter = { clo: null, sev: null };

export const isFiltering = (filter: CrossFilter) => filter.clo !== null || filter.sev !== null;

export const matches = (filter: CrossFilter, item: { cloison: CloisonId; severity: Severity }) =>
  (!filter.clo || item.cloison === filter.clo) && (!filter.sev || item.severity === filter.sev);
