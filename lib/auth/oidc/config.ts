import { z } from "zod";

/**
 * Configuration OIDC **utilisateur** — ADR-007.
 *
 * Aucune valeur par défaut d'identité : sans configuration complète, le mode
 * persistant échoue fermé. Le mode démo n'appelle jamais ce module.
 */
const csvList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const rawSchema = z.object({
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1).max(255),
  OIDC_CLIENT_SECRET: z.string().min(1).max(4096),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url().optional(),
  OIDC_SCOPES: z.string().min(1).default("openid profile email"),
  /** Claim portant l'identifiant d'organisation. Aucun repli implicite. */
  OIDC_ORGANIZATION_CLAIM: z.string().min(1).default("organization_id"),
  OIDC_ROLES_CLAIM: z.string().min(1).default("roles"),
  /** Politique MFA imposée par l'IdP — cf. ADR-007 § 5. */
  OIDC_REQUIRED_ACR: csvList.optional(),
  OIDC_REQUIRED_AMR: csvList.optional(),
  OIDC_MFA_ENFORCEMENT: z.enum(["required", "audit_only"]).default("required"),
  /** Tolérance d'horloge en secondes pour `exp`/`iat`/`nbf`. */
  OIDC_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).max(300).default(60),
  OIDC_JWKS_CACHE_SECONDS: z.coerce.number().int().min(30).max(86_400).default(900),
});

export interface OidcConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly postLogoutRedirectUri: string | null;
  readonly scopes: string;
  readonly organizationClaim: string;
  readonly rolesClaim: string;
  readonly requiredAcr: readonly string[];
  readonly requiredAmr: readonly string[];
  readonly mfaEnforcement: "required" | "audit_only";
  readonly clockSkewSeconds: number;
  readonly jwksCacheSeconds: number;
}

export class OidcNotConfiguredError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`OIDC_NOT_CONFIGURED:${missing.join(",")}`);
    this.name = "OidcNotConfiguredError";
  }
}

export type EnvironmentRecord = Record<string, string | undefined>;

export function isOidcConfigured(env: EnvironmentRecord = process.env): boolean {
  return rawSchema.safeParse(env).success;
}

export function readOidcConfig(env: EnvironmentRecord = process.env): OidcConfig {
  const parsed = rawSchema.safeParse(env);
  if (!parsed.success) {
    throw new OidcNotConfiguredError(
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].sort(),
    );
  }
  const data = parsed.data;
  const redirect = new URL(data.OIDC_REDIRECT_URI);
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") {
    throw new OidcNotConfiguredError(["OIDC_REDIRECT_URI"]);
  }
  // Exiger la MFA sans dire à quoi la reconnaître laisserait passer toutes les
  // sessions : la configuration incomplète est une erreur, pas un défaut permissif.
  const acr = data.OIDC_REQUIRED_ACR ?? [];
  const amr = data.OIDC_REQUIRED_AMR ?? [];
  if (data.OIDC_MFA_ENFORCEMENT === "required" && acr.length === 0 && amr.length === 0) {
    throw new OidcNotConfiguredError(["OIDC_REQUIRED_ACR", "OIDC_REQUIRED_AMR"]);
  }
  return {
    // `issuer` sert de comparaison stricte avec le claim `iss` : on retire le
    // slash final pour éviter un faux négatif de configuration.
    issuer: data.OIDC_ISSUER.replace(/\/$/u, ""),
    clientId: data.OIDC_CLIENT_ID,
    clientSecret: data.OIDC_CLIENT_SECRET,
    redirectUri: data.OIDC_REDIRECT_URI,
    postLogoutRedirectUri: data.OIDC_POST_LOGOUT_REDIRECT_URI ?? null,
    scopes: data.OIDC_SCOPES,
    organizationClaim: data.OIDC_ORGANIZATION_CLAIM,
    rolesClaim: data.OIDC_ROLES_CLAIM,
    requiredAcr: acr,
    requiredAmr: amr,
    mfaEnforcement: data.OIDC_MFA_ENFORCEMENT,
    clockSkewSeconds: data.OIDC_CLOCK_SKEW_SECONDS,
    jwksCacheSeconds: data.OIDC_JWKS_CACHE_SECONDS,
  };
}
