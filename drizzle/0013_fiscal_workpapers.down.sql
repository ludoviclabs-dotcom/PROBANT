BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM fx_imports) OR EXISTS (SELECT 1 FROM fx_workpaper_versions) THEN
  RAISE EXCEPTION 'FISCAL_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS fx_command_receipts, fx_workpaper_versions, fx_workpaper_heads, fx_source_heads, fx_import_approvals, fx_imports;
DROP FUNCTION IF EXISTS probant_fx_immutable();
COMMIT;
