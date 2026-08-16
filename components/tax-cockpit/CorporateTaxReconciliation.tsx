"use client";

/**
 * Rapprochements IS : valeurs recalculées contre valeurs déclarées (liasse,
 * 2065) et comptabilisées (charge d'impôt). Lignes produites par le moteur
 * TAX-05, tolérance nulle : un écart est une différence à analyser.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { ComparisonBars } from "./ComparisonBars";
import { TaxChartCard } from "./TaxSourceFootnote";

export function CorporateTaxReconciliation({
  dataset,
}: {
  dataset: TaxCockpitDatasets["corporateReconciliation"];
}) {
  return (
    <TaxChartCard dataset={dataset} eyebrow="Calcul">
      <ComparisonBars rows={dataset.bars} ariaLabel={dataset.summary} />
    </TaxChartCard>
  );
}
