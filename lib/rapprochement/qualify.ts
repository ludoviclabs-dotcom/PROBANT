import type { QualificationEcart } from "@/lib/canonical-model/finding";
import type {
  DocumentLigne,
  EcartRapprochement,
  RapprochementConfig,
} from "./types";

/** Clé de source : surcharge du cycle sinon défaut normatif. */
export function sourceFor(
  config: RapprochementConfig,
  qualif: QualificationEcart,
  fallback: string,
): string {
  return config.sources?.[qualif] ?? fallback;
}

/**
 * Raffinement de la qualification d'un écart structurel produit par le moteur.
 *
 * Règle de fiabilité : chaque qualification est rattachée à une clé de source
 * du registre `lib/referentiel/sources` (jamais une référence inventée). La
 * gravité reste provisoire : elle est ensuite pondérée par la matérialité
 * ISA 320 lors de la conversion en `Finding` (cf. to-findings.ts).
 */

function eur(n: number): string {
  return `${Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function refineEcart(
  base: EcartRapprochement,
  _rep: DocumentLigne | undefined,
  config: RapprochementConfig,
): EcartRapprochement {
  const seuilAnc = config.seuilAncienneteJours ?? 360;
  const ancien = base.ancienneteJours != null && base.ancienneteJours > seuilAnc;
  const provisionActive = config.detecterProvision === true;

  // Présent dans un seul document → écart de périmètre (exhaustivité).
  if (base.qualification === "perimetre") {
    const sens =
      base.presentSource ?? base.montantSource !== 0
        ? "présent dans l'état source mais absent du document de contrôle"
        : "présent dans le document de contrôle mais absent de l'état source";
    return {
      ...base,
      severite: "majeur",
      sourceKey: sourceFor(config, "perimetre", "ISA_500"),
      constat: `${base.libelle} : ${eur(base.montantSource || base.montantCible)} ${sens} — à rapprocher ou justifier (exhaustivité).`,
    };
  }

  // Poste ancien (cycle à créances, déjà traité) → écart d'antériorité.
  if (provisionActive && ancien) {
    return {
      ...base,
      qualification: "anteriorite",
      severite: "mineur",
      sourceKey: sourceFor(config, "anteriorite", "PCG_CREANCES"),
      constat: `${base.libelle} : poste échu depuis ${base.ancienneteJours} jours, écart de ${eur(base.ecart)} entre les deux documents. Le lettrage ne prouve aucune dépréciation ; aucune perte n’est estimée depuis l’âge seul.`,
    };
  }

  // Défaut : écart de rapprochement de solde.
  return {
    ...base,
    qualification: "rapprochement_solde",
    severite: "mineur",
    sourceKey: sourceFor(config, "rapprochement_solde", "ISA_500"),
    constat: `${base.libelle} : écart de ${eur(base.ecart)} entre ${eur(base.montantSource)} (source) et ${eur(base.montantCible)} (contrôle).`,
  };
}
