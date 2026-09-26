import { money } from "@/lib/canonical-model/money";
import { sha256Hex, stableSha256 } from "@/lib/synthesis/canonical";
import type { ImportBatch } from "./imports";
import { assertScope, frozen, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

/** Fixed, generated fixture. No user file or real dossier can enter this browser port. */
export function syntheticImport(scope: WorkpaperScope, cycle = "default"): ImportBatch {
  if (scope.mode !== "demo" || scope.organizationId !== "SYNTHETIC-DEMO" || !/^SYN-[A-Za-z0-9-]+$/.test(scope.dossierId)) throw new Error("SYNTHETIC_SCOPE_REQUIRED");
  const payment = cycle === "fournisseurs";
  const date = payment ? "2024-07-10" : "2024-06-30";
  const amounts = payment ? [money(-12000n), money(-12000n)] : [money(10n), money(20n)];
  const csv = `Key;Amount;Date;Bank;Account;BankAccount\nSYN-1;${amounts[0].amount};${date};SYN-BANK;SYN-ACCOUNT;SYN-BANK-ACCOUNT\nSYN-2;${amounts[1].amount};${date};SYN-BANK;SYN-ACCOUNT;SYN-BANK-ACCOUNT`;
  const byteHash = sha256Hex(new TextEncoder().encode(csv));
  const documentId = `source-${stableSha256({ scope, byteHash, parser: "synthetic-fixture-1" })}`;
  const mapping = { version: "1", headerRow: 1, columns: { key: "Key", amount: "Amount", date: "Date" }, delimiter: ";" as const, decimal: "." as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
  const mappingHash = stableSha256(mapping);
  const id = `import-${stableSha256({ scope, byteHash, mappingHash, parser: "synthetic-fixture-1" })}`;
  const document = { id: documentId, logicalId: "SYNTHETIC-ONLY.csv", scope, fileName: "SYNTHETIC-ONLY.csv", format: "csv" as const, documentType: "structured_table", byteHash, storageRef: documentId, sizeBytes: new TextEncoder().encode(csv).length, parserVersion: "synthetic-fixture-1" };
  const rows = ([ ["SYN-1", amounts[0]], ["SYN-2", amounts[1]] ] as const).map(([key, amount], index) => ({
    id: `row-${stableSha256({ documentId, row: index + 2 })}`, documentVersionId: documentId, scope,
    locator: { row: index + 2 }, original: { Key: key, Amount: amount.amount, Date: date, Bank: "SYN-BANK", Account: "SYN-ACCOUNT", BankAccount: "SYN-BANK-ACCOUNT" },
    normalized: { key, amount, date }, errors: [],
  }));
  const total = payment ? money(-24000n) : money(30n);
  const report = { status: "accepted" as const, acceptedRows: 2, rejectedRows: 0, duplicateRows: 0, sourceTotal: { kind: "known" as const, value: total }, normalizedTotal: total, warnings: [], blocking: [], calculationAllowed: false };
  const base = { id, scope, document, mapping, mappingHash, rows, report };
  const previewHash = stableSha256(base);
  return frozen({ ...base, previewHash, approval: { actorId: "SYN-PREPARER", at: "2024-08-01T00:00:00Z", previewHash }, report: { ...report, calculationAllowed: true } });
}

export class SyntheticImportRepository {
  constructor(private readonly batch: ImportBatch) {}
  get(scope: WorkpaperScope, id: string, principal: Principal): ImportBatch {
    authorize(principal, scope, "read"); assertScope(scope, this.batch.scope);
    if (id !== this.batch.id) throw new Error("IMPORT_NOT_FOUND");
    return frozen(this.batch);
  }
  download(scope: WorkpaperScope, id: string, principal: Principal): Uint8Array | null {
    authorize(principal, scope, "download"); assertScope(scope, this.batch.scope);
    if (id !== this.batch.document.id) return null;
    const text = ["Key;Amount;Date;Bank;Account;BankAccount", ...this.batch.rows.map((row) => ["Key", "Amount", "Date", "Bank", "Account", "BankAccount"].map((key) => row.original[key]).join(";"))].join("\n");
    const bytes = new TextEncoder().encode(text);
    if (sha256Hex(bytes) !== this.batch.document.byteHash) throw new Error("SYNTHETIC_SOURCE_INTEGRITY_INVALID");
    return bytes;
  }
}
