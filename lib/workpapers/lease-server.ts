import "server-only";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { leaseHandlers } from "./lease-http";
import { LeaseRuntime } from "./lease-runtime";

export const leaseServer = leaseHandlers(() => new LeaseRuntime(getDatabase(), getRequestAuthorizer()));
