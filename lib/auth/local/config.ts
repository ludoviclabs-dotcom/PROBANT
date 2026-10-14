import { isPersonalProfileRequested, personalProfileIssues, type RuntimeEnv } from "@/lib/runtime/profile";
import type { ProbantRole } from "../roles";
import type { ReviewKind } from "../review-kind";

/**
 * Identités du profil personnel local — mission C07.
 *
 * Le profil local n'a pas de fournisseur OIDC : le lanceur
 * (`scripts/local/probant-local.mjs`) écrit un code de connexion à usage unique
 * dans la base personnelle et ouvre `/api/auth/local`. La session créée est une
 * session serveur ordinaire (`auth_sessions`, cookie `__Host-`, CSRF), émise par
 * l'émetteur `probant-local:<profil>`. Rôles et type de relecture viennent de
 * cette configuration serveur, jamais d'un paramètre du navigateur.
 */
export const LOCAL_ISSUER_PREFIX = "probant-local:";
export const LOCAL_OWNER_SUBJECT = "proprietaire-local";
export const LOCAL_SIMULATION_SUBJECT = "simulation-seconde-identite";

export interface LocalAuthConfig {
  readonly profileId: string;
  readonly issuer: string;
  readonly organizationId: string;
  readonly ownerName: string;
  /** `personal` : relecture personnelle nommée autorisée (usage solo). */
  readonly ownerReview: Extract<ReviewKind, "personal" | "distinct_identity">;
  readonly simulationEnabled: boolean;
}

export interface LocalIdentity {
  readonly subject: string;
  readonly displayName: string;
  readonly roles: readonly ProbantRole[];
  readonly reviewKind: ReviewKind;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Configuration locale valide, ou `null` hors profil personnel (ou profil invalide : fermé). */
export function readLocalAuthConfig(env: RuntimeEnv): LocalAuthConfig | null {
  if (!isPersonalProfileRequested(env) || personalProfileIssues(env).length) return null;
  const organizationId = env.PROBANT_LOCAL_ORGANIZATION_ID ?? "";
  const ownerName = (env.PROBANT_LOCAL_OWNER_NAME ?? "").trim();
  if (!UUID.test(organizationId) || !ownerName || ownerName.length > 120) return null;
  const review = env.PROBANT_LOCAL_REVIEW ?? "personal";
  if (review !== "personal" && review !== "distinct_identity") return null;
  const profileId = env.PROBANT_LOCAL_PROFILE_ID!.toLowerCase();
  return { profileId, issuer: LOCAL_ISSUER_PREFIX + profileId, organizationId: organizationId.toLowerCase(), ownerName, ownerReview: review, simulationEnabled: env.PROBANT_LOCAL_SIMULATION === "enabled" };
}

/** Identité locale d'un sujet émis par ce profil ; `null` pour tout autre sujet. */
export function localIdentity(config: LocalAuthConfig, subject: string): LocalIdentity | null {
  if (subject === LOCAL_OWNER_SUBJECT) return { subject, displayName: config.ownerName, roles: ["preparer", "reviewer", "signer"], reviewKind: config.ownerReview };
  if (subject === LOCAL_SIMULATION_SUBJECT && config.simulationEnabled) return { subject, displayName: "Seconde identité (simulation)", roles: ["reviewer"], reviewKind: "simulated_second_identity" };
  return null;
}

export function isLocalIssuer(issuer: string | undefined): boolean {
  return !!issuer?.startsWith(LOCAL_ISSUER_PREFIX);
}
