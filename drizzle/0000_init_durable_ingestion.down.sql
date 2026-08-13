-- Rollback autorisé uniquement sur une base vide/non-production.
-- En production, restaurer un point-in-time : ce script détruit les données.
DROP TABLE IF EXISTS "report_artifacts";
DROP TABLE IF EXISTS "review_events";
DROP TABLE IF EXISTS "finding_entries";
DROP TABLE IF EXISTS "findings";
DROP TABLE IF EXISTS "control_executions";
DROP TABLE IF EXISTS "synthesis_snapshots";
DROP TABLE IF EXISTS "fec_entries";
DROP TABLE IF EXISTS "ingestion_jobs";
DROP TABLE IF EXISTS "source_documents";
DROP TABLE IF EXISTS "dossiers";
DROP TABLE IF EXISTS "organizations";
DROP TYPE IF EXISTS "source_document_status";
DROP TYPE IF EXISTS "review_status";
DROP TYPE IF EXISTS "ingestion_job_status";
DROP TYPE IF EXISTS "finding_severity";
DROP TYPE IF EXISTS "finding_family";
DROP TYPE IF EXISTS "dossier_status";
DROP TYPE IF EXISTS "control_execution_status";
