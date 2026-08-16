/**
 * Applicabilité de la CFE au dossier.
 *
 * La seule source CFE publiée par le registre — `bofip-cfe`, doctrine sur les
 * activités imposables — fonde une question d'applicabilité, jamais un calcul.
 * Elle n'est effective qu'à compter du 29 avril 2026 : une période antérieure
 * n'est pas traitée avec « la version la plus proche ».
 *
 * Une exonération n'est jamais présumée : un dossier qui ne dit rien reste
 * `unknown`, ce qui interdit toute conclusion positive.
 */
import type { TaxProfile } from "@/lib/canonical-model";
import { assessSourceCoverage } from "@/lib/tax/source-coverage";
import type { CfeApplicability, CfeExemptionStatus } from "./types";

/** Doctrine publiée sur les activités imposables à la CFE. */
export const CFE_SOURCE_IDS = ["bofip-cfe"] as const;

/** Clé de paramètre portant une exonération confirmée dans le profil fiscal. */
export const CFE_EXEMPTION_PARAMETER_KEY = "cfe_exemption";

function readExemption(profile: TaxProfile): CfeExemptionStatus {
  const parameter = profile.parameters.find((item) => item.key === CFE_EXEMPTION_PARAMETER_KEY);
  if (!parameter || parameter.value === null) return "unknown";
  // Une exonération n'est retenue que si elle a été vérifiée : un paramètre
  // saisi sans vérification ne suffit pas à écarter l'impôt.
  if (parameter.verificationStatus !== "verified") return "unknown";
  if (parameter.value === true || parameter.value === "true") return "claimed";
  if (parameter.value === false || parameter.value === "false") return "none";
  return "unknown";
}

export function assessCfeApplicability(options: {
  readonly profile: TaxProfile;
  readonly periodStartDate: string;
  readonly periodEndDate: string;
}): CfeApplicability {
  const { profile } = options;

  const french = profile.establishments.filter((item) => item.countryCode === "FR");
  const frenchEstablishmentIds = french.map((item) => item.establishmentId).sort();
  const unverifiedEstablishmentIds = french
    .filter((item) => item.verificationStatus !== "verified")
    .map((item) => item.establishmentId)
    .sort();

  const sourceCoverage = assessSourceCoverage({
    startDate: options.periodStartDate,
    endDate: options.periodEndDate,
    sourceIds: [...CFE_SOURCE_IDS],
  });

  const exemptionStatus = readExemption(profile);
  const reasons: string[] = [];

  if (frenchEstablishmentIds.length === 0) {
    reasons.push("Aucun etablissement francais n'est declare au profil fiscal.");
  }
  if (unverifiedEstablishmentIds.length > 0) {
    reasons.push(`Etablissements non verifies : ${unverifiedEstablishmentIds.join(", ")}.`);
  }
  if (exemptionStatus === "unknown") {
    reasons.push("Le statut d'exoneration CFE n'est pas renseigne et verifie au profil.");
  }
  if (sourceCoverage.status !== "covered") {
    reasons.push(`La doctrine CFE publiee ne couvre pas la periode a partir du ${sourceCoverage.uncoveredFromDate}.`);
  }

  const status: CfeApplicability["status"] = exemptionStatus === "claimed"
    ? "not_applicable"
    : frenchEstablishmentIds.length === 0 || exemptionStatus === "unknown"
      ? "unknown"
      : "applicable";

  return Object.freeze({
    status,
    exemptionStatus,
    frenchEstablishmentIds,
    unverifiedEstablishmentIds,
    sourceCoverage,
    reasons: reasons.sort(),
  });
}
