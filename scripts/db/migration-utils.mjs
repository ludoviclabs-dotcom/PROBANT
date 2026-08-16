import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "..", "..");
export const migrationDirectory = resolve(projectRoot, "drizzle");

export function migrationFiles() {
  return readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name) && !name.endsWith(".down.sql"))
    .sort();
}

export function downMigrationFiles() {
  return readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_.+\.down\.sql$/u.test(name))
    .sort();
}

export function schemaTables() {
  const schema = readFileSync(resolve(projectRoot, "lib", "persistence", "schema.ts"), "utf8");
  return [...schema.matchAll(/pgTable\(\s*["']([^"']+)["']/gu)]
    .map((match) => match[1])
    .sort();
}

export function migratedTables() {
  const tables = new Set();
  for (const file of migrationFiles()) {
    const sql = readFileSync(resolve(migrationDirectory, file), "utf8");
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/giu)) {
      tables.add(match[1]);
    }
  }
  return [...tables].sort();
}

export function validateMigrations() {
  const errors = [];
  const ups = migrationFiles();
  const downs = new Set(downMigrationFiles());
  for (const up of ups.filter((name) => name !== "0001_probant_core.sql")) {
    const expectedDown = up.replace(/\.up\.sql$/u, ".down.sql");
    if (expectedDown === up || !downs.has(expectedDown)) {
      errors.push(`missing down migration for ${up}: ${expectedDown}`);
    }
    const sql = readFileSync(resolve(migrationDirectory, up), "utf8");
    if (!/^BEGIN;/u.test(sql.trim()) || !/COMMIT;\s*$/u.test(sql)) {
      errors.push(`${up} must be transaction-bounded`);
    }
  }

  const schema = schemaTables();
  const migrated = new Set(migratedTables());
  for (const table of schema) {
    if (!migrated.has(table)) errors.push(`schema table without migration: ${table}`);
  }

  const taxUp = readFileSync(resolve(migrationDirectory, "0002_tax_canonical_model.up.sql"), "utf8");
  for (const required of [
    "tax_profiles",
    "tax_periods",
    "tax_documents",
    "tax_declaration_fields",
    "tax_control_executions",
    "tax_reconciliation_lines",
    "tax_adjustments",
    "tax_computation_snapshots",
  ]) {
    if (!taxUp.includes(`CREATE TABLE IF NOT EXISTS ${required}`)) {
      errors.push(`tax migration missing table ${required}`);
    }
  }
  for (const required of [
    "organization_id",
    "form_vintage",
    "fiscal_year",
    "canonical_json",
    "snapshot_hash",
    "snapshot_kind",
    "probant_reject_tax_snapshot_mutation",
  ]) {
    if (!taxUp.includes(required)) errors.push(`tax migration missing invariant ${required}`);
  }
  if (/financialEffect|taxRatePct/u.test(taxUp)) {
    errors.push("tax migration must not reuse financialEffect.taxRatePct");
  }
  return { errors, migrationFiles: ups, tables: schema };
}

