import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { clearCash, reconcileCash, type CashAllocation, type CashConvention, type CashInput, type CashItem, type ClearanceStatus, type Settlement } from "./cash";
import { buildCashFacts, CashSourceError, type CashAccountFact, type CashFacts } from "./cash-sources";
import { absolute, assertWindow, sum, type CycleContext } from "./cycle-context";
import { dateSchema, proofSchema } from "./cycle-review";
import { frozen, knownAmountSchema, moneySchema, scopeSchema, type EvidenceLink, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { authorize, type Principal } from "./policy";

export const CASH_PROCEDURE = "cash.reconciliation" as const;
const id = z.string().trim().min(1).max(200), note = z.string().trim().max(10000), required = note.refine(v => !!v, "Texte requis");
const timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis");
export const cashWindowSchema = z.object({ startDate: dateSchema, endDate: dateSchema, coverage: z.enum(["documented", "incomplete"]), note, evidenceImportIds: z.array(id).max(5) }).strict();
const exclusionSchema = z.object({ itemId: id, reason: required }).strict();
const allocationSchema = z.object({ id, itemId: id, settlementId: id, amount: moneySchema }).strict();
const correctionSchema = z.object({ id, itemId: id, proof: z.object({ importId: id, rowId: id }).strict(), reason: required }).strict();
export const cashDraftSchema = z.object({ window: cashWindowSchema, exclusions: z.array(exclusionSchema).max(2000), allocations: z.array(allocationSchema).max(4000), corrections: z.array(correctionSchema).max(2000) }).strict();
export type CashDraft = z.infer<typeof cashDraftSchema>;
const stamp = { authorId: id, authoredAt: timestamp };
export const cashConventionSchema = z.object({ version: z.literal("cash-sign-1"), label: z.literal("positive_increases_book_balance"), validatedBy: id, validatedAt: timestamp }).strict();
export const cashWorkSchema = cashDraftSchema.extend({ schemaVersion: z.literal("cash-reconciliation-1"), convention: cashConventionSchema,
  window: cashWindowSchema.extend({ documentVersionIds: z.array(id).max(5) }).strict(),
  exclusions: z.array(exclusionSchema.extend(stamp).strict()).max(2000), allocations: z.array(allocationSchema.extend(stamp).strict()).max(4000), corrections: z.array(correctionSchema.extend(stamp).strict()).max(2000) }).strict();
export type CashWork = z.infer<typeof cashWorkSchema>;

/** Textual meaning of every clearance status; colour is never the only carrier of meaning. */
export const CASH_STATUS_TEXT: Record<ClearanceStatus, { label: string; meaning: string }> = {
  cleared: { label: "Apuré", meaning: "Montant intégralement retrouvé sur un relevé postérieur de la fenêtre documentée, par allocation validée. Le solde à la clôture reste inchangé." },
  partially_cleared: { label: "Partiellement apuré", meaning: "Une partie seulement est retrouvée sur les relevés postérieurs ; le reste demeure ouvert et à expliquer." },
  open: { label: "Ouvert", meaning: "Suspens expliqué par l’ERB mais non retrouvé dans la fenêtre documentée ; ni erreur ni régularité démontrée." },
  corrected: { label: "Corrigé", meaning: "Traité par une pièce de correction documentée, pas par un mouvement bancaire. Le solde à la clôture reste inchangé." },
  not_tested: { label: "Non testé", meaning: "Fenêtre incomplète, suspens exclu avec motif ou pont non calculable : aucune conclusion d’apurement." },
  unexplained: { label: "Non expliqué", meaning: "Aucune explication dans l’ERB, ou règlement daté avant la clôture alors que le suspens figure à l’ERB ; à investiguer." },
};
export const CASH_LIMITATIONS = [
  "Des totaux concordants ne donnent aucune assurance d’authenticité : un relevé, un ERB ou un GL altérés de façon cohérente concorderaient aussi.",
  "Caisse et VMP restent des procédures distinctes, non couvertes par ce pont bancaire.",
  "Devises autres que l’EUR : comptes exclus, aucune conversion implicite.",
  "Les apurements postérieurs ne modifient jamais les soldes ni l’ERB à la clôture.",
  "Confirmations bancaires, pouvoirs et engagements hors de cet écran ; aucune opinion automatique.",
];

function windowContext(scope: WorkpaperScope, period: AccountingPeriod): CycleContext { return { scope, period, purpose: scope.mode === "real" ? "real" : "synthetic_technical", procedure: CASH_PROCEDURE }; }
function windowEvidence(imports: ImportBatch[], runId: string, importIds: string[]): EvidenceLink[] {
  if (new Set(importIds).size !== importIds.length) throw new Error("CASH_WINDOW_EVIDENCE_DUPLICATE");
  return importIds.map(importId => {
    const batch = imports.find(b => b.id === importId);
    if (!batch || batch.document.documentType !== "cash_settlements" || !batch.approval) throw new Error("CASH_WINDOW_EVIDENCE_INVALID");
    return { id: "proof-" + stableSha256({ runId, window: batch.document.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, precision: "document" as const, status: "verified" as const, purpose: "Relevés postérieurs couvrant la fenêtre d’apurement" };
  });
}
function nextDay(date: string) { const day = new Date(date + "T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1); return day.toISOString().slice(0, 10); }
export function makeInitialCashDraft(period: AccountingPeriod, facts: CashFacts): CashDraft {
  const documents = facts.settlementDocuments;
  return { window: { startDate: nextDay(period.closingDate), endDate: period.asOfDate, coverage: "incomplete", note: documents.length ? "Fenêtre à documenter à partir des relevés postérieurs importés." : "Relevés postérieurs non importés : apurement non testable.", evidenceImportIds: [] }, exclusions: [], allocations: [], corrections: [] };
}
export function cashDraftFromWork(work: CashWork): CashDraft {
  const { documentVersionIds: _documents, ...window } = work.window; void _documents;
  const strip = <T extends { authorId: string; authoredAt: string }>(value: T) => { const { authorId: _author, authoredAt: _at, ...rest } = value; void _author; void _at; return rest; };
  return cashDraftSchema.parse({ window, exclusions: work.exclusions.map(strip), allocations: work.allocations.map(strip), corrections: work.corrections.map(strip) });
}

/** Server-only stamping: author, date and convention validator come from the session, never from the draft. */
export function stampCashWork(input: { scope: WorkpaperScope; period: AccountingPeriod; runId: string; imports: ImportBatch[]; draft: CashDraft; actor: Principal; at: string; previous?: CashWork }): CashWork {
  authorize(input.actor, input.scope, "prepare");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("CASH_TIMESTAMP_INVALID");
  const draft = cashDraftSchema.parse(input.draft);
  for (const list of [draft.allocations.map(a => a.id), draft.corrections.map(c => c.id), draft.exclusions.map(e => e.itemId)]) if (new Set(list).size !== list.length) throw new Error("CASH_DUPLICATE_RECORD");
  const evidence = windowEvidence(input.imports, input.runId, draft.window.evidenceImportIds), documentVersionIds = evidence.map(e => e.documentVersionId).sort();
  assertWindow(windowContext(input.scope, input.period), { ...draft.window, documentVersionIds });
  // A record unchanged since the previous version keeps its original author and date.
  const stamped = <R extends { itemId: string; id?: string }>(record: R, previous?: (R & { authorId: string; authoredAt: string })[]) => {
    const old = previous?.find(p => (p.id ?? p.itemId) === (record.id ?? record.itemId));
    if (old) { const { authorId, authoredAt, ...prior } = old; if (stableSha256(prior) === stableSha256(record)) return { ...record, authorId, authoredAt }; }
    return { ...record, authorId: input.actor.id, authoredAt: input.at };
  };
  const convention = input.previous?.convention ?? { version: "cash-sign-1" as const, label: "positive_increases_book_balance" as const, validatedBy: input.actor.id, validatedAt: input.at };
  const work = cashWorkSchema.parse({ ...draft, schemaVersion: "cash-reconciliation-1", convention, window: { ...draft.window, evidenceImportIds: [...draft.window.evidenceImportIds].sort(), documentVersionIds },
    exclusions: draft.exclusions.map(e => stamped(e, input.previous?.exclusions)),
    allocations: draft.allocations.map(a => stamped(a, input.previous?.allocations)),
    corrections: draft.corrections.map(c => stamped(c, input.previous?.corrections)) });
  evaluateCashReconciliation(input.scope, input.period, input.imports, input.runId, work);
  return frozen(work);
}

const amountRef = z.object({ amount: moneySchema, proofId: id }).strict();
const statusSchema = z.enum(["not_tested", "cleared", "partially_cleared", "open", "corrected", "unexplained"]);
const exceptionCodes = ["BRIDGE_DIFFERENCE", "BRIDGE_SOURCE_MISSING", "ERB_BOOK_SOURCE_DIFFERENCE", "ERB_BANK_SOURCE_DIFFERENCE", "ERB_ARITHMETIC_DIFFERENCE", "WINDOW_INCOMPLETE", "SUSPENSE_OPEN", "SUSPENSE_PARTIALLY_CLEARED", "SUSPENSE_UNEXPLAINED"] as const;
export const cashResultSchema = z.object({
  schemaVersion: z.literal("cash-reconciliation-result-1"), scope: scopeSchema, runId: id, mode: z.enum(["real", "demo"]), closingDate: dateSchema, reviewDate: dateSchema,
  convention: cashConventionSchema.extend({ meaning: note }).strict(),
  window: cashWindowSchema.extend({ documentVersionIds: z.array(id), evidence: z.array(proofSchema) }).strict(),
  accounts: z.array(z.object({
    accountId: id, glAccount: id, bankId: id, accountReference: id, currency: id, nature: z.enum(["bank", "cash", "securities"]), label: note,
    inScope: z.boolean(), exclusionReason: note.nullable(), evidence: z.array(proofSchema),
    bridge: z.discriminatedUnion("status", [
      z.object({ status: z.literal("excluded"), reason: note }).strict(),
      z.object({ status: z.literal("incomplete"), missing: z.array(note).min(1), ledger: amountRef, statement: amountRef.nullable(), erbBook: amountRef.nullable(), erbBank: amountRef.nullable() }).strict(),
      z.object({ status: z.literal("computed"), ledger: amountRef, statement: amountRef, erbBook: amountRef, erbBank: amountRef,
        receiptsInTransit: moneySchema, outstandingPayments: moneySchema, otherItems: moneySchema, movement: moneySchema, reconstructed: moneySchema, difference: moneySchema, differenceMeaning: note,
        bookSourceDifference: moneySchema, bankSourceDifference: moneySchema, erbArithmeticDifference: moneySchema, grossUnexplained: moneySchema, unexplainedCount: z.number().int().nonnegative(), inputHash: id }).strict(),
    ]),
    items: z.array(z.object({ itemId: id, kind: z.enum(["receipt_in_transit", "outstanding_payment", "other"]), amount: moneySchema, date: dateSchema, ageDays: z.number().int().nonnegative(),
      explanation: note, explained: z.boolean(), pieceRef: note, evidence: z.array(proofSchema), status: statusSchema, statusLabel: note, statusMeaning: note,
      settledAmount: moneySchema, remainingAmount: moneySchema, exclusionReason: note.nullable(), warnings: z.array(note),
      allocations: z.array(allocationSchema.extend({ ...stamp, settlementDate: dateSchema, effective: z.boolean(), evidence: z.array(proofSchema) }).strict()),
      correction: correctionSchema.extend({ ...stamp, evidence: z.array(proofSchema) }).strict().nullable() }).strict()),
    settlements: z.array(z.object({ settlementId: id, amount: moneySchema, date: dateSchema, label: note, pieceRef: note, allocated: moneySchema, unallocated: moneySchema, evidence: z.array(proofSchema) }).strict()),
  }).strict()),
  exceptions: z.array(z.object({ id, controlId: z.enum(["bridge", "sources", "clearance"]), code: z.enum(exceptionCodes), label: note, accountId: id.nullable(), targetId: id, message: note, amount: knownAmountSchema, proofIds: z.array(id) }).strict()),
  controls: z.array(z.object({ id: z.enum(["bridge", "sources", "clearance"]), label: note, unit: note, outcome: z.enum(["no_exception_detected", "exceptions_detected", "inconclusive"]), numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), exclusions: z.array(z.object({ id, reason: note }).strict()) }).strict()),
  limitations: z.array(note), conclusion: z.null(),
}).strict().superRefine((r, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (r.mode !== r.scope.mode || r.reviewDate < r.closingDate || r.window.startDate <= r.closingDate || r.window.endDate > r.reviewDate) issue("Période ou fenêtre du résultat incohérente");
  if (r.controls.length !== 3 || new Set(r.controls.map(c => c.id)).size !== 3 || r.controls.some(c => c.numerator > c.denominator)) issue("Programme ou dénominateur incohérent");
  for (const a of r.accounts) {
    if (a.bridge.status === "computed") {
      const b = a.bridge, c = (m: Money) => cents(m);
      // Closing balances are recomputed from the sources: clearance after closing never rewrites them.
      if (c(b.movement) !== a.items.reduce((s, i) => s + c(i.amount), 0n) || c(b.reconstructed) !== c(b.statement.amount) + c(b.movement) || c(b.difference) !== c(b.ledger.amount) - c(b.reconstructed)
        || c(b.bookSourceDifference) !== c(b.erbBook.amount) - c(b.ledger.amount) || c(b.bankSourceDifference) !== c(b.erbBank.amount) - c(b.statement.amount)) issue("Pont arithmétique incohérent pour " + a.accountId);
    }
    for (const i of a.items) if (c2(i.settledAmount) + c2(i.remainingAmount) !== c2(absolute(i.amount)) || c2(i.settledAmount) < 0n || c2(i.remainingAmount) < 0n) issue("Apurement incohérent pour " + i.itemId);
  }
  const proofIds = new Set(r.accounts.flatMap(a => [...a.evidence, ...a.items.flatMap(i => [...i.evidence, ...i.allocations.flatMap(x => x.evidence), ...(i.correction?.evidence ?? [])]), ...a.settlements.flatMap(s => s.evidence)]).concat(r.window.evidence).map(p => p.id));
  if (r.exceptions.some(e => e.proofIds.some(p => !proofIds.has(p)))) issue("Référence de preuve non résolue");
  if (new Set(r.exceptions.map(e => e.id)).size !== r.exceptions.length || new Set(r.accounts.map(a => a.accountId)).size !== r.accounts.length) issue("Identité de résultat dupliquée");
});
const c2 = (m: Money) => cents(m);
export type CashResult = z.infer<typeof cashResultSchema>;
export type CashAccountResult = CashResult["accounts"][number];
export type CashItemResult = CashAccountResult["items"][number];
const exceptionLabels: Record<typeof exceptionCodes[number], string> = { BRIDGE_DIFFERENCE: "Écart du pont à expliquer", BRIDGE_SOURCE_MISSING: "Source du pont manquante", ERB_BOOK_SOURCE_DIFFERENCE: "Écart de source : solde comptable de l’ERB / GL", ERB_BANK_SOURCE_DIFFERENCE: "Écart de source : solde banque de l’ERB / relevé", ERB_ARITHMETIC_DIFFERENCE: "Arithmétique interne de l’ERB incohérente", WINDOW_INCOMPLETE: "Fenêtre d’apurement incomplète", SUSPENSE_OPEN: "Suspens ouvert à expliquer", SUSPENSE_PARTIALLY_CLEARED: "Suspens partiellement apuré", SUSPENSE_UNEXPLAINED: "Suspens non expliqué" };
function ageDays(from: string, to: string) { return Math.max(0, Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000)); }

/** Pure, deterministic evaluation on the frozen approved sources. Invalid documented work is refused; open or untested items stay visible as such. */
export function evaluateCashReconciliation(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, input: CashWork): CashResult {
  const work = cashWorkSchema.parse(input), facts = buildCashFacts(scope, period, imports, runId), context = windowContext(scope, period);
  const windowProofs = windowEvidence(imports, runId, work.window.evidenceImportIds);
  if (stableSha256(windowProofs.map(p => p.documentVersionId).sort()) !== stableSha256([...work.window.documentVersionIds].sort())) throw new Error("CASH_WINDOW_PROOF_CHANGED");
  assertWindow(context, work.window);
  const items = facts.accounts.flatMap(a => a.items.map(i => ({ account: a, item: i })));
  const settlements = facts.accounts.flatMap(a => a.settlements.map(s => ({ account: a, settlement: s })));
  const itemOf = (itemId: string) => items.find(x => x.item.itemId === itemId);
  for (const e of work.exclusions) { const found = itemOf(e.itemId); if (!found) throw new Error("CASH_EXCLUSION_ITEM_UNKNOWN"); if (!found.account.inScope) throw new Error("CASH_EXCLUSION_ACCOUNT_OUT_OF_SCOPE"); }
  const excluded = new Map(work.exclusions.map(e => [e.itemId, e.reason]));
  const pairs = new Set<string>();
  for (const a of work.allocations) {
    const item = itemOf(a.itemId), settlement = settlements.find(x => x.settlement.settlementId === a.settlementId);
    if (!item || !settlement) throw new Error("CASH_ALLOCATION_REFERENCE_UNKNOWN");
    if (item.account.accountId !== settlement.account.accountId) throw new Error("CASH_ALLOCATION_ACCOUNT_MISMATCH");
    if (!item.account.inScope || excluded.has(a.itemId)) throw new Error("CASH_ALLOCATION_ITEM_NOT_TESTED");
    if (cents(a.amount) <= 0n) throw new Error("CASH_ALLOCATION_AMOUNT_INVALID");
    if (cents(item.item.value.amount) * cents(settlement.settlement.value.amount) <= 0n) throw new Error("CASH_ALLOCATION_SIGN_MISMATCH");
    if (pairs.has(a.itemId + "\u0000" + a.settlementId)) throw new Error("CASH_ALLOCATION_DUPLICATE");
    pairs.add(a.itemId + "\u0000" + a.settlementId);
  }
  const supportRows = facts.accounts.flatMap(a => [...a.support, ...a.settlements].map(s => ({ account: a, source: s })));
  for (const c of work.corrections) {
    const item = itemOf(c.itemId), proof = supportRows.find(s => s.source.importId === c.proof.importId && s.source.rowId === c.proof.rowId);
    if (!item || !proof) throw new Error("CASH_CORRECTION_REFERENCE_UNKNOWN");
    if (item.account.accountId !== proof.account.accountId) throw new Error("CASH_CORRECTION_ACCOUNT_MISMATCH");
    if (!item.account.inScope || excluded.has(c.itemId)) throw new Error("CASH_CORRECTION_ITEM_NOT_TESTED");
    if (work.allocations.some(a => a.itemId === c.itemId)) throw new Error("CASH_CORRECTION_AND_ALLOCATION_CONFLICT");
  }
  if (new Set(work.corrections.map(c => c.itemId)).size !== work.corrections.length) throw new Error("CASH_CORRECTION_DUPLICATE");
  const convention: CashConvention = { version: work.convention.version, label: work.convention.label, validatedBy: work.convention.validatedBy, bankColumn: "", accountColumn: "", columnsByDocument: facts.columnsByDocument };
  const exceptions: CashResult["exceptions"] = [];
  const add = (code: typeof exceptionCodes[number], accountId: string | null, targetId: string, message: string, amount: KnownAmount, proofs: EvidenceLink[]) => exceptions.push({ id: code + ":" + stableSha256({ runId, accountId, targetId }).slice(0, 24), controlId: code.startsWith("BRIDGE") ? "bridge" : code.startsWith("ERB") ? "sources" : "clearance", code, label: exceptionLabels[code], accountId, targetId, message, amount, proofIds: [...new Set(proofs.map(p => p.id))] });
  const windowComplete = work.window.coverage === "documented" && work.window.endDate === period.asOfDate;
  if (!windowComplete) add("WINDOW_INCOMPLETE", null, runId, work.window.coverage === "documented" ? `Fenêtre documentée jusqu’au ${work.window.endDate}, avant la date de revue ${period.asOfDate} : les suspens restant ouverts peuvent être apurés après la fenêtre.` : "Fenêtre d’apurement non documentée : les suspens sont non testés, sans conclusion.", { kind: "not_applicable", reason: "Couverture de la fenêtre" }, windowProofs);
  const ref = (f: CashAccountFact["ledger"] | null) => f ? { amount: f.value.amount, proofId: f.proof.id } : null;
  const accounts: CashResult["accounts"] = facts.accounts.map(account => {
    const accountItems = account.items.map(i => ({ ...i, explained: !!i.explanation.trim() }));
    const settlementRows = account.settlements;
    const allocationRows = work.allocations.filter(a => accountItems.some(i => i.itemId === a.itemId));
    const allocationView = (a: typeof work.allocations[number]) => { const s = settlementRows.find(s => s.settlementId === a.settlementId)!; return { ...a, settlementDate: s.value.date, effective: false, evidence: [s.proof] }; };
    const correctionView = (itemId: string) => { const c = work.corrections.find(c => c.itemId === itemId); if (!c) return null; const proof = supportRows.find(s => s.source.importId === c.proof.importId && s.source.rowId === c.proof.rowId)!; return { ...c, evidence: [proof.source.proof] }; };
    const baseItem = (i: typeof accountItems[number], reason: string) => ({ itemId: i.itemId, kind: i.kind, amount: i.value.amount, date: i.value.date, ageDays: ageDays(i.value.date, period.closingDate), explanation: i.explanation, explained: i.explained, pieceRef: i.pieceRef, evidence: [i.proof],
      status: "not_tested" as const, statusLabel: CASH_STATUS_TEXT.not_tested.label, statusMeaning: CASH_STATUS_TEXT.not_tested.meaning, settledAmount: money(0n), remainingAmount: absolute(i.value.amount), exclusionReason: reason, warnings: [] as string[],
      allocations: allocationRows.filter(a => a.itemId === i.itemId).map(allocationView), correction: correctionView(i.itemId) });
    const settlementView = (allocated: Map<string, bigint>) => settlementRows.map(s => ({ settlementId: s.settlementId, amount: s.value.amount, date: s.value.date, label: s.label, pieceRef: s.pieceRef, allocated: money(allocated.get(s.settlementId) ?? 0n), unallocated: money(cents(absolute(s.value.amount)) - (allocated.get(s.settlementId) ?? 0n)), evidence: [s.proof] }));
    const common = { accountId: account.accountId, glAccount: account.glAccount, bankId: account.bankId, accountReference: account.accountReference, currency: account.currency, nature: account.nature, label: account.label, inScope: account.inScope, exclusionReason: account.exclusionReason,
      evidence: [account.ledger, account.statement, account.erbBook, account.erbBank].filter((f): f is NonNullable<typeof f> => !!f).map(f => f.proof) };
    if (!account.inScope) return { ...common, bridge: { status: "excluded" as const, reason: account.exclusionReason! }, items: accountItems.map(i => baseItem(i, account.exclusionReason!)), settlements: settlementView(new Map()) };
    const missing = [!account.statement && "Solde du relevé à la clôture absent", !account.erbBook && "Solde comptable de l’ERB absent", !account.erbBank && "Solde banque de l’ERB absent"].filter((v): v is string => !!v);
    if (missing.length) {
      add("BRIDGE_SOURCE_MISSING", account.accountId, account.accountId, missing.join(" ; ") + " : pont non calculé, aucun écart réputé nul.", { kind: "unknown", reason: "Source du pont manquante" }, [account.ledger.proof]);
      return { ...common, bridge: { status: "incomplete" as const, missing, ledger: ref(account.ledger)!, statement: ref(account.statement), erbBook: ref(account.erbBook), erbBank: ref(account.erbBank) }, items: accountItems.map(i => baseItem(i, "Pont non calculable : " + missing.join(" ; "))), settlements: settlementView(new Map()) };
    }
    const bankAccount = { id: account.accountId, bankId: account.bankId, bankLabel: account.label, accountReference: account.accountReference, currency: "EUR" as const, aliases: [] };
    const cashItems: CashItem[] = accountItems.map(i => ({ id: i.itemId, accountId: account.accountId, type: i.kind, value: i.value, explanation: i.explanation, explained: i.explained }));
    const cashInput: CashInput = { context, account: bankAccount, convention, ledger: account.ledger.value, statement: account.statement!.value, erbBook: account.erbBook!.value, erbBank: account.erbBank!.value, items: cashItems };
    const bridge = reconcileCash(cashInput);
    const selected = accountItems.filter(i => !excluded.has(i.itemId)).map(i => i.itemId);
    const engineSettlements: Settlement[] = settlementRows.map(s => ({ id: s.settlementId, accountId: account.accountId, value: s.value }));
    const engineAllocations: CashAllocation[] = allocationRows.map(a => ({ itemId: a.itemId, settlementId: a.settlementId, amount: a.amount }));
    const corrections = work.corrections.filter(c => selected.includes(c.itemId)).map(c => ({ itemId: c.itemId, proof: supportRows.find(s => s.source.importId === c.proof.importId && s.source.rowId === c.proof.rowId)!.source.value, reason: c.reason }));
    const clearance = clearCash(cashInput, { startDate: work.window.startDate, endDate: work.window.endDate, documentVersionIds: work.window.documentVersionIds, coverage: work.window.coverage }, selected, engineSettlements, engineAllocations, corrections);
    const allocated = new Map<string, bigint>();
    allocationRows.forEach(a => allocated.set(a.settlementId, (allocated.get(a.settlementId) ?? 0n) + cents(a.amount)));
    const sumOf = (kind: CashItem["type"]) => sum(accountItems.filter(i => i.kind === kind).map(i => i.value.amount));
    const resultItems = accountItems.map(i => {
      const row = clearance.rows.find(r => r.itemId === i.itemId)!, base = baseItem(i, excluded.get(i.itemId) ?? (work.window.coverage !== "documented" ? "Fenêtre d’apurement non documentée." : ""));
      const status = row.status, text = CASH_STATUS_TEXT[status];
      return { ...base, status, statusLabel: text.label, statusMeaning: text.meaning, settledAmount: row.settledAmount, remainingAmount: row.remainingAmount, exclusionReason: status === "not_tested" ? base.exclusionReason || "Suspens non testé." : null, warnings: row.warnings,
        allocations: base.allocations.map(a => ({ ...a, effective: status !== "not_tested" && status !== "corrected" && a.settlementDate > period.closingDate })) };
    });
    const proofs = (...values: ({ proof: EvidenceLink } | null)[]) => values.filter((v): v is { proof: EvidenceLink } => !!v).map(v => v.proof);
    if (cents(bridge.difference) !== 0n) add("BRIDGE_DIFFERENCE", account.accountId, account.accountId, `GL ${account.ledger.value.amount.amount} − (relevé ${account.statement!.value.amount.amount} + suspens ${bridge.movement.amount}) = ${bridge.difference.amount} EUR ; écart du pont distinct des écarts de source.`, { kind: "known", value: bridge.difference }, proofs(account.ledger, account.statement, ...accountItems));
    if (cents(bridge.bookSourceDifference) !== 0n) add("ERB_BOOK_SOURCE_DIFFERENCE", account.accountId, account.accountId + ":book", `Solde comptable de l’ERB ${account.erbBook!.value.amount.amount} − GL ${account.ledger.value.amount.amount} = ${bridge.bookSourceDifference.amount} EUR.`, { kind: "known", value: bridge.bookSourceDifference }, proofs(account.erbBook, account.ledger));
    if (cents(bridge.bankSourceDifference) !== 0n) add("ERB_BANK_SOURCE_DIFFERENCE", account.accountId, account.accountId + ":bank", `Solde banque de l’ERB ${account.erbBank!.value.amount.amount} − relevé ${account.statement!.value.amount.amount} = ${bridge.bankSourceDifference.amount} EUR.`, { kind: "known", value: bridge.bankSourceDifference }, proofs(account.erbBank, account.statement));
    if (cents(bridge.erbArithmeticDifference) !== 0n) add("ERB_ARITHMETIC_DIFFERENCE", account.accountId, account.accountId + ":erb", `Solde comptable ERB − solde banque ERB − suspens = ${bridge.erbArithmeticDifference.amount} EUR : l’ERB ne s’équilibre pas.`, { kind: "known", value: bridge.erbArithmeticDifference }, proofs(account.erbBook, account.erbBank, ...accountItems));
    for (const item of resultItems) {
      const proofSet = [...item.evidence, ...item.allocations.flatMap(a => a.evidence)];
      if (item.status === "open") add("SUSPENSE_OPEN", account.accountId, item.itemId, `Suspens ${item.itemId} (${item.amount.amount} EUR, ${item.ageDays} jours à la clôture) non retrouvé dans la fenêtre ${work.window.startDate} → ${work.window.endDate}.`, { kind: "known", value: item.remainingAmount }, proofSet);
      if (item.status === "partially_cleared") add("SUSPENSE_PARTIALLY_CLEARED", account.accountId, item.itemId, `Suspens ${item.itemId} : ${item.settledAmount.amount} EUR apurés, ${item.remainingAmount.amount} EUR restent à expliquer.`, { kind: "known", value: item.remainingAmount }, proofSet);
      if (item.status === "unexplained") add("SUSPENSE_UNEXPLAINED", account.accountId, item.itemId, item.warnings.length ? `Suspens ${item.itemId} : règlement daté avant la clôture alors que le suspens figure à l’ERB.` : `Suspens ${item.itemId} sans explication dans l’ERB et non apuré.`, { kind: "known", value: item.remainingAmount }, proofSet);
    }
    return { ...common, items: resultItems, settlements: settlementView(allocated), bridge: { status: "computed" as const, ledger: ref(account.ledger)!, statement: ref(account.statement)!, erbBook: ref(account.erbBook)!, erbBank: ref(account.erbBank)!,
      receiptsInTransit: sumOf("receipt_in_transit"), outstandingPayments: sumOf("outstanding_payment"), otherItems: sumOf("other"), movement: bridge.movement, reconstructed: bridge.reconstructed, difference: bridge.difference, differenceMeaning: bridge.differenceMeaning,
      bookSourceDifference: bridge.bookSourceDifference, bankSourceDifference: bridge.bankSourceDifference, erbArithmeticDifference: bridge.erbArithmeticDifference, grossUnexplained: bridge.grossUnexplained, unexplainedCount: bridge.unexplainedCount, inputHash: bridge.inputHash } };
  });
  const tested = accounts.filter(a => a.inScope), computed = tested.filter(a => a.bridge.status === "computed");
  const accountExclusions = accounts.filter(a => !a.inScope).map(a => ({ id: a.accountId, reason: a.exclusionReason! }));
  const testedItems = tested.flatMap(a => a.items), conclusive = testedItems.filter(i => i.status !== "not_tested");
  const has = (control: "bridge" | "sources" | "clearance") => exceptions.some(e => e.controlId === control && e.code !== "BRIDGE_SOURCE_MISSING" && e.code !== "WINDOW_INCOMPLETE");
  const controls: CashResult["controls"] = [
    { id: "bridge", label: "Pont relevé + suspens → GL", unit: "comptes bancaires EUR au pont calculé / comptes bancaires EUR de la population", numerator: computed.length, denominator: tested.length, exclusions: accountExclusions, outcome: has("bridge") ? "exceptions_detected" : !tested.length || computed.length !== tested.length ? "inconclusive" : "no_exception_detected" },
    { id: "sources", label: "Concordance de l’ERB avec le relevé et le GL", unit: "comptes bancaires EUR comparés / comptes bancaires EUR de la population", numerator: computed.length, denominator: tested.length, exclusions: accountExclusions, outcome: has("sources") ? "exceptions_detected" : !tested.length || computed.length !== tested.length ? "inconclusive" : "no_exception_detected" },
    { id: "clearance", label: "Apurement postérieur des suspens", unit: "suspens testés / suspens des comptes bancaires EUR", numerator: conclusive.length, denominator: testedItems.length, exclusions: testedItems.filter(i => i.status === "not_tested").map(i => ({ id: i.itemId, reason: i.exclusionReason ?? "Non testé" })), outcome: has("clearance") ? "exceptions_detected" : !windowComplete || conclusive.length !== testedItems.length ? "inconclusive" : "no_exception_detected" },
  ];
  return frozen(cashResultSchema.parse({ schemaVersion: "cash-reconciliation-result-1", scope, runId, mode: scope.mode, closingDate: period.closingDate, reviewDate: period.asOfDate,
    convention: { ...work.convention, meaning: "Montants signés : positif augmente le solde comptable ; relevé + suspens = solde reconstitué ; écart du pont = GL − reconstitué." },
    window: { ...work.window, evidence: windowProofs }, accounts, exceptions, controls, limitations: CASH_LIMITATIONS, conclusion: null }));
}
export function cashOutcome(result: CashResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  return result.controls.some(c => c.outcome === "exceptions_detected") ? "exceptions_detected" : result.controls.some(c => c.outcome === "inconclusive") ? "inconclusive" : "no_exception_detected";
}
export { CashSourceError };
