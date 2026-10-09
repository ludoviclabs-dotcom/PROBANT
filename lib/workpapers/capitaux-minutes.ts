import { PDFDocument } from "pdf-lib";
import { money } from "@/lib/canonical-model/money";
import { sha256 } from "@/lib/evidence/hash";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { equityMinutesFormSchema, equityMinutesMapping, EQ_MINUTES_MAX_PAGES, type EquityMinutesForm } from "./capitaux-sources";
import type { ImportBatch, ImportReport } from "./imports";
import { frozen, scopeSchema, type SourceDocumentVersion, type SourceRow, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export const EQ_MINUTES_PARSER_VERSION = "equity-minutes-pdf-1.0.0";
const MAX_BYTES = 3 * 1024 * 1024;
/**
 * A PV or act is kept as a versioned PDF: the server checks its signature, refuses encrypted files and counts its pages.
 * No text is extracted as a financial value; each page is a row so a decision can cite « pièce, version, page ».
 */
export async function previewMinutes(file: File, scope: WorkpaperScope, form: EquityMinutesForm, principal: Principal): Promise<ImportBatch> {
  authorize(principal, scope, "prepare"); scopeSchema.parse(scope);
  const declared = equityMinutesFormSchema.parse(form);
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && !["application/pdf", "application/octet-stream"].includes(file.type))) throw new Error("EQ_PDF_FORMAT_INVALID");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("UPLOAD_SIZE_INVALID");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("EQ_PDF_SIGNATURE_INVALID");
  let pageCount: number;
  // A plain Uint8Array copy: pdf-lib checks the realm of its input, which a Node Buffer does not satisfy in every runtime.
  try { pageCount = (await PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false })).getPageCount(); }
  catch (error) { throw new Error(error instanceof Error && /encrypt/i.test(error.name + error.message) ? "EQ_PDF_ENCRYPTED" : "EQ_PDF_INVALID"); }
  if (pageCount < 1 || pageCount > EQ_MINUTES_MAX_PAGES) throw new Error("EQ_MINUTES_PAGES_INVALID");
  const mapping = equityMinutesMapping(declared), byteHash = sha256(bytes), mappingHash = stableSha256(mapping), logicalId = "eq_minutes:" + declared.pieceRef;
  const documentId = `source-${stableSha256({ scope, byteHash, documentType: "eq_minutes", logicalId, parser: EQ_MINUTES_PARSER_VERSION })}`;
  const document: SourceDocumentVersion = { id: documentId, logicalId, scope, fileName: file.name, format: "pdf", documentType: "eq_minutes", byteHash, storageRef: documentId, sizeBytes: bytes.length, parserVersion: EQ_MINUTES_PARSER_VERSION };
  const rows: SourceRow[] = Array.from({ length: pageCount }, (_, i) => ({ id: `row-${stableSha256({ documentId, page: i + 1 })}`, documentVersionId: documentId, scope, locator: { page: i + 1 }, original: { page: String(i + 1) }, errors: [] }));
  const report: ImportReport = { status: "accepted_with_warnings", acceptedRows: pageCount, rejectedRows: 0, duplicateRows: 0, sourceTotal: { kind: "not_applicable", reason: "Document PDF : aucun montant lu" }, normalizedTotal: money(0n),
    warnings: ["PDF_TEXT_NOT_EXTRACTED: lecture humaine requise à la page citée"], blocking: [], calculationAllowed: false };
  const id = `import-${stableSha256({ scope, byteHash, documentType: "eq_minutes", mappingHash, parser: EQ_MINUTES_PARSER_VERSION })}`;
  const base = { id, scope, document, mapping, mappingHash, rows, report };
  return frozen({ ...base, previewHash: stableSha256(base) });
}
