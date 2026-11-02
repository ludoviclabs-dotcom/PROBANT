import { describe, expect, it } from "vitest";
import { bundleHashOf } from "@/lib/ifrs/shared/bundle";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { ImportBatch } from "../imports";
import { evaluateLeases, type LeaseResult } from "../lease-review";
import { stampLeaseWork } from "../lease-work";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, LEASE_PERIOD, seededLeaseRows, seededRandom, type LeaseRow } from "./lease-fixture";
import type { LeaseType } from "../lease-sources";

/**
 * L16-06 — propriétés du portefeuille sur 24 contrats tirés par graine (lecteur et porte d'import réels) : indépendance à l'ordre des lignes et
 * des contrats, sous-total égal à la somme des contrats calculés, retraitement équilibré par contrat et égal aux chiffres du moteur, aucun
 * compte de trésorerie, empreintes déterministes. Ces propriétés servent aussi de détecteurs aux mutations de `scripts/ifrs/mutations-l16.ts`.
 */
const scope: WorkpaperScope = { organizationId: "org-l16-06", dossierId: "dossier-l16-06", periodId: periodId(LEASE_PERIOD), mode: "demo" };
const actor: Principal = { id: "preparer-l16-06", grants: [{ scope, permissions: ["read", "prepare"] }] };
const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
  policies: [], confirmations: [] }, () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
type Rows = Record<LeaseType, LeaseRow[]>;
const c = (x: { amount: string }) => BigInt(x.amount.replace(".", ""));
const SUMMED = ["payments", "debtOpening", "additions", "interest", "principal", "debtClosing", "rouGross", "accumulatedOpening", "depreciation", "accumulatedClosing", "rouNetOpening", "rouNetClosing", "openingEquityEffect"] as const;

function evaluate(batches: ImportBatch[]) {
  const population = freezePopulation(scope, batches, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  return evaluateLeases(scope, LEASE_PERIOD, batches, { runId: "sheet-r1", rootId: "sheet", revision: 1 }, population, selection, work);
}
const portfolio = (edit?: (rows: Rows) => void) => approvedLeaseBatches(scope, actor, rows => { Object.assign(rows, seededLeaseRows(24, 36, 16006)); edit?.(rows); });
/** Figures and decisions without the proofs: proof identifiers name the file and the row, which a reordered source legitimately changes. */
const figures = (r: LeaseResult) => ({ outcome: r.outcome, portfolio: r.portfolio, bundleTotals: r.bundleTotals,
  contracts: r.contracts.map(x => ({ id: x.contractId, status: x.status, result: x.result, exact: x.exact, closing: x.closing, schedule: x.schedule, framing: x.framing.status, adjustment: x.adjustment })),
  lines: r.bundle?.lines.map(l => ({ account: l.account, side: l.side, amount: l.amount, contractId: l.contractId, nature: l.nature })), contributions: r.bundle?.resultContributions });
function shuffle<T>(xs: T[], rnd: () => number) { const out = [...xs]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }

describe("L16-06 propriétés du portefeuille (24 contrats tirés par graine)", () => {
  it("indépendant de l'ordre : chaque source mélangée donne les mêmes chiffres, le même retraitement et le même résultat de contrôle", async () => {
    const reference = evaluate(await portfolio()), rnd = seededRandom(7);
    expect(reference.portfolio.byResult.computed).toBe(24);
    for (let round = 0; round < 3; round++) {
      const mixed = evaluate(await portfolio(rows => { for (const type of Object.keys(rows) as LeaseType[]) rows[type] = shuffle(rows[type], rnd); }));
      expect(figures(mixed)).toEqual(figures(reference));
    }
  });

  it("sous-total : somme des seuls contrats calculés, poste par poste, au centime ; jamais un contrat compté deux fois", async () => {
    const r = evaluate(await portfolio()), computed = r.contracts.filter(x => x.result === "computed");
    expect(new Set(r.contracts.map(x => x.contractId)).size).toBe(r.contracts.length);
    expect(r.portfolio.computedSubtotal!.contracts).toBe(computed.length);
    for (const k of SUMMED) expect(c(r.portfolio.computedSubtotal![k]), k).toBe(computed.reduce((t, x) => t + c(x.closing![k]), 0n));
    expect(r.portfolio.byResult.computed + r.portfolio.byResult.diagnostic + r.portfolio.byResult.not_commenced + r.portfolio.byResult.not_applicable).toBe(r.contracts.length);
  });

  it("retraitement : équilibré par contrat, égal aux chiffres du moteur, contributions au résultat signées, aucune trésorerie", async () => {
    const r = evaluate(await portfolio()), bundle = r.bundle!;
    const included = r.contracts.filter(x => x.adjustment.status === "included");
    expect(new Set(bundle.lines.map(l => l.contractId))).toEqual(new Set(included.map(x => x.contractId)));
    for (const x of included) {
      const lines = bundle.lines.filter(l => l.contractId === x.contractId), side = (s: string) => lines.filter(l => l.side === s).reduce((t, l) => t + c(l.amount), 0n);
      expect(side("debit"), x.contractId).toBe(side("credit"));
      const amount = (account: string) => lines.filter(l => l.account === account).reduce((t, l) => t + c(l.amount), 0n);
      expect([amount("lease_liability"), amount("rou_gross") - amount("rou_accumulated_depreciation"), amount("lease_interest_expense"), amount("rou_depreciation_expense"), amount("pcg_rent_neutralized")], x.contractId)
        .toEqual([c(x.closing!.debtClosing), c(x.closing!.rouNetClosing), c(x.closing!.interest), c(x.closing!.depreciation), c(x.closing!.payments)]);
      const contributions = bundle.resultContributions.filter(k => k.contractId === x.contractId);
      expect(contributions.reduce((t, k) => t + c(k.amount), 0n), x.contractId).toBe(c(x.closing!.payments) - c(x.closing!.interest) - c(x.closing!.depreciation));
    }
    expect(bundle.lines.every(l => !/cash|bank|tresorerie/i.test(l.account))).toBe(true);
    expect([c(r.bundleTotals!.debit), c(r.bundleTotals!.credit)]).toEqual([bundle.lines.filter(l => l.side === "debit").reduce((t, l) => t + c(l.amount), 0n), bundle.lines.filter(l => l.side === "credit").reduce((t, l) => t + c(l.amount), 0n)]);
  });

  it("déterministe : mêmes sources, même résultat à l'octet et même empreinte de retraitement", async () => {
    const batches = await portfolio(), a = evaluate(batches), b = evaluate(batches), again = evaluate(await portfolio());
    expect(stableSha256(a)).toBe(stableSha256(b));
    expect(stableSha256(again)).toBe(stableSha256(a));
    expect(bundleHashOf(again.bundle!)).toBe(bundleHashOf(a.bundle!));
  });
});
