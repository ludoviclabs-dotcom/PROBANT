"use client";

/**
 * Réconciliation TVA : théorique / comptabilisée / déclarée par agrégat,
 * depuis le jeu `comparison` du moteur TAX-06. Une déclaration absente reste
 * « non disponible » — elle n'est jamais assimilée à une déclaration à zéro.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { ComparisonBars } from "./ComparisonBars";
import { vatReading } from "./narrative";
import { TaxChartCard } from "./TaxSourceFootnote";

export function VatReconciliationChart({
  dataset,
}: {
  dataset: TaxCockpitDatasets["vatReconciliation"];
}) {
  return (
    <TaxChartCard dataset={dataset} reading={vatReading(dataset.bars, dataset.summary)}>
      <ComparisonBars rows={dataset.bars} ariaLabel={dataset.summary} />
    </TaxChartCard>
  );
}
