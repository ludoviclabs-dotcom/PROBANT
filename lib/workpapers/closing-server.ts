import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { ClosingRuntime } from "./closing-runtime";
import { closingHandlers } from "./closing-http";
import { PostgresClosingDatabase } from "./closing-store";
/** The closing authority is not wired to any professional registry: nobody holds it in the durable server until that source is validated. */
export const closingServer = closingHandlers(() => new ClosingRuntime(new PostgresClosingDatabase(getDatabase()), getRequestAuthorizer()));
