BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM fa_imports) OR EXISTS (SELECT 1 FROM fa_workpaper_versions) THEN
  RAISE EXCEPTION 'FIXED_ASSETS_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS fa_command_receipts, fa_workpaper_versions, fa_workpaper_heads, fa_source_heads, fa_import_approvals, fa_imports;
DROP FUNCTION IF EXISTS probant_fa_immutable();
COMMIT;
