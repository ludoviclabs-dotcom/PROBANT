/**
 * Versions du moteur de Synthèse, isolées pour que le châssis du tableau de bord et la landing les affichent
 * sans embarquer tout le moteur. `engine.ts` les ré-exporte : une seule définition, aucun changement de valeur.
 */

/**
 * 2.0.0 (C05, second passage) : `exposure.byCloison` retiré ; `EffectStage` (pont), membres (poste, cloison) et groupes (étape de revue) enrichis.
 * 2.1.0 (C05 / C10) : `exposure.taxIncidence` porte le fournisseur, sa version, les effets chiffrés par scénario d'IS et l'empreinte du scénario.
 */
export const SYNTHESIS_SCHEMA_VERSION = "2.1.0";
export const SYNTHESIS_ENGINE_VERSION = "1.3.0";
export const SYNTHESIS_POLICY_VERSION = "2.1.0";
