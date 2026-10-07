import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { ClientsRuntime } from "./clients-runtime";
import { clientsHandlers } from "./clients-http";
export const clientsServer = clientsHandlers(() => new ClientsRuntime(getDatabase(), getRequestAuthorizer()));
