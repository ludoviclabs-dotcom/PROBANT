import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { previewImport, MemoryImportRepository, validateXlsxArchive, type ImportMapping } from "../imports";
import { scope, preparer } from "./fixtures";
export const mapping: ImportMapping = { version: "1", headerRow: 1, columns: { key: "Compte", amount: "Montant", date: "Date" }, delimiter: ";", decimal: ",", dateFormat: "DD/MM/YYYY", sign: 1, currency: "EUR" };
export const csv = () => new File(['Compte;Montant;Date\n001;0,10;30/06/2024\n002;0,20;30/06/2024'], "fixture.csv", { type: "text/csv" });
describe("CORE-202 versioned imports", () => {
  it("preserves keys, exact amounts, raw values and source line coordinates", async () => {
    const b = await previewImport(csv(), scope, mapping, preparer);
    expect(b.report.normalizedTotal.amount).toBe("0.30"); expect(b.rows[0].normalized?.key).toBe("001");
    expect(b.rows[0].original.Montant).toBe("0,10"); expect(b.rows[0].locator.row).toBe(2);
    expect(b.report.calculationAllowed).toBe(false);
    const repo = new MemoryImportRepository();
    const results = await Promise.all([1, 2].map(() => repo.approveAndSave(b, csv(), preparer, b.previewHash, "2024-08-01T00:00:00Z")));
    expect(results[0]).toEqual(results[1]); expect(results[0].report.calculationAllowed).toBe(true);
    expect(new TextDecoder().decode(repo.download(scope, b.document.id, preparer)!)).toContain("001;0,10");
  });
  it("different mapping and scope produce separate versions and rights", async () => {
    const a = await previewImport(csv(), scope, mapping, preparer);
    const b = await previewImport(csv(), scope, { ...mapping, version: "2", sign: -1 }, preparer);
    expect(a.id).not.toBe(b.id); expect(b.report.normalizedTotal.amount).toBe("-0.30");
    const other = { ...scope, dossierId: "D2" }, actor = { ...preparer, grants: [{ ...preparer.grants[0], scope: other }] };
    const c = await previewImport(csv(), other, mapping, actor); expect(c.document.id).not.toBe(a.document.id);
    const repo = new MemoryImportRepository(); await repo.approveAndSave(a, csv(), preparer, a.previewHash, "2024-08-01T00:00:00Z");
    expect(() => repo.get(other, a.id, actor)).toThrow("SCOPE_MISMATCH");
    expect(() => repo.download(other, a.document.id, actor)).toThrow("SCOPE_MISMATCH");
  });
  it("shows rejected rows and total inconsistencies; never approves them", async () => {
    const file = new File(["Compte;Montant;Date\n001;2,20;30/02/2024\n002;absent;30/06/2024"], "bad.csv");
    const b = await previewImport(file, scope, { ...mapping, expectedTotal: { amount: "3.00", currency: "EUR" } }, preparer);
    expect(b.report.rejectedRows).toBe(2); expect(b.report.status).toBe("rejected");
    expect(b.report.sourceTotal.kind).toBe("unknown"); expect(b.report.blocking).toContain("SOURCE_TOTAL_MISMATCH");
    const retained = new MemoryImportRepository(); await retained.stagePreview(b, file, preparer);
    expect(retained.get(scope, b.id, preparer).report.rejectedRows).toBe(2);
    expect(new TextDecoder().decode(retained.download(scope, b.document.id, preparer)!)).toContain("absent");
    await expect(new MemoryImportRepository().approveAndSave(b, file, preparer, b.previewHash, "2024-08-01T00:00:00Z")).rejects.toThrow();
    await expect(previewImport(csv(), scope, { ...mapping, columns: { ...mapping.columns, key: "missing" } }, preparer)).rejects.toThrow("MAPPING_COLUMNS_INVALID");
  });
  it("supports quoted multiline CSV without losing physical row numbers", async () => {
    const b = await previewImport(new File(['Compte;Montant;Date\n"00\n1";1,00;30/06/2024\n002;1,00;30/06/2024'], "quoted.csv"), scope, mapping, preparer);
    expect(b.rows.map((r) => r.locator.row)).toEqual([2, 4]);
    await expect(previewImport(new File(['Compte;Montant;Date\n"unclosed'], "bad.csv"), scope, mapping, preparer)).rejects.toThrow("CSV_UNCLOSED_QUOTE");
  });
  it("requires explicit XLSX sheet, preserves formulas and refuses their cached value", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("NotSelected").addRow(["other"]);
    const sheet = workbook.addWorksheet("Selected"); sheet.addRow(["Compte", "Montant", "Date"]);
    sheet.addRow(["001", 0.3, "30/06/2024"]); sheet.addRow(["002", { formula: "1+1", result: 2 }, "30/06/2024"]);
    const file = new File([await workbook.xlsx.writeBuffer()], "fixture.xlsx");
    await expect(previewImport(file, scope, mapping, preparer)).rejects.toThrow("EXPLICIT_SHEET_REQUIRED");
    const b = await previewImport(file, scope, { ...mapping, sheet: "Selected" }, preparer);
    expect(b.rows[0].locator).toEqual({ sheet: "Selected", row: 2 }); expect(b.rows[1].errors).toContain("FORMULA_UNVERIFIED");
    expect(b.rows[1].original.Montant).toContain('"formula":"1+1"'); expect(b.report.calculationAllowed).toBe(false);
  });
  it("rejects macros, MIME mismatch, overlarge archives and stale previews", async () => {
    await expect(previewImport(new File(["x"], "macros.xlsm"), scope, mapping, preparer)).rejects.toThrow("FILE_FORMAT_UNSUPPORTED");
    await expect(previewImport(new File(["x"], "x.csv", { type: "application/pdf" }), scope, mapping, preparer)).rejects.toThrow("MIME_MISMATCH");
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("S").addRow(["test"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const directory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bytes.writeUInt32LE(0x7fffffff, directory + 24);
    expect(() => validateXlsxArchive(bytes)).toThrow("ZIP_EXPANSION_LIMIT");
    const b = await previewImport(csv(), scope, mapping, preparer);
    await expect(new MemoryImportRepository().approveAndSave(b, csv(), preparer, "stale", "2024-08-01T00:00:00Z")).rejects.toThrow("STALE");
  });
});
