import { describe, expect, it } from "vitest";
import { assertMfaPolicy, evaluateMfaPolicy } from "../oidc/mfa";

/**
 * Politique MFA.
 *
 * PROBANT ne construit aucun second facteur : ces tests vérifient qu'il
 * **constate** correctement celui imposé par l'IdP, et qu'il refuse la session
 * quand le constat manque.
 */
describe("politique MFA imposée par l'IdP", () => {
  it("accepte un acr attendu", () => {
    const outcome = evaluateMfaPolicy(
      { requiredAcr: ["urn:mace:incommon:iap:silver"], requiredAmr: [] },
      { acr: "urn:mace:incommon:iap:silver", amr: [] },
    );
    expect(outcome).toEqual({ satisfied: true, reason: "acr_matched" });
  });

  it("accepte une méthode amr attendue parmi plusieurs employées", () => {
    const outcome = evaluateMfaPolicy(
      { requiredAcr: [], requiredAmr: ["otp", "hwk"] },
      { acr: null, amr: ["pwd", "otp"] },
    );
    expect(outcome).toEqual({ satisfied: true, reason: "amr_matched" });
  });

  it("refuse un acr différent de celui attendu", () => {
    const outcome = evaluateMfaPolicy(
      { requiredAcr: ["urn:mfa"], requiredAmr: [] },
      { acr: "urn:pwd", amr: [] },
    );
    expect(outcome).toEqual({ satisfied: false, reason: "acr_absent" });
  });

  it("refuse un mot de passe seul quand une méthode forte est exigée", () => {
    const outcome = evaluateMfaPolicy(
      { requiredAcr: [], requiredAmr: ["mfa"] },
      { acr: null, amr: ["pwd"] },
    );
    expect(outcome).toEqual({ satisfied: false, reason: "amr_absent" });
  });

  it("refuse une absence totale de signal quand aucune politique n'est déclarée", () => {
    const outcome = evaluateMfaPolicy(
      { requiredAcr: [], requiredAmr: [] },
      { acr: "urn:quelconque", amr: ["mfa"] },
    );
    // Sans politique, aucune conformité ne peut être *constatée* : le résultat
    // est « pas de signal », jamais un succès par défaut.
    expect(outcome).toEqual({ satisfied: false, reason: "no_signal" });
  });

  it("bloque la session en mode required", () => {
    expect(() =>
      assertMfaPolicy(
        { requiredAcr: [], requiredAmr: ["mfa"], mfaEnforcement: "required" },
        { acr: null, amr: ["pwd"] },
      ),
    ).toThrowError(expect.objectContaining({ code: "MFA_REQUIRED", status: 403 }));
  });

  it("laisse passer en mode audit_only tout en signalant l'écart", () => {
    const outcome = assertMfaPolicy(
      { requiredAcr: [], requiredAmr: ["mfa"], mfaEnforcement: "audit_only" },
      { acr: null, amr: ["pwd"] },
    );
    expect(outcome.satisfied).toBe(false);
  });
});
