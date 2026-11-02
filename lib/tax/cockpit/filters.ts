/**
 * Filtres de sortie de l'exploration (acte III) : une bascule par sortie présente,
 * avec son dénombrement. Les comptes portent sur les lignes du dataset
 * `findings` (lignes de rapprochement + contrôles exécutés) — exactement les
 * lignes que le filtre affiche ; rien n'est pondéré ni estimé.
 */
import type { TaxControlOutcome } from "@/lib/canonical-model";
import { TAX_OUTCOME_LABEL, TAX_OUTCOME_ORDER } from "./labels";
import type { TaxCockpitDatasets } from "./types";

export interface OutcomeFilterOption {
  readonly outcome: TaxControlOutcome;
  readonly label: string;
  readonly count: number;
}

export interface OutcomeFilters {
  /** Nombre total de lignes de l'exploration (filtre « toutes »). */
  readonly total: number;
  /** Lignes de rapprochement (sans identifiant de contrôle). */
  readonly reconciliationLines: number;
  /** Contrôles exécutés. */
  readonly controls: number;
  /** Une option par sortie présente, dans l'ordre de présentation de la taxonomie. */
  readonly options: readonly OutcomeFilterOption[];
}

export function buildOutcomeFilters(findings: TaxCockpitDatasets["findings"]): OutcomeFilters {
  const counts = new Map<string, number>();
  let reconciliationLines = 0;
  for (const row of findings.rows) {
    const outcome = findings.outcomeByRowId[row.id];
    if (outcome !== undefined) counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    if (findings.details[row.id]?.controlId === null) reconciliationLines += 1;
  }
  return {
    total: findings.rows.length,
    reconciliationLines,
    controls: findings.rows.length - reconciliationLines,
    options: TAX_OUTCOME_ORDER.filter((outcome) => (counts.get(outcome) ?? 0) > 0).map((outcome) => ({
      outcome,
      label: TAX_OUTCOME_LABEL[outcome],
      count: counts.get(outcome) ?? 0,
    })),
  };
}
