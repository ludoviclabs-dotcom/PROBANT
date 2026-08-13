/**
 * Plan de connaissance PROBANT — point d'entrée public.
 *
 * `loader` utilise `node:fs` : ne l'importer que depuis du code serveur ou des
 * tests. Les schémas et les contrôles sont purs et importables partout.
 */

export * from "./schemas";
export * from "./validation";
export {
  loadFecFields,
  loadFecControls,
  loadNep,
  loadIfrs,
  loadPcg,
  loadCrosswalks,
  loadStatistics,
  loadKnowledgeBase,
  type KnowledgeBase,
} from "./loader";
