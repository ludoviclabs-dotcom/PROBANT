import { beforeEach, describe, expect, it } from "vitest";
import { RequestAuthorizer } from "../authorize";
import { InMemoryDossierOwnershipReader } from "../dossier-scope";
import { OidcClient, createTransaction } from "../oidc/client";
import { seal, unseal, SealedCookieError } from "../sealed-cookie";
import type { SessionConfig } from "../session/config";
import { readSessionConfig } from "../session/config";
import {
  CSRF_HEADER,
  OIDC_TRANSACTION_COOKIE,
  SESSION_COOKIE,
  csrfTokenFor,
  expiredCookie,
  newSessionSecret,
  readCookie,
  serializeCookie,
  sessionTokenDigest,
} from "../session/cookie";
import { completeLogin, destroySession } from "../session/service";
import { InMemorySessionStore } from "../session/store";
import {
  TEST_CLIENT_ID,
  TEST_ISSUER,
  createFakeIdp,
  generateTestKey,
  signJwt,
  testOidcConfig,
} from "./helpers";

const SESSION_SECRET = "secret-de-session-de-tests-au-moins-32-octets";
const APP_ORIGIN = "https://probant.example.test";
const ORGANIZATION = "11111111-1111-4111-8111-111111111111";
const DOSSIER = "22222222-2222-4222-8222-222222222222";
const NOW = 1_800_000_000;

const sessionConfig: SessionConfig = {
  secret: SESSION_SECRET,
  idleTtlSeconds: 3_600,
  absoluteTtlSeconds: 43_200,
  appOrigin: APP_ORIGIN,
};

let store: InMemorySessionStore;

beforeEach(() => {
  store = new InMemorySessionStore();
});

describe("cookie scellé", () => {
  it("fait un aller-retour fidèle", () => {
    const payload = { state: "abc", nonce: "def" };
    expect(unseal(seal(payload, SESSION_SECRET, "oidc-transaction"), SESSION_SECRET, "oidc-transaction")).toEqual(
      payload,
    );
  });

  it("refuse un scellé modifié", () => {
    const sealed = seal({ state: "abc" }, SESSION_SECRET, "oidc-transaction");
    const parts = sealed.split(".");
    parts[2] = Buffer.from("charge utile substituée", "utf8").toString("base64url");
    expect(() => unseal(parts.join("."), SESSION_SECRET, "oidc-transaction")).toThrow(
      SealedCookieError,
    );
  });

  it("refuse un scellé d'un autre usage — pas de rejeu inter-contexte", () => {
    const sealed = seal({ state: "abc" }, SESSION_SECRET, "oidc-transaction");
    expect(() => unseal(sealed, SESSION_SECRET, "autre-usage")).toThrow(SealedCookieError);
  });

  it("refuse un secret trop court", () => {
    expect(() => seal({}, "trop-court", "oidc-transaction")).toThrowError(
      expect.objectContaining({ code: "AUTH_SECRET_TOO_SHORT" }),
    );
  });
});

describe("attributs de cookie", () => {
  it("pose HttpOnly, Secure, SameSite et Path=/", () => {
    const cookie = serializeCookie({
      name: SESSION_COOKIE,
      value: "valeur",
      maxAgeSeconds: 3_600,
      httpOnly: true,
      sameSite: "Lax",
    });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // Le préfixe `__Host-` interdit au navigateur tout attribut Domain.
    expect(cookie).not.toContain("Domain=");
    expect(cookie.startsWith("__Host-")).toBe(true);
  });

  it("expire un cookie sans laisser de valeur", () => {
    const cookie = expiredCookie(SESSION_COOKIE);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
  });

  it("lit un cookie parmi d'autres sans confondre les préfixes", () => {
    const header = `autre=1; ${SESSION_COOKIE}=le-secret; probant_session=leurre`;
    expect(readCookie(header, SESSION_COOKIE)).toBe("le-secret");
    expect(readCookie(null, SESSION_COOKIE)).toBeNull();
  });
});

describe("configuration de session", () => {
  it("échoue fermé sans secret", () => {
    expect(() => readSessionConfig({ AUTH_APP_ORIGIN: APP_ORIGIN })).toThrowError(
      /AUTH_SESSION_NOT_CONFIGURED/u,
    );
  });

  it("refuse un plafond absolu inférieur à la fenêtre d'inactivité", () => {
    expect(() =>
      readSessionConfig({
        AUTH_SESSION_SECRET: SESSION_SECRET,
        AUTH_APP_ORIGIN: APP_ORIGIN,
        AUTH_SESSION_IDLE_TTL_SECONDS: "3600",
        AUTH_SESSION_ABSOLUTE_TTL_SECONDS: "1800",
      }),
    ).toThrowError(/AUTH_SESSION_ABSOLUTE_TTL_SECONDS/u);
  });
});

describe("cycle de vie de la session", () => {
  async function createSession(nowEpochSeconds = NOW) {
    const secret = newSessionSecret();
    const record = await store.create({
      tokenSha256: sessionTokenDigest(secret),
      issuer: TEST_ISSUER,
      subject: "user-1",
      organizationId: ORGANIZATION,
      roles: ["reviewer"],
      acr: null,
      amr: ["mfa"],
      mfaSatisfied: true,
      nowEpochSeconds,
      idleTtlSeconds: sessionConfig.idleTtlSeconds,
      absoluteTtlSeconds: sessionConfig.absoluteTtlSeconds,
    });
    return { secret, record };
  }

  function authorizerAt(nowEpochSeconds: number): RequestAuthorizer {
    return new RequestAuthorizer({
      sessionStore: store,
      sessionConfig,
      nowEpochSeconds: () => nowEpochSeconds,
      dossierOwnership: new InMemoryDossierOwnershipReader(new Map([[DOSSIER, ORGANIZATION]])),
    });
  }

  function get(secret: string, extra: Record<string, string> = {}): Request {
    return new Request(`${APP_ORIGIN}/api/dossiers/${DOSSIER}/snapshot`, {
      headers: { cookie: `${SESSION_COOKIE}=${secret}`, origin: APP_ORIGIN, ...extra },
    });
  }

  function post(secret: string, extra: Record<string, string> = {}): Request {
    return new Request(`${APP_ORIGIN}/api/dossiers/${DOSSIER}/review-events`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${secret}`, origin: APP_ORIGIN, ...extra },
    });
  }

  it("résout un principal depuis le cookie", async () => {
    const { secret } = await createSession();
    const principal = await authorizerAt(NOW).authorize(get(secret), {
      permission: "dossier:read",
      dossierId: DOSSIER,
    });
    expect(principal).toMatchObject({
      organizationId: ORGANIZATION,
      authenticationMethod: "oidc-session",
      mfaSatisfied: true,
      dossierIds: null,
    });
  });

  it("refuse un secret de cookie inconnu", async () => {
    await createSession();
    await expect(
      authorizerAt(NOW).authorize(get("secret-inventé"), {
        permission: "dossier:read",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SESSION_INVALID", status: 401 }));
  });

  it("expire au-delà de la fenêtre d'inactivité", async () => {
    const { secret } = await createSession();
    await expect(
      authorizerAt(NOW + 3_601).authorize(get(secret), {
        permission: "dossier:read",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SESSION_INVALID" }));
  });

  it("ne se prolonge jamais au-delà du plafond absolu", async () => {
    const { secret } = await createSession();
    // Activité continue : une lecture toutes les 30 minutes.
    for (let elapsed = 1_800; elapsed < 43_200; elapsed += 1_800) {
      await authorizerAt(NOW + elapsed).authorize(get(secret), {
        permission: "dossier:read",
        dossierId: DOSSIER,
      });
    }
    await expect(
      authorizerAt(NOW + 43_201).authorize(get(secret), {
        permission: "dossier:read",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SESSION_INVALID" }));
  });

  it("refuse une requête mutante sans jeton CSRF", async () => {
    const { secret } = await createSession();
    await expect(
      authorizerAt(NOW).authorize(post(secret), {
        permission: "dossier:review",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "CSRF_TOKEN_INVALID" }));
  });

  it("refuse une requête mutante venue d'une autre origine", async () => {
    const { secret, record } = await createSession();
    await expect(
      authorizerAt(NOW).authorize(
        post(secret, {
          origin: "https://attaquant.example",
          [CSRF_HEADER]: csrfTokenFor(record.id, SESSION_SECRET),
        }),
        { permission: "dossier:review", dossierId: DOSSIER },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "ORIGIN_FORBIDDEN" }));
  });

  it("refuse une requête mutante sans origine identifiable", async () => {
    const { secret, record } = await createSession();
    const request = new Request(`${APP_ORIGIN}/api/dossiers/${DOSSIER}/review-events`, {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${secret}`,
        [CSRF_HEADER]: csrfTokenFor(record.id, SESSION_SECRET),
      },
    });
    await expect(
      authorizerAt(NOW).authorize(request, {
        permission: "dossier:review",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "ORIGIN_MISSING" }));
  });

  it("accepte une requête mutante correctement accompagnée", async () => {
    const { secret, record } = await createSession();
    const principal = await authorizerAt(NOW).authorize(
      post(secret, { [CSRF_HEADER]: csrfTokenFor(record.id, SESSION_SECRET) }),
      { permission: "dossier:review", dossierId: DOSSIER },
    );
    expect(principal.subject).toBe("user-1");
  });

  it("refuse le jeton CSRF d'une autre session", async () => {
    const première = await createSession();
    const seconde = await createSession();
    await expect(
      authorizerAt(NOW).authorize(
        post(première.secret, { [CSRF_HEADER]: csrfTokenFor(seconde.record.id, SESSION_SECRET) }),
        { permission: "dossier:review", dossierId: DOSSIER },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "CSRF_TOKEN_INVALID" }));
  });

  it("invalide la session après déconnexion", async () => {
    const { secret } = await createSession();
    const cookies = await destroySession(
      new Request(`${APP_ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${secret}` },
      }),
      { sessionStore: store, nowEpochSeconds: () => NOW },
    );
    expect(cookies[0]).toContain("Max-Age=0");
    await expect(
      authorizerAt(NOW).authorize(get(secret), {
        permission: "dossier:read",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SESSION_INVALID" }));
  });

  it("exige une authentification quand aucun cookie ni contexte signé n'est présent", async () => {
    const request = new Request(`${APP_ORIGIN}/api/dossiers/${DOSSIER}/snapshot`);
    await expect(
      authorizerAt(NOW).authorize(request, {
        permission: "dossier:read",
        dossierId: DOSSIER,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED", status: 401 }),
    );
  });
});

describe("achèvement du flux OIDC", () => {
  function claims(overrides: Record<string, unknown> = {}) {
    return {
      iss: TEST_ISSUER,
      sub: "auth0|abc",
      aud: TEST_CLIENT_ID,
      exp: NOW + 300,
      iat: NOW - 10,
      organization_id: ORGANIZATION,
      roles: ["reviewer"],
      amr: ["mfa"],
      ...overrides,
    };
  }

  function callbackRequest(
    transactionCookie: string | null,
    params: Record<string, string>,
  ): Request {
    const url = new URL(`${APP_ORIGIN}/api/auth/callback`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return new Request(url, {
      headers: transactionCookie
        ? { cookie: `${OIDC_TRANSACTION_COOKIE}=${transactionCookie}` }
        : {},
    });
  }

  async function run(
    options: {
      transactionAgeSeconds?: number;
      state?: string;
      nonceInToken?: string;
      claimOverrides?: Record<string, unknown>;
      cookiePresent?: boolean;
    } = {},
  ) {
    const key = generateTestKey();
    const transaction = createTransaction(
      "/dashboard/synthese",
      NOW - (options.transactionAgeSeconds ?? 0),
    );
    const idp = createFakeIdp(
      key,
      signJwt(
        key,
        claims({
          nonce: options.nonceInToken ?? transaction.nonce,
          ...options.claimOverrides,
        }),
      ),
    );
    const config = testOidcConfig();
    return completeLogin(
      callbackRequest(
        options.cookiePresent === false
          ? null
          : seal(transaction, SESSION_SECRET, "oidc-transaction"),
        { code: "le-code", state: options.state ?? transaction.state },
      ),
      {
        oidcClient: new OidcClient(config, { fetchImpl: idp.fetchImpl }),
        oidcConfig: config,
        sessionConfig,
        sessionStore: store,
        nowEpochSeconds: () => NOW,
      },
    );
  }

  it("crée une session et pose un cookie HttpOnly", async () => {
    const result = await run();
    expect(result.redirectTo).toBe("/dashboard/synthese");
    expect(result.session.organizationId).toBe(ORGANIZATION);
    expect(result.mfa).toEqual({ satisfied: true, reason: "amr_matched" });
    expect(result.setCookies[0]).toContain("HttpOnly");
    expect(result.setCookies[0]).toContain("Secure");
    // La transaction est effacée dès qu'elle a servi.
    expect(result.setCookies[1]).toContain(`${OIDC_TRANSACTION_COOKIE}=;`);
  });

  it("stocke une empreinte, jamais le secret du cookie", async () => {
    const result = await run();
    const cookieValue = result.setCookies[0].split(";")[0].split("=")[1];
    const found = await store.findByTokenDigest(sessionTokenDigest(cookieValue), NOW);
    expect(found?.id).toBe(result.session.id);
    expect(await store.findByTokenDigest(cookieValue, NOW)).toBeNull();
  });

  it("refuse un state qui ne correspond pas", async () => {
    await expect(run({ state: "state-attaquant" })).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_STATE_MISMATCH" }),
    );
  });

  it("refuse une transaction absente", async () => {
    await expect(run({ cookiePresent: false })).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_TRANSACTION_MISSING" }),
    );
  });

  it("refuse une transaction périmée", async () => {
    await expect(run({ transactionAgeSeconds: 601 })).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_TRANSACTION_EXPIRED" }),
    );
  });

  it("refuse un jeton rejoué avec le nonce d'une autre transaction", async () => {
    await expect(run({ nonceInToken: "nonce-d-une-autre-transaction" })).rejects.toThrowError(
      expect.objectContaining({ code: "OIDC_NONCE_MISMATCH" }),
    );
  });

  it("refuse la session quand la MFA exigée n'est pas constatée", async () => {
    await expect(run({ claimOverrides: { amr: ["pwd"] } })).rejects.toThrowError(
      expect.objectContaining({ code: "MFA_REQUIRED", status: 403 }),
    );
  });

  it("refuse une erreur renvoyée par le fournisseur sans recopier son libellé", async () => {
    const key = generateTestKey();
    const idp = createFakeIdp(key, signJwt(key, claims({ nonce: "x" })));
    const config = testOidcConfig();
    const url = new URL(`${APP_ORIGIN}/api/auth/callback`);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "utilisateur jean.dupont@acme.fr refusé");
    await expect(
      completeLogin(new Request(url), {
        oidcClient: new OidcClient(config, { fetchImpl: idp.fetchImpl }),
        oidcConfig: config,
        sessionConfig,
        sessionStore: store,
        nowEpochSeconds: () => NOW,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "OIDC_PROVIDER_REJECTED",
        message: expect.not.stringContaining("jean.dupont"),
      }),
    );
  });
});
