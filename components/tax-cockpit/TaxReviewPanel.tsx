"use client";

import { useMemo, useState } from "react";
import type { ReviewEvent, ReviewEventAction } from "@/lib/canonical-model";
import { buildTaxEvidenceFindings } from "@/lib/evidence/tax-package";
import { appendTaxReviewEvent, projectFiscalSynthesisWithTaxReview } from "@/lib/evidence/tax-review";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import { sha256Hex } from "@/lib/synthesis/canonical";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import { FONT, T } from "@/components/synthesis/tokens";

const ACTIONS: readonly { readonly value: ReviewEventAction; readonly label: string }[] = [
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

const fieldStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  background: T.surface,
  color: T.text,
  padding: "8px 10px",
  fontSize: FONT.meta,
};

export function TaxReviewPanel({
  source,
  events,
  evidence,
  onChange,
}: {
  readonly source: TaxCockpitSource;
  readonly events: readonly ReviewEvent[];
  readonly evidence: readonly TaxSupplementalEvidence[];
  readonly onChange: (
    events: readonly ReviewEvent[],
    evidence: readonly TaxSupplementalEvidence[],
  ) => void;
}) {
  const findings = useMemo(() => buildTaxEvidenceFindings({ source }), [source]);
  const [findingId, setFindingId] = useState(findings[0]?.id ?? "");
  const [action, setAction] = useState<ReviewEventAction>("confirm");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const projected = useMemo(
    () => projectFiscalSynthesisWithTaxReview(
      source.synthesis,
      findings.map((finding) => finding.id),
      events,
    ),
    [events, findings, source.synthesis],
  );

  async function save(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
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

      const nextEvents = appendTaxReviewEvent(events, {
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
      }, new Set(nextEvidence.map((item) => item.id)));
      onChange(nextEvents, nextEvidence);
      setFile(null);
      setComment("");
      setMessage(`Événement append-only ${ordinal} enregistré · snapshot ${projectFiscalSynthesisWithTaxReview(
        source.synthesis,
        findings.map((finding) => finding.id),
        nextEvents,
      ).snapshotHash.slice(0, 12)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revue fiscale impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Revue append-only des constats fiscaux"
      style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, background: T.surface }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ display: "grid", gap: 4, minWidth: 240, flex: "1 1 320px", color: T.muted, fontSize: FONT.meta }}>
          Constat fiscal
          <select aria-label="Constat fiscal à revoir" value={findingId} onChange={(event) => setFindingId(event.target.value)} style={fieldStyle}>
            {findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.title}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, minWidth: 210, color: T.muted, fontSize: FONT.meta }}>
          Décision
          <select aria-label="Action de revue fiscale" value={action} onChange={(event) => setAction(event.target.value as ReviewEventAction)} style={fieldStyle}>
            {ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 8 }}>
        <label style={{ display: "grid", gap: 4, flex: "1 1 300px", color: T.muted, fontSize: FONT.meta }}>
          Commentaire
          <input aria-label="Commentaire de revue fiscale" value={comment} onChange={(event) => setComment(event.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: "grid", gap: 4, flex: "1 1 250px", color: T.muted, fontSize: FONT.meta }}>
          Pièce complémentaire
          <input
            aria-label="Justificatif fiscal"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={fieldStyle}
          />
        </label>
        <button
          type="button"
          disabled={busy || findings.length === 0}
          onClick={() => void save()}
          style={{ ...fieldStyle, cursor: "pointer", fontWeight: 700 }}
        >
          Enregistrer la revue fiscale
        </button>
      </div>
      <p role="status" aria-live="polite" style={{ margin: "8px 0 0", minHeight: 17, color: T.muted, fontSize: FONT.meta }}>
        {busy
          ? "Hachage et ajout à la chaîne…"
          : message || `${events.length} événement(s) · ${evidence.length} pièce(s) · snapshot ${projected.snapshotHash.slice(0, 12)}`}
      </p>
    </section>
  );
}
