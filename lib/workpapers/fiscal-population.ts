import { money } from "@/lib/canonical-model/money";
import { DEFAULT_VAT_ACCOUNT_MAP } from "@/lib/tax/vat/ledger";
import type { ImportBatch } from "./imports";

/**
 * Population of the fiscal sheets (Mission 13). Kept free of server-only imports: the shared selection module
 * is also bundled for the browser demonstration.
 */
const FISCAL_TYPES = ["fx_fec", "fx_vat_return", "fx_cit_return", "fx_invoices", "fx_vat_payments", "fx_support"];
const vatAccount = (account: string) => [...DEFAULT_VAT_ACCOUNT_MAP.collectedVatPrefixes, ...DEFAULT_VAT_ACCOUNT_MAP.deductibleVatPrefixes].some(p => account.startsWith(p));
/** Population check used by freezePopulation: exactly one approved FEC of the fiscal chain. */
export function isFiscalPopulation(imports: ImportBatch[]) {
  return imports.filter(b => b.document.documentType === "fx_fec").length === 1 && imports.every(b => FISCAL_TYPES.includes(b.document.documentType));
}
/**
 * VAT population: one item per FEC entry (journal + number) carrying a VAT account line under the documented
 * default account map. The measure is the entry's signed VAT effect (collected minus deductible), in cents.
 */
export function vatPopulationItems(imports: ImportBatch[]) {
  const fec = imports.find(b => b.document.documentType === "fx_fec")!;
  const entries = new Map<string, { rowIds: string[]; vat: bigint; touched: boolean }>();
  for (const r of fec.rows) {
    if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
    const key = r.normalized.key, e = entries.get(key) ?? { rowIds: [], vat: 0n, touched: false }, account = r.original.CompteNum;
    e.rowIds.push(r.id);
    if (vatAccount(account)) {
      e.touched = true;
      const debit = BigInt(r.original.DebitCents), credit = BigInt(r.original.CreditCents);
      e.vat += DEFAULT_VAT_ACCOUNT_MAP.collectedVatPrefixes.some(p => account.startsWith(p)) ? credit - debit : -(debit - credit);
    }
    entries.set(key, e);
  }
  return [...entries.entries()].filter(([, e]) => e.touched).map(([key, e]) => ({ id: "E:" + key, rowIds: e.rowIds, amount: money(e.vat) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Entries outside the declarative period are excluded with their motive; the selection keeps every entry of the period. */
export function vatPopulationExclusions(imports: ImportBatch[], start: string, end: string) {
  const fec = imports.find(b => b.document.documentType === "fx_fec")!;
  const dates = new Map<string, string>();
  for (const r of fec.rows) if (r.normalized && !dates.has(r.normalized.key)) dates.set(r.normalized.key, r.normalized.date);
  return vatPopulationItems(imports).filter(i => { const d = dates.get(i.id.slice(2))!; return d < start || d > end; })
    .map(i => ({ id: i.id, reason: `Écriture datée du ${dates.get(i.id.slice(2))}, hors période déclarative ${start} – ${end}` }));
}
const resultAccount = (account: string) => account.startsWith("6") || account.startsWith("7");
/**
 * IS population: one item per FEC entry carrying a result line (classes 6 and 7 of the PCG, documented internal table).
 * The measure is the entry's signed effect on the accounting result (credit minus debit), in cents.
 */
export function citPopulationItems(imports: ImportBatch[]) {
  const fec = imports.find(b => b.document.documentType === "fx_fec")!;
  const entries = new Map<string, { rowIds: string[]; result: bigint; touched: boolean }>();
  for (const r of fec.rows) {
    if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
    const key = r.normalized.key, e = entries.get(key) ?? { rowIds: [], result: 0n, touched: false };
    e.rowIds.push(r.id);
    if (resultAccount(r.original.CompteNum)) { e.touched = true; e.result += BigInt(r.original.CreditCents) - BigInt(r.original.DebitCents); }
    entries.set(key, e);
  }
  return [...entries.entries()].filter(([, e]) => e.touched).map(([key, e]) => ({ id: "R:" + key, rowIds: e.rowIds, amount: money(e.result) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Result entries dated outside the exercise are excluded with their motive. */
export function citPopulationExclusions(imports: ImportBatch[], start: string, end: string) {
  const fec = imports.find(b => b.document.documentType === "fx_fec")!;
  const dates = new Map<string, string>();
  for (const r of fec.rows) if (r.normalized && !dates.has(r.normalized.key)) dates.set(r.normalized.key, r.normalized.date);
  return citPopulationItems(imports).filter(i => { const d = dates.get(i.id.slice(2))!; return d < start || d > end; })
    .map(i => ({ id: i.id, reason: `Écriture datée du ${dates.get(i.id.slice(2))}, hors exercice ${start} – ${end}` }));
}
