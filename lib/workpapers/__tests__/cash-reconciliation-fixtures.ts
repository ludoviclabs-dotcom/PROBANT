import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { previewImport, type ImportBatch } from "../imports";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import type { CashMapping, CashSourceType } from "../cash-sources";
import type { CashDraft } from "../cash-reconciliation";

/** Synthetic recipe only: bank 90 + receipts in transit 15 − outstanding payments 5 = GL 100. */
export const cashPeriod = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-02-28", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const cashScope: WorkpaperScope = { organizationId: "org-cash-synthetic", dossierId: "11111111-1111-4111-8111-111111111111", periodId: periodId(cashPeriod), mode: "real" };
export const cashPreparer: Principal = { id: "preparer-cash", grants: [{ scope: cashScope, permissions: ["read", "prepare", "download"] }] };
export const CASH_CSV: Record<CashSourceType, string> = {
  cash_ledger: ["gl;solde;date;banque;compte;devise;nature;libelle",
    "512100;100.00;2024-12-31;BNK-A;FR76-0001;EUR;banque;Banque A — compte courant",
    "512200;250.00;2024-12-31;BNK-B;US-0002;USD;banque;Banque B — compte USD",
    "530000;12.00;2024-12-31;CAISSE;SIEGE;EUR;caisse;Caisse du siège",
    "503000;500.00;2024-12-31;BNK-A;VMP-01;EUR;vmp;SICAV monétaire"].join("\n"),
  cash_statement: ["ref;solde;date;banque;compte;devise", "REL-A-1231;90.00;2024-12-31;BNK-A;FR76-0001;EUR"].join("\n"),
  cash_erb: ["ligne;montant;date;banque;compte;devise;nature;explication;piece",
    "ERB-BOOK;100.00;2024-12-31;BNK-A;FR76-0001;EUR;solde_comptable;;",
    "ERB-BANK;90.00;2024-12-31;BNK-A;FR76-0001;EUR;solde_banque;;",
    "R1;15.00;2024-12-30;BNK-A;FR76-0001;EUR;remise_non_creditee;Remise de chèques du 30/12 non créditée;BRD-1230",
    "P1;-5.00;2024-12-28;BNK-A;FR76-0001;EUR;paiement_non_debite;Chèque 1045 émis non débité;CHQ-1045"].join("\n"),
  cash_settlements: ["mvt;montant;date;banque;compte;devise;libelle;piece",
    "S1;15.00;2025-01-03;BNK-A;FR76-0001;EUR;Remise chèques BRD-1230;BRD-1230",
    "S2;-40.00;2025-01-10;BNK-A;FR76-0001;EUR;Prélèvement fournisseur;PRLV-77"].join("\n"),
  cash_support: ["piece_id;montant;date;banque;compte;devise;libelle", "COR-1045;-5.00;2025-01-20;BNK-A;FR76-0001;EUR;Annulation du chèque 1045 en comptabilité"].join("\n"),
};
const COLUMNS: Record<CashSourceType, { key: string; amount: string; date: string; cash: Partial<CashMapping["cash"]> }> = {
  cash_ledger: { key: "gl", amount: "solde", date: "date", cash: { basis: "ledger_closing", natureColumn: "nature", labelColumn: "libelle" } },
  cash_statement: { key: "ref", amount: "solde", date: "date", cash: { basis: "statement_closing" } },
  cash_erb: { key: "ligne", amount: "montant", date: "date", cash: { basis: "reconciliation_statement", kindColumn: "nature", explanationColumn: "explication", pieceColumn: "piece" } },
  cash_settlements: { key: "mvt", amount: "montant", date: "date", cash: { basis: "subsequent_statement", labelColumn: "libelle", pieceColumn: "piece" } },
  cash_support: { key: "piece_id", amount: "montant", date: "date", cash: { basis: "correction_support", labelColumn: "libelle" } },
};
export function cashMapping(type: CashSourceType, overrides: Partial<CashMapping> & { cashOverrides?: Partial<CashMapping["cash"]> } = {}): CashMapping {
  const c = COLUMNS[type], { cashOverrides, ...rest } = overrides;
  return { version: "cash-reconciliation-1", headerRow: 1, columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR",
    cash: { bankColumn: "banque", accountColumn: "compte", currencyColumn: "devise", ...c.cash, ...cashOverrides } as CashMapping["cash"], ...rest };
}
export async function previewCash(type: CashSourceType, text = CASH_CSV[type], mapping = cashMapping(type)) {
  return previewImport(new File([text], type + ".csv", { type: "text/csv" }), cashScope, mapping, cashPreparer, type, "cash.reconciliation");
}
/** Server-side approval shape (as reloaded from PostgreSQL); never produced by a browser. */
export function approve(batch: ImportBatch): ImportBatch {
  return { ...batch, approval: { actorId: cashPreparer.id, at: "2025-03-01T09:00:00Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } };
}
export async function cashSources(texts: Partial<Record<CashSourceType, string>> = {}, types: CashSourceType[] = ["cash_ledger", "cash_statement", "cash_erb", "cash_settlements", "cash_support"]) {
  return Promise.all(types.map(async type => approve(await previewCash(type, texts[type] ?? CASH_CSV[type]))));
}
export function settlementsImport(imports: ImportBatch[]) { return imports.find(b => b.document.documentType === "cash_settlements")!; }
export function rowOf(imports: ImportBatch[], type: CashSourceType, key: string) {
  const batch = imports.find(b => b.document.documentType === type)!, row = batch.rows.find(r => r.normalized?.key === key)!;
  return { importId: batch.id, rowId: row.id };
}
export function nominalDraft(imports: ImportBatch[], overrides: Partial<CashDraft> = {}): CashDraft {
  return { window: { startDate: "2025-01-01", endDate: "2025-02-28", coverage: "documented", note: "Relevés de janvier et février 2025 obtenus", evidenceImportIds: [settlementsImport(imports).id] },
    exclusions: [], allocations: [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }], corrections: [], ...overrides };
}
