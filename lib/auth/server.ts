import "server-only";

import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { RequestAuthorizer, type AuthorizationRequirement } from "./authorize";
import { DrizzleDossierOwnershipReader } from "./dossier-scope";
import type { AuthenticatedPrincipal } from "./principal";
import { OidcClient } from "./oidc/client";
import { isOidcConfigured, readOidcConfig, type OidcConfig } from "./oidc/config";
import { isSessionConfigured, readSessionConfig, type SessionConfig } from "./session/config";
import { DrizzleSessionStore, type SessionStore } from "./session/store";

/**
 * Câblage serveur de l'authentification.
 *
 * Tout est résolu paresseusement : le mode démo ne configure ni base ni IdP et
 * ne doit pas échouer à l'import. Le mode persistant, lui, échoue fermé dès
 * qu'une brique manque.
 */
let sessionStore: SessionStore | undefined;

export function getSessionStore(): SessionStore | null {
  if (!isDatabaseConfigured() || !isSessionConfigured()) return null;
  sessionStore ??= new DrizzleSessionStore(getDatabase());
  return sessionStore;
}

export function getSessionConfig(): SessionConfig | null {
  return isSessionConfigured() ? readSessionConfig() : null;
}

export function getOidcConfig(): OidcConfig | null {
  return isOidcConfigured() ? readOidcConfig() : null;
}

let oidcClient: OidcClient | undefined;

export function getOidcClient(): OidcClient | null {
  const config = getOidcConfig();
  if (!config) return null;
  oidcClient ??= new OidcClient(config);
  return oidcClient;
}

export function getRequestAuthorizer(): RequestAuthorizer {
  return new RequestAuthorizer({
    sessionStore: getSessionStore(),
    sessionConfig: getSessionConfig(),
    nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
    dossierOwnership: isDatabaseConfigured()
      ? new DrizzleDossierOwnershipReader(getDatabase())
      : null,
  });
}

/** Garde standard des routes : `const principal = await authorizeRequest(request, {...})`. */
export function authorizeRequest(
  request: Request,
  requirement: AuthorizationRequirement,
): Promise<AuthenticatedPrincipal> {
  return getRequestAuthorizer().authorize(request, requirement);
}

/** Réinitialise les singletons — tests d'intégration uniquement. */
export function resetAuthSingletonsForTests(): void {
  sessionStore = undefined;
  oidcClient = undefined;
}
