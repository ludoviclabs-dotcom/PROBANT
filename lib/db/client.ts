import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type ProbantDatabase = PostgresJsDatabase<typeof schema>;

interface DatabaseHandle {
  client: Sql;
  db: ProbantDatabase;
}

let handle: DatabaseHandle | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabase(): ProbantDatabase {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("PERSISTENT_DATABASE_NOT_CONFIGURED");
  }
  const poolSize = Number(process.env.DATABASE_POOL_SIZE);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 100) {
    throw new Error("DATABASE_POOL_SIZE_NOT_CONFIGURED");
  }
  if (!handle) {
    const client = postgres(url, {
      max: poolSize,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    handle = { client, db: drizzle(client, { schema }) };
  }
  return handle.db;
}

export async function closeDatabaseForTests(): Promise<void> {
  if (!handle) return;
  await handle.client.end({ timeout: 1 });
  handle = undefined;
}
