import { describe, it, expect } from "vitest";
import { validateCycle, validateAll } from "../validation";
import type { AuditCycle } from "../types";

const VALID_CYCLE: AuditCycle = {
  slug: "test-cycle",
  family: "ACTIF_IMMOBILISE",
  title: "Cycle de test",
  summary: "Cycle minimal valide pour les tests.",
  pcgAccounts: ["21"],
  probantSiloIds: [],
  probantCloisons: ["bilan-actif"],
  applicableStandards: [
    { id: "isa-500", label: "ISA 500", type: "ISA", status: "OBLIGATOIRE" },
  ],
  thresholds: [],
  materiality: {
    globalMateriality: {
      formula: "f",
      recommendedRange: "1 % à 2 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-320"],
      caveat: "Les ISA/NEP imposent le principe mais ne fixent pas de pourcentage.",
    },
    performanceMateriality: {
      formula: "60-75 %",
      recommendedRange: "60-75 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-320"],
      caveat: "Pourcentage relevant du jugement professionnel.",
    },
    clearlyTrivialThreshold: {
      formula: "3-5 %",
      recommendedRange: "3-5 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-450"],
      caveat: "Borne opérationnelle non normée.",
    },
  },
  ratios: [],
  analyticalProcedures: [],
  detailTests: [],
  risks: [],
  ifrsVsPcg: [],
  officialSources: [
    { id: "isa-500", label: "ISA 500", type: "ISA", status: "OBLIGATOIRE" },
  ],
  keyPoints: [],
  relatedCycles: [],
  reviewStatus: "REVIEW_REQUIRED",
};

describe("validateCycle", () => {
  it("accepte un cycle minimal valide", () => {
    const r = validateCycle(VALID_CYCLE);
    expect(r.errors, JSON.stringify(r.errors)).toHaveLength(0);
    expect(r.valid).toBe(true);
  });

  it("rejette un cycle sans source ISA/NEP", () => {
    const bad: AuditCycle = { ...VALID_CYCLE, applicableStandards: [] };
    const r = validateCycle(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "applicableStandards")).toBe(true);
  });

  it("rejette un caveat de matérialité manquant", () => {
    const bad: AuditCycle = {
      ...VALID_CYCLE,
      materiality: {
        ...VALID_CYCLE.materiality,
        globalMateriality: {
          ...VALID_CYCLE.materiality.globalMateriality,
          caveat: "",
        },
      },
    };
    const r = validateCycle(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field.includes("caveat"))).toBe(true);
  });

  it("rejette une matérialité marquée OBLIGATOIRE", () => {
    const bad: AuditCycle = {
      ...VALID_CYCLE,
      materiality: {
        ...VALID_CYCLE.materiality,
        globalMateriality: {
          ...VALID_CYCLE.materiality.globalMateriality,
          status: "OBLIGATOIRE",
        },
      },
    };
    const r = validateCycle(bad);
    expect(r.valid).toBe(false);
  });

  it("exige un risque de fraude pour un cycle sensible (chiffre-affaires)", () => {
    const bad: AuditCycle = { ...VALID_CYCLE, slug: "chiffre-affaires-test", risks: [] };
    const r = validateCycle(bad);
    expect(r.errors.some((e) => e.field === "risks")).toBe(true);
  });

  it("rejette un seuil OBLIGATOIRE sans source", () => {
    const bad: AuditCycle = {
      ...VALID_CYCLE,
      thresholds: [
        { label: "Seuil X", value: "v", status: "OBLIGATOIRE", sourceIds: [] },
      ],
    };
    const r = validateCycle(bad);
    expect(r.valid).toBe(false);
  });
});

describe("validateAll", () => {
  it("retourne un rapport structuré pour tous les cycles YAML", async () => {
    const r = await validateAll();
    expect(r).toHaveProperty("valid");
    expect(Array.isArray(r.errors)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.stats.cycles).toBeGreaterThanOrEqual(5);
  });

  it("les cycles YAML livrés ne comportent aucune erreur bloquante", async () => {
    const r = await validateAll();
    expect(r.errors, JSON.stringify(r.errors, null, 2)).toHaveLength(0);
  });
});
