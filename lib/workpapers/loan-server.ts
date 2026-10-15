import "server-only";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { loanHandlers } from "./loan-http";
import { LoanRuntime } from "./loan-runtime";

export const loanServer = loanHandlers(() => new LoanRuntime(getDatabase(), getRequestAuthorizer()));
