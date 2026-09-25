import { expect, it } from "vitest";
import { readStructuredTaxDocument } from "../tax-document-input";

it("refuse une archive XLSX pathologique avant décompression par ExcelJS", async () => {
  const buffer = new ArrayBuffer(68);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 100_000, true);
  view.setUint32(46, 0x06054b50, true);
  view.setUint16(56, 1, true);
  view.setUint32(62, 0, true);
  const file = new File([buffer], "synthetic-bomb.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await expect(readStructuredTaxDocument(file, "xlsx")).rejects.toThrow("XLSX_COMPRESSION_RATIO_EXCEEDED");
});
