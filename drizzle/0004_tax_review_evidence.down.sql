-- Annulation TAX-09. Cette opération est destructive pour les métadonnées
-- fiscales; elle ne doit jamais servir à réécrire un historique remis.
DROP TRIGGER IF EXISTS "review_events_organization_scope_insert" ON "review_events";
DROP FUNCTION IF EXISTS "probant_assert_review_event_organization_scope"();
ALTER TABLE "review_events" DROP CONSTRAINT IF EXISTS "review_events_tax_action_organization_ck";
ALTER TABLE "review_events" DROP CONSTRAINT IF EXISTS "review_events_tax_action_ck";
ALTER TABLE "review_events" DROP CONSTRAINT IF EXISTS "review_events_organization_id_organizations_id_fk";
ALTER TABLE "review_events" DROP COLUMN IF EXISTS "action";
ALTER TABLE "review_events" DROP COLUMN IF EXISTS "organization_id";
