/**
 * Arithmetique en centimes entiers.
 *
 * Aucune valeur monetaire ne transite par un flottant : `base * taux` depasse
 * `Number.MAX_SAFE_INTEGER` des quelques centaines de millions d'euros, et un
 * arrondi implicite y perdrait des centimes. Les produits passent donc par
 * `bigint` et ne reviennent en `number` qu'une fois l'arrondi applique.
 */
import type { BasisPoints, CentAmount } from "@/lib/canonical-model";

const BASIS_POINT_SCALE = 10_000n;

function assertSafeCentAmount(value: bigint, operation: string): CentAmount {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`TAX_AMOUNT_OUT_OF_SAFE_RANGE:${operation}`);
  }
  return Number(value);
}

export function assertCentAmount(value: number, operation: string): CentAmount {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(`TAX_AMOUNT_NOT_INTEGER_CENTS:${operation}`);
  }
  return value;
}

/**
 * Applique un taux exprime en points de base, arrondi au centime le plus proche,
 * demi s'ecartant de zero. La regle d'arrondi est celle declaree par le bareme
 * (`half_up_cent`) : elle est donc tracee, pas implicite.
 */
export function applyBasisPoints(amountCents: CentAmount, basisPoints: BasisPoints): CentAmount {
  assertCentAmount(amountCents, "applyBasisPoints");
  const product = BigInt(amountCents) * BigInt(basisPoints);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const rounded = (magnitude * 2n + BASIS_POINT_SCALE) / (BASIS_POINT_SCALE * 2n);
  return assertSafeCentAmount(negative ? -rounded : rounded, "applyBasisPoints");
}

export function sumCents(values: readonly CentAmount[], operation: string): CentAmount {
  let total = 0n;
  for (const value of values) {
    assertCentAmount(value, operation);
    total += BigInt(value);
  }
  return assertSafeCentAmount(total, operation);
}

export function addCents(left: CentAmount, right: CentAmount, operation: string): CentAmount {
  assertCentAmount(left, operation);
  assertCentAmount(right, operation);
  return assertSafeCentAmount(BigInt(left) + BigInt(right), operation);
}

export function subtractCents(left: CentAmount, right: CentAmount, operation: string): CentAmount {
  assertCentAmount(left, operation);
  assertCentAmount(right, operation);
  return assertSafeCentAmount(BigInt(left) - BigInt(right), operation);
}

export function minCents(left: CentAmount, right: CentAmount): CentAmount {
  return left <= right ? left : right;
}

export function maxCents(left: CentAmount, right: CentAmount): CentAmount {
  return left >= right ? left : right;
}

export function clampToNonNegative(value: CentAmount): CentAmount {
  return value > 0 ? value : 0;
}
