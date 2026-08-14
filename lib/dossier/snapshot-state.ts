import type { DossierSnapshot } from "./types";
import { stableHash } from "@/lib/synthesis/canonical";
import { appendReviewEvent, type AppendReviewEventInput } from "./review";

/**
 * Empreinte de l'état métier d'un dossier. Les lignes de grand livre ne font
 * pas partie du snapshot de restitution; elles restent référencées par le
 * SHA-256 du document source.
 */
export function computeDossierSnapshotHash(snapshot: DossierSnapshot): string {
  return stableHash({
    snapshotVersion: snapshot.snapshotVersion,
    sourceKind: snapshot.sourceKind,
    dossier: snapshot.dossier,
    sourceDocuments: [...snapshot.sourceDocuments].sort((a, b) => a.id.localeCompare(b.id)),
    findings: [...snapshot.findings].sort((a, b) => a.id.localeCompare(b.id)),
    admissibilityFindings: [...snapshot.admissibilityFindings].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    reviewEvents: snapshot.reviewEvents,
    calculationContext: snapshot.calculationContext,
  });
}

export function appendReviewDecisionToSnapshot(
  snapshot: DossierSnapshot,
  input: Omit<AppendReviewEventInput, "dossierId" | "finding"> & { findingId: string },
): DossierSnapshot {
  const finding = snapshot.findings.find((candidate) => candidate.id === input.findingId);
  if (!finding) throw new Error(`REVIEW_FINDING_UNKNOWN:${input.findingId}`);
  const validEvidenceIds = new Set(snapshot.sourceDocuments.map((document) => document.id));
  const reviewEvents = appendReviewEvent(
    snapshot.reviewEvents,
    {
      ...input,
      dossierId: snapshot.dossier.id,
      finding,
    },
    validEvidenceIds,
  );
  const next: DossierSnapshot = { ...snapshot, reviewEvents, snapshotHash: "" };
  next.snapshotHash = computeDossierSnapshotHash(next);
  return next;
}
