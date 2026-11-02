import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abs, compare, parseFixed, sub } from "@/lib/ifrs/shared/fixed-point";
import { computeLease, leaseSchedule } from "../engine";
import type { LeaseEngineInputs } from "../qualification";

/**
 * L16-02 — moteur contre l'oracle indépendant de C00 (`docs/ifrs/recette/attendus_l16.py`), établi avant le moteur et jamais importé.
 * Égalité au centime des valeurs publiées ; précision interne ≤ 10⁻²⁰ vérifiée à part.
 */
type Closing = Record<string, string> & { periodStart: string; closing: string; status: string; paymentsInPeriod: number };
type Fixture = { id: string; inputs: { commencement: string; months: number; payment: string; rate: string; usefulLifeMonths: number }; monthlyRateExact: string; debtInitialExact: string; debtInitial: string;
  rouInitial: string; depreciationMonths: number; maxAbsRoundingGap: string; totalInterest: string; schedule: Record<string, string | number>[]; scheduleTruncated: boolean; closings: Closing[] };
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/ifrs/recette/attendus_l16.json"), "utf8")) as { fixtures: Fixture[] };
const TOLERANCE = parseFixed("0.00000000000000000001");
const inputs = (f: Fixture, opening: LeaseEngineInputs["opening"] = null): LeaseEngineInputs => ({ contractId: f.id, version: "v1", commencement: f.inputs.commencement, months: f.inputs.months,
  payment: { amount: f.inputs.payment, currency: "EUR" }, annualRate: f.inputs.rate, usefulLifeMonths: f.inputs.usefulLifeMonths, opening });
/** A historical closing is computed only with an opening framed to the cent: the oracle's own opening is declared here. */
const framed = (c: Closing) => ({ date: monthBefore(c.periodStart), debt: c.debtOpening, rouGross: c.rouGross, rouAccumulated: c.accumulatedOpening, rouNet: money(cents(c.rouGross) - cents(c.accumulatedOpening)), reportingRef: "Reporting IFRS 2026 (synthétique)", reviewEvidence: "Revue synthétique" });
const cents = (x: string) => BigInt(x.replace(".", "")), money = (v: bigint) => (v < 0n ? "-" : "") + (v < 0n ? -v : v) / 100n + "." + String((v < 0n ? -v : v) % 100n).padStart(2, "0");
const monthBefore = (date: string) => { const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 0)); return d.toISOString().slice(0, 10); };

describe("L16-02 moteur IFRS 16 contre l'oracle", () => {
  for (const f of oracle.fixtures) {
    it(f.id + " : échéancier publié, valeurs exactes et chaque clôture au centime", () => {
      const s = leaseSchedule(inputs(f));
      expect(compare(abs(sub(s.monthly, parseFixed(f.monthlyRateExact))), TOLERANCE)).toBeLessThanOrEqual(0);
      expect(compare(abs(sub(s.exact[0], parseFixed(f.debtInitialExact))), TOLERANCE)).toBeLessThanOrEqual(0);
      const rows = f.scheduleTruncated ? [...s.rows.slice(0, 3), ...s.rows.slice(-3)] : s.rows;
      expect(rows.map(r => ({ t: r.t, dueDate: r.dueDate, payment: r.payment.amount, openingDebt: r.openingDebt.amount, interest: r.interest.amount, principal: r.principal.amount, closingDebt: r.closingDebt.amount,
        economicInterestRounded: r.economicInterestRounded.amount, roundingGap: r.roundingGap.amount }))).toEqual(f.schedule);
      expect(s.rows.reduce((t, r) => t + cents(r.interest.amount), 0n)).toBe(cents(f.totalInterest));
      for (const c of f.closings) {
        const historical = f.inputs.commencement < c.periodStart, r = computeLease(inputs(f, historical && c.status === "computed" ? framed(c) : null), { startDate: c.periodStart, closingDate: c.closing });
        if (c.status === "not_commenced") { expect(r.result).toBe("not_commenced"); continue; }
        if (r.result === "not_commenced") throw new Error("unexpected");
        expect(r.result, c.closing).toBe("computed");
        expect({ debtInitial: r.debtInitial.amount, rouInitial: r.rouInitial.amount, depreciationMonths: r.depreciationMonths, maxAbsRoundingGap: r.maxAbsRoundingGap.amount })
          .toEqual({ debtInitial: f.debtInitial, rouInitial: f.rouInitial, depreciationMonths: f.depreciationMonths, maxAbsRoundingGap: f.maxAbsRoundingGap });
        const x = r.closing;
        expect({ paymentsInPeriod: x.paymentsInPeriod, rentNeutralized: x.payments.amount, debtOpening: x.debtOpening.amount, additions: x.additions.amount, interest: x.interest.amount, principal: x.principal.amount,
          debtClosing: x.debtClosing.amount, rouGross: x.rouGross.amount, accumulatedOpening: x.accumulatedOpening.amount, depreciation: x.depreciation.amount, accumulatedClosing: x.accumulatedClosing.amount,
          rouNetClosing: x.rouNetClosing.amount, openingEquityEffect: x.openingEquityEffect.amount }, f.id + " " + c.closing)
          .toEqual({ paymentsInPeriod: c.paymentsInPeriod, rentNeutralized: c.rentNeutralized, debtOpening: c.debtOpening, additions: c.additions, interest: c.interest, principal: c.principal, debtClosing: c.debtClosing,
            rouGross: c.rouGross, accumulatedOpening: c.accumulatedOpening, depreciation: c.depreciation, accumulatedClosing: c.accumulatedClosing, rouNetClosing: c.rouNetClosing, openingEquityEffect: c.openingEquityEffect });
      }
    });
  }
  it("repères du plan (F01) : dette 2 940,99, dette après le premier loyer 1 970,40, ROU 2 940,99, intérêt économique du premier mois 29,41", () => {
    const f = oracle.fixtures.find(x => x.id === "L16-F01")!, s = leaseSchedule(inputs(f));
    expect([s.rows[0].openingDebt.amount, s.rows[0].closingDebt.amount, s.rows[0].economicInterestRounded.amount]).toEqual(["2940.99", "1970.40", "29.41"]);
  });
});

describe("L16-02 reprise historique, bornes et refus", () => {
  const f08 = oracle.fixtures.find(x => x.id === "L16-F08")!, c2027 = f08.closings.find(c => c.closing === "2027-12-31")!, period = { startDate: "2027-01-01", closingDate: "2027-12-31" };
  it("contrat historique : sans ouverture, ouverture incomplète ou différente d'un centime → diagnostic, chiffres affichés, ouverture jamais retenue pour équilibrer", () => {
    for (const opening of ["absent", "incomplete", null] as const) {
      const r = computeLease(inputs(f08, opening), period);
      expect(r.result).toBe("diagnostic");
    }
    const declared = framed(c2027), r = computeLease(inputs(f08, { ...declared, debt: money(cents(declared.debt) + 1n) }), period);
    expect(r.result).toBe("diagnostic");
    if (r.result !== "diagnostic") throw new Error("unexpected");
    expect(r.opening!.differences.debt.amount).toBe("0.01");
    expect(r.closing.debtOpening.amount).toBe(c2027.debtOpening);
    expect(computeLease(inputs(f08, { ...declared, date: "2026-12-30" }), period).result).toBe("diagnostic");
    expect(computeLease(inputs(f08, { ...declared, rouNet: money(cents(declared.rouNet) - 1n) }), period).result).toBe("diagnostic");
    expect(computeLease(inputs(f08, declared), period).result).toBe("computed");
  });
  it("refuse une durée hors bornes, un commencement hors convention, un exercice hors mois entiers, une durée d'utilité nulle", () => {
    const f01 = oracle.fixtures[0];
    expect(() => leaseSchedule({ ...inputs(f01), months: 121 })).toThrow("L16_CONTRACT_INVALID");
    expect(() => leaseSchedule({ ...inputs(f01), months: 0 })).toThrow("L16_CONTRACT_INVALID");
    expect(() => leaseSchedule({ ...inputs(f01), commencement: "2027-01-15" })).toThrow("L16_CONTRACT_INVALID");
    expect(() => leaseSchedule({ ...inputs(f01), annualRate: "-0.01" })).toThrow("L16_RATE_INVALID");
    expect(() => leaseSchedule({ ...inputs(f01), annualRate: "1.2" })).toThrow("L16_RATE_INVALID");
    expect(() => computeLease(inputs(f01), { startDate: "2027-01-15", closingDate: "2027-12-31" })).toThrow("L16_PERIOD_CALENDAR_INVALID");
    expect(() => computeLease(inputs(f01), { startDate: "2027-01-01", closingDate: "2027-12-30" })).toThrow("L16_PERIOD_CALENDAR_INVALID");
    expect(() => computeLease({ ...inputs(f01), usefulLifeMonths: 0 }, period)).toThrow("L16_CONTRACT_INVALID");
  });
  it("déterministe : deux exécutions donnent le même résultat ; 120 mois en moins d'un quart de seconde", () => {
    const f05 = oracle.fixtures.find(x => x.id === "L16-F05")!, t0 = performance.now(), a = computeLease(inputs(f05), period);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(JSON.stringify(computeLease(inputs(f05), period))).toBe(JSON.stringify(a));
  });
});
