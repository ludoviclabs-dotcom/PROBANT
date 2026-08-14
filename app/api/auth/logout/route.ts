import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/auth/authorize";
import { AuthorizationDenied } from "@/lib/auth/principal";
import { getSessionConfig, getSessionStore } from "@/lib/auth/server";
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  csrfTokenMatches,
  readCookie,
  sessionTokenDigest,
} from "@/lib/auth/session/cookie";
import { authNotConfigured, destroySession } from "@/lib/auth/session/service";
import { logAuthEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST uniquement : une déconnexion par simple navigation serait un CSRF. */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const sessionConfig = getSessionConfig();
    const sessionStore = getSessionStore();
    if (!sessionConfig || !sessionStore) throw authNotConfigured();

    assertSameOrigin(request, sessionConfig.appOrigin);

    const secret = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (secret) {
      const now = Math.floor(Date.now() / 1_000);
      const record = await sessionStore.findByTokenDigest(sessionTokenDigest(secret), now);
      if (
        record &&
        !csrfTokenMatches(record.id, sessionConfig.secret, request.headers.get(CSRF_HEADER))
      ) {
        throw new AuthorizationDenied("CSRF_TOKEN_INVALID", "Jeton CSRF absent ou invalide.");
      }
    }

    const cookies = await destroySession(request, {
      sessionStore,
      nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
    });
    logAuthEvent({ event: "session_destroyed", requestId, outcome: "success" });

    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    });
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ authenticated: false }), { status: 200, headers });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
