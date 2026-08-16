import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  migrationDirectory,
  downMigrationFiles,
  validateMigrations,
} from "./migration-utils.mjs";

const result = validateMigrations();
if (result.errors.length > 0) {
  throw new Error(`Cannot generate migration manifest:\n${result.errors.join("\n")}`);
}

const manifest = {
  formatVersion: 1,
  schemaFile: "lib/persistence/schema.ts",
  up: result.migrationFiles,
  down: downMigrationFiles(),
  tables: result.tables,
};
const target = resolve(migrationDirectory, "migration-manifest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`db:generate: wrote ${target}\n`);

