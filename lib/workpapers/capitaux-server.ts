import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { EquityRuntime } from "./capitaux-runtime";
import { equityHandlers } from "./capitaux-http";
import { PostgresEquityDatabase } from "./capitaux-store";
export const equityServer = equityHandlers(() => new EquityRuntime(new PostgresEquityDatabase(getDatabase()), getRequestAuthorizer()));
