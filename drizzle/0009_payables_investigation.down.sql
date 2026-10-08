BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM clients_imports WHERE document_type IN (
  'payables_general','payables_auxiliary','payables_aged','purchases_ledger','payables_invoices','payables_performance',
  'payables_recognition','payables_adjustments','payables_payments','payables_support','cutoff_sales'
 )) OR EXISTS (SELECT 1 FROM clients_workpaper_versions WHERE run->'template'->>'id' IN ('payables.frame','payables.purchases','payables.rpne')) THEN
  RAISE EXCEPTION 'PAYABLES_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
ALTER TABLE clients_imports DROP CONSTRAINT clients_imports_document_type_check;
ALTER TABLE clients_imports ADD CONSTRAINT clients_imports_document_type_check CHECK (document_type IN (
 'clients_general','clients_auxiliary','clients_aged','clients_invoices','clients_payments','clients_credits','clients_support'
));
COMMIT;
