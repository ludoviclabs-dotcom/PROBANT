-- Rollback ciblé et non destructif de la garde d'intégrité.
ALTER TABLE "source_documents"
  DROP CONSTRAINT IF EXISTS "source_documents_completed_integrity_ck";
