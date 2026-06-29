import type {
  FauxPositifRisk,
  Finding,
  SeuilApplique,
} from "@/lib/canonical-model/finding";

/**
 * Calcul des seuils de matérialité (ISA 320) et qualification du risque de
 * faux positif. Tout est volontairement transparent et « indicatif » : le
 * réviseur garde la décision finale. Le but est d'éviter qu'un écart trivial
 * sous le seuil de signification déclenche une alerte de fraude injustifiée.
 */

/** Bases de calcul disponibles (montants positifs). */
export interface MaterialityBasis {
  totalBilan?: number;
  chiffreAffaires?: number;
  resultatNet?: number;
  totalCharges?: number;
  totalProduits?: number;
}

export interface MaterialityThresholds {
  base: SeuilApplique["base"];
  baseMontant: number;
  taux: number;
  /** Seuil de signification (matérialité globale). */
  significativite: number;
  /** Seuil de performance (≈ 75 % de la signification). */
  performance: number;
  /** Seuil de trivialité (clairement insignifiant, ≈ 5 %). */
  trivialite: number;
  source: string;
}

/** Taux benchmark usuels par base retenue. */
const TAUX_PAR_BASE: Record<SeuilApplique["base"], number> = {
  chiffre_affaires: 0.005, // 0,5 % du CA
  total_produits: 0.005,
  total_bilan: 0.01, // 1 % du total bilan
  total_charges: 0.01,
  resultat_net: 0.05, // 5 % du résultat net
};

/** Ordre de préférence des bases (la plus pertinente d'abord). */
const PRIORITE_BASE: SeuilApplique["base"][] = [
  "chiffre_affaires",
  "total_bilan",
  "total_produits",
  "total_charges",
  "resultat_net",
];

const BASE_FROM_KEY: Record<keyof MaterialityBasis, SeuilApplique["base"]> = {
  totalBilan: "total_bilan",
  chiffreAffaires: "chiffre_affaires",
  resultatNet: "resultat_net",
  totalCharges: "total_charges",
  totalProduits: "total_produits",
};

/**
 * Calcule les seuils selon une approche ISA 320 simplifiée : on retient la
 * première base disponible par ordre de préférence, avec un taux benchmark.
 * Retourne null si aucune base exploitable n'est fournie.
 */
export function computeMateriality(
  basis: MaterialityBasis,
): MaterialityThresholds | null {
  const available = new Map<SeuilApplique["base"], number>();
  (Object.keys(basis) as (keyof MaterialityBasis)[]).forEach((k) => {
    const v = basis[k];
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 0) {
      available.set(BASE_FROM_KEY[k], Math.abs(v));
    }
  });
  if (available.size === 0) return null;

  const base = PRIORITE_BASE.find((b) => available.has(b)) ?? PRIORITE_BASE[0];
  const baseMontant = available.get(base)!;
  const taux = TAUX_PAR_BASE[base];
  const significativite = Math.round(baseMontant * taux);

  return {
    base,
    baseMontant,
    taux,
    significativite,
    performance: Math.round(significativite * 0.75),
    trivialite: Math.round(significativite * 0.05),
    source: "ISA 320",
  };
}

/** Évalue un écart chiffré (EUR) contre les seuils de matérialité. */
export function evaluateSeuil(
  ecartEur: number,
  th: MaterialityThresholds,
): SeuilApplique {
  return {
    type: "significativite",
    base: th.base,
    tauxApplique: th.taux,
    montantCalcule: th.significativite,
    source: th.source,
    depasse: Math.abs(ecartEur) >= th.significativite,
  };
}

/**
 * Dérive le risque de faux positif. Une valeur déjà renseignée (par la règle
 * ou le scénario) est prioritaire. Sinon on combine la nature de la règle et
 * le franchissement éventuel du seuil de signification.
 *
 *  - hardLaw    : règle opposable → faux positif improbable.
 *  - methodology: présomption → dépend du dépassement du seuil.
 *  - internal   : heuristique → toujours à confirmer.
 *
 * `depasse` vaut null quand la mesure n'est pas chiffrée en EUR (seuil non
 * applicable).
 */
export function deriveFauxPositif(
  f: Finding,
  depasse: boolean | null,
): FauxPositifRisk {
  if (f.fauxPositifRisk) return f.fauxPositifRisk;
  if (f.family === "hardLaw") return depasse === false ? "moyen" : "faible";
  if (f.family === "methodology") return depasse === false ? "eleve" : "moyen";
  return depasse ? "moyen" : "eleve";
}

/**
 * Enrichit un constat avec le seuil appliqué et le risque de faux positif.
 * Pure : retourne une copie sans muter l'entrée.
 */
export function enrichFinding(
  f: Finding,
  th: MaterialityThresholds | null,
): Finding {
  let seuilApplique = f.seuilApplique;
  let depasse: boolean | null = seuilApplique ? seuilApplique.depasse : null;

  if (!seuilApplique && th && f.mesure.unite === "EUR") {
    const ecart = f.mesure.constate - f.mesure.seuil;
    seuilApplique = evaluateSeuil(ecart, th);
    depasse = seuilApplique.depasse;
  }

  return {
    ...f,
    seuilApplique,
    fauxPositifRisk: deriveFauxPositif(f, depasse),
  };
}
