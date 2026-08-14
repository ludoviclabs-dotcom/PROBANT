import { ApiError } from "@/lib/api/errors";
import { hasPermission, type Permission, type ProbantRole } from "./roles";

/**
 * Identité autorisée d'une requête, quelle que soit sa provenance.
 *
 * Deux chemins d'authentification produisent le même type :
 * - `oidc-session` : session serveur créée après un flux OIDC utilisateur ;
 * - `signed-gateway-context` : contexte signé HMAC émis par une passerelle
 *   d'identité de confiance (chemin historique PR-03, conservé pour les
 *   workers et les tests d'intégration).
 *
 * ⚠️ Ne pas confondre avec Vercel OIDC Federation, qui délivre une identité de
 * *workload* vers AWS et n'authentifie aucun utilisateur — cf. ADR-007 § 2.
 */
export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly ProbantRole[];
  /**
   * Dossiers explicitement accordés. `null` signifie « tous les dossiers de
   * l'organisation » : l'appartenance reste alors vérifiée côté données, jamais
   * déduite de cette valeur.
   */
  readonly dossierIds: readonly string[] | null;
  readonly authenticationMethod: "oidc-session" | "signed-gateway-context";
  readonly amr: readonly string[];
  readonly acr: string | null;
  readonly mfaSatisfied: boolean;
  readonly expiresAtEpochSeconds: number;
}

export class AuthorizationDenied extends ApiError {
  constructor(code: string, message: string, status: 401 | 403 = 403) {
    super(code, message, status, false);
    this.name = "AuthorizationDenied";
  }
}

/** Vérifie la permission fonctionnelle, sans référence à un dossier. */
export function assertPermission(
  principal: AuthenticatedPrincipal,
  permission: Permission,
): void {
  if (!hasPermission(principal.roles, permission)) {
    throw new AuthorizationDenied("FORBIDDEN", "Autorisation insuffisante.");
  }
}

/**
 * Vérifie l'accès à un dossier précis.
 *
 * Cette fonction ne prouve pas que le dossier appartient à l'organisation :
 * c'est le rôle de `assertOrganizationScope`, appelé côté service une fois la
 * ressource lue. Les deux contrôles sont volontairement séparés pour que la
 * défense ne repose pas sur un seul point.
 */
export function assertDossierPermission(
  principal: AuthenticatedPrincipal,
  dossierId: string,
  permission: Permission,
): void {
  assertPermission(principal, permission);
  if (principal.dossierIds !== null && !principal.dossierIds.includes(dossierId)) {
    throw new AuthorizationDenied("DOSSIER_FORBIDDEN", "Le dossier n'est pas autorisé.");
  }
}

/**
 * Défense en profondeur : la ressource réellement lue doit appartenir à
 * l'organisation du demandeur.
 *
 * Répond 404 et non 403 : confirmer l'existence d'un dossier d'une autre
 * organisation serait déjà une fuite d'information.
 */
export function assertOrganizationScope(
  principal: AuthenticatedPrincipal,
  resourceOrganizationId: string | null | undefined,
  resourceKind: string,
): void {
  if (!resourceOrganizationId || resourceOrganizationId !== principal.organizationId) {
    throw new AuthorizationDenied(
      "RESOURCE_NOT_FOUND",
      `Ressource introuvable : ${resourceKind}.`,
      403,
    );
  }
}

export function isExpired(
  principal: AuthenticatedPrincipal,
  nowEpochSeconds: number,
): boolean {
  return principal.expiresAtEpochSeconds <= nowEpochSeconds;
}
