BEGIN;
ALTER TABLE clients_imports DROP CONSTRAINT clients_imports_document_type_check;
ALTER TABLE clients_imports ADD CONSTRAINT clients_imports_document_type_check CHECK (document_type IN ('clients_general','clients_auxiliary','clients_aged','clients_invoices','clients_payments','clients_credits','clients_support'));
COMMIT;
