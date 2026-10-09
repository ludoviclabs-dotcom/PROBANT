import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { FiscalRuntime } from "./fiscal-runtime";
import { fiscalHandlers } from "./fiscal-http";
import { PostgresFiscalDatabase } from "./fiscal-store";
export const fiscalServer = fiscalHandlers(() => new FiscalRuntime(new PostgresFiscalDatabase(getDatabase()), getRequestAuthorizer()));
