import { z } from "zod";
import { jsonWebKeySetSchema, type JsonWebKey } from "./jwt";
import type { OidcConfig } from "./config";

/**
 * Découverte OIDC et cache JWKS.
 *
 * Le document de découverte est refusé si son `issuer` diffère de l'`issuer`
 * configuré : sans ce contrôle, une redirection DNS suffirait à substituer un
 * fournisseur d'identité.
 */
export const discoveryDocumentSchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  userinfo_endpoint: z.string().url().optional(),
  end_session_endpoint: z.string().url().optional(),
  id_token_signing_alg_values_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});

export type DiscoveryDocument = z.infer<typeof discoveryDocumentSchema>;

export class OidcDiscoveryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "OidcDiscoveryError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

export interface DiscoveryClientOptions {
  readonly fetchImpl?: FetchLike;
  readonly nowMs?: () => number;
  /** Délai réseau maximal ; un IdP lent ne doit pas bloquer une Function. */
  readonly timeoutMs?: number;
}

export class OidcDiscoveryClient {
  private discoveryCache: CacheEntry<DiscoveryDocument> | undefined;
  private jwksCache: CacheEntry<JsonWebKey[]> | undefined;
  private lastJwksRefreshMs = 0;

  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: OidcConfig,
    options: DiscoveryClientOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new OidcDiscoveryError(
          "OIDC_DISCOVERY_HTTP_ERROR",
          `Réponse ${response.status} du fournisseur d'identité.`,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof OidcDiscoveryError) throw error;
      throw new OidcDiscoveryError(
        "OIDC_DISCOVERY_UNREACHABLE",
        "Fournisseur d'identité injoignable.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async discover(): Promise<DiscoveryDocument> {
    const now = this.nowMs();
    if (this.discoveryCache && this.discoveryCache.expiresAtMs > now) {
      return this.discoveryCache.value;
    }
    const url = `${this.config.issuer}/.well-known/openid-configuration`;
    const parsed = discoveryDocumentSchema.safeParse(await this.getJson(url));
    if (!parsed.success) {
      throw new OidcDiscoveryError(
        "OIDC_DISCOVERY_INVALID",
        "Document de découverte OIDC invalide.",
      );
    }
    if (parsed.data.issuer.replace(/\/$/u, "") !== this.config.issuer) {
      throw new OidcDiscoveryError(
        "OIDC_ISSUER_MISMATCH",
        "L'issuer annoncé ne correspond pas à la configuration.",
      );
    }
    this.discoveryCache = {
      value: parsed.data,
      expiresAtMs: now + this.config.jwksCacheSeconds * 1_000,
    };
    return parsed.data;
  }

  /**
   * Retourne les clés de signature.
   *
   * `forceRefresh` sert au cas d'un `kid` inconnu (rotation de clés). Il est
   * limité à un rafraîchissement par minute pour qu'un jeton forgé avec un
   * `kid` aléatoire ne devienne pas un amplificateur de requêtes vers l'IdP.
   */
  async signingKeys(forceRefresh = false): Promise<JsonWebKey[]> {
    const now = this.nowMs();
    const fresh = this.jwksCache && this.jwksCache.expiresAtMs > now;
    const refreshAllowed = now - this.lastJwksRefreshMs >= 60_000;
    if (fresh && !(forceRefresh && refreshAllowed)) {
      return this.jwksCache!.value;
    }
    if (!fresh && !refreshAllowed && this.jwksCache) {
      return this.jwksCache.value;
    }

    const discovery = await this.discover();
    const parsed = jsonWebKeySetSchema.safeParse(await this.getJson(discovery.jwks_uri));
    if (!parsed.success || parsed.data.keys.length === 0) {
      throw new OidcDiscoveryError("OIDC_JWKS_INVALID", "JWKS du fournisseur invalide.");
    }
    this.lastJwksRefreshMs = now;
    this.jwksCache = {
      value: parsed.data.keys,
      expiresAtMs: now + this.config.jwksCacheSeconds * 1_000,
    };
    return parsed.data.keys;
  }
}
