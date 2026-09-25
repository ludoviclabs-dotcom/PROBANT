import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { sha256 } from "@/lib/evidence/hash";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { cents, legacyCents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { isCivilDate } from "@/lib/canonical-model/period";
import { assertScope, frozen, scopeSchema, type SourceDocumentVersion, type SourceRow, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export const IMPORT_PARSER_VERSION = "workpaper-tabular-1.0.0";
export interface ImportMapping {
  version: string; sheet?: string; headerRow: number;
  columns: { key: string; amount: string; date: string };
  delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY";
  sign: 1 | -1; currency: "EUR"; expectedTotal?: Money;
}
export interface ImportReport {
  status: "accepted" | "accepted_with_warnings" | "rejected";
  acceptedRows: number; rejectedRows: number; duplicateRows: number;
  sourceTotal: KnownAmount; normalizedTotal: Money; warnings: string[]; blocking: string[];
  calculationAllowed: boolean;
}
export interface ImportBatch {
  id: string; scope: WorkpaperScope; document: SourceDocumentVersion; mapping: ImportMapping;
  mappingHash: string; rows: SourceRow[]; report: ImportReport; previewHash: string;
  approval?: { actorId: string; at: string; previewHash: string };
}
const MAX_BYTES = 10 * 1024 * 1024, MAX_EXPANDED = 40 * 1024 * 1024, MAX_ROWS = 50_000, MAX_COLUMNS = 100;

/** Bounded ZIP inflation before handing the workbook to the existing ExcelJS dependency. */
export function validateXlsxArchive(bytes: Buffer): void {
  if (bytes.length > MAX_BYTES || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("XLSX_SIGNATURE_OR_SIZE_INVALID");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error("ZIP_FORMAT_UNSUPPORTED");
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16), total = 0;
  if (count > 2000 || cursor >= end) throw new Error("ZIP_DIRECTORY_LIMIT");
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP_DIRECTORY_INVALID");
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), offset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    if (flags & 1 || ![0, 8].includes(method) || /vbaProject|externalLinks|\.\.\//i.test(name)) throw new Error("XLSX_ACTIVE_CONTENT_REFUSED");
    if (expanded > MAX_EXPANDED || expanded > Math.max(1, compressed) * 200 || total + expanded > MAX_EXPANDED) throw new Error("ZIP_EXPANSION_LIMIT");
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error("ZIP_LOCAL_HEADER_INVALID");
    const dataStart = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (dataStart + compressed > cursor) throw new Error("ZIP_DATA_INVALID");
    const raw = bytes.subarray(dataStart, dataStart + compressed);
    const inflated = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: MAX_EXPANDED - total });
    if (inflated.length !== expanded) throw new Error("ZIP_SIZE_MISMATCH");
    total += inflated.length;
    cursor += 46 + length + extra + comment;
  }
}
interface RawRow { number: number; values: string[]; numeric: number[]; formulas: number[] }
/** Explicit delimiter, RFC-style quoted fields, and physical source-line locators. */
function csvRows(text: string, delimiter: string): RawRow[] {
  const rows: RawRow[] = []; let values: string[] = [], cell = "", quoted = false, afterQuote = false, line = 1, start = 1;
  const finish = () => { values.push(cell); if (values.length > MAX_COLUMNS) throw new Error("COLUMN_LIMIT"); rows.push({ number: start, values, numeric: [], formulas: [] }); values = []; cell = ""; afterQuote = false; if (rows.length > MAX_ROWS) throw new Error("ROW_LIMIT"); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } } else { cell += c; if (c === "\n") line++; } continue; }
    if (c === '"') { if (cell || afterQuote) throw new Error("CSV_QUOTES_INVALID"); quoted = true; }
    else if (c === delimiter) { values.push(cell); cell = ""; afterQuote = false; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; finish(); line++; start = line; }
    else { if (afterQuote) throw new Error("CSV_TRAILING_QUOTE_DATA"); cell += c; }
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  if (cell || values.length || afterQuote) finish();
  return rows;
}
async function readRows(file: File, bytes: Buffer, mapping: ImportMapping): Promise<{ rows: RawRow[]; sheets: string[] }> {
  if (file.name.toLowerCase().endsWith(".csv")) return { rows: csvRows(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), mapping.delimiter), sheets: [] };
  validateXlsxArchive(bytes);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  if (workbook.worksheets.length > 20) throw new Error("SHEET_LIMIT");
  const sheet = workbook.worksheets.find((s) => s.name === mapping.sheet);
  if (!sheet) throw new Error("EXPLICIT_SHEET_REQUIRED");
  if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS || sheet.rowCount * sheet.columnCount > 1_000_000) throw new Error("WORKSHEET_LIMIT");
  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const values: string[] = [], numeric: number[] = [], formulas: number[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) {
      const value = row.getCell(i).value;
      if (typeof value === "number") numeric.push(i - 1);
      if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) formulas.push(i - 1);
      values.push(value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    rows.push({ number, values, numeric, formulas });
  });
  return { rows, sheets: workbook.worksheets.map((s) => s.name) };
}
function parseAmount(raw: string, mapping: ImportMapping, numeric: boolean): Money {
  if (numeric) return money(legacyCents(Number(raw)) * BigInt(mapping.sign));
  const s = raw.trim();
  const pattern = mapping.decimal === "," ? /^-?\d+(,\d{1,2})?$/ : /^-?\d+(\.\d{1,2})?$/;
  if (!pattern.test(s)) throw new Error("AMOUNT_FORMAT_INVALID");
  const [whole, decimal = ""] = s.replace(",", ".").split(".");
  const n = BigInt(`${whole}${decimal.padEnd(2, "0")}`);
  return money(n * BigInt(mapping.sign));
}
function parseDate(raw: string, mapping: ImportMapping): string {
  const s = raw.trim();
  const date = mapping.dateFormat === "ISO" ? s : /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : "";
  if (!isCivilDate(date)) throw new Error("DATE_FORMAT_INVALID"); return date;
}
export async function previewImport(file: File, scope: WorkpaperScope, mapping: ImportMapping, principal: Principal, documentType = "structured_table"): Promise<ImportBatch> {
  authorize(principal, scope, "prepare"); scopeSchema.parse(scope);
  if (scope.mode !== "demo") throw new Error("REAL_IMPORT_STORAGE_DISABLED");
  if (file.size > MAX_BYTES || file.size === 0) throw new Error("UPLOAD_SIZE_INVALID");
  const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
  if (!format) throw new Error("FILE_FORMAT_UNSUPPORTED");
  if (file.type && !(format === "csv" ? ["text/csv", "text/plain", "application/octet-stream"] : ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]).includes(file.type)) throw new Error("MIME_MISMATCH");
  if (!mapping.version || !Number.isSafeInteger(mapping.headerRow) || mapping.headerRow < 1 || ![";", ",", "\t"].includes(mapping.delimiter) || ![",", "."].includes(mapping.decimal) || !["ISO", "DD/MM/YYYY"].includes(mapping.dateFormat) || ![1, -1].includes(mapping.sign) || mapping.currency !== "EUR") throw new Error("MAPPING_INVALID");
  const bytes = Buffer.from(await file.arrayBuffer()), byteHash = sha256(bytes), mappingHash = stableSha256(mapping);
  const documentId = `source-${stableSha256({ scope, byteHash, parser: IMPORT_PARSER_VERSION })}`;
  const document: SourceDocumentVersion = { id: documentId, logicalId: file.name, scope, fileName: file.name, format, documentType, byteHash, storageRef: documentId, sizeBytes: bytes.length, parserVersion: IMPORT_PARSER_VERSION };
  const id = `import-${stableSha256({ scope, byteHash, mappingHash, parser: IMPORT_PARSER_VERSION })}`;
  const { rows: raw, sheets } = await readRows(file, bytes, mapping);
  const header = raw.find((r) => r.number === mapping.headerRow)?.values;
  if (!header || new Set(header).size !== header.length || Object.values(mapping.columns).some((c) => !c || !header.includes(c)) || new Set(Object.values(mapping.columns)).size !== 3) throw new Error("MAPPING_COLUMNS_INVALID");
  const keyIndex = header.indexOf(mapping.columns.key), amountIndex = header.indexOf(mapping.columns.amount), dateIndex = header.indexOf(mapping.columns.date);
  let originalTotal = 0n, acceptedTotal = 0n, amountUnknown = false, duplicates = 0;
  const seen = new Set<string>();
  const rows: SourceRow[] = raw.filter((r) => r.number > mapping.headerRow && r.values.some((v) => v !== "")).map((r) => {
    const errors: string[] = [], original = Object.fromEntries(r.values.map((v, i) => [header[i] ?? `extra-${i + 1}`, v]));
    const rowHash = stableSha256(original); if (seen.has(rowHash)) duplicates++; seen.add(rowHash);
    if (r.formulas.length) errors.push("FORMULA_UNVERIFIED");
    if (r.values.length !== header.length) errors.push("COLUMN_COUNT_MISMATCH");
    if (!r.values[keyIndex]?.trim() || r.numeric.includes(keyIndex)) errors.push("STRING_KEY_REQUIRED");
    let amount: Money | undefined, date: string | undefined;
    try { amount = parseAmount(r.values[amountIndex] ?? "", mapping, r.numeric.includes(amountIndex)); originalTotal += cents(amount); } catch { amountUnknown = true; errors.push("AMOUNT_FORMAT_INVALID"); }
    try { date = parseDate(r.values[dateIndex] ?? "", mapping); } catch { errors.push("DATE_FORMAT_INVALID"); }
    if (!errors.length) acceptedTotal += cents(amount!);
    return { id: `row-${stableSha256({ documentId, sheet: mapping.sheet, row: r.number })}`, documentVersionId: documentId, scope, locator: { sheet: mapping.sheet, row: r.number }, original, normalized: errors.length ? undefined : { key: r.values[keyIndex], amount: amount!, date: date! }, errors };
  });
  const blocking = rows.some((r) => r.errors.length) ? ["REJECTED_ROWS_REQUIRE_CORRECTION"] : [];
  if (!rows.length) blocking.push("EMPTY_POPULATION");
  if (mapping.expectedTotal && (amountUnknown || cents(mapping.expectedTotal) !== originalTotal)) blocking.push("SOURCE_TOTAL_MISMATCH");
  const warnings = [...(duplicates ? ["DUPLICATE_ROWS_RETAINED"] : []), ...(sheets.length > 1 ? [`MULTI_SHEET_EXPLICIT_SELECTION:${mapping.sheet}; excluded=${sheets.filter((s) => s !== mapping.sheet).join(",")}`] : [])];
  const report: ImportReport = { status: blocking.length ? "rejected" : warnings.length ? "accepted_with_warnings" : "accepted", acceptedRows: rows.filter((r) => !r.errors.length).length, rejectedRows: rows.filter((r) => r.errors.length).length, duplicateRows: duplicates, sourceTotal: amountUnknown ? { kind: "unknown", reason: "Montants sources illisibles" } : { kind: "known", value: money(originalTotal) }, normalizedTotal: money(acceptedTotal), warnings, blocking, calculationAllowed: false };
  const base = { id, scope, document, mapping, mappingHash, rows, report };
  return frozen({ ...base, previewHash: stableSha256(base) });
}

/** Bytes and imports retained separately; only this synthetic adapter is enabled. */
export class MemoryImportRepository {
  private readonly batches = new Map<string, ImportBatch>();
  private readonly originals = new Map<string, Uint8Array>();
  async stagePreview(batch: ImportBatch, file: File, principal: Principal): Promise<ImportBatch> {
    authorize(principal, batch.scope, "prepare");
    if (batch.scope.mode !== "demo") throw new Error("REAL_IMPORT_STORAGE_DISABLED");
    const { previewHash, ...base } = batch;
    if (batch.approval || stableSha256(base) !== previewHash) throw new Error("IMPORT_PREVIEW_CHANGED");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sha256(Buffer.from(bytes)) !== batch.document.byteHash) throw new Error("SOURCE_BYTES_CHANGED");
    const existing = this.batches.get(batch.id);
    if (existing) return frozen(existing);
    this.originals.set(batch.document.id, bytes.slice()); this.batches.set(batch.id, frozen(batch));
    return frozen(batch);
  }
  async approveAndSave(batch: ImportBatch, file: File, principal: Principal, previewHash: string, at: string): Promise<ImportBatch> {
    authorize(principal, batch.scope, "prepare");
    if (batch.scope.mode !== "demo") throw new Error("REAL_IMPORT_STORAGE_DISABLED");
    const { previewHash: storedHash, approval: _approval, ...base } = batch;
    void _approval;
    if (storedHash !== previewHash || stableSha256(base) !== previewHash || batch.report.blocking.length) throw new Error("IMPORT_REJECTED_OR_STALE");
    if (!Number.isFinite(Date.parse(at))) throw new Error("APPROVAL_TIMESTAMP_REQUIRED");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sha256(Buffer.from(bytes)) !== batch.document.byteHash) throw new Error("SOURCE_BYTES_CHANGED");
    // No await after the uniqueness check: concurrent identical imports have one effect.
    const existing = this.batches.get(batch.id); if (existing?.approval) return frozen(existing);
    const saved = frozen({ ...batch, approval: { actorId: principal.id, at, previewHash }, report: { ...batch.report, calculationAllowed: true } });
    this.originals.set(batch.document.id, bytes.slice()); this.batches.set(batch.id, saved); return frozen(saved);
  }
  get(scope: WorkpaperScope, id: string, principal: Principal): ImportBatch {
    authorize(principal, scope, "read"); const value = this.batches.get(id);
    if (!value) throw new Error("IMPORT_NOT_FOUND"); assertScope(scope, value.scope); return frozen(value);
  }
  download(scope: WorkpaperScope, id: string, principal: Principal): Uint8Array | null {
    authorize(principal, scope, "download");
    const batch = [...this.batches.values()].find((b) => b.document.id === id);
    if (!batch) return null; assertScope(scope, batch.scope); return this.originals.get(id)?.slice() ?? null;
  }
}
