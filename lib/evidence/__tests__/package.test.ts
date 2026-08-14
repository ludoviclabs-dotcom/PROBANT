import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { appendReviewDecisionToSnapshot } from "@/lib/dossier/snapshot-state";
import { buildSynthesisSnapshot } from "@/lib/synthesis";
import { buildCsv } from "../csv";
import { buildEvidenceExportPackage, verifyEvidenceExportPackage } from "../package";

const CLOCK = () => "2026-08-14T12:00:00.000Z";

function synthesis(snapshot: ReturnType<typeof buildDemoDossierSnapshot>) {
  return buildSynthesisSnapshot(snapshot, { clock: CLOCK });
}

describe("evidence export package", () => {
  it("produit des exports stables, complets et un PDF standard lisible", async () => {
    const snapshot = buildDemoDossierSnapshot();
    const options = {
      applicationVersion: "0.1.0-test",
      activeContext: { organizationId: "demo", dossierId: snapshot.dossier.id },
    };
    const first = await buildEvidenceExportPackage(snapshot, synthesis(snapshot), options);
    const second = await buildEvidenceExportPackage(snapshot, synthesis(snapshot), options);

    expect(first.manifestJson).toBe(second.manifestJson);
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.csv).toEqual(second.csv);
    expect([...first.pdf]).toEqual([...second.pdf]);
    expect(first.manifest.artifacts.map((artifact) => artifact.format)).toEqual([
      "canonical_json",
      "findings_csv",
      "review_events_csv",
      "controls_csv",
      "sources_csv",
      "accessible_html",
      "pdf",
    ]);
    expect(first.manifest.sourceDocuments.every((source) => /^[0-9a-f]{64}$/u.test(source.sha256))).toBe(true);
    expect(first.manifest.artifacts.every((artifact) => /^[0-9a-f]{64}$/u.test(artifact.sha256))).toBe(true);
    expect(verifyEvidenceExportPackage(first)).toEqual([]);
    expect(new TextDecoder("latin1").decode(first.pdf.slice(0, 8))).toMatch(/^%PDF-/u);
    expect((await PDFDocument.load(first.pdf)).getPageCount()).toBeGreaterThan(0);
    expect(first.manifest.artifacts.find((artifact) => artifact.format === "pdf")?.validation?.pdfA.status).toBe("not_validated");
    expect(first.html).toContain('<html lang="fr">');
    expect(first.html).toContain("@media print");
    expect(first.html).toContain("<caption>");
    expect(buildCsv(["comment"], [{ comment: "=HYPERLINK(\"https://invalid\")" }]))
      .toContain("'=HYPERLINK");
  });

  it("une nouvelle décision produit un nouveau snapshot et de nouveaux exports", async () => {
    const before = buildDemoDossierSnapshot();
    const finding = before.findings[0];
    const after = appendReviewDecisionToSnapshot(before, {
      id: "review-export-1",
      findingId: finding.id,
      actorId: "reviewer-1",
      actorRole: "reviewer",
      newStatus: "confirmed",
      comment: "Confirmé sur pièce",
      relatedEvidenceIds: [before.sourceDocuments[0].id],
      createdAt: "2026-08-14T11:00:00.000Z",
    });
    const beforeSynthesis = synthesis(before);
    const afterSynthesis = synthesis(after);
    const beforePack = await buildEvidenceExportPackage(before, beforeSynthesis, {
      applicationVersion: "test",
      activeContext: { organizationId: "demo", dossierId: before.dossier.id },
    });
    const afterPack = await buildEvidenceExportPackage(after, afterSynthesis, {
      applicationVersion: "test",
      activeContext: { organizationId: "demo", dossierId: after.dossier.id },
    });
    expect(afterSynthesis.snapshotHash).not.toBe(beforeSynthesis.snapshotHash);
    expect(afterPack.canonicalJson).not.toBe(beforePack.canonicalJson);
    expect(afterPack.csv.reviewEvents).toContain("review-export-1");
  });

  it("affiche une preuve manquante comme limitation", async () => {
    const base = buildDemoDossierSnapshot();
    const snapshot = {
      ...base,
      findings: base.findings.map((finding, index) => index === 0 ? { ...finding, preuve: [] } : finding),
    };
    const pack = await buildEvidenceExportPackage(snapshot, buildSynthesisSnapshot(snapshot, { clock: CLOCK }), {
      applicationVersion: "test",
      activeContext: { organizationId: "demo", dossierId: snapshot.dossier.id },
    });
    expect(pack.manifest.limitations.some((limitation) =>
      limitation.code === "missing_evidence" && limitation.subjects.includes(snapshot.findings[0].id),
    )).toBe(true);
  });

  it("refuse d'exporter DEMO lorsqu'un autre dossier est actif", async () => {
    const snapshot = buildDemoDossierSnapshot();
    await expect(buildEvidenceExportPackage(snapshot, synthesis(snapshot), {
      applicationVersion: "test",
      activeContext: { organizationId: "org-real", dossierId: "dossier-real" },
    })).rejects.toThrow(/ACTIVE_DOSSIER_MISMATCH/u);
  });
});
