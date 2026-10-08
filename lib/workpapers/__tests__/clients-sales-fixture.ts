import { money } from "@/lib/canonical-model/money";
import { periodId, frozen } from "../model";
import { previewImport, type ImportBatch } from "../imports";
import { stampClientsSalesWork, type ClientsSalesDraft, type ClientsSalesMapping, type ClientsSalesSourceType } from "../clients-sales";
export const salesPeriod = { startDate: "2024-01-01", closingDate: "2024-06-30", asOfDate: "2024-07-31", currency: "EUR" as const, validation: "provisional" as const };
export const salesScope = { organizationId: "ORG-CLIENTS", dossierId: "DOSSIER-CLIENTS", periodId: periodId(salesPeriod), mode: "real" as const };
export const salesActor = { id: "actual-preparer", grants: [{ scope: salesScope, permissions: ["read", "prepare", "download"] as ("read" | "prepare" | "download")[] }] };
export const salesFraming = { runId: "frame-locked", rootId: "frame-locked", version: 12, contentHash: "a".repeat(64) };
export const salesRunId = "clients-sales-run";
export function salesMapping(type: ClientsSalesSourceType): ClientsSalesMapping {
  const bases = { clients_invoices: "open_at_closing", clients_payments: "subsequent_payment", clients_credits: "subsequent_credit", clients_support: "support" } as const;
  return { version: "clients-sales-1", headerRow: 1, columns: { key: "Id", amount: "Amount", date: "Date" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR", sales: { basis: bases[type], customerColumn: "Customer", currencyColumn: "Currency",
    ...(type === "clients_invoices" ? { dueOnColumn: "Due", cancelledOnColumn: "Cancelled", bookedImpairmentColumn: "Booked" } : {}),
    ...(type === "clients_payments" ? { cancelledOnColumn: "Cancelled", kindColumn: "Kind" } : {}), ...(type === "clients_credits" ? { invoiceColumn: "Invoice" } : {}) } };
}
export async function salesBatch(type: ClientsSalesSourceType, rows: string[]): Promise<ImportBatch> {
  const header = "Id;Amount;Date;Customer;Currency;Due;Cancelled;Booked;Kind;Invoice";
  const file = new File([header + "\n" + rows.join("\n")], type + ".csv", { type: "text/csv" });
  const batch = await previewImport(file, salesScope, salesMapping(type), salesActor, type, "clients.sales");
  return frozen({ ...batch, approval: { actorId: salesActor.id, at: "2024-08-01T09:00:00Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
}
export async function clientsSalesFixture() {
  const imports: ImportBatch[] = await Promise.all([
    salesBatch("clients_invoices", ["I1;1000.00;2024-01-10;C1;EUR;;;0.00;;"]),
    salesBatch("clients_payments", ["P1;300.00;2024-07-05;C1;EUR;;;;payment;"]),
    salesBatch("clients_support", ["WINDOW;0.00;2024-07-31;C1;EUR;;;;;"]),
  ]);
  const windowRef = { importId: imports[2].id, rowId: imports[2].rows[0].id }, allocationRef = { importId: imports[1].id, rowId: imports[1].rows[0].id };
  const draft: ClientsSalesDraft = { window: { startDate: "2024-07-01", endDate: "2024-07-31", coverage: "documented", note: "Registre documentant la fenêtre juillet", evidenceRefs: [windowRef] }, creditsAbsence: { note: "Aucun avoir déclaré sur la fenêtre", evidenceRefs: [windowRef] }, allocations: [{ id: "A1", paymentId: "P1", invoiceId: "I1", amount: money(30000n), status: "validated", evidenceRefs: [allocationRef] }], estimates: [], confirmations: [] };
  const work = stampClientsSalesWork({ scope: salesScope, period: salesPeriod, imports, runId: salesRunId, draft, framing: salesFraming, actor: salesActor, at: "2024-08-01T10:00:00Z" });
  return { imports, draft, work, scope: salesScope, period: salesPeriod, actor: salesActor, framing: salesFraming, runId: salesRunId, windowRef, allocationRef };
}
