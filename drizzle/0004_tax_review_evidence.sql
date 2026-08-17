-- TAX-09 : métadonnées fiscales optionnelles couvertes par event_hash.
-- Les lignes historiques conservent NULL : leur payload de hash reste inchangé.
ALTER TABLE "review_events" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "review_events" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_tax_action_ck" CHECK (
  "action" IS NULL OR "action" IN (
    'confirm',
    'dismiss',
    'request_evidence',
    'correct',
    'replace',
    'mark_not_applicable',
    'mark_inconclusive',
    'attach_evidence'
  )
);--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_tax_action_organization_ck" CHECK (
  "action" IS NULL OR "organization_id" IS NOT NULL
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "probant_assert_review_event_organization_scope"()
RETURNS trigger AS $$
DECLARE
  dossier_organization_id uuid;
BEGIN
  IF NEW."organization_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "organization_id" INTO dossier_organization_id
  FROM "dossiers"
  WHERE "id" = NEW."dossier_id";
  IF dossier_organization_id IS NULL OR dossier_organization_id IS DISTINCT FROM NEW."organization_id" THEN
    RAISE EXCEPTION 'REVIEW_EVENT_ORGANIZATION_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "review_events_organization_scope_insert"
BEFORE INSERT ON "review_events"
FOR EACH ROW EXECUTE FUNCTION "probant_assert_review_event_organization_scope"();
