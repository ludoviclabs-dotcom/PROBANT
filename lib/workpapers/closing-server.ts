import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { ClosingRuntime } from "./closing-runtime";
import { closingHandlers } from "./closing-http";
import { PostgresClosingDatabase } from "./closing-store";
import { eventMapRead } from "./closing-events";
import { readCutoffEvents } from "./payables-server";
/** The closing authority is not wired to any professional registry: nobody holds it in the durable server until that source is validated. */
export const closingServer = closingHandlers(() => new ClosingRuntime(new PostgresClosingDatabase(getDatabase()), getRequestAuthorizer(), undefined, undefined, undefined,
  // The transversal events map is read as GET /api/workpapers/payables?operation=events serves it: the file never rebuilds it.
  async (request, dossierId, pid) => eventMapRead(await readCutoffEvents(request, dossierId, pid))));
