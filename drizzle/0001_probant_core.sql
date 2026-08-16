CREATE TABLE IF NOT EXISTS dossiers (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  siren text,
  fiscal_year text NOT NULL,
  storage_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_documents (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  file_name text NOT NULL,
  document_type text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  fingerprint text NOT NULL,
  private_object_path text NOT NULL,
  parser_version text,
  line_count integer,
  page_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  document_id text REFERENCES source_documents(id),
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  parser_version text,
  error_code text,
  error_message text,
  line_count integer,
  warning_count integer
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  document_id text NOT NULL REFERENCES source_documents(id),
  line_number integer NOT NULL,
  entry_payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS control_executions (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  control_id text NOT NULL,
  control_version text NOT NULL,
  status text NOT NULL,
  result_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  control_execution_id text REFERENCES control_executions(id),
  severity text NOT NULL,
  family text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS review_events (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  finding_id text NOT NULL REFERENCES findings(id),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  comment text,
  actor_label text NOT NULL,
  actor_role text NOT NULL,
  related_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synthesis_snapshots (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  snapshot_version text NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_artifacts (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id),
  artifact_type text NOT NULL,
  artifact_hash text NOT NULL,
  private_object_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_documents_dossier ON source_documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_dossier_status ON ingestion_jobs(dossier_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_dossier_line ON ledger_entries(dossier_id, line_number);
CREATE INDEX IF NOT EXISTS idx_findings_dossier ON findings(dossier_id);
CREATE INDEX IF NOT EXISTS idx_review_events_finding ON review_events(finding_id, created_at);
CREATE INDEX IF NOT EXISTS idx_synthesis_snapshots_dossier ON synthesis_snapshots(dossier_id, created_at DESC);

