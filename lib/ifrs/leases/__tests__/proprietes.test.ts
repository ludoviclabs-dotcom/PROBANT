import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abs, compare, parseFixed, sub } from "@/lib/ifrs/shared/fixed-point";
import { computeLease, leaseSchedule, type ClosingFigures } from "../engine";
import { monthEnd, type LeaseEngineInputs } from "../qualification";

/**
 * L16-06 — propriétés du moteur sur 200 contrats tirés par graine, contre l'oracle indépendant (`docs/ifrs/recette/proprietes_l16.py`,
 * fonction `evaluate` de C00, Decimal à 60 chiffres, jamais importée ici). Critères fixés avant calcul : taux mensuel et dette initiale exacts
 * à 10⁻²⁰ près, montants publiés au centime. Puis invariants indépendants de l'oracle : conservation des loyers et du principal, ponts de
 * soldes, ROU jamais négatif, fin de plan, additivité des exercices successifs, déterminisme.
 */
type Closing = Record<string, string> & { periodStart: string; closing: string; status: string; paymentsInPeriod: number };
type Case = { id: string; inputs: { commencement: string; months: number; payment: string; rate: string; usefulLifeMonths: number }; monthlyRateExact: string; debtInitialExact: string;
  debtInitial: string; depreciationMonths: number; totalInterest: string; closingDebts: string[]; closing: Closing };
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/ifrs/recette/attendus_proprietes_l16.json"), "utf8")) as { seed: number; count: number; cases: Case[] };
const TOLERANCE = parseFixed("0.00000000000000000001");
const c = (x: { amount: string } | string) => BigInt((typeof x === "string" ? x : x.amount).replace(".", ""));
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const inputs = (k: Case, opening: LeaseEngineInputs["opening"] = null): LeaseEngineInputs => ({ contractId: k.id, version: "v1", commencement: k.inputs.commencement, months: k.inputs.months,
  payment: { amount: k.inputs.payment, currency: "EUR" }, annualRate: k.inputs.rate, usefulLifeMonths: k.inputs.usefulLifeMonths, opening });
/** A historical closing is computed only with an opening framed to the cent: the expected opening is declared, as in the L16-02 recipe. */
const framedOpening = (k: Case, start: string, expected: ClosingFigures) => ({ date: monthEnd(monthIndex(start) - 1), debt: expected.debtOpening.amount, rouGross: expected.rouGross.amount,
  rouAccumulated: expected.accumulatedOpening.amount, rouNet: expected.rouNetOpening.amount, reportingRef: "Reporting synthétique " + k.id, reviewEvidence: "Revue synthétique" });
/** Figures of a calendar year: a period commencing before the year needs its framed opening, read from a first diagnostic pass. */
function yearFigures(k: Case, year: number) {
  const period = { startDate: year + "-01-01", closingDate: year + "-12-31" }, first = computeLease(inputs(k), period);
  if (first.result === "not_commenced" || k.inputs.commencement >= period.startDate) return first;
  return computeLease(inputs(k, framedOpening(k, period.startDate, first.closing)), period);
}

describe("L16-06 moteur contre 200 contrats tirés par graine (oracle indépendant)", () => {
  it("couverture du tirage : durées de 1 à 120 mois, taux nul et longs, durée d'utilité plus courte et plus longue, clôtures avant, pendant et après", () => {
    expect([oracle.seed, oracle.count, oracle.cases.length]).toEqual([16006, 200, 200]);
    const months = oracle.cases.map(k => k.inputs.months);
    expect(Math.min(...months)).toBe(1); expect(Math.max(...months)).toBe(120);
    expect(oracle.cases.filter(k => k.inputs.rate === "0").length).toBeGreaterThan(5);
    expect(oracle.cases.filter(k => k.inputs.rate.length > 20).length).toBeGreaterThan(5);
    expect(oracle.cases.filter(k => k.inputs.usefulLifeMonths < k.inputs.months).length).toBeGreaterThan(20);
    expect(oracle.cases.filter(k => k.inputs.usefulLifeMonths > k.inputs.months).length).toBeGreaterThan(5);
    expect(oracle.cases.filter(k => k.closing.status === "not_commenced").length).toBeGreaterThan(10);
    expect(oracle.cases.filter(k => k.closing.status === "computed" && k.inputs.commencement < k.closing.periodStart).length).toBeGreaterThan(30);
  });

  it("chaque contrat : taux mensuel et dette initiale exacts à 10⁻²⁰, dette publiée après chaque échéance et chiffres de la clôture au centime", () => {
    for (const k of oracle.cases) {
      const s = leaseSchedule(inputs(k));
      expect(compare(abs(sub(s.monthly, parseFixed(k.monthlyRateExact))), TOLERANCE), k.id).toBeLessThanOrEqual(0);
      expect(compare(abs(sub(s.exact[0], parseFixed(k.debtInitialExact))), TOLERANCE), k.id).toBeLessThanOrEqual(0);
      expect(s.rows.map(r => r.closingDebt.amount), k.id).toEqual(k.closingDebts);
      expect(s.rows.reduce((t, r) => t + c(r.interest), 0n), k.id).toBe(c(k.totalInterest));
      const year = Number(k.closing.closing.slice(0, 4)), r = yearFigures(k, year);
      if (k.closing.status === "not_commenced") { expect(r.result, k.id).toBe("not_commenced"); continue; }
      if (r.result === "not_commenced") throw new Error(k.id + " : not_commenced inattendu");
      expect([r.result, r.debtInitial.amount, r.depreciationMonths], k.id).toEqual(["computed", k.debtInitial, k.depreciationMonths]);
      const x = r.closing, e = k.closing;
      expect({ paymentsInPeriod: x.paymentsInPeriod, rentNeutralized: x.payments.amount, debtOpening: x.debtOpening.amount, additions: x.additions.amount, interest: x.interest.amount, principal: x.principal.amount,
        debtClosing: x.debtClosing.amount, rouGross: x.rouGross.amount, accumulatedOpening: x.accumulatedOpening.amount, depreciation: x.depreciation.amount, accumulatedClosing: x.accumulatedClosing.amount,
        rouNetClosing: x.rouNetClosing.amount, openingEquityEffect: x.openingEquityEffect.amount }, k.id)
        .toEqual({ paymentsInPeriod: e.paymentsInPeriod, rentNeutralized: e.rentNeutralized, debtOpening: e.debtOpening, additions: e.additions, interest: e.interest, principal: e.principal, debtClosing: e.debtClosing,
          rouGross: e.rouGross, accumulatedOpening: e.accumulatedOpening, depreciation: e.depreciation, accumulatedClosing: e.accumulatedClosing, rouNetClosing: e.rouNetClosing, openingEquityEffect: e.openingEquityEffect });
    }
  });
});

describe("L16-06 invariants du moteur, indépendants de l'oracle", () => {
  it("conservation : loyers = dette initiale + intérêts, principal cumulé = dette initiale, dette finale nulle, chaque échéance équilibrée, écart d'arrondi ≤ 1 centime", () => {
    for (const k of oracle.cases) {
      const s = leaseSchedule(inputs(k)), L = c(k.inputs.payment), d0 = s.published[0];
      expect(s.rows.reduce((t, r) => t + c(r.payment), 0n), k.id).toBe(d0 + s.rows.reduce((t, r) => t + c(r.interest), 0n));
      expect(s.rows.reduce((t, r) => t + c(r.principal), 0n), k.id).toBe(d0);
      expect(s.rows.at(-1)!.closingDebt.amount, k.id).toBe("0.00");
      for (const r of s.rows) {
        expect(c(r.openingDebt) - c(r.principal), k.id + " t" + r.t).toBe(c(r.closingDebt));
        expect(c(r.principal) + c(r.interest), k.id + " t" + r.t).toBe(L);
        expect(c(r.roundingGap) <= 1n && c(r.roundingGap) >= -1n, k.id + " t" + r.t).toBe(true);
      }
    }
  });

  it("exercices successifs : ponts de dette et de droit d'utilisation, ROU jamais négatif, clôture = ouverture suivante, sommes égales aux totaux du contrat, fin de plan à zéro", () => {
    for (const k of oracle.cases) {
      const s = leaseSchedule(inputs(k)), first = Number(k.inputs.commencement.slice(0, 4)), last = Math.floor((monthIndex(k.inputs.commencement) + Math.max(k.inputs.months, k.inputs.usefulLifeMonths)) / 12) + 1;
      let payments = 0n, interest = 0n, depreciation = 0n, previous: ClosingFigures | null = null;
      for (let year = first; year <= last; year++) {
        const r = yearFigures(k, year);
        if (r.result === "not_commenced") throw new Error(k.id + " " + year);
        expect(r.result, k.id + " " + year).toBe("computed");
        const x = r.closing;
        expect(c(x.debtOpening) + c(x.additions) + c(x.interest) - c(x.payments), k.id + " " + year).toBe(c(x.debtClosing));
        expect(c(x.accumulatedOpening) + c(x.depreciation), k.id + " " + year).toBe(c(x.accumulatedClosing));
        expect(c(x.rouGross) - c(x.accumulatedClosing), k.id + " " + year).toBe(c(x.rouNetClosing));
        expect(c(x.rouNetOpening) - c(x.debtOpening), k.id + " " + year).toBe(c(x.openingEquityEffect));
        expect(c(x.rouNetClosing) >= 0n && c(x.depreciation) >= 0n && c(x.debtClosing) >= 0n, k.id + " " + year).toBe(true);
        if (previous) expect([x.debtOpening, x.accumulatedOpening, x.rouNetOpening], k.id + " " + year).toEqual([previous.debtClosing, previous.accumulatedClosing, previous.rouNetClosing]);
        payments += c(x.payments); interest += c(x.interest); depreciation += c(x.depreciation); previous = x;
      }
      expect([payments, interest, depreciation], k.id).toEqual([c(k.inputs.payment) * BigInt(k.inputs.months), s.rows.reduce((t, r) => t + c(r.interest), 0n), s.published[0]]);
      expect([previous!.debtClosing.amount, previous!.rouNetClosing.amount], k.id).toEqual(["0.00", "0.00"]);
    }
  });

  it("déterministe : deux calculs du même contrat sont identiques, à l'octet près", () => {
    for (const k of oracle.cases.slice(0, 40)) {
      const period = { startDate: k.closing.periodStart, closingDate: k.closing.closing };
      expect(JSON.stringify(computeLease(inputs(k, "absent"), period)), k.id).toBe(JSON.stringify(computeLease(inputs(k, "absent"), period)));
    }
  });
});
