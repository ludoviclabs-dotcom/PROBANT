import { describe, expect, it } from "vitest";
import { clientReceivables, clientImpairment, frameClients, type ClientInput } from "../clients";
import { period, scope } from "./fixtures";
import { proof, known } from "./cutoff-fixtures";
const m = (s: string) => known(s).value;
export function clientFixture(): ClientInput { return { context: { scope, period, purpose: "synthetic_technical" }, invoices: [{ id: "SYN-I", customerId: "SYN-C", amount: m("1000.00"), issuedOn: "2023-12-01", letteringStatus: "unknown", bookedImpairment: known("20.00"), evidence: [proof] }], payments: [{ id: "P1", customerId: "SYN-C", amount: m("300.00"), paidOn: "2024-06-01", evidence: [proof] }, { id: "P2", customerId: "SYN-C", amount: m("200.00"), paidOn: "2024-07-01", evidence: [proof] }], allocations: [{ paymentId: "P1", invoiceId: "SYN-I", amount: m("300.00"), evidence: [proof] }, { paymentId: "P2", invoiceId: "SYN-I", amount: m("200.00"), evidence: [proof] }], credits: [] }; }
describe("Clients — fixtures synthétiques", () => {
  it("annulation ne masque pas une surallocation historique", () => { const x = clientFixture(); x.payments[0].cancelledOn = "2024-06-02"; x.allocations[0].amount = m("301.00"); expect(() => clientReceivables(x)).toThrow("PAYMENT_OVERALLOCATED"); });
  it("fige 700 à clôture et 200 ultérieurs, ancienneté distincte sans échéance", () => { const r = clientReceivables(clientFixture()).rows[0]; expect(r.dueAtClosing).toEqual(m("700.00")); expect(r.subsequentPayments).toEqual(m("200.00")); expect(r.dueAtReview).toEqual(m("500.00")); expect(r.aging.label).toContain("facture"); expect(r.impairmentEstimate.kind).toBe("unknown"); expect(r.bookedImpairment).toEqual(known("20.00")); });
  it("annulation postérieure ne réécrit pas la clôture, avoir conservé", () => { const x = clientFixture(); x.payments[0].cancelledOn = "2024-07-10"; x.credits.push({ id: "C1", invoiceId: "SYN-I", amount: m("50.00"), issuedOn: "2024-07-02", evidence: [proof] }); const r = clientReceivables(x); expect(r.rows[0].dueAtClosing).toEqual(m("700.00")); expect(r.rows[0].dueAtReview).toEqual(m("750.00")); });
  it("refuse allocation sans preuve, mauvais tiers, surallocation", () => { const x = clientFixture(); x.allocations[0].evidence = []; expect(() => clientReceivables(x)).toThrow(); x.allocations[0].evidence = [proof]; x.payments[0].customerId = "OTHER"; expect(() => clientReceivables(x)).toThrow(); x.payments[0].customerId = "SYN-C"; x.allocations[0].amount = m("301.00"); expect(() => clientReceivables(x)).toThrow(); });
  it("ne présume ni méthode ni base et refuse le réel", () => { const x = clientFixture(); expect(clientImpairment(x.context, null, null, null).kind).toBe("unknown"); x.context.scope = { ...scope, mode: "real" }; expect(() => clientReceivables(x)).toThrow(); });
  it("soldes créditeurs et compensations restent visibles", () => { const x = clientFixture(); const a = (id: string, amount: string) => ({ id, key: id, account: id, party: id, value: { amount: m(amount), date: period.closingDate, basis: "solde", evidence: [proof] } }); const r = frameClients(x.context, [a("1", "50.00"), a("2", "-50.00")], [a("1", "0.00"), a("2", "0.00")], [], []); expect(r.generalToAuxiliary.net).toEqual(known("0.00")); expect(r.generalToAuxiliary.gross).toEqual(known("100.00")); });
  it("cadre le GL par compte puis l'âge par client sans perdre la seconde comparaison", () => {
    const context = clientFixture().context;
    const row = (id: string, party: string, amount: string) => ({ id, key: id, account: "411", party, value: { amount: m(amount), date: period.closingDate, basis: "solde", evidence: [proof] } });
    const r = frameClients(context,
      [row("GL", "TOTAL", "700.00")],
      [row("A1", "C1", "400.00"), row("A2", "C2", "300.00")],
      [row("B1", "C1", "400.00"), row("B2", "C2", "250.00")], []);
    expect(r.generalToAuxiliary.net).toEqual(known("0.00"));
    expect(r.auxiliaryToAged.gross).toEqual(known("50.00"));
  });
});
