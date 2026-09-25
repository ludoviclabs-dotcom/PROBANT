import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/export/route";

const DOSSIER = "5b03f078-0e4c-4558-959c-eb2bfde26f49";

function request(body: unknown): Request {
  return new Request("http://localhost/api/export", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("export serveur", () => {
  it("refuse un export anonyme même si le client fournit un snapshot et une organisation", async () => {
    const response = await POST(request({
      activeContext: { dossierId: DOSSIER, organizationId: "org-forged" },
      snapshot: { sourceKind: "persistent", dossier: { id: DOSSIER } },
    }));
    expect(response.status).toBe(401);
  });

  it("rejette un sélecteur traversant et borne le corps avant tout calcul", async () => {
    expect((await POST(request({ activeContext: { dossierId: "../../other" } }))).status).toBe(400);
    expect((await POST(request({ padding: "x".repeat(17_000) }))).status).toBe(413);
  });
});
