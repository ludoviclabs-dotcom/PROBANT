import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationDenied } from "@/lib/auth/principal";

// Le test ne dépend ni de DATABASE_URL ni d'une session réelle : l'autorisation
// et la lecture du snapshot sont isolées pour vérifier l'ordre des contrôles.
const { authorizeRequest, repositoryGet } = vi.hoisted(() => ({
  authorizeRequest: vi.fn(), repositoryGet: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ authorizeRequest }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/dossier/postgres-repository", () => ({
  DrizzleDossierRepository: class { get = repositoryGet; },
}));

import { POST } from "@/app/api/export/route";

const DOSSIER = "5b03f078-0e4c-4558-959c-eb2bfde26f49";

function request(body: unknown): Request {
  return new Request("http://localhost/api/export", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("export serveur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeRequest.mockRejectedValue(new AuthorizationDenied("AUTHENTICATION_REQUIRED", "Authentification requise.", 401));
  });

  it("refuse un export anonyme même si le client fournit un snapshot et une organisation", async () => {
    const response = await POST(request({
      activeContext: { dossierId: DOSSIER, organizationId: "org-forged" },
      snapshot: { sourceKind: "persistent", dossier: { id: DOSSIER } },
    }));
    expect(response.status).toBe(401);
    expect(repositoryGet).not.toHaveBeenCalled();
  });

  it("recharge le snapshot dans l'organisation authentifiée, jamais celle du client", async () => {
    authorizeRequest.mockResolvedValue({ organizationId: "org-a" });
    repositoryGet.mockResolvedValue(null);
    const response = await POST(request({ activeContext: { dossierId: DOSSIER, organizationId: "org-forged" } }));
    expect(response.status).toBe(404);
    expect(repositoryGet).toHaveBeenCalledWith({ organizationId: "org-a", dossierId: DOSSIER });
  });

  it("ne divulgue pas le message d'une erreur interne", async () => {
    authorizeRequest.mockRejectedValue(new Error("DATABASE_POOL_SIZE_NOT_CONFIGURED"));
    const response = await POST(request({ activeContext: { dossierId: DOSSIER } }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("DATABASE_POOL_SIZE_NOT_CONFIGURED");
  });

  it("rejette un sélecteur traversant et borne le corps avant tout calcul", async () => {
    expect((await POST(request({ activeContext: { dossierId: "../../other" } }))).status).toBe(400);
    expect((await POST(request({ padding: "x".repeat(17_000) }))).status).toBe(413);
    expect(authorizeRequest).not.toHaveBeenCalled();
  });
});
