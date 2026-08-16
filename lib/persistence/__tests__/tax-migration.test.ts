import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TAX_TABLES = [
  "tax_profiles",
  "tax_periods",
  "tax_documents",
  "tax_declaration_fields",
  "tax_control_executions",
  "tax_reconciliation_lines",
  "tax_adjustments",
  "tax_computation_snapshots",
] as const;

describe("tax canonical persistence migration", () => {
  it("provides reversible up/down migrations for every tax table", async () => {
    const [up, down] = await Promise.all([
      readFile(path.join(process.cwd(), "drizzle", "0002_tax_canonical_model.up.sql"), "utf8"),
      readFile(path.join(process.cwd(), "drizzle", "0002_tax_canonical_model.down.sql"), "utf8"),
    ]);
    for (const table of TAX_TABLES) {
      expect(up).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(down).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(up.trimStart()).toMatch(/^BEGIN;/u);
    expect(up.trimEnd()).toMatch(/COMMIT;$/u);
    expect(down.trimStart()).toMatch(/^BEGIN;/u);
    expect(down.trimEnd()).toMatch(/COMMIT;$/u);
  });

  it("enforces organization, period, vintage, cents and immutability invariants", async () => {
    const up = await readFile(path.join(process.cwd(), "drizzle", "0002_tax_canonical_model.up.sql"), "utf8");
    // Scope columns remain explicit and indexed. Cross-table foreign keys to
    // the historical core are intentionally omitted because that schema uses
    // UUID identifiers while the canonical tax snapshots use text IDs.
    expect(up).toContain("organization_id text NOT NULL");
    expect(up).toContain("dossier_id text NOT NULL");
    expect(up).toContain("idx_tax_profiles_scope");
    expect(up).toContain("period_end >= period_start");
    expect(up).toContain("form_vintage integer NOT NULL");
    expect(up).toContain("fiscal_year integer NOT NULL");
    expect(up).toContain("amount_cents bigint");
    expect(up).toContain("probant_reject_tax_snapshot_mutation");
    expect(up).toContain("snapshot_kind = 'fiscal_tax'");
    expect(up).toContain("probant_reject_fiscal_synthesis_mutation");
    expect(up).not.toContain("taxRatePct");
    expect(up).not.toContain("financialEffect");
  });

  it("keeps findings backward compatible while adding their domain", async () => {
    const up = await readFile(path.join(process.cwd(), "drizzle", "0002_tax_canonical_model.up.sql"), "utf8");
    expect(up).toContain("domain text NOT NULL DEFAULT 'accounting'");
    expect(up).toContain("tax_control_execution_id text");
    expect(up).toContain("REFERENCES tax_control_executions(id)");
  });
});

