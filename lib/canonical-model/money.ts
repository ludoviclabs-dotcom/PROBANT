/** Exact EUR boundary. Legacy UI numbers are converted explicitly and bounded. */
export interface Money { amount: string; currency: "EUR" }
export type KnownAmount =
  | { kind: "known"; value: Money }
  | { kind: "unknown"; reason: string }
  | { kind: "not_applicable"; reason: string };
export function cents(value: Money): bigint {
  if (value.currency !== "EUR" || !/^-?(0|[1-9]\d*)\.\d{2}$/.test(value.amount)) throw new Error("INVALID_EUR_MONEY");
  return BigInt(value.amount.replace(".", ""));
}
export function money(value: bigint): Money {
  const absolute = value < 0n ? -value : value;
  return { amount: `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`, currency: "EUR" };
}
/** Sub-cent values are rejected, not rounded using an invented business rule. */
export function legacyCents(value: number): bigint {
  const scaled = value * 100, rounded = Math.round(scaled);
  if (!Number.isFinite(value) || !Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.000001) throw new Error("INVALID_LEGACY_EUR_AMOUNT");
  return BigInt(rounded);
}
export function legacyEuros(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("EUR_AMOUNT_OUT_OF_LEGACY_RANGE");
  return Number(value) / 100;
}
