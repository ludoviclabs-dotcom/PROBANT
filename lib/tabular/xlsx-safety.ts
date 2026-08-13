export interface XlsxSafetyLimits {
  maxExpandedBytes: number;
  maxCompressionRatio: number;
  maxZipEntries: number;
  maxRows: number;
  maxCellBytes: number;
}

export class XlsxSafetyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "XlsxSafetyError";
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new XlsxSafetyError("XLSX_INVALID_ZIP");
}

export function inspectXlsxContainer(
  buffer: ArrayBuffer,
  limits: XlsxSafetyLimits,
): { entryCount: number; compressedBytes: number; expandedBytes: number } {
  if (buffer.byteLength < 22) throw new XlsxSafetyError("XLSX_INVALID_ZIP");
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new XlsxSafetyError("XLSX_ZIP64_UNSUPPORTED");
  }
  if (entryCount > limits.maxZipEntries) {
    throw new XlsxSafetyError("XLSX_TOO_MANY_ZIP_ENTRIES");
  }

  let offset = centralDirectoryOffset;
  let compressedBytes = 0;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) {
      throw new XlsxSafetyError("XLSX_INVALID_ZIP");
    }
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    if (compressed === 0xffffffff || expanded === 0xffffffff) {
      throw new XlsxSafetyError("XLSX_ZIP64_UNSUPPORTED");
    }
    compressedBytes += compressed;
    expandedBytes += expanded;
    if (expandedBytes > limits.maxExpandedBytes) {
      throw new XlsxSafetyError("XLSX_EXPANDED_SIZE_EXCEEDED");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (
    compressedBytes > 0 &&
    expandedBytes / compressedBytes > limits.maxCompressionRatio
  ) {
    throw new XlsxSafetyError("XLSX_COMPRESSION_RATIO_EXCEEDED");
  }
  return { entryCount, compressedBytes, expandedBytes };
}

export function validateXlsxRows(rows: unknown[][], limits: XlsxSafetyLimits): void {
  if (rows.length > limits.maxRows) throw new XlsxSafetyError("XLSX_ROW_LIMIT_EXCEEDED");
  const encoder = new TextEncoder();
  for (const row of rows) {
    for (const cell of row) {
      if (encoder.encode(String(cell ?? "")).byteLength > limits.maxCellBytes) {
        throw new XlsxSafetyError("XLSX_CELL_LIMIT_EXCEEDED");
      }
    }
  }
}
