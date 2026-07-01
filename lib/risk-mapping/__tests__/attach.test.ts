import { describe, it, expect } from "vitest";
import type { Finding } from "@/lib/canonical-model";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import {
  attachFindingsToCycles,
  cyclesForFinding,
  cycleForFinding,
} from "../index";

/** Constat minimal : le rattachement ne lit que siloId, cloison, comptes. */
function makeFinding(partial: Partial<Finding> = {}): Finding {
  return {
    id: "F-1",
    family: "internal",
    severity: "mineur",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "bilan-actif",
    siloId: "creances-clients",
    titre: "Constat",
    constat: "…",
    explication: "…",
    mesure: { constate: 0, seuil: 0, unite: "EUR", libelle: "test" },
    source: { ref: "INTERNE", citation: "…", effectiveDate: "2025-01-01" },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
    ...partial,
  };
}

/** Cycle minimal : seuls slug, probantSiloIds, probantCloisons comptent ici. */
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

const CREANCES_CYCLE = makeCycle({
  slug: "creances-clients",
  probantSiloIds: ["creances-clients"],
  probantCloisons: ["bilan-actif"],
});

describe("rattachement par silo (règle prioritaire)", () => {
  it("un finding siloId='creances-clients' se rattache au cycle 'creances-clients'", () => {
    const f = makeFinding({ siloId: "creances-clients" });
    const slugs = cyclesForFinding(f, [CREANCES_CYCLE]);
    expect(slugs).toContain("creances-clients");

    const { byCycle, unattached } = attachFindingsToCycles([CREANCES_CYCLE], [f]);
    expect(byCycle.get("creances-clients")).toEqual([f]);
    expect(unattached).toHaveLength(0);
  });

  it("cycleForFinding renvoie le cycle homonyme", () => {
    const f = makeFinding({ siloId: "creances-clients" });
    const cycle = cycleForFinding(f, [CREANCES_CYCLE]);
    expect(cycle?.slug).toBe("creances-clients");
  });

  it("le silo prime sur la cloison quand les deux sont présents", () => {
    const parSilo = makeCycle({ slug: "par-silo", probantSiloIds: ["creances-clients"] });
    const parCloison = makeCycle({ slug: "par-cloison", probantCloisons: ["bilan-actif"] });
    const f = makeFinding({ siloId: "creances-clients", cloison: "bilan-actif" });
    const slugs = cyclesForFinding(f, [parSilo, parCloison]);
    // La règle silo trouve un match, donc on ne retombe pas sur la cloison.
    expect(slugs).toEqual(["par-silo"]);
  });
});

describe("repli par cloison puis par compte", () => {
  it("retombe sur la cloison quand aucun cycle ne référence le silo", () => {
    const f = makeFinding({ siloId: "silo-inconnu", cloison: "tva-fiscalite" });
    const cycle = makeCycle({ slug: "fiscal", probantCloisons: ["tva-fiscalite"] });
    const slugs = cyclesForFinding(f, [cycle]);
    expect(slugs).toEqual(["fiscal"]);
  });

  it("retombe sur les comptes (siloForCompte) quand ni silo ni cloison ne matchent", () => {
    // 411000 -> silo 'creances-clients' via siloForCompte ; le cycle référence ce silo.
    const f = makeFinding({
      siloId: "silo-inconnu",
      cloison: "resultat",
      comptesConcernes: ["411000"],
    });
    const cycle = makeCycle({ slug: "clients", probantSiloIds: ["creances-clients"] });
    const slugs = cyclesForFinding(f, [cycle]);
    expect(slugs).toEqual(["clients"]);
  });
});

describe("bucket non rattaché", () => {
  it("un finding qui ne matche ni silo, ni cloison, ni compte finit dans unattached", () => {
    const f = makeFinding({
      siloId: "silo-inconnu",
      cloison: "annexe",
      comptesConcernes: [],
    });
    const cycle = makeCycle({ slug: "clients", probantSiloIds: ["creances-clients"] });
    const { byCycle, unattached } = attachFindingsToCycles([cycle], [f]);
    expect(byCycle.size).toBe(0);
    expect(unattached).toEqual([f]);
  });
});

describe("rattachement multi-cycles", () => {
  it("un même constat peut alimenter plusieurs cycles partageant le silo", () => {
    const a = makeCycle({ slug: "a", probantSiloIds: ["creances-clients"] });
    const b = makeCycle({ slug: "b", probantSiloIds: ["creances-clients"] });
    const f = makeFinding({ siloId: "creances-clients" });
    const { byCycle } = attachFindingsToCycles([a, b], [f]);
    expect(byCycle.get("a")).toEqual([f]);
    expect(byCycle.get("b")).toEqual([f]);
  });

  it("regroupe plusieurs constats sous le même cycle", () => {
    const f1 = makeFinding({ id: "F-1", siloId: "creances-clients" });
    const f2 = makeFinding({ id: "F-2", siloId: "creances-clients" });
    const { byCycle } = attachFindingsToCycles([CREANCES_CYCLE], [f1, f2]);
    expect(byCycle.get("creances-clients")).toEqual([f1, f2]);
  });
});
