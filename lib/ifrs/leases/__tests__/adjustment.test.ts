import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cents, money } from "@/lib/canonical-model/money";
import { assertBundleCore, LOGICAL_ACCOUNTS } from "@/lib/ifrs/shared/bundle";
import { periodId, type WorkpaperScope } from "@/lib/workpapers/model";
import { buildLeaseBundle, contractAdjustmentLines, leaseBridge, LOGICAL_ACCOUNT_CATALOG, LOGICAL_ACCOUNTS_VERSION } from "../adjustment";
import { computeLease } from "../engine";
import { JOURNAL_COLUMNS, journalModelCsv } from "../journal-export";
import { monthEnd } from "../qualification";

/**
 * L16-03 — retraitement de clôture et pont par poste, comparés à l'oracle indépendant `docs/ifrs/recette/attendus_l16.json`
 * (Python, `decimal`, aucun code PROBANT importé). Le moteur ne fabrique aucun attendu : il est seulement confronté aux valeurs de l'oracle.
 */
type OracleClosing = {
  periodStart: string; closing: string; status: string; rentNeutralized: string; debtOpening: string; rouGross: string; accumulatedOpening: string; principal: string; interest: string;
  bundle: { account: string; side: string; amount: string }[]; bundleTotal: string; resultContributions: Record<string, string>; bridge: Record<string, { base: string; adjustment: string; target: string }>;
};
type OracleFixture = { id: string; inputs: { commencement: string; months: number; payment: string; rate: string; usefulLifeMonths: number }; closings: OracleClosing[] };
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/ifrs/recette/attendus_l16.json"), "utf8")) as { fixtures: OracleFixture[] };
const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
const scope = (p: { startDate: string; closingDate: string }): WorkpaperScope => ({ organizationId: "org", dossierId: "dossier", periodId: periodId({ ...p, asOfDate: p.closingDate, currency: "EUR", validation: "provisional" }), mode: "demo" });
const ledgerRef = { importId: "import-ledger", documentVersionId: "doc-ledger", sha256: "b".repeat(64) };

/** Entrées du moteur depuis la fixture ; un exercice ultérieur reprend l'ouverture de l'oracle (dette, brut, cumul de la veille). */
function compute(f: OracleFixture, c: OracleClosing) {
  const historical = monthIndex(f.inputs.commencement) < monthIndex(c.periodStart);
  const net = (cents({ amount: c.rouGross, currency: "EUR" }) - cents({ amount: c.accumulatedOpening, currency: "EUR" }));
  const opening = historical ? { date: monthEnd(monthIndex(c.periodStart) - 1), debt: c.debtOpening, rouGross: c.rouGross, rouAccumulated: c.accumulatedOpening,
    rouNet: money(net).amount, reportingRef: "Reporting IFRS de référence", reviewEvidence: "Revue de l'ouverture" } : null;
  const r = computeLease({ contractId: f.id, version: "v1", commencement: f.inputs.commencement, months: f.inputs.months, payment: { amount: f.inputs.payment, currency: "EUR" }, annualRate: f.inputs.rate,
    usefulLifeMonths: f.inputs.usefulLifeMonths, opening }, { startDate: c.periodStart, closingDate: c.closing });
  if (r.result !== "computed") throw new Error(f.id + " " + c.closing + " : " + r.result);
  return r;
}
const cases = oracle.fixtures.flatMap(f => f.closings.filter(c => c.status === "computed").map(c => ({ f, c })));

describe("L16-03 retraitement de clôture — égal à l'oracle sur chaque clôture calculée", () => {
  it("couvre toutes les clôtures calculées de l'oracle, dont des exercices ultérieurs avec effet d'ouverture", () => {
    expect(cases.length).toBe(17);
    expect(cases.filter(({ c }) => c.bundle.some(l => l.account === "opening_equity_effect")).length).toBeGreaterThanOrEqual(6);
  });
  for (const { f, c } of cases) it(f.id + " au " + c.closing + " : lignes, total, contributions et pont par poste", () => {
    const r = compute(f, c), lines = contractAdjustmentLines({ contractId: f.id, version: "v1", closing: r.closing, evidence: { calculation: ["calc"], ledger: ["gl"] } });
    expect(lines.map(l => ({ account: l.account, side: l.side, amount: l.amount.amount }))).toEqual(c.bundle);
    // No cash line: every account is a logical restatement account, never a bank or payment account.
    expect(lines.every(l => (LOGICAL_ACCOUNTS as readonly string[]).includes(l.account))).toBe(true);
    const period = { startDate: c.periodStart, closingDate: c.closing };
    const bundle = buildLeaseBundle({ runId: "run", rootId: "root", revision: 1, scope: scope(period), period, ledgerRef, contracts: [{ contractId: f.id, version: "v1", closing: r.closing, evidence: { calculation: ["calc"], ledger: ["gl"] } }] })!;
    expect(assertBundleCore(bundle)).toEqual(bundle);
    const debit = bundle.lines.filter(l => l.side === "debit").reduce((t, l) => t + cents(l.amount), 0n), credit = bundle.lines.filter(l => l.side === "credit").reduce((t, l) => t + cents(l.amount), 0n);
    expect(debit).toBe(credit); expect(debit).toBe(cents({ amount: c.bundleTotal, currency: "EUR" }));
    expect(Object.fromEntries(bundle.resultContributions.map(x => [x.nature, x.amount.amount]))).toEqual(Object.fromEntries(Object.entries(c.resultContributions).filter(([, v]) => !/^-?0\.00$/.test(v))));
    const bridge = leaseBridge(bundle, { amount: c.rentNeutralized, currency: "EUR" }, { contracts: [], unattachedLines: 0, absUnattached: { amount: "0.00", currency: "EUR" } });
    const POSTE: Record<string, string> = { rou: "rou", debt: "debt", pnl_before_tax: "pnlBeforeTax", opening_equity: "openingEquity" };
    expect(Object.fromEntries(bridge.rows.map(row => [POSTE[row.poste], { base: row.base.amount, adjustment: row.adjustment.amount, target: row.target.amount }]))).toEqual(c.bridge);
    expect(bridge.identity.openingPlusPeriod).toEqual(bridge.identity.rouNetMinusDebt);
    expect(bundle.taxStatus).toBe("not_computed");
  });
});

describe("L16-03 cas chiffrés du plan", () => {
  const f01 = oracle.fixtures.find(f => f.id === "L16-F01")!, january = f01.closings[0];
  it("F01, charge PCG de janvier de 1 000,00 € cadrée : ROU et dette 2 940,99 ; 970,59 de principal et 29,41 d'intérêt ; dotation 980,33 ; dette 1 970,40 ; ROU net 1 960,66 ; effet −9,74", () => {
    const r = compute(f01, january);
    // Economic movement of January (schedule detail), kept apart from the closing adjustment.
    expect(r.closing).toMatchObject({ additions: { amount: "2940.99" }, principal: { amount: "970.59" }, interest: { amount: "29.41" }, depreciation: { amount: "980.33" }, debtClosing: { amount: "1970.40" }, rouNetClosing: { amount: "1960.66" } });
    const period = { startDate: january.periodStart, closingDate: january.closing };
    const bundle = buildLeaseBundle({ runId: "run", rootId: "root", revision: 1, scope: scope(period), period, ledgerRef, contracts: [{ contractId: "F01", version: "v1", closing: r.closing, evidence: { calculation: [], ledger: ["gl-janvier"] } }] })!;
    const bridge = leaseBridge(bundle, { amount: "1000.00", currency: "EUR" }, { contracts: [], unattachedLines: 0, absUnattached: { amount: "0.00", currency: "EUR" } });
    expect(bridge.rows.find(x => x.poste === "pnl_before_tax")).toMatchObject({ base: { amount: "-1000.00" }, adjustment: { amount: "-9.74" }, target: { amount: "-1009.74" } });
    expect(bridge.rows.find(x => x.poste === "debt")!.target.amount).toBe("1970.40");
    expect(bridge.rows.find(x => x.poste === "rou")!.target.amount).toBe("1960.66");
    // The neutralized rent cites the reconciled ledger line; the PCG payment is never paid a second time.
    expect(bundle.lines.find(l => l.account === "pcg_rent_neutralized")).toMatchObject({ side: "credit", amount: { amount: "1000.00" }, evidence: ["gl-janvier"] });
  });
  it("F03 au 31/12/2028 (N+1) : effet d'ouverture −538,91 et effet de la période −8,84 séparés ; seule la dotation de 2028 passe en charge", () => {
    const f03 = oracle.fixtures.find(f => f.id === "L16-F03")!, c = f03.closings[1], r = compute(f03, c);
    const lines = contractAdjustmentLines({ contractId: "F03", version: "v1", closing: r.closing, evidence: { calculation: [], ledger: [] } });
    expect(lines.find(l => l.account === "opening_equity_effect")).toMatchObject({ side: "debit", amount: { amount: "538.91" }, nature: "opening_effect" });
    expect(lines.find(l => l.account === "rou_depreciation_expense")!.amount.amount).toBe("11140.43");
    expect(lines.find(l => l.account === "rou_accumulated_depreciation")!.amount.amount).toBe("22280.85");
    const period = { startDate: c.periodStart, closingDate: c.closing };
    const bundle = buildLeaseBundle({ runId: "run", rootId: "root", revision: 2, scope: scope(period), period, ledgerRef, contracts: [{ contractId: "F03", version: "v1", closing: r.closing, evidence: { calculation: [], ledger: [] } }] })!;
    const bridge = leaseBridge(bundle, { amount: "12000.00", currency: "EUR" }, { contracts: [], unattachedLines: 0, absUnattached: { amount: "0.00", currency: "EUR" } });
    expect(Object.fromEntries(bridge.rows.map(x => [x.poste, x.adjustment.amount]))).toEqual({ rou: "11140.42", debt: "11688.17", pnl_before_tax: "-8.84", opening_equity: "-538.91" });
    // No exposure total: four separate postes, no account for a balancing difference.
    expect(bridge.rows).toHaveLength(4);
    expect(bundle.lines.some(l => !(LOGICAL_ACCOUNTS as readonly string[]).includes(l.account))).toBe(false);
  });
  it("aucun contrat cadré ou base PCG non identifiée : aucun retraitement, jamais un retraitement à zéro", () => {
    const period = { startDate: "2027-01-01", closingDate: "2027-12-31" }, r = compute(oracle.fixtures.find(f => f.id === "L16-F03")!, oracle.fixtures.find(f => f.id === "L16-F03")!.closings[0]);
    expect(buildLeaseBundle({ runId: "run", rootId: "root", revision: 1, scope: scope(period), period, ledgerRef, contracts: [] })).toBeNull();
    expect(buildLeaseBundle({ runId: "run", rootId: "root", revision: 1, scope: scope(period), period, ledgerRef: null, contracts: [{ contractId: "F03", version: "v1", closing: r.closing, evidence: { calculation: [], ledger: [] } }] })).toBeNull();
  });
  it("deux contrats : lignes triées par contrat, identités triées, équilibre par contrat ; le pont additionne les contrats d'un même poste, jamais les postes entre eux", () => {
    const f01 = oracle.fixtures.find(f => f.id === "L16-F01")!, f04 = oracle.fixtures.find(f => f.id === "L16-F04")!;
    const a = compute(f01, f01.closings[1]), period = { startDate: "2027-01-01", closingDate: "2027-03-31" };
    const twin = computeLease({ contractId: "B", version: "v1", commencement: "2027-01-01", months: 3, payment: { amount: f04.inputs.payment, currency: "EUR" }, annualRate: f04.inputs.rate, usefulLifeMonths: 3, opening: null }, period);
    if (twin.result !== "computed") throw new Error("twin");
    const bundle = buildLeaseBundle({ runId: "run", rootId: "root", revision: 1, scope: scope(period), period, ledgerRef, contracts: [
      { contractId: "Z", version: "v1", closing: a.closing, evidence: { calculation: [], ledger: [] } }, { contractId: "B", version: "v2", closing: twin.closing, evidence: { calculation: [], ledger: [] } }] })!;
    expect(bundle.identities).toEqual(["ifrs16:lease:B", "ifrs16:lease:Z"]);
    expect(bundle.lines.map(l => l.contractId)).toEqual([...bundle.lines.map(l => l.contractId)].sort());
    const bridge = leaseBridge(bundle, { amount: "6000.00", currency: "EUR" }, { contracts: [], unattachedLines: 0, absUnattached: { amount: "0.00", currency: "EUR" } });
    expect(bridge.rows.find(x => x.poste === "pnl_before_tax")).toMatchObject({ base: { amount: "-6000.00" }, adjustment: { amount: "0.00" }, target: { amount: "-6000.00" } });
  });
});

describe("L16-03 modèle d'export du journal", () => {
  it("docs/ifrs/modeles/journal_retraitement.csv est la sortie exacte du code (npm run ifrs:l16-docs) : F01 en janvier, équilibré, sans trésorerie ni impôt calculé", () => {
    const text = readFileSync(resolve(__dirname, "../../../../docs/ifrs/modeles/journal_retraitement.csv"), "utf8").replace(/\r\n/g, "\n");
    expect(text).toBe(journalModelCsv());
    const [head, ...rows] = text.trim().split("\n").map(l => l.split(";"));
    expect(head).toEqual([...JOURNAL_COLUMNS]);
    const col = (name: string) => head.indexOf(name), sum = (name: string) => rows.reduce((t, r) => t + (r[col(name)] ? cents({ amount: r[col(name)], currency: "EUR" }) : 0n), 0n);
    expect(sum("debit")).toBe(sum("credit")); expect(sum("debit")).toBe(395073n);
    expect(rows.map(r => [r[col("logical_account")], r[col("debit")] || r[col("credit")]])).toEqual([["rou_gross", "2940.99"], ["rou_accumulated_depreciation", "980.33"], ["lease_liability", "1970.40"],
      ["lease_interest_expense", "29.41"], ["rou_depreciation_expense", "980.33"], ["pcg_rent_neutralized", "1000.00"]]);
    expect(rows.every(r => r[col("tax_status")] === "not_computed" && r[col("review_status")] === "proposed")).toBe(true);
  });
});

describe("L16-03 comptes logiques versionnés", () => {
  it("chaque compte logique du retraitement a un libellé, une famille et un poste ; ce sont des codes internes, pas des comptes PCG", () => {
    expect(LOGICAL_ACCOUNTS_VERSION).toBe("ifrs16-logical-accounts-1");
    expect(Object.keys(LOGICAL_ACCOUNT_CATALOG).sort()).toEqual([...LOGICAL_ACCOUNTS].sort());
    for (const spec of Object.values(LOGICAL_ACCOUNT_CATALOG)) expect(spec.label).not.toMatch(/^\d/);
  });
});
