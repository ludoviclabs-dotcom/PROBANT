CREATE TYPE "public"."probant_role" AS ENUM('preparer', 'reviewer', 'signer', 'admin');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_sha256" text NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"roles" jsonb NOT NULL,
	"acr" text,
	"amr" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mfa_satisfied" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_sessions_token_sha256_ck" CHECK ("auth_sessions"."token_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_sessions_absolute_after_idle_ck" CHECK ("auth_sessions"."absolute_expires_at" >= "auth_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "probant_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pk" PRIMARY KEY("organization_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "upload_quota_counters" (
	"organization_id" uuid NOT NULL,
	"window_kind" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"byte_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_quota_counters_pk" PRIMARY KEY("organization_id","window_kind","window_start"),
	CONSTRAINT "upload_quota_counters_request_ck" CHECK ("upload_quota_counters"."request_count" >= 0),
	CONSTRAINT "upload_quota_counters_byte_ck" CHECK ("upload_quota_counters"."byte_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_quota_counters" ADD CONSTRAINT "upload_quota_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_sha256_uq" ON "auth_sessions" USING btree ("token_sha256");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_created_idx" ON "auth_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("idle_expires_at");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upload_quota_counters_window_idx" ON "upload_quota_counters" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "users_external_subject_uq" ON "users" USING btree ("external_subject");