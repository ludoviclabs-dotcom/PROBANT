import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_TABLES = [
  "dossiers",
  "source_documents",
  "ingestion_jobs",
  "ledger_entries",
  "control_executions",
  "findings",
  "review_events",
  "synthesis_snapshots",
  "report_artifacts",
] as const;

describe("core persistence migration", () => {
  it("declares every required table idempotently", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "drizzle", "0001_probant_core.sql"),
      "utf8",
    );
    for (const table of REQUIRED_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain("mime_type text NOT NULL");
    expect(sql).toContain("size_bytes bigint NOT NULL");
  });
});

