import { z } from "zod";
import { cents, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { SourcedAmount } from "./cycle-context";
import { assertScope, frozen, moneySchema, type EvidenceLink, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";

/** Qualified sources of the bank bridge (Mission 09). Each type has one closed basis; no other document can enter the bridge. */
export const CASH_TYPES = ["cash_ledger", "cash_statement", "cash_erb", "cash_settlements", "cash_support"] as const;
export type CashSourceType = typeof CASH_TYPES[number];
export const CASH_BASES = { cash_ledger: "ledger_closing", cash_statement: "statement_closing", cash_erb: "reconciliation_statement", cash_settlements: "subsequent_statement", cash_support: "correction_support" } as const;
export const CASH_SOURCE_LABELS: Record<CashSourceType, string> = { cash_ledger: "Grand livre de trésorerie à la clôture", cash_statement: "Relevés bancaires à la clôture", cash_erb: "État de rapprochement bancaire (ERB)", cash_settlements: "Relevés postérieurs à la clôture", cash_support: "Pièces de correction" };
const ROW_LIMITS: Record<CashSourceType, number> = { cash_ledger: 100, cash_statement: 100, cash_erb: 2000, cash_settlements: 4000, cash_support: 2000 };
const id = z.string().trim().min(1).max(200);
export const cashMappingSchema = z.object({
  version: z.literal("cash-reconciliation-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
  cash: z.object({ basis: z.enum(["ledger_closing", "statement_closing", "reconciliation_statement", "subsequent_statement", "correction_support"]),
    bankColumn: id, accountColumn: id, currencyColumn: id, natureColumn: id.optional(), kindColumn: id.optional(),
    labelColumn: id.optional(), explanationColumn: id.optional(), pieceColumn: id.optional() }).strict(),
}).strict();
export type CashMapping = z.infer<typeof cashMappingSchema>;
export function isCashMapping(mapping: ImportMapping): boolean { return cashMappingSchema.safeParse(mapping).success; }

/** An explicit refusal carrying the physical locator, so the preparer can act on the source. */
export class CashSourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "CashSourceError"; }
}
const NATURES: Record<string, "bank" | "cash" | "securities"> = { banque: "bank", bank: "bank", caisse: "cash", cash: "cash", vmp: "securities", securities: "securities" };
const KINDS: Record<string, CashErbKind> = { solde_comptable: "book_balance", book_balance: "book_balance", solde_banque: "bank_balance", bank_balance: "bank_balance",
  remise_non_creditee: "receipt_in_transit", receipt_in_transit: "receipt_in_transit", paiement_non_debite: "outstanding_payment", outstanding_payment: "outstanding_payment", autre_suspens: "other", other: "other" };
export type CashErbKind = "book_balance" | "bank_balance" | "receipt_in_transit" | "outstanding_payment" | "other";
const cell = (row: SourceRow, column?: string) => column ? row.original[column]?.trim() ?? "" : "";

/** Row-level qualification of one approved or previewed batch; population-level checks happen in buildCashFacts. */
export function assertCashBatch(batch: ImportBatch, period: AccountingPeriod) {
  const parsed = cashMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new CashSourceError("CASH_MAPPING_INVALID");
  const m = parsed.data, f = m.cash, type = batch.document.documentType as CashSourceType;
  if (!CASH_TYPES.includes(type) || f.basis !== CASH_BASES[type]) throw new CashSourceError("CASH_SOURCE_TYPE_INVALID");
  if (type === "cash_ledger" && !f.natureColumn) throw new CashSourceError("CASH_NATURE_COLUMN_REQUIRED");
  if (type === "cash_erb" && !f.kindColumn) throw new CashSourceError("CASH_KIND_COLUMN_REQUIRED");
  if (batch.rows.length > ROW_LIMITS[type]) throw new CashSourceError("CASH_ROWS_LIMIT");
  const keys = new Set<string>();
  for (const row of batch.rows) {
    const at = (code: string, column?: string) => new CashSourceError(code, { ...row.locator, ...(column ? { column, value: cell(row, column).slice(0, 80) } : {}) });
    if (!row.normalized || row.errors.length) throw at("CASH_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!id.safeParse(key).success || keys.has(key)) throw at("CASH_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    if (!id.safeParse(cell(row, f.bankColumn)).success) throw at("CASH_BANK_REQUIRED", f.bankColumn);
    if (!id.safeParse(cell(row, f.accountColumn)).success) throw at("CASH_ACCOUNT_REQUIRED", f.accountColumn);
    const currency = cell(row, f.currencyColumn);
    // The ledger records the account currency (its amount stays the EUR book balance); bank-side amounts must be EUR, never converted.
    if (type === "cash_ledger" ? !/^[A-Z]{3}$/.test(currency) : currency !== "EUR") throw at(type === "cash_ledger" ? "CASH_CURRENCY_CODE_INVALID" : "CASH_CURRENCY_UNSUPPORTED", f.currencyColumn);
    const date = row.normalized.date, amount = cents(row.normalized.amount);
    if (type === "cash_ledger") { if (!NATURES[cell(row, f.natureColumn).toLowerCase()]) throw at("CASH_NATURE_INVALID", f.natureColumn); }
    if (type === "cash_ledger" || type === "cash_statement") { if (date !== period.closingDate) throw at("CASH_CLOSING_BALANCE_DATE_REQUIRED", m.columns.date); }
    if (type === "cash_erb") {
      const kind = KINDS[cell(row, f.kindColumn).toLowerCase()];
      if (!kind) throw at("CASH_ERB_KIND_INVALID", f.kindColumn);
      if ((kind === "book_balance" || kind === "bank_balance") && date !== period.closingDate) throw at("CASH_CLOSING_BALANCE_DATE_REQUIRED", m.columns.date);
      if (kind !== "book_balance" && kind !== "bank_balance" && date > period.closingDate) throw at("CASH_SUSPENSE_AFTER_CLOSING", m.columns.date);
      if ((kind === "receipt_in_transit" && amount <= 0n) || (kind === "outstanding_payment" && amount >= 0n) || (kind === "other" && amount === 0n)) throw at("CASH_ITEM_SIGN_INCONSISTENT", m.columns.amount);
    }
    if (type === "cash_settlements" && (date <= period.closingDate || date > period.asOfDate)) throw at("CASH_SETTLEMENT_OUTSIDE_POST_CLOSING", m.columns.date);
    if (type === "cash_settlements" && amount === 0n) throw at("CASH_SETTLEMENT_ZERO", m.columns.amount);
    if (type === "cash_support" && date > period.asOfDate) throw at("CASH_SUPPORT_AFTER_REVIEW", m.columns.date);
  }
}

export interface CashSourceFact { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; value: SourcedAmount; proof: EvidenceLink }
export interface CashAccountFact {
  accountId: string; glAccount: string; bankId: string; accountReference: string; currency: string; nature: "bank" | "cash" | "securities"; label: string;
  inScope: boolean; exclusionReason: string | null; ledger: CashSourceFact;
  statement: CashSourceFact | null; erbBook: CashSourceFact | null; erbBank: CashSourceFact | null;
  items: (CashSourceFact & { itemId: string; kind: "receipt_in_transit" | "outstanding_payment" | "other"; explanation: string; pieceRef: string })[];
  settlements: (CashSourceFact & { settlementId: string; label: string; pieceRef: string })[];
  support: (CashSourceFact & { supportId: string; label: string; pieceRef: string })[];
}
export interface CashFacts {
  accounts: CashAccountFact[];
  /** Per-document header names used to read the bank/account identity of each source row. */
  columnsByDocument: Record<string, { bankColumn: string; accountColumn: string }>;
  sourceOptions: { importId: string; rowId: string; documentVersionId: string; fileName: string; kind: CashSourceType; accountId: string; label: string; locator: SourceLocator; amount: Money; date: string }[];
  settlementDocuments: { importId: string; documentVersionId: string; fileName: string; firstDate: string | null; lastDate: string | null; rowCount: number }[];
}
const exclusionReasons = { cash: "Caisse : procédure distincte, non couverte par le pont bancaire.", securities: "VMP : procédure distincte (titres), non couverte par le pont bancaire." };
export function cashProof(batch: ImportBatch, row: SourceRow, runId: string, purpose: string): EvidenceLink {
  return { id: "proof-" + stableSha256({ runId, rowId: row.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose };
}

type FactRef = { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; amount: Money; date: string };
const factRef = (f: CashSourceFact): FactRef => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, locator: f.locator, amount: f.value.amount, date: f.value.date });
/** Browser view of the server facts: amounts, dates and locators only; the browser never recomputes the bridge. */
export function cashFactsView(facts: CashFacts) {
  return { settlementDocuments: facts.settlementDocuments, accounts: facts.accounts.map(a => ({ accountId: a.accountId, glAccount: a.glAccount, bankId: a.bankId, accountReference: a.accountReference, currency: a.currency, nature: a.nature, label: a.label, inScope: a.inScope, exclusionReason: a.exclusionReason,
    balances: { ledger: factRef(a.ledger), statement: a.statement && factRef(a.statement), erbBook: a.erbBook && factRef(a.erbBook), erbBank: a.erbBank && factRef(a.erbBank) },
    items: a.items.map(i => ({ ...factRef(i), itemId: i.itemId, kind: i.kind, explanation: i.explanation, pieceRef: i.pieceRef })),
    settlements: a.settlements.map(s => ({ ...factRef(s), settlementId: s.settlementId, label: s.label, pieceRef: s.pieceRef })),
    support: a.support.map(s => ({ ...factRef(s), supportId: s.supportId, label: s.label, pieceRef: s.pieceRef })) })) };
}
export type CashFactsView = ReturnType<typeof cashFactsView>;

/** Builds the account population and its attached facts from the current approved sources. Unknown identities are refused, never dropped. */
export function buildCashFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): CashFacts {
  const count = (type: CashSourceType) => imports.filter(b => b.document.documentType === type).length;
  if (count("cash_ledger") !== 1 || count("cash_statement") !== 1 || count("cash_erb") !== 1 || count("cash_settlements") > 1 || count("cash_support") > 1 || imports.some(b => !CASH_TYPES.includes(b.document.documentType as CashSourceType))) throw new CashSourceError("CASH_SOURCES_REQUIRED");
  const facts: CashFacts = { accounts: [], columnsByDocument: {}, sourceOptions: [], settlementDocuments: [] };
  const ordered = [...imports].sort((a, b) => CASH_TYPES.indexOf(a.document.documentType as CashSourceType) - CASH_TYPES.indexOf(b.document.documentType as CashSourceType));
  for (const batch of ordered) {
    assertScope(scope, batch.scope); assertCashBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new CashSourceError("CASH_IMPORT_NOT_APPROVED");
    const m = cashMappingSchema.parse(batch.mapping), f = m.cash, type = batch.document.documentType as CashSourceType;
    facts.columnsByDocument[batch.document.id] = { bankColumn: f.bankColumn, accountColumn: f.accountColumn };
    const fact = (row: SourceRow, purpose: string): CashSourceFact => ({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, locator: row.locator,
      value: { amount: row.normalized!.amount, date: row.normalized!.date, source: row }, proof: cashProof(batch, row, runId, purpose) });
    const accountOf = (row: SourceRow) => {
      const bank = cell(row, f.bankColumn), reference = cell(row, f.accountColumn);
      const account = facts.accounts.find(a => a.bankId === bank && a.accountReference === reference);
      // "Mauvaise banque" : a source line outside the declared population is refused with its physical locator.
      if (!account) throw new CashSourceError("CASH_ACCOUNT_UNKNOWN", { ...row.locator, column: f.bankColumn + " / " + f.accountColumn, value: (bank + " / " + reference).slice(0, 80) });
      return account;
    };
    if (type === "cash_settlements") {
      const dates = batch.rows.map(r => r.normalized!.date).sort();
      facts.settlementDocuments.push({ importId: batch.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, rowCount: batch.rows.length });
    }
    for (const row of batch.rows) {
      const key = row.normalized!.key.trim(), label = cell(row, f.labelColumn), piece = cell(row, f.pieceColumn);
      if (type === "cash_ledger") {
        const bank = cell(row, f.bankColumn), reference = cell(row, f.accountColumn), currency = cell(row, f.currencyColumn), nature = NATURES[cell(row, f.natureColumn).toLowerCase()];
        // Two GL accounts on the same bank identity would merge silently in the bridge; a label never merges accounts.
        if (facts.accounts.some(a => a.bankId === bank && a.accountReference === reference)) throw new CashSourceError("CASH_ACCOUNT_IDENTITY_DUPLICATE", { ...row.locator, column: f.accountColumn, value: reference.slice(0, 80) });
        const exclusionReason = nature !== "bank" ? exclusionReasons[nature] : currency !== "EUR" ? `Devise du compte non gérée (${currency}) : aucune conversion implicite ; pont non calculé.` : null;
        facts.accounts.push({ accountId: key, glAccount: key, bankId: bank, accountReference: reference, currency, nature, label: label || bank + " · " + reference, inScope: !exclusionReason, exclusionReason,
          ledger: fact(row, "Solde comptable de clôture (GL)"), statement: null, erbBook: null, erbBank: null, items: [], settlements: [], support: [] });
        continue;
      }
      const account = accountOf(row);
      if (type === "cash_statement") {
        if (account.statement) throw new CashSourceError("CASH_STATEMENT_DUPLICATE", row.locator);
        account.statement = fact(row, "Solde du relevé bancaire à la clôture");
      } else if (type === "cash_erb") {
        const kind = KINDS[cell(row, f.kindColumn).toLowerCase()];
        if (kind === "book_balance" || kind === "bank_balance") {
          const target = kind === "book_balance" ? "erbBook" : "erbBank";
          if (account[target]) throw new CashSourceError("CASH_ERB_BALANCE_DUPLICATE", row.locator);
          account[target] = fact(row, kind === "book_balance" ? "Solde comptable selon l’ERB" : "Solde bancaire selon l’ERB");
        } else account.items.push({ ...fact(row, "Suspens de l’ERB à la clôture"), itemId: key, kind, explanation: cell(row, f.explanationColumn), pieceRef: piece });
      } else if (type === "cash_settlements") account.settlements.push({ ...fact(row, "Mouvement du relevé postérieur à la clôture"), settlementId: key, label, pieceRef: piece });
      else account.support.push({ ...fact(row, "Pièce de correction postérieure"), supportId: key, label, pieceRef: piece });
      facts.sourceOptions.push({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, kind: type, accountId: account.accountId, label: [key, label || piece].filter(Boolean).join(" — "), locator: row.locator, amount: row.normalized!.amount, date: row.normalized!.date });
    }
  }
  return frozen(facts);
}
