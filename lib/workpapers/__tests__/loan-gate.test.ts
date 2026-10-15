import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { loanHandlers, requireLoansChain } from "../loan-http";
import { LoanRuntime } from "../loan-runtime";
import { LOAN_PERIOD } from "../loan-period";
import { periodId } from "../model";

const dossier = "11111111-1111-4111-8111-111111111111", url = "https://local.test/api/workpapers/emprunts?dossierId=" + dossier + "&periodId=" + periodId(LOAN_PERIOD);

describe("C13 — passerelle Emprunts", () => {
  it("chaîne fermée par défaut et en production ; ouverte par la recette jetable ; « personal » exige un profil valide", () => {
    for (const env of [{}, { PROBANT_LOANS_DURABLE: "true" }, { PROBANT_LOANS_DURABLE: "disposable", VERCEL_ENV: "production" }, { PROBANT_RUNTIME_PROFILE: "personal", PROBANT_LOANS_DURABLE: "personal" }])
      expect(() => requireLoansChain(env)).toThrow();
    expect(() => requireLoansChain({ PROBANT_LOANS_DURABLE: "disposable" })).not.toThrow();
  });
  it("erreur SQL sans données privées dans la réponse", async () => {
    const response = await loanHandlers(() => { throw new DrizzleQueryError("SECRET SQL", ["PRIVATE"], Error("driver")); }, () => {}).GET(new Request(url));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("{\"error\":\"LOAN_DURABLE_UNAVAILABLE\"}");
  });
  it("session expirée refusée avant toute transaction", async () => {
    let calls = 0;
    const runtime = new LoanRuntime({ execute: async () => [], transaction: async () => { calls++; throw new Error("UNEXPECTED"); } } as never,
      { authorize: async () => ({ subject: "expired", organizationId: "org", dossierIds: [dossier], roles: ["preparer"], authenticationMethod: "oidc-session", amr: [], acr: null, mfaSatisfied: true, expiresAtEpochSeconds: 99 }) } as never, () => 100);
    const h = loanHandlers(() => runtime, () => {});
    expect((await h.GET(new Request(url))).status).toBe(401);
    expect((await h.GET(new Request(url + "&operation=download&id=doc"))).status).toBe(401);
    expect(calls).toBe(0);
  });
  it("un rôle, un auteur ou une approbation envoyés par le navigateur sont refusés", async () => {
    let called = false;
    const h = loanHandlers(() => ({ check: async () => {}, loanCommand: async () => { called = true; } }) as unknown as LoanRuntime, () => {});
    const response = await h.POST(new Request(url, { method: "POST", body: JSON.stringify({ command: "execute", id: "run", expectedVersion: 1, role: "reviewer", approved: true }), headers: { "Content-Type": "application/json" } }));
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
  it("requête ambiguë et corps surdimensionné refusés", async () => {
    const h = loanHandlers(() => ({ check: async () => {} }) as unknown as LoanRuntime, () => {});
    expect((await h.GET(new Request(url + "&dossierId=" + dossier))).status).toBe(422);
    expect((await h.POST(new Request(url, { method: "POST", body: "x".repeat(500_001) }))).status).toBe(413);
  });
  it("un import de type inconnu ou de période étrangère est refusé", async () => {
    const h = loanHandlers(() => ({ check: async () => {} }) as unknown as LoanRuntime, () => {});
    const form = new FormData(); form.set("file", new File(["Key;Amount;Date;Details"], "x.csv")); form.set("documentType", "loan_inconnu"); form.set("mapping", "{}"); form.set("period", JSON.stringify(LOAN_PERIOD));
    expect((await h.importsPOST(new Request(url, { method: "POST", body: form }))).status).toBe(400);
    const other = new FormData(); other.set("file", new File(["Key;Amount;Date;Details"], "x.csv")); other.set("documentType", "loan_ledger"); other.set("mapping", "{}"); other.set("period", JSON.stringify({ ...LOAN_PERIOD, startDate: "2025-01-01", closingDate: "2025-12-31" }));
    expect((await h.importsPOST(new Request(url, { method: "POST", body: other }))).status).toBe(422);
  });
});
