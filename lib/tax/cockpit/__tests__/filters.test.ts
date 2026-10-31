import { describe, expect, it } from "vitest";

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "../../demo/demo-dossier";
import { buildTaxCockpitDatasets } from "../build-cockpit-datasets";
import { buildOutcomeFilters } from "../filters";
import { TAX_OUTCOME_ORDER } from "../labels";

const datasets = buildTaxCockpitDatasets(getDemoTaxCockpitSource());

describe("filtres de sortie de l'exploration", () => {
  it("dénombre les lignes du dossier de démonstration (attendus relevés sur les moteurs)", () => {
    const filters = buildOutcomeFilters(datasets.findings);
    // Démo : 11 lignes de rapprochement (IS 5, TVA 3, CFE 3) et 25 contrôles (IS 1, TVA 16, CFE 8).
    expect(filters.total).toBe(36);
    expect(filters.reconciliationLines).toBe(11);
    expect(filters.controls).toBe(25);
    expect(filters.options.map((option) => [option.label, option.count])).toEqual([
      ["Donnée manquante", 1],
      ["Incohérence", 3],
      ["Non concluant", 1],
      ["Analyse recommandée", 1],
      ["Vérifié", 30],
    ]);
  });

  it("chaque compte est exactement le nombre de lignes que le filtre affiche", () => {
    const filters = buildOutcomeFilters(datasets.findings);
    for (const option of filters.options) {
      const shown = datasets.findings.rows.filter((row) => datasets.findings.outcomeByRowId[row.id] === option.outcome);
      expect(option.count, option.outcome).toBe(shown.length);
    }
    expect(filters.options.reduce((total, option) => total + option.count, 0)).toBe(filters.total);
  });

  it("suit l'ordre de présentation de la taxonomie et omet les sorties absentes", () => {
    const filters = buildOutcomeFilters(datasets.findings);
    const order = filters.options.map((option) => TAX_OUTCOME_ORDER.indexOf(option.outcome));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(filters.options.some((option) => option.outcome === "potential_tax_risk")).toBe(false);
    expect(filters.options.every((option) => option.count > 0)).toBe(true);
  });

  it("reste cohérent sur un dossier sans pièce", () => {
    const empty = buildTaxCockpitDatasets(buildDemoTaxCockpitSource({ withoutDocuments: true }));
    const filters = buildOutcomeFilters(empty.findings);
    expect(filters.total).toBe(empty.findings.rows.length);
    expect(filters.reconciliationLines + filters.controls).toBe(filters.total);
    expect(filters.controls).toBe(empty.coverage.totalControls);
  });
});
