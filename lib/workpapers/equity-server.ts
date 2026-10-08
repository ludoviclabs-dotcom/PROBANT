import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { EquityRuntime } from "./equity-runtime";
import { equityHandlers } from "./equity-http";
import { PostgresEquityDatabase } from "./equity-store";
export const equityServer = equityHandlers(() => new EquityRuntime(new PostgresEquityDatabase(getDatabase()), getRequestAuthorizer()));
