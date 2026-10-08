BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM cash_imports) OR EXISTS (SELECT 1 FROM cash_workpaper_versions) THEN
  RAISE EXCEPTION 'CASH_RECONCILIATION_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS cash_command_receipts, cash_workpaper_versions, cash_workpaper_heads, cash_source_heads, cash_import_approvals, cash_imports;
DROP FUNCTION IF EXISTS probant_cash_immutable();
COMMIT;
