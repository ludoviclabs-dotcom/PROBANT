BEGIN;

DROP TRIGGER IF EXISTS trg_tax_declaration_fields_immutable
  ON tax_declaration_fields;

ALTER TABLE source_documents
  ADD COLUMN ingestion_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tax_declaration_fields
  ADD COLUMN document_hash text,
  ADD COLUMN confidence_basis_points integer NOT NULL DEFAULT 10000,
  ADD COLUMN processing_status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN usable_for_automated_calculation boolean NOT NULL DEFAULT true;

UPDATE tax_declaration_fields AS field
SET document_hash = document.source_hash
FROM tax_documents AS document
WHERE document.id = field.tax_document_id;

ALTER TABLE tax_declaration_fields
  ALTER COLUMN document_hash SET NOT NULL,
  ALTER COLUMN confidence_basis_points DROP DEFAULT,
  ALTER COLUMN processing_status DROP DEFAULT,
  ALTER COLUMN usable_for_automated_calculation DROP DEFAULT;

ALTER TABLE tax_declaration_fields
  ADD CONSTRAINT ck_tax_declaration_fields_confidence
    CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  ADD CONSTRAINT ck_tax_declaration_fields_automation_eligibility
    CHECK (processing_status = 'accepted' OR usable_for_automated_calculation = false);

DROP INDEX IF EXISTS uq_tax_declaration_fields_document_vintage_code;
CREATE INDEX idx_tax_declaration_fields_document_vintage_code
  ON tax_declaration_fields (
    organization_id,
    dossier_id,
    tax_document_id,
    form_vintage,
    field_code
  );

CREATE TRIGGER trg_tax_declaration_fields_immutable
  BEFORE UPDATE OR DELETE ON tax_declaration_fields
  FOR EACH ROW EXECUTE FUNCTION probant_reject_tax_snapshot_mutation();

COMMIT;

