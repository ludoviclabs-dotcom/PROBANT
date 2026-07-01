/**
 * Cartographie des risques — construction du graphe inter-cycles.
 *
 * Module pur, isomorphe (aucun import React ni `fs`, aucun `Date.now()` :
 * l'horodatage est reçu en argument). Il ne doit JAMAIS importer
 * `lib/audit-cycles/loader.ts`.
 *
 * Règle de fiabilité (non négociable) : les arcs ne sont JAMAIS inventés.
 * - Arcs `relatedCycles` : dérivés uniquement des `cycle.relatedCycles` déclarés
 *   dans les fiches YAML. `weight = 1` (relation binaire, aucun coefficient de
 *   contagion chiffré). `bidirectional = true` si la relation est réciproque
 *   (déclarée des deux côtés). Id canonique `${min}->${max}` pour dédupliquer.
 * - Arcs `comptes` : dérivés uniquement de préfixes `pcgAccounts` réellement
 *   partagés entre deux cycles. `weight = nombre de préfixes communs` (fait
 *   mesuré, non un coefficient de propagation).
 */

import type { AuditCycle } from "@/lib/audit-cycles/types";
import type {
  AxisScore,
  CycleRiskScore,
  RiskAxisId,
  RiskEdge,
  RiskGraph,
  RiskNode,
} from "./types";

/**
 * Id canonique d'un arc entre deux cycles, indépendant du sens : le couple
 * {a, b} produit toujours le même id, ce qui permet la déduplication.
 */
function edgeId(a: string, b: string): string {
  const [min, max] = a < b ? [a, b] : [b, a];
  return `${min}->${max}`;
}

/**
 * Nombre de préfixes PCG communs entre deux cycles. Un préfixe n'est compté
 * qu'une fois même s'il figure en double dans une liste.
 */
function sharedPrefixCount(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const prefix of new Set(a)) {
    if (setB.has(prefix)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Construit le graphe de risques : un nœud par cycle (scores injectés, position
 * non renseignée — c'est le rôle de `layout.ts`), et les arcs factuels.
 *
 * `generatedAt` est reçu en argument (jamais `Date.now()` ici) pour garder la
 * fonction pure et déterministe.
 */
export function buildRiskGraph(
  cycles: readonly AuditCycle[],
  scores: ReadonlyMap<string, CycleRiskScore> | Record<string, CycleRiskScore>,
  generatedAt: string,
): RiskGraph {
  const scoreMap: ReadonlyMap<string, CycleRiskScore> =
    scores instanceof Map ? scores : new Map(Object.entries(scores));
  const scoreOf = (slug: string): CycleRiskScore | undefined => scoreMap.get(slug);

  const knownSlugs = new Set(cycles.map((c) => c.slug));

  const nodes: RiskNode[] = cycles.map((cycle) => ({
    id: cycle.slug,
    cycleSlug: cycle.slug,
    label: cycle.title,
    family: cycle.family,
    cloisons: [...cycle.probantCloisons],
    scores: resolveScore(cycle, scoreOf),
  }));

  const relatedEdges = buildRelatedEdges(cycles, knownSlugs);
  const comptesEdges = buildComptesEdges(cycles, relatedEdges);

  return {
    nodes,
    edges: [...relatedEdges.values(), ...comptesEdges],
    generatedAt,
  };
}

/**
 * Récupère le score d'un cycle. Si aucun score n'est fourni, on ne fabrique pas
 * de valeur : on remonte un score « non évalué » neutre (composite null).
 */
function resolveScore(
  cycle: AuditCycle,
  scoreOf: (slug: string) => CycleRiskScore | undefined,
): CycleRiskScore {
  const found = scoreOf(cycle.slug);
  if (found) {
    return found;
  }
  return {
    cycleSlug: cycle.slug,
    family: cycle.family,
    axes: {
      gravite: neutralAxis("gravite"),
      probabilite: neutralAxis("probabilite"),
      detectabilite: neutralAxis("detectabilite"),
      exposition: neutralAxis("exposition"),
    },
    composite: null,
    criticityBand: "non_évalué",
    evaluation: "non_évalué",
    findingCount: 0,
    isHeuristic: true,
  };
}

function neutralAxis(axis: RiskAxisId): AxisScore {
  return {
    axis,
    auto: 0,
    adjustment: 0,
    value: 0,
    provenance: "non_évalué",
    drivers: [],
  };
}

/**
 * Arcs `relatedCycles` : un arc par couple de cycles reliés, dédupliqué par id
 * canonique. `bidirectional` passe à `true` dès que la relation est réciproque.
 * Les slugs pointant vers un cycle inconnu (hors du jeu fourni) sont ignorés.
 */
function buildRelatedEdges(
  cycles: readonly AuditCycle[],
  knownSlugs: ReadonlySet<string>,
): Map<string, RiskEdge> {
  const edges = new Map<string, RiskEdge>();

  for (const cycle of cycles) {
    for (const target of cycle.relatedCycles) {
      if (target === cycle.slug || !knownSlugs.has(target)) {
        continue;
      }
      const id = edgeId(cycle.slug, target);
      const existing = edges.get(id);
      if (!existing) {
        edges.set(id, {
          id,
          from: cycle.slug,
          to: target,
          source: "relatedCycles",
          weight: 1,
          bidirectional: false,
        });
        continue;
      }
      // Deuxième déclaration du même couple, dans l'autre sens : réciprocité.
      if (existing.from !== cycle.slug) {
        existing.bidirectional = true;
      }
    }
  }

  return edges;
}

/**
 * Arcs `comptes` : entre deux cycles partageant au moins un préfixe PCG, un arc
 * dont le poids est le nombre de préfixes communs. On n'émet pas d'arc `comptes`
 * pour un couple déjà relié par `relatedCycles` (l'arc factuel prime, pas de
 * doublon visuel).
 */
function buildComptesEdges(
  cycles: readonly AuditCycle[],
  relatedEdges: ReadonlyMap<string, RiskEdge>,
): RiskEdge[] {
  const edges: RiskEdge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < cycles.length; i += 1) {
    for (let j = i + 1; j < cycles.length; j += 1) {
      const a = cycles[i];
      const b = cycles[j];
      const id = edgeId(a.slug, b.slug);
      if (relatedEdges.has(id) || seen.has(id)) {
        continue;
      }
      const weight = sharedPrefixCount(a.pcgAccounts, b.pcgAccounts);
      if (weight === 0) {
        continue;
      }
      seen.add(id);
      edges.push({
        id,
        from: a.slug,
        to: b.slug,
        source: "comptes",
        weight,
        bidirectional: true,
      });
    }
  }

  return edges;
}
