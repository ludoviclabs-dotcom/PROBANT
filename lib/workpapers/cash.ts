import { z } from "zod";
import { cents, money, type Money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { frozen, moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import type { CalculationRegistry } from "./calculations";
import { absolute, assertAmount, assertContext, assertUnique, assertWindow, sum, SOURCE_REQUIRED, type CycleContext, type SourcedAmount, type PostClosingWindow } from "./cycle-context";

export interface BankAccount { id: string; bankId: string; bankLabel: string; accountReference: string; currency: "EUR"; aliases: string[] }
export interface CashItem { id: string; accountId: string; type: "receipt_in_transit" | "outstanding_payment" | "other"; value: SourcedAmount; explanation: string; explained: boolean }
export interface CashInput {
  context: CycleContext; account: BankAccount;
  convention: { version: string; label: "positive_increases_book_balance"; validatedBy: string; bankColumn: string; accountColumn: string };
  ledger: SourcedAmount; statement: SourcedAmount; erbBook: SourcedAmount; erbBank: SourcedAmount; items: CashItem[];
}
export function bankPopulation(context: CycleContext, accounts: BankAccount[]) {
  assertContext(context); assertUnique(accounts.map((a) => a.id));
  assertUnique(accounts.map((a) => `${a.bankId}:${a.accountReference}:${a.currency}`));
  if (accounts.some((a) => !a.bankId.trim() || !a.accountReference.trim() || a.currency !== "EUR")) throw new Error("BANK_IDENTITY_OR_CURRENCY_INVALID");
  const sorted = [...accounts].sort((a, b) => a.id < b.id ? -1 : 1);
  return frozen({ context, accounts: sorted, hash: stableSha256({ context, accounts: sorted }) });
}
export function cashSourceValues(input: CashInput) { return [input.ledger, input.statement, input.erbBook, input.erbBank, ...input.items.map((i) => i.value)]; }
/** Arithmetic bridge specified by the pack; not an audit conclusion or a client ERB generator. */
export function reconcileCash(input: CashInput) {
  assertContext(input.context); bankPopulation(input.context, [input.account]);
  if (input.convention.label !== "positive_increases_book_balance" || !input.convention.version || !input.convention.validatedBy.trim()) throw new Error("CASH_SIGN_CONVENTION_REQUIRED");
  cashSourceValues(input).forEach((v) => assertAmount(input.context, v));
  for (const value of cashSourceValues(input)) {
    if (value.source.original[input.convention.bankColumn] !== input.account.bankId || value.source.original[input.convention.accountColumn] !== input.account.accountReference) throw new Error("CASH_SOURCE_BANK_ACCOUNT_MISMATCH");
  }
  for (const value of [input.ledger, input.statement, input.erbBook, input.erbBank]) if (value.date !== input.context.period.closingDate) throw new Error("CLOSING_BALANCE_DATE_MISMATCH");
  assertUnique(input.items.map((i) => i.id)); assertUnique(input.items.map((i) => i.value.source.id));
  for (const item of input.items) {
    if (item.accountId !== input.account.id || item.value.date > input.context.period.closingDate) throw new Error("CASH_ITEM_SCOPE_OR_DATE_INVALID");
    if (item.explained && !item.explanation.trim()) throw new Error("CASH_EXPLANATION_REQUIRED");
    if (!["receipt_in_transit", "outstanding_payment", "other"].includes(item.type)) throw new Error("CASH_ITEM_TYPE_INVALID");
    if ((item.type === "receipt_in_transit" && cents(item.value.amount) <= 0n) || (item.type === "outstanding_payment" && cents(item.value.amount) >= 0n)) throw new Error("CASH_ITEM_SIGN_INVALID");
  }
  const items = [...input.items].sort((a, b) => a.id < b.id ? -1 : 1);
  const movement = sum(items.map((i) => i.value.amount));
  const reconstructed = money(cents(input.statement.amount) + cents(movement));
  const difference = money(cents(input.ledger.amount) - cents(reconstructed));
  const bookSourceDifference = money(cents(input.erbBook.amount) - cents(input.ledger.amount));
  const bankSourceDifference = money(cents(input.erbBank.amount) - cents(input.statement.amount));
  const erbArithmeticDifference = money(cents(input.erbBook.amount) - cents(input.erbBank.amount) - cents(movement));
  const unexplained = items.filter((i) => !i.explained);
  const grossUnexplained = sum(unexplained.map((i) => absolute(i.value.amount)));
  const result = { accountId: input.account.id, convention: input.convention, closingDate: input.context.period.closingDate,
    bankBalance: input.statement.amount, referenceBookBalance: input.ledger.amount, movement, reconstructed, difference,
    differenceMeaning: "Comptabilité de référence moins (relevé bancaire + éléments normalisés) ; positif = référence supérieure au pont.",
    bookSourceDifference, bankSourceDifference, erbArithmeticDifference,
    grossUnexplained, unexplainedCount: unexplained.length, items,
    hasArithmeticException: [difference, bookSourceDifference, bankSourceDifference, erbArithmeticDifference, grossUnexplained].some((v) => cents(v) !== 0n),
    limitations: [`${SOURCE_REQUIRED}: guide original/PBC et méthode métier à valider ; cadre synthétique uniquement.`, "Accord arithmétique ≠ authenticité, propriété du compte ou conclusion du cycle.", "Les écarts source et l’écart du pont ne sont pas additionnés comme expositions distinctes."] };
  return frozen({ ...result, inputHash: stableSha256({ ...input, items }) });
}
export interface Settlement { id: string; accountId: string; value: SourcedAmount }
export interface CashAllocation { itemId: string; settlementId: string; amount: Money }
export type ClearanceStatus = "not_tested" | "cleared" | "partially_cleared" | "open" | "corrected" | "unexplained";
export function clearCash(input: CashInput, window: PostClosingWindow, selectedIds: string[], settlements: Settlement[], allocations: CashAllocation[], corrections: { itemId: string; proof: SourcedAmount; reason: string }[] = []) {
  reconcileCash(input); assertWindow(input.context, window); assertUnique(selectedIds); assertUnique(settlements.map((p) => p.id)); assertUnique(settlements.map((p) => p.value.source.id));
  assertUnique(corrections.map((c) => c.itemId));
  if (selectedIds.some((id) => !input.items.some((i) => i.id === id))) throw new Error("CASH_SELECTION_INVALID");
  const usedPayments = new Map<string, bigint>(), usedItems = new Map<string, bigint>(), cleared = new Map<string, bigint>(), inconsistent = new Set<string>();
  const assertAccountSource = (value: SourcedAmount) => {
    if (value.source.original[input.convention.bankColumn] !== input.account.bankId || value.source.original[input.convention.accountColumn] !== input.account.accountReference) throw new Error("SETTLEMENT_SOURCE_ACCOUNT_MISMATCH");
  };
  settlements.forEach((p) => { assertAmount(input.context, p.value); assertAccountSource(p.value); if (p.accountId !== input.account.id) throw new Error("SETTLEMENT_ACCOUNT_MISMATCH"); });
  corrections.forEach((c) => { assertAmount(input.context, c.proof); assertAccountSource(c.proof); if (!selectedIds.includes(c.itemId) || !c.reason.trim() || c.proof.date > input.context.period.asOfDate) throw new Error("CORRECTION_EVIDENCE_REQUIRED"); });
  for (const allocation of allocations) {
    const item = input.items.find((i) => i.id === allocation.itemId), payment = settlements.find((p) => p.id === allocation.settlementId), amount = cents(allocation.amount);
    if (!item || !payment || !selectedIds.includes(item.id) || amount <= 0n || cents(item.value.amount) * cents(payment.value.amount) <= 0n) throw new Error("CASH_ALLOCATION_INVALID");
    const usedPayment = (usedPayments.get(payment.id) ?? 0n) + amount, usedItem = (usedItems.get(item.id) ?? 0n) + amount;
    if (usedPayment > cents(absolute(payment.value.amount)) || usedItem > cents(absolute(item.value.amount))) throw new Error("CASH_OVERALLOCATION");
    usedPayments.set(payment.id, usedPayment); usedItems.set(item.id, usedItem);
    if (payment.value.date <= input.context.period.closingDate) { inconsistent.add(item.id); continue; }
    if (payment.value.date < window.startDate || payment.value.date > window.endDate || !window.documentVersionIds.includes(payment.value.source.documentVersionId)) throw new Error("SETTLEMENT_OUTSIDE_DOCUMENTED_WINDOW");
    cleared.set(item.id, (cleared.get(item.id) ?? 0n) + amount);
  }
  const rows = input.items.map((item) => {
    const amount = cents(absolute(item.value.amount)), paid = cleared.get(item.id) ?? 0n, correction = corrections.find((c) => c.itemId === item.id);
    const status: ClearanceStatus = !selectedIds.includes(item.id) || window.coverage !== "documented" ? "not_tested" : inconsistent.has(item.id) ? "unexplained" : correction ? "corrected" : paid === amount && amount > 0n ? "cleared" : paid > 0n ? "partially_cleared" : item.explained ? "open" : "unexplained";
    return { itemId: item.id, status, closingAmount: item.value.amount, settledAmount: money(paid), remainingAmount: money(amount - paid), correction,
      allocations: allocations.filter((a) => a.itemId === item.id).map((a) => ({ ...a, source: settlements.find((p) => p.id === a.settlementId)!.value.source })),
      warnings: inconsistent.has(item.id) ? ["APUREMENT_AVANT_CLOTURE_PRESENT_DANS_ERB"] : [] };
  });
  return frozen({ window, selectedIds, rows, inputHash: stableSha256({ input, window, selectedIds, settlements, allocations, corrections }), limitation: "L’apurement ne modifie jamais le solde ni l’ERB à clôture." });
}
export const CASH_TECHNICAL_RULE: RuleReference = { id: "cash.bridge.synthetic", version: "1.0.0", authority: "internal", source: "Pack v1.1 LOT_03 §5 — arithmétique synthétique, SOURCE REQUISE pour règle métier", effectiveFrom: "2000-01-01", validation: "provisional" };
export const CASH_TEMPLATE: ProcedureTemplate = { id: "cash.bridge", version: "1.0.0", objective: "Vérifier le pont bancaire synthétique, sans opinion d’audit", kind: "calculated", assertions: [{ label: "À valider avec le guide", validation: "unknown" }], requiredDocumentTypes: ["cash_table"], rule: CASH_TECHNICAL_RULE };
export function registerCash(registry: CalculationRegistry) {
  registry.register(CASH_TECHNICAL_RULE, z.array(z.object({ id: z.string(), amount: moneySchema })), z.custom<CashInput>((value) => !!value && typeof value === "object"),
    z.custom<ReturnType<typeof reconcileCash>>((v) => !!v && typeof v === "object" && "difference" in v), (rows, input) => {
      const sources = cashSourceValues(input);
      if (sources.some((s) => !rows.some((r) => r.id === s.source.id && cents(r.amount) === cents(s.amount))) || rows.some((r) => !sources.some((s) => s.source.id === r.id))) throw new Error("CASH_IMPORT_BINDING_MISMATCH");
      return reconcileCash(input);
    }, (result) => result.hasArithmeticException ? "exceptions_detected" : "no_exception_detected", (request) => {
      const parameters = request.parameters as CashInput;
      if (stableSha256(parameters.context.scope) !== stableSha256(request.scope) || stableSha256(parameters.context.period) !== stableSha256(request.period)) throw new Error("CASH_CONTEXT_MISMATCH");
      for (const value of cashSourceValues(parameters)) {
        const source = request.imports.flatMap((b) => b.rows).find((r) => r.id === value.source.id);
        if (!source || stableSha256(source) !== stableSha256(value.source)) throw new Error("CASH_SOURCE_CHANGED");
      }
    });
}
