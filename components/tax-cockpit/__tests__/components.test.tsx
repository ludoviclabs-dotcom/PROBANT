// @vitest-environment jsdom
/**
 * Tests des composants du cockpit fiscalité — charte « instruments ».
 *
 * Même discipline que la Synthèse : les datasets viennent du VRAI pipeline
 * (moteurs TAX-05/06/07 exécutés sur le dossier de démonstration), et les
 * assertions comparent le rendu au dataset — jamais à des valeurs recopiées.
 * Les libellés des moteurs passent par la projection d'affichage (accents) :
 * le rendu est comparé à cette projection, le dataset garde le texte du moteur.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";

// `next/font/google` est résolu à la compilation par Next : on le neutralise en test.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Instrument_Serif: font, IBM_Plex_Sans: font, IBM_Plex_Mono: font, Geist: font, Newsreader: font };
});

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "@/lib/tax/demo";
import {
  buildOutcomeFilters,
  buildRibbon,
  buildTaxCockpitDatasets,
  buildVerdictHeadline,
  displayControlTitle,
  displayReconciliationLineLabel,
  displayWaterfallStepLabel,
  TAX_COCKPIT_SCOPES,
  TAX_OUTCOME_LABEL,
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

/** Ligne d'exploration identifiée par l'id de son dataset (jamais par un fragment de texte). */
function rowById(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!;
}

const explorationRows = (container: HTMLElement) => container.querySelectorAll('[role="row"][data-row-id]');

const controlRowId = (controlId: string) =>
  Object.entries(datasets.findings.details).find(([, detail]) => detail.controlId === controlId)![0];
const accountedChargeRowId = datasets.findings.rows.find((row) =>
  row.id.startsWith("corporate-tax-line:") && datasets.findings.outcomeByRowId[row.id] === "reconciliation_difference",
)!.id;

describe("rendu : les chiffres affichés sont ceux du snapshot", () => {
  it("l'acte I rend la phrase de synthèse et le ruban issus du dataset", () => {
    const { container } = renderWorkspace();
    const text = container.textContent ?? "";
    expect(text).toContain(buildVerdictHeadline(datasets));
    expect(screen.getByRole("heading", { level: 2, name: buildVerdictHeadline(datasets) })).toBeTruthy();
    for (const metric of buildRibbon(datasets)) {
      expect(text).toContain(metric.label);
      expect(text).toContain(metric.value);
    }
  });

  it("le waterfall affiche chaque étape du moteur avec son montant", () => {
    const { container } = renderWorkspace();
    const text = container.textContent ?? "";
    for (const step of datasets.waterfall.steps) expect(text).toContain(displayWaterfallStepLabel(step.id, step.label));
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
    expect(explorationRows(container).length).toBe(Math.min(100, datasets.findings.rows.length));
  });

  it("l'état de statut d'attention n'apparaît qu'une fois dans la barre de contexte", () => {
    const { container } = renderWorkspace();
    const occurrences = (container.textContent ?? "").split(datasets.summary.headlineLabel).length - 1;
    // Une fois dans la barre ; les autres occurrences viennent des strates et des libellés de sortie par ligne/cellule.
    const bars = container.querySelectorAll("[data-tax-context]");
    expect(bars.length).toBe(1);
    expect(bars[0].textContent).toContain(datasets.summary.headlineLabel);
    expect(occurrences).toBeGreaterThan(0);
  });

  it("le fil d'avancement est rendu une seule fois, quelle que soit la largeur", () => {
    renderWorkspace();
    const steppers = screen.getAllByRole("list", { name: "Étapes de la revue fiscale" });
    expect(steppers).toHaveLength(1);
    expect(within(steppers[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Données — franchie",
      "Contrôles — franchie",
      "Analyse — en cours",
      "Décision — à venir",
    ]);
  });

  it("la chaîne de preuve est une liste de trois strates, statut d'attention dit en mots", () => {
    renderWorkspace();
    const figure = screen.getByRole("figure", { name: "La chaîne de preuve" });
    const strata = within(figure).getAllByRole("listitem");
    expect(strata).toHaveLength(3);
    expect(strata[0].textContent).toContain("Déclarations");
    expect(strata[0].textContent).toContain("2065, CA3, avis de CFE");
    expect(strata[1].textContent).toContain("Liasse fiscale 2050-2059");
    expect(strata[1].textContent).toContain("dont 2058-A");
    expect(strata[2].textContent).toContain("FEC & grand-livre");
    expect(strata[0].textContent).toContain(datasets.summary.headlineLabel);
    // Plus aucune scène 3D : ni perspective ni plaques animées.
    expect(figure.querySelector("[style*='perspective']")).toBeNull();
  });

  it("les libellés des moteurs s'affichent accentués ; la méthode garde le texte du moteur", () => {
    const { container } = renderWorkspace();
    const charge = datasets.corporateReconciliation.bars.find((bar) => bar.lineKey === "accounted_tax_charge")!;
    const shown = displayReconciliationLineLabel(charge.lineKey, charge.label);
    expect(shown).not.toBe(charge.label);
    expect(container.textContent).toContain(shown);
    const accounting = datasets.waterfall.steps.find((step) => step.id === "accounting_result")!;
    expect(screen.queryByText(accounting.label, { exact: true })).toBeNull();
    // Le tableau de données de la méthode rend le dataset tel quel (texte du moteur, traçable à l'export).
    fireEvent.click(screen.getByRole("button", { name: `Sources et méthodologie : ${datasets.waterfall.title}` }));
    expect(screen.getAllByText(accounting.label, { exact: true }).length).toBeGreaterThan(0);
  });

  it("une donnée attendue montre la phrase humaine d'abord, le code en petit", () => {
    renderWorkspace();
    const callouts = screen.getAllByRole("list", { name: datasets.requiredDocuments.title });
    const text = callouts.map((list) => list.textContent ?? "").join(" ");
    expect(text).toContain("Documenter et confirmer le taux et la nature de la détention du capital");
    expect(text).toContain("profile:ownershipStatus");
    expect(text).not.toContain("ownershipStatus (profile)");
    expect(text).toContain("Une condition du taux réduit n'est pas renseignée");
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
    expect(screen.getByRole("heading", { name: "Écarts relevés" })).toBeTruthy();
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
    expect(explorationRows(container).length).toBe(expected);
  });

  it("chaque filtre affiche le dénombrement de la projection et le dit en description", () => {
    const { container } = renderWorkspace();
    const filters = buildOutcomeFilters(datasets.findings);
    const all = screen.getByRole("button", { name: "Toutes" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById(all.getAttribute("aria-describedby")!)?.textContent).toBe(`${filters.total} lignes`);
    for (const option of filters.options) {
      const button = screen.getByRole("button", { name: option.label });
      expect(button.textContent).toContain(`${option.label}${option.count}`);
      const description = document.getElementById(button.getAttribute("aria-describedby")!);
      expect(description?.textContent).toBe(`${option.count} ligne${option.count > 1 ? "s" : ""}`);
      fireEvent.click(button);
      expect(explorationRows(container).length).toBe(Math.min(100, option.count));
    }
    expect(container.textContent).toContain(`${filters.reconciliationLines} réconciliations`);
  });

  it("le registre impôt × cycle rend une ligne par croisement avec sa sortie prioritaire et sa décomposition", () => {
    const { container } = renderWorkspace();
    const rows = container.querySelectorAll("[data-matrix-cell]");
    expect(rows.length).toBe(datasets.riskMatrix.cells.length);
    datasets.riskMatrix.cells.forEach((cell, index) => {
      const text = rows[index].textContent ?? "";
      expect(text).toContain(cell.cycle);
      expect(text).toContain(String(cell.controlCount));
      if (cell.worstOutcomeLabel) expect(text).toContain(cell.worstOutcomeLabel);
      for (const entry of cell.outcomeBreakdown) expect(text).toContain(`${entry.count} ${entry.label.toLowerCase()}`);
    });
    expect(container.textContent).toContain("Tous cycles");
  });

  it("une ligne ouvre le tiroir de détail (formule, preuve), Échap le referme", () => {
    renderWorkspace();
    const row = rowById(controlRowId("VAT.NET"));
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Formule / normalisations")).toBeTruthy();
    expect(within(dialog).getByText("Historique de revue")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Fermer le détail" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le tiroir titre la ligne avec le libellé accentué et dit la sortie en mot", () => {
    renderWorkspace();
    fireEvent.click(rowById(controlRowId("VAT.PIECE.MISSING")));
    const dialog = screen.getByRole("dialog");
    const title = displayControlTitle("VAT.PIECE.MISSING", "Piece absente");
    expect(title).toBe("Pièce absente");
    expect(within(dialog).getByRole("heading", { name: title })).toBeTruthy();
    expect(dialog.textContent).toContain(TAX_OUTCOME_LABEL.inconclusive);
    expect(dialog.getAttribute("aria-label")).toBe(`Détail du contrôle : ${title}`);
  });

  it("le tiroir d'une ligne de rapprochement désactive les décisions et le dit", () => {
    renderWorkspace();
    const row = rowById(accountedChargeRowId);
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
    fireEvent.click(within(exports).getByRole("button", { name: "Exporter" }));
    for (const name of ["Exporter JSON fiscaux", "Exporter CSV fiscaux", "Note HTML", "Note PDF", "Manifeste", "Vérifier"]) {
      expect(within(exports).getByRole("button", { name })).toBeTruthy();
    }
    expect(exports.textContent).toContain("Aucun avis juridique");
    expect(exports.textContent).toContain("PDF/A non validé");
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
    fireEvent.click(rowById(controlRowId("VAT.NET")));
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} nœud(s)`),
    ).toEqual([]);
  }, 30000);
});
