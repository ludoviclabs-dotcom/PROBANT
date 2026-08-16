BEGIN;

ALTER TABLE dossiers
  ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'legacy';

CREATE UNIQUE INDEX IF NOT EXISTS uq_dossiers_organization_id
  ON dossiers (organization_id, id);

ALTER TABLE synthesis_snapshots
  ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'legacy';
ALTER TABLE synthesis_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_kind text NOT NULL DEFAULT 'dossier';
ALTER TABLE synthesis_snapshots
  ADD COLUMN IF NOT EXISTS fiscal_year integer;
ALTER TABLE synthesis_snapshots
  ADD COLUMN IF NOT EXISTS form_vintage integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_synthesis_scope_period_version
  ON synthesis_snapshots (
    organization_id, dossier_id, fiscal_year, form_vintage, snapshot_version
  )
  WHERE snapshot_kind = 'fiscal_tax';

CREATE TABLE IF NOT EXISTS tax_profiles (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  entity_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  version text NOT NULL,
  status text NOT NULL,
  turnover_amount_cents bigint,
  canonical_json text NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tax_profiles_period CHECK (period_end >= period_start),
  CONSTRAINT ck_tax_profiles_turnover_cents CHECK (
    turnover_amount_cents IS NULL OR turnover_amount_cents >= 0
  ),
  CONSTRAINT ck_tax_profiles_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_profiles_scope_period_version UNIQUE (
    organization_id, dossier_id, period_start, period_end, version
  ),
  CONSTRAINT uq_tax_profiles_scope_id_version UNIQUE (
    organization_id, dossier_id, id, version
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_profiles_scope
  ON tax_profiles (organization_id, dossier_id);

CREATE TABLE IF NOT EXISTS tax_periods (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  entity_id text NOT NULL,
  tax_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  fiscal_year integer NOT NULL,
  form_vintage integer NOT NULL,
  frequency text NOT NULL,
  version text NOT NULL,
  canonical_json text NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tax_periods_range CHECK (period_end >= period_start),
  CONSTRAINT ck_tax_periods_fiscal_year CHECK (fiscal_year BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_periods_form_vintage CHECK (form_vintage BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_periods_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_periods_scope_type_period_version UNIQUE (
    organization_id, dossier_id, tax_type, period_start, period_end, version
  ),
  CONSTRAINT uq_tax_periods_scope_id UNIQUE (organization_id, dossier_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tax_periods_scope
  ON tax_periods (organization_id, dossier_id);

CREATE TABLE IF NOT EXISTS tax_documents (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  entity_id text NOT NULL,
  logical_document_id text NOT NULL,
  source_document_id text NOT NULL,
  tax_period_id text NOT NULL,
  tax_period_version text NOT NULL,
  tax_type text NOT NULL,
  document_type text NOT NULL,
  form_number text NOT NULL,
  form_vintage integer NOT NULL,
  snapshot_version text NOT NULL,
  status text NOT NULL,
  source_hash text NOT NULL,
  canonical_json text NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_documents_period_scope
    FOREIGN KEY (organization_id, dossier_id, tax_period_id)
    REFERENCES tax_periods (organization_id, dossier_id, id),
  CONSTRAINT ck_tax_documents_form_vintage CHECK (form_vintage BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_documents_source_hash CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_tax_documents_snapshot_hash CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_documents_scope_logical_version UNIQUE (
    organization_id, dossier_id, tax_period_id, logical_document_id, snapshot_version
  ),
  CONSTRAINT uq_tax_documents_scope_id UNIQUE (organization_id, dossier_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_scope_period
  ON tax_documents (organization_id, dossier_id, tax_period_id);

CREATE TABLE IF NOT EXISTS tax_declaration_fields (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  tax_document_id text NOT NULL,
  form_vintage integer NOT NULL,
  field_code text NOT NULL,
  data_type text NOT NULL,
  amount_cents bigint,
  percentage_basis_points integer,
  field_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_declaration_fields_document_scope
    FOREIGN KEY (organization_id, dossier_id, tax_document_id)
    REFERENCES tax_documents (organization_id, dossier_id, id),
  CONSTRAINT ck_tax_declaration_fields_form_vintage CHECK (form_vintage BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_declaration_fields_basis_points CHECK (
    percentage_basis_points IS NULL OR percentage_basis_points BETWEEN 0 AND 10000
  ),
  CONSTRAINT ck_tax_declaration_fields_hash CHECK (field_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_declaration_fields_document_vintage_code UNIQUE (
    organization_id, dossier_id, tax_document_id, form_vintage, field_code
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_declaration_fields_scope
  ON tax_declaration_fields (organization_id, dossier_id, tax_document_id);

CREATE TABLE IF NOT EXISTS tax_control_executions (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  entity_id text NOT NULL,
  tax_period_id text NOT NULL,
  fiscal_year integer NOT NULL,
  form_vintage integer NOT NULL,
  execution_version text NOT NULL,
  control_id text NOT NULL,
  control_version text NOT NULL,
  definition_hash text NOT NULL,
  tax_profile_id text NOT NULL,
  tax_profile_version text NOT NULL,
  status text NOT NULL,
  proposed_outcome text,
  evidence_strength text NOT NULL,
  engine_version text NOT NULL,
  canonical_json text NOT NULL,
  execution_hash text NOT NULL,
  payload jsonb NOT NULL,
  executed_at timestamptz NOT NULL,
  CONSTRAINT fk_tax_control_executions_period_scope
    FOREIGN KEY (organization_id, dossier_id, tax_period_id)
    REFERENCES tax_periods (organization_id, dossier_id, id),
  CONSTRAINT fk_tax_control_executions_profile_scope
    FOREIGN KEY (organization_id, dossier_id, tax_profile_id, tax_profile_version)
    REFERENCES tax_profiles (organization_id, dossier_id, id, version),
  CONSTRAINT ck_tax_control_executions_fiscal_year CHECK (fiscal_year BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_control_executions_form_vintage CHECK (form_vintage BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_control_executions_hashes CHECK (
    definition_hash ~ '^[0-9a-f]{64}$' AND execution_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT uq_tax_control_executions_scope_control_version UNIQUE (
    organization_id, dossier_id, tax_period_id, control_id, control_version, execution_version
  ),
  CONSTRAINT uq_tax_control_executions_scope_id UNIQUE (organization_id, dossier_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tax_control_executions_scope_period
  ON tax_control_executions (organization_id, dossier_id, tax_period_id);

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'accounting';

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS tax_control_execution_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_findings_tax_control_execution'
  ) THEN
    ALTER TABLE findings
      ADD CONSTRAINT fk_findings_tax_control_execution
      FOREIGN KEY (tax_control_execution_id) REFERENCES tax_control_executions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_findings_domain
  ON findings (dossier_id, domain);

CREATE TABLE IF NOT EXISTS tax_reconciliation_lines (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  execution_id text NOT NULL,
  line_key text NOT NULL,
  difference_amount_cents bigint,
  tolerance_amount_cents bigint NOT NULL,
  status text NOT NULL,
  canonical_json text NOT NULL,
  line_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_reconciliation_lines_execution_scope
    FOREIGN KEY (organization_id, dossier_id, execution_id)
    REFERENCES tax_control_executions (organization_id, dossier_id, id),
  CONSTRAINT ck_tax_reconciliation_lines_tolerance CHECK (tolerance_amount_cents >= 0),
  CONSTRAINT ck_tax_reconciliation_lines_hash CHECK (line_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_reconciliation_lines_execution_key UNIQUE (
    organization_id, dossier_id, execution_id, line_key
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_reconciliation_lines_scope
  ON tax_reconciliation_lines (organization_id, dossier_id, execution_id);

CREATE TABLE IF NOT EXISTS tax_adjustments (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  execution_id text NOT NULL,
  tax_period_id text NOT NULL,
  tax_type text NOT NULL,
  version text NOT NULL,
  adjustment_code text NOT NULL,
  direction text NOT NULL,
  base_amount_cents bigint,
  tax_amount_cents bigint,
  proposal_status text NOT NULL,
  review_status text NOT NULL,
  review_event_id text,
  canonical_json text NOT NULL,
  adjustment_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_adjustments_execution_scope
    FOREIGN KEY (organization_id, dossier_id, execution_id)
    REFERENCES tax_control_executions (organization_id, dossier_id, id),
  CONSTRAINT fk_tax_adjustments_period_scope
    FOREIGN KEY (organization_id, dossier_id, tax_period_id)
    REFERENCES tax_periods (organization_id, dossier_id, id),
  CONSTRAINT ck_tax_adjustments_hash CHECK (adjustment_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_adjustments_execution_code_version UNIQUE (
    organization_id, dossier_id, execution_id, adjustment_code, version
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_adjustments_scope_period
  ON tax_adjustments (organization_id, dossier_id, tax_period_id);

CREATE TABLE IF NOT EXISTS tax_computation_snapshots (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dossier_id text NOT NULL,
  entity_id text NOT NULL,
  tax_period_id text NOT NULL,
  fiscal_year integer NOT NULL,
  form_vintage integer NOT NULL,
  tax_type text NOT NULL,
  calculation_type text NOT NULL,
  calculation_version text NOT NULL,
  evidence_strength text NOT NULL,
  canonical_json text NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_computation_snapshots_period_scope
    FOREIGN KEY (organization_id, dossier_id, tax_period_id)
    REFERENCES tax_periods (organization_id, dossier_id, id),
  CONSTRAINT ck_tax_computation_snapshots_fiscal_year CHECK (fiscal_year BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_computation_snapshots_form_vintage CHECK (form_vintage BETWEEN 2000 AND 2200),
  CONSTRAINT ck_tax_computation_snapshots_hash CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_tax_computation_snapshots_scope_period_version UNIQUE (
    organization_id, dossier_id, tax_period_id, calculation_type, calculation_version
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_computation_snapshots_scope_period
  ON tax_computation_snapshots (organization_id, dossier_id, tax_period_id);

CREATE OR REPLACE FUNCTION probant_reject_tax_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable tax artifact: create a new version instead';
END;
$$;

CREATE OR REPLACE FUNCTION probant_reject_fiscal_synthesis_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.snapshot_kind = 'fiscal_tax' THEN
    RAISE EXCEPTION 'immutable fiscal synthesis: create a new version instead';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_synthesis_immutable ON synthesis_snapshots;
CREATE TRIGGER trg_fiscal_synthesis_immutable
  BEFORE UPDATE OR DELETE ON synthesis_snapshots
  FOR EACH ROW EXECUTE FUNCTION probant_reject_fiscal_synthesis_mutation();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tax_profiles',
    'tax_periods',
    'tax_documents',
    'tax_declaration_fields',
    'tax_control_executions',
    'tax_reconciliation_lines',
    'tax_adjustments',
    'tax_computation_snapshots'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_immutable', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION probant_reject_tax_snapshot_mutation()',
      'trg_' || table_name || '_immutable',
      table_name
    );
  END LOOP;
END $$;

COMMIT;

