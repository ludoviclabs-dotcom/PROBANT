/**
 * Jeux de données de visualisation TVA.
 *
 * Ils exposent des grandeurs déjà calculées et tracées par le moteur : aucune
 * agrégation nouvelle, aucune valeur inventée pour combler un trou. Une donnée
 * absente reste `null` et se lit comme telle côté restitution.
 */
import type { CentAmount } from "@/lib/canonical-model";
import { subtractCents } from "../corporate-tax/arithmetic";
import { totalBaseCents } from "./rates";
import type {
  VatComparisonDataset,
  VatDeclarationSnapshot,
  VatMissingPieceMatrixDataset,
  VatRateBucket,
  VatSalesByRateDataset,
  VatTimelineDataset,
  VatTimelineEntry,
  VatTransactionCandidate,
  VatTransactionSignal,
  VatWaterfallDataset,
  VatWaterfallStep,
} from "./types";

/** Signaux qui traduisent une pièce manquante ou non référencée. */
const MISSING_PIECE_SIGNALS: readonly VatTransactionSignal[] = [
  "missing_piece_reference",
  "missing_piece_date",
];

export function buildSalesByRateDataset(buckets: readonly VatRateBucket[]): VatSalesByRateDataset {
  const collected = buckets.filter((bucket) => bucket.direction === "collected");
  return Object.freeze({
    buckets: collected,
    totalBaseCents: totalBaseCents(collected),
    currency: "EUR" as const,
  });
}

export function buildComparisonDataset(options: {
  readonly collectedTheoreticalCents: CentAmount;
  readonly collectedAccountedCents: CentAmount;
  readonly deductibleAccountedCents: CentAmount;
  readonly declaration: VatDeclarationSnapshot;
}): VatComparisonDataset {
  const { declaration } = options;
  return Object.freeze({
    rows: Object.freeze([
      {
        key: "collected",
        label: "TVA collectee",
        theoreticalCents: options.collectedTheoreticalCents,
        accountedCents: options.collectedAccountedCents,
        declaredCents: declaration.grossVatCents,
      },
      {
        key: "deductible",
        label: "TVA deductible",
        // La TVA déductible théorique supposerait un droit à déduction qualifié :
        // le moteur ne le calcule pas.
        theoreticalCents: null,
        accountedCents: options.deductibleAccountedCents,
        declaredCents: declaration.deductibleVatCents,
      },
      {
        key: "net",
        label: "TVA nette",
        theoreticalCents: null,
        accountedCents: subtractCents(
          options.collectedAccountedCents,
          options.deductibleAccountedCents,
          "comparison_net",
        ),
        declaredCents: declaration.netDueCents,
      },
    ]),
    currency: "EUR" as const,
  });
}

export function buildNetWaterfallDataset(options: {
  readonly collectedAccountedCents: CentAmount;
  readonly deductibleAccountedCents: CentAmount;
  readonly declaration: VatDeclarationSnapshot;
}): VatWaterfallDataset {
  const netBeforeCredit = subtractCents(
    options.collectedAccountedCents,
    options.deductibleAccountedCents,
    "waterfall_net",
  );
  const creditReceived = options.declaration.creditCarriedForwardCents ?? 0;
  const netAfterCredit = subtractCents(netBeforeCredit, creditReceived, "waterfall_net_after_credit");
  const declarationAvailable = options.declaration.status === "available";

  const steps: VatWaterfallStep[] = [
    {
      code: "vat_collected",
      label: "TVA collectee comptabilisee",
      order: 1,
      kind: "base",
      sign: "positive",
      deltaCents: options.collectedAccountedCents,
      runningTotalCents: options.collectedAccountedCents,
      status: "computed",
    },
    {
      code: "vat_deductible",
      label: "TVA deductible comptabilisee",
      order: 2,
      kind: "delta",
      sign: "negative",
      deltaCents: options.deductibleAccountedCents,
      runningTotalCents: netBeforeCredit,
      status: "computed",
    },
    {
      code: "vat_net_before_credit",
      label: "TVA nette avant report de credit",
      order: 3,
      kind: "subtotal",
      sign: netBeforeCredit < 0 ? "negative" : "positive",
      deltaCents: 0,
      runningTotalCents: netBeforeCredit,
      status: "computed",
    },
    {
      code: "credit_carried_forward",
      label: "Report de credit anterieur",
      order: 4,
      kind: "delta",
      sign: "negative",
      deltaCents: creditReceived,
      runningTotalCents: netAfterCredit,
      status: declarationAvailable ? "declared" : "unavailable",
    },
    {
      code: "vat_net_due",
      label: "TVA nette due",
      order: 5,
      kind: "total",
      sign: "positive",
      deltaCents: netAfterCredit > 0 ? netAfterCredit : 0,
      runningTotalCents: netAfterCredit > 0 ? netAfterCredit : 0,
      status: declarationAvailable ? "declared" : "computed",
    },
    {
      code: "vat_credit_to_carry",
      label: "Credit a reporter",
      order: 6,
      kind: "total",
      sign: "negative",
      deltaCents: netAfterCredit < 0 ? -netAfterCredit : 0,
      runningTotalCents: netAfterCredit < 0 ? -netAfterCredit : 0,
      status: declarationAvailable ? "declared" : "computed",
    },
  ];

  return Object.freeze({ steps: Object.freeze(steps), currency: "EUR" as const });
}

/**
 * Timeline d'une seule période : le moteur traite une période à la fois.
 * L'agrégation pluri-périodes relève de la synthèse (TAX-07) et n'est pas
 * fabriquée ici à partir d'une période unique.
 */
export function buildTimelineDataset(entry: VatTimelineEntry): VatTimelineDataset {
  return Object.freeze({ entries: Object.freeze([entry]), currency: "EUR" as const });
}

export function buildMissingPieceMatrix(
  candidates: readonly VatTransactionCandidate[],
): VatMissingPieceMatrixDataset {
  const cells = candidates
    .map((candidate) => ({
      transactionId: candidate.id,
      direction: candidate.direction,
      ecritureDate: candidate.ecritureDate,
      journalCode: candidate.journalCode,
      pieceRef: candidate.pieceRef,
      missingSignals: candidate.signals.filter((signal) => MISSING_PIECE_SIGNALS.includes(signal)),
      vatAmountCents: candidate.vatAmountCents,
    }))
    .filter((cell) => cell.missingSignals.length > 0)
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));

  const signalCounts: Partial<Record<VatTransactionSignal, number>> = {};
  for (const cell of cells) {
    for (const signal of cell.missingSignals) {
      signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
    }
  }

  return Object.freeze({ cells: Object.freeze(cells), signalCounts: Object.freeze(signalCounts) });
}
