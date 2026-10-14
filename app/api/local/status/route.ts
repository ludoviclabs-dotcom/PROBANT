import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { assertLocalSession, localRuntimeStatus } from "@/lib/runtime/local-dossiers";
import { executionProfile } from "@/lib/runtime/profile";
import { ensureLocalIngestionRecovery, recoverableLocalJobs } from "@/lib/ingestion/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État du runtime personnel local (C07) : profil, base, migrations, chaînes ouvertes. */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const headers = { "cache-control": "private, no-store", "x-request-id": requestId } as const;
  if (executionProfile(process.env) !== "personal_local") return Response.json({ error: "LOCAL_PROFILE_DISABLED" }, { status: 404, headers });
  try {
    const principal = await authorizeRequest(request, { permission: "dossier:read" });
    assertLocalSession(principal);
    // Premier passage après un démarrage : reprise des dépôts FEC interrompus, depuis l'état PostgreSQL.
    let ingestion: { recovery: "active" | "unavailable"; reason?: string; pendingJobs?: number };
    try { ensureLocalIngestionRecovery(); ingestion = { recovery: "active", pendingJobs: (await recoverableLocalJobs()).length }; }
    catch (error) { ingestion = { recovery: "unavailable", reason: error instanceof Error ? error.message.split(":")[0] : "LOCAL_INGESTION_UNAVAILABLE" }; }
    return Response.json({ ...(await localRuntimeStatus(getDatabase())), ingestion }, { headers });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
