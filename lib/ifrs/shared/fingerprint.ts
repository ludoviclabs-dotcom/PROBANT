import { stableSha256 } from "@/lib/synthesis/canonical";

/**
 * Dépendances d'une feuille IFRS et leurs empreintes (C00 § 6, D18). L'invalidation porte sur la lignée de la feuille (mécanisme existant) ;
 * ces empreintes disent quelle dépendance a changé et quels contrats gardent un contenu identique. Le calcul est pur : consulter ne périme rien.
 */
export interface DependencySource { documentType: string; importId: string; documentVersionId: string; byteHash: string; mappingVersion: string }
export interface LeaseDependencies {
  sources: DependencySource[];
  /** Politiques déclarées (exemptions, élections, TVA), sans auteur ni horodatage : un réenregistrement identique ne change rien. */
  policy: unknown;
  rule: { id: string; version: string; basisStatus: "review_required" | "validated" };
  /** Données propres à chaque contrat (lignes sources, réponses confirmées), par identifiant de contrat. */
  contracts: Record<string, unknown>;
}
export interface DependencyFingerprint {
  components: { sources: string; mapping: string; policy: string; rule: string };
  /** Empreinte par contrat : contrat + politique + règle (C00 § 4.6). */
  contracts: Record<string, string>;
  overall: string;
}
export type DependencyComponent = keyof DependencyFingerprint["components"];

export function dependencyFingerprint(d: LeaseDependencies): DependencyFingerprint {
  const sources = [...d.sources].sort((a, b) => (a.documentType + a.importId < b.documentType + b.importId ? -1 : 1));
  if (new Set(sources.map(s => s.documentType)).size !== sources.length) throw new Error("L16_CURRENT_SOURCES_REQUIRED");
  const components = {
    sources: stableSha256(sources.map(s => ({ documentType: s.documentType, importId: s.importId, documentVersionId: s.documentVersionId, byteHash: s.byteHash }))),
    mapping: stableSha256(sources.map(s => ({ documentType: s.documentType, mappingVersion: s.mappingVersion }))),
    policy: stableSha256(d.policy ?? null), rule: stableSha256(d.rule),
  };
  const contracts = Object.fromEntries(Object.keys(d.contracts).sort().map(id => [id, stableSha256({ contract: d.contracts[id], policy: components.policy, rule: components.rule })]));
  return { components, contracts, overall: stableSha256({ components, contracts }) };
}

/** Ce qui a changé entre deux versions : composantes, contrats modifiés, ajoutés, retirés, et contrats au contenu identique. */
export function compareFingerprints(before: DependencyFingerprint, after: DependencyFingerprint) {
  const components = (Object.keys(before.components) as DependencyComponent[]).filter(k => before.components[k] !== after.components[k]);
  const ids = [...new Set([...Object.keys(before.contracts), ...Object.keys(after.contracts)])].sort();
  return {
    unchanged: before.overall === after.overall, components,
    changedContracts: ids.filter(id => id in before.contracts && id in after.contracts && before.contracts[id] !== after.contracts[id]),
    addedContracts: ids.filter(id => !(id in before.contracts)), removedContracts: ids.filter(id => !(id in after.contracts)),
    identicalContracts: ids.filter(id => before.contracts[id] !== undefined && before.contracts[id] === after.contracts[id]),
  };
}
