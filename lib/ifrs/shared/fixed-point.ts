import type { Money } from "@/lib/canonical-model/money";

/**
 * Virgule fixe interne des ateliers IFRS (C00, D02) : un `bigint` à l'échelle 10⁴⁰, sans dépendance.
 *
 * - Addition et soustraction exactes ; multiplication et division arrondies à l'échelle, moitié à l'opposé de zéro.
 * - Racine 12e par Newton entier : `floor((10⁴⁰ + r·10⁴⁰) × 10^(40×11))^(1/12)`.
 * - Jamais de `number` ni de chaîne vide convertie en zéro ; les valeurs sortent en chaînes à 40 décimales.
 *
 * Un taux ou un facteur n'est pas un montant : le type `Fixed` est distinct de `Money` (centimes) et du `ratePpm` des Emprunts.
 * Module pur, importable côté navigateur pour l'affichage d'une valeur déjà calculée par le serveur.
 */
declare const fixedBrand: unique symbol;
export type Fixed = bigint & { readonly [fixedBrand]: "fixed40" };

export const FIXED_SCALE = 40;
const ONE_RAW = 10n ** 40n;
export const FIXED_ONE = ONE_RAW as Fixed;
export const FIXED_ZERO = 0n as Fixed;
const CENT_SCALE = 10n ** 38n;
/** Taux saisi : fraction décimale de 0 à 1 inclus, au plus 30 décimales (C00 § 5.1). */
const RATE_PATTERN = /^(0|1)(\.\d{1,30})?$/;
const FIXED_PATTERN = /^-?(0|[1-9]\d*)(\.\d{1,40})?$/;

const fixed = (raw: bigint) => raw as Fixed;
/** Quotient arrondi moitié à l'opposé de zéro ; le diviseur est non nul. */
function roundedQuotient(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("L16_DIVISION_BY_ZERO");
  const negative = (numerator < 0n) !== (denominator < 0n), n = numerator < 0n ? -numerator : numerator, d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}
function parseScaled(text: string): Fixed {
  const negative = text.startsWith("-"), body = negative ? text.slice(1) : text, [whole, decimals = ""] = body.split(".");
  const raw = BigInt(whole) * ONE_RAW + BigInt(decimals.padEnd(FIXED_SCALE, "0"));
  return fixed(negative ? -raw : raw);
}

/** Taux annuel effectif saisi : refus d'une chaîne vide, signée, exponentielle, supérieure à 1 ou de plus de 30 décimales. */
export function parseRate(text: unknown): Fixed {
  if (typeof text !== "string" || !RATE_PATTERN.test(text)) throw new Error("L16_RATE_INVALID");
  const value = parseScaled(text);
  if (value > FIXED_ONE) throw new Error("L16_RATE_INVALID");
  return value;
}
/** Valeur exacte déjà publiée par le moteur (40 décimales au plus) : relecture sans perte. */
export function parseFixed(text: unknown): Fixed {
  if (typeof text !== "string" || !FIXED_PATTERN.test(text) || text === "-0" || /^-0(\.0+)?$/.test(text)) throw new Error("L16_FIXED_INVALID");
  return parseScaled(text);
}
/** Toujours 40 décimales, sans exposant : la chaîne relue redonne exactement la valeur. */
export function formatFixed(value: Fixed): string {
  const negative = value < 0n, raw = negative ? -value : value;
  return (negative ? "-" : "") + (raw / ONE_RAW).toString() + "." + (raw % ONE_RAW).toString().padStart(FIXED_SCALE, "0");
}
export function fromCents(value: bigint): Fixed { return fixed(value * CENT_SCALE); }
export function fromMoney(value: Money): Fixed {
  if (value.currency !== "EUR" || !/^-?(0|[1-9]\d*)\.\d{2}$/.test(value.amount)) throw new Error("INVALID_EUR_MONEY");
  return fromCents(BigInt(value.amount.replace(".", "")));
}
/** Arrondi au centime, moitié à l'opposé de zéro (C00, D12) : seule frontière vers `Money`. */
export function toCents(value: Fixed): bigint { return roundedQuotient(value, CENT_SCALE); }

export const add = (a: Fixed, b: Fixed) => fixed(a + b);
export const sub = (a: Fixed, b: Fixed) => fixed(a - b);
export const mul = (a: Fixed, b: Fixed) => fixed(roundedQuotient(a * b, ONE_RAW));
export const div = (a: Fixed, b: Fixed) => fixed(roundedQuotient(a * ONE_RAW, b));
/** Multiplication par un entier (nombre de mois, de loyers) : exacte. */
export const times = (a: Fixed, n: number) => { if (!Number.isSafeInteger(n)) throw new Error("L16_INTEGER_INVALID"); return fixed(a * BigInt(n)); };
export const compare = (a: Fixed, b: Fixed) => (a < b ? -1 : a > b ? 1 : 0);
export const abs = (a: Fixed) => fixed(a < 0n ? -a : a);

/** Puissance entière par multiplications successives arrondies : l'écart reste borné à n × 10⁻⁴⁰ pour un facteur proche de 1. */
export function pow(base: Fixed, exponent: number): Fixed {
  if (!Number.isSafeInteger(exponent) || exponent < 0) throw new Error("L16_INTEGER_INVALID");
  let result = FIXED_ONE;
  for (let k = 0; k < exponent; k++) result = mul(result, base);
  return result;
}

/** Racine k-ième entière par défaut (Newton sur les entiers, suite décroissante depuis un majorant). */
export function integerRoot(n: bigint, k: number): bigint {
  if (n < 0n || !Number.isSafeInteger(k) || k < 1) throw new Error("L16_ROOT_INVALID");
  if (n < 2n || k === 1) return n;
  const K = BigInt(k);
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) return x;
    x = y;
  }
}

/** Taux mensuel équivalent d'un taux annuel effectif : `(1 + r)^(1/12) − 1`, jamais `r / 12`. Pour r = 0, le résultat est exactement 0. */
export function monthlyRateFromAnnual(annual: Fixed): Fixed {
  if (annual < 0n || annual > FIXED_ONE) throw new Error("L16_RATE_INVALID");
  return fixed(integerRoot((ONE_RAW + annual) * ONE_RAW ** 11n, 12) - ONE_RAW);
}
