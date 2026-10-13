import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizationDenied, type AuthenticatedPrincipal } from "@/lib/auth/principal";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getRequestAuthorizer: () => ({ authorize: mocks.authorize }) }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({ transaction: mocks.transaction }) }));
import { GET } from "@/app/api/dossier-capabilities/route";
const dossier = "11111111-1111-4111-8111-111111111111";
const principal: AuthenticatedPrincipal = { subject: "simulated-reader", organizationId: "22222222-2222-4222-8222-222222222222", roles: ["preparer"], dossierIds: [dossier], authenticationMethod: "oidc-session", amr: [], acr: null, mfaSatisfied: false, expiresAtEpochSeconds: 2_000_000_000 };
const request = (q = `dossierId=${dossier}&periodId=period-fixture`) => new Request("http://local/api/dossier-capabilities?" + q);
beforeEach(() => { vi.resetAllMocks(); mocks.authorize.mockResolvedValue(principal); mocks.execute.mockResolvedValue([]); mocks.transaction.mockImplementation(body => body({ execute: mocks.execute })); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PROBANT_CLIENTS_DURABLE", ""); vi.stubEnv("VERCEL_ENV", ""); });
afterEach(() => vi.unstubAllEnvs());
describe("C01 HTTP read-only capability registry", () => {
  it("returns configuration without reading private sheets or claiming execution", async () => {
    const r = await GET(request("")); expect(r.status).toBe(200); expect((await r.json()).observationStatus).toBe("not_read"); expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled(); expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects duplicate, incomplete and invalid scope query parameters", async () => {
    for (const q of [`dossierId=${dossier}&periodId=x&dossierId=${dossier}`, `dossierId=${dossier}`, "dossierId=invalid&periodId=x", `dossierId=${dossier}&periodId=x&organizationId=attacker`]) expect((await GET(request(q))).status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("retains authentication and permission status codes", async () => {
    vi.stubEnv("DATABASE_URL", "configured"); vi.stubEnv("PROBANT_CLIENTS_DURABLE", "disposable");
    mocks.authorize.mockRejectedValueOnce(new AuthorizationDenied("AUTHENTICATION_REQUIRED", "Authentification requise.", 401)); expect((await GET(request())).status).toBe(401);
    mocks.authorize.mockRejectedValueOnce(new AuthorizationDenied("DOSSIER_FORBIDDEN", "Accès refusé.", 403)); expect((await GET(request())).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("does not read disabled families and derives organization only from authorized identity", async () => {
    vi.stubEnv("DATABASE_URL", "configured"); vi.stubEnv("PROBANT_CLIENTS_DURABLE", "disposable");
    const r = await GET(request()); expect(r.status).toBe(200); const data = await r.json(); expect(data.observedProcedures).toEqual(["clients.frame", "clients.sales"]); expect(data.observations).toEqual([]); expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), { dossierId: dossier, permission: "dossier:read" });
  });
  it("refuses an expired read without reading the database", async () => {
    vi.stubEnv("DATABASE_URL", "configured"); vi.stubEnv("PROBANT_CLIENTS_DURABLE", "disposable");
    mocks.authorize.mockResolvedValue({ ...principal, expiresAtEpochSeconds: 1 }); expect((await GET(request())).status).toBe(401); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("does not construct authorization or claim an empty dossier when no store reader is activated", async () => {
    const r = await GET(request()); expect(r.status).toBe(200);
    const data = await r.json(); expect(data.observationStatus).toBe("not_read"); expect(data.observedProcedures).toEqual([]);
    expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
});
