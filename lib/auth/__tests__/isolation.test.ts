import { beforeEach, describe, expect, it } from "vitest";
import { RequestAuthorizer } from "../authorize";
import { InMemoryDossierOwnershipReader } from "../dossier-scope";
import { signPersistentContext } from "../persistent-context";
import type { Permission, ProbantRole } from "../roles";
import type { SessionConfig } from "../session/config";
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  csrfTokenFor,
  newSessionSecret,
  sessionTokenDigest,
} from "../session/cookie";
import { InMemorySessionStore } from "../session/store";

/**
 * Tests négatifs d'isolation inter-organisations.
 *
 * Ces cas ne vérifient pas qu'une fonctionnalité marche : ils vérifient qu'un
 * accès **n'a pas lieu**. Ils couvrent nommément les quatre scénarios exigés
 * par la revue de release : lecture, téléchargement, export et job d'une autre
 * organisation.
 */
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOSSIER_A = "11111111-1111-4111-8111-111111111111";
const DOSSIER_B = "22222222-2222-4222-8222-222222222222";

const GATEWAY_SECRET = "secret-de-passerelle-de-tests-32-octets";
const SESSION_SECRET = "secret-de-session-de-tests-au-moins-32-octets";
const APP_ORIGIN = "https://probant.example.test";
const NOW = 1_800_000_000;

const sessionConfig: SessionConfig = {
  secret: SESSION_SECRET,
  idleTtlSeconds: 3_600,
  absoluteTtlSeconds: 43_200,
  appOrigin: APP_ORIGIN,
};

const ownership = new InMemoryDossierOwnershipReader(
  new Map([
    [DOSSIER_A, ORG_A],
    [DOSSIER_B, ORG_B],
  ]),
);

let sessionStore: InMemorySessionStore;

function authorizer(): RequestAuthorizer {
  return new RequestAuthorizer({
    sessionStore,
    sessionConfig,
    nowEpochSeconds: () => NOW,
    dossierOwnership: ownership,
  });
}

async function sessionHeaders(
  organizationId: string,
  roles: ProbantRole[],
): Promise<{ cookie: string; csrf: string }> {
  const secret = newSessionSecret();
  const record = await sessionStore.create({
    tokenSha256: sessionTokenDigest(secret),
    issuer: "https://idp.example.test",
    subject: "user-1",
    organizationId,
    roles,
    acr: null,
    amr: ["mfa"],
    mfaSatisfied: true,
    nowEpochSeconds: NOW,
    idleTtlSeconds: sessionConfig.idleTtlSeconds,
    absoluteTtlSeconds: sessionConfig.absoluteTtlSeconds,
  });
  return {
    cookie: `${SESSION_COOKIE}=${secret}`,
    csrf: csrfTokenFor(record.id, SESSION_SECRET),
  };
}

function gatewayHeaders(
  organizationId: string,
  dossierIds: string[],
  roles: ProbantRole[],
): Record<string, string> {
  const signed = signPersistentContext(
    { sub: "worker-1", organizationId, dossierIds, roles, exp: NOW + 300 },
    GATEWAY_SECRET,
  );
  return {
    "x-probant-auth-context": signed.context,
    "x-probant-auth-signature": signed.signature,
  };
}

function request(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`${APP_ORIGIN}${url}`, {
    method: init.method ?? "GET",
    headers: { origin: APP_ORIGIN, ...init.headers },
  });
}

beforeEach(() => {
  sessionStore = new InMemorySessionStore();
  process.env.PROBANT_CONTEXT_HMAC_SECRET = GATEWAY_SECRET;
});

describe("isolation inter-organisations — session OIDC", () => {
  const scenarios: { name: string; permission: Permission; method: string; path: string }[] = [
    {
      name: "lecture du dossier d'une autre organisation",
      permission: "dossier:read",
      method: "GET",
      path: `/api/dossiers/${DOSSIER_B}/snapshot`,
    },
    {
      name: "téléchargement du ledger d'une autre organisation",
      permission: "dossier:read",
      method: "GET",
      path: `/api/dossiers/${DOSSIER_B}/ledger`,
    },
    {
      name: "export du dossier d'une autre organisation",
      permission: "dossier:export",
      method: "POST",
      path: "/api/export",
    },
    {
      name: "job d'ingestion d'une autre organisation",
      permission: "dossier:read",
      method: "GET",
      path: `/api/dossiers/${DOSSIER_B}/ingestion-jobs/33333333-3333-4333-8333-333333333333`,
    },
  ];

  for (const scenario of scenarios) {
    it(`refuse ${scenario.name}`, async () => {
      const { cookie, csrf } = await sessionHeaders(ORG_A, ["admin"]);
      await expect(
        authorizer().authorize(
          request(scenario.path, {
            method: scenario.method,
            headers: { cookie, [CSRF_HEADER]: csrf },
          }),
          { permission: scenario.permission, dossierId: DOSSIER_B },
        ),
      ).rejects.toThrowError(expect.objectContaining({ code: "DOSSIER_NOT_FOUND", status: 403 }));
    });
  }

  it("autorise le même appel sur son propre dossier", async () => {
    const { cookie } = await sessionHeaders(ORG_A, ["reviewer"]);
    const principal = await authorizer().authorize(
      request(`/api/dossiers/${DOSSIER_A}/snapshot`, { headers: { cookie } }),
      { permission: "dossier:read", dossierId: DOSSIER_A },
    );
    expect(principal.organizationId).toBe(ORG_A);
  });

  it("ne distingue pas un dossier inexistant d'un dossier d'une autre organisation", async () => {
    const { cookie } = await sessionHeaders(ORG_A, ["admin"]);
    const inconnu = "99999999-9999-4999-8999-999999999999";
    const denials = await Promise.allSettled([
      authorizer().authorize(request(`/api/dossiers/${DOSSIER_B}/snapshot`, { headers: { cookie } }), {
        permission: "dossier:read",
        dossierId: DOSSIER_B,
      }),
      authorizer().authorize(request(`/api/dossiers/${inconnu}/snapshot`, { headers: { cookie } }), {
        permission: "dossier:read",
        dossierId: inconnu,
      }),
    ]);
    const codes = denials.map((result) =>
      result.status === "rejected" ? (result.reason as { code: string }).code : "ACCEPTÉ",
    );
    expect(codes).toEqual(["DOSSIER_NOT_FOUND", "DOSSIER_NOT_FOUND"]);
  });
});

describe("isolation inter-organisations — contexte signé de passerelle", () => {
  it("refuse un contexte signé qui revendique le dossier d'une autre organisation", async () => {
    // Le contexte est authentique (signature HMAC valide) mais ment sur son
    // périmètre : la vérification d'appartenance en base le rattrape.
    const headers = gatewayHeaders(ORG_A, [DOSSIER_B], ["admin"]);
    await expect(
      authorizer().authorize(request(`/api/dossiers/${DOSSIER_B}/snapshot`, { headers }), {
        permission: "dossier:read",
        dossierId: DOSSIER_B,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DOSSIER_NOT_FOUND" }));
  });

  it("refuse un dossier absent de la liste accordée", async () => {
    const headers = gatewayHeaders(ORG_A, [DOSSIER_A], ["admin"]);
    const autreDossierDeA = "44444444-4444-4444-8444-444444444444";
    await expect(
      authorizer().authorize(request(`/api/dossiers/${autreDossierDeA}/snapshot`, { headers }), {
        permission: "dossier:read",
        dossierId: autreDossierDeA,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "DOSSIER_FORBIDDEN" }));
  });

  it("refuse une signature falsifiée", async () => {
    const headers = gatewayHeaders(ORG_B, [DOSSIER_B], ["admin"]);
    await expect(
      authorizer().authorize(
        request(`/api/dossiers/${DOSSIER_B}/snapshot`, {
          headers: { ...headers, "x-probant-auth-signature": "AAAA" },
        }),
        { permission: "dossier:read", dossierId: DOSSIER_B },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "AUTH_CONTEXT_INVALID" }));
  });

  it("refuse un contexte expiré", async () => {
    const signed = signPersistentContext(
      {
        sub: "worker-1",
        organizationId: ORG_B,
        dossierIds: [DOSSIER_B],
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1_000) - 1,
      },
      GATEWAY_SECRET,
    );
    await expect(
      authorizer().authorize(
        request(`/api/dossiers/${DOSSIER_B}/snapshot`, {
          headers: {
            "x-probant-auth-context": signed.context,
            "x-probant-auth-signature": signed.signature,
          },
        }),
        { permission: "dossier:read", dossierId: DOSSIER_B },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "AUTH_CONTEXT_EXPIRED" }));
  });
});

describe("permissions par rôle", () => {
  it("un préparateur ne peut pas décider d'un constat", async () => {
    const { cookie, csrf } = await sessionHeaders(ORG_A, ["preparer"]);
    await expect(
      authorizer().authorize(
        request(`/api/dossiers/${DOSSIER_A}/review-events`, {
          method: "POST",
          headers: { cookie, [CSRF_HEADER]: csrf },
        }),
        { permission: "dossier:review", dossierId: DOSSIER_A },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });

  it("un réviseur ne peut pas déposer de fichier", async () => {
    const { cookie, csrf } = await sessionHeaders(ORG_A, ["reviewer"]);
    await expect(
      authorizer().authorize(
        request(`/api/dossiers/${DOSSIER_A}/uploads`, {
          method: "POST",
          headers: { cookie, [CSRF_HEADER]: csrf },
        }),
        { permission: "dossier:upload", dossierId: DOSSIER_A },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("un signataire ne peut ni déposer ni décider", async () => {
    const { cookie, csrf } = await sessionHeaders(ORG_A, ["signer"]);
    for (const permission of ["dossier:upload", "dossier:review"] as Permission[]) {
      await expect(
        authorizer().authorize(
          request(`/api/dossiers/${DOSSIER_A}/x`, {
            method: "POST",
            headers: { cookie, [CSRF_HEADER]: csrf },
          }),
          { permission, dossierId: DOSSIER_A },
        ),
      ).rejects.toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    }
  });

  it("l'administrateur cumule les permissions, mais reste borné à son organisation", async () => {
    const { cookie, csrf } = await sessionHeaders(ORG_A, ["admin"]);
    const principal = await authorizer().authorize(
      request(`/api/dossiers/${DOSSIER_A}/review-events`, {
        method: "POST",
        headers: { cookie, [CSRF_HEADER]: csrf },
      }),
      { permission: "dossier:review", dossierId: DOSSIER_A },
    );
    expect(principal.organizationId).toBe(ORG_A);
  });
});
