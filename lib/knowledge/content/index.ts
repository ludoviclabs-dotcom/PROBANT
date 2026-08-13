/**
 * Plan de connaissance PROBANT — couche CONTENUS NORMATIFS.
 *
 * Coexiste avec la couche « gouvernance des sources » de lib/knowledge/
 * (registry.ts, schemas.ts, validation.ts — PR #31) : celle-ci régit QUI a
 * autorité et en quelle version ; la présente couche porte CE QUE disent les
 * référentiels (FEC, NEP, IFRS, PCG, crosswalks, statistiques).
 *
 * IMPORTANT : ce point d'entrée n'expose QUE des modules purs (schémas,
 * contrôles d'intégrité), importables côté client comme côté serveur. Le
 * chargeur (`./loader`) dépend de `node:fs/promises` : l'importer ici
 * l'entraînerait dans le graphe de modules de tout composant client qui ne
 * voudrait qu'un schéma, et ferait échouer la résolution du bundle. Même
 * séparation que `lib/audit-cycles` : le loader s'importe explicitement via
 * `@/lib/knowledge/content/loader`, depuis du code serveur ou des tests
 * uniquement.
 */

export * from "./schemas";
export * from "./validation";
