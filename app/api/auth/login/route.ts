import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { createTransaction, safeReturnTo } from "@/lib/auth/oidc/client";
import { seal } from "@/lib/auth/sealed-cookie";
import { OIDC_TRANSACTION_COOKIE, serializeCookie } from "@/lib/auth/session/cookie";
import { getOidcClient, getSessionConfig } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Durée de vie de la transaction d'autorisation : le temps de s'authentifier. */
const TRANSACTION_TTL_SECONDS = 600;

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const client = getOidcClient();
    const sessionConfig = getSessionConfig();
    if (!client || !sessionConfig) {
      throw new ApiError(
        "AUTH_NOT_CONFIGURED",
        "L'authentification utilisateur n'est pas configurée.",
        503,
      );
    }

    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const transaction = createTransaction(returnTo, Math.floor(Date.now() / 1_000));
    const authorizationUrl = await client.authorizationUrl(transaction);

    const headers = new Headers({
      location: authorizationUrl,
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    });
    headers.append(
      "set-cookie",
      serializeCookie({
        name: OIDC_TRANSACTION_COOKIE,
        value: seal(transaction, sessionConfig.secret, "oidc-transaction"),
        maxAgeSeconds: TRANSACTION_TTL_SECONDS,
        httpOnly: true,
        // `Lax` est nécessaire : le retour depuis l'IdP est une navigation
        // cross-site, `Strict` empêcherait le navigateur de renvoyer le cookie.
        sameSite: "Lax",
      }),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
