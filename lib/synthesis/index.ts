/**
 * Moteur de Synthèse — point d'entrée public.
 *
 * Entièrement pur et isomorphe (client, serveur, tests) : aucun accès disque,
 * aucune horloge implicite, hash SHA-256 en TypeScript pur. La page Synthèse
 * consomme `buildSynthesisSnapshot` et `generateSynthesisNote` — elle ne
 * calcule plus rien elle-même.
 */

export * from "./types";
export { buildSynthesisSnapshot, verifySynthesisSnapshotHash, SYNTHESIS_ENGINE_VERSION, SYNTHESIS_SCHEMA_VERSION, SYNTHESIS_POLICY_VERSION, COVERAGE_SUBSTANTIAL_MIN, type SynthesisOptions } from "./engine";
export { generateSynthesisNote } from "./note";
export { stableEffectKey, collectEffects, deduplicateEffects, AGGREGATION_POLICY, type EffectRecord, type DeduplicationResult } from "./exposure";
export { canonicalJson, sha256Hex, stableHash } from "./canonical";
export { centsFromEuros, sumCents, applyRatePct, formatCents, assertCents } from "./money";
