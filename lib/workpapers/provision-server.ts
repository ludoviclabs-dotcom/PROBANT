import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { ProvisionRuntime } from "./provision-runtime";
import { provisionHandlers } from "./provision-http";
import { PostgresProvisionDatabase } from "./provision-store";
export const provisionServer = provisionHandlers(() => new ProvisionRuntime(new PostgresProvisionDatabase(getDatabase()), getRequestAuthorizer()));
