/**
 * Cartographie des risques — simulation d'historique pluriannuel.
 *
 * Module isomorphe (aucun import React ni `fs`). PROBANT ne porte qu'UN SEUL
 * dossier/exercice réel (`CURRENT_EXERCISE`, voir `lib/demo/dataset.ts`).
 * Les valeurs générées ici pour les exercices 2022 et 2023 sont ENTIÈREMENT
 * SIMULÉES par une fonction de hash déterministe (aucun `Math.random`, aucun
 * `Date.now()`) : rejouer les mêmes entrées produit toujours le même
 * résultat. Elles ne proviennent d'AUCUN dossier réel et n'ont AUCUNE valeur
 * probante. Elles servent uniquement à démontrer la fonctionnalité
 * comparative pluriannuelle de l'UI. Toute interface qui les affiche DOIT
 * porter un badge « simulé » visible et explicite. Ne jamais retirer ce
 * disclaimer ni faire passer ces chiffres pour des données d'audit réelles.
 */

/** Les trois exercices exposés par le sélecteur pluriannuel de l'UI. */
export type HistoricalExercise = 2022 | 2023 | 2024;

/** Seul exercice réel : le dossier de démo (`lib/demo/dataset.ts`) ne porte que celui-ci. */
export const CURRENT_EXERCISE: HistoricalExercise = 2024;

/** Amplitude maximale (en points) de la variation simulée autour du composite réel. */
const SIMULATION_AMPLITUDE = 15;

/**
 * Hash déterministe de type FNV-1a (32 bits) sur une chaîne. Pur : aucune
 * source d'aléa, aucune horloge. Mêmes entrées → même sortie, toujours.
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Ramène le résultat en entier non signé 32 bits.
  return hash >>> 0;
}

/**
 * Facteur de variation déterministe dans [-1, 1], dérivé du hash de
 * `cycleSlug` et `exercise`. Reproductible : même cycle + même exercice ⇒
 * même facteur, à chaque appel, sur chaque machine.
 */
function deterministicVariationFactor(cycleSlug: string, exercise: HistoricalExercise): number {
  const hash = fnv1aHash(`${cycleSlug}:${exercise}`);
  // Normalise le hash (0..2^32-1) vers [-1, 1].
  return (hash % 2001) / 1000 - 1;
}

/**
 * `true` si l'exercice demandé n'est pas l'exercice réel courant, donc que
 * toute valeur associée est simulée et doit être badgée comme telle dans l'UI.
 */
export function isSimulatedExercise(exercise: HistoricalExercise): boolean {
  return exercise !== CURRENT_EXERCISE;
}

/**
 * Retourne le composite « historique » d'un cycle pour un exercice donné.
 *
 * - Pour `CURRENT_EXERCISE` : retourne `currentComposite` tel quel (donnée réelle).
 * - Pour 2022/2023 : si `currentComposite` est `null` (cycle non évalué), reste
 *   `null` — on ne simule jamais une évaluation qui n'existe pas. Sinon,
 *   applique une variation déterministe bornée à ± `SIMULATION_AMPLITUDE`
 *   points autour du composite réel, clampée dans [0, 100].
 *
 * Rappel : la sortie pour 2022/2023 est SIMULÉE, jamais un vrai chiffre d'audit.
 */
export function simulateHistoricalComposite(
  cycleSlug: string,
  currentComposite: number | null,
  exercise: HistoricalExercise,
): number | null {
  if (exercise === CURRENT_EXERCISE) {
    return currentComposite;
  }

  if (currentComposite === null) {
    return null;
  }

  const factor = deterministicVariationFactor(cycleSlug, exercise);
  const simulated = currentComposite + factor * SIMULATION_AMPLITUDE;
  return Math.min(100, Math.max(0, Math.round(simulated)));
}
