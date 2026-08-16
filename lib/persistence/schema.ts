import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DossierSnapshot } from "@/lib/dossier/types";
import type {
  FecEntry,
  FiscalSynthesisSnapshot,
  Finding,
  TaxAdjustment,
  TaxComputationSnapshot,
  TaxControlExecution,
  TaxDeclarationField,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import type { ReviewEvent } from "@/lib/dossier/types";
import type { IngestionDocumentMetadata } from "@/lib/ingestion/types";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();

export const dossiers = pgTable("dossiers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("legacy"),
  companyName: text("company_name").notNull(),
  siren: text("siren"),
  fiscalYear: text("fiscal_year").notNull(),
  storageKind: text("storage_kind").notNull(),
  createdAt: createdAt(),
});

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    fileName: text("file_name").notNull(),
    documentType: text("document_type").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    privateObjectPath: text("private_object_path").notNull(),
    parserVersion: text("parser_version"),
    lineCount: integer("line_count"),
    pageCount: integer("page_count"),
    ingestionMetadata: jsonb("ingestion_metadata")
      .$type<IngestionDocumentMetadata>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [index("idx_source_documents_dossier").on(table.dossierId)],
);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: text("id").primaryKey(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    documentId: text("document_id").references(() => sourceDocuments.id),
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    parserVersion: text("parser_version"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    lineCount: integer("line_count"),
    warningCount: integer("warning_count"),
  },
  (table) => [
    index("idx_ingestion_jobs_dossier_status").on(table.dossierId, table.status),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    documentId: text("document_id")
      .notNull()
      .references(() => sourceDocuments.id),
    lineNumber: integer("line_number").notNull(),
    entryPayload: jsonb("entry_payload").$type<FecEntry>().notNull(),
  },
  (table) => [
    index("idx_ledger_entries_dossier_line").on(table.dossierId, table.lineNumber),
  ],
);

export const controlExecutions = pgTable("control_executions", {
  id: text("id").primaryKey(),
  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  controlId: text("control_id").notNull(),
  controlVersion: text("control_version").notNull(),
  status: text("status").notNull(),
  resultPayload: jsonb("result_payload").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

/**
 * Les tables fiscales stockent des artefacts immuables. Elles n'exposent aucun
 * updated_at et les tuples de version sont protégés par des index uniques.
 */
export const taxProfiles = pgTable(
  "tax_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    entityId: text("entity_id").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    version: text("version").notNull(),
    status: text("status").notNull(),
    turnoverAmountCents: bigint("turnover_amount_cents", { mode: "number" }),
    canonicalJson: text("canonical_json").notNull(),
    contentHash: text("content_hash").notNull(),
    payload: jsonb("payload").$type<TaxProfile>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_profiles_scope_period_version").on(
      table.organizationId,
      table.dossierId,
      table.periodStart,
      table.periodEnd,
      table.version,
    ),
    index("idx_tax_profiles_scope").on(table.organizationId, table.dossierId),
  ],
);

export const taxPeriods = pgTable(
  "tax_periods",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    entityId: text("entity_id").notNull(),
    taxType: text("tax_type").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    formVintage: integer("form_vintage").notNull(),
    frequency: text("frequency").notNull(),
    version: text("version").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    contentHash: text("content_hash").notNull(),
    payload: jsonb("payload").$type<TaxPeriod>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_periods_scope_type_period_version").on(
      table.organizationId,
      table.dossierId,
      table.taxType,
      table.periodStart,
      table.periodEnd,
      table.version,
    ),
    uniqueIndex("uq_tax_periods_scope_id").on(
      table.organizationId,
      table.dossierId,
      table.id,
    ),
    index("idx_tax_periods_scope").on(table.organizationId, table.dossierId),
  ],
);

export const taxDocuments = pgTable(
  "tax_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    entityId: text("entity_id").notNull(),
    logicalDocumentId: text("logical_document_id").notNull(),
    sourceDocumentId: text("source_document_id").notNull().references(() => sourceDocuments.id),
    taxPeriodId: text("tax_period_id").notNull().references(() => taxPeriods.id),
    taxPeriodVersion: text("tax_period_version").notNull(),
    taxType: text("tax_type").notNull(),
    documentType: text("document_type").notNull(),
    formNumber: text("form_number").notNull(),
    formVintage: integer("form_vintage").notNull(),
    snapshotVersion: text("snapshot_version").notNull(),
    status: text("status").notNull(),
    sourceHash: text("source_hash").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    payload: jsonb("payload").$type<TaxDocumentSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_documents_scope_logical_version").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
      table.logicalDocumentId,
      table.snapshotVersion,
    ),
    uniqueIndex("uq_tax_documents_scope_id").on(
      table.organizationId,
      table.dossierId,
      table.id,
    ),
    index("idx_tax_documents_scope_period").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
    ),
  ],
);

export const taxDeclarationFields = pgTable(
  "tax_declaration_fields",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    taxDocumentId: text("tax_document_id").notNull().references(() => taxDocuments.id),
    formVintage: integer("form_vintage").notNull(),
    fieldCode: text("field_code").notNull(),
    dataType: text("data_type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    percentageBasisPoints: integer("percentage_basis_points"),
    documentHash: text("document_hash").notNull(),
    confidenceBasisPoints: integer("confidence_basis_points").notNull(),
    processingStatus: text("processing_status").notNull(),
    usableForAutomatedCalculation: boolean("usable_for_automated_calculation").notNull(),
    fieldHash: text("field_hash").notNull(),
    payload: jsonb("payload").$type<TaxDeclarationField>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_tax_declaration_fields_document_vintage_code").on(
      table.organizationId,
      table.dossierId,
      table.taxDocumentId,
      table.formVintage,
      table.fieldCode,
    ),
    index("idx_tax_declaration_fields_scope").on(
      table.organizationId,
      table.dossierId,
      table.taxDocumentId,
    ),
  ],
);

export const taxControlExecutions = pgTable(
  "tax_control_executions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    entityId: text("entity_id").notNull(),
    taxPeriodId: text("tax_period_id").notNull().references(() => taxPeriods.id),
    fiscalYear: integer("fiscal_year").notNull(),
    formVintage: integer("form_vintage").notNull(),
    executionVersion: text("execution_version").notNull(),
    controlId: text("control_id").notNull(),
    controlVersion: text("control_version").notNull(),
    definitionHash: text("definition_hash").notNull(),
    taxProfileId: text("tax_profile_id").notNull().references(() => taxProfiles.id),
    taxProfileVersion: text("tax_profile_version").notNull(),
    status: text("status").notNull(),
    proposedOutcome: text("proposed_outcome"),
    evidenceStrength: text("evidence_strength").notNull(),
    engineVersion: text("engine_version").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    executionHash: text("execution_hash").notNull(),
    payload: jsonb("payload").$type<TaxControlExecution>().notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_tax_control_executions_scope_control_version").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
      table.controlId,
      table.controlVersion,
      table.executionVersion,
    ),
    uniqueIndex("uq_tax_control_executions_scope_id").on(
      table.organizationId,
      table.dossierId,
      table.id,
    ),
    index("idx_tax_control_executions_scope_period").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
    ),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    controlExecutionId: text("control_execution_id").references(
      () => controlExecutions.id,
    ),
    taxControlExecutionId: text("tax_control_execution_id").references(
      () => taxControlExecutions.id,
    ),
    severity: text("severity").notNull(),
    family: text("family").notNull(),
    domain: text("domain").notNull().default("accounting"),
    payload: jsonb("payload").$type<Finding>().notNull(),
  },
  (table) => [index("idx_findings_dossier").on(table.dossierId)],
);

export const reviewEvents = pgTable(
  "review_events",
  {
    id: text("id").primaryKey(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    findingId: text("finding_id")
      .notNull()
      .references(() => findings.id),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    comment: text("comment"),
    actorLabel: text("actor_label").notNull(),
    actorRole: text("actor_role").notNull(),
    relatedEvidenceIds: jsonb("related_evidence_ids")
      .$type<ReviewEvent["relatedEvidenceIds"]>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_review_events_finding").on(table.findingId, table.createdAt)],
);

export const taxReconciliationLines = pgTable(
  "tax_reconciliation_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    executionId: text("execution_id").notNull().references(() => taxControlExecutions.id),
    lineKey: text("line_key").notNull(),
    differenceAmountCents: bigint("difference_amount_cents", { mode: "number" }),
    toleranceAmountCents: bigint("tolerance_amount_cents", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    lineHash: text("line_hash").notNull(),
    payload: jsonb("payload").$type<TaxReconciliationLine>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_reconciliation_lines_execution_key").on(
      table.organizationId,
      table.dossierId,
      table.executionId,
      table.lineKey,
    ),
    index("idx_tax_reconciliation_lines_scope").on(
      table.organizationId,
      table.dossierId,
      table.executionId,
    ),
  ],
);

export const taxAdjustments = pgTable(
  "tax_adjustments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    executionId: text("execution_id").notNull().references(() => taxControlExecutions.id),
    taxPeriodId: text("tax_period_id").notNull().references(() => taxPeriods.id),
    taxType: text("tax_type").notNull(),
    version: text("version").notNull(),
    adjustmentCode: text("adjustment_code").notNull(),
    direction: text("direction").notNull(),
    baseAmountCents: bigint("base_amount_cents", { mode: "number" }),
    taxAmountCents: bigint("tax_amount_cents", { mode: "number" }),
    proposalStatus: text("proposal_status").notNull(),
    reviewStatus: text("review_status").notNull(),
    reviewEventId: text("review_event_id").references(() => reviewEvents.id),
    canonicalJson: text("canonical_json").notNull(),
    adjustmentHash: text("adjustment_hash").notNull(),
    payload: jsonb("payload").$type<TaxAdjustment>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_adjustments_execution_code_version").on(
      table.organizationId,
      table.dossierId,
      table.executionId,
      table.adjustmentCode,
      table.version,
    ),
    index("idx_tax_adjustments_scope_period").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
    ),
  ],
);

export const taxComputationSnapshots = pgTable(
  "tax_computation_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    dossierId: text("dossier_id").notNull().references(() => dossiers.id),
    entityId: text("entity_id").notNull(),
    taxPeriodId: text("tax_period_id").notNull().references(() => taxPeriods.id),
    fiscalYear: integer("fiscal_year").notNull(),
    formVintage: integer("form_vintage").notNull(),
    taxType: text("tax_type").notNull(),
    calculationType: text("calculation_type").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    evidenceStrength: text("evidence_strength").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    payload: jsonb("payload").$type<TaxComputationSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tax_computation_snapshots_scope_period_version").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
      table.calculationType,
      table.calculationVersion,
    ),
    index("idx_tax_computation_snapshots_scope_period").on(
      table.organizationId,
      table.dossierId,
      table.taxPeriodId,
    ),
  ],
);

export const synthesisSnapshots = pgTable(
  "synthesis_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().default("legacy"),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    snapshotVersion: text("snapshot_version").notNull(),
    snapshotKind: text("snapshot_kind").notNull().default("dossier"),
    fiscalYear: integer("fiscal_year"),
    formVintage: integer("form_vintage"),
    snapshotHash: text("snapshot_hash").notNull(),
    payload: jsonb("payload").$type<DossierSnapshot | FiscalSynthesisSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_synthesis_snapshots_dossier").on(table.dossierId, table.createdAt),
  ],
);

export const reportArtifacts = pgTable("report_artifacts", {
  id: text("id").primaryKey(),
  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  artifactType: text("artifact_type").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  privateObjectPath: text("private_object_path").notNull(),
  createdAt: createdAt(),
});

