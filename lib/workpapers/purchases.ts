import { cents, money, type Money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertAmount, assertContext, assertUnique, type CycleContext, type SourcedAmount } from "./cycle-context";
import { assertScope, frozen, type EvidenceLink, type Population, type SelectionSet } from "./model";
import { evidence, known, ratio, reconcileBalances, supportedAmountSchema, unknown, type BalanceLine, type SupportedAmount } from "./cycle-review";
import { analyzeCutoff, uniqueEconomicExposures, type CutoffInput, type CutoffResult } from "./cutoff";
import { validateSelectionSources } from "./selection";
import type { ImportBatch } from "./imports";
export interface PurchaseInput {
  context: CycleContext; imports: ImportBatch[]; population: Population; selection: SelectionSet;
  invoices: { id: string; amount: SupportedAmount }[];
  tests: { id: string; line: SourcedAmount; invoiceId: string; allocated: Money; basis: string; evidence: EvidenceLink[]; cutoff: CutoffInput }[];
}
export function testPurchases(input: PurchaseInput) {
  assertContext(input.context); assertScope(input.context.scope, input.population.scope); validateSelectionSources(input.population, input.selection, input.imports);
  assertUnique(input.invoices.map((r) => r.id)); assertUnique(input.tests.map((r) => r.id)); assertUnique(input.tests.map((r) => r.line.source.id));
  input.invoices.forEach((i) => { supportedAmountSchema.parse(i.amount); evidence(input.context, i.amount.evidence); });
  const recognizedByEvent = new Map<string, bigint>();
  const invoicesByEvent = new Map<string, Set<string>>();
  for (const test of input.tests) {
    if (test.line.date <= input.context.period.closingDate) {
      recognizedByEvent.set(test.cutoff.economicEventKey,
        (recognizedByEvent.get(test.cutoff.economicEventKey) ?? 0n) + cents(test.line.amount));
    }
    const invoiceIds = invoicesByEvent.get(test.cutoff.economicEventKey) ?? new Set<string>();
    invoiceIds.add(test.invoiceId);
    invoicesByEvent.set(test.cutoff.economicEventKey, invoiceIds);
  }
  const allocated = new Map<string, bigint>();
  const rows = input.tests.map((t) => {
    assertAmount(input.context, t.line); assertScope(input.context.scope, t.cutoff.context.scope);
    if (t.cutoff.flow !== "purchase" || stableSha256(t.cutoff.context.period) !== stableSha256(input.context.period) || !input.selection.selectedIds.includes(t.line.source.id)) throw new Error("PURCHASE_SELECTION_OR_PERIOD");
    const original = input.imports.flatMap((b) => b.rows).find((r) => r.id === t.line.source.id);
    if (stableSha256(original) !== stableSha256(t.line.source)) throw new Error("PURCHASE_SOURCE_CHANGED");
    const invoice = input.invoices.find((i) => i.id === t.invoiceId);
    if (!invoice || t.cutoff.invoice?.id !== t.invoiceId) throw new Error("PURCHASE_INVOICE_REQUIRED");
    const n = cents(t.allocated), used = (allocated.get(invoice.id) ?? 0n) + n;
    if (n < 0n || used > cents(invoice.amount.amount)) throw new Error("PURCHASE_INVOICE_OVERALLOCATED");
    allocated.set(invoice.id, used);
    const comparable = t.basis === invoice.amount.basis && evidence(input.context, t.evidence) && evidence(input.context, invoice.amount.evidence);
    const recognized = recognizedByEvent.get(t.cutoff.economicEventKey) ?? 0n;
    const checkedCutoff = analyzeCutoff({ ...t.cutoff, recognition: {
      ...t.cutoff.recognition,
      alreadyRecognizedAmount: known(money(recognized)),
      bookingDate: recognized !== 0n ? input.context.period.closingDate : t.cutoff.recognition.bookingDate,
    } });
    const basisComparable = t.cutoff.basis.net.kind === "known"
      && cents(t.cutoff.basis.net.value) === cents(invoice.amount.amount)
      && t.basis === invoice.amount.basis
      && invoicesByEvent.get(t.cutoff.economicEventKey)?.size === 1;
    const cutoffResult: CutoffResult = basisComparable ? checkedCutoff : frozen({
      ...checkedCutoff, status: "inconclusive" as const, candidate: null,
      amount: unknown("SOURCE REQUISE : base facture/événement non comparable"),
      reasons: [...checkedCutoff.reasons, "PURCHASE_EVENT_BASIS_MISMATCH"],
    });
    return { ...t, difference: comparable ? known(money(cents(t.line.amount) - n)) : unknown("Base HT/TTC ou preuve non comparable"), cutoffResult, status: "awaiting_human_review" };
  });
  const exposures = uniqueEconomicExposures(rows.map((row) => ({ procedureId: row.id, result: row.cutoffResult })));
  return frozen({ rows, exposures, invoiceRemainders: input.invoices.map((i) => ({ id: i.id, remainder: money(cents(i.amount.amount) - (allocated.get(i.id) ?? 0n)) })), populationHash: input.population.hash, selection: input.selection, notTestedIds: input.selection.selectedIds.filter((id) => !input.tests.some((t) => t.line.source.id === id)), detailConclusion: null, analyticalConclusion: null, limitations: ["Sélection GL : ne prouve pas l’exhaustivité des charges absentes", ...input.selection.limitations], inputHash: stableSha256(input) });
}
export function analyzePurchases(context: CycleContext, current: BalanceLine[], journal: BalanceLine[], previous: { startDate: string; closingDate: string; comparable: boolean; total: Money } | null, explanation: string, corroboration: EvidenceLink[]) {
  const frame = reconcileBalances(context, current, journal), total = money(current.reduce((s, r) => s + cents(r.value.amount), 0n));
  const comparative = context.period.comparative;
  const comparable = previous?.comparable && comparative && previous.startDate === comparative.startDate && previous.closingDate === comparative.closingDate;
  const delta = comparable ? known(money(cents(total) - cents(previous.total))) : unknown("Période comparative non comparable");
  return frozen({ frame, debit: money(current.reduce((s, r) => s + (cents(r.value.amount) > 0n ? cents(r.value.amount) : 0n), 0n)), credit: money(current.reduce((s, r) => s + (cents(r.value.amount) < 0n ? -cents(r.value.amount) : 0n), 0n)), net: total, delta, rate: comparable && delta.kind === "known" ? ratio(delta.value, previous.total) : { kind: "unknown", reason: "Comparatif absent" }, rateConvention: "(N − N-1) / N-1 signé", explanation, corroboration, explanationStatus: explanation.trim() && evidence(context, corroboration) ? "documented_pending_review" : "evidence_pending", conclusion: null });
}
