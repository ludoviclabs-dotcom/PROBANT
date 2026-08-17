import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getDemoTaxCockpitSource } from "@/lib/tax/demo";
import {
  appendTaxReviewEvent,
  buildTaxEvidenceExportPackage,
  buildTaxEvidenceFindings,
  projectFiscalSynthesisWithTaxReview,
  verifyTaxEvidenceExportPackage,
} from "@/lib/evidence";

const source = getDemoTaxCockpitSource();
const options = {
  applicationVersion: "0.1.0-test",
  activeContext: {
    organizationId: source.organizationId,
    dossierId: source.dossierId,
  },
};

describe("TAX-09 — paquet de preuve fiscal", () => {
  it("produit neuf artefacts déterministes avec des hashes stables", async () => {
    const first = await buildTaxEvidenceExportPackage({ source }, options);
    const second = await buildTaxEvidenceExportPackage({ source }, options);

    expect(first.manifestJson).toBe(second.manifestJson);
    expect(first.taxProfileJson).toBe(second.taxProfileJson);
    expect(first.taxComputationJson).toBe(second.taxComputationJson);
    expect(first.csv).toEqual(second.csv);
    expect([...first.pdf]).toEqual([...second.pdf]);
    expect(first.manifest.artifacts.map((artifact) => artifact.fileName)).toEqual([
      "tax-profile.json",
      "tax-computation.json",
      "tax-reconciliation-lines.csv",
      "tax-findings.csv",
      "tax-controls.csv",
      "tax-sources.csv",
      "tax-review-events.csv",
      "fiscal-note.html",
      "fiscal-note.pdf",
    ]);
    expect(first.manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/u.test(artifact.sha256))).toBe(true);
    expect(verifyTaxEvidenceExportPackage(first)).toEqual([]);
    expect((await PDFDocument.load(first.pdf)).getPageCount()).toBeGreaterThan(0);
    expect(first.manifest.artifacts.at(-1)?.validation?.pdfA.status).toBe("not_validated");
  });

  it("exporte chaque maillon de preuve et toutes les sections de la note fiscale", async () => {
    const pack = await buildTaxEvidenceExportPackage({ source }, options);
    const computation = JSON.parse(pack.taxComputationJson) as {
      findings: Array<Record<string, unknown>>;
    };
    expect(computation.findings.length).toBeGreaterThan(0);
    for (const finding of computation.findings) {
      expect(finding).toEqual(expect.objectContaining({
        sourceDocumentIds: expect.any(Array),
        data: expect.any(Array),
        rule: expect.any(Object),
        sources: expect.any(Array),
        paragraphs: expect.any(Array),
        formula: expect.any(String),
        intermediateCalculations: expect.any(Array),
        result: expect.any(Object),
        evidenceLevel: expect.any(String),
        decision: expect.any(String),
        comment: expect.any(String),
        supplementalEvidenceIds: expect.any(Array),
      }));
    }
    for (const section of [
      "Contexte", "Régime", "Documents", "Couverture", "Résultat fiscal", "IS", "TVA",
      "Autres taxes", "Constats", "Analyses recommandées", "Limitations", "Décisions",
      "Sources", "Manifeste",
    ]) {
      expect(pack.html).toContain(`<h2>${section}</h2>`);
    }
    expect(pack.html).toContain("ne constitue pas un avis juridique");
    expect(pack.html).toContain("Aucune pénalité n'est calculée");
    expect(pack.html).toContain("Aucune conformité PDF/A n'est revendiquée");
  });

  it("une décision append-only modifie le snapshot fiscal sans toucher à l'historique", async () => {
    const findings = buildTaxEvidenceFindings({ source });
    const original: ReturnType<typeof appendTaxReviewEvent> = [];
    const events = appendTaxReviewEvent(original, {
      id: "tax-review-confirm-1",
      organizationId: source.organizationId,
      dossierId: source.dossierId,
      findingId: findings[0].id,
      actorId: "reviewer-1",
      actorRole: "tax_reviewer",
      action: "confirm",
      comment: "Confirmé dans le périmètre des pièces exportées.",
      createdAt: "2026-08-17T09:00:00.000Z",
    });
    const before = projectFiscalSynthesisWithTaxReview(
      source.synthesis,
      findings.map((finding) => finding.id),
      [],
    );
    const after = projectFiscalSynthesisWithTaxReview(
      source.synthesis,
      findings.map((finding) => finding.id),
      events,
    );
    const pack = await buildTaxEvidenceExportPackage({ source, reviewEvents: events }, options);

    expect(original).toEqual([]);
    expect(events).toHaveLength(1);
    expect(after.snapshotHash).not.toBe(before.snapshotHash);
    expect(pack.csv.reviewEvents).toContain("tax-review-confirm-1");
    expect(pack.csv.findings).toContain("confirm");
  });

  it("signale un justificatif référencé mais absent du paquet", async () => {
    const finding = buildTaxEvidenceFindings({ source })[0];
    const events = appendTaxReviewEvent([], {
      id: "tax-review-proof-1",
      organizationId: source.organizationId,
      dossierId: source.dossierId,
      findingId: finding.id,
      actorId: "reviewer-1",
      actorRole: "tax_reviewer",
      action: "attach_evidence",
      relatedEvidenceIds: ["proof-not-in-package"],
      createdAt: "2026-08-17T09:00:00.000Z",
    });
    const pack = await buildTaxEvidenceExportPackage({ source, reviewEvents: events }, options);
    expect(pack.manifest.limitations).toContainEqual(expect.objectContaining({
      code: "missing_supplemental_evidence",
      subjects: ["proof-not-in-package"],
    }));
  });

  it("conserve et limite explicitement une source future", async () => {
    const finding = buildTaxEvidenceFindings({ source }).find((candidate) => candidate.sources.length > 0)!;
    const current = finding.sources[0];
    const future = { ...current, status: "future" as const, effectiveFrom: "2027-01-01" };
    const pack = await buildTaxEvidenceExportPackage({
      source,
      normativeSourceOverrides: [future],
    }, options);
    expect(pack.csv.sources).toContain("future");
    expect(pack.manifest.limitations).toContainEqual(expect.objectContaining({
      code: "future_source",
      subjects: [future.sourceVersionId],
    }));
  });

  it("rend visible toute source review_required dans le manifeste et les constats", async () => {
    const finding = buildTaxEvidenceFindings({ source }).find((candidate) => candidate.sources.length > 0)!;
    const current = finding.sources[0];
    const reviewRequired = { ...current, status: "review_required" as const };
    const pack = await buildTaxEvidenceExportPackage({
      source,
      normativeSourceOverrides: [reviewRequired],
    }, options);
    expect(pack.manifest.limitations).toContainEqual(expect.objectContaining({
      code: "review_required_source",
      subjects: expect.arrayContaining([reviewRequired.sourceVersionId]),
    }));
    expect(pack.html).toContain("statut à valider (review_required)");
  });

  it("préserve une règle remplacée sans la présenter comme actuelle", async () => {
    const finding = buildTaxEvidenceFindings({ source })[0];
    const pack = await buildTaxEvidenceExportPackage({
      source,
      ruleStatuses: { [finding.rule.id]: "superseded" },
    }, options);
    expect(pack.manifest.limitations).toContainEqual(expect.objectContaining({
      code: "superseded_rule",
    }));
    expect(pack.csv.findings).toContain("superseded");
  });

  it("détecte l'altération d'un artefact lors de la vérification du manifeste", async () => {
    const pack = await buildTaxEvidenceExportPackage({ source }, options);
    const tampered = { ...pack, csv: { ...pack.csv, findings: `${pack.csv.findings}\naltéré` } };
    expect(verifyTaxEvidenceExportPackage(tampered)).toContain(
      "TAX_ARTIFACT_HASH_INVALID:tax-findings.csv",
    );
  });

  it("refuse tout mélange d'organisation ou de dossier", async () => {
    await expect(buildTaxEvidenceExportPackage({ source }, {
      ...options,
      activeContext: { organizationId: "other-organization", dossierId: source.dossierId },
    })).rejects.toThrow(/TAX_EXPORT_SCOPE_MISMATCH/u);

    const foreignSource = { ...source, dossierId: "other-dossier" };
    await expect(buildTaxEvidenceExportPackage({ source: foreignSource }, options))
      .rejects.toThrow(/TAX_EXPORT_SCOPE_MISMATCH/u);
  });
});

describe("TAX-09 — actions de revue", () => {
  it("journalise les huit actions et maintient une chaîne SHA-256 unique", () => {
    const findingId = buildTaxEvidenceFindings({ source })[0].id;
    const evidenceId = source.documentSnapshots[0].sourceDocumentId;
    const actions = [
      "confirm", "dismiss", "request_evidence", "correct", "replace",
      "mark_not_applicable", "mark_inconclusive", "attach_evidence",
    ] as const;
    let events: ReturnType<typeof appendTaxReviewEvent> = [];
    for (const [index, action] of actions.entries()) {
      events = appendTaxReviewEvent(events, {
        id: `tax-action-${index}`,
        organizationId: source.organizationId,
        dossierId: source.dossierId,
        findingId,
        actorId: "reviewer-1",
        actorRole: "tax_reviewer",
        action,
        comment: action === "correct" || action === "replace" ? "Motif documenté" : "",
        relatedEvidenceIds: action === "attach_evidence" ? [evidenceId] : [],
        createdAt: `2026-08-17T09:${String(index).padStart(2, "0")}:00.000Z`,
      }, new Set([evidenceId]));
    }
    expect(events.map((event) => event.action)).toEqual(actions);
    expect(events.every((event) => /^[a-f0-9]{64}$/u.test(event.eventHash))).toBe(true);
    expect(events.slice(1).every((event, index) => event.previousEventHash === events[index].eventHash)).toBe(true);
  });
});
