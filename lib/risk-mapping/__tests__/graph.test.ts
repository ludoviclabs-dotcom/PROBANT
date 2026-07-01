import { describe, it, expect } from "vitest";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import { buildRiskGraph } from "../index";
import type { CycleRiskScore, RiskAxisId, AxisScore } from "../index";

/** Cycle minimal ; on ne renseigne que les champs consommés par le graphe. */
function makeCycle(partial: Partial<AuditCycle> = {}): AuditCycle {
  return {
    slug: "c",
    family: "ACTIF_CIRCULANT",
    title: "Cycle",
    summary: "…",
    pcgAccounts: [],
    probantSiloIds: [],
    probantCloisons: [],
    applicableStandards: [],
    thresholds: [],
    materiality: {
      globalMateriality: { formula: "", recommendedRange: "", status: "BONNE_PRATIQUE", sourceIds: [], caveat: "" },
      performanceMateriality: { formula: "", recommendedRange: "", status: "BONNE_PRATIQUE", sourceIds: [], caveat: "" },
      clearlyTrivialThreshold: { formula: "", recommendedRange: "", status: "BONNE_PRATIQUE", sourceIds: [], caveat: "" },
    },
    ratios: [],
    analyticalProcedures: [],
    detailTests: [],
    risks: [],
    ifrsVsPcg: [],
    officialSources: [],
    keyPoints: [],
    relatedCycles: [],
    reviewStatus: "VALIDATED",
    ...partial,
  };
}

function neutralAxis(id: RiskAxisId): AxisScore {
  return { axis: id, auto: 0, adjustment: 0, value: 0, provenance: "non_évalué", drivers: [] };
}

function makeScore(slug: string): CycleRiskScore {
  return {
    cycleSlug: slug,
    family: "ACTIF_CIRCULANT",
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

const AT = "2026-01-01T00:00:00.000Z";

describe("edges dérivés uniquement de relatedCycles", () => {
  it("crée un arc relatedCycles pour chaque relation déclarée entre cycles connus", () => {
    const cycles = [
      makeCycle({ slug: "a", relatedCycles: ["b"] }),
      makeCycle({ slug: "b", relatedCycles: [] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    const related = graph.edges.filter((e) => e.source === "relatedCycles");
    expect(related).toHaveLength(1);
    expect(related[0].source).toBe("relatedCycles");
    expect(new Set([related[0].from, related[0].to])).toEqual(new Set(["a", "b"]));
  });

  it("ignore les relatedCycles pointant vers un cycle inconnu (aucun arc orphelin)", () => {
    const cycles = [makeCycle({ slug: "a", relatedCycles: ["fantome"] })];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    expect(graph.edges.filter((e) => e.source === "relatedCycles")).toHaveLength(0);
  });

  it("ignore une auto-relation (a -> a)", () => {
    const cycles = [makeCycle({ slug: "a", relatedCycles: ["a"] })];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    expect(graph.edges).toHaveLength(0);
  });

  it("marque bidirectional quand la relation est réciproque des deux côtés", () => {
    const cycles = [
      makeCycle({ slug: "a", relatedCycles: ["b"] }),
      makeCycle({ slug: "b", relatedCycles: ["a"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    const related = graph.edges.filter((e) => e.source === "relatedCycles");
    expect(related).toHaveLength(1);
    expect(related[0].bidirectional).toBe(true);
  });
});

describe("edges dérivés de comptes (préfixes PCG partagés)", () => {
  it("crée un arc comptes pondéré par le nombre de préfixes communs", () => {
    const cycles = [
      makeCycle({ slug: "a", pcgAccounts: ["41", "44"] }),
      makeCycle({ slug: "b", pcgAccounts: ["41", "44", "60"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    const comptes = graph.edges.filter((e) => e.source === "comptes");
    expect(comptes).toHaveLength(1);
    expect(comptes[0].weight).toBe(2);
  });

  it("n'émet pas d'arc comptes quand un arc relatedCycles existe déjà (pas de doublon)", () => {
    const cycles = [
      makeCycle({ slug: "a", pcgAccounts: ["41"], relatedCycles: ["b"] }),
      makeCycle({ slug: "b", pcgAccounts: ["41"], relatedCycles: ["a"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe("relatedCycles");
  });

  it("aucun arc comptes quand aucun préfixe partagé", () => {
    const cycles = [
      makeCycle({ slug: "a", pcgAccounts: ["10"] }),
      makeCycle({ slug: "b", pcgAccounts: ["70"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    expect(graph.edges.filter((e) => e.source === "comptes")).toHaveLength(0);
  });
});

describe("edges dédupliqués et sans orphelin", () => {
  it("un couple relié dans les deux sens ne produit qu'un seul arc (id canonique)", () => {
    const cycles = [
      makeCycle({ slug: "a", relatedCycles: ["b", "b"] }),
      makeCycle({ slug: "b", relatedCycles: ["a"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(graph.edges).toHaveLength(1);
  });

  it("tout arc a from et to appartenant aux nodes (aucun orphelin)", () => {
    const cycles = [
      makeCycle({ slug: "a", pcgAccounts: ["41"], relatedCycles: ["b", "z-inconnu"] }),
      makeCycle({ slug: "b", pcgAccounts: ["41"], relatedCycles: [] }),
      makeCycle({ slug: "c", pcgAccounts: ["41"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  it("chaque arc a un source dans {relatedCycles, comptes}", () => {
    const cycles = [
      makeCycle({ slug: "a", pcgAccounts: ["41"], relatedCycles: ["b"] }),
      makeCycle({ slug: "b", pcgAccounts: ["41"], relatedCycles: [] }),
      makeCycle({ slug: "c", pcgAccounts: ["41"] }),
    ];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    for (const edge of graph.edges) {
      expect(["relatedCycles", "comptes"]).toContain(edge.source);
    }
  });
});

describe("nodes et scores", () => {
  it("un node par cycle, horodatage propagé", () => {
    const cycles = [makeCycle({ slug: "a" }), makeCycle({ slug: "b" })];
    const graph = buildRiskGraph(cycles, new Map(), AT);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.generatedAt).toBe(AT);
    for (const node of graph.nodes) {
      expect(node.position).toBeUndefined();
    }
  });

  it("injecte le score fourni et retombe sur un score non_évalué sinon", () => {
    const cycles = [makeCycle({ slug: "a" }), makeCycle({ slug: "b" })];
    const scores = new Map<string, CycleRiskScore>([["a", makeScore("a")]]);
    const graph = buildRiskGraph(cycles, scores, AT);
    const nodeB = graph.nodes.find((n) => n.id === "b");
    expect(nodeB).toBeDefined();
    expect(nodeB!.scores.evaluation).toBe("non_évalué");
    expect(nodeB!.scores.composite).toBeNull();
  });

  it("accepte un Record de scores comme une Map", () => {
    const cycles = [makeCycle({ slug: "a" })];
    const graph = buildRiskGraph(cycles, { a: makeScore("a") }, AT);
    expect(graph.nodes[0].scores.cycleSlug).toBe("a");
  });
});
