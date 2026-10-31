import { describe, expect, it } from "vitest";
import { cents, money } from "@/lib/canonical-model/money";
import { leaseDemoView } from "@/lib/workpapers/lease-demo";
import { scheduleColumns, type LeaseContractResult, type LeaseResult } from "@/lib/workpapers/lease-review";
import type { WorkpaperNote, WorkpaperRun } from "@/lib/workpapers/model";
import { computeLease } from "../engine";
import { compareLeaseResults, leaseCharts, leasePortfolioView, portfolioRows, portfolioSummary } from "../portfolio";
import { monthEnd, type LeaseQualification } from "../qualification";

/**
 * L16-04 — vue de portefeuille établie par le serveur, sur le scénario synthétique (F01, F03, D08 calculés ; D04 à compléter, D05 exemption,
 * D06 hors V1, D07 non-location). Les séries mensuelles sont contrôlées par un second chemin : les chiffres de clôture du moteur
 * (`computeLease`) recalculés pour chaque fin de mois, indépendamment des lignes d'échéancier que relit la vue.
 */
async function demo() {
  const view = await leaseDemoView(), run = view.runs[0], result = run.result!.result as LeaseResult, qualification = (view.qualification as Record<string, LeaseQualification>)[run.id];
  return { view, run, result, qualification };
}
const sum = (xs: string[]) => money(xs.reduce((t, x) => t + cents({ amount: x, currency: "EUR" }), 0n)).amount;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("L16-04 séries et ponts du portefeuille calculé", () => {
  it("douze fins de mois et l'ouverture : chaque solde et chaque flux égal au moteur recalculé à cette date", async () => {
    const { result, qualification } = await demo(), charts = leaseCharts(result)!;
    expect(charts.contracts).toEqual(["D08", "F01", "F03"]);
    expect(charts.points.map(p => p.date)).toEqual(Array.from({ length: 12 }, (_, i) => monthEnd(2026 * 12 + i)));
    const inputs = charts.contracts.map(id => qualification.contracts.find(c => c.contractId === id)!.inputs!);
    for (const [i, point] of charts.points.entries()) {
      const toDate = inputs.map(x => computeLease(x, { startDate: "2026-01-01", closingDate: point.date }));
      const month = inputs.map(x => computeLease(x, { startDate: point.date.slice(0, 8) + "01", closingDate: point.date }));
      const closing = (rs: typeof toDate, k: "debtClosing" | "rouNetClosing" | "payments" | "interest" | "principal") => sum(rs.map(r => r.result === "not_commenced" ? "0.00" : r.closing[k].amount));
      expect([point.debt.amount, point.rouNet.amount], "soldes " + point.date).toEqual([closing(toDate, "debtClosing"), closing(toDate, "rouNetClosing")]);
      expect([point.payments.amount, point.interest.amount, point.principal.amount], "flux " + point.date).toEqual([closing(month, "payments"), closing(month, "interest"), closing(month, "principal")]);
      if (i === 0) expect(charts.opening).toEqual({ date: "2025-12-31", debt: money(0n), rouNet: money(0n) });
    }
    // F01 ends in March: from April the series carry F03 and D08 only, never a residual F01 balance.
    expect(charts.points[3].payments.amount).toBe(sum(["1000.00", "400.00"]));
  });

  it("ponts dette et droit d'utilisation séparés, égaux au sous-total canonique ; la population et l'exclusion sont écrites", async () => {
    const { result } = await demo(), charts = leaseCharts(result)!, st = result.portfolio.computedSubtotal!;
    expect(charts.debtBridge).toEqual({ opening: st.debtOpening, additions: st.additions, interest: st.interest, payments: st.payments, closing: st.debtClosing });
    expect(charts.rouBridge).toEqual({ opening: st.rouNetOpening, additions: st.additions, depreciation: st.depreciation, closing: st.rouNetClosing });
    expect(charts.flows).toEqual({ payments: st.payments, interest: st.interest, principal: st.principal });
    expect(charts.points.at(-1)!.debt).toEqual(st.debtClosing);
    expect(charts.excluded.map(e => e.contractId).sort()).toEqual(["D04", "D05", "D06", "D07"]);
    expect(charts.partial).toBe(true);
  });

  it("identité au centime : un sous-total altéré d'un centime est un défaut du code, jamais un graphique arrangé", async () => {
    const { result } = await demo(), broken = clone(result);
    broken.portfolio.computedSubtotal!.debtClosing = money(cents(broken.portfolio.computedSubtotal!.debtClosing) + 1n);
    expect(() => leaseCharts(broken)).toThrow("L16_CHART_IDENTITY");
    expect(leaseCharts({ ...clone(result), portfolio: { ...result.portfolio, computedSubtotal: null } })).toBeNull();
  });
});

describe("L16-04 ligne de synthèse et table du portefeuille", () => {
  it("synthèse : registre, calculables, exclus avec motif, à compléter ; montants des seuls contrats calculés, étiquetés partiels", async () => {
    const { result, qualification } = await demo(), s = portfolioSummary(qualification, result);
    expect(s).toMatchObject({ registry: 7, calculable: 3, toQualify: 1, results: { computed: 3, diagnostic: 0, not_commenced: 0, not_applicable: 4 } });
    expect(s.excluded).toEqual({ count: 3, byStatus: [{ status: "non_location", count: 1 }, { status: "exemption_documentee", count: 1 }, { status: "hors_scope_v1", count: 1 }] });
    expect(s.amounts).toEqual({ contracts: 3, debtClosing: result.portfolio.computedSubtotal!.debtClosing, rouNetClosing: result.portfolio.computedSubtotal!.rouNetClosing, partial: true, blocked: ["D04", "D06"] });
    // Before any calculation: counts from the qualification, no amount at all (never a zero).
    expect(portfolioSummary(qualification, null)).toMatchObject({ registry: 7, calculable: 3, results: null, amounts: null });
  });

  it("table : termes qualifiés et chiffres du moteur par contrat ; la revue lit les points générés, ouverts ou documentés", async () => {
    const { result, qualification } = await demo(), rows = portfolioRows(qualification, result, []);
    expect(rows).toHaveLength(7);
    const f03 = rows.find(r => r.contractId === "F03")!, f03r = result.contracts.find(c => c.contractId === "F03")!;
    expect(f03).toMatchObject({ commencement: "2026-01-01", lastDue: "2028-12-31", months: 36, annualRate: "0.05", payment: { amount: "1000.00", currency: "EUR" }, result: "computed",
      debtClosing: f03r.closing!.debtClosing, rouNetClosing: f03r.closing!.rouNetClosing, framing: "framed", adjustment: "included", review: "none" });
    expect(rows.find(r => r.contractId === "D04")).toMatchObject({ status: "a_qualifier", result: "not_applicable", debtClosing: null, rouNetClosing: null });
    const note = (id: string, resolved: boolean): WorkpaperNote => ({ id, kind: "observation", text: "x", amount: { kind: "unknown", reason: "x" }, authorId: "a", blocking: true,
      ...(resolved ? { resolution: { text: "documenté", authorId: "a", at: "2027-02-01T00:00:00.000Z" } } : {}) });
    const reviewed = portfolioRows(qualification, result, [note("lease:cadrage:D08", false), note("lease:D04", true)]);
    expect(reviewed.find(r => r.contractId === "D08")!.review).toBe("open");
    expect(reviewed.find(r => r.contractId === "D04")!.review).toBe("documented");
    expect(portfolioRows(qualification, null, []).every(r => r.review === null && r.debtClosing === null)).toBe(true);
  });
});

describe("L16-04 comparaison de deux versions exécutées", () => {
  /** Contrat F03 recalculé par le moteur avec d'autres paramètres, comme dans une révision exécutée. */
  function withF03(result: LeaseResult, change: { annualRate?: string; payment?: string }) {
    const next = clone(result), i = next.contracts.findIndex(c => c.contractId === "F03");
    const r = computeLease({ contractId: "F03", version: "v1", commencement: "2026-01-01", months: 36, payment: { amount: change.payment ?? "1000.00", currency: "EUR" }, annualRate: change.annualRate ?? "0.05", usefulLifeMonths: 36, opening: null },
      { startDate: "2026-01-01", closingDate: "2026-12-31" });
    if (r.result !== "computed") throw new Error("fixture");
    next.contracts[i] = { ...next.contracts[i], exact: r.exact, debtInitial: r.debtInitial, schedule: scheduleColumns(r.schedule), closing: r.closing, depreciationMonths: r.depreciationMonths } as LeaseContractResult;
    return next;
  }
  const at = (result: LeaseResult, revision: number) => ({ runId: "R" + revision, revision, version: 5, result });

  it("un seul fait observé : écart au centime et fait listé ; aucun effet attribué", async () => {
    const { result } = await demo(), current = withF03(result, { annualRate: "0.06" }), cmp = compareLeaseResults(at(result, 1), at(current, 2));
    const f03 = cmp.rows.find(r => r.contractId === "F03")!, before = result.contracts.find(c => c.contractId === "F03")!.closing!, after = current.contracts.find(c => c.contractId === "F03")!.closing!;
    expect(f03.changes).toEqual(["taux mensuel exact modifié"]);
    expect(f03.delta!.debtClosing).toEqual(money(cents(after.debtClosing) - cents(before.debtClosing)));
    expect(cmp.rows.find(r => r.contractId === "F01")).toMatchObject({ changes: [], delta: { debtClosing: money(0n) } });
    expect(cmp.rows.find(r => r.contractId === "D04")).toMatchObject({ delta: null });
    expect(cmp.limits.some(l => /pas séparables/.test(l))).toBe(false);
  });

  it("plusieurs faits sur un contrat : signalés non séparables ; contrat nouveau sans écart ; exercices différents refusés", async () => {
    const { result } = await demo(), current = withF03(result, { annualRate: "0.06", payment: "1100.00" });
    current.contracts.push({ ...clone(current.contracts.find(c => c.contractId === "F01")!), contractId: "N01" });
    const cmp = compareLeaseResults(at(result, 1), at(current, 2));
    expect(cmp.rows.find(r => r.contractId === "F03")!.changes).toEqual(["loyer mensuel 1000.00 → 1100.00", "taux mensuel exact modifié"]);
    expect(cmp.limits).toContain("Plusieurs faits sur un même contrat : leurs effets ne sont pas séparables par différence");
    expect(cmp.rows.find(r => r.contractId === "N01")).toMatchObject({ previous: null, delta: null, changes: ["contrat absent de la version antérieure"] });
    const other = { ...clone(result), period: { ...result.period, startDate: "2027-01-01", closingDate: "2027-12-31" } };
    expect(() => compareLeaseResults(at(result, 1), at(other, 2))).toThrow("L16_COMPARISON_PERIOD_MISMATCH");
  });

  it("vue de version : la comparaison prend la révision exécutée précédente de la même lignée, jamais une autre feuille", async () => {
    const { run, qualification } = await demo();
    const r1 = { ...clone(run), id: "A1", rootId: "A", revision: 1 } as WorkpaperRun, r2 = { ...clone(run), id: "A2", rootId: "A", revision: 2 } as WorkpaperRun, other = { ...clone(run), id: "B1", rootId: "B", revision: 1 } as WorkpaperRun;
    const blocked = { ...clone(run), id: "A0", rootId: "A", revision: 0, result: { ...clone(run.result!), execution: "blocked" } } as WorkpaperRun;
    expect(leasePortfolioView(r2, [other, blocked, r1, r2], qualification)!.comparison).toMatchObject({ previous: { runId: "A1", revision: 1 }, current: { runId: "A2", revision: 2 } });
    expect(leasePortfolioView(r1, [other, blocked, r1, r2], qualification)!.comparison).toBeNull();
    expect(leasePortfolioView({ ...r1, result: undefined } as WorkpaperRun, [], null)).toBeNull();
  });
});
