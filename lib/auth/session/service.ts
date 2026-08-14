import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { OidcFlowError, oidcTransactionSchema, type OidcClient } from "../oidc/client";
import type { OidcConfig } from "../oidc/config";
import { assertMfaPolicy, type MfaOutcome } from "../oidc/mfa";
import { constantTimeEquals, unseal, SealedCookieError } from "../sealed-cookie";
import type { SessionConfig } from "./config";
import {
  OIDC_TRANSACTION_COOKIE,
  SESSION_COOKIE,
  csrfTokenFor,
  expiredCookie,
  newSessionSecret,
  readCookie,
  serializeCookie,
  sessionTokenDigest,
} from "./cookie";
import type { SessionRecord, SessionStore } from "./store";

/**
 * Achèvement du flux OIDC : code d'autorisation → session serveur.
 *
 * Isolé de la route pour être testable sans plomberie Next.js. La fonction ne
 * touche à aucun global : horloge, magasin de sessions et client OIDC sont
 * injectés.
 */
const TRANSACTION_TTL_SECONDS = 600;

export interface CompleteLoginDeps {
  readonly oidcClient: Pick<OidcClient, "exchangeCode" | "verifyIdToken">;
  readonly oidcConfig: OidcConfig;
  readonly sessionConfig: SessionConfig;
  readonly sessionStore: SessionStore;
  readonly nowEpochSeconds: () => number;
}

export interface CompleteLoginResult {
  readonly redirectTo: string;
  readonly setCookies: readonly string[];
  readonly session: SessionRecord;
  readonly mfa: MfaOutcome;
}

const callbackParamsSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(512),
});

export async function completeLogin(
  request: Request,
  deps: CompleteLoginDeps,
): Promise<CompleteLoginResult> {
  const url = new URL(request.url);
  const idpError = url.searchParams.get("error");
  if (idpError) {
    // Le libellé du fournisseur n'est pas réexposé tel quel : il peut contenir
    // des données d'identité.
    throw new OidcFlowError("OIDC_PROVIDER_REJECTED", "Le fournisseur d'identité a refusé la connexion.");
  }
  const params = callbackParamsSchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!params.success) {
    throw new OidcFlowError("OIDC_CALLBACK_INVALID", "Paramètres de retour OIDC invalides.", 400);
  }

  const sealedTransaction = readCookie(
    request.headers.get("cookie"),
    OIDC_TRANSACTION_COOKIE,
  );
  if (!sealedTransaction) {
    throw new OidcFlowError("OIDC_TRANSACTION_MISSING", "Transaction d'authentification absente.");
  }
  let transaction: z.infer<typeof oidcTransactionSchema>;
  try {
    transaction = oidcTransactionSchema.parse(
      unseal(sealedTransaction, deps.sessionConfig.secret, "oidc-transaction"),
    );
  } catch (error) {
    if (error instanceof SealedCookieError || error instanceof z.ZodError) {
      throw new OidcFlowError("OIDC_TRANSACTION_INVALID", "Transaction d'authentification invalide.");
    }
    throw error;
  }

  const now = deps.nowEpochSeconds();
  if (now - transaction.createdAtEpochSeconds > TRANSACTION_TTL_SECONDS) {
    throw new OidcFlowError("OIDC_TRANSACTION_EXPIRED", "Transaction d'authentification expirée.");
  }
  if (!constantTimeEquals(transaction.state, params.data.state)) {
    throw new OidcFlowError("OIDC_STATE_MISMATCH", "État d'autorisation inattendu.");
  }

  const tokens = await deps.oidcClient.exchangeCode(params.data.code, transaction.codeVerifier);
  const identity = await deps.oidcClient.verifyIdToken(tokens.id_token, transaction.nonce, now);
  const mfa = assertMfaPolicy(deps.oidcConfig, identity);

  const secret = newSessionSecret();
  const session = await deps.sessionStore.create({
    tokenSha256: sessionTokenDigest(secret),
    issuer: deps.oidcConfig.issuer,
    subject: identity.subject,
    organizationId: identity.organizationId,
    roles: identity.roles,
    acr: identity.acr,
    amr: identity.amr,
    mfaSatisfied: mfa.satisfied,
    nowEpochSeconds: now,
    idleTtlSeconds: deps.sessionConfig.idleTtlSeconds,
    absoluteTtlSeconds: deps.sessionConfig.absoluteTtlSeconds,
  });

  return {
    redirectTo: transaction.returnTo,
    setCookies: [
      serializeCookie({
        name: SESSION_COOKIE,
        value: secret,
        // Le cookie ne survit jamais au plafond absolu de la session.
        maxAgeSeconds: deps.sessionConfig.absoluteTtlSeconds,
        httpOnly: true,
        sameSite: "Lax",
      }),
      expiredCookie(OIDC_TRANSACTION_COOKIE),
    ],
    session,
    mfa,
  };
}

export interface SessionView {
  readonly authenticated: true;
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly mfaSatisfied: boolean;
  readonly csrfToken: string;
  readonly expiresAtEpochSeconds: number;
}

export function describeSession(
  session: SessionRecord,
  sessionConfig: SessionConfig,
  permissions: readonly string[],
): SessionView {
  return {
    authenticated: true,
    subject: session.subject,
    organizationId: session.organizationId,
    roles: session.roles,
    permissions,
    mfaSatisfied: session.mfaSatisfied,
    csrfToken: csrfTokenFor(session.id, sessionConfig.secret),
    expiresAtEpochSeconds: Math.min(
      session.idleExpiresAtEpochSeconds,
      session.absoluteExpiresAtEpochSeconds,
    ),
  };
}

export async function destroySession(
  request: Request,
  deps: { sessionStore: SessionStore; nowEpochSeconds: () => number },
): Promise<readonly string[]> {
  const secret = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (secret) {
    const record = await deps.sessionStore.findByTokenDigest(
      sessionTokenDigest(secret),
      deps.nowEpochSeconds(),
    );
    if (record) await deps.sessionStore.revoke(record.id);
  }
  return [expiredCookie(SESSION_COOKIE), expiredCookie(OIDC_TRANSACTION_COOKIE)];
}

export function authNotConfigured(): ApiError {
  return new ApiError(
    "AUTH_NOT_CONFIGURED",
    "L'authentification utilisateur n'est pas configurée.",
    503,
  );
}
