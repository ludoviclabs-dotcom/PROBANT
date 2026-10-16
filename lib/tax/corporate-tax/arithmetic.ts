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

/**
 * Somme exacte de produits `base x taux`, en centimes x points de base. Aucune
 * etape intermediaire n'est arrondie : la liquidation arrondit ce total une
 * seule fois (CGI art. 1724, « au niveau du decompte de chaque impot »).
 */
export function exactBasisPointProducts(
  items: readonly { readonly amountCents: CentAmount; readonly basisPoints: BasisPoints }[],
): bigint {
  let total = 0n;
  for (const item of items) {
    assertCentAmount(item.amountCents, "exactBasisPointProducts");
    total += BigInt(item.amountCents) * BigInt(item.basisPoints);
  }
  return total;
}

/**
 * Arrondit a l'euro le plus proche un montant positif exprime en centimes x
 * points de base ; la fraction d'euro egale a 0,50 est comptee pour 1 (CGI
 * art. 219, I et art. 1724). Resultat en centimes, multiple de 100.
 */
export function roundToNearestEuroHalfUp(exactCentBasisPoints: bigint, operation: string): CentAmount {
  if (exactCentBasisPoints < 0n) throw new Error(`TAX_EURO_ROUNDING_NEGATIVE:${operation}`);
  const euroScale = BASIS_POINT_SCALE * 100n;
  const euros = (exactCentBasisPoints * 2n + euroScale) / (euroScale * 2n);
  return assertSafeCentAmount(euros * 100n, operation);
}

/** Arrondi a l'euro d'un montant positif en centimes (meme regle que ci-dessus). */
export function roundCentsToNearestEuroHalfUp(amountCents: CentAmount, operation: string): CentAmount {
  assertCentAmount(amountCents, operation);
  return roundToNearestEuroHalfUp(BigInt(amountCents) * BASIS_POINT_SCALE, operation);
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
