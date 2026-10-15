import { describe, expect, it, vi } from "vitest";
import { loanFixture } from "../loan-fixture";

/**
 * C13 — période qu'aucun texte lu ne couvre. Les packs d'exemple sont datés de 2026 (toujours couvert) : le résolveur
 * renvoie ici sa propre réponse pour une période non couverte (2010), sans réponse fabriquée.
 */
vi.mock("../loan-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../loan-rules")>();
  return { ...actual, resolveLoanRules: () => actual.resolveLoanRules({ startDate: "2010-01-01", closingDate: "2010-12-31" }) };
});

describe("C13 — texte applicable non déterminé", () => {
  it("comptes et poste de bilan non vérifiés : la feuille est non concluante, jamais « aucune différence relevée »", async () => {
    const actual = await vi.importActual<typeof import("../loan-rules")>("../loan-rules");
    expect(actual.resolveLoanRules({ startDate: "2010-01-01", closingDate: "2010-12-31" })).toMatchObject({ textId: null, label: "Texte non déterminé" });
    const { result } = await loanFixture({ scenario: "simple" }), simple = result.rows.find(r => r.id === "C13-SIMPLE")!;
    expect(result.rules.textId).toBeNull();
    expect(simple.presentation).toMatchObject({ rubric: null, expectedPrincipal: [], signals: [] });
    // The arithmetic stays calculated; only the unverified presentation keeps the result open.
    expect(simple.dues[0].calculatedInterest.amount).toEqual({ kind: "known", value: { amount: "250.00", currency: "EUR" } });
    expect(simple.issues.map(i => i.code)).toContain("rules_unresolved");
    expect(simple.status).toBe("inconclusive");
    expect(result.outcome).toBe("inconclusive");
  });
});
