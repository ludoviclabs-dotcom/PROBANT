/**
 * Fixtures des tests du moteur de Synthèse.
 *
 * Un constat et un DossierSnapshot minimaux mais COMPLETS au sens des types
 * canoniques — chaque test ne précise que ce qu'il dégrade ou fait varier.
 */

import type { DossierSnapshot } from "@/lib/canonical-model";
import type {
  FinancialEffect,
  Finding,
} from "@/lib/canonical-model/finding";
import type { ReviewEvent, ReviewEventStatus } from "@/lib/canonical-model";
import { appendReviewEvent } from "@/lib/dossier/review";

export const CLOCK = () => "2026-08-14T12:00:00.000Z";

export function makeEffect(over: Partial<FinancialEffect> = {}): FinancialEffect {
  return {
    amountCents: 100_000, // 1 000,00 €
    direction: "increase",
    target: "resultat",
    assertion: "exactitude",
    rootCause: "cutoff",
    period: "2024",
    basis: "measured",
    ...over,
  };
}

export function makeFinding(id: string, over: Partial<Finding> = {}): Finding {
  return {
    id,
    family: "methodology",
    severity: "majeur",
    ruleId: "R-TEST-001",
    ruleVersion: "1.0.0",
    cloison: "resultat",
    siloId: "silo-test",
    titre: `Constat ${id}`,
    constat: "Constat de test.",
    explication: "Explication de test.",
    mesure: { constate: 1000, seuil: 0, unite: "EUR", libelle: "test" },
    source: {
      ref: "TEST 1",
      citation: "Citation de test.",
      effectiveDate: "2024-01-01",
    },
    comptesConcernes: ["411"],
    lignesSource: [1],
    faisceau: [],
    preuve: [{ etape: "test", detail: "test" }],
    statutRevue: "en_attente",
    ...over,
  };
}

export function makeReviewEvent(
  finding: Finding,
  newStatus: ReviewEventStatus = "confirmed",
  id = "ev-1",
): ReviewEvent {
  const event = appendReviewEvent([], {
    id,
    dossierId: "dossier-test",
    finding,
    actorId: "reviewer-test",
    actorRole: "reviewer",
    newStatus,
    comment: "Décision de test",
    relatedEvidenceIds: [],
    createdAt: "2026-08-14T10:00:00.000Z",
  }).at(0);
  if (!event) throw new Error("TEST_REVIEW_EVENT_NOT_CREATED");
  return event;
}

export function makeDossierSnapshot(
  over: Partial<DossierSnapshot> = {},
): DossierSnapshot {
  const findings = over.findings ?? [];
  return {
    dossier: {
      id: "dossier-test",
      societe: {
        raisonSociale: "TEST SA",
        siren: "123456789",
        exercice: "2024",
        dateCloture: "20241231",
      },
      demoMode: false,
      fecFingerprint: "fec-fingerprint-test",
      referentielVersion: "2024-01-01",
      createdAt: "2026-08-14T00:00:00.000Z",
      admissibilite: over.admissibilityFindings ?? [],
      silos: [],
    },
    sourceDocuments: [
      {
        id: "doc-1",
        dossierId: "dossier-test",
        fileName: "123456789FEC20241231.txt",
        documentType: "fec",
        fingerprint: "fec-fingerprint-test",
        parserVersion: "test",
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    ],
    findings,
    admissibilityFindings: [],
    reviewEvents: [],
    calculationContext: {
      entriesTotal: 100,
      entriesAnalysed: 100,
      controlsEligible: 10,
      controlsExecuted: 10,
      controlsConcluded: 10,
      controlsNotConcluded: 0,
      notes: [],
    },
    snapshotVersion: "1.0.0",
    snapshotHash: "input-hash",
    sourceKind: "session",
    ...over,
  };
}
