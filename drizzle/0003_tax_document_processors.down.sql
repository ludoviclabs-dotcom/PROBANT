BEGIN;

DROP INDEX IF EXISTS idx_tax_declaration_fields_document_vintage_code;
CREATE UNIQUE INDEX uq_tax_declaration_fields_document_vintage_code
  ON tax_declaration_fields (
    organization_id,
    dossier_id,
    tax_document_id,
    form_vintage,
    field_code
  );

ALTER TABLE tax_declaration_fields
  DROP CONSTRAINT IF EXISTS ck_tax_declaration_fields_automation_eligibility,
  DROP CONSTRAINT IF EXISTS ck_tax_declaration_fields_confidence,
  DROP COLUMN IF EXISTS usable_for_automated_calculation,
  DROP COLUMN IF EXISTS processing_status,
  DROP COLUMN IF EXISTS confidence_basis_points,
  DROP COLUMN IF EXISTS document_hash;

ALTER TABLE source_documents
  DROP COLUMN IF EXISTS ingestion_metadata;

COMMIT;

