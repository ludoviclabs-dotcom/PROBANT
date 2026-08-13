import type { XlsxSafetyLimits } from "./xlsx-safety";

export function detectCsvDelimiter(sample: string): "," | ";" | "\t" {
  const lines = sample.split(/\r\n|\n|\r/u).filter(Boolean).slice(0, 10);
  const counts = ([",", ";", "\t"] as const).map((delimiter) => ({
    delimiter,
    count: lines.reduce(
      (sum, line) => sum + (line.split(delimiter).length - 1),
      0,
    ),
  }));
  const maximum = Math.max(...counts.map((candidate) => candidate.count));
  const winners = counts.filter((candidate) => candidate.count === maximum);
  if (maximum === 0 || winners.length !== 1) throw new Error("CSV_SEPARATOR_AMBIGUOUS");
  return winners[0].delimiter;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV_QUOTE_UNTERMINATED");
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export async function readCsvRows(
  file: File,
  limits: XlsxSafetyLimits,
): Promise<unknown[][]> {
  const text = await file.text();
  const delimiter = detectCsvDelimiter(text.slice(0, 64 * 1024));
  const rows = parseCsv(text.replace(/^\uFEFF/u, ""), delimiter);
  if (rows.length > limits.maxRows) throw new Error("CSV_ROW_LIMIT_EXCEEDED");
  const encoder = new TextEncoder();
  for (const row of rows) {
    for (const cell of row) {
      if (encoder.encode(cell).byteLength > limits.maxCellBytes) {
        throw new Error("CSV_FIELD_LIMIT_EXCEEDED");
      }
    }
  }
  return rows;
}
