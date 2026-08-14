import {
  constants as cryptoConstants,
  generateKeyPairSync,
  sign as signPayload,
  type KeyObject,
} from "node:crypto";
import type { OidcConfig } from "../oidc/config";
import type { JsonWebKey } from "../oidc/jwt";

/**
 * Fabrique de jetons d'identité pour les tests.
 *
 * Les jetons sont **réellement signés** avec une paire de clés générée à la
 * volée : un test qui passerait avec une signature factice ne prouverait rien
 * de la vérification.
 */
export interface TestKeyPair {
  readonly kid: string;
  readonly algorithm: "RS256" | "ES256" | "PS256";
  readonly privateKey: KeyObject;
  readonly jwk: JsonWebKey;
}

export function generateTestKey(
  algorithm: TestKeyPair["algorithm"] = "RS256",
  kid = "test-key-1",
): TestKeyPair {
  const { privateKey, publicKey } =
    algorithm === "ES256"
      ? generateKeyPairSync("ec", { namedCurve: "P-256" })
      : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as unknown as JsonWebKey;
  return { kid, algorithm, privateKey, jwk: { ...jwk, kid, use: "sig", alg: algorithm } };
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signJwt(
  key: TestKeyPair,
  claims: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
): string {
  const header = { alg: key.algorithm, typ: "JWT", kid: key.kid, ...headerOverrides };
  const signingInput = `${base64url(header)}.${base64url(claims)}`;
  const hash = "sha256";
  const options =
    key.algorithm === "ES256"
      ? { key: key.privateKey, dsaEncoding: "ieee-p1363" as const }
      : key.algorithm === "PS256"
        ? {
            key: key.privateKey,
            padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
            saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
          }
        : { key: key.privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING };
  const signature = signPayload(hash, Buffer.from(signingInput, "utf8"), options);
  return `${signingInput}.${signature.toString("base64url")}`;
}

/** Jeton `alg: none` — doit toujours être refusé. */
export function unsignedJwt(claims: Record<string, unknown>): string {
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url(claims)}.`;
}

export const TEST_ISSUER = "https://idp.example.test";
export const TEST_CLIENT_ID = "probant-test-client";

export function testOidcConfig(overrides: Partial<OidcConfig> = {}): OidcConfig {
  return {
    issuer: TEST_ISSUER,
    clientId: TEST_CLIENT_ID,
    clientSecret: "test-client-secret",
    redirectUri: "https://probant.example.test/api/auth/callback",
    postLogoutRedirectUri: null,
    scopes: "openid profile email",
    organizationClaim: "organization_id",
    rolesClaim: "roles",
    requiredAcr: [],
    requiredAmr: ["mfa"],
    mfaEnforcement: "required",
    clockSkewSeconds: 60,
    jwksCacheSeconds: 900,
    ...overrides,
  };
}

/**
 * `fetch` factice servant la découverte OIDC, le JWKS et l'endpoint de jetons.
 * Compte les appels afin de vérifier le cache et la limitation de rotation.
 */
export interface FakeIdp {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  calls: { discovery: number; jwks: number; token: number };
  idToken: string;
  setIdToken(token: string): void;
  setKeys(keys: JsonWebKey[]): void;
  tokenStatus: number;
  lastTokenBody: string | null;
}

export function createFakeIdp(key: TestKeyPair, idToken = ""): FakeIdp {
  let currentKeys: JsonWebKey[] = [key.jwk];
  const state: FakeIdp = {
    calls: { discovery: 0, jwks: 0, token: 0 },
    idToken,
    tokenStatus: 200,
    lastTokenBody: null,
    setIdToken(token) {
      state.idToken = token;
    },
    setKeys(keys) {
      currentKeys = keys;
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        state.calls.discovery += 1;
        return jsonResponse({
          issuer: TEST_ISSUER,
          authorization_endpoint: `${TEST_ISSUER}/authorize`,
          token_endpoint: `${TEST_ISSUER}/token`,
          jwks_uri: `${TEST_ISSUER}/jwks`,
          code_challenge_methods_supported: ["S256"],
        });
      }
      if (url === `${TEST_ISSUER}/jwks`) {
        state.calls.jwks += 1;
        return jsonResponse({ keys: currentKeys });
      }
      if (url === `${TEST_ISSUER}/token`) {
        state.calls.token += 1;
        state.lastTokenBody = typeof init?.body === "string" ? init.body : null;
        if (state.tokenStatus !== 200) {
          return jsonResponse({ error: "invalid_grant" }, state.tokenStatus);
        }
        return jsonResponse({ id_token: state.idToken, token_type: "Bearer" });
      }
      return jsonResponse({ error: "not_found" }, 404);
    },
  };
  return state;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
