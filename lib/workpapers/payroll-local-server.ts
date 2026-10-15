import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { PostgresPayrollDatabase } from "./payroll-store";
import { LocalPayrollRuntime } from "./payroll-local-runtime";
import { localPayrollHandlers } from "./payroll-local-http";
export const localPayrollServer=localPayrollHandlers(()=>new LocalPayrollRuntime(new PostgresPayrollDatabase(getDatabase()),getRequestAuthorizer()));
