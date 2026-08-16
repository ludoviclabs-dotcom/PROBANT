import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let database: PostgresJsDatabase<typeof schema> | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): PostgresJsDatabase<typeof schema> {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for persistent dossier storage.");
  }
  const client = postgres(connectionString, {
    max: 4,
    prepare: false,
    idle_timeout: 20,
  });
  database = drizzle(client, { schema });
  return database;
}


