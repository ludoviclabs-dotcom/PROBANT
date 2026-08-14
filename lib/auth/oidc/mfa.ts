import type { OidcConfig } from "./config";
import { OidcFlowError, type OidcIdentity } from "./client";

/**
 * Politique MFA — **imposée par le fournisseur d'identité**.
 *
 * PROBANT ne développe aucun second facteur : il constate, dans le jeton
 * d'identité, que l'IdP a bien exigé une authentification forte. Deux signaux
 * normalisés sont acceptés (OpenID Connect Core § 2, RFC 8176) :
 *
 * - `acr` : contexte d'authentification atteint, comparé à `OIDC_REQUIRED_ACR` ;
 * - `amr` : méthodes réellement employées, comparées à `OIDC_REQUIRED_AMR`.
 *
 * Sémantique retenue : la session est conforme si **l'un des `acr` attendus**
 * est atteint **ou** si **l'une des méthodes `amr` attendues** a été employée.
 * Les deux listes sont donc des alternatives acceptables, pas un cumul —
 * un IdP publie rarement les deux.
 */
export type MfaOutcome =
  | { readonly satisfied: true; readonly reason: "acr_matched" | "amr_matched" }
  | { readonly satisfied: false; readonly reason: "acr_absent" | "amr_absent" | "no_signal" };

export function evaluateMfaPolicy(
  config: Pick<OidcConfig, "requiredAcr" | "requiredAmr">,
  identity: Pick<OidcIdentity, "acr" | "amr">,
): MfaOutcome {
  const acrExpected = config.requiredAcr.length > 0;
  const amrExpected = config.requiredAmr.length > 0;

  if (acrExpected && identity.acr && config.requiredAcr.includes(identity.acr)) {
    return { satisfied: true, reason: "acr_matched" };
  }
  if (amrExpected && identity.amr.some((method) => config.requiredAmr.includes(method))) {
    return { satisfied: true, reason: "amr_matched" };
  }
  if (!acrExpected && !amrExpected) {
    return { satisfied: false, reason: "no_signal" };
  }
  return { satisfied: false, reason: acrExpected ? "acr_absent" : "amr_absent" };
}

/**
 * Refuse la session si la politique n'est pas satisfaite.
 *
 * En `audit_only`, l'écart est renvoyé au lieu d'être levé : l'exploitant peut
 * mesurer le taux de conformité avant de basculer en `required`.
 */
export function assertMfaPolicy(
  config: Pick<OidcConfig, "requiredAcr" | "requiredAmr" | "mfaEnforcement">,
  identity: Pick<OidcIdentity, "acr" | "amr">,
): MfaOutcome {
  const outcome = evaluateMfaPolicy(config, identity);
  if (!outcome.satisfied && config.mfaEnforcement === "required") {
    throw new OidcFlowError(
      "MFA_REQUIRED",
      "L'authentification multifacteur exigée par la politique n'a pas été constatée.",
      403,
    );
  }
  return outcome;
}
