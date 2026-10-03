"use client";

/**
 * Session de revue fiscale append-only : événements, pièces rattachées,
 * projection du snapshot. Logique reprise à l'identique de l'ancien
 * `TaxReviewPanel` — seul l'habillage change (barre de décision + tiroir).
 */

import { useCallback, useMemo, useState } from "react";
import type { ReviewEvent, ReviewEventAction } from "@/lib/canonical-model";
import { buildTaxEvidenceFindings } from "@/lib/evidence/tax-package";
import { appendTaxReviewEvent, projectFiscalSynthesisWithTaxReview } from "@/lib/evidence/tax-review";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import { sha256Hex } from "@/lib/synthesis/canonical";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";

export const REVIEW_ACTIONS: readonly { readonly value: ReviewEventAction; readonly label: string }[] = [
  { value: "confirm", label: "Confirmer" },
  { value: "dismiss", label: "Écarter" },
  { value: "request_evidence", label: "Demander une preuve" },
  { value: "correct", label: "Corriger" },
  { value: "replace", label: "Remplacer" },
  { value: "mark_not_applicable", label: "Marquer non applicable" },
  { value: "mark_inconclusive", label: "Marquer non concluant" },
  { value: "attach_evidence", label: "Rattacher un justificatif" },
];

const MAX_SUPPLEMENTAL_EVIDENCE_BYTES = 10 * 1024 * 1024;

export interface ReviewInput {
  readonly findingId: string;
  readonly action: ReviewEventAction;
  readonly comment: string;
  readonly file: File | null;
}

export function useTaxReviewSession(source: TaxCockpitSource | undefined) {
  const findings = useMemo(
    () => (source ? buildTaxEvidenceFindings({ source }) : []),
    [source],
  );
  const [events, setEvents] = useState<readonly ReviewEvent[]>([]);
  const [evidence, setEvidence] = useState<readonly TaxSupplementalEvidence[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const projectedHash = useMemo(
    () =>
      source
        ? projectFiscalSynthesisWithTaxReview(
            source.synthesis,
            findings.map((finding) => finding.id),
            events,
          ).snapshotHash
        : "",
    [events, findings, source],
  );

  /** Constat de revue dont la règle correspond à un contrôle d'exploration. */
  const findingIdForControl = useCallback(
    (controlId: string | null) =>
      controlId ? findings.find((finding) => finding.rule.id === controlId)?.id : undefined,
    [findings],
  );

  const save = useCallback(
    async (input: ReviewInput): Promise<boolean> => {
      if (!source) return false;
      setBusy(true);
      setMessage("");
      try {
        const { findingId, action, comment, file } = input;
        if (!findingId) throw new Error("Aucun constat fiscal disponible.");
        if (action === "attach_evidence" && !file) {
          throw new Error("Sélectionnez un justificatif avant de le rattacher.");
        }
        if (file && (file.size === 0 || file.size > MAX_SUPPLEMENTAL_EVIDENCE_BYTES)) {
          throw new Error("Le justificatif doit être non vide et ne pas dépasser 10 Mo.");
        }

        const ordinal = events.length + 1;
        const createdAt = new Date(Date.parse(source.generatedAt) + ordinal * 1_000).toISOString();
        let nextEvidence = evidence;
        let evidenceId: string | null = null;
        if (file) {
          evidenceId = `tax-evidence-demo-${ordinal}`;
          const attachment: TaxSupplementalEvidence = {
            id: evidenceId,
            organizationId: source.organizationId,
            dossierId: source.dossierId,
            snapshotId: null,
            fileName: file.name,
            documentType: "supplemental_tax_evidence",
            sha256: sha256Hex(new Uint8Array(await file.arrayBuffer())),
            parserName: null,
            parserVersion: null,
            location: null,
            findingIds: [findingId],
            attachedBy: "reviewer-demo",
            attachedAt: createdAt,
          };
          nextEvidence = [...evidence, attachment];
        }

        const nextEvents = appendTaxReviewEvent(
          events,
          {
            id: `tax-review-demo-${ordinal}`,
            organizationId: source.organizationId,
            dossierId: source.dossierId,
            findingId,
            actorId: "reviewer-demo",
            actorRole: "reviewer",
            action,
            comment,
            relatedEvidenceIds: evidenceId ? [evidenceId] : [],
            createdAt,
          },
          new Set(nextEvidence.map((item) => item.id)),
        );
        setEvents(nextEvents);
        setEvidence(nextEvidence);
        setMessage(
          `Événement append-only ${ordinal} enregistré · snapshot ${projectFiscalSynthesisWithTaxReview(
            source.synthesis,
            findings.map((finding) => finding.id),
            nextEvents,
          ).snapshotHash.slice(0, 12)}`,
        );
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Revue fiscale impossible.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [events, evidence, findings, source],
  );

  return {
    findings,
    events,
    evidence,
    projectedHash,
    message,
    busy,
    save,
    findingIdForControl,
  };
}

export type TaxReviewSession = ReturnType<typeof useTaxReviewSession>;
