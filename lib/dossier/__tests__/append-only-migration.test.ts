import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("review_events database guard", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0002_append_only_review_evidence.sql"),
    "utf8",
  );
  const taxReviewMigration = readFileSync(
    resolve(process.cwd(), "drizzle/0004_tax_review_evidence.sql"),
    "utf8",
  );

  it("interdit UPDATE et DELETE au niveau PostgreSQL", () => {
    expect(migration).toContain('CREATE TRIGGER "review_events_append_only_update" BEFORE UPDATE');
    expect(migration).toContain('CREATE TRIGGER "review_events_append_only_delete" BEFORE DELETE');
    expect(migration).toContain("append a correction event instead");
  });

  it("contraint les hashes complets et empêche les forks", () => {
    expect(migration).toContain("review_events_event_hash_ck");
    expect(migration).toContain("review_events_previous_hash_ck");
    expect(migration).toContain("review_events_dossier_previous_hash_uq");
    expect(migration).toContain("review_events_dossier_root_uq");
  });

  it("conserve l'action fiscale et l'organisation sans réécrire les événements historiques", () => {
    expect(taxReviewMigration).toContain('ADD COLUMN "organization_id" uuid');
    expect(taxReviewMigration).toContain('ADD COLUMN "action" text');
    expect(taxReviewMigration).toContain("review_events_tax_action_ck");
    expect(taxReviewMigration).toContain('"action" IS NULL');
    expect(taxReviewMigration).toContain("probant_assert_review_event_organization_scope");
    expect(taxReviewMigration).toContain("REVIEW_EVENT_ORGANIZATION_SCOPE_MISMATCH");
    expect(taxReviewMigration).toContain('CREATE TRIGGER "review_events_organization_scope_insert"');
  });
});

