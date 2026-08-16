import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  migrationDirectory,
  migrationFiles,
  validateMigrations,
} from "./migration-utils.mjs";

const validation = validateMigrations();
if (validation.errors.length > 0) {
  throw new Error(`Migration validation failed:\n${validation.errors.join("\n")}`);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  process.stdout.write(
    `db:migrate: DATABASE_URL absent; ${validation.migrationFiles.length} migrations validated without database mutation\n`,
  );
  process.exit(0);
}

const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _probant_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const appliedRows = await sql`SELECT name FROM _probant_migrations`;
  const applied = new Set(appliedRows.map((row) => row.name));
  for (const name of migrationFiles()) {
    if (applied.has(name)) continue;
    const body = readFileSync(resolve(migrationDirectory, name), "utf8");
    await sql.unsafe(body);
    await sql`INSERT INTO _probant_migrations (name) VALUES (${name})`;
    process.stdout.write(`db:migrate: applied ${name}\n`);
  }
} finally {
  await sql.end();
}

