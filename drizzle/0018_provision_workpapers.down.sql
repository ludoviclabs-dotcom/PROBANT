BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pv_imports) OR EXISTS (SELECT 1 FROM pv_workpaper_versions) THEN
  RAISE EXCEPTION 'PROVISION_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS pv_command_receipts, pv_workpaper_versions, pv_workpaper_heads, pv_source_heads, pv_import_approvals, pv_imports;
DROP FUNCTION IF EXISTS probant_pv_immutable();
COMMIT;
