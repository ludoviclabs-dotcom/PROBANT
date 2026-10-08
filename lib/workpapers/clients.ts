import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { calculateReceivables, type ReceivableInvoice } from "@/lib/rapprochement/receivables";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertClientsSalesContext, assertDate, assertUnique, assertWindow, type PostClosingWindow, type CycleContext } from "./cycle-context";
import { assertScope, frozen, type EvidenceLink } from "./model";
import { compareSupported, compareClientsSalesSupported, clientsMethodEligible, evidence, methodEligible, reconcileClientFrameBalances, unknown, type BalanceLine, type DocumentedMethod, type ClientsDocumentedMethod, type SupportedAmount } from "./cycle-review";
import { analyzeCutoff, type CutoffInput } from "./cutoff";
import { validateConfirmation, type ConfirmationRecord } from "./confirmations";

export interface ClientInvoice extends Omit<ReceivableInvoice, "dueOn" | "documentedEstimate"> { customerId: string; dueOn?: string; evidence: EvidenceLink[] }
export interface ClientInput {
  context: CycleContext; invoices: ClientInvoice[]; window?: PostClosingWindow;
  payments: { id: string; customerId: string; amount: Money; paidOn: string; cancelledOn?: string; evidence: EvidenceLink[] }[];
  allocations: { paymentId: string; invoiceId: string; amount: Money; evidence: EvidenceLink[] }[];
  credits: { id: string; invoiceId: string; customerId?: string; amount: Money; issuedOn: string; evidence: EvidenceLink[] }[];
}
export function clientReceivables(input: ClientInput) {
  assertClientsSalesContext(input.context);
  [...input.invoices, ...input.payments, ...input.allocations, ...input.credits].forEach((r) => { if (!evidence(input.context, r.evidence)) throw new Error("CLIENT_EVIDENCE_REQUIRED"); });
  assertUnique(input.payments.map((p) => p.id));
  for (const p of input.payments) {
    assertDate(p.paidOn);
    if (cents(p.amount) < 0n) throw new Error("NEGATIVE_RECEIVABLE_AMOUNT");
    if (p.cancelledOn) { assertDate(p.cancelledOn); if (p.cancelledOn < p.paidOn) throw new Error("CANCELLATION_BEFORE_PAYMENT"); }
  }
  const used = new Map<string, bigint>();
  for (const a of input.allocations) {
    const p = input.payments.find((r) => r.id === a.paymentId), i = input.invoices.find((r) => r.id === a.invoiceId);
    if (!p || !i || !p.customerId || p.customerId !== i.customerId) throw new Error("CLIENT_ALLOCATION_PARTY_MISMATCH");
    const amount = cents(a.amount), total = (used.get(p.id) ?? 0n) + amount;
    if (amount < 0n || total > cents(p.amount)) throw new Error("PAYMENT_OVERALLOCATED");
    used.set(p.id, total);
  }
  if (input.context.scope.mode === "real") return realClientsReceivables(input);
  const calculateAt = (date: string) => {
    const payments = input.payments.filter((p) => !p.cancelledOn || p.cancelledOn > date);
    return calculateReceivables({ ...input, invoices: input.invoices.map((i) => ({ ...i, dueOn: i.dueOn ?? i.issuedOn })), payments, allocations: input.allocations.filter((a) => payments.some((p) => p.id === a.paymentId)), closingDate: input.context.period.closingDate, asOfDate: date });
  };
  const closing = calculateAt(input.context.period.closingDate), review = calculateAt(input.context.period.asOfDate);
  const rows = review.map((r, index) => {
    const i = input.invoices[index], start = i.dueOn ?? i.issuedOn;
    const subsequentCredits = input.credits.filter((c) => c.invoiceId === i.id && c.issuedOn > input.context.period.closingDate && c.issuedOn <= input.context.period.asOfDate).reduce((s, c) => s + cents(c.amount), 0n);
    return { ...r, dueOn: i.dueOn ?? null, customerId: i.customerId, dueAtClosing: closing[index].dueAtClosing, dueAtReview: money(cents(r.dueAtClosing) - cents(r.subsequentPayments) - subsequentCredits), subsequentCredits: money(subsequentCredits), aging: { asOfDate: input.context.period.asOfDate, from: start, label: i.dueOn ? "jours depuis échéance (signés)" : "jours depuis facture — échéance inconnue", days: (Date.parse(input.context.period.asOfDate) - Date.parse(start)) / 86400000 }, impairmentEstimate: unknown("SOURCE REQUISE : méthode et estimation, aucun calcul sur âge seul") };
  });
  const payments = input.payments.map((p) => ({ ...p, remainder: money(cents(p.amount) - input.allocations.filter((a) => a.paymentId === p.id).reduce((s, a) => s + cents(a.amount), 0n)), status: p.cancelledOn && p.cancelledOn <= input.context.period.asOfDate ? "cancelled" : "documented" }));
  return frozen({ rows, payments, allocations: input.allocations, inputHash: stableSha256(input), mode: "demo", conclusion: null });
}
export function clientImpairment(context: CycleContext, booked: SupportedAmount | null, estimate: SupportedAmount | null, method: DocumentedMethod | ClientsDocumentedMethod | null): KnownAmount {
  assertClientsSalesContext(context);
  if (context.scope.mode === "real") {
    if (!clientsMethodEligible(context, method, context.period.closingDate) || booked?.date !== context.period.closingDate) return unknown("SOURCE REQUISE : méthode, base et clôture comparables");
    return compareClientsSalesSupported(context, estimate, booked);
  }
  if (!method || method.synthetic !== true || !methodEligible(method, context.period.closingDate) || booked?.date !== context.period.closingDate) return unknown("SOURCE REQUISE : méthode, base et clôture comparables");
  return compareSupported(context, estimate, booked);
}
export function frameClients(context: CycleContext, general: BalanceLine[], auxiliary: BalanceLine[], aged: BalanceLine[], adjustments: { kind: "FAE" | "PCA"; booked: BalanceLine[]; detail: BalanceLine[] }[]) {
  if (context.scope.mode === "real" && adjustments.length) throw new Error("CLIENT_ADJUSTMENTS_OUT_OF_SCOPE");
  return { generalToAuxiliary: reconcileClientFrameBalances(context, general, auxiliary, "account"), auxiliaryToAged: reconcileClientFrameBalances(context, auxiliary, aged, "party"), adjustments: adjustments.map((a) => ({ kind: a.kind, comparison: reconcileClientFrameBalances(context, a.booked, a.detail, "account") })), creditBalances: auxiliary.filter((r) => cents(r.value.amount) < 0n).map((r) => ({ ...r, status: "à justifier, pas une erreur automatique" })) };
}
export function clientEvidence(context: CycleContext, confirmations: ConfirmationRecord[], cutoff: CutoffInput[]) {
  assertClientsSalesContext(context);
  if (context.scope.mode === "real" && cutoff.length) throw new Error("CLIENT_SALES_CUTOFF_OUT_OF_SCOPE");
  confirmations.forEach((r) => { assertScope(context.scope, r.scope); if (r.subject !== "customer") throw new Error("CLIENT_SUBJECT_REQUIRED"); validateConfirmation(r); });
  cutoff.forEach((r) => { assertScope(context.scope, r.context.scope); if (r.flow !== "sale" || stableSha256(r.context.period) !== stableSha256(context.period)) throw new Error("CLIENT_CUTOFF_CONTEXT"); });
  return frozen({ confirmations, cutoff: cutoff.map(analyzeCutoff), conclusion: null });
}
/** Imported invoice amount is already the open balance at closing. It is never recomputed from subsequent facts. */
function realClientsReceivables(input: ClientInput) {
  const context = input.context, close = context.period.closingDate, review = context.period.asOfDate;
  if (!input.window) throw new Error("CLIENT_SALES_WINDOW_REQUIRED"); assertWindow(context, input.window);
  assertUnique(input.invoices.map(i => i.id)); assertUnique(input.credits.map(c => c.id));
  input.invoices.forEach(i => { assertDate(i.issuedOn); if (i.dueOn) assertDate(i.dueOn); if (i.issuedOn > close || cents(i.amount) <= 0n || !i.customerId.trim()) throw new Error("CLIENT_SALES_OPEN_INVOICE_REQUIRED"); });
  input.payments.forEach(p => { if (p.paidOn < input.window!.startDate || p.paidOn > input.window!.endDate) throw new Error("CLIENT_SALES_PAYMENT_OUTSIDE_WINDOW"); });
  input.credits.forEach(c => { assertDate(c.issuedOn); const i = input.invoices.find(i => i.id === c.invoiceId);
    if (!i || c.customerId !== i.customerId || c.issuedOn < input.window!.startDate || c.issuedOn > input.window!.endDate || cents(c.amount) < 0n) throw new Error("CLIENT_SALES_CREDIT_INVALID"); });
  const rows = input.invoices.map(i => {
    const allocations = input.allocations.filter(a => a.invoiceId === i.id), credits = input.credits.filter(c => c.invoiceId === i.id);
    const events = [...allocations.flatMap(a => { const p = input.payments.find(p => p.id === a.paymentId)!;
      return [{ date: p.paidOn, amount: cents(a.amount) }, ...(p.cancelledOn && p.cancelledOn <= review ? [{ date: p.cancelledOn, amount: -cents(a.amount) }] : [])]; }), ...credits.map(c => ({ date: c.issuedOn, amount: cents(c.amount) }))].sort((a, b) => a.date.localeCompare(b.date) || (a.amount < b.amount ? -1 : 1));
    let reduction = 0n; for (const event of events) { reduction += event.amount; if (reduction > cents(i.amount)) throw new Error("CLIENT_SALES_INVOICE_OVERALLOCATED_AT_DATE"); }
    const active = allocations.filter(a => { const p = input.payments.find(p => p.id === a.paymentId)!; return p.paidOn <= review && (!p.cancelledOn || p.cancelledOn > review); });
    const payments = money(active.reduce((s, a) => s + cents(a.amount), 0n)), creditAmount = money(credits.reduce((s, c) => s + cents(c.amount), 0n)), start = i.dueOn ?? i.issuedOn;
    return { invoiceId: i.id, customerId: i.customerId, invoice: i.amount, creditsAtClosing: money(0n), paymentsAtClosing: money(0n), dueAtClosing: i.amount,
      subsequentPayments: payments, subsequentCredits: creditAmount, dueAtReview: money(cents(i.amount) - cents(payments) - cents(creditAmount)), closingDate: close, asOfDate: review,
      dueOn: i.dueOn ?? null, letteringStatus: i.letteringStatus, bookedImpairment: i.bookedImpairment,
      paymentAllocations: allocations.map(a => ({ ...a, paidOn: input.payments.find(p => p.id === a.paymentId)!.paidOn })), creditNotes: credits,
      aging: { asOfDate: review, from: start, label: i.dueOn ? "jours depuis échéance (signés)" : "jours depuis facture — échéance inconnue", days: (Date.parse(review) - Date.parse(start)) / 86400000 },
      impairmentEstimate: unknown("SOURCE REQUISE : méthode et estimation, aucun calcul sur âge seul") };
  });
  const payments = input.payments.map(p => ({ ...p, remainder: money(cents(p.amount) - input.allocations.filter(a => a.paymentId === p.id).reduce((s, a) => s + cents(a.amount), 0n)), status: p.cancelledOn && p.cancelledOn <= review ? "cancelled" : "documented" }));
  return frozen({ rows, payments, allocations: input.allocations, inputHash: stableSha256(input), mode: "real", conclusion: null });
}
