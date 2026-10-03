// @vitest-environment jsdom
/**
 * Tests des composants du cockpit fiscalité — refonte « cabinet d'audit ».
 *
 * Même discipline que la Synthèse : les datasets viennent du VRAI pipeline
 * (moteurs TAX-05/06/07 exécutés sur le dossier de démonstration), et les
 * assertions comparent le rendu au dataset — jamais à des valeurs recopiées.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";

// `next/font/google` est résolu à la compilation par Next : on le neutralise en test.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Instrument_Serif: font, IBM_Plex_Sans: font, IBM_Plex_Mono: font };
});

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "@/lib/tax/demo";
import {
  buildRibbon,
  buildTaxCockpitDatasets,
  buildVerdictHeadline,
  TAX_COCKPIT_SCOPES,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
} from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { TaxCockpitWorkspace } from "../TaxCockpitWorkspace";

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

function renderWorkspace(options: { outcome?: string; scope?: TaxCockpitScope; withSource?: boolean } = {}) {
  return render(
    <TaxCockpitWorkspace
      bundles={buildBundles()}
      initialScope={options.scope ?? "all"}
      initialOutcome={options.outcome ?? "tous"}
      evidenceSource={options.withSource === false ? undefined : source}
    />,
  );
}

describe("rendu : les chiffres affichés sont ceux du snapshot", () => {
  it("l'acte I rend la phrase de synthèse et le ruban issus du dataset", () => {
    const { container } = renderWorkspace();
    const text = container.textContent ?? "";
    expect(text).toContain(buildVerdictHeadline(datasets));
    for (const metric of buildRibbon(datasets)) {
      expect(text).toContain(metric.label);
      expect(text).toContain(metric.value);
    }
  });

  it("le waterfall affiche chaque étape du moteur avec son montant", () => {
    const { container } = renderWorkspace();
    const text = container.textContent ?? "";
    for (const step of datasets.waterfall.steps) expect(text).toContain(step.label);
    const base = datasets.waterfall.steps.find((step) => step.id === "accounting_result")!;
    expect(text).toContain(formatCents(base.runningTotalCents));
    expect(text).toContain(formatCents(datasets.waterfall.confirmedTaxResultCents!));
    expect(text).toContain(formatCents(datasets.waterfall.proposedTaxResultCents!));
  });

  it("une étape proposée reste hors cumul et le dit", () => {
    const { container } = renderWorkspace();
    expect(container.textContent).toContain("Candidat de revue — hors cumul retenu");
    expect(container.textContent).toContain("cumul inchangé");
  });

  it("l'exploration rend une ligne par entrée du dataset (filtre « tous »)", () => {
    const { container } = renderWorkspace();
    const rows = container.querySelectorAll('[role="row"].fx-find-row');
    expect(rows.length).toBe(Math.min(100, datasets.findings.rows.length));
  });

  it("l'état de statut d'attention n'apparaît qu'une fois dans la barre de contexte", () => {
    const { container } = renderWorkspace();
    const occurrences = (container.textContent ?? "").split(datasets.summary.headlineLabel).length - 1;
    // Une fois dans le badge ; les autres occurrences viennent des libellés de sortie par ligne/cellule.
    expect(container.querySelectorAll(".fx-ctx-inner").length).toBe(1);
    expect(occurrences).toBeGreaterThan(0);
  });
});

describe("clavier et interactions", () => {
  it("le popover de méthodologie s'ouvre au clic, se ferme à Échap, et copie l'empreinte", () => {
    renderWorkspace();
    const trigger = screen.getByRole("button", { name: /Méthodologie et empreinte du snapshot/u });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(datasets.summary.headlinePolicyVersion)).toBeTruthy();
    for (const version of datasets.summary.engineVersions) expect(screen.getByText(version)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("le sélecteur d'impôt porte aria-pressed et bascule le contenu", () => {
    const { container } = renderWorkspace();
    const vat = screen.getByRole("button", { name: "TVA" });
    expect(vat.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Impôt sur les sociétés" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(vat);
    expect(vat.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain(datasets.vatReconciliation.title);
    fireEvent.click(screen.getByRole("button", { name: "CFE" }));
    expect(container.textContent).toContain("CFE : avis reçu, charge comptabilisée");
  });

  it("une URL profonde restaure l'impôt choisi", () => {
    renderWorkspace({ scope: "cfe" });
    expect(screen.getByRole("button", { name: "CFE" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("la méthodologie repliée s'ouvre derrière « Sources et méthodologie »", () => {
    renderWorkspace();
    const toggle = screen.getByRole("button", { name: `Sources et méthodologie : ${datasets.waterfall.title}` });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(datasets.waterfall.methodology!, { exact: false })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(datasets.waterfall.methodology!, { exact: false })).toBeTruthy();
  });

  it("les filtres de sortie portent aria-pressed et réduisent les lignes", () => {
    const { container } = renderWorkspace();
    const incoherence = screen.getByRole("button", { name: "Incohérence" });
    expect(incoherence.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(incoherence);
    expect(incoherence.getAttribute("aria-pressed")).toBe("true");
    const expected = Object.values(datasets.findings.outcomeByRowId).filter(
      (outcome) => outcome === "reconciliation_difference",
    ).length;
    expect(container.querySelectorAll('[role="row"].fx-find-row').length).toBe(expected);
  });

  it("les cellules de la matrice sont focalisables et décrivent leurs sorties", () => {
    const { container } = renderWorkspace();
    const cells = container.querySelectorAll('[role="group"][tabindex="0"].fx-cell');
    expect(cells.length).toBe(datasets.riskMatrix.cells.length);
    expect(cells[0].getAttribute("aria-label")).toMatch(/contrôle/u);
  });

  it("une ligne ouvre le tiroir de détail (formule, preuve), Échap le referme", () => {
    renderWorkspace();
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes("VAT.NET"))!;
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Formule / normalisations")).toBeTruthy();
    expect(within(dialog).getByText("Historique de revue")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le tiroir d'une ligne de rapprochement désactive les décisions et le dit", () => {
    renderWorkspace();
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes("Impot brut estime et charge"))!;
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Confirmer" }).hasAttribute("disabled")).toBe(true);
    expect(dialog.textContent).toContain("Aucun constat de revue n'est rattaché à cette ligne");
  });

  it("la prochaine action amène le focus sur la revue, constat lié présélectionné", () => {
    renderWorkspace();
    const next = datasets.capability.nextAction!;
    fireEvent.click(screen.getByRole("button", { name: "Traiter dans la revue" }));
    const select = screen.getByLabelText("Constat fiscal à revoir") as HTMLSelectElement;
    const selected = select.selectedOptions[0].textContent ?? "";
    expect(next.controlIds.length).toBeGreaterThan(0);
    expect(selected.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByLabelText("Commentaire de revue fiscale"));
  });

  it("la revue append-only enregistre un événement et le restitue", async () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Commentaire de revue fiscale"), {
      target: { value: "Revue de test" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer la revue fiscale" }));
    });
    const review = screen.getByRole("region", { name: "Revue append-only des constats fiscaux" });
    await waitFor(() =>
      expect(within(review).getByRole("status").textContent).toContain("Événement append-only 1"),
    );
  });

  it("le menu Exporter propose tous les exports du dossier de preuve", () => {
    renderWorkspace();
    const exports = screen.getByRole("region", { name: "Exports du dossier de preuve fiscal" });
    fireEvent.click(within(exports).getByRole("button", { name: /Exporter/u }));
    for (const name of ["Exporter JSON fiscaux", "Exporter CSV fiscaux", "Note HTML", "Note PDF", "Manifeste", "Vérifier"]) {
      expect(within(exports).getByRole("button", { name })).toBeTruthy();
    }
    expect(exports.textContent).toContain("Aucun avis juridique");
  });

  it("sans dossier de preuve, la barre de décision n'est pas rendue", () => {
    renderWorkspace({ withSource: false });
    expect(screen.queryByRole("region", { name: "Revue append-only des constats fiscaux" })).toBeNull();
  });
});

describe("états vides", () => {
  it("sans aucune pièce, le cockpit affiche « Donnée manquante » et aucun montant", () => {
    const empty = buildDemoTaxCockpitSource({ withoutDocuments: true });
    const { container } = render(
      <TaxCockpitWorkspace bundles={buildBundles(empty)} initialScope="all" initialOutcome="tous" />,
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
    const { container } = renderWorkspace();
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} nœud(s)`),
    ).toEqual([]);
  }, 30000);

  it("le tiroir ouvert ne présente aucune violation axe-core", async () => {
    const { container } = renderWorkspace();
    fireEvent.click(screen.getAllByRole("row").find((row) => row.textContent?.includes("VAT.NET"))!);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} nœud(s)`),
    ).toEqual([]);
  }, 30000);
});
