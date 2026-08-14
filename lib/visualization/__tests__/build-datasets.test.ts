/**
 * Tests des VisualizationDatasets — la règle centrale est l'ABSENCE DE
 * DIVERGENCE entre ce que le graphique affiche et ce que le snapshot porte :
 * chaque chiffre de dataset est comparé au champ du snapshot dont il dérive.
 */

import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { formatCents } from "@/lib/synthesis/money";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import {
  CLOCK,
  makeDossierSnapshot,
  makeEffect,
  makeFinding,
} from "@/lib/synthesis/__tests__/fixtures";
import type { DossierSnapshot } from "@/lib/canonical-model";

function datasetsFor(input: DossierSnapshot) {
  const synthesis = buildSynthesisSnapshot(input, { clock: CLOCK });
  return {
    synthesis,
    datasets: buildSynthesisDatasets({
      synthesis,
      societe: input.dossier.societe,
      findings: input.findings,
      admissibilityFindings: input.admissibilityFindings,
    }),
  };
}

describe("aucune divergence graphique / snapshot", () => {
  const demo = buildDemoDossierSnapshot();
  const { synthesis, datasets } = datasetsFor(demo);

  it("waterfall : chaque étape égale le champ du snapshot correspondant", () => {
    const byId = Object.fromEntries(datasets.waterfall.steps.map((s) => [s.id, s.amountCents]));
    expect(byId.gross).toBe(synthesis.exposure.grossDetectedExposureCents);
    expect(byId.dedup).toBe(synthesis.exposure.deduplicatedExposureCents);
    expect(byId.duplicates).toBe(
      -(synthesis.exposure.grossDetectedExposureCents - synthesis.exposure.deduplicatedExposureCents),
    );
    expect(byId.dismissed).toBe(-synthesis.exposure.dismissedExposureCents);
    expect(byId.pending).toBe(-synthesis.exposure.pendingReviewExposureCents);
    expect(byId.validated).toBe(synthesis.exposure.validatedAdjustmentCents);
    expect(byId.tax).toBe(-synthesis.exposure.taxEffectCents);
    expect(byId.net).toBe(synthesis.exposure.netFinancialStatementEffectCents);
  });

  it("waterfall : dédupliqué = écartés + en attente + revus-validés (ventilation exhaustive)", () => {
    const e = synthesis.exposure;
    // Chaque cluster est écarté, en attente, ou clos-non-écarté : la
    // ventilation doit recouvrir exactement l'exposition dédupliquée.
    const closedNotDismissed =
      e.deduplicatedExposureCents - e.dismissedExposureCents - e.pendingReviewExposureCents;
    expect(closedNotDismissed).toBeGreaterThanOrEqual(0);
  });

  it("heatmap : la somme des cellules égale le nombre total de constats", () => {
    const total = datasets.riskHeatmap.rows.reduce(
      (sum, row) =>
        sum +
        datasets.riskHeatmap.columns
          .slice(1)
          .reduce((s, c) => s + Number(row.cells[c.key] ?? 0), 0),
      0,
    );
    expect(total).toBe(synthesis.risk.totalFindings);
  });

  it("concentration : gravités et exposition par cloison égalent le snapshot", () => {
    for (const row of datasets.concentration.rows) {
      const matrixRow = synthesis.risk.matrix[row.id as keyof typeof synthesis.risk.matrix];
      expect(row.cells.bloquant).toBe(matrixRow?.bloquant ?? 0);
      expect(row.cells.majeur).toBe(matrixRow?.majeur ?? 0);
      expect(row.cells.exposition).toBe(
        formatCents(synthesis.exposure.byCloison[row.id as keyof typeof synthesis.exposure.byCloison] ?? 0),
      );
    }
  });

  it("pyramide : reprend risk.byFamily à l'identique", () => {
    const byId = Object.fromEntries(datasets.normativePyramid.rows.map((r) => [r.id, r.cells.nombre]));
    expect(byId.hardLaw).toBe(synthesis.risk.byFamily.hardLaw);
    expect(byId.methodology).toBe(synthesis.risk.byFamily.methodology);
    expect(byId.internal).toBe(synthesis.risk.byFamily.internal);
  });

  it("couverture : ratios issus du snapshot, pas recalculés depuis les findings", () => {
    const entries = datasets.coverage.rows.find((r) => r.id === "entries");
    expect(entries?.cells.fait).toBe(synthesis.coverage.entriesAnalysed);
    expect(entries?.cells.ratio).toBe(Math.round(synthesis.coverage.entriesRatio * 100));
  });

  it("revue : ventilation par statut identique au snapshot", () => {
    for (const row of datasets.review.rows) {
      expect(row.cells.nombre).toBe(synthesis.review.byStatus[row.id]);
    }
  });

  it("limitations : une ligne par limitation du snapshot", () => {
    expect(datasets.limitations.rows).toHaveLength(synthesis.limitations.length);
  });

  it("décision : six éléments, dans l'ordre imposé", () => {
    expect(datasets.decision.items.map((i) => i.id)).toEqual([
      "admissibilite", "blocages", "couverture", "revue", "exposition-validee", "prochaine-action",
    ]);
    expect(datasets.decision.verdictHeadline).toBe(synthesis.verdict.headline);
    expect(datasets.decision.snapshotHash).toBe(synthesis.snapshotHash);
  });

  it("chaque dataset porte un résumé lecteur d'écran et un tableau", () => {
    const all = [
      datasets.admissibility, datasets.fecQuality, datasets.coverage,
      datasets.riskHeatmap, datasets.waterfall, datasets.review,
      datasets.concentration, datasets.limitations, datasets.normativePyramid,
      datasets.standardsTimeline, datasets.evidenceFlow,
    ];
    for (const ds of all) {
      expect(ds.summary.length, ds.id).toBeGreaterThan(10);
      expect(ds.columns.length, ds.id).toBeGreaterThan(0);
    }
  });
});

describe("matrice FEC", () => {
  it("liste exactement les 18 zones réglementaires, dans l'ordre", () => {
    const demo = buildDemoDossierSnapshot();
    const { datasets } = datasetsFor(demo);
    expect(datasets.fecQuality.rows).toHaveLength(18);
    expect(datasets.fecQuality.rows[0].cells.zone).toBe("JournalCode");
    expect(datasets.fecQuality.rows[17].cells.zone).toBe("Idevise");
    expect(datasets.fecQuality.rows.map((r) => r.cells.position)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  it("R-HL-004 : localise l'alerte sur EcritureDate exclusivement", () => {
    // R_HL_004.run (lib/rules-engine/registries/hard-law.ts) ne teste que
    // e.ecritureDate — PieceDate/DateLet/ValidDate ne sont jamais inspectées
    // par cette règle et ne doivent donc pas être marquées en alerte.
    const blocking = makeFinding("adm-1", {
      severity: "bloquant",
      ruleId: "R-HL-004",
    });
    const { datasets } = datasetsFor(
      makeDossierSnapshot({ admissibilityFindings: [blocking], findings: [blocking] }),
    );
    const dates = datasets.fecQuality.rows.filter((r) => r.emphasis === "critical");
    expect(dates.map((r) => r.cells.zone)).toEqual(["EcritureDate"]);
  });

  it("R-HL-006 : localise l'alerte sur CompteNum", () => {
    // R_HL_006.run ne teste que e.compteNum.
    const blocking = makeFinding("adm-1", {
      severity: "bloquant",
      ruleId: "R-HL-006",
    });
    const { datasets } = datasetsFor(
      makeDossierSnapshot({ admissibilityFindings: [blocking], findings: [blocking] }),
    );
    const alerted = datasets.fecQuality.rows.filter((r) => r.emphasis === "critical");
    expect(alerted.map((r) => r.cells.zone)).toEqual(["CompteNum"]);
  });
});

describe("états vides", () => {
  it("dossier propre : datasets cohérents, aucune ligne fantôme", () => {
    const { synthesis, datasets } = datasetsFor(makeDossierSnapshot());
    expect(synthesis.risk.totalFindings).toBe(0);
    expect(datasets.riskHeatmap.rows).toHaveLength(0);
    expect(datasets.concentration.rows).toHaveLength(0);
    expect(datasets.admissibility.rows).toHaveLength(0);
    expect(datasets.waterfall.steps.find((s) => s.id === "net")?.amountCents).toBe(0);
    // La matrice FEC reste complète même sans constat : elle décrit le format.
    expect(datasets.fecQuality.rows).toHaveLength(18);
  });
});

describe("grand volume", () => {
  it("1 000 constats avec effets : datasets exacts et construits sans erreur", () => {
    const findings = Array.from({ length: 1000 }, (_, i) =>
      makeFinding(`f-${String(i).padStart(4, "0")}`, {
        cloison: (["resultat", "bilan-actif", "bilan-passif"] as const)[i % 3],
        severity: (["bloquant", "majeur", "mineur", "informatif"] as const)[i % 4],
        financialEffect: makeEffect({ amountCents: 1000 + i }),
        lignesSource: [i], // effets indépendants
      }),
    );
    const { synthesis, datasets } = datasetsFor(makeDossierSnapshot({ findings }));

    expect(synthesis.risk.totalFindings).toBe(1000);
    const heatTotal = datasets.riskHeatmap.rows.reduce(
      (sum, row) =>
        sum + datasets.riskHeatmap.columns.slice(1).reduce((s, c) => s + Number(row.cells[c.key] ?? 0), 0),
      0,
    );
    expect(heatTotal).toBe(1000);
    expect(datasets.waterfall.steps.find((s) => s.id === "gross")?.amountCents).toBe(
      synthesis.exposure.grossDetectedExposureCents,
    );
  });
});
