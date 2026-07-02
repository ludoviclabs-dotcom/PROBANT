import type { QualificationEcart, Severity } from "@/lib/canonical-model/finding";
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
  return `${Math.round(Math.abs(n)).toLocaleString("fr-FR")} €`;
}

/** Bump de gravité si l'écart est franchement supérieur à la tolérance. */
function graviteParMagnitude(ecartAbs: number, tol: number, base: Severity): Severity {
  const ratio = ecartAbs / Math.max(tol, 1);
  if (ratio >= 50) return "majeur";
  if (ratio >= 15) return base === "mineur" ? "majeur" : base;
  return base;
}

export function refineEcart(
  base: EcartRapprochement,
  rep: DocumentLigne | undefined,
  config: RapprochementConfig,
  tol: number,
): EcartRapprochement {
  const ecartAbs = Math.abs(base.ecart);
  const seuilAnc = config.seuilAncienneteJours ?? 360;
  const ancien = base.ancienneteJours != null && base.ancienneteJours > seuilAnc;
  const nonDeprecie = rep?.lettre !== true; // lettre=true ⇒ déjà déprécié/lettré
  const provisionActive = config.detecterProvision === true;

  // 1) Créance ancienne non dépréciée → dépréciation insuffisante (PCG 214-17).
  // Réservé aux cycles à créances (config.detecterProvision). L'enjeu n'est pas
  // l'écart A/B mais la créance à risque : « constaté = créance / attendu = 0 ».
  if (provisionActive && ancien && nonDeprecie && base.qualification !== "perimetre") {
    const creance = base.montantSource || base.montantCible;
    return {
      ...base,
      qualification: "provision_insuffisante",
      severite: "majeur",
      sourceKey: sourceFor(config, "provision_insuffisante", "PCG_CREANCES"),
      montantSource: creance,
      montantCible: 0,
      ecart: creance,
      constat: `${base.libelle} : créance de ${eur(creance)} échue depuis ${base.ancienneteJours} jours sans dépréciation constatée. Une dépréciation doit refléter le risque de non-recouvrement apprécié à la clôture.`,
    };
  }

  // 2) Présent dans un seul document → écart de périmètre (exhaustivité).
  if (base.qualification === "perimetre") {
    const sens =
      base.montantSource !== 0
        ? "présent dans l'état source mais absent du document de contrôle"
        : "présent dans le document de contrôle mais absent de l'état source";
    return {
      ...base,
      severite: graviteParMagnitude(ecartAbs, tol, "majeur"),
      sourceKey: sourceFor(config, "perimetre", "ISA_500"),
      constat: `${base.libelle} : ${eur(base.montantSource || base.montantCible)} ${sens} — à rapprocher ou justifier (exhaustivité).`,
    };
  }

  // 3) Poste ancien (cycle à créances, déjà traité) → écart d'antériorité.
  if (provisionActive && ancien) {
    return {
      ...base,
      qualification: "anteriorite",
      severite: graviteParMagnitude(ecartAbs, tol, "mineur"),
      sourceKey: sourceFor(config, "anteriorite", "PCG_CREANCES"),
      constat: `${base.libelle} : poste échu depuis ${base.ancienneteJours} jours, écart de ${eur(base.ecart)} entre les deux documents.`,
    };
  }

  // 4) Écart de solde rapprochable mais non lettré → lettrage.
  if (rep?.piece && nonDeprecie && ecartAbs <= tol * 8) {
    return {
      ...base,
      qualification: "lettrage",
      severite: "mineur",
      sourceKey: sourceFor(config, "lettrage", "ISA_500"),
      constat: `${base.libelle} : montant de ${eur(base.ecart)} non rapproché (pièce ${rep.piece}). À lettrer ou justifier.`,
    };
  }

  // 5) Défaut : écart de rapprochement de solde.
  return {
    ...base,
    qualification: "rapprochement_solde",
    severite: graviteParMagnitude(ecartAbs, tol, "mineur"),
    sourceKey: sourceFor(config, "rapprochement_solde", "ISA_500"),
    constat: `${base.libelle} : écart de ${eur(base.ecart)} entre ${eur(base.montantSource)} (source) et ${eur(base.montantCible)} (contrôle).`,
  };
}
