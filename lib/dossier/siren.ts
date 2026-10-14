/**
 * SIREN d'un dossier, pour affichage. Le dépôt FEC écrit `SIREN_NON_DETECTE`
 * quand le nom du fichier ne porte pas de SIREN : comme une valeur vide, ce
 * marqueur signifie « non renseigné » et n'est jamais remplacé par des zéros.
 * Le SIREN fictif du dossier démo (000000000) est une donnée du jeu de
 * démonstration : il est rendu tel quel.
 */
export const SIREN_NON_DETECTE = "non-detecte";

/** SIREN renseigné, ou `null` s'il est absent (vide ou marqueur « non détecté »). */
export function sirenRenseigne(siren: string | null | undefined): string | null {
  const valeur = siren?.trim() ?? "";
  return valeur === "" || valeur === SIREN_NON_DETECTE ? null : valeur;
}

/** « SIREN 123 456 789 » ; une valeur hors format est rendue telle quelle. */
export function libelleSiren(siren: string | null): string {
  if (siren === null) return "SIREN non renseigné";
  const groupes = /^\d{9}$/u.test(siren) ? siren.replace(/^(\d{3})(\d{3})(\d{3})$/u, "$1 $2 $3") : siren;
  return `SIREN ${groupes}`;
}
