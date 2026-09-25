import { cents, money, type Money, type KnownAmount } from "@/lib/canonical-model/money";
import type { DocumentLigne } from "./types";
import { isCivilDate } from "@/lib/canonical-model/period";

export interface ReceivableInvoice {
  id: string;
  amount: Money;
  issuedOn: string;
  dueOn: string;
  letteringStatus: "matched" | "unmatched" | "unknown";
  bookedImpairment: KnownAmount;
  documentedEstimate?: { amount: Money; evidenceRef: string };
}
export interface ReceivablePayment { id: string; amount: Money; paidOn: string }
export interface ReceivableAllocation { paymentId: string; invoiceId: string; amount: Money }
export interface ReceivableCredit { id: string; invoiceId: string; amount: Money; issuedOn: string }

export function legacyReceivableFacts(row: DocumentLigne) {
  return {
    legacyLettre: row.lettre,
    letteringStatus: row.letteringStatus ?? "unknown",
    bookedImpairment: row.bookedImpairment ?? { kind: "unknown", reason: "Le champ historique lettre ne prouve aucune dépréciation." } as KnownAmount,
    documentedEstimate: row.documentedEstimate,
  };
}

function civilDate(value: string) {
  if (!isCivilDate(value)) throw new Error("INVALID_RECEIVABLE_DATE");
  return value;
}
const nonnegative = (value: Money) => {
  const n = cents(value);
  if (n < 0n) throw new Error("NEGATIVE_RECEIVABLE_AMOUNT");
  return n;
};

/** Complete, explicitly supplied population only. No automatic impairment rule. */
export function calculateReceivables(input: {
  invoices: ReceivableInvoice[];
  payments: ReceivablePayment[];
  allocations: ReceivableAllocation[];
  credits: ReceivableCredit[];
  closingDate: string;
  asOfDate: string;
}) {
  const close = civilDate(input.closingDate), review = civilDate(input.asOfDate);
  if (review < close) throw new Error("REVIEW_BEFORE_CLOSING");
  const invoices = new Map(input.invoices.map((i) => [i.id, i]));
  const payments = new Map(input.payments.map((p) => [p.id, p]));
  if (invoices.size !== input.invoices.length || payments.size !== input.payments.length || new Set(input.credits.map((c) => c.id)).size !== input.credits.length) throw new Error("DUPLICATE_RECEIVABLE_ID");
  for (const invoice of input.invoices) {
    if (!invoice.id.trim() || !["matched", "unmatched", "unknown"].includes(invoice.letteringStatus)) throw new Error("INVALID_RECEIVABLE_STATUS");
    if (!["known", "unknown", "not_applicable"].includes(invoice.bookedImpairment.kind)) throw new Error("INVALID_IMPAIRMENT_STATUS");
    if (invoice.bookedImpairment.kind !== "known" && !invoice.bookedImpairment.reason.trim()) throw new Error("IMPAIRMENT_REASON_REQUIRED");
    nonnegative(invoice.amount); civilDate(invoice.issuedOn); civilDate(invoice.dueOn);
    if (invoice.issuedOn > close) throw new Error("INVOICE_OUTSIDE_CLOSING_POPULATION");
    if (invoice.bookedImpairment.kind === "known") nonnegative(invoice.bookedImpairment.value);
    if (invoice.documentedEstimate) {
      nonnegative(invoice.documentedEstimate.amount);
      if (!invoice.documentedEstimate.evidenceRef.trim()) throw new Error("ESTIMATE_EVIDENCE_REQUIRED");
    }
  }
  for (const p of input.payments) { nonnegative(p.amount); civilDate(p.paidOn); }
  const used = new Map<string, bigint>();
  for (const allocation of input.allocations) {
    const payment = payments.get(allocation.paymentId);
    if (!payment || !invoices.has(allocation.invoiceId)) throw new Error("UNKNOWN_ALLOCATION_REFERENCE");
    const sum = (used.get(payment.id) ?? 0n) + nonnegative(allocation.amount);
    if (sum > cents(payment.amount)) throw new Error("PAYMENT_OVERALLOCATED");
    used.set(payment.id, sum);
  }
  for (const c of input.credits) {
    nonnegative(c.amount); civilDate(c.issuedOn);
    if (!invoices.has(c.invoiceId)) throw new Error("UNKNOWN_CREDIT_INVOICE");
  }
  return input.invoices.map((invoice) => {
    let before = 0n, after = 0n, credits = 0n;
    const allAllocated = input.allocations.filter((a) => a.invoiceId === invoice.id).reduce((sum, a) => sum + cents(a.amount), 0n);
    const allCredits = input.credits.filter((c) => c.invoiceId === invoice.id).reduce((sum, c) => sum + cents(c.amount), 0n);
    if (allAllocated + allCredits > cents(invoice.amount)) throw new Error("INVOICE_OVERALLOCATED");
    for (const a of input.allocations.filter((a) => a.invoiceId === invoice.id)) {
      const date = payments.get(a.paymentId)!.paidOn;
      if (date <= close) before += cents(a.amount);
      else if (date <= review) after += cents(a.amount);
    }
    for (const c of input.credits.filter((c) => c.invoiceId === invoice.id && c.issuedOn <= close)) credits += cents(c.amount);
    if (before + credits + after > cents(invoice.amount)) throw new Error("INVOICE_OVERALLOCATED");
    return {
      invoiceId: invoice.id, invoice: invoice.amount, creditsAtClosing: money(credits), paymentsAtClosing: money(before),
      dueAtClosing: money(cents(invoice.amount) - credits - before), subsequentPayments: money(after),
      closingDate: close, asOfDate: review, dueOn: invoice.dueOn,
      letteringStatus: invoice.letteringStatus, bookedImpairment: invoice.bookedImpairment,
      documentedEstimate: invoice.documentedEstimate,
      paymentAllocations: input.allocations.filter((a) => a.invoiceId === invoice.id).map((a) => ({ ...a, paidOn: payments.get(a.paymentId)!.paidOn })),
      creditNotes: input.credits.filter((c) => c.invoiceId === invoice.id),
    };
  });
}
