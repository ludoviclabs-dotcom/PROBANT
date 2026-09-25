import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, type EvidenceLink, type Population, type SelectionSet } from "./model";
import { absolute, assertAmount, assertContext, assertUnique, assertWindow, sum, SOURCE_REQUIRED, type CycleContext, type PostClosingWindow, type SourcedAmount } from "./cycle-context";
import { analyzeCutoff, uniqueEconomicExposures, type CutoffInput, type CutoffResult } from "./cutoff";
import { validateSelectionSources } from "./selection";
import type { ImportBatch } from "./imports";

export interface PayableBalanceLine { id: string; account: string; supplierId?: string; value: SourcedAmount }
export interface PayableFrameInput {
  context: CycleContext; accounts: string[]; convention: { version: string; name: "credits_negative"; validatedBy: string };
  general: PayableBalanceLine[]; auxiliary: PayableBalanceLine[]; aged: PayableBalanceLine[];
  adjustments: { kind: "FNP" | "CCA"; booked: PayableBalanceLine[]; detail: PayableBalanceLine[] }[];
}
export function framePayables(input: PayableFrameInput) {
  assertContext(input.context); assertUnique(input.accounts);
  if (!input.accounts.length || input.convention.name !== "credits_negative" || !input.convention.version || !input.convention.validatedBy.trim()) throw new Error("PAYABLE_SCOPE_AND_SIGN_REQUIRED");
  const compare = (leftName: string, left: PayableBalanceLine[], rightName: string, right: PayableBalanceLine[], key: "compte" | "tiers") => {
    for (const lines of [left, right]) {
      assertUnique(lines.map((r) => r.id)); assertUnique(lines.map((r) => r.value.source.id));
      for (const line of lines) {
        assertAmount(input.context, line.value);
        if (!input.accounts.includes(line.account) || line.value.date !== input.context.period.closingDate) throw new Error("PAYABLE_ACCOUNT_OR_CLOSING_MISMATCH");
      }
    }
    const group = (lines: PayableBalanceLine[]) => {
      const totals = new Map<string, bigint>();
      for (const line of lines) {
        const id = key === "compte" ? line.account : line.supplierId;
        if (!id) throw new Error("PAYABLE_COMPARISON_KEY_MISSING");
        totals.set(id, (totals.get(id) ?? 0n) + cents(line.value.amount));
      }
      return totals;
    };
    const a = group(left), b = group(right);
    const abs = (amount: bigint) => amount < 0n ? -amount : amount;
    let net = 0n, gross = 0n, eligible = 0n, allocated = 0n, matchedCount = 0;
    const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
    const units = keys.map((id) => {
      const source = a.get(id) ?? 0n, target = b.get(id) ?? 0n;
      const residual = source - target;
      const matched = a.has(id) && b.has(id) ? (abs(source) < abs(target) ? abs(source) : abs(target)) : 0n;
      net += residual; gross += abs(residual); eligible += abs(source); allocated += matched;
      if (a.has(id) && b.has(id) && residual === 0n) matchedCount++;
      return { id, source: money(source), target: money(target), residual: money(residual) };
    });
    const blockedControls = keys.length === 0 || eligible === 0n ? ["coverage_denominator_unavailable"] : [];
    return { left: leftName, right: rightName, metrics: {
      referenceSide: "source" as const, units, net: money(net), grossUnexplained: money(gross),
      eligibleAmount: money(eligible), allocatedAmount: money(allocated), eligibleCount: keys.length,
      matchedCount, amountCoverage: eligible === 0n ? null : Number(allocated) / Number(eligible),
      countCoverage: keys.length === 0 ? null : matchedCount / keys.length,
    }, blockedControls,
      sourceRows: [...left, ...right].map((r) => r.value.source), limitation: "Cadrage technique ; matching ≠ exhaustivité, pas de qualification normative automatique." };
  };
  const generalToAuxiliary = compare("general", input.general, "auxiliary", input.auxiliary, "compte");
  const auxiliaryToAged = compare("auxiliary", input.auxiliary, "aged", input.aged, "tiers");
  const adjustments = input.adjustments.map((a) => ({ kind: a.kind, comparison: compare(`${a.kind}-booked`, a.booked, `${a.kind}-detail`, a.detail, "compte") }));
  const debitObservations = input.auxiliary.filter((r) => cents(r.value.amount) > 0n).map((r) => ({ id: r.id, supplierId: r.supplierId, amount: r.value.amount, source: r.value.source, status: "to_explain" as const, note: "Solde débiteur à expliquer ; peut correspondre à une avance justifiée, pas une erreur automatique." }));
  return frozen({ generalToAuxiliary, auxiliaryToAged, adjustments, debitObservations, inputHash: stableSha256(input), limitations: [SOURCE_REQUIRED, "Confirmations : utiliser ConfirmationRegister partagé de Cash ; aucun envoi automatique.", "Résidus des comparaisons distinctes non additionnés comme exposition unique."] });
}

export interface SubsequentPayment { id: string; bankAccountId: string; value: SourcedAmount }
export interface PaymentAllocation { paymentId: string; economicEventKey: string; amount: Money; evidence: EvidenceLink }
export type RpneStatus = "booked_in_period" | "existing_accrual" | "omission_candidate" | "inconclusive" | "outside_period_justified" | "not_tested";
export interface RpneInput {
  paymentAccountColumn: string;
  context: CycleContext; window: PostClosingWindow; imports: ImportBatch[]; population: Population; selection: SelectionSet;
  payments: SubsequentPayment[]; allocations: PaymentAllocation[]; events: CutoffInput[];
}
export function searchUnrecordedLiabilities(input: RpneInput) {
  assertContext(input.context); assertWindow(input.context, input.window);
  assertScope(input.context.scope, input.population.scope); validateSelectionSources(input.population, input.selection, input.imports);
  assertUnique(input.payments.map((p) => p.id)); assertUnique(input.payments.map((p) => p.value.source.id)); assertUnique(input.events.map((e) => e.economicEventKey));
  if (input.population.items.length !== input.payments.length || input.payments.some((p) => !input.population.items.some((i) => i.id === p.value.source.id && cents(i.amount) === cents(p.value.amount)))) throw new Error("RPNE_PAYMENT_POPULATION_MISMATCH");
  for (const payment of input.payments) {
    assertAmount(input.context, payment.value);
    if (!payment.bankAccountId.trim() || payment.value.source.original[input.paymentAccountColumn] !== payment.bankAccountId || payment.value.date < input.window.startDate || payment.value.date > input.window.endDate || !input.window.documentVersionIds.includes(payment.value.source.documentVersionId)) throw new Error("RPNE_PAYMENT_OUTSIDE_WINDOW_OR_ACCOUNT");
    const source = input.imports.flatMap((b) => b.rows).find((r) => r.id === payment.value.source.id);
    if (stableSha256(source) !== stableSha256(payment.value.source)) throw new Error("RPNE_SOURCE_CHANGED");
  }
  input.events.forEach((e) => { assertScope(input.context.scope, e.context.scope); if (e.flow !== "purchase" || stableSha256(e.context.period) !== stableSha256(input.context.period)) throw new Error("RPNE_EVENT_CONTEXT_MISMATCH"); });
  const usedPayment = new Map<string, bigint>(), usedEvent = new Map<string, bigint>();
  for (const allocation of input.allocations) {
    assertScope(input.context.scope, allocation.evidence.scope);
    const payment = input.payments.find((p) => p.id === allocation.paymentId), event = input.events.find((e) => e.economicEventKey === allocation.economicEventKey), amount = cents(allocation.amount);
    if (!payment || !event || !input.selection.selectedIds.includes(payment.value.source.id) || amount <= 0n || allocation.evidence.status !== "verified") throw new Error("RPNE_ALLOCATION_EVIDENCE_REQUIRED");
    const paymentUsed = (usedPayment.get(payment.id) ?? 0n) + amount, eventUsed = (usedEvent.get(event.economicEventKey) ?? 0n) + amount;
    if (paymentUsed > cents(absolute(payment.value.amount))) throw new Error("PAYMENT_OVERALLOCATED");
    if (event.basis.gross.kind === "known" && eventUsed > cents(absolute(event.basis.gross.value))) throw new Error("INVOICE_OVERALLOCATED");
    usedPayment.set(payment.id, paymentUsed); usedEvent.set(event.economicEventKey, eventUsed);
  }
  const candidates: { procedureId: string; result: CutoffResult }[] = [];
  const rows = input.payments.map((payment) => {
    const selected = input.selection.selectedIds.includes(payment.value.source.id), allocations = input.allocations.filter((a) => a.paymentId === payment.id);
    const unallocated = money(cents(absolute(payment.value.amount)) - (usedPayment.get(payment.id) ?? 0n));
    const items = allocations.map((allocation) => {
      const event = input.events.find((e) => e.economicEventKey === allocation.economicEventKey)!;
      let status: RpneStatus = "inconclusive", cutoff: CutoffResult | undefined;
      const reasons: string[] = [];
      if (input.window.coverage !== "documented") reasons.push("FENETRE_NON_COUVERTE");
      else if (!event.invoice || !event.invoice.evidence.some((e) => e.status === "verified")) reasons.push("FACTURE_ABSENTE_OU_NON_VERIFIEE");
      else if (event.basis.gross.kind !== "known") reasons.push("BASE_TTC_ALLOCATION_INCONNUE");
      else {
        cutoff = analyzeCutoff(event);
        if (cutoff.status === "already_treated") status = event.recognition.existingAdjustments.some((a) => a.kind === "FNP") ? "existing_accrual" : "booked_in_period";
        else if (cutoff.status === "candidate" && cutoff.candidate === "FNP") { status = "omission_candidate"; candidates.push({ procedureId: `rpne:${payment.id}`, result: cutoff }); }
        else if (cutoff.status === "no_difference_on_tested_items" && event.performance?.verified && event.performance.date! > input.context.period.closingDate) status = "outside_period_justified";
        else reasons.push(...cutoff.reasons);
      }
      const potentiallyOmitted: KnownAmount = status === "omission_candidate" && cutoff ? cutoff.amount : { kind: "unknown", reason: reasons.join(" ; ") || "Aucune nouvelle omission quantifiée pour cet élément" };
      return { ...allocation, status, cutoff, potentiallyOmitted, reasons };
    });
    const status: RpneStatus = !selected ? "not_tested" : !items.length || cents(unallocated) !== 0n || input.window.coverage !== "documented" || items.some((i) => i.status === "inconclusive") ? "inconclusive" : items.some((i) => i.status === "omission_candidate") ? "omission_candidate" : items.every((i) => i.status === "booked_in_period") ? "booked_in_period" : items.every((i) => i.status === "existing_accrual") ? "existing_accrual" : items.every((i) => i.status === "outside_period_justified") ? "outside_period_justified" : "inconclusive";
    return { paymentId: payment.id, source: payment.value.source, paidAmount: payment.value.amount, status, unallocated, items, reasons: !selected ? ["NON_SELECTIONNE_OU_EXCLU"] : cents(unallocated) !== 0n ? ["PAIEMENT_GROUPE_OU_ACOMPTE_NON_VENTILE"] : [] };
  });
  return frozen({ inputHash: stableSha256(input), window: input.window, populationHash: input.population.hash, selection: input.selection, rows,
    counts: { population: input.payments.length, selected: input.selection.selectedIds.length, tested: rows.filter((r) => !["not_tested", "inconclusive"].includes(r.status)).length, notTested: rows.filter((r) => r.status === "not_tested").length, inconclusive: rows.filter((r) => r.status === "inconclusive").length },
    populationAmount: sum(input.payments.map((p) => absolute(p.value.amount))), exposures: uniqueEconomicExposures(candidates),
    limitations: [SOURCE_REQUIRED, "Montant réglé TTC distinct du passif/charge potentiellement omis ; aucune base HT/TVA déduite du relevé.", "La sélection et le matching ne prouvent pas l’exhaustivité des passifs ; extrapolation désactivée."] });
}
