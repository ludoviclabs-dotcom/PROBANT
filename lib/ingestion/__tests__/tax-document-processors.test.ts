import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  createIngestionJob,
  getDocumentProcessorRegistry,
  processIngestionJob,
  type TaxDocumentProcessingResult,
  validateIncomingFile,
} from "@/lib/ingestion";

function taxJson(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "probant-tax-document-1",
    documentType: "declaration_2065",
    formNumber: "2065-SD",
    formVintage: 2026,
    siren: "123456789",
    period: {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      fiscalYear: 2026,
    },
    fields: [{ code: "C.RESULTAT_FISCAL_BENEFICE", value: "1 234,56" }],
    ...overrides,
  };
}

async function processJson(
  payload: Record<string, unknown>,
  metadata: Parameters<typeof createIngestionJob>[0]["metadata"] = {},
) {
  const file = new File([JSON.stringify(payload)], "declaration-2065.json", {
    type: "application/json",
  });
  const { job, validation } = await createIngestionJob({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    file,
    documentType: "declaration_2065",
    metadata,
  });
  expect(validation.ok).toBe(true);
  return {
    job,
    result: await processIngestionJob(job) as TaxDocumentProcessingResult,
  };
}

describe("DocumentProcessorRegistry", () => {
  it("registers one processor per initial document type in the required priority order", () => {
    expect(getDocumentProcessorRegistry().list().map((processor) => processor.documentType)).toEqual([
      "fec",
      "liasse_2050_2059",
      "liasse_2033",
      "declaration_2065",
      "declaration_tva_ca3",
      "declaration_tva_ca12",
      "balance",
      "tax_notice",
      "payroll_summary",
    ]);
  });

  it("keeps the existing FEC processor as priority one", () => {
    expect(getDocumentProcessorRegistry().list()[0]).toMatchObject({
      documentType: "fec",
      processorId: "fec-existing-pipeline",
      priority: 1,
    });
  });
});

describe("tax document processing", () => {
  it("routes a self-describing PROBANT JSON without external type metadata", async () => {
    const file = new File([JSON.stringify(taxJson())], "export-fiscal.json", {
      type: "application/json",
    });
    const { job, validation } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
    });
    expect(validation.documentType).toBe("declaration_2065");
    expect(job.documentType).toBe("declaration_2065");
  });

  it("accepts an exact form vintage and retains the complete field trace", async () => {
    const { job, result } = await processJson(taxJson());
    expect(result.disposition).toBe("completed");
    expect(result.snapshot).toMatchObject({
      formNumber: "2065-SD",
      formVintage: 2026,
      status: "active",
    });
    expect(result.fieldTraces[0]).toMatchObject({
      documentId: job.documentId,
      box: "C.RESULTAT_FISCAL_BENEFICE",
      rawValue: "1 234,56",
      normalizedValue: 123_456,
      parserVersion: "tax-document-processor-1.0.0",
      confidence: 1,
      processingStatus: "accepted",
      usableForAutomatedCalculation: true,
    });
    expect(result.fieldTraces[0].documentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.calculationExecuted).toBe(false);
  });

  it("routes an unknown form vintage to manual review without inventing a mapping", async () => {
    const { result } = await processJson(taxJson({ formVintage: 2025 }));
    expect(result.disposition).toBe("needs_manual_review");
    expect(result.warnings).toContain("FORM_VINTAGE_UNKNOWN");
    expect(result.fieldTraces[0]).toMatchObject({
      processingStatus: "needs_manual_review",
      usableForAutomatedCalculation: false,
    });
  });

  it("retains an unknown box only as a non-usable analytical signal", async () => {
    const { result } = await processJson(taxJson({
      fields: [{ code: "CASE_INCONNUE", value: "100,00" }],
    }));
    expect(result.fieldTraces[0].warnings).toContain("UNKNOWN_FORM_BOX");
    expect(result.fieldTraces[0].usableForAutomatedCalculation).toBe(false);
  });

  it("retains duplicate boxes and blocks every duplicate from automation", async () => {
    const { result } = await processJson(taxJson({
      fields: [
        { code: "C.RESULTAT_FISCAL_BENEFICE", value: "100,00" },
        { code: "C.RESULTAT_FISCAL_BENEFICE", value: "200,00" },
      ],
    }));
    expect(result.fieldTraces).toHaveLength(2);
    expect(result.fieldTraces.every((field) =>
      field.warnings.includes("DUPLICATE_FORM_BOX") && !field.usableForAutomatedCalculation,
    )).toBe(true);
  });

  it("parses a French CSV amount into integer cents", async () => {
    const csv = [
      "documentType;formNumber;formVintage;siren;periodStart;periodEnd;fiscalYear;fieldCode;rawValue",
      "declaration_2065;2065-SD;2026;123456789;2026-01-01;2026-12-31;2026;C.RESULTAT_FISCAL_BENEFICE;1 234,56",
    ].join("\n");
    const file = new File([csv], "declaration-2065.csv", { type: "text/csv" });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
      documentType: "declaration_2065",
    });
    const result = await processIngestionJob(job) as TaxDocumentProcessingResult;
    expect(result.fieldTraces[0].normalizedValue).toBe(123_456);
    expect(result.fieldTraces[0].cell).toBe("I2");
  });

  it("detects an XLSX formula and never uses its cached result", async () => {
    const { default: ExcelJS } = await import("exceljs/dist/exceljs.min.js");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("2065");
    sheet.addRow([
      "documentType", "formNumber", "formVintage", "siren", "periodStart",
      "periodEnd", "fiscalYear", "fieldCode", "rawValue",
    ]);
    sheet.addRow([
      "declaration_2065", "2065-SD", 2026, "123456789", "2026-01-01",
      "2026-12-31", 2026, "C.RESULTAT_FISCAL_BENEFICE", { formula: "100+200", result: 300 },
    ]);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = new File([bytes], "declaration-2065.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
      documentType: "declaration_2065",
    });
    const result = await processIngestionJob(job) as TaxDocumentProcessingResult;
    expect(result.fieldTraces[0]).toMatchObject({
      sheet: "2065",
      cell: "I2",
      rawValue: "=100+200",
      normalizedValue: null,
      processingStatus: "needs_manual_review",
      usableForAutomatedCalculation: false,
    });
    expect(result.fieldTraces[0].warnings).toContain("SPREADSHEET_FORMULA_BLOCKED");
  });

  it("treats a PDF without a text layer as manual review and never runs OCR", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const pdfBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const file = new File([pdfBuffer], "liasse-2058.pdf", { type: "application/pdf" });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
      documentType: "liasse_2050_2059",
      metadata: {
        formNumber: "2058-A-SD",
        formVintage: 2026,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        fiscalYear: 2026,
      },
    });
    const result = await processIngestionJob(job) as TaxDocumentProcessingResult;
    expect(result.disposition).toBe("needs_manual_review");
    expect(result.warnings).toContain("PDF_TEXT_LAYER_MISSING");
    expect(result.fieldTraces).toEqual([]);
    expect(result.calculationExecuted).toBe(false);
  });

  it("normalizes a native negative amount explicitly and blocks automation pending review", async () => {
    const { result } = await processJson(taxJson({
      fields: [{ code: "C.RESULTAT_FISCAL_BENEFICE", value: "-1 234,56" }],
    }));
    expect(result.fieldTraces[0].normalizedValue).toBe(123_456);
    expect(result.snapshot?.fields[0].sign).toBe("negative");
    expect(result.fieldTraces[0].warnings).toContain("DECLARATION_AMOUNT_SIGN_NORMALIZED");
    expect(result.fieldTraces[0].warnings).toContain("NEGATIVE_AMOUNT_UNEXPECTED");
    expect(result.fieldTraces[0].processingStatus).toBe("needs_manual_review");
    expect(result.fieldTraces[0].usableForAutomatedCalculation).toBe(false);
  });

  it("flags a document from another SIREN", async () => {
    const { result } = await processJson(taxJson(), { expectedSiren: "987654321" });
    expect(result.warnings).toContain("SIREN_MISMATCH");
    expect(result.snapshot?.status).toBe("review_required");
  });

  it("does not create a canonical period from incoherent exercise dates", async () => {
    const { result } = await processJson(taxJson({
      period: { startDate: "2026-12-31", endDate: "2026-01-01", fiscalYear: 2026 },
    }));
    expect(result.disposition).toBe("needs_manual_review");
    expect(result.warnings).toContain("TAX_PERIOD_INCOHERENT");
    expect(result.period).toBeNull();
    expect(result.snapshot).toBeNull();
  });

  it("rejects an oversized file before storage", () => {
    const validation = validateIncomingFile({
      fileName: "declaration-2065.json",
      mimeType: "application/json",
      sizeBytes: 101,
      maxBytes: 100,
      requestedDocumentType: "declaration_2065",
    });
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "FILE_TOO_LARGE")).toBe(true);
  });

  it("returns the same immutable result on an idempotent retry", async () => {
    const file = new File([JSON.stringify(taxJson())], "declaration-2065.json", {
      type: "application/json",
    });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
      documentType: "declaration_2065",
    });
    const first = await processIngestionJob(job) as TaxDocumentProcessingResult;
    const second = await processIngestionJob(job) as TaxDocumentProcessingResult;
    expect(second).toBe(first);
    expect(second.snapshot?.snapshotHash).toBe(first.snapshot?.snapshotHash);
  });
});

