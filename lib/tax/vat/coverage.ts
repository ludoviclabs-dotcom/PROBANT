/**
 * Couverture normative d'une période TVA.
 *
 * La recodification de la TVA dans le code des impositions sur les biens et
 * services au 1er septembre 2026 fait expirer des versions de sources sans
 * successeur publié dans le registre. Ce module déclare quelles sources chaque
 * famille de contrôle exige, et délègue le calcul d'intervalles à la primitive
 * partagée `assessSourceCoverage`.
 *
 * Il ne choisit jamais « la version la plus proche ».
 */
import { assessSourceCoverage } from "../source-coverage";
import type { VatNormativeCoverage } from "./types";

/** Sources requises par famille de contrôle TVA. */
export const VAT_SOURCE_REQUIREMENTS = {
  /** Fait générateur et exigibilité : décalage de période. */
  taxPoint: ["cgi-art-269"],
  /** Droit à déduction. */
  deduction: ["cgi-art-271"],
  /** Obligation de facturation : pièces justificatives. */
  invoicing: ["cgi-art-289"],
  /** Déclaration et périodicité. */
  filing: ["cgi-art-287"],
} as const;

export type VatSourceRequirement = keyof typeof VAT_SOURCE_REQUIREMENTS;

/**
 * Évalue la couverture normative de la période pour un jeu d'exigences.
 *
 * Renvoie `not_covered` quand la période commence déjà hors couverture, et
 * `partially_covered` quand elle bascule en cours de route — le cas exact de la
 * frontière du 1er septembre 2026.
 */
export function assessNormativeCoverage(options: {
  readonly startDate: string;
  readonly endDate: string;
  readonly requirements: readonly VatSourceRequirement[];
}): VatNormativeCoverage {
  return assessSourceCoverage({
    startDate: options.startDate,
    endDate: options.endDate,
    sourceIds: options.requirements.flatMap((key) => VAT_SOURCE_REQUIREMENTS[key]),
  });
}
