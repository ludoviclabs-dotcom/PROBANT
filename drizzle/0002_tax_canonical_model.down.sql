BEGIN;

DROP TRIGGER IF EXISTS trg_fiscal_synthesis_immutable ON synthesis_snapshots;
DROP TRIGGER IF EXISTS trg_tax_computation_snapshots_immutable ON tax_computation_snapshots;
DROP TRIGGER IF EXISTS trg_tax_adjustments_immutable ON tax_adjustments;
DROP TRIGGER IF EXISTS trg_tax_reconciliation_lines_immutable ON tax_reconciliation_lines;
DROP TRIGGER IF EXISTS trg_tax_control_executions_immutable ON tax_control_executions;
DROP TRIGGER IF EXISTS trg_tax_declaration_fields_immutable ON tax_declaration_fields;
DROP TRIGGER IF EXISTS trg_tax_documents_immutable ON tax_documents;
DROP TRIGGER IF EXISTS trg_tax_periods_immutable ON tax_periods;
DROP TRIGGER IF EXISTS trg_tax_profiles_immutable ON tax_profiles;

DROP TABLE IF EXISTS tax_computation_snapshots;
DROP TABLE IF EXISTS tax_adjustments;
DROP TABLE IF EXISTS tax_reconciliation_lines;

ALTER TABLE findings DROP CONSTRAINT IF EXISTS fk_findings_tax_control_execution;
DROP INDEX IF EXISTS idx_findings_domain;
ALTER TABLE findings DROP COLUMN IF EXISTS tax_control_execution_id;
ALTER TABLE findings DROP COLUMN IF EXISTS domain;

DROP TABLE IF EXISTS tax_control_executions;
DROP TABLE IF EXISTS tax_declaration_fields;
DROP TABLE IF EXISTS tax_documents;
DROP TABLE IF EXISTS tax_periods;
DROP TABLE IF EXISTS tax_profiles;

DROP FUNCTION IF EXISTS probant_reject_tax_snapshot_mutation();
DROP FUNCTION IF EXISTS probant_reject_fiscal_synthesis_mutation();
DROP INDEX IF EXISTS uq_fiscal_synthesis_scope_period_version;
ALTER TABLE synthesis_snapshots DROP COLUMN IF EXISTS form_vintage;
ALTER TABLE synthesis_snapshots DROP COLUMN IF EXISTS fiscal_year;
ALTER TABLE synthesis_snapshots DROP COLUMN IF EXISTS snapshot_kind;
ALTER TABLE synthesis_snapshots DROP COLUMN IF EXISTS organization_id;
DROP INDEX IF EXISTS uq_dossiers_organization_id;
ALTER TABLE dossiers DROP COLUMN IF EXISTS organization_id;

COMMIT;

