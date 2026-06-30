/**
 * Module « Rapprochement & Retraitements » — confrontation multi-documents.
 *
 * Point d'entrée public. Le moteur (`rapprocher`) est cycle-agnostique ;
 * l'extension à un nouveau cycle d'audit passe par une `RapprochementConfig`
 * et des documents normalisés, jamais par une modification du moteur.
 */

export * from "./types";
export { rapprocher, joursEntre, type EngineOptions } from "./engine";
export { resultToFindings } from "./to-findings";
export { refineEcart } from "./qualify";
export { buildRapprochementSilo } from "./build";
export {
  lignesDepuisTableur,
  documentDepuisTableur,
  type MappageColonnes,
} from "./adapters/tabular";
