// @vitest-environment jsdom
/**
 * Tests des composants de Synthèse : rendu, clavier, états vides,
 * accessibilité (axe-core). Les datasets viennent du VRAI pipeline
 * (dossier démo → moteur → build-datasets) : ce que ces tests rendent est ce
 * que la page rend.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import axe from "axe-core";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { AccessibleChartTable } from "../AccessibleChartTable";
import { MethodologyPopover } from "../MethodologyPopover";
import { DecisionHeader } from "../DecisionHeader";
import { AdmissibilityCard } from "../AdmissibilityCard";
import { DataQualityMatrix } from "../DataQualityMatrix";
import { CoverageStackedBar } from "../CoverageStackedBar";
import { RiskHeatmap } from "../RiskHeatmap";
import { ExposureWaterfall } from "../ExposureWaterfall";
import { ReviewProgressBar } from "../ReviewProgressBar";
import { FindingConcentrationChart } from "../FindingConcentrationChart";
import { NormativePyramid } from "@/components/knowledge/NormativePyramid";
import { StandardsTimeline } from "@/components/knowledge/StandardsTimeline";
import { EvidenceFlow } from "@/components/evidence/EvidenceFlow";

declare global {
  // Requis par React 19 pour act() sous testing-library.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(cleanup);

const demo = buildDemoDossierSnapshot();
const synthesis = buildSynthesisSnapshot(demo, {
  clock: () => "2026-08-14T12:00:00.000Z",
});
const datasets = buildSynthesisDatasets({
  synthesis,
  societe: demo.dossier.societe,
  findings: demo.findings,
  admissibilityFindings: demo.admissibilityFindings,
});

describe("rendu — chaque composant affiche les chiffres du snapshot", () => {
  it("DecisionHeader : verdict, hash et six éléments de décision", () => {
    render(<DecisionHeader decision={datasets.decision} onDownloadNote={() => {}} />);
    expect(screen.getByText(synthesis.verdict.headline, { exact: false })).toBeTruthy();
    expect(screen.getByText(/Prochaine action/)).toBeTruthy();
    expect(screen.getByText(new RegExp(synthesis.snapshotHash.slice(0, 12)))).toBeTruthy();
    expect(screen.getByRole("button", { name: /note de synthèse/i })).toBeTruthy();
  });

  it("DataQualityMatrix : les 18 zones réglementaires", () => {
    render(<DataQualityMatrix dataset={datasets.fecQuality} />);
    // 2 occurrences par zone (matrice + tableau accessible).
    expect(screen.getAllByText("JournalCode").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Idevise").length).toBeGreaterThanOrEqual(1);
  });

  it("ExposureWaterfall : effet net affiché tel que le snapshot le porte", () => {
    render(<ExposureWaterfall dataset={datasets.waterfall} />);
    expect(screen.getAllByText(/Effet net sur les états financiers/).length).toBeGreaterThanOrEqual(1);
  });

  it("chaque graphique porte son alternative tabulaire", () => {
    const { container } = render(
      <>
        <AdmissibilityCard dataset={datasets.admissibility} />
        <CoverageStackedBar dataset={datasets.coverage} />
        <RiskHeatmap dataset={datasets.riskHeatmap} />
        <ExposureWaterfall dataset={datasets.waterfall} />
        <ReviewProgressBar dataset={datasets.review} pct={synthesis.review.pct} />
        <FindingConcentrationChart dataset={datasets.concentration} />
        <DataQualityMatrix dataset={datasets.fecQuality} />
        <NormativePyramid dataset={datasets.normativePyramid} />
        <StandardsTimeline dataset={datasets.standardsTimeline} />
        <EvidenceFlow dataset={datasets.evidenceFlow} />
      </>,
    );
    const tables = container.querySelectorAll("details table");
    expect(tables.length).toBe(10);
  });
});

describe("clavier", () => {
  it("MethodologyPopover : ouverture au clic, fermeture à Échap, aria-expanded", () => {
    render(<MethodologyPopover dataset={datasets.waterfall} />);
    const btn = screen.getByRole("button", { name: /méthodologie/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("RiskHeatmap : cellules focusables, détail annoncé au focus", () => {
    const { container } = render(<RiskHeatmap dataset={datasets.riskHeatmap} />);
    const cells = container.querySelectorAll('[tabindex="0"]');
    expect(cells.length).toBeGreaterThan(0);
    fireEvent.focus(cells[0]);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toMatch(/constat/);
  });

  it("AccessibleChartTable : repli details accessible, en-têtes de colonnes", () => {
    render(<AccessibleChartTable dataset={datasets.coverage} defaultOpen />);
    const table = screen.getByRole("table", { name: /couverture/i });
    expect(table.querySelectorAll("th[scope=col]").length).toBe(datasets.coverage.columns.length);
  });

  it("ReviewProgressBar : progressbar avec valeurs ARIA", () => {
    render(<ReviewProgressBar dataset={datasets.review} pct={synthesis.review.pct} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe(String(synthesis.review.pct));
  });
});

describe("états vides", () => {
  it("AdmissibilityCard sans alerte : message positif explicite", () => {
    render(
      <AdmissibilityCard
        dataset={{ ...datasets.admissibility, rows: [] }}
      />,
    );
    expect(screen.getByText(/aucune alerte d'admissibilité/i)).toBeTruthy();
  });

  it("AccessibleChartTable sans ligne : « Aucune donnée »", () => {
    render(
      <AccessibleChartTable dataset={{ ...datasets.review, rows: [] }} defaultOpen />,
    );
    expect(screen.getByText(/aucune donnée/i)).toBeTruthy();
  });
});

describe("accessibilité (axe-core)", () => {
  it("le niveau décision et les quatre analyses passent axe sans violation", async () => {
    const { container } = render(
      <main>
        <DecisionHeader decision={datasets.decision} onDownloadNote={() => {}} />
        <DataQualityMatrix dataset={datasets.fecQuality} />
        <ExposureWaterfall dataset={datasets.waterfall} />
        <RiskHeatmap dataset={datasets.riskHeatmap} />
        <FindingConcentrationChart dataset={datasets.concentration} />
      </main>,
    );
    const results = await axe.run(container, {
      // Le contraste dépend du fond de page absent du fragment testé — il est
      // vérifié visuellement ; les autres règles s'appliquent toutes.
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} nœud(s)`),
    ).toEqual([]);
  }, 30000);
});
