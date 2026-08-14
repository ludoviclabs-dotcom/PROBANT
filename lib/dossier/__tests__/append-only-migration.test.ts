import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("review_events database guard", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0002_append_only_review_evidence.sql"),
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
});

