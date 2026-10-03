import { describe, expect, it } from "vitest";

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "../../demo/demo-dossier";
import { buildTaxCockpitDatasets } from "../build-cockpit-datasets";
import {
  buildReviewStepper,
  buildRibbon,
  buildTaxStatusLines,
  buildVerdictHeadline,
  buildVerdictSupport,
  formatIsoDate,
} from "../narrative";

const source = getDemoTaxCockpitSource();
const datasets = buildTaxCockpitDatasets(source);

const FORBIDDEN = /fraude|redressement certain|déclaration conforme|impôt définitif|FEC rejeté/iu;

describe("phrase de synthèse", () => {
  it("reprend exercice, contrôles exécutés et conclus du dataset", () => {
    const headline = buildVerdictHeadline(datasets);
    expect(headline.startsWith(`Exercice ${datasets.summary.fiscalYear} — `)).toBe(true);
    expect(headline).toContain(`${datasets.coverage.totalControls} contrôles exécutés`);
    const concluded = datasets.capability.items.find((item) => item.id === "controls-concluded")!;
    expect(headline).toContain(`${concluded.value} conclus`);
  });

  it("qualifie l'incohérence unique avec son impôt et son écart, sans signe", () => {
    const headline = buildVerdictHeadline(datasets);
    // Démo : un contrôle en incohérence (TVA nette, −20,00 €) et une donnée manquante (IS).
    expect(headline).toMatch(/1 incohérence TVA de 20,00 € à qualifier/u);
    expect(headline).toContain("1 donnée manquante (IS)");
    expect(headline.endsWith(".")).toBe(true);
  });

  it("n'emploie aucun terme interdit par la taxonomie", () => {
    expect(buildVerdictHeadline(datasets)).not.toMatch(FORBIDDEN);
    expect(buildVerdictSupport(datasets)).not.toMatch(FORBIDDEN);
  });

  it("dit explicitement qu'aucun contrôle n'a été exécuté, sans inventer de compteur", () => {
    const empty = buildTaxCockpitDatasets(buildDemoTaxCockpitSource({ withoutDocuments: true }));
    const headline = buildVerdictHeadline(empty);
    if (empty.coverage.totalControls === 0) {
      expect(headline).toContain("aucun contrôle exécuté");
    } else {
      expect(headline).toContain(`${empty.coverage.totalControls} contrôle`);
    }
  });

  it("énumère le statut le plus prioritaire de chaque impôt", () => {
    const lines = buildTaxStatusLines(datasets);
    expect(lines.map((line) => line.tax)).toEqual(["IS", "TVA", "CFE"]);
    expect(lines.find((line) => line.tax === "TVA")?.label).toBe("Incohérence");
    expect(lines.find((line) => line.tax === "CFE")?.label).toBe("Vérifié");
    expect(buildVerdictSupport(datasets)).toContain("TVA : Incohérence");
  });
});

describe("ruban de métriques", () => {
  it("porte cinq métriques dont les valeurs viennent des datasets", () => {
    const ribbon = buildRibbon(datasets);
    expect(ribbon).toHaveLength(5);
    expect(ribbon.find((metric) => metric.id === "controls-concluded")?.suffix).toBe(
      `/${datasets.coverage.totalControls}`,
    );
    const differences = ribbon.find((metric) => metric.id === "reconciliation-differences")!;
    expect(differences.value).toBe(
      String(datasets.coverage.segments.find((segment) => segment.key === "difference")!.count),
    );
    expect(differences.tone).toBe("critical");
    expect(ribbon.find((metric) => metric.id === "missing-data")?.tone).toBe("warning");
    for (const metric of ribbon) expect(metric.tooltip.length).toBeGreaterThan(0);
  });
});

describe("fil d'Ariane de la revue", () => {
  it("place l'analyse en cours tant que le statut d'attention n'est pas positif", () => {
    const steps = buildReviewStepper(datasets, 0);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current", "pending"]);
  });

  it("passe la décision en cours dès qu'un événement de revue existe", () => {
    expect(buildReviewStepper(datasets, 2)[3].state).toBe("current");
  });

  it("sans pièce, la collecte des données reste en cours et la suite en attente", () => {
    const empty = buildTaxCockpitDatasets(buildDemoTaxCockpitSource({ withoutDocuments: true }));
    const steps = buildReviewStepper(empty, 0);
    expect(steps[0].state).toBe("current");
    expect(steps[1].state).toBe("pending");
    expect(steps[2].state).toBe("pending");
  });
});

describe("projections ajoutées au dataset", () => {
  it("chaque étape delta du waterfall porte un sens ; les déductions soustraient", () => {
    const deductions = datasets.waterfall.steps.find((step) => step.id === "deductions_confirmed")!;
    expect(deductions.direction).toBe("subtract");
    const reintegrations = datasets.waterfall.steps.find(
      (step) => step.id === "reintegrations_confirmed",
    )!;
    expect(reintegrations.direction).toBe("add");
    expect(reintegrations.readingLabel).toMatch(/^\+ \d+,\d %/u);
    expect(deductions.readingLabel).toMatch(/^− \d+,\d %/u);
    const subtotal = datasets.waterfall.steps.find((step) => step.id === "tax_result_before_deficits")!;
    expect(subtotal.readingLabel).toContain("par rapport au résultat comptable");
  });

  it("chaque cellule de la matrice décompose ses sorties (somme = contrôles)", () => {
    for (const cell of datasets.riskMatrix.cells) {
      expect(cell.outcomeBreakdown.reduce((total, entry) => total + entry.count, 0)).toBe(
        cell.controlCount,
      );
    }
  });

  it("les lignes de rapprochement n'ont pas de controlId, les contrôles en ont un", () => {
    const entries = Object.entries(datasets.findings.details);
    expect(entries.some(([id, detail]) => id.includes("-line:") && detail.controlId === null)).toBe(
      true,
    );
    expect(entries.some(([id, detail]) => id.startsWith("control:") && detail.controlId !== null)).toBe(
      true,
    );
  });

  it("expose les bornes de l'exercice et les pièces disponibles", () => {
    expect(datasets.summary.periodStartDate).toBe("2026-01-01");
    expect(datasets.summary.periodEndDate).toBe("2026-12-31");
    expect(datasets.capability.documents.length).toBeGreaterThan(0);
  });
});

describe("formatIsoDate", () => {
  it("met en forme JJ.MM.AAAA", () => {
    expect(formatIsoDate("2026-01-01")).toBe("01.01.2026");
  });
});
