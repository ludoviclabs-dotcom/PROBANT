BEGIN;
DROP TABLE IF EXISTS clients_command_receipts, clients_workpaper_versions, clients_workpaper_heads, clients_source_heads, clients_import_approvals, clients_imports;
DROP FUNCTION IF EXISTS probant_clients_immutable();
DROP INDEX IF EXISTS clients_dossier_org_uq;
COMMIT;

