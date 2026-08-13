import { describe, expect, it } from "vitest";
import { detectCsvDelimiter } from "../read-csv-browser";
import {
  inspectXlsxContainer,
  XlsxSafetyError,
  type XlsxSafetyLimits,
} from "../xlsx-safety";

const limits: XlsxSafetyLimits = {
  maxExpandedBytes: 1_000_000,
  maxCompressionRatio: 10,
  maxZipEntries: 100,
  maxRows: 1_000,
  maxCellBytes: 1_000,
};

function pathologicalZip(): ArrayBuffer {
  const buffer = new ArrayBuffer(68);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 100_000, true);
  view.setUint32(46, 0x06054b50, true);
  view.setUint16(56, 1, true);
  view.setUint32(62, 0, true);
  return buffer;
}

describe("fixtures tabulaires adverses", () => {
  it("rejette un XLSX malformé", () => {
    expect(captureCode(() => inspectXlsxContainer(new ArrayBuffer(30), limits))).toBe(
      "XLSX_INVALID_ZIP",
    );
  });

  it("rejette un XLSX à compression pathologique avant décompression", () => {
    expect(captureCode(() => inspectXlsxContainer(pathologicalZip(), limits))).toBe(
      "XLSX_COMPRESSION_RATIO_EXCEEDED",
    );
  });

  it("rejette un CSV ambigu", () => {
    expect(() => detectCsvDelimiter("a,b;c\n1,2;3\n")).toThrow("CSV_SEPARATOR_AMBIGUOUS");
  });
});

function captureCode(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    return error instanceof XlsxSafetyError ? error.code : "UNKNOWN";
  }
  return "NO_ERROR";
}
