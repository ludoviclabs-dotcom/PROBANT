import type {
  IngestionDocumentType,
  IngestionFileFormat,
} from "./types";

export interface RawTaxFieldInput {
  code: string;
  rawValue: string | null;
  declaredDataType?: string;
  page: number | null;
  sheet: string | null;
  cell: string | null;
  box: string | null;
  structuredPath: string | null;
  formula: boolean;
  confidence: number;
  extractionMethod: "structured" | "text_layer";
}

export interface ParsedTaxDocumentInput {
  schemaVersion: string | null;
  documentType: IngestionDocumentType | null;
  formNumber: string | null;
  formVintage: number | null;
  siren: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  fiscalYear: number | null;
  fields: RawTaxFieldInput[];
  warnings: string[];
}

const MAX_ROWS = 250_000;
const MAX_COLUMNS = 250;
const MAX_CELLS = 2_000_000;
const MAX_SHEETS = 20;

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function nullableInteger(value: unknown): number | null {
  const text = nullableString(value);
  if (!text || !/^\d{4}$/u.test(text)) return null;
  return Number(text);
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "")
    .toLowerCase();
}

const HEADER_ALIASES = {
  documentType: ["documenttype", "typedocument"],
  formNumber: ["formnumber", "formulaire", "numeroformulaire"],
  formVintage: ["formvintage", "millesime", "vintage"],
  siren: ["siren"],
  periodStart: ["periodstart", "datedebut", "debutperiode", "exercicedebut"],
  periodEnd: ["periodend", "datefin", "finperiode", "exercicefin"],
  fiscalYear: ["fiscalyear", "exercice", "anneefiscale"],
  fieldCode: ["fieldcode", "codechamp", "codecase", "case", "code"],
  rawValue: ["rawvalue", "valeurebrute", "valeurbrute", "valeur", "value"],
  dataType: ["datatype", "typedonnee"],
  page: ["page"],
  box: ["box", "caseformulaire"],
} as const;

type HeaderName = keyof typeof HEADER_ALIASES;

function headerIndexes(headers: unknown[]): Partial<Record<HeaderName, number>> {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).flatMap(([name, aliases]) => {
      const index = normalized.findIndex((header) =>
        (aliases as readonly string[]).includes(header),
      );
      return index >= 0 ? [[name, index]] : [];
    }),
  );
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/u).slice(0, 5).join("\n");
  return [";", ",", "\t"]
    .map((delimiter) => ({
      delimiter,
      count: sample.split(delimiter).length - 1,
    }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function metadataFromRow(
  row: unknown[],
  indexes: Partial<Record<HeaderName, number>>,
): Omit<ParsedTaxDocumentInput, "fields" | "warnings"> {
  const value = (name: HeaderName) => {
    const index = indexes[name];
    return index === undefined ? null : row[index];
  };
  return {
    schemaVersion: null,
    documentType: nullableString(value("documentType")) as IngestionDocumentType | null,
    formNumber: nullableString(value("formNumber")),
    formVintage: nullableInteger(value("formVintage")),
    siren: nullableString(value("siren"))?.replace(/\s/gu, "") ?? null,
    periodStart: nullableString(value("periodStart")),
    periodEnd: nullableString(value("periodEnd")),
    fiscalYear: nullableInteger(value("fiscalYear")),
  };
}

function mergeMetadata(
  current: Omit<ParsedTaxDocumentInput, "fields" | "warnings">,
  candidate: Omit<ParsedTaxDocumentInput, "fields" | "warnings">,
) {
  return Object.fromEntries(
    Object.keys(current).map((key) => {
      const typedKey = key as keyof typeof current;
      return [typedKey, current[typedKey] ?? candidate[typedKey]];
    }),
  ) as Omit<ParsedTaxDocumentInput, "fields" | "warnings">;
}

async function parseCsv(file: File): Promise<ParsedTaxDocumentInput> {
  const text = await file.text();
  const delimiter = detectDelimiter(text);
  const rows = text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => parseCsvLine(line, delimiter));
  if (rows.length > MAX_ROWS) throw new Error("TAX_TABULAR_ROW_LIMIT_EXCEEDED");
  const headers = rows[0] ?? [];
  const indexes = headerIndexes(headers);
  if (indexes.fieldCode === undefined || indexes.rawValue === undefined) {
    throw new Error("TAX_TEMPLATE_REQUIRED_COLUMNS_MISSING");
  }
  if (headers.length > MAX_COLUMNS || rows.length * headers.length > MAX_CELLS) {
    throw new Error("TAX_TABULAR_CELL_LIMIT_EXCEEDED");
  }
  let metadata = metadataFromRow(rows[1] ?? [], indexes);
  const fields = rows.slice(1).flatMap((row, rowIndex): RawTaxFieldInput[] => {
    metadata = mergeMetadata(metadata, metadataFromRow(row, indexes));
    const code = nullableString(row[indexes.fieldCode!]);
    if (!code) return [];
    const rawValue = nullableString(row[indexes.rawValue!]);
    const pageIndex = indexes.page;
    const parsedPage = pageIndex === undefined ? null : Number(row[pageIndex]);
    return [{
      code,
      rawValue,
      declaredDataType:
        indexes.dataType === undefined ? undefined : nullableString(row[indexes.dataType]) ?? undefined,
      page: typeof parsedPage === "number" && Number.isSafeInteger(parsedPage) && parsedPage > 0
        ? parsedPage
        : null,
      sheet: null,
      cell: `${columnName(indexes.rawValue!)}${rowIndex + 2}`,
      box: indexes.box === undefined ? code : nullableString(row[indexes.box]) ?? code,
      structuredPath: `rows[${rowIndex}]`,
      formula: rawValue?.startsWith("=") ?? false,
      confidence: 1,
      extractionMethod: "structured",
    }];
  });
  return { ...metadata, fields, warnings: [] };
}

function jsonField(value: unknown, index: number): RawTaxFieldInput | null {
  if (!value || typeof value !== "object") return null;
  const field = value as Record<string, unknown>;
  const code = nullableString(field.code ?? field.fieldCode ?? field.box);
  if (!code) return null;
  const source = field.source && typeof field.source === "object"
    ? field.source as Record<string, unknown>
    : {};
  const rawValue = nullableString(field.rawValue ?? field.value);
  const parsedPage = Number(source.page ?? field.page);
  return {
    code,
    rawValue,
    declaredDataType: nullableString(field.dataType) ?? undefined,
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : null,
    sheet: nullableString(source.sheet ?? field.sheet),
    cell: nullableString(source.cell ?? field.cell),
    box: nullableString(source.box ?? field.box) ?? code,
    structuredPath: nullableString(source.structuredPath) ?? `fields[${index}]`,
    formula: Boolean(field.formula) || (rawValue?.startsWith("=") ?? false),
    confidence: 1,
    extractionMethod: "structured",
  };
}

async function parseJson(file: File): Promise<ParsedTaxDocumentInput> {
  let input: unknown;
  try {
    input = JSON.parse(await file.text());
  } catch {
    throw new Error("TAX_JSON_INVALID");
  }
  if (!input || typeof input !== "object") throw new Error("TAX_JSON_OBJECT_REQUIRED");
  const root = input as Record<string, unknown>;
  const period = root.period && typeof root.period === "object"
    ? root.period as Record<string, unknown>
    : {};
  if (!Array.isArray(root.fields)) throw new Error("TAX_JSON_FIELDS_REQUIRED");
  return {
    schemaVersion: nullableString(root.schemaVersion),
    documentType: nullableString(root.documentType) as IngestionDocumentType | null,
    formNumber: nullableString(root.formNumber),
    formVintage: nullableInteger(root.formVintage),
    siren: nullableString(root.siren)?.replace(/\s/gu, "") ?? null,
    periodStart: nullableString(period.startDate ?? root.periodStart),
    periodEnd: nullableString(period.endDate ?? root.periodEnd),
    fiscalYear: nullableInteger(period.fiscalYear ?? root.fiscalYear),
    fields: root.fields.flatMap((field, index) => {
      const parsed = jsonField(field, index);
      return parsed ? [parsed] : [];
    }),
    warnings: root.fields.length === 0 ? ["NO_DECLARATION_FIELD"] : [],
  };
}

function excelCellValue(value: unknown): { text: string | null; formula: boolean } {
  if (value === null || value === undefined) return { text: null, formula: false };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), formula: false };
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.formula === "string") {
      return { text: `=${record.formula}`, formula: true };
    }
    if (typeof record.text === "string") return { text: record.text, formula: false };
    if (Array.isArray(record.richText)) {
      return {
        text: record.richText.map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : "",
        ).join(""),
        formula: false,
      };
    }
  }
  return { text: String(value), formula: false };
}

async function parseXlsx(file: File): Promise<ParsedTaxDocumentInput> {
  const { default: ExcelJS } = await import("exceljs/dist/exceljs.min.js");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  if (workbook.worksheets.length > MAX_SHEETS) throw new Error("TAX_XLSX_SHEET_LIMIT_EXCEEDED");
  let metadata: Omit<ParsedTaxDocumentInput, "fields" | "warnings"> = {
    schemaVersion: null,
    documentType: null,
    formNumber: null,
    formVintage: null,
    siren: null,
    periodStart: null,
    periodEnd: null,
    fiscalYear: null,
  };
  const fields: RawTaxFieldInput[] = [];
  for (const worksheet of workbook.worksheets) {
    const rowCount = worksheet.actualRowCount || worksheet.rowCount;
    const columnCount = worksheet.actualColumnCount || worksheet.columnCount;
    if (rowCount > MAX_ROWS || columnCount > MAX_COLUMNS || rowCount * columnCount > MAX_CELLS) {
      throw new Error("TAX_XLSX_CELL_LIMIT_EXCEEDED");
    }
    const headerRow = worksheet.getRow(1);
    const headers = Array.from({ length: columnCount }, (_, index) =>
      excelCellValue(headerRow.getCell(index + 1).value).text,
    );
    const indexes = headerIndexes(headers);
    if (indexes.fieldCode === undefined || indexes.rawValue === undefined) continue;
    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const values = Array.from({ length: columnCount }, (_, index) =>
        excelCellValue(row.getCell(index + 1).value).text,
      );
      metadata = mergeMetadata(metadata, metadataFromRow(values, indexes));
      const code = nullableString(values[indexes.fieldCode]);
      if (!code) continue;
      const rawCell = row.getCell(indexes.rawValue + 1);
      const raw = excelCellValue(rawCell.value);
      const pageIndex = indexes.page;
      const parsedPage = pageIndex === undefined ? null : Number(values[pageIndex]);
      fields.push({
        code,
        rawValue: raw.text,
        declaredDataType:
          indexes.dataType === undefined ? undefined : nullableString(values[indexes.dataType]) ?? undefined,
        page: typeof parsedPage === "number" && Number.isSafeInteger(parsedPage) && parsedPage > 0
          ? parsedPage
          : null,
        sheet: worksheet.name,
        cell: rawCell.address,
        box: indexes.box === undefined ? code : nullableString(values[indexes.box]) ?? code,
        structuredPath: null,
        formula: raw.formula,
        confidence: 1,
        extractionMethod: "structured",
      });
    }
  }
  if (fields.length === 0) throw new Error("TAX_TEMPLATE_REQUIRED_COLUMNS_MISSING");
  return { ...metadata, fields, warnings: [] };
}

export async function readStructuredTaxDocument(
  file: File,
  fileFormat: IngestionFileFormat,
): Promise<ParsedTaxDocumentInput> {
  if (fileFormat === "json") return parseJson(file);
  if (fileFormat === "csv" || fileFormat === "txt") return parseCsv(file);
  if (fileFormat === "xlsx") return parseXlsx(file);
  throw new Error("TAX_STRUCTURED_FORMAT_UNSUPPORTED");
}

