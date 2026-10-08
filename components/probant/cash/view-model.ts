import type { CashResult, CashDraft, CashWork } from "@/lib/workpapers/cash-reconciliation";
import { cashDraftFromWork } from "@/lib/workpapers/cash-reconciliation";
import type { CashFactsView } from "@/lib/workpapers/cash-sources";
import { eur } from "./format";
import type { DisplayAccount, DisplayItem } from "./types";

/** Server result first; qualified facts only fill what has not been computed, and never carry a status. */
export function displayAccounts(result: CashResult | null, facts: CashFactsView | null): DisplayAccount[] {
  const ids = result ? result.accounts.map(a => a.accountId) : (facts?.accounts ?? []).map(a => a.accountId);
  return ids.map(id => {
    const r = result?.accounts.find(a => a.accountId === id) ?? null, f = facts?.accounts.find(a => a.accountId === id) ?? null, base = (r ?? f)!;
    const items: DisplayItem[] = r ? r.items.map(i => ({ itemId: i.itemId, accountId: id, kind: i.kind, amount: i.amount, date: i.date, ageDays: i.ageDays, explanation: i.explanation, pieceRef: i.pieceRef,
      status: i.status, statusMeaning: i.statusMeaning, settledAmount: i.settledAmount, remainingAmount: i.remainingAmount, exclusionReason: i.exclusionReason, warnings: i.warnings, allocations: i.allocations, correction: i.correction, proofs: i.evidence,
      source: f?.items.find(x => x.itemId === i.itemId) ?? null }))
      : (f?.items ?? []).map(i => ({ itemId: i.itemId, accountId: id, kind: i.kind, amount: i.amount, date: i.date, ageDays: null, explanation: i.explanation, pieceRef: i.pieceRef, status: null,
        statusMeaning: "Non calculé : figez les sources puis exécutez le pont.", settledAmount: null, remainingAmount: null, exclusionReason: null, warnings: [], allocations: [], correction: null, proofs: [], source: i }));
    return { accountId: id, glAccount: base.glAccount, bankId: base.bankId, accountReference: base.accountReference, currency: base.currency, nature: base.nature, label: base.label, inScope: base.inScope, exclusionReason: base.exclusionReason, result: r, fact: f, items };
  });
}
export function serverDraft(work: CashWork | undefined): CashDraft | null { return work ? cashDraftFromWork(work) : null; }
/** Draft annotations shown beside server statuses; they never replace a computed value. */
export function draftNotes(draft: CashDraft | null, server: CashDraft | null) {
  const notes: Record<string, string[]> = {};
  if (!draft) return notes;
  const push = (id: string, text: string) => (notes[id] ??= []).push(text);
  const known = (list: { id?: string; itemId: string }[] | undefined, x: { id?: string; itemId: string }) => list?.some(y => (y.id ?? y.itemId) === (x.id ?? x.itemId) && JSON.stringify(y) === JSON.stringify(x));
  draft.allocations.filter(a => !known(server?.allocations, a)).forEach(a => push(a.itemId, "brouillon : allocation " + a.settlementId + " " + eur(a.amount)));
  draft.corrections.filter(c => !known(server?.corrections, c)).forEach(c => push(c.itemId, "brouillon : correction"));
  draft.exclusions.filter(e => !known(server?.exclusions, e)).forEach(e => push(e.itemId, "brouillon : exclu du test"));
  for (const a of server?.allocations ?? []) if (!draft.allocations.some(x => x.id === a.id)) push(a.itemId, "brouillon : allocation retirée");
  return notes;
}
