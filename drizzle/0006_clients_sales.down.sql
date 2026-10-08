BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM clients_imports WHERE document_type IN ('clients_invoices','clients_payments','clients_credits','clients_support')) OR EXISTS (SELECT 1 FROM clients_workpaper_versions WHERE run->'template'->>'id'='clients.sales') THEN
  RAISE EXCEPTION 'CLIENTS_SALES_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
ALTER TABLE clients_imports DROP CONSTRAINT clients_imports_document_type_check;
ALTER TABLE clients_imports ADD CONSTRAINT clients_imports_document_type_check CHECK (document_type IN ('clients_general','clients_auxiliary','clients_aged'));
COMMIT;
