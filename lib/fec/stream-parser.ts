import { createHash } from "node:crypto";
import type { FecEntry } from "@/lib/canonical-model";
import { FEC_COLUMNS } from "@/lib/canonical-model";
import type { IngestionLimits } from "@/lib/ingestion/limits";
import { detectSeparateur, headerConformite, parseMontant } from "./parser";

export const FEC_STREAM_PARSER_VERSION = "fec-stream-1.0.0";
export const FEC_INSERT_BATCH_SIZE = 1_000;

export type FecStreamErrorCode =
  | "UPLOAD_TOO_LARGE"
  | "FEC_TOO_MANY_LINES"
  | "FEC_LINE_TOO_LARGE"
  | "FEC_FIELD_TOO_LARGE"
  | "FEC_PARSE_TIMEOUT"
  | "FEC_EMPTY"
  | "FEC_ENCODING_INVALID"
  | "FEC_SEPARATOR_INVALID"
  | "FEC_HEADER_INVALID"
  | "FEC_DATE_INVALID"
  | "FEC_AMOUNT_INVALID";

export class FecStreamError extends Error {
  constructor(
    readonly code: FecStreamErrorCode,
    readonly quarantined: boolean,
    readonly details?: Record<string, number | string>,
  ) {
    super(code);
    this.name = "FecStreamError";
  }
}

export interface FecStreamParseResult {
  sha256: string;
  byteCount: number;
  lineCount: number;
  warningCount: number;
  separator: string;
  separatorName: string;
  variant: "debit-credit" | "montant-sens";
  headerColumns: string[];
}

export interface ParseFecStreamOptions {
  limits: IngestionLimits;
  onBatch(entries: FecEntry[]): Promise<void>;
  batchSize?: number;
  now?: () => number;
}

function isValidFecDate(value: string, allowEmpty: boolean): boolean {
  if (allowEmpty && value === "") return true;
  if (!/^\d{8}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function ensureDuration(startedAt: number, now: () => number, limitMs: number): void {
  if (now() - startedAt > limitMs) {
    throw new FecStreamError("FEC_PARSE_TIMEOUT", false, { limitMs });
  }
}

function separatorForHeader(headerLine: string): { char: string; nom: string } {
  const candidates = ["\t", "|", ";"].map((char) => ({
    char,
    count: headerLine.split(char).length - 1,
  }));
  const bestCount = Math.max(...candidates.map((candidate) => candidate.count));
  const best = candidates.filter((candidate) => candidate.count === bestCount);
  if (bestCount <= 0 || best.length !== 1) {
    throw new FecStreamError("FEC_SEPARATOR_INVALID", false);
  }
  return detectSeparateur(headerLine);
}

function parseDataLine(
  line: string,
  lineNumber: number,
  separator: string,
  headerColumns: string[],
  variant: "debit-credit" | "montant-sens",
  maxFieldBytes: number,
): FecEntry {
  const cells = line.split(separator);
  if (cells.length !== headerColumns.length) {
    throw new FecStreamError("FEC_HEADER_INVALID", false, {
      lineNumber,
      expectedColumns: headerColumns.length,
      observedColumns: cells.length,
    });
  }
  for (let index = 0; index < cells.length; index += 1) {
    const observedBytes = Buffer.byteLength(cells[index], "utf8");
    if (observedBytes > maxFieldBytes) {
      throw new FecStreamError("FEC_FIELD_TOO_LARGE", true, {
        lineNumber,
        columnNumber: index + 1,
        observedBytes,
        limitBytes: maxFieldBytes,
      });
    }
  }

  const indexOf = (name: string): number => headerColumns.indexOf(name);
  const value = (name: string): string => {
    const index = indexOf(name);
    return index >= 0 ? cells[index].trim() : "";
  };

  const dateFields: Array<[string, boolean]> = [
    ["EcritureDate", false],
    ["PieceDate", true],
    ["DateLet", true],
    ["ValidDate", true],
  ];
  for (const [field, allowEmpty] of dateFields) {
    if (!isValidFecDate(value(field), allowEmpty)) {
      throw new FecStreamError("FEC_DATE_INVALID", false, {
        lineNumber,
        field,
      });
    }
  }

  let debit = 0;
  let credit = 0;
  if (variant === "debit-credit") {
    debit = parseMontant(value("Debit"));
    credit = parseMontant(value("Credit"));
  } else {
    const amount = parseMontant(value("Montant"));
    const direction = value("Sens").toUpperCase();
    if (!direction.startsWith("D") && !direction.startsWith("C")) {
      throw new FecStreamError("FEC_AMOUNT_INVALID", false, { lineNumber });
    }
    if (direction.startsWith("D")) debit = amount;
    else credit = amount;
  }
  if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
    throw new FecStreamError("FEC_AMOUNT_INVALID", false, { lineNumber });
  }

  return {
    ligne: lineNumber - 1,
    journalCode: value("JournalCode"),
    journalLib: value("JournalLib"),
    ecritureNum: value("EcritureNum"),
    ecritureDate: value("EcritureDate"),
    compteNum: value("CompteNum"),
    compteLib: value("CompteLib"),
    compAuxNum: value("CompAuxNum"),
    compAuxLib: value("CompAuxLib"),
    pieceRef: value("PieceRef"),
    pieceDate: value("PieceDate"),
    ecritureLib: value("EcritureLib"),
    debit,
    credit,
    ecritureLet: value("EcritureLet"),
    dateLet: value("DateLet"),
    validDate: value("ValidDate"),
    montant: debit - credit,
  };
}

export async function parseFecStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseFecStreamOptions,
): Promise<FecStreamParseResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const batchSize = options.batchSize ?? FEC_INSERT_BATCH_SIZE;
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = stream.getReader();
  let pending = "";
  let byteCount = 0;
  let physicalLineNumber = 0;
  let dataLineCount = 0;
  let warningCount = 0;
  let headerColumns: string[] | undefined;
  let separator: { char: string; nom: string } | undefined;
  let variant: "debit-credit" | "montant-sens" | undefined;
  let batch: FecEntry[] = [];

  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    const current = batch;
    batch = [];
    await options.onBatch(current);
  };

  const consumeLine = async (rawLine: string): Promise<void> => {
    physicalLineNumber += 1;
    ensureDuration(startedAt, now, options.limits.maxParseDurationMs);
    const line = physicalLineNumber === 1 ? rawLine.replace(/^\uFEFF/u, "") : rawLine;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (lineBytes > options.limits.maxLineBytes) {
      throw new FecStreamError("FEC_LINE_TOO_LARGE", true, {
        lineNumber: physicalLineNumber,
        observedBytes: lineBytes,
        limitBytes: options.limits.maxLineBytes,
      });
    }
    if (line.length === 0) {
      warningCount += 1;
      return;
    }

    if (!headerColumns) {
      separator = separatorForHeader(line);
      headerColumns = line.split(separator.char).map((cell) => cell.trim());
      const conformity = headerConformite(headerColumns);
      const hasDebitCredit = headerColumns.includes("Debit") && headerColumns.includes("Credit");
      const hasAmountDirection =
        headerColumns.includes("Montant") && headerColumns.includes("Sens");
      if (!conformity.conforme || !conformity.ordreRespecte) {
        throw new FecStreamError("FEC_HEADER_INVALID", false, {
          missingColumnCount: conformity.manquantes.length,
        });
      }
      variant = hasDebitCredit
        ? "debit-credit"
        : hasAmountDirection
          ? "montant-sens"
          : undefined;
      if (!variant || headerColumns.length !== FEC_COLUMNS.length) {
        throw new FecStreamError("FEC_HEADER_INVALID", false, {
          observedColumns: headerColumns.length,
        });
      }
      return;
    }

    dataLineCount += 1;
    if (dataLineCount > options.limits.maxFecLines) {
      throw new FecStreamError("FEC_TOO_MANY_LINES", true, {
        observedLines: dataLineCount,
        limitLines: options.limits.maxFecLines,
      });
    }
    batch.push(
      parseDataLine(
        line,
        physicalLineNumber,
        separator!.char,
        headerColumns,
        variant!,
        options.limits.maxFieldBytes,
      ),
    );
    if (batch.length >= batchSize) await flushBatch();
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      ensureDuration(startedAt, now, options.limits.maxParseDurationMs);
      byteCount += value.byteLength;
      if (byteCount > options.limits.maxUploadBytes) {
        throw new FecStreamError("UPLOAD_TOO_LARGE", true, {
          observedBytes: byteCount,
          limitBytes: options.limits.maxUploadBytes,
        });
      }
      hash.update(value);
      try {
        pending += decoder.decode(value, { stream: true });
      } catch {
        throw new FecStreamError("FEC_ENCODING_INVALID", false);
      }
      const parts = pending.split(/\r\n|\n|\r/u);
      pending = parts.pop() ?? "";
      if (Buffer.byteLength(pending, "utf8") > options.limits.maxLineBytes) {
        throw new FecStreamError("FEC_LINE_TOO_LARGE", true, {
          lineNumber: physicalLineNumber + parts.length + 1,
          limitBytes: options.limits.maxLineBytes,
        });
      }
      for (const line of parts) await consumeLine(line);
    }
    try {
      pending += decoder.decode();
    } catch {
      throw new FecStreamError("FEC_ENCODING_INVALID", false);
    }
    if (pending.length > 0) await consumeLine(pending);
    if (!headerColumns || !separator || !variant) {
      throw new FecStreamError("FEC_EMPTY", false);
    }
    await flushBatch();
  } finally {
    reader.releaseLock();
  }

  return {
    sha256: hash.digest("hex"),
    byteCount,
    lineCount: dataLineCount,
    warningCount,
    separator: separator.char,
    separatorName: separator.nom,
    variant,
    headerColumns,
  };
}
