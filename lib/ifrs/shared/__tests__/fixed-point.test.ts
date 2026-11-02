import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { money } from "@/lib/canonical-model/money";
import { abs, add, compare, div, FIXED_ONE, FIXED_ZERO, formatFixed, fromMoney, integerRoot, monthlyRateFromAnnual, mul, parseFixed, parseRate, pow, sub, times, toCents, type Fixed } from "../fixed-point";

/**
 * C01 — virgule fixe contre l'oracle indépendant de C00 (`docs/ifrs/recette/attendus_l16.py`, Decimal à 60 chiffres).
 * Critère fixé avant tout calcul (C00 § 5.1) : écart absolu ≤ 10⁻²⁰ € sur les valeurs exactes, égalité au centime des valeurs publiées.
 * La dette initiale est recomposée ici à partir des seules primitives : le moteur IFRS 16 n'existe pas encore (L16-02).
 */
type Fixture = { id: string; inputs: { months: number; payment: string; rate: string }; monthlyRateExact: string; debtInitialExact: string; debtInitial: string; mutationRateDividedBy12: { debtInitial: string; detected: boolean } };
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/ifrs/recette/attendus_l16.json"), "utf8")) as { fixtures: Fixture[] };
const TOLERANCE = parseFixed("0.00000000000000000001");
const presentValue = (payment: Fixed, monthly: Fixed, months: number) => {
  const discount = div(FIXED_ONE, add(FIXED_ONE, monthly));
  let factor = FIXED_ONE, total = FIXED_ZERO;
  for (let t = 1; t <= months; t++) { factor = mul(factor, discount); total = add(total, mul(payment, factor)); }
  return total;
};

describe("C01 virgule fixe — taux mensuel et dette initiale contre l'oracle", () => {
  it("couvre les dix fixtures de l'oracle", () => expect(oracle.fixtures.map(f => f.id)).toEqual(["L16-F01", "L16-F02", "L16-F03", "L16-F04", "L16-F05", "L16-F06", "L16-F07", "L16-F08", "L16-F09", "L16-F10"]));
  for (const f of oracle.fixtures) it(f.id + " : (1 + r)^(1/12) − 1 et Σ L / (1 + i)^t à 10⁻²⁰ près, dette publiée au centime", () => {
    const monthly = monthlyRateFromAnnual(parseRate(f.inputs.rate));
    expect(compare(abs(sub(monthly, parseFixed(f.monthlyRateExact))), TOLERANCE)).toBeLessThanOrEqual(0);
    const debt = presentValue(fromMoney({ amount: f.inputs.payment, currency: "EUR" }), monthly, f.inputs.months);
    expect(compare(abs(sub(debt, parseFixed(f.debtInitialExact))), TOLERANCE)).toBeLessThanOrEqual(0);
    expect(money(toCents(debt)).amount).toBe(f.debtInitial);
  });
  it("le taux mensuel est exact quand il l'est : 1 % pour (1,01)^12 − 1, zéro pour un taux zéro documenté", () => {
    expect(formatFixed(monthlyRateFromAnnual(parseRate("0.126825030131969720661201")))).toBe("0.0100000000000000000000000000000000000000");
    expect(monthlyRateFromAnnual(parseRate("0"))).toBe(FIXED_ZERO);
    // 2^(1/12) = 1,05946309435929526456182529494634170077920431… : racine par défaut à 40 décimales.
    expect(formatFixed(monthlyRateFromAnnual(parseRate("1")))).toBe("0.0594630943592952645618252949463417007792");
  });
  it("mutation r / 12 : détectée par l'écart au centime sur la dette publiée, comme l'oracle l'attend", () => {
    for (const f of oracle.fixtures) {
      const r = parseRate(f.inputs.rate), wrong = presentValue(fromMoney({ amount: f.inputs.payment, currency: "EUR" }), div(r, times(FIXED_ONE, 12)), f.inputs.months);
      expect(money(toCents(wrong)).amount).toBe(f.mutationRateDividedBy12.debtInitial);
      expect(money(toCents(wrong)).amount !== f.debtInitial).toBe(f.mutationRateDividedBy12.detected);
    }
  });
});

describe("C01 virgule fixe — frontières", () => {
  it("refuse un taux vide, signé, exponentiel, supérieur à 1, numérique ou de plus de 30 décimales", () => {
    for (const bad of ["", " 0.05", "0.05 ", "-0.01", "1.5", "1.0000000000000000000000000000001", "1e-3", ".05", "05", "0,05", "0." + "1".repeat(31)]) expect(() => parseRate(bad), JSON.stringify(bad)).toThrow("L16_RATE_INVALID");
    for (const bad of [0.05, null, undefined, 5n]) expect(() => parseRate(bad)).toThrow("L16_RATE_INVALID");
    expect(formatFixed(parseRate("0." + "1".repeat(30)))).toBe("0." + "1".repeat(30) + "0".repeat(10));
    expect(parseRate("1")).toBe(FIXED_ONE); expect(parseRate("1.0")).toBe(FIXED_ONE);
  });
  it("arrondit au centime moitié à l'opposé de zéro, sans biais de signe", () => {
    const cases: [string, bigint][] = [["0.005", 1n], ["-0.005", -1n], ["0.0049999999999999999999999999999999999999", 0n], ["-0.0049999999999999999999999999999999999999", 0n], ["2.675", 268n], ["-2.675", -268n], ["0.015", 2n]];
    for (const [text, expected] of cases) expect(toCents(parseFixed(text)), text).toBe(expected);
  });
  it("multiplication et division arrondies à l'échelle, division par zéro refusée", () => {
    const third = div(FIXED_ONE, times(FIXED_ONE, 3));
    expect(formatFixed(third)).toBe("0.3333333333333333333333333333333333333333");
    expect(formatFixed(div(times(FIXED_ONE, 2), times(FIXED_ONE, 3)))).toBe("0.6666666666666666666666666666666666666667");
    expect(formatFixed(div(times(FIXED_ONE, -2), times(FIXED_ONE, 3)))).toBe("-0.6666666666666666666666666666666666666667");
    expect(() => div(FIXED_ONE, FIXED_ZERO)).toThrow("L16_DIVISION_BY_ZERO");
    expect(pow(parseFixed("1.01"), 0)).toBe(FIXED_ONE);
  });
  it("gros montants sans perte : relecture exacte, centimes conservés bien au-delà de 2^53", () => {
    const big = fromMoney({ amount: "987654321987654321.99", currency: "EUR" });
    expect(money(toCents(big)).amount).toBe("987654321987654321.99");
    expect(parseFixed(formatFixed(big))).toBe(big);
    expect(money(toCents(mul(big, parseFixed("12")))).amount).toBe("11851851863851851863.88");
    expect(() => parseFixed("-0")).toThrow("L16_FIXED_INVALID");
    expect(() => parseFixed("")).toThrow("L16_FIXED_INVALID");
    expect(() => parseFixed("0." + "1".repeat(41))).toThrow("L16_FIXED_INVALID");
    expect(() => fromMoney({ amount: "1.5", currency: "EUR" })).toThrow("INVALID_EUR_MONEY");
  });
  it("racine entière par défaut, exacte sur les puissances", () => {
    expect(integerRoot(10n ** 480n, 12)).toBe(10n ** 40n);
    expect(integerRoot(10n ** 480n - 1n, 12)).toBe(10n ** 40n - 1n);
    expect(integerRoot(4096n, 12)).toBe(2n); expect(integerRoot(4095n, 12)).toBe(1n); expect(integerRoot(1n, 12)).toBe(1n); expect(integerRoot(0n, 12)).toBe(0n);
    expect(() => integerRoot(-1n, 12)).toThrow("L16_ROOT_INVALID");
  });
  it("une durée maximale de 120 mois reste rapide", () => {
    const start = performance.now();
    presentValue(fromMoney({ amount: "2500.00", currency: "EUR" }), monthlyRateFromAnnual(parseRate("0.04")), 120);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
