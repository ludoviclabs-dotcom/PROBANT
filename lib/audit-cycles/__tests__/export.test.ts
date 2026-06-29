import { describe, it, expect } from "vitest";
import { exportToJSON, exportToCSV, exportToMarkdown } from "../export";
import type { AuditCycle } from "../types";

const CYCLE: AuditCycle = {
  slug: "immobilisations-corporelles",
  family: "ACTIF_IMMOBILISE",
  title: "Immobilisations corporelles",
  summary: "Résumé.",
  pcgAccounts: ["21", "281"],
  probantSiloIds: ["immobilisations-corporelles"],
  probantCloisons: ["bilan-actif"],
  applicableStandards: [
    { id: "ias-16", label: "IAS 16", type: "IAS", status: "OBLIGATOIRE" },
  ],
  thresholds: [
    { label: "Composants", value: "séparés", status: "OBLIGATOIRE", sourceIds: ["ias-16"] },
  ],
  materiality: {
    globalMateriality: {
      formula: "f",
      recommendedRange: "1 % à 2 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-320"],
      caveat: "Les ISA/NEP n'imposent pas de pourcentage universel.",
    },
    performanceMateriality: {
      formula: "60-75 %",
      recommendedRange: "60-75 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-320"],
      caveat: "Jugement professionnel.",
    },
    clearlyTrivialThreshold: {
      formula: "3-5 %",
      recommendedRange: "3-5 %",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-450"],
      caveat: "Borne opérationnelle.",
    },
  },
  ratios: [
    {
      name: "Taux d'amortissement",
      formula: "Dotations / Valeur brute",
      alertThreshold: "> 5 pts vs N-1",
      interpretation: "Détecte une rupture de méthode.",
      status: "BONNE_PRATIQUE",
      sourceIds: ["isa-520"],
    },
  ],
  analyticalProcedures: [
    {
      name: "Variation des immobilisations",
      objective: "Identifier les mouvements inhabituels.",
      method: "Comparer N/N-1.",
      expectedVariation: "Cohérente avec le plan.",
      anomalyTrigger: "Acquisition non budgétée.",
      benchmark: ["N-1"],
      assertions: ["Existence"],
      sourceIds: ["isa-520"],
    },
  ],
  detailTests: [
    {
      name: "Rapprochement fichier immos / balance",
      nature: "Test substantif",
      extent: "Exhaustif",
      timing: "Clôture",
      samplingMethod: "Exhaustif",
      evidenceRequired: ["Fichier des immobilisations"],
      assertions: ["Exhaustivité"],
      sourceIds: ["isa-500"],
    },
  ],
  risks: [
    {
      name: "Capitalisation abusive",
      category: "RISQUE_FRAUDE",
      description: "Activation de charges.",
      indicators: ["Hausse des capex"],
      response: ["Tester les acquisitions"],
      sourceIds: ["isa-240"],
    },
  ],
  ifrsVsPcg: [
    {
      topic: "Composants",
      ifrsTreatment: "Obligatoire IAS 16.",
      pcgTreatment: "Prévu PCG.",
      auditImpact: "Vérifier les durées.",
      sourceIds: ["ias-16", "pcg"],
    },
  ],
  officialSources: [
    {
      id: "ias-16",
      label: "IAS 16",
      type: "IAS",
      url: "https://www.ifrs.org/",
      status: "OBLIGATOIRE",
    },
  ],
  keyPoints: ["Documenter le tableau de mouvement."],
  relatedCycles: ["impairment-goodwill-actifs"],
  reviewStatus: "REVIEW_REQUIRED",
};

describe("exportToJSON", () => {
  it("produit un JSON valide enveloppant les cycles", () => {
    const json = exportToJSON([CYCLE]);
    const parsed = JSON.parse(json);
    expect(parsed.cycleCount).toBe(1);
    expect(parsed.cycles).toHaveLength(1);
  });
});

describe("exportToCSV", () => {
  it("produit un en-tête + une ligne par cycle", () => {
    const csv = exportToCSV([CYCLE]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("slug");
    expect(lines[1]).toContain("immobilisations-corporelles");
  });

  it("compte les risques de fraude", () => {
    const csv = exportToCSV([CYCLE]);
    // dernière colonne = nbRisquesFraude = 1
    expect(csv.trim().split("\r\n")[1].endsWith(";1")).toBe(true);
  });
});

describe("exportToMarkdown", () => {
  it("inclut le titre en H1", () => {
    expect(exportToMarkdown(CYCLE)).toContain("# Immobilisations corporelles");
  });

  it("inclut le caveat de matérialité", () => {
    expect(exportToMarkdown(CYCLE)).toContain("n'imposent pas de pourcentage universel");
  });

  it("inclut les différences IFRS vs PCG", () => {
    const md = exportToMarkdown(CYCLE);
    expect(md).toContain("Différences IFRS vs PCG");
    expect(md).toContain("Obligatoire IAS 16.");
  });
});
