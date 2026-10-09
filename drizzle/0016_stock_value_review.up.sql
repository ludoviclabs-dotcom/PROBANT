BEGIN;
-- Mission 15, sub-lot 3: cited value hypotheses become a stock source.
ALTER TABLE st_imports DROP CONSTRAINT IF EXISTS st_imports_document_type_check;
ALTER TABLE st_imports ADD CONSTRAINT st_imports_document_type_check CHECK (document_type IN ('st_count','st_system','st_movements','st_support','st_costs','st_ledger','st_value'));
ALTER TABLE st_source_heads DROP CONSTRAINT IF EXISTS st_source_heads_document_type_check;
ALTER TABLE st_source_heads ADD CONSTRAINT st_source_heads_document_type_check CHECK (document_type IN ('st_count','st_system','st_movements','st_support','st_costs','st_ledger','st_value'));
COMMIT;
