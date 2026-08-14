DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "review_events" LIMIT 1) THEN
    RAISE EXCEPTION 'review_events must be empty before 0002; migrate legacy events with verified hashes first';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."review_event_status" AS ENUM('pending', 'needs_evidence', 'confirmed', 'dismissed', 'corrected', 'superseded');--> statement-breakpoint
ALTER TABLE "review_events" DROP CONSTRAINT "review_events_finding_id_findings_id_fk";
--> statement-breakpoint
DROP INDEX "synthesis_snapshots_dossier_version_uq";--> statement-breakpoint
ALTER TABLE "review_events" ALTER COLUMN "previous_status" SET DATA TYPE "public"."review_event_status" USING "previous_status"::text::"public"."review_event_status";--> statement-breakpoint
ALTER TABLE "review_events" ALTER COLUMN "new_status" SET DATA TYPE "public"."review_event_status" USING "new_status"::text::"public"."review_event_status";--> statement-breakpoint
ALTER TABLE "review_events" ALTER COLUMN "comment" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "review_events" ALTER COLUMN "comment" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_events" ADD COLUMN "dossier_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "review_events" ADD COLUMN "previous_event_hash" text;--> statement-breakpoint
ALTER TABLE "review_events" ADD COLUMN "event_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_dossier_event_hash_uq" ON "review_events" USING btree ("dossier_id","event_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_dossier_previous_hash_uq" ON "review_events" USING btree ("dossier_id","previous_event_hash") WHERE "review_events"."previous_event_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_dossier_root_uq" ON "review_events" USING btree ("dossier_id") WHERE "review_events"."previous_event_hash" is null;--> statement-breakpoint
CREATE INDEX "review_events_dossier_created_idx" ON "review_events" USING btree ("dossier_id","created_at");--> statement-breakpoint
CREATE INDEX "synthesis_snapshots_dossier_version_idx" ON "synthesis_snapshots" USING btree ("dossier_id","snapshot_version");--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_event_hash_ck" CHECK ("review_events"."event_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_previous_hash_ck" CHECK ("review_events"."previous_event_hash" is null or "review_events"."previous_event_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "probant_reject_review_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_events are append-only; append a correction event instead' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "review_events_append_only_update" BEFORE UPDATE ON "review_events" FOR EACH ROW EXECUTE FUNCTION "probant_reject_review_event_mutation"();--> statement-breakpoint
CREATE TRIGGER "review_events_append_only_delete" BEFORE DELETE ON "review_events" FOR EACH ROW EXECUTE FUNCTION "probant_reject_review_event_mutation"();
