import { describe, expect, it } from "vitest";
import { RequestAuthorizer } from "../authorize";
import { LOCAL_OWNER_SUBJECT, LOCAL_SIMULATION_SUBJECT, readLocalAuthConfig, type LocalAuthConfig } from "../local/config";
import { completeLocalLogin, localCodeDigest, safeReturnPath, type LocalLoginStore } from "../local/login";
import type { SessionConfig } from "../session/config";
import { SESSION_COOKIE, sessionTokenDigest } from "../session/cookie";
import { InMemorySessionStore } from "../session/store";

const pg = (credentials: string, hostAndDatabase: string) => "postgresql://" + credentials + "@" + hostAndDatabase;
const PROFILE = "6f1c2a4e-3b7d-4c9a-8e21-5d0f7a9b1c33", ORG = "0b4d6e8f-1a2c-4e3f-9a5b-7c8d9e0f1a2b";
const env = {
  PROBANT_RUNTIME_PROFILE: "personal", PROBANT_LOCAL_PROFILE_ID: PROFILE, PROBANT_LOCAL_HOME: "C:\\profil",
  DATABASE_URL: pg("probant_app:x", "127.0.0.1:54329/probant_personnel"), PROBANT_LOCAL_ORGANIZATION_ID: ORG, PROBANT_LOCAL_OWNER_NAME: "Camille Martin",
};
const config = readLocalAuthConfig(env) as LocalAuthConfig;
const sessionConfig: SessionConfig = { secret: "s".repeat(40), idleTtlSeconds: 3_600, absoluteTtlSeconds: 43_200, appOrigin: "http://127.0.0.1:3210" };
const NOW = 1_800_000_000;

function loginStore(codes: Record<string, string>, profileId: string | null = PROFILE): LocalLoginStore & { used: string[] } {
  const used: string[] = [];
  return { used, profileId: async () => profileId, consumeCode: async digest => { const subject = codes[digest]; if (!subject || used.includes(digest)) return null; used.push(digest); return subject; } };
}
async function login(url: string, store: LocalLoginStore, sessionStore = new InMemorySessionStore(), cfg = config) {
  return completeLocalLogin(new Request(url), { config: cfg, sessionConfig, sessionStore, loginStore: store, nowEpochSeconds: () => NOW });
}
const CODE = "A".repeat(43);

describe("C07 — connexion du profil personnel local", () => {
  it("lit la configuration seulement dans un profil personnel valide", () => {
    expect(config).toMatchObject({ profileId: PROFILE, issuer: "probant-local:" + PROFILE, organizationId: ORG, ownerName: "Camille Martin", ownerReview: "personal", simulationEnabled: false });
    expect(readLocalAuthConfig({ ...env, PROBANT_RUNTIME_PROFILE: undefined })).toBeNull();
    expect(readLocalAuthConfig({ ...env, PROBANT_LOCAL_OWNER_NAME: " " })).toBeNull();
    expect(readLocalAuthConfig({ ...env, DATABASE_URL: pg("u:x", "127.0.0.1:5432/probant_ci") })).toBeNull();
    expect(readLocalAuthConfig({ ...env, PROBANT_LOCAL_REVIEW: "admin" })).toBeNull();
  });

  it("un code valide ouvre une session serveur ordinaire, une seule fois", async () => {
    const store = loginStore({ [localCodeDigest(CODE)]: LOCAL_OWNER_SUBJECT }), sessions = new InMemorySessionStore();
    const result = await login("http://127.0.0.1:3210/api/auth/local?code=" + CODE + "&next=/tresorerie%3FdossierId%3Dx", store, sessions);
    expect(result.kind).toBe("session");
    if (result.kind !== "session") return;
    expect(result.location).toBe("http://127.0.0.1:3210/tresorerie?dossierId=x");
    expect(result.setCookie).toMatch(new RegExp("^" + SESSION_COOKIE + "=[A-Za-z0-9_-]{40,}; Path=/; Max-Age=43200; SameSite=Lax; Secure; HttpOnly$"));
    expect(result.session).toMatchObject({ subject: LOCAL_OWNER_SUBJECT, issuer: "probant-local:" + PROFILE, organizationId: ORG, roles: ["preparer", "reviewer", "signer"], mfaSatisfied: false });
    await expect(login("http://127.0.0.1:3210/api/auth/local?code=" + CODE, store, sessions)).rejects.toMatchObject({ code: "LOCAL_LOGIN_CODE_INVALID", status: 401 });
  });

  it("refuse un hôte non local, une base d'un autre profil, un code mal formé ; renvoie vers l'origine déclarée", async () => {
    const store = loginStore({ [localCodeDigest(CODE)]: LOCAL_OWNER_SUBJECT });
    await expect(login("http://192.168.1.20:3210/api/auth/local?code=" + CODE, store)).rejects.toMatchObject({ code: "LOCAL_LOGIN_LOOPBACK_ONLY" });
    await expect(login("http://127.0.0.1:3210/api/auth/local?code=" + CODE, loginStore({}, "11111111-1111-4111-8111-111111111111"))).rejects.toMatchObject({ code: "LOCAL_PROFILE_DATABASE_MISMATCH" });
    await expect(login("http://127.0.0.1:3210/api/auth/local?code=court", store)).rejects.toMatchObject({ code: "LOCAL_LOGIN_CODE_INVALID" });
    expect(await login("http://localhost:3210/api/auth/local?code=" + CODE, store)).toEqual({ kind: "redirect_canonical", location: "http://127.0.0.1:3210/api/auth/local?code=" + CODE });
    expect(store.used).toEqual([]);
  });

  it("suit l'hôte visité (en-tête Host) quand l'URL interne du serveur porte un autre nom local", async () => {
    const store = loginStore({ [localCodeDigest(CODE)]: LOCAL_OWNER_SUBJECT });
    const result = await completeLocalLogin(new Request("http://localhost:3210/api/auth/local?code=" + CODE, { headers: { host: "127.0.0.1:3210" } }),
      { config, sessionConfig, sessionStore: new InMemorySessionStore(), loginStore: store, nowEpochSeconds: () => NOW });
    expect(result.kind).toBe("session");
    await expect(completeLocalLogin(new Request("http://127.0.0.1:3210/api/auth/local?code=" + CODE, { headers: { host: "evil.example:3210" } }),
      { config, sessionConfig, sessionStore: new InMemorySessionStore(), loginStore: store, nowEpochSeconds: () => NOW })).rejects.toMatchObject({ code: "LOCAL_LOGIN_LOOPBACK_ONLY" });
  });

  it("la seconde identité n'existe que si la simulation est ouverte, avec le seul rôle de relecteur", async () => {
    const digest = localCodeDigest(CODE);
    await expect(login("http://127.0.0.1:3210/api/auth/local?code=" + CODE, loginStore({ [digest]: LOCAL_SIMULATION_SUBJECT }))).rejects.toMatchObject({ code: "LOCAL_LOGIN_CODE_INVALID" });
    const result = await login("http://127.0.0.1:3210/api/auth/local?code=" + CODE, loginStore({ [digest]: LOCAL_SIMULATION_SUBJECT }), new InMemorySessionStore(), { ...config, simulationEnabled: true });
    expect(result.kind === "session" && result.session.roles).toEqual(["reviewer"]);
  });

  it("chemin de retour : relatif uniquement", () => {
    for (const bad of [null, "https://evil.example", "//evil.example", "/\\evil", "x"]) expect(safeReturnPath(bad)).toBe("/local");
    expect(safeReturnPath("/dossier-cloture?dossierId=1")).toBe("/dossier-cloture?dossierId=1");
  });
});

describe("C07 — l'autorisation des routes décide du type de relecture", () => {
  async function principalFor(record: { issuer: string; subject: string; organizationId?: string }, localAuth: LocalAuthConfig | null) {
    const sessionStore = new InMemorySessionStore();
    await sessionStore.create({ tokenSha256: sessionTokenDigest("secret"), issuer: record.issuer, subject: record.subject, organizationId: record.organizationId ?? ORG, roles: ["admin"], acr: null, amr: [], mfaSatisfied: false, nowEpochSeconds: NOW, idleTtlSeconds: 3_600, absoluteTtlSeconds: 7_200 });
    const authorizer = new RequestAuthorizer({ sessionStore, sessionConfig, nowEpochSeconds: () => NOW, localAuth });
    return authorizer.principal(new Request("http://127.0.0.1:3210/api/x", { headers: { cookie: SESSION_COOKIE + "=secret" } }));
  }

  it("propriétaire local : rôles et relecture personnelle viennent de la configuration serveur, pas de la session", async () => {
    const principal = await principalFor({ issuer: config.issuer, subject: LOCAL_OWNER_SUBJECT }, config);
    expect(principal).toMatchObject({ authenticationMethod: "local-session", roles: ["preparer", "reviewer", "signer"], reviewKind: "personal", displayName: "Camille Martin" });
    const distinct = await principalFor({ issuer: config.issuer, subject: LOCAL_OWNER_SUBJECT }, { ...config, ownerReview: "distinct_identity" });
    expect(distinct.reviewKind).toBe("distinct_identity");
  });

  it("une session locale hors profil, d'un autre profil ou d'une autre organisation est refusée", async () => {
    await expect(principalFor({ issuer: config.issuer, subject: LOCAL_OWNER_SUBJECT }, null)).rejects.toMatchObject({ code: "SESSION_INVALID", status: 401 });
    await expect(principalFor({ issuer: "probant-local:11111111-1111-4111-8111-111111111111", subject: LOCAL_OWNER_SUBJECT }, config)).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(principalFor({ issuer: config.issuer, subject: LOCAL_OWNER_SUBJECT, organizationId: "22222222-2222-4222-8222-222222222222" }, config)).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(principalFor({ issuer: config.issuer, subject: LOCAL_SIMULATION_SUBJECT }, config)).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });

  it("une session OIDC reste inchangée : rôles de la session, aucun type de relecture", async () => {
    const principal = await principalFor({ issuer: "https://idp.example", subject: "u-1" }, config);
    expect(principal).toMatchObject({ authenticationMethod: "oidc-session", roles: ["admin"] });
    expect(principal.reviewKind).toBeUndefined();
  });
});
