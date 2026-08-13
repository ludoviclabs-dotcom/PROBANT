/**
 * Plan de connaissance PROBANT — couche CONTENUS NORMATIFS.
 *
 * Coexiste avec la couche « gouvernance des sources » de lib/knowledge/
 * (registry.ts, schemas.ts, validation.ts — PR #31) : celle-ci régit QUI a
 * autorité et en quelle version ; la présente couche porte CE QUE disent les
 * référentiels (FEC, NEP, IFRS, PCG, crosswalks, statistiques).
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
