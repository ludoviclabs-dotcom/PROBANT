import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { getSessionConfig, getSessionStore } from "@/lib/auth/server";
import { SESSION_COOKIE, readCookie, sessionTokenDigest } from "@/lib/auth/session/cookie";
import { describeSession } from "@/lib/auth/session/service";
import { permissionsFor } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * État de la session courante.
 *
 * Sert aussi à distribuer le jeton CSRF au client. Réponse jamais mise en
 * cache et jamais partagée : `private, no-store`.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const headers = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  } as const;
  try {
    const sessionConfig = getSessionConfig();
    const sessionStore = getSessionStore();
    const secret = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (!sessionConfig || !sessionStore || !secret) {
      return Response.json({ authenticated: false }, { headers });
    }
    const record = await sessionStore.findByTokenDigest(
      sessionTokenDigest(secret),
      Math.floor(Date.now() / 1_000),
    );
    if (!record) return Response.json({ authenticated: false }, { headers });

    return Response.json(
      describeSession(record, sessionConfig, permissionsFor(record.roles)),
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
