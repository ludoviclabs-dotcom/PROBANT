/**
 * Agrégation par taux **constaté**.
 *
 * Le registre ne publie aucune source de taux légal de TVA. Le moteur ne peut
 * donc pas dire qu'un taux est correct : il dit seulement quelle place il occupe
 * dans ce dossier. `outlier` signifie « marginal ici, à examiner », jamais
 * « illégal » — ce qui est exactement la règle du lot : un taux atypique n'est
 * pas automatiquement une erreur.
 *
 * Le seuil de marginalité est une heuristique interne. Au sens du modèle
 * canonique elle reste de famille `internal` et ne devient jamais une tolérance
 * légale.
 */
import type { BasisPoints, CentAmount } from "@/lib/canonical-model";
import { applyBasisPoints, sumCents } from "../corporate-tax/arithmetic";
import type { VatDirection, VatRateBucket, VatTransactionCandidate } from "./types";

/** Part de base en deçà de laquelle un taux constaté est signalé comme marginal. */
export const DEFAULT_OUTLIER_SHARE_BASIS_POINTS = 500; // 5 %

function labelFor(rate: BasisPoints | null): string {
  if (rate === null) return "Taux non derivable";
  const percent = (rate / 100).toFixed(2).replace(/\.?0+$/u, "");
  return `Taux constate ${percent} %`;
}

export function buildRateBuckets(options: {
  readonly candidates: readonly VatTransactionCandidate[];
  readonly direction: VatDirection;
  readonly outlierShareBasisPoints?: number;
}): readonly VatRateBucket[] {
  const outlierThreshold = options.outlierShareBasisPoints ?? DEFAULT_OUTLIER_SHARE_BASIS_POINTS;
  const relevant = options.candidates.filter((candidate) => candidate.direction === options.direction);

  const groups = new Map<string, VatTransactionCandidate[]>();
  for (const candidate of relevant) {
    const key = candidate.observedRateBasisPoints === null
      ? "unresolved"
      : String(candidate.observedRateBasisPoints);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const totalBase = sumCents(
    relevant.map((candidate) => candidate.baseAmountCents ?? 0),
    "vat_total_base",
  );

  const buckets = [...groups.entries()].map(([key, items]) => {
    const rate = key === "unresolved" ? null : Number(key);
    const baseAmountCents = sumCents(items.map((item) => item.baseAmountCents ?? 0), "bucket_base");
    const vatAccountedCents = sumCents(items.map((item) => item.vatAmountCents ?? 0), "bucket_vat");
    const vatTheoreticalCents = rate === null ? 0 : applyBasisPoints(baseAmountCents, rate);
    const shareOfBaseBasisPoints = totalBase === 0
      ? 0
      : Math.round(Math.abs(baseAmountCents) * 10_000 / Math.abs(totalBase));

    return {
      key: `${options.direction}:${key}`,
      direction: options.direction,
      rateBasisPoints: rate,
      label: labelFor(rate),
      baseAmountCents,
      vatAccountedCents,
      vatTheoreticalCents,
      differenceCents: vatAccountedCents - vatTheoreticalCents,
      transactionCount: items.length,
      transactionIds: items.map((item) => item.id).sort(),
      shareOfBaseBasisPoints: Math.min(shareOfBaseBasisPoints, 10_000),
      status: "secondary" as VatRateBucket["status"],
    };
  });

  const resolved = buckets.filter((bucket) => bucket.rateBasisPoints !== null);
  const dominantShare = resolved.reduce((max, bucket) =>
    bucket.shareOfBaseBasisPoints > max ? bucket.shareOfBaseBasisPoints : max, -1);

  return buckets
    .map((bucket) => ({
      ...bucket,
      status: bucket.rateBasisPoints === null
        ? ("unresolved" as const)
        : bucket.shareOfBaseBasisPoints === dominantShare
          ? ("dominant" as const)
          // Un taux marginal n'est signalé que s'il coexiste avec d'autres taux.
          : resolved.length > 1 && bucket.shareOfBaseBasisPoints < outlierThreshold
            ? ("outlier" as const)
            : ("secondary" as const),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function totalTheoreticalCents(buckets: readonly VatRateBucket[]): CentAmount {
  return sumCents(buckets.map((bucket) => bucket.vatTheoreticalCents), "vat_theoretical_total");
}

export function totalAccountedCents(buckets: readonly VatRateBucket[]): CentAmount {
  return sumCents(buckets.map((bucket) => bucket.vatAccountedCents), "vat_accounted_total");
}

export function totalBaseCents(buckets: readonly VatRateBucket[]): CentAmount {
  return sumCents(buckets.map((bucket) => bucket.baseAmountCents), "vat_base_total");
}
