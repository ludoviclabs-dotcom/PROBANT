"use client";

/**
 * Rapprochements CFE : avis d'imposition, charge comptabilisée et règlements
 * (moteur TAX-07). La cotisation n'est jamais recalculée : le moteur rapproche
 * l'avis, il ne le reconstitue pas.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { ComparisonBars } from "./ComparisonBars";
import { reconciliationReading } from "./narrative";
import { TaxChartCard } from "./TaxSourceFootnote";

export function CfeReconciliation({
  dataset,
}: {
  dataset: TaxCockpitDatasets["cfeReconciliation"];
}) {
  return (
    <TaxChartCard dataset={dataset} reading={reconciliationReading(dataset.bars, dataset.summary)}>
      <ComparisonBars rows={dataset.bars} ariaLabel={dataset.summary} />
    </TaxChartCard>
  );
}
