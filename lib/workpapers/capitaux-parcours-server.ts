import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { EquityRuntime as CapitauxRuntime } from "./capitaux-runtime";
import { PostgresEquityDatabase } from "./capitaux-store";
import { EquityRuntime as LegacyEquityRuntime } from "./equity-runtime";
import { parcoursHandler } from "./capitaux-parcours-http";

/** Server wiring of the single Capitaux propres journey: the two durable runtimes, each with its own authorizer and flag. */
export const parcoursServer = parcoursHandler({
  capitaux: () => new CapitauxRuntime(new PostgresEquityDatabase(getDatabase()), getRequestAuthorizer()),
  equity: () => new LegacyEquityRuntime(getDatabase(), getRequestAuthorizer()),
});
