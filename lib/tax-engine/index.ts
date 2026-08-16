/**
 * Moteurs fiscaux secondaires.
 *
 * Chaque impôt est un sous-module autonome : il déclare sa propre capacité
 * (calculer, estimer, rapprocher ou seulement recommander une revue) et ne
 * revendique jamais plus que ce que le registre versionné permet.
 */
export * as cfe from "./cfe";
