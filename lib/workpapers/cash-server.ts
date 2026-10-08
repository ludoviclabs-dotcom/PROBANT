import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { CashRuntime } from "./cash-runtime";
import { cashHandlers } from "./cash-http";
import { PostgresCashDatabase } from "./cash-store";
export const cashServer = cashHandlers(() => new CashRuntime(new PostgresCashDatabase(getDatabase()), getRequestAuthorizer()));
