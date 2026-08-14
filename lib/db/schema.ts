import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const dossierStatusEnum = pgEnum("dossier_status", ["active", "archived"]);

export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
  "pending_upload",
  "uploaded",
  "processing",
  "completed",
  "failed",
  "quarantined",
]);

export const ingestionJobStatusEnum = pgEnum("ingestion_job_status", [
  "created",
  "uploading",
  "uploaded",
  "fingerprinting",
  "parsing",
  "validating",
  "running_controls",
  "building_snapshot",
  "completed",
  "failed",
  "quarantined",
]);

export type IngestionJobStatus = (typeof ingestionJobStatusEnum.enumValues)[number];

export const controlExecutionStatusEnum = pgEnum("control_execution_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "not_applicable",
]);

export const findingFamilyEnum = pgEnum("finding_family", [
  "hardLaw",
  "methodology",
  "internal",
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "bloquant",
  "majeur",
  "mineur",
  "informatif",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "en_attente",
  "valide",
  "ecarte",
  "corrige",
  "pending",
  "needs_evidence",
  "confirmed",
  "dismissed",
  "corrected",
  "superseded",
]);

export const reviewEventStatusEnum = pgEnum("review_event_status", [
  "pending",
  "needs_evidence",
  "confirmed",
  "dismissed",
  "corrected",
  "superseded",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dossiers = pgTable(
  "dossiers",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    externalRef: text("external_ref").notNull(),
    status: dossierStatusEnum("status").notNull().default("active"),
    legalName: text("legal_name"),
    siren: text("siren"),
    financialYear: text("financial_year"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dossiers_org_external_ref_uq").on(
      table.organizationId,
      table.externalRef,
    ),
    index("dossiers_org_updated_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    documentType: text("document_type").notNull(),
    declaredMimeType: text("declared_mime_type").notNull(),
    observedMimeType: text("observed_mime_type"),
    declaredByteSize: bigint("declared_byte_size", { mode: "number" }).notNull(),
    declaredChecksumSha256: text("declared_checksum_sha256"),
    observedByteSize: bigint("observed_byte_size", { mode: "number" }),
    sha256: text("sha256"),
    storageProvider: text("storage_provider").notNull(),
    storageBucket: text("storage_bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    storageVersionId: text("storage_version_id"),
    status: sourceDocumentStatusEnum("status").notNull().default("pending_upload"),
    parserVersion: text("parser_version"),
    lineCount: integer("line_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("source_documents_dossier_sha256_uq")
      .on(table.dossierId, table.sha256)
      .where(sql`${table.sha256} is not null`),
    uniqueIndex("source_documents_storage_object_uq").on(
      table.storageProvider,
      table.storageBucket,
      table.storageKey,
      table.storageVersionId,
    ),
    index("source_documents_dossier_status_idx").on(table.dossierId, table.status),
    check("source_documents_declared_size_ck", sql`${table.declaredByteSize} >= 0`),
    check(
      "source_documents_observed_size_ck",
      sql`${table.observedByteSize} is null or ${table.observedByteSize} >= 0`,
    ),
    check(
      "source_documents_sha256_ck",
      sql`${table.sha256} is null or ${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "source_documents_completed_integrity_ck",
      sql`${table.status} <> 'completed' or (${table.sha256} is not null and ${table.observedByteSize} is not null)`,
    ),
  ],
);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    status: ingestionJobStatusEnum("status").notNull().default("created"),
    attempt: integer("attempt").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    parserVersion: text("parser_version").notNull(),
    requestId: text("request_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lineCount: integer("line_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCode: text("error_code"),
    queuePublishedAt: timestamp("queue_published_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ingestion_jobs_dossier_idempotency_uq").on(
      table.dossierId,
      table.idempotencyKey,
    ),
    index("ingestion_jobs_org_status_created_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("ingestion_jobs_document_created_idx").on(
      table.sourceDocumentId,
      table.createdAt,
    ),
    check("ingestion_jobs_attempt_ck", sql`${table.attempt} >= 0`),
    check("ingestion_jobs_line_count_ck", sql`${table.lineCount} >= 0`),
    check("ingestion_jobs_warning_count_ck", sql`${table.warningCount} >= 0`),
    check(
      "ingestion_jobs_terminal_completed_at_ck",
      sql`(${table.status} not in ('completed', 'failed', 'quarantined')) or ${table.completedAt} is not null`,
    ),
  ],
);

export const fecEntries = pgTable(
  "fec_entries",
  {
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    journalCode: text("journal_code").notNull(),
    journalLib: text("journal_lib").notNull(),
    ecritureNum: text("ecriture_num").notNull(),
    ecritureDate: text("ecriture_date").notNull(),
    compteNum: text("compte_num").notNull(),
    compteLib: text("compte_lib").notNull(),
    compAuxNum: text("comp_aux_num").notNull(),
    compAuxLib: text("comp_aux_lib").notNull(),
    pieceRef: text("piece_ref").notNull(),
    pieceDate: text("piece_date").notNull(),
    ecritureLib: text("ecriture_lib").notNull(),
    debit: numeric("debit", { precision: 20, scale: 2 }).notNull(),
    credit: numeric("credit", { precision: 20, scale: 2 }).notNull(),
    ecritureLet: text("ecriture_let").notNull(),
    dateLet: text("date_let").notNull(),
    validDate: text("valid_date").notNull(),
    montant: numeric("montant", { precision: 20, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "fec_entries_pk",
      columns: [table.sourceDocumentId, table.lineNumber],
    }),
    index("fec_entries_dossier_line_idx").on(table.dossierId, table.lineNumber),
    index("fec_entries_document_compte_idx").on(
      table.sourceDocumentId,
      table.compteNum,
    ),
    index("fec_entries_document_ecriture_idx").on(
      table.sourceDocumentId,
      table.ecritureNum,
    ),
    index("fec_entries_document_date_idx").on(
      table.sourceDocumentId,
      table.ecritureDate,
    ),
    check("fec_entries_line_number_ck", sql`${table.lineNumber} > 0`),
  ],
);

export const controlExecutions = pgTable(
  "control_executions",
  {
    id: uuid("id").primaryKey(),
    ingestionJobId: uuid("ingestion_job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    ruleVersion: text("rule_version").notNull(),
    status: controlExecutionStatusEnum("status").notNull().default("pending"),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (table) => [
    uniqueIndex("control_executions_job_rule_version_uq").on(
      table.ingestionJobId,
      table.ruleId,
      table.ruleVersion,
    ),
    index("control_executions_job_status_idx").on(table.ingestionJobId, table.status),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey(),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    controlExecutionId: uuid("control_execution_id").references(
      () => controlExecutions.id,
      { onDelete: "set null" },
    ),
    findingKey: text("finding_key").notNull(),
    family: findingFamilyEnum("family").notNull(),
    severity: findingSeverityEnum("severity").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("en_attente"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("findings_dossier_key_uq").on(table.dossierId, table.findingKey),
    index("findings_dossier_review_idx").on(table.dossierId, table.reviewStatus),
    index("findings_dossier_severity_idx").on(table.dossierId, table.severity),
  ],
);

export const findingEntries = pgTable(
  "finding_entries",
  {
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id").notNull(),
    lineNumber: integer("line_number").notNull(),
  },
  (table) => [
    primaryKey({
      name: "finding_entries_pk",
      columns: [table.findingId, table.sourceDocumentId, table.lineNumber],
    }),
    index("finding_entries_document_line_idx").on(
      table.sourceDocumentId,
      table.lineNumber,
    ),
    foreignKey({
      name: "finding_entries_fec_entry_fk",
      columns: [table.sourceDocumentId, table.lineNumber],
      foreignColumns: [fecEntries.sourceDocumentId, fecEntries.lineNumber],
    }).onDelete("cascade"),
  ],
);

export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey(),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "restrict" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "restrict" }),
    actorId: text("actor_external_id").notNull(),
    actorRole: text("actor_role").notNull(),
    previousStatus: reviewEventStatusEnum("previous_status").notNull(),
    newStatus: reviewEventStatusEnum("new_status").notNull(),
    comment: text("comment").notNull().default(""),
    relatedEvidenceIds: jsonb("related_evidence_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    previousEventHash: text("previous_event_hash"),
    eventHash: text("event_hash").notNull(),
  },
  (table) => [
    uniqueIndex("review_events_dossier_event_hash_uq").on(table.dossierId, table.eventHash),
    uniqueIndex("review_events_dossier_previous_hash_uq")
      .on(table.dossierId, table.previousEventHash)
      .where(sql`${table.previousEventHash} is not null`),
    uniqueIndex("review_events_dossier_root_uq")
      .on(table.dossierId)
      .where(sql`${table.previousEventHash} is null`),
    index("review_events_dossier_created_idx").on(table.dossierId, table.createdAt),
    index("review_events_finding_created_idx").on(table.findingId, table.createdAt),
    index("review_events_actor_created_idx").on(table.actorId, table.createdAt),
    check("review_events_event_hash_ck", sql`${table.eventHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "review_events_previous_hash_ck",
      sql`${table.previousEventHash} is null or ${table.previousEventHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const synthesisSnapshots = pgTable(
  "synthesis_snapshots",
  {
    id: uuid("id").primaryKey(),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "restrict" }),
    snapshotVersion: text("snapshot_version").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("synthesis_snapshots_dossier_version_idx").on(
      table.dossierId,
      table.snapshotVersion,
    ),
    uniqueIndex("synthesis_snapshots_dossier_hash_uq").on(
      table.dossierId,
      table.snapshotHash,
    ),
    index("synthesis_snapshots_dossier_created_idx").on(
      table.dossierId,
      table.createdAt,
    ),
  ],
);

export const reportArtifacts = pgTable(
  "report_artifacts",
  {
    id: uuid("id").primaryKey(),
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => synthesisSnapshots.id, { onDelete: "restrict" }),
    artifactType: text("artifact_type").notNull(),
    sha256: text("sha256").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageBucket: text("storage_bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    storageVersionId: text("storage_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_artifacts_dossier_hash_type_uq").on(
      table.dossierId,
      table.sha256,
      table.artifactType,
    ),
    index("report_artifacts_dossier_created_idx").on(table.dossierId, table.createdAt),
    check("report_artifacts_sha256_ck", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export type IngestionJobRow = typeof ingestionJobs.$inferSelect;
export type SourceDocumentRow = typeof sourceDocuments.$inferSelect;
export type FecEntryInsert = typeof fecEntries.$inferInsert;
