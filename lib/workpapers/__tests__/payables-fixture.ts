import { evaluatePayables } from "../payables-investigation";
import { payableTemplate } from "../payables-adapter";
import { previewImport, type ImportBatch } from "../imports";
import { period } from "./clients-framing-fixtures";
import { periodId, type WorkpaperScope } from "../model";
import { freezePopulation, selectPopulation } from "../selection";
import { payablesMappingSchema, stampPayablesWork, type PayableProcedure, type PayablesDraft } from "../payables-investigation";
export { period };
export const scope: WorkpaperScope = { organizationId: "org-A", dossierId: "dossier-A", periodId: periodId(period), mode: "real" };
export const actor = { id: "real-preparer", grants: [{ scope, permissions: ["prepare", "read", "download"] as ("prepare" | "read" | "download")[] }] };
export const mapping = payablesMappingSchema.parse({ version: "payables-investigation-1", headerRow: 1, columns: { key: "id", amount: "amount", date: "date" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR", payables: { partyColumn: "party", currencyColumn: "currency", accountColumn: "account", eventColumn: "event", invoiceColumn: "invoice", flowColumn: "flow", kindColumn: "kind", taxColumn: "tax", grossColumn: "gross", availabilityColumn: "available" } });
const header = "id;amount;date;party;account;event;invoice;tax;gross;available;flow;kind;currency\n";
const row = (id: string, amount: string, date: string, event = id, invoice = "I-" + event, account = "601000", kind = "", party = "S", flow = "purchase", tax = "", gross = "", available = "") => [id, amount, date, party, account, event, invoice, tax, gross, available, flow, kind, "EUR"].join(";");
export function csv(type: string, changed = false) {
    const close = period.closingDate;
    const events = ["U", "F", "G", "N", "D", "B", "O"];
    switch (type) {
        case "payables_invoices": return header + events.map(e => row("I-" + e, "1000.00", "2025-01-12", e, "I-" + e, "601000", "", "S", "purchase", "200.00", "1200.00", "no")).join("\n");
        case "cutoff_sales": return header + row("SALE", "1000.00", "2025-01-12", "SALE", "SALE", "701000", "", "C", "sale", "200.00", "1200.00", "no");
        case "payables_performance": return header + [...events.filter(e => e !== "N").map(e => row("PERF-" + e, "0.00", e === "O" ? "2025-01-15" : "2024-12-20", e, "I-" + e, "601000", "point")), row("PERF-SALE", "0.00", "2024-12-20", "SALE", "SALE", "701000", "point", "C", "sale")].join("\n");
        case "payables_recognition": return header + [...events.map(e => row("BOOK-" + e, e === "D" ? "400.00" : e === "B" ? "1000.00" : "0.00", close, e)), row("BOOK-SALE", "0.00", close, "SALE", "SALE", "701000", "", "C", "sale")].join("\n");
        case "payables_adjustments": return header + [...events.map(e => row("ADJ-" + e, e === "F" ? "1000.00" : "0.00", close, e, "I-" + e, "408100", e === "F" ? "FNP" : "none")), row("ADJ-SALE", "0.00", close, "SALE", "SALE", "418100", "none", "C", "sale")].join("\n");
        case "payables_payments": return header + events.map(e => row("P-" + e, e === "G" ? "1800.00" : changed && e === "U" ? "1201.00" : "1200.00", "2025-01-20", e, "I-" + e, "512000", "payment")).join("\n");
        case "purchases_ledger": return header + row("GL-D", "400.00", close, "D");
        case "payables_support": return header + row("METHOD-WINDOW", "0.00", period.asOfDate, "METHOD", "", "000000", "method", "ORG");
        default: return header + row(type, "-1000.00", close, "FRAME", "", "401000", "balance");
    }
}
export async function fixture(procedure: PayableProcedure = "payables.rpne") {
    const types = procedure === "payables.frame" ? ["payables_general", "payables_auxiliary", "payables_aged"] : ["payables_invoices", "payables_performance", "payables_recognition", "payables_adjustments", "payables_payments", "purchases_ledger", "payables_support", "cutoff_sales"];
    const imports: ImportBatch[] = [];
    for (const type of types) {
        const file = new File([csv(type)], type + ".csv", { type: "text/csv" });
        const batch = await previewImport(file, scope, mapping, actor, type, procedure);
        imports.push({ ...batch, approval: { actorId: actor.id, at: "2025-02-01T10:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
    }
    const draft = draftFor(imports);
    const unit = procedure === "payables.rpne" ? "subsequent_payment" : procedure === "payables.purchases" ? "purchase_entry" : "row";
    const population = freezePopulation(scope, imports, unit, actor), selection = selectPopulation(population, { method: "targeted", criteria: "Population de recette explicitement choisie", requestedSize: population.items.length, selectedIds: population.items.map(i => i.id), exclusions: [] }, actor);
    const work = stampPayablesWork(draft, imports, scope, period, "RUN", actor.id, "2025-02-01T10:00:00.000Z");
    return { scope, period, imports, population, selection, work, draft, procedure };
}
export function draftFor(imports: ImportBatch[]): PayablesDraft {
    const proof = imports.find(b => b.document.documentType === "payables_support")?.rows[0].id ?? imports[0].rows[0].id;
    const ledger = imports.find(b => b.document.documentType === "purchases_ledger");
    return { accounts: ["401000", "408100", "486000", "601000", "512000"], method: { id: "M-08", version: "1", source: "Méthode locale documentée dans la pièce METHOD-WINDOW", proofRowIds: [proof], note: "Recherche de comptabilisation/FNP par événement et contrôle de la prestation. Pas d’exhaustivité déduite des paiements." }, window: { startDate: "2025-01-01", endDate: period.asOfDate, coverage: "documented", proofRowIds: [proof], note: "Relevés et recherche documentés jusqu’à la revue ; périmètre limité aux paiements importés." }, purchases: ledger ? [{ ledgerRowId: ledger.rows[0].id, invoiceId: "I-D", allocated: { amount: "400.00", currency: "EUR" }, proofRowIds: [proof] }] : [], allocations: imports.find(b => b.document.documentType === "payables_payments")?.rows.map(r => ({ id: r.normalized!.key, paymentId: r.normalized!.key, invoiceId: r.original.invoice, amount: { amount: "1200.00", currency: "EUR" as const }, status: "validated" as const, proofRowIds: [proof] })) ?? [] };
}
export function presentationRun(f: Awaited<ReturnType<typeof fixture>>, id = "RUN"): import("../model").WorkpaperRun { const result = evaluatePayables(f.scope, f.period, f.imports, id, f.procedure, f.population, f.selection, f.work); return { id, rootId: id, revision: 1, version: 1, schemaVersion: "1.0.0", scope: f.scope, period: f.period, template: payableTemplate(f.procedure), state: "executed", preparedBy: actor.id, payablesWork: f.work, importIds: f.imports.map(b => b.id), population: f.population, selection: f.selection, evidence: result.rows.flatMap(r => r.evidence), findings: [], notes: [], events: [], result: { id: "RESULT-" + id, calculationKey: f.procedure, ruleVersion: "1.0.0", inputHash: "hash", scope: f.scope, period: f.period, execution: "completed", outcome: "exceptions_detected", sourceRefs: [], input: {}, result, findings: [], warnings: [], blockedControls: [] } }; }
