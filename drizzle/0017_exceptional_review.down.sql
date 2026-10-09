BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM clients_imports WHERE document_type LIKE 'exceptional_%') OR EXISTS (SELECT 1 FROM clients_workpaper_versions WHERE run->'template'->>'id'='exceptional.review') THEN RAISE EXCEPTION 'EXCEPTIONAL_ROLLBACK_DATA_PRESENT'; END IF;
END $$;
ALTER TABLE clients_imports DROP CONSTRAINT clients_imports_document_type_check;
ALTER TABLE clients_imports ADD CONSTRAINT clients_imports_document_type_check CHECK (document_type IN (
 'clients_general','clients_auxiliary','clients_aged','clients_invoices','clients_payments','clients_credits','clients_support',
 'payables_general','payables_auxiliary','payables_aged','purchases_ledger','payables_invoices','payables_performance',
 'payables_recognition','payables_adjustments','payables_payments','payables_support','cutoff_sales', 'equity_balances', 'equity_ledger', 'equity_variation', 'equity_decisions', 'equity_payments', 'equity_minutes', 'equity_acts','investment_register','investment_rights','investment_distributions','investment_ledger','investment_receipts','investment_carrying','investment_models'
));
COMMIT;
