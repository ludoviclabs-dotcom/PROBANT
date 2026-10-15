BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM hr_runtime) OR EXISTS (SELECT 1 FROM hr_imports) OR EXISTS (SELECT 1 FROM hr_workpaper_versions) THEN
  RAISE EXCEPTION 'HR_RECONCILIATION_DATA_PREVENTS_DOWNGRADE';
 END IF;
END $$;
DROP TABLE IF EXISTS hr_runtime, hr_command_receipts, hr_workpaper_versions, hr_workpaper_heads, hr_source_heads, hr_import_approvals, hr_imports;
DROP FUNCTION IF EXISTS probant_hr_immutable();
COMMIT;
