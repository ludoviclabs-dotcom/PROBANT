import { describe, expect, it } from "vitest";
import { money } from "@/lib/canonical-model/money";
import { assertClientsSalesBatch, clientsSalesDraftSchema, clientsSalesDraftFromWork, clientsSalesResultSchema, evaluateClientsSales, stampClientsSalesWork } from "../clients-sales";
import { clientReceivables, clientImpairment, clientEvidence } from "../clients";
import { ClientsSalesRegistry, CLIENT_SALES_RULE } from "../clients-sales-adapter";
import { freezePopulation, selectPopulation } from "../selection";
import { clientsSalesFixture, salesBatch, salesPeriod } from "./clients-sales-fixture";

const m = money;
describe("Clients et ventes — contrat serveur limité", () => {
  it("facture ouverte 1000, encaissement affecté 300, reste 700 sans opinion ni retard inventé", async () => {
    const f = await clientsSalesFixture(), r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, f.work);
    expect(r.mode).toBe("real"); expect(r.rows[0].dueAtClosing).toEqual(m(100000n)); expect(r.rows[0].subsequentPayments).toEqual(m(30000n)); expect(r.rows[0].dueAtReview).toEqual(m(70000n));
    expect(r.rows[0].overdueDays).toBeNull(); expect(r.rows[0].aging.basis).toBe("invoice"); expect(r.rows[0].uncertainties.join(" ")).toContain("ni une perte estimée ni une créance entièrement sûre");
    expect(r.estimates).toEqual([]); expect(r.controls.map(c => c.denominator)).toEqual([1, 1, 1]); expect(r.controls[1].numerator).toBe(0); expect(r.conclusion).toBeNull();
    expect(r.allocations[0].authorId).toBe(f.actor.id); expect(r.allocations[0].evidence[0].documentVersionId).toBe(f.imports[1].document.id);
  });
  it("proposition n'affecte aucun solde ; mauvais tiers documenté puis validation refusée", async () => {
    const f = await clientsSalesFixture(); f.draft.allocations[0].status = "proposed";
    f.imports[1] = await salesBatch("clients_payments", ["P1;300.00;2024-07-05;OTHER;EUR;;;;payment;"]);
    f.draft.allocations[0].evidenceRefs = [{ importId: f.imports[1].id, rowId: f.imports[1].rows[0].id }];
    const work = stampClientsSalesWork({ ...f, at: "2024-08-01T10:01:00Z" }), r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, work);
    expect(r.rows[0].dueAtReview).toEqual(m(100000n)); expect(r.exceptions.some(e => e.code === "ALLOCATION_PARTY_MISMATCH")).toBe(true);
    f.draft.allocations[0].status = "validated"; expect(() => stampClientsSalesWork({ ...f, at: "2024-08-01T10:02:00Z" })).toThrow("PARTY_MISMATCH");
  });
  it("refuse paiement utilisé deux fois ; paiement groupé réparti sans surallocation", async () => {
    const f = await clientsSalesFixture(); f.draft.allocations.push({ ...f.draft.allocations[0], id: "A2" });
    expect(() => stampClientsSalesWork({ ...f, at: "2024-08-01T10:02:00Z" })).toThrow("PAYMENT_OVERALLOCATED");
    f.imports[0] = await salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;EUR;;;0.00;;", "I2;1000.00;2024-01-11;C1;EUR;;;0.00;;"]);
    f.imports[1] = await salesBatch("clients_payments", ["P1;600.00;2024-07-05;C1;EUR;;;;grouped;"]);
    f.draft.allocations[1].invoiceId = "I2"; f.draft.allocations.forEach(a => a.evidenceRefs = [{ importId: f.imports[1].id, rowId: f.imports[1].rows[0].id }]);
    const r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }));
    expect(r.rows.map(i => i.dueAtReview.amount)).toEqual(["700.00", "700.00"]); expect(r.payments[0].availableToAllocate.amount).toBe("0.00"); expect(r.controls[0].denominator).toBe(2);
  });
  it("annulation postérieure trace le paiement et conserve le solde clôture", async () => {
    const f = await clientsSalesFixture(); f.imports[1] = await salesBatch("clients_payments", ["P1;300.00;2024-07-05;C1;EUR;;2024-07-10;;payment;"]);
    f.draft.allocations[0].evidenceRefs = [{ importId: f.imports[1].id, rowId: f.imports[1].rows[0].id }];
    const r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }));
    expect(r.rows[0].dueAtClosing.amount).toBe("1000.00"); expect(r.rows[0].dueAtReview.amount).toBe("1000.00"); expect(r.payments[0].status).toBe("cancelled"); expect(r.payments[0].availableToAllocate.amount).toBe("0.00");
    expect(r.rows[0].timeline.some(t => t.kind === "cancelled_payment" && t.effect === "review")).toBe(true); expect(r.exceptions.some(e => e.code === "PAYMENT_CANCELLED")).toBe(true);
  });
  it("avoir postérieur et annulation de facture ne réécrivent pas la clôture", async () => {
    const f = await clientsSalesFixture(); f.imports[0] = await salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;EUR;;2024-07-18;0.00;;"]);
    f.imports.push(await salesBatch("clients_credits", ["CREDIT;100.00;2024-07-12;C1;EUR;;;;;I1"]));
    const r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }));
    expect(r.rows[0].dueAtClosing.amount).toBe("1000.00"); expect(r.rows[0].dueAtReview.amount).toBe("600.00"); expect(r.rows[0].subsequentCredits.amount).toBe("100.00");
    expect(r.exceptions.some(e => e.code === "INVOICE_CANCELLATION_UNCERTAIN")).toBe(true); expect(r.rows[0].timeline.find(t => t.kind === "cancelled_invoice")?.effect).toBe("none");
  });
  it("refuse réduction excessive à une date même quand le paiement est annulé plus tard", async () => {
    const f = await clientsSalesFixture(); f.imports[1] = await salesBatch("clients_payments", ["P1;300.00;2024-07-05;C1;EUR;;2024-07-20;;payment;"]); f.imports.push(await salesBatch("clients_credits", ["CREDIT;800.00;2024-07-12;C1;EUR;;;;;I1"]));
    f.draft.allocations[0].evidenceRefs = [{ importId: f.imports[1].id, rowId: f.imports[1].rows[0].id }];
    expect(() => stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" })).toThrow("INVOICE_OVERALLOCATED_AT_DATE");
    f.imports[3] = await salesBatch("clients_credits", ["CREDIT;800.00;2024-07-25;C1;EUR;;;;;I1"]);
    const r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" })); expect(r.rows[0].dueAtReview.amount).toBe("200.00");
  });
  it("méthode absente reste une incertitude ; estimation explicite porte base auteur et pièces", async () => {
    const f = await clientsSalesFixture(); f.draft.estimates.push({ id: "E1", invoiceId: "I1", method: null, base: m(100000n), amount: m(70000n), rationale: "Créance à analyser", dispute: "", evidenceRefs: [f.windowRef] });
    let work = stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }), r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, work);
    expect(r.estimates[0].difference.kind).toBe("unknown"); expect(r.estimates[0].status).toBe("inconclusive"); expect(r.rows[0].dueAtReview.amount).toBe("700.00");
    f.draft.estimates[0].method = { id: "M1", version: "1", source: "Note méthodologique importée", basis: "solde ouvert clôture", from: "2024-01-01", to: "2024-06-30" }; f.draft.estimates[0].amount = m(20000n);
    work = stampClientsSalesWork({ ...f, at: "2024-08-01T10:04:00Z" }); r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, work);
    expect(r.estimates[0].difference).toEqual({ kind: "known", value: m(20000n) }); expect(r.estimates[0].authorId).toBe(f.actor.id); expect(r.estimates[0].evidence).toHaveLength(1);
  });
  it("confirmation reliée à ses preuves ; origine directe déclarée demeure à authentifier", async () => {
    const f = await clientsSalesFixture(); f.draft.confirmations.push({ id: "CONF1", invoiceIds: ["I1"], request: { date: "2024-07-01", channel: "Courriel manuel", evidenceRefs: [f.windowRef] }, response: { date: "2024-07-10", confirmedAt: "2024-06-30", origin: "direct_documented", channel: "Courriel manuel", evidenceRefs: [f.windowRef], originEvidenceRefs: [f.windowRef] }, reconciliation: { status: "differences", note: "Différence à expliquer", evidenceRefs: [f.windowRef] }, alternative: null });
    const work = stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }), r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, work);
    expect(r.rows[0].confirmationIds).toEqual(["CONF1"]); expect(r.confirmations[0].record.response?.origin).toBe("unknown"); expect(r.confirmations[0].declaredOrigin).toBe("direct_documented"); expect(r.exceptions.some(e => e.code === "CONFIRMATION_DIFFERENCES")).toBe(true); expect(r.confirmations[0].authorId).toBe(f.actor.id);
    expect(clientsSalesResultSchema.safeParse({ ...r, confirmations: [{ ...r.confirmations[0], record: { request: 42 } }] }).success).toBe(false);
  });
  it("absence d'échéance, devise refusée, preuves transversales et rôles navigateur interdits", async () => {
    const f = await clientsSalesFixture(); const bad = await salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;USD;;;0.00;;"]); expect(() => assertClientsSalesBatch(bad, salesPeriod)).toThrow("CURRENCY_UNSUPPORTED");
    expect(clientsSalesDraftSchema.safeParse({ ...f.draft, role: "reviewer" }).success).toBe(false); expect(clientsSalesDraftSchema.safeParse({ ...f.draft, allocations: [{ ...f.draft.allocations[0], authorId: "forged" }] }).success).toBe(false);
    expect(() => stampClientsSalesWork({ ...f, scope: { ...f.scope, organizationId: "OTHER" }, at: "2024-08-01T10:03:00Z" })).toThrow(); expect(clientsSalesDraftFromWork(f.work)).toEqual(f.draft);
  });
  it("les fonctions Clients ne s'ouvrent qu'au contexte dédié ; autres usages réels refusés", async () => {
    const f = await clientsSalesFixture(), context = { scope: f.scope, period: f.period, purpose: "real" as const };
    expect(() => clientReceivables({ context, invoices: [], payments: [], allocations: [], credits: [] })).toThrow("CONTEXT_INVALID"); expect(() => clientImpairment(context, null, null, null)).toThrow("CONTEXT_INVALID"); expect(() => clientEvidence(context, [], [])).toThrow("CONTEXT_INVALID");
  });
  it("avoir mauvais tiers n’est pas déduit et facture annulée avant clôture est refusée", async () => {
    const f = await clientsSalesFixture(); f.imports.push(await salesBatch("clients_credits", ["CREDIT;100.00;2024-07-12;OTHER;EUR;;;;;I1"]));
    const r = evaluateClientsSales(f.scope, f.period, f.imports, f.runId, stampClientsSalesWork({ ...f, at: "2024-08-01T10:03:00Z" }));
    expect(r.rows[0].dueAtReview.amount).toBe("700.00"); expect(r.exceptions.find(e=>e.code==="CREDIT_PARTY_MISMATCH")?.controlId).toBe("cashCredit");
    const before = await salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;EUR;;2024-06-20;0.00;;"]); expect(()=>assertClientsSalesBatch(before,f.period)).toThrow("NOT_OPEN_AT_CLOSING");
  });
  it("preuves de méthode doivent provenir des sources approuvées ; échéance fournie est distincte", async () => {
    const f = await clientsSalesFixture(); f.imports[0] = await salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;EUR;2024-08-15;;0.00;;"]);
    f.draft.estimates.push({id:"E1",invoiceId:"I1",method:{id:"M1",version:"1",source:"Méthode documentée",basis:"solde ouvert",from:"2024-01-01",to:"2024-06-30"},base:m(100000n),amount:m(10000n),rationale:"Montant fourni",dispute:"",evidenceRefs:[{importId:"OTHER-IMPORT",rowId:"OTHER-ROW"}]});
    expect(()=>stampClientsSalesWork({...f,at:"2024-08-01T10:03:00Z"})).toThrow("PROOF_IMPORT_UNKNOWN");
    f.draft.estimates[0].evidenceRefs=[f.windowRef]; const work=stampClientsSalesWork({...f,at:"2024-08-01T10:03:00Z"}),r=evaluateClientsSales(f.scope,f.period,f.imports,f.runId,work);
    expect(r.rows[0].aging.basis).toBe("due");expect(r.rows[0].aging.days).toBe(-15);expect(r.rows[0].overdueDays).toBe(0);
  });
  it("confirmations conservent leur auteur/date/version quand inchangées et versionnent les modifications", async () => {
    const f=await clientsSalesFixture(); f.draft.confirmations.push({id:"CONF1",invoiceIds:["I1"],request:null,response:null,reconciliation:{status:"not_tested",note:"À effectuer",evidenceRefs:[]},alternative:null});
    const first=stampClientsSalesWork({...f,at:"2024-08-01T10:03:00Z"});
    const same=stampClientsSalesWork({...f,at:"2024-08-01T11:00:00Z",previous:first});expect(same.confirmations[0]).toEqual(first.confirmations[0]);
    f.draft.confirmations[0].reconciliation.note="Demande à préparer";const changed=stampClientsSalesWork({...f,at:"2024-08-01T12:00:00Z",previous:same});expect(changed.confirmations[0].version).toBe(2);expect(first.confirmations[0].version).toBe(1);
    expect(clientsSalesDraftFromWork(changed).confirmations[0]).not.toHaveProperty("version");
  });
  it("frontière de résultat refuse contrôle dupliqué, faux dénominateur et preuve transversale",async()=>{
    const f=await clientsSalesFixture(),r=evaluateClientsSales(f.scope,f.period,f.imports,f.runId,f.work);
    expect(clientsSalesResultSchema.safeParse({...r,controls:[r.controls[0],r.controls[0],r.controls[2]]}).success).toBe(false);
    expect(clientsSalesResultSchema.safeParse({...r,controls:r.controls.map(c=>({...c,numerator:2}))}).success).toBe(false);
    expect(clientsSalesResultSchema.safeParse({...r,rows:r.rows.map(i=>({...i,evidence:i.evidence.map(e=>({...e,scope:{...e.scope,organizationId:"OTHER"}}))}))}).success).toBe(false);
  });

  it("registre réel fermé exécute les seules règles Clients sales sur factures figées", async()=>{
    const f=await clientsSalesFixture(),population=freezePopulation(f.scope,f.imports,"invoice",f.actor),selection=selectPopulation(population,{method:"targeted",criteria:"Factures ouvertes",exclusions:[],requestedSize:population.items.length,selectedIds:population.items.map(i=>i.id)},f.actor);
    const request={scope:f.scope,period:f.period,imports:f.imports,population,selection,rule:CLIENT_SALES_RULE,parameters:{work:f.work,runId:f.runId}},registry=new ClientsSalesRegistry();
    const result=registry.execute(request); expect(result.execution).toBe("completed"); expect(result.calculationKey).toBe("clients.sales"); expect(result.inputHash).toHaveLength(64);
    const other=registry.execute({...request,rule:{id:"synthetic.sum",version:"1.0.0"}}); expect(other.execution).toBe("blocked");expect(other.blockedControls).toContain("rule_version_unavailable");
  });
  it("appariement proposé excessif reste diagnostiqué sans effet sur la facture",async()=>{
    const f=await clientsSalesFixture();f.draft.allocations[0].status="proposed";f.draft.allocations[0].amount=m(30100n);
    const r=evaluateClientsSales(f.scope,f.period,f.imports,f.runId,stampClientsSalesWork({...f,at:"2024-08-01T10:03:00Z"}));expect(r.rows[0].dueAtReview.amount).toBe("1000.00");expect(r.exceptions.some(e=>e.code==="ALLOCATION_PROPOSAL_OVERALLOCATED")).toBe(true);
  });

});
