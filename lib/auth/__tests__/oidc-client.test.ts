import { describe, expect, it } from "vitest";
import { OidcClient, codeChallengeFor, createTransaction, safeReturnTo } from "../oidc/client";
import { readOidcConfig } from "../oidc/config";
import {
  TEST_CLIENT_ID,
  TEST_ISSUER,
  createFakeIdp,
  generateTestKey,
  signJwt,
  testOidcConfig,
} from "./helpers";

const NOW = 1_800_000_000;
const ORGANIZATION = "11111111-1111-4111-8111-111111111111";

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: TEST_ISSUER,
    sub: "auth0|abc",
    aud: TEST_CLIENT_ID,
    exp: NOW + 300,
    iat: NOW - 10,
    nonce: "nonce-attendu",
    organization_id: ORGANIZATION,
    roles: ["reviewer"],
    amr: ["pwd", "mfa"],
    ...overrides,
  };
}

function clientFor(idp: ReturnType<typeof createFakeIdp>, config = testOidcConfig()) {
  return new OidcClient(config, { fetchImpl: idp.fetchImpl });
}

describe("configuration OIDC", () => {
  const complete = {
    OIDC_ISSUER: TEST_ISSUER,
    OIDC_CLIENT_ID: TEST_CLIENT_ID,
    OIDC_CLIENT_SECRET: "s3cret",
    OIDC_REDIRECT_URI: "https://probant.example.test/api/auth/callback",
    OIDC_REQUIRED_AMR: "mfa",
  };

  it("échoue fermé si une variable manque", () => {
    expect(() => readOidcConfig({ ...complete, OIDC_CLIENT_SECRET: undefined })).toThrowError(
      /OIDC_NOT_CONFIGURED/u,
    );
  });

  it("refuse une MFA exigée sans signal à vérifier", () => {
    expect(() =>
      readOidcConfig({ ...complete, OIDC_REQUIRED_AMR: undefined }),
    ).toThrowError(/OIDC_REQUIRED_ACR,OIDC_REQUIRED_AMR/u);
  });

  it("refuse une URI de retour non HTTPS hors localhost", () => {
    expect(() =>
      readOidcConfig({ ...complete, OIDC_REDIRECT_URI: "http://probant.example.test/cb" }),
    ).toThrowError(/OIDC_REDIRECT_URI/u);
  });

  it("accepte localhost en clair pour le développement", () => {
    const config = readOidcConfig({
      ...complete,
      OIDC_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
    });
    expect(config.clientId).toBe(TEST_CLIENT_ID);
  });
});

describe("URL d'autorisation", () => {
  it("porte PKCE S256, state, nonce et acr_values", async () => {
    const key = generateTestKey();
    const idp = createFakeIdp(key);
    const config = testOidcConfig({ requiredAcr: ["urn:mfa"], requiredAmr: [] });
    const transaction = createTransaction("/dashboard/synthese", NOW);
    const url = new URL(await clientFor(idp, config).authorizationUrl(transaction));

    expect(url.origin + url.pathname).toBe(`${TEST_ISSUER}/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      codeChallengeFor(transaction.codeVerifier),
    );
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
    expect(url.searchParams.get("acr_values")).toBe("urn:mfa");
    // Le `code_verifier` ne doit jamais partir vers l'IdP à cette étape.
    expect(url.search).not.toContain(transaction.codeVerifier);
  });

  it("met en cache la découverte", async () => {
    const idp = createFakeIdp(generateTestKey());
    const client = clientFor(idp);
    await client.authorizationUrl(createTransaction("/", NOW));
    await client.authorizationUrl(createTransaction("/", NOW));
    expect(idp.calls.discovery).toBe(1);
  });
});

describe("returnTo", () => {
  it("n'accepte qu'un chemin interne", () => {
    expect(safeReturnTo("/dashboard/risques")).toBe("/dashboard/risques");
    expect(safeReturnTo("https://evil.example/steal")).toBe("/dashboard");
    expect(safeReturnTo("//evil.example/steal")).toBe("/dashboard");
    expect(safeReturnTo(null)).toBe("/dashboard");
  });
});

describe("échange du code", () => {
  it("authentifie le client et transmet le code_verifier", async () => {
    const key = generateTestKey();
    const idp = createFakeIdp(key, signJwt(key, baseClaims()));
    await clientFor(idp).exchangeCode("le-code", "le-verifier");
    expect(idp.lastTokenBody).toContain("code=le-code");
    expect(idp.lastTokenBody).toContain("code_verifier=le-verifier");
    expect(idp.lastTokenBody).toContain("grant_type=authorization_code");
  });

  it("remonte un refus du fournisseur", async () => {
    const idp = createFakeIdp(generateTestKey());
    idp.tokenStatus = 400;
    await expect(clientFor(idp).exchangeCode("x", "y")).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_TOKEN_REJECTED" }),
    );
  });
});

describe("validation du jeton d'identité", () => {
  async function verify(
    claims: Record<string, unknown>,
    options: { nonce?: string; now?: number; config?: ReturnType<typeof testOidcConfig> } = {},
  ) {
    const key = generateTestKey();
    const idp = createFakeIdp(key);
    return clientFor(idp, options.config).verifyIdToken(
      signJwt(key, claims),
      options.nonce ?? "nonce-attendu",
      options.now ?? NOW,
    );
  }

  it("projette l'identité PROBANT", async () => {
    const identity = await verify(baseClaims());
    expect(identity).toMatchObject({
      subject: "auth0|abc",
      organizationId: ORGANIZATION,
      roles: ["reviewer"],
      amr: ["pwd", "mfa"],
    });
  });

  it("traduit le rôle historique uploader en preparer", async () => {
    const identity = await verify(baseClaims({ roles: ["uploader"] }));
    expect(identity.roles).toEqual(["preparer"]);
  });

  it("ignore les rôles inconnus sans accorder de droit", async () => {
    const identity = await verify(baseClaims({ roles: ["superadmin", "reviewer"] }));
    expect(identity.roles).toEqual(["reviewer"]);
  });

  it("refuse un jeton sans rôle PROBANT exploitable", async () => {
    await expect(verify(baseClaims({ roles: ["superadmin"] }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_ROLE_MISSING" }),
    );
  });

  it("refuse un émetteur différent", async () => {
    await expect(verify(baseClaims({ iss: "https://autre.idp" }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_ISSUER_MISMATCH" }),
    );
  });

  it("refuse une audience différente", async () => {
    await expect(verify(baseClaims({ aud: "autre-client" }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_AUDIENCE_MISMATCH" }),
    );
  });

  it("refuse une audience multiple sans azp correspondant", async () => {
    await expect(
      verify(baseClaims({ aud: [TEST_CLIENT_ID, "autre"], azp: "autre" })),
    ).rejects.toThrowError(expect.objectContaining({ code: "OIDC_AZP_MISMATCH" }));
  });

  it("refuse un jeton expiré au-delà de la tolérance d'horloge", async () => {
    await expect(verify(baseClaims({ exp: NOW - 120 }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_ID_TOKEN_EXPIRED" }),
    );
  });

  it("tolère une dérive d'horloge inférieure au seuil", async () => {
    const identity = await verify(baseClaims({ exp: NOW - 30 }));
    expect(identity.subject).toBe("auth0|abc");
  });

  it("refuse un nonce qui ne correspond pas", async () => {
    await expect(verify(baseClaims(), { nonce: "autre-nonce" })).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_NONCE_MISMATCH" }),
    );
  });

  it("refuse un jeton sans nonce", async () => {
    await expect(verify(baseClaims({ nonce: undefined }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_NONCE_MISMATCH" }),
    );
  });

  it("refuse une organisation absente ou non UUID", async () => {
    await expect(verify(baseClaims({ organization_id: "acme" }))).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_ORGANIZATION_CLAIM_MISSING" }),
    );
  });

  it("rafraîchit le JWKS après rotation de clé, une fois la temporisation écoulée", async () => {
    const oldKey = generateTestKey("RS256", "ancienne");
    const newKey = generateTestKey("RS256", "nouvelle");
    const idp = createFakeIdp(oldKey);
    let clockMs = 0;
    const client = new OidcClient(testOidcConfig(), {
      fetchImpl: idp.fetchImpl,
      nowMs: () => clockMs,
    });

    await client.verifyIdToken(signJwt(oldKey, baseClaims()), "nonce-attendu", NOW);
    const callsAfterFirst = idp.calls.jwks;

    idp.setKeys([newKey.jwk]);
    clockMs += 61_000;
    const identity = await client.verifyIdToken(
      signJwt(newKey, baseClaims()),
      "nonce-attendu",
      NOW,
    );
    expect(identity.subject).toBe("auth0|abc");
    expect(idp.calls.jwks).toBe(callsAfterFirst + 1);
  });

  it("temporise le rafraîchissement JWKS — un kid forgé n'amplifie pas le trafic vers l'IdP", async () => {
    const key = generateTestKey("RS256", "reelle");
    const idp = createFakeIdp(key);
    let clockMs = 0;
    const client = new OidcClient(testOidcConfig(), {
      fetchImpl: idp.fetchImpl,
      nowMs: () => clockMs,
    });
    await client.verifyIdToken(signJwt(key, baseClaims()), "nonce-attendu", NOW);
    const callsAfterFirst = idp.calls.jwks;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      clockMs += 1_000;
      await expect(
        client.verifyIdToken(
          signJwt(key, baseClaims(), { kid: `forge-${attempt}` }),
          "nonce-attendu",
          NOW,
        ),
      ).rejects.toThrowError(expect.objectContaining({ code: "JWKS_KEY_NOT_FOUND" }));
    }
    expect(idp.calls.jwks).toBe(callsAfterFirst);
  });
});
