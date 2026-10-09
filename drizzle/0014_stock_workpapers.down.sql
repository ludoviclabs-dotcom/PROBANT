BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM st_imports) OR EXISTS (SELECT 1 FROM st_workpaper_versions) THEN
  RAISE EXCEPTION 'STOCK_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS st_command_receipts, st_workpaper_versions, st_workpaper_heads, st_source_heads, st_import_approvals, st_imports;
DROP FUNCTION IF EXISTS probant_st_immutable();
COMMIT;
