import { previewImport, MemoryImportRepository } from "../imports";
import { amountFromImport } from "../cycle-context";
import type { CashInput } from "../cash";
import { preparer, scope, period } from "./fixtures";
export async function cashFixture(movements = false, ledger = "430.30", bank = "435.30") {
  const text = `Key;Amount;Date\nledger;${ledger};2024-06-30\nstatement;${bank};2024-06-30\nerbBook;${ledger};2024-06-30\nerbBank;${bank};2024-06-30${movements ? "\nreceipt;100.00;2024-06-29\npayment;-100.00;2024-06-29" : ""}`;
  const file = new File([text.split("\n").map((line, i) => `${line};${i === 0 ? "Bank;Account" : "SYNTHETIC-A;ACCOUNT-001"}`).join("\n")], "CASH-SYNTHETIC-NOT-GUIDE.csv");
  const imports = new MemoryImportRepository();
  const preview = await previewImport(file, scope, { version: "cash-fixture-1", headerRow: 1, columns: { key: "Key", amount: "Amount", date: "Date" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR" }, preparer, "cash_table");
  const batch = await imports.approveAndSave(preview, file, preparer, preview.previewHash, "2024-07-31T12:00:00Z");
  const get = (key: string) => amountFromImport(batch, batch.rows.find((r) => r.normalized?.key === key)!.id, preparer);
  const input: CashInput = { context: { scope, period, purpose: "synthetic_technical" }, account: { id: "BANK-A-001", bankId: "SYNTHETIC-A", bankLabel: "Banque synthétique A", accountReference: "ACCOUNT-001", aliases: [], currency: "EUR" },
    convention: { version: "1", label: "positive_increases_book_balance", validatedBy: preparer.id, bankColumn: "Bank", accountColumn: "Account" }, ledger: get("ledger"), statement: get("statement"), erbBook: get("erbBook"), erbBank: get("erbBank"),
    items: movements ? [{ id: "R1", accountId: "BANK-A-001", type: "receipt_in_transit", value: get("receipt"), explained: false, explanation: "" }, { id: "P1", accountId: "BANK-A-001", type: "outstanding_payment", value: get("payment"), explained: false, explanation: "" }] : [] };
  return { input, batch, imports };
}
