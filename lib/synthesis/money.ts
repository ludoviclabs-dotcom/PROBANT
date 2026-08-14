/**
 * Arithmétique monétaire du moteur de Synthèse — CENTIMES ENTIERS.
 *
 * L'addition financière en flottant est interdite ici : 0.1 + 0.2 !== 0.3, et
 * une exposition d'audit qui dérive au centime près n'est pas reproductible.
 * Tous les montants du moteur circulent en centimes entiers (number JS, sûr
 * jusqu'à ±2^53 centimes ≈ 90 000 milliards d'euros — très au-delà de tout
 * état financier réel). Chaque fonction refuse les non-entiers plutôt que
 * d'arrondir en silence.
 *
 * Conversion depuis les euros : UNE seule frontière (`centsFromEuros`), avec
 * un arrondi documenté (demi-centime vers le haut, comme l'usage commercial
 * français). Passée cette frontière, plus aucun arrondi jusqu'à l'affichage.
 */

/** Vérifie qu'une valeur est un montant en centimes exploitable. */
export function assertCents(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `${label} : montant en centimes attendu (entier sûr), reçu ${value}`,
    );
  }
  return value;
}

/**
 * Convertit un montant en euros (potentiellement flottant, ex. issu du
 * modèle historique `Mesure`) en centimes entiers.
 *
 * Arrondi : au centime le plus proche, demi-centime vers le haut
 * (`Math.round` sur la valeur absolue, signe réappliqué). C'est LA seule
 * ligne du moteur où un arrondi de conversion se produit.
 */
export function centsFromEuros(euros: number): number {
  if (!Number.isFinite(euros)) {
    throw new Error(`centsFromEuros : nombre fini attendu, reçu ${euros}`);
  }
  const sign = euros < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(euros) * 100);
}

/** Somme de montants en centimes — refuse tout non-entier. */
export function sumCents(values: number[], label = "sumCents"): number {
  let total = 0;
  for (const v of values) total += assertCents(v, label);
  return assertCents(total, `${label} (total)`);
}

/**
 * Applique un taux en pourcentage à un montant en centimes.
 * Arrondi au centime le plus proche — documenté dans la trace de calcul de
 * chaque KPI qui l'utilise (champ `rounding`).
 */
export function applyRatePct(cents: number, ratePct: number): number {
  assertCents(cents, "applyRatePct");
  if (!Number.isFinite(ratePct)) {
    throw new Error(`applyRatePct : taux fini attendu, reçu ${ratePct}`);
  }
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(cents) * ratePct) / 100);
}

/** Formatage d'affichage fr-FR (frontière de sortie uniquement). */
export function formatCents(cents: number): string {
  assertCents(cents, "formatCents");
  const euros = cents / 100;
  return `${euros.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}
