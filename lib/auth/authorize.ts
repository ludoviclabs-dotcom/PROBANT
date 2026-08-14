import { ApiError } from "@/lib/api/errors";
import {
  assertDossierPermission,
  assertPermission,
  AuthorizationDenied,
  type AuthenticatedPrincipal,
} from "./principal";
import type { Permission } from "./roles";
import {
  assertDossierBelongsToPrincipal,
  type DossierOwnershipReader,
} from "./dossier-scope";
import { SignedHeaderContextResolver, hasSignedGatewayHeaders } from "./persistent-context";
import type { SessionConfig } from "./session/config";
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  csrfTokenMatches,
  readCookie,
  sessionTokenDigest,
} from "./session/cookie";
import type { SessionStore } from "./session/store";

/**
 * Autorisation d'une requête — point d'entrée unique de toutes les routes.
 *
 * Deux propriétés délibérées :
 *
 * 1. **Aucune confiance au middleware.** Le middleware pose des en-têtes ;
 *    il n'accorde aucun droit. Chaque route rappelle `authorize`, donc une
 *    route ajoutée sans garde échoue en 401 plutôt que de passer en clair.
 * 2. **Deux chemins, un seul type.** Session OIDC (navigateur) et contexte
 *    signé (worker) produisent le même `AuthenticatedPrincipal`.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthorizationRequirement {
  readonly permission: Permission;
  readonly dossierId?: string;
}

export interface AuthorizerDeps {
  readonly sessionStore: SessionStore | null;
  readonly sessionConfig: SessionConfig | null;
  readonly nowEpochSeconds: () => number;
  readonly gatewayResolver?: { resolve(request: Request): Promise<AuthenticatedPrincipal> };
  /**
   * Vérification d'appartenance du dossier. Rendue obligatoire au niveau de
   * l'autorisation plutôt que laissée à chaque route : une route qui oublie
   * son contrôle est une faille, un `authorize` qui l'oublie est un bug unique.
   */
  readonly dossierOwnership?: DossierOwnershipReader | null;
}

export class RequestAuthorizer {
  private readonly gateway: { resolve(request: Request): Promise<AuthenticatedPrincipal> };

  constructor(private readonly deps: AuthorizerDeps) {
    this.gateway = deps.gatewayResolver ?? new SignedHeaderContextResolver();
  }

  /** Résout l'identité sans vérifier aucun droit. */
  async principal(request: Request): Promise<AuthenticatedPrincipal> {
    const cookieSecret = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (cookieSecret) return this.fromSession(request, cookieSecret);
    if (hasSignedGatewayHeaders(request)) return this.gateway.resolve(request);
    throw new AuthorizationDenied(
      "AUTHENTICATION_REQUIRED",
      "Authentification requise.",
      401,
    );
  }

  async authorize(
    request: Request,
    requirement: AuthorizationRequirement,
  ): Promise<AuthenticatedPrincipal> {
    const principal = await this.principal(request);
    if (requirement.dossierId) {
      assertDossierPermission(principal, requirement.dossierId, requirement.permission);
      if (this.deps.dossierOwnership) {
        await assertDossierBelongsToPrincipal(
          this.deps.dossierOwnership,
          principal,
          requirement.dossierId,
        );
      }
    } else {
      assertPermission(principal, requirement.permission);
    }
    return principal;
  }

  private async fromSession(
    request: Request,
    cookieSecret: string,
  ): Promise<AuthenticatedPrincipal> {
    const { sessionStore, sessionConfig } = this.deps;
    if (!sessionStore || !sessionConfig) {
      throw new ApiError(
        "AUTH_SESSION_NOT_CONFIGURED",
        "Les sessions utilisateur ne sont pas configurées.",
        503,
      );
    }
    const now = this.deps.nowEpochSeconds();
    const record = await sessionStore.findByTokenDigest(sessionTokenDigest(cookieSecret), now);
    if (!record) {
      throw new AuthorizationDenied("SESSION_INVALID", "Session absente ou expirée.", 401);
    }

    if (UNSAFE_METHODS.has(request.method.toUpperCase())) {
      assertSameOrigin(request, sessionConfig.appOrigin);
      if (
        !csrfTokenMatches(record.id, sessionConfig.secret, request.headers.get(CSRF_HEADER))
      ) {
        throw new AuthorizationDenied("CSRF_TOKEN_INVALID", "Jeton CSRF absent ou invalide.");
      }
    }

    /**
     * Fenêtre glissante : la lecture d'une session vivante la prolonge.
     *
     * L'écriture n'a lieu qu'une fois la moitié de la fenêtre consommée. Sans
     * ce seuil, chaque requête d'un tableau de bord — donc chaque graphique,
     * chaque page — produirait un `UPDATE`, pour une prolongation de quelques
     * secondes sans effet observable.
     *
     * La comparaison est large (`<=`) : une activité régulière à exactement
     * la moitié de la fenêtre doit prolonger la session, pas la laisser
     * expirer sur un cas limite.
     */
    if (record.idleExpiresAtEpochSeconds - now <= sessionConfig.idleTtlSeconds / 2) {
      await sessionStore.touch(record.id, now + sessionConfig.idleTtlSeconds);
    }

    return {
      subject: record.subject,
      organizationId: record.organizationId,
      roles: record.roles,
      // Une session OIDC ne porte pas de liste de dossiers : l'isolation est
      // assurée par le filtrage `organization_id` de chaque requête de données.
      dossierIds: null,
      authenticationMethod: "oidc-session",
      amr: record.amr,
      acr: record.acr,
      mfaSatisfied: record.mfaSatisfied,
      expiresAtEpochSeconds: Math.min(
        record.idleExpiresAtEpochSeconds,
        record.absoluteExpiresAtEpochSeconds,
      ),
    };
  }
}

/**
 * Contrôle d'origine des requêtes mutantes.
 *
 * `Origin` est posé par le navigateur et non falsifiable par script. En son
 * absence, `Sec-Fetch-Site` fait foi ; si aucun des deux n'est présent, la
 * requête est refusée — un navigateur moderne envoie toujours l'un des deux.
 */
export function assertSameOrigin(request: Request, appOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== appOrigin) {
      throw new AuthorizationDenied("ORIGIN_FORBIDDEN", "Origine de requête refusée.");
    }
    return;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return;
  throw new AuthorizationDenied("ORIGIN_MISSING", "Origine de requête indéterminable.");
}
