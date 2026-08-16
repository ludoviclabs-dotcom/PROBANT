import {
  INGESTION_DOCUMENT_TYPES,
  type FileValidationIssue,
  type FileValidationResult,
  type IngestionDocumentKind,
  type IngestionDocumentType,
  type IngestionFileFormat,
} from "./types";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 180;
const MIME_BY_EXTENSION: Record<string, string[]> = {
  txt: ["text/plain", "text/csv", "application/octet-stream"],
  csv: [
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ],
  json: ["application/json", "text/json", "text/plain", "application/octet-stream"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  pdf: ["application/pdf", "application/octet-stream"],
};

function extension(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

export function isIngestionDocumentType(value: string): value is IngestionDocumentType {
  return (INGESTION_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function detectFileFormat(fileName: string, mimeType: string): IngestionFileFormat {
  const ext = extension(fileName);
  if (["txt", "csv", "json", "xlsx", "pdf"].includes(ext)) {
    return ext as IngestionFileFormat;
  }
  if (mimeType === "application/pdf") return "pdf";
  return "unknown";
}

export function neutralizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\?%*:|"<>]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH);
}

export function detectDocumentKind(
  fileName: string,
  mimeType: string,
  requestedDocumentType?: string,
): IngestionDocumentKind {
  if (requestedDocumentType && isIngestionDocumentType(requestedDocumentType)) {
    return requestedDocumentType;
  }
  const normalized = fileName.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  if (/(^|-)2033([-.]|$)/u.test(normalized)) return "liasse_2033";
  if (/(^|-)(2050|2051|2052|2053|2054|2055|2056|2057|2058|2059)([-.]|$)/u.test(normalized)) {
    return "liasse_2050_2059";
  }
  if (/(^|-)2065([-.]|$)/u.test(normalized)) return "declaration_2065";
  if (/(^|-)(ca3|3310)([-.]|$)/u.test(normalized)) return "declaration_tva_ca3";
  if (/(^|-)(ca12|3517)([-.]|$)/u.test(normalized)) return "declaration_tva_ca12";
  if (/(^|-)(payroll|paie|dsn)([-.]|$)/u.test(normalized)) return "payroll_summary";
  if (/(^|-)(avis|notice)(-fiscal)?([-.]|$)/u.test(normalized)) return "tax_notice";
  const format = detectFileFormat(fileName, mimeType);
  if (format === "txt" || format === "csv") return "fec";
  if (format === "xlsx") return "balance";
  if (format === "pdf") return "tax_notice";
  return "unknown";
}

export function validateIncomingFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  maxBytes?: number;
  requestedDocumentType?: string;
}): FileValidationResult {
  const issues: FileValidationIssue[] = [];
  const ext = extension(input.fileName);
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!input.fileName || neutralizeFileName(input.fileName).length === 0) {
    issues.push({ code: "FILE_NAME_EMPTY", message: "Nom de fichier manquant.", severity: "error" });
  }
  if (input.fileName.length > MAX_FILE_NAME_LENGTH) {
    issues.push({ code: "FILE_NAME_TOO_LONG", message: "Nom de fichier trop long.", severity: "error" });
  }
  if (!["txt", "csv", "json", "xlsx", "pdf"].includes(ext)) {
    issues.push({
      code: "FILE_EXTENSION_UNSUPPORTED",
      message: "Extension non supportee. Formats acceptes : txt, csv, json, xlsx, pdf.",
      severity: "error",
    });
  }
  if (input.requestedDocumentType && !isIngestionDocumentType(input.requestedDocumentType)) {
    issues.push({
      code: "DOCUMENT_TYPE_UNSUPPORTED",
      message: `Type de document non supporte : ${input.requestedDocumentType}.`,
      severity: "error",
    });
  }
  const acceptedMimeTypes = MIME_BY_EXTENSION[ext];
  if (
    acceptedMimeTypes &&
    input.mimeType &&
    !acceptedMimeTypes.includes(input.mimeType.toLowerCase())
  ) {
    issues.push({
      code: "FILE_MIME_MISMATCH",
      message: `Type MIME ${input.mimeType} incoherent avec l'extension .${ext}.`,
      severity: "error",
    });
  }
  if (ext === "xls") {
    issues.push({
      code: "XLS_LEGACY_UNSUPPORTED",
      message: "Le format .xls legacy est refuse; exporter en .xlsx ou .csv.",
      severity: "error",
    });
  }
  if (input.sizeBytes <= 0) {
    issues.push({ code: "FILE_EMPTY", message: "Fichier vide.", severity: "error" });
  }
  if (input.sizeBytes > maxBytes) {
    issues.push({
      code: "FILE_TOO_LARGE",
      message: `Fichier superieur a la limite configuree de ${maxBytes} octets.`,
      severity: "error",
    });
  }

  const documentType = detectDocumentKind(
    input.fileName,
    input.mimeType,
    input.requestedDocumentType,
  );
  if (documentType === "unknown") {
    issues.push({
      code: "DOCUMENT_TYPE_UNDETERMINED",
      message: "Le type de document doit etre explicite ou identifiable sans ambiguite.",
      severity: "error",
    });
  }
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    documentType,
    documentKind: documentType,
    fileFormat: detectFileFormat(input.fileName, input.mimeType),
    issues,
  };
}

export async function validateFileSignature(input: {
  file: Blob;
  documentKind: IngestionDocumentKind;
  fileFormat?: IngestionFileFormat;
}): Promise<FileValidationIssue[]> {
  const bytes = new Uint8Array(await input.file.slice(0, 8).arrayBuffer());
  const startsWith = (...expected: number[]) =>
    expected.every((value, index) => bytes[index] === value);
  const fileFormat = input.fileFormat ?? (
    input.documentKind === "balance" ? "xlsx" : input.documentKind === "fec" ? "txt" : "unknown"
  );
  if (fileFormat === "pdf" && !startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    return [{
      code: "FILE_SIGNATURE_INVALID",
      message: "La signature binaire du PDF est invalide.",
      severity: "error",
    }];
  }
  if (fileFormat === "xlsx" && !startsWith(0x50, 0x4b)) {
    return [{
      code: "FILE_SIGNATURE_INVALID",
      message: "Le fichier XLSX n'est pas une archive Office valide.",
      severity: "error",
    }];
  }
  if (["txt", "csv", "json"].includes(fileFormat) && bytes.includes(0)) {
    return [{
      code: "FILE_SIGNATURE_INVALID",
      message: "Le FEC texte contient des octets binaires nuls.",
      severity: "error",
    }];
  }
  return [];
}

