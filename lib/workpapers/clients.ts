import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { calculateReceivables, type ReceivableInvoice } from "@/lib/rapprochement/receivables";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertContext, assertDate, assertUnique, type CycleContext } from "./cycle-context";
import { assertScope, frozen, type EvidenceLink } from "./model";
import { compareSupported, evidence, methodEligible, reconcileBalances, unknown, type BalanceLine, type DocumentedMethod, type SupportedAmount } from "./cycle-review";
import { analyzeCutoff, type CutoffInput } from "./cutoff";
import { validateConfirmation, type ConfirmationRecord } from "./confirmations";

export interface ClientInvoice extends Omit<ReceivableInvoice, "dueOn" | "documentedEstimate"> { customerId: string; dueOn?: string; evidence: EvidenceLink[] }
export interface ClientInput {
  context: CycleContext; invoices: ClientInvoice[];
  payments: { id: string; customerId: string; amount: Money; paidOn: string; cancelledOn?: string; evidence: EvidenceLink[] }[];
  allocations: { paymentId: string; invoiceId: string; amount: Money; evidence: EvidenceLink[] }[];
  credits: { id: string; invoiceId: string; amount: Money; issuedOn: string; evidence: EvidenceLink[] }[];
}
export function clientReceivables(input: ClientInput) {
  assertContext(input.context);
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
export function clientImpairment(context: CycleContext, booked: SupportedAmount | null, estimate: SupportedAmount | null, method: DocumentedMethod | null): KnownAmount {
  assertContext(context);
  if (!methodEligible(method, context.period.closingDate) || booked?.date !== context.period.closingDate) return unknown("SOURCE REQUISE : méthode, base et clôture comparables");
  return compareSupported(context, estimate, booked);
}
export function frameClients(context: CycleContext, general: BalanceLine[], auxiliary: BalanceLine[], aged: BalanceLine[], adjustments: { kind: "FAE" | "PCA"; booked: BalanceLine[]; detail: BalanceLine[] }[]) {
  return { generalToAuxiliary: reconcileBalances(context, general, auxiliary, "account"), auxiliaryToAged: reconcileBalances(context, auxiliary, aged, "party"), adjustments: adjustments.map((a) => ({ kind: a.kind, comparison: reconcileBalances(context, a.booked, a.detail, "account") })), creditBalances: auxiliary.filter((r) => cents(r.value.amount) < 0n).map((r) => ({ ...r, status: "à justifier, pas une erreur automatique" })) };
}
export function clientEvidence(context: CycleContext, confirmations: ConfirmationRecord[], cutoff: CutoffInput[]) {
  assertContext(context);
  confirmations.forEach((r) => { assertScope(context.scope, r.scope); if (r.subject !== "customer") throw new Error("CLIENT_SUBJECT_REQUIRED"); validateConfirmation(r); });
  cutoff.forEach((r) => { assertScope(context.scope, r.context.scope); if (r.flow !== "sale" || stableSha256(r.context.period) !== stableSha256(context.period)) throw new Error("CLIENT_CUTOFF_CONTEXT"); });
  return frozen({ confirmations, cutoff: cutoff.map(analyzeCutoff), conclusion: null });
}
