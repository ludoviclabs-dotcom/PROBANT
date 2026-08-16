export type IngestionJobStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "fingerprinting"
  | "parsing"
  | "validating"
  | "running_controls"
  | "building_snapshot"
  | "needs_manual_review"
  | "completed"
  | "failed"
  | "quarantined";

export const INGESTION_DOCUMENT_TYPES = [
  "fec",
  "balance",
  "liasse_2050_2059",
  "liasse_2033",
  "declaration_2065",
  "declaration_tva_ca3",
  "declaration_tva_ca12",
  "tax_notice",
  "payroll_summary",
] as const;

export type IngestionDocumentType = (typeof INGESTION_DOCUMENT_TYPES)[number];
export type IngestionDocumentKind = IngestionDocumentType | "unknown";

export type IngestionFileFormat = "txt" | "csv" | "json" | "xlsx" | "pdf" | "unknown";

export interface IngestionDocumentMetadata {
  entityId?: string;
  fileFormat?: IngestionFileFormat;
  formNumber?: string;
  formVintage?: number;
  siren?: string;
  expectedSiren?: string;
  periodStart?: string;
  periodEnd?: string;
  expectedPeriodStart?: string;
  expectedPeriodEnd?: string;
  fiscalYear?: number;
}

export interface IngestionJob {
  id: string;
  organizationId: string;
  dossierId: string;
  entityId: string;
  documentId: string;
  status: IngestionJobStatus;
  progress: number;
  startedAt: string;
  completedAt?: string;
  parserVersion?: string;
  errorCode?: string;
  errorMessage?: string;
  lineCount?: number;
  warningCount?: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: IngestionDocumentKind;
  /** Alias conserve pour la retrocompatibilite des clients d'ingestion existants. */
  documentKind: IngestionDocumentKind;
  fileFormat: IngestionFileFormat;
  metadata: IngestionDocumentMetadata;
  privateObjectPath: string;
}

export interface StructuredApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface FileValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface FileValidationResult {
  ok: boolean;
  documentType: IngestionDocumentKind;
  documentKind: IngestionDocumentKind;
  fileFormat: IngestionFileFormat;
  issues: FileValidationIssue[];
}

