import { money } from "@/lib/canonical-model/money";
import { previewImport } from "../imports";
import { contentHash, type WorkpaperRun } from "../model";
import { freezePopulation, selectPopulation } from "../selection";
import { CLIENT_SALES_RULE, CLIENT_SALES_TEMPLATE, ClientsSalesRegistry } from "../clients-sales-adapter";
import { stampClientsSalesWork, type ClientsSalesDraft, type ClientsSalesSourceType } from "../clients-sales";
import { salesMapping } from "./clients-sales-fixture";
import { clientMissionFixture } from "./client-mission-fixture";

export async function clientSalesMissionFixture(options: { creditCustomer?: string } = {}) {
  const frame = await clientMissionFixture(), { scope } = frame, period = frame.locked.period;
  const actor = { id: "actual-preparer", grants: [{ scope, permissions: ["read", "prepare", "download"] as ("read" | "prepare" | "download")[] }] };
  const rows: { type: ClientsSalesSourceType; row: string }[] = [
    { type: "clients_invoices", row: "I1;1000.00;2024-01-10;C1;EUR;;;0.00;;" },
    { type: "clients_payments", row: "P1;300.00;2025-01-05;C1;EUR;;;;payment;" },
    { type: "clients_support", row: "WINDOW;0.00;2025-02-01;C1;EUR;;;;;" },
  ];
  if (options.creditCustomer) rows.push({ type: "clients_credits", row: "CR1;100.00;2025-01-25;" + options.creditCustomer + ";EUR;;;;;I1" });
  const salesImports = await Promise.all(rows.map(async entry => {
    const file = new File(["Id;Amount;Date;Customer;Currency;Due;Cancelled;Booked;Kind;Invoice\n" + entry.row], entry.type + ".csv", { type: "text/csv" });
    const b = await previewImport(file, scope, salesMapping(entry.type), actor, entry.type, "clients.sales");
    return { ...b, approval: { actorId: actor.id, at: "2025-02-03T09:00:00Z", previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } };
  }));
  const ref = (index: number) => ({ importId: salesImports[index].id, rowId: salesImports[index].rows[0].id });
  const framing = { runId: frame.locked.id, rootId: frame.locked.rootId, version: frame.locked.version, contentHash: contentHash(frame.locked) };
  const draft: ClientsSalesDraft = {
    window: { startDate: "2025-01-01", endDate: period.asOfDate, coverage: "documented", note: "Fenêtre d’encaissements revue sur le registre fourni.", evidenceRefs: [ref(2)] },
    creditsAbsence: options.creditCustomer ? null : { note: "Aucun avoir déclaré sur cette fenêtre.", evidenceRefs: [ref(2)] },
    allocations: [{ id: "A1", paymentId: "P1", invoiceId: "I1", amount: money(30000n), status: "validated", evidenceRefs: [ref(1)] }],
    estimates: [{ id: "E1", invoiceId: "I1", method: null, base: money(100000n), amount: money(70000n), rationale: "Montant proposé ; méthode manquante, aucun jugement de perte automatique.", dispute: "Pièce de litige attendue", evidenceRefs: [ref(2)] }],
    confirmations: [{ id: "C1-confirm", invoiceIds: ["I1"], request: { date: "2025-01-10", channel: "registre importé", evidenceRefs: [ref(2)] }, response: { date: "2025-01-20", confirmedAt: period.closingDate, origin: "direct_documented", channel: "registre importé", evidenceRefs: [ref(2)], originEvidenceRefs: [ref(2)] }, reconciliation: { status: "differences", note: "Différence à expliquer ; réponse originale attendue.", evidenceRefs: [ref(2)] }, alternative: null }],
  };
  const id = "clients-sales-pilot";
  const clientsWork = stampClientsSalesWork({ scope, period, runId: id, imports: salesImports, draft, framing, actor, at: "2025-02-03T10:00:00Z" });
  const population = freezePopulation(scope, salesImports, "invoice", actor), selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les factures ouvertes à clôture", requestedSize: population.items.length, selectedIds: population.items.map(i => i.id), exclusions: [] }, actor);
  const result = new ClientsSalesRegistry().execute({ scope, period, rule: CLIENT_SALES_RULE, imports: salesImports, population, selection, parameters: { work: clientsWork, runId: id } });
  const data = result.result as ReturnType<typeof import("../clients-sales").evaluateClientsSales>;
  const evidence = [...data.window.evidence, ...(data.creditsAbsence?.evidence ?? []), ...[...data.rows, ...data.credits, ...data.payments, ...data.allocations, ...data.estimates, ...data.confirmations].flatMap(r => r.evidence)].filter((p, index, all) => all.findIndex(other => other.id === p.id) === index);
  const run: WorkpaperRun = { id, rootId: id, revision: 1, version: 10, schemaVersion: "1.0.0", scope, period, template: CLIENT_SALES_TEMPLATE, state: "awaiting_review", preparedBy: actor.id, importIds: salesImports.map(i => i.id), clientsWork, population, selection, result, evidence, findings: [], notes: [], conclusion: "Clôture 1 000 EUR, encaissement affecté 300 EUR, reste 700 EUR. Estimation et origine de confirmation à étayer.", events: [{ id: id + ":10", action: "awaiting_review", actorId: actor.id, at: "2025-02-03T11:00:00Z", version: 10 }] };
  run.submittedHash = contentHash(run);
  const approved: WorkpaperRun = { ...run, version: 11, state: "approved", approval: { actorId: "actual-reviewer", at: "2025-02-04T09:00:00Z", version: 10, snapshotHash: contentHash(run), note: "Travaux revus ; exceptions et incertitudes maintenues." }, events: [...run.events, { id: id + ":11", action: "approved", actorId: "actual-reviewer", at: "2025-02-04T09:00:00Z", version: 11 }] };
  const locked: WorkpaperRun = { ...approved, version: 12, state: "locked", events: [...approved.events, { id: id + ":12", action: "lock", actorId: "actual-reviewer", at: "2025-02-04T09:00:00Z", version: 12 }] };
  const imports = [...frame.imports, ...salesImports], heads = imports.map(b => ({ document_type: b.document.documentType, import_id: b.id }));
  return { frame, scope, period, actor, draft, salesImports, imports, heads, run, approved, locked, data, versions: [frame.run, frame.approved, frame.locked, run, approved, locked] };
}
