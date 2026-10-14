import type { KnownAmount } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type EvidenceLink, type WorkpaperScope } from "../model";
import { analyzeCutoff, type CutoffInput } from "../cutoff";
import type { CutoffEventFacts, EventMapInput, EventMapRun, OpenInvoiceFacts, SettlementFacts } from "../transversal-events";

/**
 * C11 — dossier de recette « Clients, achats, cut-off et TVA » (docs/recette/c11/RECETTE.md), partagé par la recette
 * Vitest et la vérification d'écran Playwright. Les résultats de cut-off sont produits par le vrai moteur, en contexte
 * réel Achats ; les attendus restent dans la recette.
 */
export const period: AccountingPeriod = { startDate: "2025-04-01", closingDate: "2026-03-31", asOfDate: "2026-05-15", currency: "EUR", validation: "confirmed" };
export const scope: WorkpaperScope = { organizationId: "org-c11", dossierId: "dossier-c11", periodId: periodId(period), mode: "real" };
export const k = (amount: string): KnownAmount => ({ kind: "known", value: { amount, currency: "EUR" } });
export const m = (amount: string) => ({ amount, currency: "EUR" as const });
const proof = (id: string, purpose = "Ligne importée"): EvidenceLink => ({ id: "proof-" + id, scope, procedureId: "RUN", documentVersionId: "DOC-" + id.split(":")[0], rowId: id, locator: { row: 2 }, precision: "row", status: "verified", purpose });
export const run = (procedureId: string, runId: string, stale = false): EventMapRun => ({ procedureId, runId, rootId: runId, version: 1, revision: 1, state: "executed", stale, staleReasons: stale ? ["Une source approuvée a été remplacée."] : [], href: "/payables?id=" + runId });
export const PURCHASES = run("payables.purchases", "RUN-ACH"), RPNE = run("payables.rpne", "RUN-RPNE"), CLIENTS = run("clients.sales", "RUN-CLI");

export interface EventSpec { key: string; flow: "sale" | "purchase"; party: string; invoice: string; invoiceDate: string; available: "yes" | "no" | "unknown"; perf: string | null; net: string; tax: string; gross: string; booked: string; bookingDate?: string; kind?: "invoice" | "credit_note"; category: "goods" | "services" | null; debitOption: "yes" | "no" | null }
export function input(e: EventSpec, procedure: "payables.purchases" | "payables.rpne" = "payables.purchases"): CutoffInput {
  const ev = [proof(`INV:${e.invoice}`)];
  return { context: { scope, period, purpose: "real", procedure }, economicEventKey: `${e.flow}:${e.party}:${e.key}`, flow: e.flow, documentKind: e.kind ?? "invoice", ...(e.kind === "credit_note" ? { originalEventKey: `${e.flow}:${e.party}:${e.key}-ORIG` } : {}),
    invoice: { id: e.invoice, date: e.invoiceDate, availableAtClosing: e.available, evidence: ev },
    performance: e.perf ? { date: e.perf, kind: "point", verified: true, evidence: [proof(`PERF:${e.invoice}`)] } : null,
    basis: { net: k(e.net), tax: k(e.tax), gross: k(e.gross), evidence: ev },
    recognition: { searched: true, alreadyRecognizedAmount: k(e.booked), bookingDate: e.bookingDate, evidence: [proof(`BOOK:${e.invoice}`)], existingAdjustments: [] } };
}
export function facts(e: EventSpec, r: EventMapRun, row: CutoffEventFacts["procedureRow"] = null): CutoffEventFacts {
  const i = input(e, r.procedureId === "payables.rpne" ? "payables.rpne" : "payables.purchases"), cutoff = analyzeCutoff(i);
  return { run: r, economicEventId: cutoff.economicEventId, eventKey: i.economicEventKey, flow: e.flow, party: e.party, invoiceId: e.invoice, documentKind: e.kind ?? "invoice",
    dates: { invoice: e.invoiceDate, performance: e.perf ? { kind: "point", date: e.perf } : null, booking: e.bookingDate ?? null, availableAtClosing: e.available },
    amounts: { net: k(e.net), tax: k(e.tax), gross: k(e.gross) }, qualification: { category: e.category, debitOption: e.debitOption, contractDate: null }, cutoff, procedureRow: row,
    sources: [{ documentVersionId: "DOC-INV", rowId: e.invoice, documentType: e.flow === "sale" ? "cutoff_sales" : "payables_invoices", role: "invoice", procedureId: r.procedureId, runId: r.runId },
      ...(e.perf ? [{ documentVersionId: "DOC-PERF", rowId: "PERF-" + e.invoice, documentType: "payables_performance", role: "performance", procedureId: r.procedureId, runId: r.runId }] : [])] };
}
const pay = (r: EventMapRun, id: string, flow: "sale" | "purchase", party: string, date: string, amount: string, allocations: [string, string][], kind: SettlementFacts["kind"] = "payment"): SettlementFacts =>
  ({ run: r, id, flow, party, kind, date, amountTtc: m(amount), cancelledOn: null, allocations: allocations.map(([invoiceId, a]) => ({ invoiceId, amount: m(a), status: "validated" as const })), sources: [{ documentVersionId: "DOC-PAY", rowId: id, documentType: flow === "sale" ? "clients_payments" : "payables_payments", role: "payment", procedureId: r.procedureId, runId: r.runId }] });
const open = (invoiceId: string, party: string, issuedOn: string, dueAtClosing: string, dueAtReview: string): OpenInvoiceFacts =>
  ({ run: CLIENTS, invoiceId, party, issuedOn, dueOn: null, dueAtClosing: m(dueAtClosing), dueAtReview: m(dueAtReview), sources: [{ documentVersionId: "DOC-CLI", rowId: invoiceId, documentType: "clients_invoices", role: "open_invoice", procedureId: "clients.sales", runId: "RUN-CLI" }] });

export const SPEC = {
  c1: { key: "LIV", flow: "sale", party: "C1", invoice: "F-101", invoiceDate: "2026-04-02", available: "no", perf: "2026-03-25", net: "1000.00", tax: "200.00", gross: "1200.00", booked: "0.00", category: "goods", debitOption: null },
  c2: { key: "PRE", flow: "sale", party: "C2", invoice: "F-102", invoiceDate: "2026-03-20", available: "yes", perf: "2026-04-10", net: "2000.00", tax: "400.00", gross: "2400.00", booked: "2000.00", bookingDate: "2026-03-20", category: "services", debitOption: "no" },
  c3a: { key: "SRV", flow: "sale", party: "C3", invoice: "F-103", invoiceDate: "2026-03-15", available: "yes", perf: "2026-03-15", net: "3000.00", tax: "600.00", gross: "3600.00", booked: "3000.00", bookingDate: "2026-03-15", category: "services", debitOption: "no" },
  c3b: { key: "DEB", flow: "sale", party: "C4", invoice: "F-104", invoiceDate: "2026-03-15", available: "yes", perf: "2026-03-15", net: "3000.00", tax: "600.00", gross: "3600.00", booked: "3000.00", bookingDate: "2026-03-15", category: "services", debitOption: "yes" },
  c4: { key: "ACP", flow: "sale", party: "C5", invoice: "F-105", invoiceDate: "2026-04-12", available: "no", perf: "2026-04-12", net: "5000.00", tax: "1000.00", gross: "6000.00", booked: "0.00", category: "goods", debitOption: null },
  c5a: { key: "RET", flow: "sale", party: "C6", invoice: "AV-106", invoiceDate: "2026-04-08", available: "no", perf: "2026-03-28", net: "-500.00", tax: "-100.00", gross: "-600.00", booked: "0.00", kind: "credit_note", category: "goods", debitOption: null },
  c6: { key: "HP", flow: "purchase", party: "S1", invoice: "FS-201", invoiceDate: "2026-04-06", available: "no", perf: "2026-04-05", net: "800.00", tax: "160.00", gross: "960.00", booked: "0.00", category: "services", debitOption: "no" },
  c7a: { key: "PART", flow: "purchase", party: "S2", invoice: "FS-202", invoiceDate: "2026-04-03", available: "no", perf: "2026-03-20", net: "1000.00", tax: "200.00", gross: "1200.00", booked: "0.00", category: "goods", debitOption: null },
  c8: { key: "INC", flow: "purchase", party: "S3", invoice: "FS-203", invoiceDate: "2026-04-10", available: "no", perf: "2026-03-30", net: "400.00", tax: "80.00", gross: "480.00", booked: "0.00", category: "services", debitOption: "no" },
} satisfies Record<string, EventSpec>;

export function recette(): EventMapInput {
  return {
    scope, period, framework: { anticipated: [], basis: "aucune option d’anticipation déclarée" },
    cutoffEvents: [
      facts(SPEC.c1, PURCHASES), facts(SPEC.c1, RPNE),
      facts(SPEC.c2, PURCHASES), facts(SPEC.c2, RPNE),
      facts(SPEC.c3a, PURCHASES), facts(SPEC.c3b, PURCHASES), facts(SPEC.c4, PURCHASES), facts(SPEC.c5a, PURCHASES),
      facts(SPEC.c6, PURCHASES), facts(SPEC.c6, RPNE, { status: "outside_period_justified", reasons: [] }),
      facts(SPEC.c7a, PURCHASES), facts(SPEC.c7a, RPNE, { status: "omission_candidate", reasons: [] }),
      facts(SPEC.c8, PURCHASES), facts(SPEC.c8, RPNE, { status: "inconclusive", reasons: ["FENETRE_NON_COUVERTE"] }),
    ],
    settlements: [
      pay(CLIENTS, "E-102", "sale", "C2", "2026-04-25", "2400.00", [["F-102", "2400.00"]]),
      pay(CLIENTS, "E-103", "sale", "C3", "2026-04-20", "3600.00", [["F-103", "3600.00"]]),
      pay(CLIENTS, "E-104", "sale", "C4", "2026-04-20", "3600.00", [["F-104", "3600.00"]]),
      // Recette seulement : la chaîne réelle n'a pas de source d'acomptes encaissés avant la clôture (limite documentée).
      pay(run("fixture.acomptes", "RUN-ACOMPTES"), "AC-105", "sale", "C5", "2026-03-28", "1200.00", [["F-105", "1200.00"]], "advance"),
      pay(run("fixture.acomptes", "RUN-ACOMPTES"), "E-105", "sale", "C5", "2026-04-30", "4800.00", [["F-105", "4800.00"]]),
      pay(CLIENTS, "E-108", "sale", "C8", "2026-04-20", "300.00", [["F-108", "300.00"]]),
      pay(RPNE, "P-201", "purchase", "S1", "2026-04-30", "960.00", [["FS-201", "960.00"]]),
      pay(RPNE, "P-202", "purchase", "S2", "2026-04-25", "1800.00", [["FS-202", "1200.00"]], "grouped"),
      pay(RPNE, "P-203", "purchase", "S3", "2026-05-10", "200.00", [["FS-203", "200.00"]]),
    ],
    credits: [{ run: CLIENTS, id: "AV-107", invoiceId: "F-107", party: "C7", issuedOn: "2026-04-15", amountTtc: m("300.00"), status: "applied", sources: [{ documentVersionId: "DOC-CRED", rowId: "AV-107", documentType: "clients_credits", role: "credit", procedureId: "clients.sales", runId: "RUN-CLI" }] }],
    openInvoices: [open("F-102", "C2", "2026-03-20", "2400.00", "0.00"), open("F-103", "C3", "2026-03-15", "3600.00", "0.00"), open("F-104", "C4", "2026-03-15", "3600.00", "0.00"), open("F-107", "C7", "2026-03-10", "1800.00", "1500.00"), open("F-108", "C8", "2026-03-05", "1000.00", "700.00")],
    vatEntries: [
      ...[["F-101", "2026-04-02", "collected", "APR"], ["F-102", "2026-03-20", "collected", "MAR"], ["F-103", "2026-03-15", "collected", "MAR"], ["F-104", "2026-03-15", "collected", "MAR"], ["F-105", "2026-04-12", "collected", "APR"], ["FS-201", "2026-04-06", "deductible", "APR"]]
        .map(([ref, date, direction, p]) => ({ run: run("tva.reconciliation", "RUN-TVA-" + p), period: p === "MAR" ? { startDate: "2026-03-01", endDate: "2026-03-31" } : { startDate: "2026-04-01", endDate: "2026-04-30" }, frequency: "monthly", entryId: "E:" + ref, direction: direction as "collected" | "deductible", pieceRef: ref, date, baseCents: null, vatCents: null, sources: [] })),
    ],
    vatSheets: [{ runId: "RUN-TVA-MAR", period: { startDate: "2026-03-01", endDate: "2026-03-31" }, frequency: "monthly", stale: false }, { runId: "RUN-TVA-APR", period: { startDate: "2026-04-01", endDate: "2026-04-30" }, frequency: "monthly", stale: false }],
    windows: [{ procedureId: "payables.rpne", runId: "RUN-RPNE", flow: "purchase", startDate: "2026-04-01", endDate: "2026-04-30", coverage: "incomplete" }],
    vatChain: "read",
  };
}
