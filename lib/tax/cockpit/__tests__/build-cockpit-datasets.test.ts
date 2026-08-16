import { describe, expect, it } from "vitest";

import type { TaxReconciliationLine } from "@/lib/canonical-model";
import { formatCents } from "@/lib/synthesis/money";
import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "../../demo/demo-dossier";
import { buildTaxCockpitDatasets } from "../build-cockpit-datasets";
import { CONCLUSIVE_OUTCOMES, NON_CONCLUSIVE_OUTCOMES, TAX_OUTCOME_LABEL } from "../labels";
import type { TaxCockpitSource } from "../types";

const source = getDemoTaxCockpitSource();
const datasets = buildTaxCockpitDatasets(source);

describe("chiffres identiques au snapshot", () => {
  it("le waterfall rend exactement les étapes du moteur IS", () => {
    const engineSteps = source.corporateTax!.snapshot.waterfall.steps;
    expect(datasets.waterfall.steps.map((step) => step.id)).toEqual(
      engineSteps.map((step) => step.code),
    );
    expect(datasets.waterfall.steps.map((step) => step.deltaCents)).toEqual(
      engineSteps.map((step) => step.deltaCents),
    );
    expect(datasets.waterfall.steps.map((step) => step.runningTotalCents)).toEqual(
      engineSteps.map((step) => step.runningTotalCents),
    );
    expect(datasets.waterfall.confirmedTaxResultCents).toBe(
      source.corporateTax!.snapshot.waterfall.confirmedTaxResultCents,
    );
    expect(datasets.waterfall.proposedTaxResultCents).toBe(
      source.corporateTax!.snapshot.waterfall.proposedTaxResultCents,
    );
  });

  it("une étape proposée reste hors cumul et marquée comme candidate", () => {
    const proposed = datasets.waterfall.steps.find((step) => step.status === "proposed");
    expect(proposed).toBeDefined();
    expect(proposed!.note).toContain("hors cumul");
    const index = datasets.waterfall.steps.indexOf(proposed!);
    expect(proposed!.runningTotalCents).toBe(
      datasets.waterfall.steps[index - 1].runningTotalCents,
    );
  });

  it("la réconciliation IS reprend les lignes du moteur, montants formatés sans altération", () => {
    const lines = source.corporateTax!.reconciliationLines;
    expect(datasets.corporateReconciliation.rows).toHaveLength(lines.length);
    const accounted = lines.find((line) => line.lineKey === "accounted_tax_charge")!;
    const row = datasets.corporateReconciliation.rows.find((candidate) =>
      candidate.id === accounted.id,
    )!;
    expect(row.cells.left).toBe(formatCents(accounted.leftOperand!.amountCents!));
    expect(row.cells.right).toBe(formatCents(accounted.rightOperand!.amountCents!));
    expect(row.cells.difference).toBe(formatCents(accounted.differenceAmountCents!));
    expect(row.cells.status).toBe(TAX_OUTCOME_LABEL.reconciliation_difference);
  });

  it("la réconciliation TVA reprend le jeu `comparison` du moteur, null compris", () => {
    const comparison = source.vat!.snapshot.datasets.comparison;
    expect(datasets.vatReconciliation.rows).toHaveLength(comparison.rows.length);
    for (const row of comparison.rows) {
      const rendered = datasets.vatReconciliation.rows.find((candidate) => candidate.id === row.key)!;
      expect(rendered.cells.declared).toBe(
        row.declaredCents === null ? "non disponible" : formatCents(row.declaredCents),
      );
    }
  });

  it("les compteurs de capacité égalent les compteurs de la synthèse fiscale", () => {
    const counts = source.synthesis.outcomeCounts;
    const concluded = CONCLUSIVE_OUTCOMES.reduce((total, outcome) => total + counts[outcome], 0);
    const notConcluded = NON_CONCLUSIVE_OUTCOMES.reduce(
      (total, outcome) => total + counts[outcome],
      0,
    );
    const byId = Object.fromEntries(datasets.capability.items.map((item) => [item.id, item]));
    expect(byId["controls-concluded"].value).toBe(String(concluded));
    expect(byId["controls-not-concluded"].value).toBe(String(notConcluded));
    expect(byId["confirmed-anomalies"].value).toBe(String(counts.confirmed_non_compliance));
    expect(byId["missing-data"].value).toBe(String(counts.missing_information));
    expect(byId["applicable-taxes"].value).toBe("3");
  });

  it("la répartition par nature couvre exactement les contrôles exécutés", () => {
    const total = datasets.findingsByNature.rows.reduce(
      (sum, row) => sum + Number(row.cells.count),
      0,
    );
    expect(total).toBe(datasets.coverage.totalControls);
    expect(total).toBe(
      Object.values(source.synthesis.outcomeCounts).reduce((sum, count) => sum + count, 0),
    );
  });

  it("l'exposition additionne les écarts hors tolérance sans en inventer", () => {
    const isLines = source.corporateTax!.reconciliationLines.filter(
      (line) => line.status === "different",
    );
    const expected = isLines.reduce(
      (total, line) => total + Math.abs(line.differenceAmountCents ?? 0),
      0,
    );
    const row = datasets.exposure.rows.find((candidate) => candidate.id === "differences-corporate_income_tax")!;
    expect(row.cells.amount).toBe(formatCents(expected));
  });
});

describe("périmètres partiels", () => {
  it("dossier IS seul : les volets TVA et CFE affichent l'absence, sans zéro inventé", () => {
    const isOnly = buildDemoTaxCockpitSource({ includeVat: false, includeCfe: false });
    const bundle = buildTaxCockpitDatasets(isOnly);
    expect(bundle.vatReconciliation.rows).toHaveLength(0);
    expect(bundle.vatReconciliation.summary).toContain("Aucune réconciliation de TVA");
    expect(bundle.waterfall.steps.length).toBeGreaterThan(0);
    expect(bundle.periods.rows).toHaveLength(1);
  });

  it("dossier TVA seul : aucun waterfall IS", () => {
    const vatOnly = buildDemoTaxCockpitSource({ includeCorporateTax: false, includeCfe: false });
    const bundle = buildTaxCockpitDatasets(vatOnly);
    expect(bundle.waterfall.steps).toHaveLength(0);
    expect(bundle.waterfall.summary).toContain("Aucun calcul d'impôt sur les sociétés");
    expect(bundle.vatReconciliation.rows.length).toBeGreaterThan(0);
  });

  it("le filtre par impôt sélectionne sans recalculer", () => {
    const vatScope = buildTaxCockpitDatasets(source, "vat");
    expect(vatScope.waterfall.steps).toHaveLength(0);
    expect(vatScope.corporateReconciliation.rows).toHaveLength(0);
    expect(vatScope.vatReconciliation.rows).toHaveLength(
      source.vat!.snapshot.datasets.comparison.rows.length,
    );
    expect(vatScope.riskMatrix.taxes).toEqual(["vat"]);
  });

  it("aucun impôt calculable : le cockpit dit « donnée manquante » et propose une action", () => {
    const empty = buildDemoTaxCockpitSource({ withoutDocuments: true });
    const bundle = buildTaxCockpitDatasets(empty);
    expect(bundle.summary.headlineLabel).toBe(TAX_OUTCOME_LABEL.missing_information);
    expect(bundle.capability.nextAction).not.toBeNull();
    expect(bundle.capability.nextAction!.priority).toBe("required");
    expect(bundle.requiredDocuments.rows.length).toBeGreaterThan(0);
  });
});

describe("grand volume", () => {
  it("1 000 lignes de réconciliation restent intégralement restituées", () => {
    const template = source.corporateTax!.reconciliationLines[0];
    const bigLines: TaxReconciliationLine[] = Array.from({ length: 1_000 }, (_, index) => ({
      ...template,
      id: `line-volume-${index}`,
      label: `Ligne de volume ${index}`,
      status: index % 4 === 0 ? "different" : "matched",
      differenceAmountCents: index % 4 === 0 ? 100 + index : 0,
    }));
    const bigSource: TaxCockpitSource = {
      ...source,
      corporateTax: {
        snapshot: source.corporateTax!.snapshot,
        reconciliationLines: bigLines,
      },
    };
    const bundle = buildTaxCockpitDatasets(bigSource);
    expect(bundle.corporateReconciliation.rows).toHaveLength(1_000);
    const findingLineRows = bundle.findings.rows.filter((row) =>
      row.id.startsWith("line-volume-"),
    );
    expect(findingLineRows).toHaveLength(1_000);
    // 250 écarts (index multiples de 4) : la somme d'exposition les couvre tous.
    const expected = bigLines
      .filter((line) => line.status === "different")
      .reduce((total, line) => total + Math.abs(line.differenceAmountCents ?? 0), 0);
    const row = bundle.exposure.rows.find(
      (candidate) => candidate.id === "differences-corporate_income_tax",
    )!;
    expect(row.cells.amount).toBe(formatCents(expected));
    expect(Object.keys(bundle.findings.details).length).toBeGreaterThanOrEqual(1_000);
  });
});

describe("langage utilisateur", () => {
  it("chaque statut porte l'un des sept libellés imposés", () => {
    expect(Object.values(TAX_OUTCOME_LABEL).sort()).toEqual(
      [
        "Vérifié",
        "Anomalie confirmée",
        "Incohérence",
        "Risque potentiel",
        "Donnée manquante",
        "Non concluant",
        "Analyse recommandée",
      ].sort(),
    );
    const allowed = new Set([...Object.values(TAX_OUTCOME_LABEL)]);
    for (const row of datasets.findings.rows) {
      expect(allowed.has(String(row.cells.status))).toBe(true);
    }
  });

  it("aucun wording interdit par la taxonomie n'apparaît dans les datasets", () => {
    const serialized = JSON.stringify(datasets).toLowerCase();
    for (const forbidden of ["fraude", "redressement certain", "déclaration conforme", "impôt définitif", "fec rejeté"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
