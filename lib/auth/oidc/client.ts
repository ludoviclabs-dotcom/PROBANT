import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeRoles, type ProbantRole } from "../roles";
import type { OidcConfig } from "./config";
import { OidcDiscoveryClient, type FetchLike } from "./discovery";
import { decodeJws, selectJwk, verifyJwsSignature, JwtVerificationError } from "./jwt";

export class OidcFlowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 502 = 401,
  ) {
    super(message);
    this.name = "OidcFlowError";
  }
}

/** Transaction d'autorisation stockée dans un cookie scellé, jamais côté serveur. */
export interface OidcTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly createdAtEpochSeconds: number;
  /** Chemin interne de retour — jamais une URL absolue (open redirect). */
  readonly returnTo: string;
}

export const oidcTransactionSchema = z.object({
  state: z.string().min(32).max(128),
  nonce: z.string().min(32).max(128),
  codeVerifier: z.string().min(43).max(128),
  createdAtEpochSeconds: z.number().int().positive(),
  returnTo: z.string().regex(/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/u).max(512),
});

export function safeReturnTo(candidate: string | null | undefined): string {
  if (!candidate) return "/dashboard";
  const parsed = oidcTransactionSchema.shape.returnTo.safeParse(candidate);
  return parsed.success ? parsed.data : "/dashboard";
}

export function createTransaction(
  returnTo: string,
  nowEpochSeconds: number,
): OidcTransaction {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    // RFC 7636 : 43 à 128 caractères non réservés.
    codeVerifier: randomBytes(48).toString("base64url"),
    createdAtEpochSeconds: nowEpochSeconds,
    returnTo: safeReturnTo(returnTo),
  };
}

export function codeChallengeFor(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

const idTokenClaimsSchema = z.object({
  iss: z.string().min(1),
  sub: z.string().min(1).max(255),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  nbf: z.number().int().positive().optional(),
  nonce: z.string().optional(),
  azp: z.string().optional(),
  auth_time: z.number().int().positive().optional(),
  acr: z.string().optional(),
  amr: z.array(z.string()).optional(),
  email: z.string().optional(),
});

export interface OidcIdentity {
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly ProbantRole[];
  readonly acr: string | null;
  readonly amr: readonly string[];
  readonly authTimeEpochSeconds: number | null;
  readonly idTokenExpiresAtEpochSeconds: number;
}

const organizationIdSchema = z.string().uuid();

export class OidcClient {
  private readonly discovery: OidcDiscoveryClient;

  constructor(
    private readonly config: OidcConfig,
    options: { fetchImpl?: FetchLike; nowMs?: () => number } = {},
  ) {
    this.discovery = new OidcDiscoveryClient(config, options);
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private readonly fetchImpl: FetchLike;

  async authorizationUrl(transaction: OidcTransaction): Promise<string> {
    const discovery = await this.discovery.discover();
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", this.config.scopes);
    url.searchParams.set("state", transaction.state);
    url.searchParams.set("nonce", transaction.nonce);
    url.searchParams.set("code_challenge", codeChallengeFor(transaction.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    // La MFA est demandée à l'IdP ; PROBANT n'implémente aucun second facteur.
    if (this.config.requiredAcr.length > 0) {
      url.searchParams.set("acr_values", this.config.requiredAcr.join(" "));
    }
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<z.infer<typeof tokenResponseSchema>> {
    const discovery = await this.discovery.discover();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    });
    const basic = Buffer.from(
      `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`,
      "utf8",
    ).toString("base64");

    let response: Response;
    try {
      response = await this.fetchImpl(discovery.token_endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization: `Basic ${basic}`,
        },
        body: body.toString(),
        cache: "no-store",
      });
    } catch {
      throw new OidcFlowError("OIDC_TOKEN_UNREACHABLE", "Échange de code impossible.", 502);
    }
    if (!response.ok) {
      throw new OidcFlowError("OIDC_TOKEN_REJECTED", "Le fournisseur a refusé le code d'autorisation.");
    }
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new OidcFlowError("OIDC_TOKEN_INVALID", "Réponse de jeton invalide.", 502);
    }
    return parsed.data;
  }

  /**
   * Valide un `id_token` et projette l'identité PROBANT.
   *
   * Contrôles : signature JWKS, `iss`, `aud`, `azp`, `exp`/`iat`/`nbf` avec
   * tolérance d'horloge, `nonce`, puis politique MFA.
   */
  async verifyIdToken(
    idToken: string,
    expectedNonce: string,
    nowEpochSeconds: number,
  ): Promise<OidcIdentity> {
    const decoded = decodeJws(idToken);
    let keys = await this.discovery.signingKeys();
    try {
      verifyJwsSignature(decoded, selectJwk(keys, decoded.header));
    } catch (error) {
      if (
        error instanceof JwtVerificationError &&
        (error.code === "JWKS_KEY_NOT_FOUND" || error.code === "JWT_SIGNATURE_INVALID")
      ) {
        // Rotation de clés possible : une seule nouvelle tentative.
        keys = await this.discovery.signingKeys(true);
        verifyJwsSignature(decoded, selectJwk(keys, decoded.header));
      } else {
        throw error;
      }
    }

    const claims = idTokenClaimsSchema.safeParse(decoded.payload);
    if (!claims.success) {
      throw new OidcFlowError("OIDC_ID_TOKEN_INVALID", "Jeton d'identité invalide.");
    }
    const data = claims.data;
    const skew = this.config.clockSkewSeconds;

    if (data.iss.replace(/\/$/u, "") !== this.config.issuer) {
      throw new OidcFlowError("OIDC_ISSUER_MISMATCH", "Émetteur du jeton inattendu.");
    }
    const audiences = Array.isArray(data.aud) ? data.aud : [data.aud];
    if (!audiences.includes(this.config.clientId)) {
      throw new OidcFlowError("OIDC_AUDIENCE_MISMATCH", "Audience du jeton inattendue.");
    }
    if (audiences.length > 1 && data.azp !== this.config.clientId) {
      throw new OidcFlowError("OIDC_AZP_MISMATCH", "Partie autorisée inattendue.");
    }
    if (data.exp + skew <= nowEpochSeconds) {
      throw new OidcFlowError("OIDC_ID_TOKEN_EXPIRED", "Jeton d'identité expiré.");
    }
    if (data.iat - skew > nowEpochSeconds) {
      throw new OidcFlowError("OIDC_ID_TOKEN_NOT_YET_VALID", "Jeton d'identité pas encore valide.");
    }
    if (data.nbf !== undefined && data.nbf - skew > nowEpochSeconds) {
      throw new OidcFlowError("OIDC_ID_TOKEN_NOT_YET_VALID", "Jeton d'identité pas encore valide.");
    }
    if (!data.nonce || !equalsConstantTime(data.nonce, expectedNonce)) {
      throw new OidcFlowError("OIDC_NONCE_MISMATCH", "Nonce du jeton inattendu.");
    }

    const organizationId = organizationIdSchema.safeParse(
      decoded.payload[this.config.organizationClaim],
    );
    if (!organizationId.success) {
      throw new OidcFlowError(
        "OIDC_ORGANIZATION_CLAIM_MISSING",
        "Le jeton ne porte aucune organisation exploitable.",
        403,
      );
    }
    const rawRoles = decoded.payload[this.config.rolesClaim];
    const roles = normalizeRoles(
      Array.isArray(rawRoles)
        ? rawRoles.filter((role): role is string => typeof role === "string")
        : typeof rawRoles === "string"
          ? rawRoles.split(/[\s,]+/u)
          : [],
    );
    if (roles.length === 0) {
      throw new OidcFlowError("OIDC_ROLE_MISSING", "Aucun rôle PROBANT dans le jeton.", 403);
    }

    return {
      subject: data.sub,
      organizationId: organizationId.data,
      roles,
      acr: data.acr ?? null,
      amr: data.amr ?? [],
      authTimeEpochSeconds: data.auth_time ?? null,
      idTokenExpiresAtEpochSeconds: data.exp,
    };
  }
}

function equalsConstantTime(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
