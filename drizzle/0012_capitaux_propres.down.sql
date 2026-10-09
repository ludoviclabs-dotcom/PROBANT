BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM eq_imports) OR EXISTS (SELECT 1 FROM eq_workpaper_versions) THEN
  RAISE EXCEPTION 'EQUITY_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS eq_command_receipts, eq_workpaper_versions, eq_workpaper_heads, eq_source_heads, eq_import_approvals, eq_imports;
DROP FUNCTION IF EXISTS probant_eq_immutable();
COMMIT;
