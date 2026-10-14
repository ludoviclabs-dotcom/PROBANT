import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { readLocalAuthConfig } from "@/lib/auth/local/config";
import { completeLocalLogin } from "@/lib/auth/local/login";
import { DrizzleLocalLoginStore } from "@/lib/auth/local/store";
import { getSessionConfig, getSessionStore } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connexion du profil personnel local (C07) : code à usage unique écrit par
 * `npm run local:start` ou `npm run local:login`. Fermée hors profil personnel.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const headers = { "cache-control": "no-store", "x-request-id": requestId, "referrer-policy": "no-referrer" } as const;
  try {
    const config = readLocalAuthConfig(process.env);
    const sessionConfig = getSessionConfig();
    const sessionStore = getSessionStore();
    if (!config || !sessionConfig || !sessionStore) {
      return Response.json({ error: "LOCAL_PROFILE_DISABLED" }, { status: 404, headers });
    }
    const result = await completeLocalLogin(request, {
      config,
      sessionConfig,
      sessionStore,
      loginStore: new DrizzleLocalLoginStore(getDatabase()),
      nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
    });
    const response = new Response(null, { status: 303, headers: { ...headers, location: result.location } });
    if (result.kind === "session") response.headers.append("set-cookie", result.setCookie);
    return response;
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
