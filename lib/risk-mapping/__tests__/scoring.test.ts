import { describe, it, expect } from "vitest";
import type { Finding, Severity } from "@/lib/canonical-model";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import {
  scoreGravite,
  scoreProbabilite,
  scoreDetectabilite,
  scoreExposition,
  composite,
  criticityBand,
  scoreCycle,
  ADJ_STEP,
} from "../index";
import type { AxisScore, RiskAxisId } from "../index";

/** Constat minimal ; les champs non pertinents au scoring restent neutres. */
function makeFinding(partial: Partial<Finding> = {}): Finding {
  return {
    id: "F-1",
    family: "internal",
    severity: "mineur",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "bilan-actif",
    siloId: "creances-clients",
    titre: "Constat de test",
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

/** Cycle minimal ; on ne renseigne que ce que le scoring consomme. */
function makeCycle(partial: Partial<AuditCycle> = {}): AuditCycle {
  return {
    slug: "creances-clients",
    family: "ACTIF_CIRCULANT",
    title: "Créances clients",
    summary: "…",
    pcgAccounts: ["411"],
    probantSiloIds: ["creances-clients"],
    probantCloisons: ["bilan-actif"],
    applicableStandards: [],
    thresholds: [],
    materiality: {
      globalMateriality: {
        formula: "",
        recommendedRange: "",
        status: "BONNE_PRATIQUE",
        sourceIds: [],
        caveat: "",
      },
      performanceMateriality: {
        formula: "",
        recommendedRange: "",
        status: "BONNE_PRATIQUE",
        sourceIds: [],
        caveat: "",
      },
      clearlyTrivialThreshold: {
        formula: "",
        recommendedRange: "",
        status: "BONNE_PRATIQUE",
        sourceIds: [],
        caveat: "",
      },
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

const MATERIALITY: MaterialityThresholds = {
  base: "chiffre_affaires",
  baseMontant: 6340000,
  taux: 0.005,
  significativite: 31700,
  performance: 23775,
  trivialite: 1585,
  source: "ISA 320",
};

function inBounds(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

function allAxisBounds(axis: AxisScore): void {
  expect(inBounds(axis.auto)).toBe(true);
  expect(inBounds(axis.value)).toBe(true);
}

describe("bornes [0,100] des scores d'axe", () => {
  it("gravité reste dans [0,100] même avec une masse et une incidence énormes", () => {
    const findings = Array.from({ length: 40 }, (_, i) =>
      makeFinding({
        id: `F-${i}`,
        severity: "bloquant",
        mesure: { constate: 10_000_000, seuil: 0, unite: "EUR", libelle: "x" },
      }),
    );
    allAxisBounds(scoreGravite(findings, MATERIALITY));
  });

  it("probabilité reste dans [0,100] avec beaucoup de constats et de risques", () => {
    const findings = Array.from({ length: 30 }, (_, i) =>
      makeFinding({ id: `F-${i}`, faisceau: ["a", "b", "c"], fauxPositifRisk: "faible" }),
    );
    const cycle = makeCycle({
      risks: Array.from({ length: 10 }, (_, i) => ({
        name: `R-${i}`,
        category: "RISQUE_INHERENT",
        description: "",
        indicators: [],
        response: [],
        sourceIds: [],
      })),
    });
    allAxisBounds(scoreProbabilite(cycle, findings));
  });

  it("détectabilité reste dans [0,100] avec beaucoup de preuve", () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      makeFinding({
        id: `F-${i}`,
        preuve: [
          { etape: "1", detail: "" },
          { etape: "2", detail: "" },
        ],
        origine: "rapprochement",
        qualification: "rapprochement_solde",
        fauxPositifRisk: "faible",
        seuilApplique: {
          type: "significativite",
          base: "chiffre_affaires",
          tauxApplique: 0.005,
          montantCalcule: 31700,
          source: "ISA 320",
          depasse: true,
        },
      }),
    );
    allAxisBounds(scoreDetectabilite(findings));
  });

  it("exposition reste dans [0,100] pour un cycle fiscal hardLaw avec de nombreux standards", () => {
    const cycle = makeCycle({
      family: "TRANSVERSAL",
      probantCloisons: ["tva-fiscalite"],
      applicableStandards: Array.from({ length: 12 }, (_, i) => ({
        id: `S-${i}`,
        label: `Std ${i}`,
        status: "OBLIGATOIRE",
      })),
    });
    allAxisBounds(scoreExposition(cycle));
  });

  it("composite reste dans [0,100] aux extrêmes", () => {
    const max: Record<RiskAxisId, AxisScore> = {
      gravite: axis("gravite", 100),
      probabilite: axis("probabilite", 100),
      detectabilite: axis("detectabilite", 0),
      exposition: axis("exposition", 100),
    };
    const c = composite(max);
    expect(inBounds(c)).toBe(true);
    expect(c).toBeCloseTo(100, 5);

    const min: Record<RiskAxisId, AxisScore> = {
      gravite: axis("gravite", 0),
      probabilite: axis("probabilite", 0),
      detectabilite: axis("detectabilite", 100),
      exposition: axis("exposition", 0),
    };
    expect(composite(min)).toBe(0);
  });

  it("exploite la pleine échelle : des facteurs élevés atteignent les hautes bandes", () => {
    // Agrégation géométrique pondérée : un cycle réellement risqué (gravité et
    // probabilité fortes, détection moyenne) doit dépasser « modéré », sinon la
    // formule est revenue au produit brut compressé (tout en « faible »).
    const eleve: Record<RiskAxisId, AxisScore> = {
      gravite: axis("gravite", 85),
      probabilite: axis("probabilite", 70),
      detectabilite: axis("detectabilite", 40),
      exposition: axis("exposition", 60),
    };
    expect(composite(eleve)).toBeGreaterThan(50);

    // Un profil médian sur tous les axes ne doit pas rester coincé en « faible »
    // (< 25) — la borne haute de la compression précédente.
    const median: Record<RiskAxisId, AxisScore> = {
      gravite: axis("gravite", 50),
      probabilite: axis("probabilite", 50),
      detectabilite: axis("detectabilite", 50),
      exposition: axis("exposition", 50),
    };
    expect(composite(median)).toBeGreaterThan(25);
  });
});

function axis(id: RiskAxisId, value: number): AxisScore {
  return { axis: id, auto: value, adjustment: 0, value, provenance: "auto", drivers: [] };
}

describe("composite = null SSI evaluation = non_évalué", () => {
  it("null quand aucun constat ni standard obligatoire", () => {
    const cycle = makeCycle({ applicableStandards: [], risks: [] });
    const score = scoreCycle(cycle, [], MATERIALITY);
    expect(score.evaluation).toBe("non_évalué");
    expect(score.composite).toBeNull();
  });

  it("non-null quand il y a des constats", () => {
    const cycle = makeCycle();
    const score = scoreCycle(cycle, [makeFinding({ severity: "majeur" })], MATERIALITY);
    expect(score.evaluation).toBe("évalué");
    expect(score.composite).not.toBeNull();
  });

  it("l'équivalence tient sur un échantillon de configurations", () => {
    const configs: { standards: boolean; findings: number }[] = [
      { standards: false, findings: 0 },
      { standards: true, findings: 0 },
      { standards: false, findings: 2 },
      { standards: true, findings: 3 },
    ];
    for (const cfg of configs) {
      const cycle = makeCycle({
        applicableStandards: cfg.standards
          ? [{ id: "S", label: "S", status: "OBLIGATOIRE" }]
          : [],
      });
      const findings = Array.from({ length: cfg.findings }, (_, i) =>
        makeFinding({ id: `F-${i}` }),
      );
      const score = scoreCycle(cycle, findings, MATERIALITY);
      // composite === null  <=>  evaluation !== "évalué" (partiel ET non_évalué)
      expect(score.composite === null).toBe(score.evaluation !== "évalué");
    }
  });
});

describe("non évalué ≠ 0 vert", () => {
  it("un cycle sans constat ET sans standard obligatoire est non_évalué (jamais un composite chiffré)", () => {
    const cycle = makeCycle({
      applicableStandards: [
        { id: "S", label: "Recommandé", status: "RECOMMANDE" },
      ],
      risks: [],
    });
    const score = scoreCycle(cycle, [], MATERIALITY);
    expect(score.evaluation).toBe("non_évalué");
    expect(score.composite).toBeNull();
    expect(score.criticityBand).toBe("non_évalué");
    // Ne doit surtout pas être 0 (qui suggérerait un risque maîtrisé et prouvé).
    expect(score.composite).not.toBe(0);
  });

  it("un cycle partiel (standard obligatoire, 0 constat) a composite=null — jamais 0 vert", () => {
    const cycle = makeCycle({
      applicableStandards: [{ id: "S", label: "Obligatoire", status: "OBLIGATOIRE" }],
    });
    const score = scoreCycle(cycle, [], MATERIALITY);
    expect(score.evaluation).toBe("partiel");
    // Sans constat, le composite ne peut pas être chiffré sans risquer d'afficher
    // un faux "risque faible / vert" ; composite=null, même si l'exposition est réelle.
    expect(score.composite).toBeNull();
    expect(score.criticityBand).toBe("non_évalué");
  });
});

describe("ajustement +2/-2 clampé et borné", () => {
  it("un ajustement supra-cran ne pousse jamais value hors [0,100]", () => {
    const cycle = makeCycle();
    const findings = [makeFinding({ severity: "bloquant" })];

    const boost = scoreCycle(cycle, findings, MATERIALITY, {
      probabilite: 5,
      detectabilite: 5,
      touchedAt: "t",
    });
    for (const id of ["probabilite", "detectabilite"] as const) {
      expect(inBounds(boost.axes[id].value)).toBe(true);
    }

    const drop = scoreCycle(cycle, findings, MATERIALITY, {
      probabilite: -5,
      detectabilite: -5,
      touchedAt: "t",
    });
    for (const id of ["probabilite", "detectabilite"] as const) {
      expect(inBounds(drop.axes[id].value)).toBe(true);
    }
  });

  it("un cran d'ajustement déplace value de ADJ_STEP (dans la zone linéaire)", () => {
    const cycle = makeCycle();
    // Un seul constat mineur : auto de probabilité bas, loin des bornes.
    const findings = [makeFinding({ severity: "mineur" })];

    const base = scoreCycle(cycle, findings, MATERIALITY);
    const plus1 = scoreCycle(cycle, findings, MATERIALITY, {
      probabilite: 1,
      detectabilite: 0,
      touchedAt: "t",
    });
    expect(plus1.axes.probabilite.value).toBeCloseTo(
      base.axes.probabilite.auto + ADJ_STEP,
      5,
    );
    expect(plus1.axes.probabilite.provenance).toBe("auto+ajusté");
  });

  it("gravité et exposition ne sont pas ajustables (adjustment reste 0)", () => {
    const cycle = makeCycle();
    const findings = [makeFinding({ severity: "majeur" })];
    const score = scoreCycle(cycle, findings, MATERIALITY, {
      probabilite: 2,
      detectabilite: -2,
      touchedAt: "t",
    });
    expect(score.axes.gravite.adjustment).toBe(0);
    expect(score.axes.gravite.value).toBe(score.axes.gravite.auto);
    expect(score.axes.exposition.adjustment).toBe(0);
    expect(score.axes.exposition.value).toBe(score.axes.exposition.auto);
  });
});

describe("monotonie de la gravité", () => {
  it("plus de constats bloquants ⇒ gravité auto plus haute (croissance)", () => {
    const g = (nbBloquants: number): number => {
      const findings = Array.from({ length: nbBloquants }, (_, i) =>
        makeFinding({ id: `F-${i}`, severity: "bloquant" as Severity }),
      );
      return scoreGravite(findings, MATERIALITY).auto;
    };
    const g0 = g(0);
    const g1 = g(1);
    const g2 = g(3);
    const g3 = g(8);
    expect(g1).toBeGreaterThan(g0);
    expect(g2).toBeGreaterThan(g1);
    expect(g3).toBeGreaterThan(g2);
  });

  it("un bloquant pèse plus qu'un mineur à effectif égal", () => {
    const bloquant = scoreGravite([makeFinding({ severity: "bloquant" })], MATERIALITY).auto;
    const mineur = scoreGravite([makeFinding({ severity: "mineur" })], MATERIALITY).auto;
    expect(bloquant).toBeGreaterThan(mineur);
  });

  it("plus de bloquants ⇒ composite auto plus haut, toutes choses égales par ailleurs", () => {
    const comp = (nbBloquants: number): number => {
      const cycle = makeCycle();
      const findings = Array.from({ length: nbBloquants }, (_, i) =>
        makeFinding({ id: `F-${i}`, severity: "bloquant" as Severity }),
      );
      const c = scoreCycle(cycle, findings, MATERIALITY).composite;
      expect(c).not.toBeNull();
      return c ?? 0;
    };
    expect(comp(4)).toBeGreaterThan(comp(1));
  });
});

describe("criticityBand", () => {
  it("mappe les bornes documentées", () => {
    expect(criticityBand(null)).toBe("non_évalué");
    expect(criticityBand(0)).toBe("faible");
    expect(criticityBand(24.9)).toBe("faible");
    expect(criticityBand(25)).toBe("modéré");
    expect(criticityBand(50)).toBe("élevé");
    expect(criticityBand(75)).toBe("critique");
    expect(criticityBand(100)).toBe("critique");
  });
});
