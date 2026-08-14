
import { describe, expect, it } from "vitest";
import { allFindings } from "@/lib/canonical-model";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { buildDemoDossierSnapshot, buildSnapshotFromFecDepot } from "../snapshot-builder";
import { computeLegacyExposureIndex, LEGACY_EXPOSURE_WEIGHTS } from "../legacy-exposure-policy";
import { calculateReviewProgress } from "../review";

describe("dossier snapshot", () => {
  it("builds a demo snapshot without losing findings", () => {
    const snapshot = buildDemoDossierSnapshot();
    expect(snapshot.dossier.id).toBe(DEMO_DOSSIER.id);
    expect(snapshot.findings).toHaveLength(allFindings(DEMO_DOSSIER).length);
    expect(snapshot.sourceKind).toBe("demo");
    expect(snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("builds a session snapshot from a FEC depot response", () => {
    const snapshot = buildSnapshotFromFecDepot({
      nomFichier: "123456789FEC20261231.txt",
      fingerprint: "abc123",
      siren: "123456789",
      referentielVersion: "2026-07-28",
      admissibilite: [],
      analyse: [],
      entries: [],
      entriesTruncated: false,
      totalEntryCount: 42,
      generatedAt: "2026-07-28T12:00:00.000Z",
    });
    expect(snapshot.dossier.demoMode).toBe(false);
    expect(snapshot.dossier.fecFingerprint).toBe("abc123");
    expect(snapshot.calculationContext.entriesTotal).toBe(42);
  });

  it("documents the review numerator and denominator", () => {
    const progress = calculateReviewProgress([
      "en_attente",
      "en_attente",
      "valide",
      "ecarte",
      "corrige",
    ]);
    expect(progress).toMatchObject({
      numerator: 3,
      denominator: 5,
      pct: 60,
    });
    expect(progress.includedStatuses).toEqual([
      "confirmed",
      "dismissed",
      "corrected",
      "superseded",
    ]);
    expect(progress.excludedStatuses).toEqual([
      "pending",
      "needs_evidence",
    ]);
  });

  it("keeps the historical exposure formula unchanged", () => {
    const findings = buildDemoDossierSnapshot().findings;
    const weighted = findings.reduce(
      (sum, finding) => sum + LEGACY_EXPOSURE_WEIGHTS[finding.severity],
      0,
    );
    expect(computeLegacyExposureIndex(findings)).toBe(
      Math.round((100 * weighted) / (weighted + 52)),
    );
  });
});
