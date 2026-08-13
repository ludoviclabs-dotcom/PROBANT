CREATE TYPE "public"."control_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."dossier_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."finding_family" AS ENUM('hardLaw', 'methodology', 'internal');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('bloquant', 'majeur', 'mineur', 'informatif');--> statement-breakpoint
CREATE TYPE "public"."ingestion_job_status" AS ENUM('created', 'uploading', 'uploaded', 'fingerprinting', 'parsing', 'validating', 'running_controls', 'building_snapshot', 'completed', 'failed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('en_attente', 'valide', 'ecarte', 'corrige', 'pending', 'needs_evidence', 'confirmed', 'dismissed', 'corrected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'completed', 'failed', 'quarantined');--> statement-breakpoint
CREATE TABLE "control_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ingestion_job_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"status" "control_execution_status" DEFAULT 'pending' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "dossiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"status" "dossier_status" DEFAULT 'active' NOT NULL,
	"legal_name" text,
	"siren" text,
	"financial_year" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fec_entries" (
	"source_document_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"journal_code" text NOT NULL,
	"journal_lib" text NOT NULL,
	"ecriture_num" text NOT NULL,
	"ecriture_date" text NOT NULL,
	"compte_num" text NOT NULL,
	"compte_lib" text NOT NULL,
	"comp_aux_num" text NOT NULL,
	"comp_aux_lib" text NOT NULL,
	"piece_ref" text NOT NULL,
	"piece_date" text NOT NULL,
	"ecriture_lib" text NOT NULL,
	"debit" numeric(20, 2) NOT NULL,
	"credit" numeric(20, 2) NOT NULL,
	"ecriture_let" text NOT NULL,
	"date_let" text NOT NULL,
	"valid_date" text NOT NULL,
	"montant" numeric(20, 2) NOT NULL,
	CONSTRAINT "fec_entries_pk" PRIMARY KEY("source_document_id","line_number"),
	CONSTRAINT "fec_entries_line_number_ck" CHECK ("fec_entries"."line_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "finding_entries" (
	"finding_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	CONSTRAINT "finding_entries_pk" PRIMARY KEY("finding_id","source_document_id","line_number")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dossier_id" uuid NOT NULL,
	"control_execution_id" uuid,
	"finding_key" text NOT NULL,
	"family" "finding_family" NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"review_status" "review_status" DEFAULT 'en_attente' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"status" "ingestion_job_status" DEFAULT 'created' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"parser_version" text NOT NULL,
	"request_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"line_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"queue_published_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_jobs_attempt_ck" CHECK ("ingestion_jobs"."attempt" >= 0),
	CONSTRAINT "ingestion_jobs_line_count_ck" CHECK ("ingestion_jobs"."line_count" >= 0),
	CONSTRAINT "ingestion_jobs_warning_count_ck" CHECK ("ingestion_jobs"."warning_count" >= 0),
	CONSTRAINT "ingestion_jobs_terminal_completed_at_ck" CHECK (("ingestion_jobs"."status" not in ('completed', 'failed', 'quarantined')) or "ingestion_jobs"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dossier_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"sha256" text NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_artifacts_sha256_ck" CHECK ("report_artifacts"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"finding_id" uuid NOT NULL,
	"previous_status" "review_status" NOT NULL,
	"new_status" "review_status" NOT NULL,
	"actor_external_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"comment" text,
	"related_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"document_type" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"observed_mime_type" text,
	"declared_byte_size" bigint NOT NULL,
	"declared_checksum_sha256" text,
	"observed_byte_size" bigint,
	"sha256" text,
	"storage_provider" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_version_id" text,
	"status" "source_document_status" DEFAULT 'pending_upload' NOT NULL,
	"parser_version" text,
	"line_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "source_documents_declared_size_ck" CHECK ("source_documents"."declared_byte_size" >= 0),
	CONSTRAINT "source_documents_observed_size_ck" CHECK ("source_documents"."observed_byte_size" is null or "source_documents"."observed_byte_size" >= 0),
	CONSTRAINT "source_documents_sha256_ck" CHECK ("source_documents"."sha256" is null or "source_documents"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "synthesis_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dossier_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"snapshot_version" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_executions" ADD CONSTRAINT "control_executions_ingestion_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("ingestion_job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fec_entries" ADD CONSTRAINT "fec_entries_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fec_entries" ADD CONSTRAINT "fec_entries_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_entries" ADD CONSTRAINT "finding_entries_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_entries" ADD CONSTRAINT "finding_entries_fec_entry_fk" FOREIGN KEY ("source_document_id","line_number") REFERENCES "public"."fec_entries"("source_document_id","line_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_control_execution_id_control_executions_id_fk" FOREIGN KEY ("control_execution_id") REFERENCES "public"."control_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_snapshot_id_synthesis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."synthesis_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_snapshots" ADD CONSTRAINT "synthesis_snapshots_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_snapshots" ADD CONSTRAINT "synthesis_snapshots_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "control_executions_job_rule_version_uq" ON "control_executions" USING btree ("ingestion_job_id","rule_id","rule_version");--> statement-breakpoint
CREATE INDEX "control_executions_job_status_idx" ON "control_executions" USING btree ("ingestion_job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_org_external_ref_uq" ON "dossiers" USING btree ("organization_id","external_ref");--> statement-breakpoint
CREATE INDEX "dossiers_org_updated_idx" ON "dossiers" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "fec_entries_dossier_line_idx" ON "fec_entries" USING btree ("dossier_id","line_number");--> statement-breakpoint
CREATE INDEX "fec_entries_document_compte_idx" ON "fec_entries" USING btree ("source_document_id","compte_num");--> statement-breakpoint
CREATE INDEX "fec_entries_document_ecriture_idx" ON "fec_entries" USING btree ("source_document_id","ecriture_num");--> statement-breakpoint
CREATE INDEX "fec_entries_document_date_idx" ON "fec_entries" USING btree ("source_document_id","ecriture_date");--> statement-breakpoint
CREATE INDEX "finding_entries_document_line_idx" ON "finding_entries" USING btree ("source_document_id","line_number");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_dossier_key_uq" ON "findings" USING btree ("dossier_id","finding_key");--> statement-breakpoint
CREATE INDEX "findings_dossier_review_idx" ON "findings" USING btree ("dossier_id","review_status");--> statement-breakpoint
CREATE INDEX "findings_dossier_severity_idx" ON "findings" USING btree ("dossier_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_jobs_dossier_idempotency_uq" ON "ingestion_jobs" USING btree ("dossier_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_org_status_created_idx" ON "ingestion_jobs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_document_created_idx" ON "ingestion_jobs" USING btree ("source_document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_dossier_hash_type_uq" ON "report_artifacts" USING btree ("dossier_id","sha256","artifact_type");--> statement-breakpoint
CREATE INDEX "report_artifacts_dossier_created_idx" ON "report_artifacts" USING btree ("dossier_id","created_at");--> statement-breakpoint
CREATE INDEX "review_events_finding_created_idx" ON "review_events" USING btree ("finding_id","created_at");--> statement-breakpoint
CREATE INDEX "review_events_actor_created_idx" ON "review_events" USING btree ("actor_external_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_dossier_sha256_uq" ON "source_documents" USING btree ("dossier_id","sha256") WHERE "source_documents"."sha256" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_storage_object_uq" ON "source_documents" USING btree ("storage_provider","storage_bucket","storage_key","storage_version_id");--> statement-breakpoint
CREATE INDEX "source_documents_dossier_status_idx" ON "source_documents" USING btree ("dossier_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_snapshots_dossier_version_uq" ON "synthesis_snapshots" USING btree ("dossier_id","snapshot_version");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_snapshots_dossier_hash_uq" ON "synthesis_snapshots" USING btree ("dossier_id","snapshot_hash");--> statement-breakpoint
CREATE INDEX "synthesis_snapshots_dossier_created_idx" ON "synthesis_snapshots" USING btree ("dossier_id","created_at");