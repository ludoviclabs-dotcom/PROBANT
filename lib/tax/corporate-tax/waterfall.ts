/**
 * Jeu de donnees du waterfall :
 *
 *   resultat comptable
 *   + reintegrations confirmees
 *   + reintegrations proposees
 *   - deductions confirmees
 *   - deductions proposees
 *   = resultat fiscal
 *   - deficits
 *   = base imposable
 *   -> IS
 *
 * `runningTotalCents` suit la chaine *retenue*, c'est-a-dire les seuls elements
 * confirmes. Les etapes proposees portent leur magnitude dans `deltaCents` et
 * laissent le cumul inchange : un candidat s'affiche sans jamais se fondre dans
 * le resultat fiscal. La borne haute incluant les candidats est exposee a part
 * par `proposedTaxResultCents`.
 */
import type { CentAmount, TaxSourceRef } from "@/lib/canonical-model";
import { addCents, subtractCents } from "./arithmetic";
import type {
  CorporateTaxAdjustmentLine,
  CorporateTaxWaterfall,
  CorporateTaxWaterfallStep,
} from "./types";

interface WaterfallInput {
  readonly accountingResultCents: CentAmount;
  readonly reintegrationsConfirmedCents: CentAmount;
  readonly reintegrationsProposedCents: CentAmount;
  readonly deductionsConfirmedCents: CentAmount;
  readonly deductionsProposedCents: CentAmount;
  readonly taxResultBeforeDeficitsCents: CentAmount;
  readonly deficitOffsetCents: CentAmount;
  readonly taxableBaseCents: CentAmount;
  readonly grossTaxCents: CentAmount;
  readonly adjustmentLines: readonly CorporateTaxAdjustmentLine[];
  readonly status: "computed" | "blocked";
  readonly sourceRefs: readonly TaxSourceRef[];
}

function lineIds(
  lines: readonly CorporateTaxAdjustmentLine[],
  direction: "reintegration" | "deduction",
  status: "confirmed" | "candidate",
): readonly string[] {
  return lines
    .filter((line) => line.direction === direction && line.status === status)
    .map((line) => line.id)
    .sort();
}

export function buildWaterfall(input: WaterfallInput): CorporateTaxWaterfall {
  const unavailable = input.status === "blocked";
  const steps: CorporateTaxWaterfallStep[] = [];
  const push = (step: CorporateTaxWaterfallStep): void => {
    steps.push(Object.freeze(step));
  };

  const stepStatus = (proposed: boolean): CorporateTaxWaterfallStep["status"] =>
    unavailable ? "unavailable" : proposed ? "proposed" : "computed";

  push({
    code: "accounting_result",
    label: "Resultat comptable",
    order: 1,
    kind: "base",
    sign: input.accountingResultCents < 0 ? "negative" : "positive",
    deltaCents: input.accountingResultCents,
    runningTotalCents: input.accountingResultCents,
    status: stepStatus(false),
    adjustmentLineIds: [],
    sourceRefs: input.sourceRefs,
  });

  const afterReintegrations = addCents(
    input.accountingResultCents,
    input.reintegrationsConfirmedCents,
    "waterfall_reintegrations",
  );
  push({
    code: "reintegrations_confirmed",
    label: "Reintegrations confirmees",
    order: 2,
    kind: "delta",
    sign: "positive",
    deltaCents: input.reintegrationsConfirmedCents,
    runningTotalCents: afterReintegrations,
    status: stepStatus(false),
    adjustmentLineIds: lineIds(input.adjustmentLines, "reintegration", "confirmed"),
    sourceRefs: input.sourceRefs,
  });

  push({
    code: "reintegrations_proposed",
    label: "Reintegrations proposees",
    order: 3,
    kind: "delta",
    sign: "positive",
    deltaCents: input.reintegrationsProposedCents,
    // Cumul inchange : un candidat n'entre pas dans la chaine retenue.
    runningTotalCents: afterReintegrations,
    status: stepStatus(true),
    adjustmentLineIds: lineIds(input.adjustmentLines, "reintegration", "candidate"),
    sourceRefs: [],
  });

  const afterDeductions = subtractCents(
    afterReintegrations,
    input.deductionsConfirmedCents,
    "waterfall_deductions",
  );
  push({
    code: "deductions_confirmed",
    label: "Deductions confirmees",
    order: 4,
    kind: "delta",
    sign: "negative",
    deltaCents: input.deductionsConfirmedCents,
    runningTotalCents: afterDeductions,
    status: stepStatus(false),
    adjustmentLineIds: lineIds(input.adjustmentLines, "deduction", "confirmed"),
    sourceRefs: input.sourceRefs,
  });

  push({
    code: "deductions_proposed",
    label: "Deductions proposees",
    order: 5,
    kind: "delta",
    sign: "negative",
    deltaCents: input.deductionsProposedCents,
    runningTotalCents: afterDeductions,
    status: stepStatus(true),
    adjustmentLineIds: lineIds(input.adjustmentLines, "deduction", "candidate"),
    sourceRefs: [],
  });

  push({
    code: "tax_result_before_deficits",
    label: "Resultat fiscal avant deficits",
    order: 6,
    kind: "subtotal",
    sign: input.taxResultBeforeDeficitsCents < 0 ? "negative" : "positive",
    deltaCents: 0,
    runningTotalCents: input.taxResultBeforeDeficitsCents,
    status: stepStatus(false),
    adjustmentLineIds: [],
    sourceRefs: input.sourceRefs,
  });

  push({
    code: "deficits_offset",
    label: "Deficits imputes",
    order: 7,
    kind: "delta",
    sign: "negative",
    deltaCents: input.deficitOffsetCents,
    runningTotalCents: subtractCents(
      input.taxResultBeforeDeficitsCents,
      input.deficitOffsetCents,
      "waterfall_deficits",
    ),
    status: stepStatus(false),
    adjustmentLineIds: [],
    sourceRefs: input.sourceRefs,
  });

  push({
    code: "taxable_base",
    label: "Base imposable",
    order: 8,
    kind: "subtotal",
    sign: "positive",
    deltaCents: 0,
    runningTotalCents: input.taxableBaseCents,
    status: stepStatus(false),
    adjustmentLineIds: [],
    sourceRefs: input.sourceRefs,
  });

  push({
    code: "gross_tax",
    label: "Impot sur les societes brut",
    order: 9,
    kind: "total",
    sign: "positive",
    deltaCents: input.grossTaxCents,
    runningTotalCents: input.grossTaxCents,
    status: stepStatus(false),
    adjustmentLineIds: [],
    sourceRefs: input.sourceRefs,
  });

  const proposedTaxResultCents = subtractCents(
    addCents(afterDeductions, input.reintegrationsProposedCents, "waterfall_proposed"),
    input.deductionsProposedCents,
    "waterfall_proposed",
  );

  return Object.freeze({
    steps: Object.freeze(steps),
    confirmedTaxResultCents: input.taxResultBeforeDeficitsCents,
    proposedTaxResultCents,
    currency: "EUR" as const,
  });
}
