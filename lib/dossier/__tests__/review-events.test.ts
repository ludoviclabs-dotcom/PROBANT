import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "../snapshot-builder";
import {
  appendReviewEvent,
  computeReviewEventHash,
  reviewEventsDigest,
  verifyReviewEventChain,
} from "../review";
import { appendReviewDecisionToSnapshot } from "../snapshot-state";

describe("review events append-only", () => {
  const snapshot = buildDemoDossierSnapshot();
  const finding = snapshot.findings[0];
  const sourceId = snapshot.sourceDocuments[0].id;

  it("construit une chaîne SHA-256 stable sans muter l'historique", () => {
    const original: ReturnType<typeof appendReviewEvent> = [];
    const first = appendReviewEvent(original, {
      id: "event-1",
      dossierId: snapshot.dossier.id,
      finding,
      actorId: "actor-1",
      actorRole: "reviewer",
      newStatus: "needs_evidence",
      comment: "Pièce complémentaire requise",
      relatedEvidenceIds: [sourceId],
      createdAt: "2026-08-14T10:00:00.000Z",
    }, new Set([sourceId]));
    const second = appendReviewEvent(first, {
      id: "event-2",
      dossierId: snapshot.dossier.id,
      finding,
      actorId: "actor-1",
      actorRole: "reviewer",
      newStatus: "corrected",
      comment: "Correction reçue et contrôlée",
      relatedEvidenceIds: [sourceId],
      createdAt: "2026-08-14T11:00:00.000Z",
    }, new Set([sourceId]));

    expect(original).toEqual([]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[1].previousEventHash).toBe(second[0].eventHash);
    expect(second[1].previousStatus).toBe("needs_evidence");
    expect(second[0].eventHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(computeReviewEventHash(second[0])).toBe(second[0].eventHash);
    expect(verifyReviewEventChain(second)).toMatchObject({ valid: true, errors: [] });
    expect(reviewEventsDigest(second)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("détecte toute altération et tout fork", () => {
    const events = appendReviewEvent([], {
      id: "event-1",
      dossierId: snapshot.dossier.id,
      finding,
      actorId: "actor-1",
      actorRole: "reviewer",
      newStatus: "confirmed",
      comment: "Confirmé",
      createdAt: "2026-08-14T10:00:00.000Z",
    });
    const tampered = [{ ...events[0], comment: "altéré" }];
    expect(verifyReviewEventChain(tampered).valid).toBe(false);
    expect(() => reviewEventsDigest(tampered)).toThrow(/CHAIN_INVALID/u);
  });

  it("une correction ajoute un événement et produit un nouveau snapshot", () => {
    const next = appendReviewDecisionToSnapshot(snapshot, {
      id: "event-correction",
      findingId: finding.id,
      actorId: "actor-1",
      actorRole: "reviewer",
      newStatus: "corrected",
      comment: "Correction documentée",
      relatedEvidenceIds: [sourceId],
      createdAt: "2026-08-14T12:00:00.000Z",
    });
    expect(snapshot.reviewEvents).toEqual([]);
    expect(next.reviewEvents).toHaveLength(1);
    expect(next.snapshotHash).not.toBe(snapshot.snapshotHash);
  });

  it("refuse une référence de preuve étrangère", () => {
    expect(() => appendReviewEvent([], {
      id: "event-invalid-evidence",
      dossierId: snapshot.dossier.id,
      finding,
      actorId: "actor-1",
      actorRole: "reviewer",
      newStatus: "confirmed",
      relatedEvidenceIds: ["foreign-document"],
      createdAt: "2026-08-14T10:00:00.000Z",
    }, new Set([sourceId]))).toThrow(/EVIDENCE_UNKNOWN/u);
  });
});
