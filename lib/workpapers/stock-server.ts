import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { StockRuntime } from "./stock-runtime";
import { stockHandlers } from "./stock-http";
import { PostgresStockDatabase } from "./stock-store";
export const stockServer = stockHandlers(() => new StockRuntime(new PostgresStockDatabase(getDatabase()), getRequestAuthorizer()));
