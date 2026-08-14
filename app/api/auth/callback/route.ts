import { requestIdFrom } from "@/lib/api/errors";
import { OidcFlowError } from "@/lib/auth/oidc/client";
import {
  getOidcClient,
  getOidcConfig,
  getSessionConfig,
  getSessionStore,
} from "@/lib/auth/server";
import { completeLogin } from "@/lib/auth/session/service";
import { logAuthEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Codes d'erreur réexposés au navigateur.
 *
 * Allowlist stricte : la redirection ne doit jamais transporter un message du
 * fournisseur d'identité, qui peut contenir des données personnelles.
 */
const PUBLIC_ERROR_CODES = new Set([
  "OIDC_PROVIDER_REJECTED",
  "OIDC_CALLBACK_INVALID",
  "OIDC_TRANSACTION_MISSING",
  "OIDC_TRANSACTION_INVALID",
  "OIDC_TRANSACTION_EXPIRED",
  "OIDC_STATE_MISMATCH",
  "MFA_REQUIRED",
  "OIDC_ROLE_MISSING",
  "OIDC_ORGANIZATION_CLAIM_MISSING",
]);

function failureRedirect(code: string, requestId: string): Response {
  const safeCode = PUBLIC_ERROR_CODES.has(code) ? code : "AUTHENTICATION_FAILED";
  return new Response(null, {
    status: 302,
    headers: {
      location: `/?auth=error&code=${encodeURIComponent(safeCode)}`,
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    },
  });
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const oidcClient = getOidcClient();
  const oidcConfig = getOidcConfig();
  const sessionConfig = getSessionConfig();
  const sessionStore = getSessionStore();
  if (!oidcClient || !oidcConfig || !sessionConfig || !sessionStore) {
    return failureRedirect("AUTH_NOT_CONFIGURED", requestId);
  }

  try {
    const result = await completeLogin(request, {
      oidcClient,
      oidcConfig,
      sessionConfig,
      sessionStore,
      nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
    });

    logAuthEvent({
      event: "session_created",
      requestId,
      organizationId: result.session.organizationId,
      outcome: "success",
      mfaSatisfied: result.mfa.satisfied,
      mfaReason: result.mfa.reason,
    });

    const headers = new Headers({
      location: result.redirectTo,
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    });
    for (const cookie of result.setCookies) headers.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const code = error instanceof OidcFlowError ? error.code : "AUTHENTICATION_FAILED";
    logAuthEvent({ event: "session_rejected", requestId, outcome: "denied", errorCode: code });
    return failureRedirect(code, requestId);
  }
}
