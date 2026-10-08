BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM clients_imports WHERE document_type LIKE 'equity_%') OR EXISTS (SELECT 1 FROM clients_workpaper_versions WHERE run->'template'->>'id'='equity.review') THEN RAISE EXCEPTION 'EQUITY_DATA_PREVENTS_ROLLBACK'; END IF;
END $$;
-- Restore the prior closed source contract; refuse rollback while equity data exists.
ALTER TABLE clients_imports DROP CONSTRAINT clients_imports_document_type_check;
ALTER TABLE clients_imports ADD CONSTRAINT clients_imports_document_type_check CHECK (document_type IN (
 'clients_general','clients_auxiliary','clients_aged','clients_invoices','clients_payments','clients_credits','clients_support',
 'payables_general','payables_auxiliary','payables_aged','purchases_ledger','payables_invoices','payables_performance',
 'payables_recognition','payables_adjustments','payables_payments','payables_support','cutoff_sales'
));
COMMIT;
