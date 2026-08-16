import { validateMigrations } from "./migration-utils.mjs";

const result = validateMigrations();
if (result.errors.length > 0) {
  for (const error of result.errors) process.stderr.write(`db:check: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `db:check: ${result.migrationFiles.length} up migrations; ${result.tables.length} schema tables; invariants valid\n`,
  );
}

