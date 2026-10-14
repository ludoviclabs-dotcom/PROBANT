import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { durableChainEnabled } from "@/lib/runtime/profile";
import { PayablesRuntime } from "./payables-runtime";
import { payablesHandlers } from "./payables-http";
import { FiscalRuntime } from "./fiscal-runtime";
import { PostgresFiscalDatabase } from "./fiscal-store";
// C11 : la carte des événements lit les feuilles TVA seulement si la chaîne fiscale est activée (même règle que /api/workpapers/fiscal).
export const payablesServer = payablesHandlers(() => new PayablesRuntime(getDatabase(), getRequestAuthorizer()), undefined, undefined,
    () => durableChainEnabled(process.env, "PROBANT_FISCAL_DURABLE") ? new FiscalRuntime(new PostgresFiscalDatabase(getDatabase()), getRequestAuthorizer()) : null);
