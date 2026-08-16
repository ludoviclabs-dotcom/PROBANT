// @vitest-environment jsdom
/**
 * Tests des composants du cockpit fiscalité (TAX-08).
 *
 * Même discipline que la Synthèse : les datasets viennent du VRAI pipeline
 * (moteurs TAX-05/06/07 exécutés sur le dossier de démonstration), et les
 * assertions comparent le rendu au dataset — jamais à des valeurs recopiées.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import axe from "axe-core";

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "@/lib/tax/demo";
import {
  buildTaxCockpitDatasets,
  TAX_COCKPIT_SCOPES,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
} from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { AccountingToTaxWaterfall } from "../AccountingToTaxWaterfall";
import { TaxCapabilityPanel } from "../TaxCapabilityPanel";
import { TaxCockpitWorkspace } from "../TaxCockpitWorkspace";
import { TaxFindingTable } from "../TaxFindingTable";

declare global {
  // Requis par React 19 pour act() sous testing-library.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(cleanup);

const source = getDemoTaxCockpitSource();
const datasets = buildTaxCockpitDatasets(source);

function buildBundles(sourceOverride = source) {
  return Object.fromEntries(
    TAX_COCKPIT_SCOPES.map((scope) => [scope, buildTaxCockpitDatasets(sourceOverride, scope)]),
  ) as Record<TaxCockpitScope, TaxCockpitDatasets>;
}

describe("rendu : les chiffres affichés sont ceux du snapshot", () => {
  it("le waterfall affiche chaque étape du moteur avec son montant", () => {
    const { container } = render(<AccountingToTaxWaterfall dataset={datasets.waterfall} />);
    const text = container.textContent ?? "";
    for (const step of datasets.waterfall.steps) {
      expect(text).toContain(step.label);
    }
    const base = datasets.waterfall.steps.find((step) => step.id === "accounting_result")!;
    expect(text).toContain(formatCents(base.runningTotalCents));
  });

  it("le panneau de capacité rend les huit indicateurs du dataset", () => {
    const { container } = render(<TaxCapabilityPanel dataset={datasets.capability} />);
    const text = container.textContent ?? "";
    expect(datasets.capability.items).toHaveLength(8);
    for (const item of datasets.capability.items) {
      expect(text).toContain(item.label);
      expect(text).toContain(item.value);
    }
  });

  it("le tableau d'exploration rend une ligne par entrée du dataset (filtre « tous »)", () => {
    const { container } = render(
      <TaxFindingTable dataset={datasets.findings} outcomeFilter="tous" onOutcomeFilterChange={() => {}} />,
    );
    // 100 lignes par page au maximum ; le dataset de démo tient sur une page.
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(Math.min(100, datasets.findings.rows.length));
  });
});

describe("clavier et interactions", () => {
  it("la méthodologie s'ouvre au clic et se ferme à Échap", () => {
    render(<AccountingToTaxWaterfall dataset={datasets.waterfall} />);
    const button = screen.getByRole("button", {
      name: `Méthodologie du graphique ${datasets.waterfall.title}`,
    });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("les filtres portent aria-pressed et le filtre statut réduit les lignes", () => {
    let selected = "tous";
    const { container, rerender } = render(
      <TaxFindingTable
        dataset={datasets.findings}
        outcomeFilter={selected}
        onOutcomeFilterChange={(next) => {
          selected = next;
        }}
      />,
    );
    const incoherence = screen.getByRole("button", { name: "Incohérence" });
    expect(incoherence.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(incoherence);
    expect(selected).toBe("reconciliation_difference");
    rerender(
      <TaxFindingTable
        dataset={datasets.findings}
        outcomeFilter={selected}
        onOutcomeFilterChange={() => {}}
      />,
    );
    const expected = Object.values(datasets.findings.outcomeByRowId).filter(
      (outcome) => outcome === "reconciliation_difference",
    ).length;
    expect(container.querySelectorAll("tbody tr").length).toBe(expected);
  });

  it("une ligne d'exploration se déplie et expose source, formule et preuve", () => {
    const { container } = render(
      <TaxFindingTable dataset={datasets.findings} outcomeFilter="tous" onOutcomeFilterChange={() => {}} />,
    );
    const toggle = container.querySelector('tbody button[aria-expanded="false"]')!;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const text = container.textContent ?? "";
    expect(text).toContain("Formule / normalisations");
    expect(text).toContain("Historique de revue");
  });

  it("la matrice impôt × cycle annonce la cellule focalisée dans la zone aria-live", () => {
    const bundles = buildBundles();
    const { container } = render(
      <TaxCockpitWorkspace bundles={bundles} initialScope="all" initialOutcome="tous" />,
    );
    const cells = container.querySelectorAll('section[aria-label="Matrice impôt × cycle"] [tabindex="0"]');
    expect(cells.length).toBeGreaterThan(0);
    fireEvent.focus(cells[0]);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toMatch(/contrôle/);
  });

  it("le filtre d'impôt bascule le périmètre sans recharger", () => {
    const bundles = buildBundles();
    const { container } = render(
      <TaxCockpitWorkspace bundles={bundles} initialScope="all" initialOutcome="tous" />,
    );
    const vatButton = screen.getByRole("button", { name: "TVA" });
    fireEvent.click(vatButton);
    expect(vatButton.getAttribute("aria-pressed")).toBe("true");
    const text = container.textContent ?? "";
    // Périmètre TVA : le waterfall IS annonce son absence au lieu d'inventer des zéros.
    expect(text).toContain("Aucun calcul d'impôt sur les sociétés");
  });
});

describe("états vides", () => {
  it("sans aucune pièce, le cockpit affiche « Donnée manquante » et aucun montant", () => {
    const empty = buildDemoTaxCockpitSource({ withoutDocuments: true });
    const bundles = buildBundles(empty);
    const { container } = render(
      <TaxCockpitWorkspace bundles={bundles} initialScope="all" initialOutcome="tous" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Donnée manquante");
    // Calcul IS bloqué : chaque étape du waterfall dit « non disponible », pas 0.
    expect(text).toContain("Le calcul d'impôt sur les sociétés est bloqué");
    expect(text).toContain("non disponible");
  });
});

describe("accessibilité", () => {
  it("le cockpit complet ne présente aucune violation axe-core", async () => {
    const bundles = buildBundles();
    const { container } = render(
      <TaxCockpitWorkspace bundles={bundles} initialScope="all" initialOutcome="tous" />,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} nœud(s)`),
    ).toEqual([]);
  }, 30000);
});
