/**
 * Formats d'affichage de la charte (fr-FR) : espace fine insécable entre les groupes de milliers,
 * signe moins typographique « − » (U+2212), espace insécable avant « € ».
 *
 * Frontière de sortie uniquement : aucun calcul ici. Les montants arrivent en centimes entiers du moteur
 * de Synthèse et ne sont jamais arrondis à l'affichage — les décimales n'apparaissent que si les
 * centimes ne sont pas nuls.
 */

export const MINUS = "−";
const NBSP = " ";

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function signOf(value: number, withPlus: boolean): string {
  if (value < 0) return MINUS;
  return withPlus && value > 0 ? "+" : "";
}

/** Entier avec séparateurs de milliers (« 2 840 »). */
export function formatInt(value: number): string {
  return integer.format(value);
}

/**
 * Montant en centimes entiers → « −145 000 € » (sans décimale quand les centimes sont nuls,
 * « 12 345,67 € » sinon). `sign` force le « + » des valeurs positives (effets signés).
 */
export function formatEuroCents(cents: number, options: { sign?: boolean } = {}): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`formatEuroCents : montant en centimes entier attendu, reçu ${cents}`);
  const abs = Math.abs(cents);
  const body = abs % 100 === 0 ? integer.format(abs / 100) : decimals.format(abs / 100);
  return `${signOf(cents, Boolean(options.sign))}${body}${NBSP}€`;
}
