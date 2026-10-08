import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { PayablesRuntime } from "./payables-runtime";
import { payablesHandlers } from "./payables-http";
export const payablesServer = payablesHandlers(() => new PayablesRuntime(getDatabase(), getRequestAuthorizer()));
