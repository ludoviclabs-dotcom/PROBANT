"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import type { ReviewEvent, ReviewEventAction } from "@/lib/canonical-model";
import { buildTaxEvidenceFindings } from "@/lib/evidence/tax-package";
import { appendTaxReviewEvent, projectFiscalSynthesisWithTaxReview } from "@/lib/evidence/tax-review";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import { sha256Hex } from "@/lib/synthesis/canonical";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import { FONT, T } from "@/components/synthesis/tokens";
import { INK_FAINT } from "./cockpit-style";

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

const fieldStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 9,
  background: "rgba(255,255,255,.03)",
  color: T.text,
  padding: "9px 11px",
  fontSize: FONT.table,
  minWidth: 0,
};

/** Décision préparée ailleurs dans la page (panneau latéral, prochaine action). */
export interface TaxReviewDraft {
  /** Identifiant de ligne de contrôle du cockpit (`control:<id>`). */
  readonly rowId: string;
  readonly action?: ReviewEventAction;
  readonly comment?: string;
  /** Incrémenté à chaque préparation, pour ré-appliquer un même brouillon. */
  readonly nonce: number;
}

/** Ligne de contrôle du cockpit → constat du paquet de preuve (même identifiant de résultat). */
export function evidenceFindingIdFor(
  findings: readonly { readonly id: string }[],
  rowId: string,
): string | null {
  if (!rowId.startsWith("control:")) return null;
  const key = rowId.slice("control:".length);
  return findings.find((finding) => finding.id === `tax-finding:${key}` || finding.id.endsWith(`:${key}`))?.id ?? null;
}

export function TaxReviewPanel({
  source,
  events,
  evidence,
  onChange,
  draft,
  exports,
}: {
  readonly draft?: TaxReviewDraft | null;
  /** Menu d'export placé à droite de la barre. */
  readonly exports?: React.ReactNode;
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
  const [flash, setFlash] = useState(false);
  const commentRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draft) return;
    const target = evidenceFindingIdFor(findings, draft.rowId);
    if (target) setFindingId(target);
    if (draft.action) setAction(draft.action);
    if (draft.comment) setComment(draft.comment);
    setMessage(target ? "Décision préparée : vérifiez puis enregistrez." : "Aucun constat révisable pour cette ligne.");
    setFlash(true);
    commentRef.current?.focus();
    const timer = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(timer);
    // `nonce` suffit : chaque préparation est un nouvel objet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.nonce]);

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

  const status = busy
    ? "Hachage et ajout à la chaîne…"
    : message || `${events.length} événement(s) · ${evidence.length} pièce(s) · snapshot ${projected.snapshotHash.slice(0, 12)}`;

  return (
    <section
      id="tax-act-decision"
      aria-label="Revue append-only des constats fiscaux"
      className="pbz-decision-bar"
      style={{
        zIndex: 50,
        minHeight: 72,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: flash ? "rgba(26,30,40,.94)" : "rgba(12,14,19,.9)",
        borderTop: `1px solid ${flash ? "rgba(91,157,255,.5)" : "rgba(255,255,255,.08)"}`,
        transition: "background .3s ease, border-color .3s ease",
      }}
    >
      <div
        style={{
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px 18px",
          padding: "12px 24px",
        }}
      >
        <p
          role="status"
          aria-live="polite"
          style={{ margin: 0, flex: "0 1 200px", minWidth: 150, fontSize: FONT.meta, lineHeight: 1.5, color: INK_FAINT }}
        >
          {status}
        </p>
        <div style={{ display: "flex", flex: "1 1 460px", minWidth: 0, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            aria-label="Constat fiscal à revoir"
            value={findingId}
            onChange={(event) => setFindingId(event.target.value)}
            style={{ ...fieldStyle, flex: "0 1 220px" }}
          >
            {findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.title}</option>)}
          </select>
          <select
            aria-label="Action de revue fiscale"
            value={action}
            onChange={(event) => setAction(event.target.value as ReviewEventAction)}
            style={{ ...fieldStyle, flex: "0 1 170px" }}
          >
            {REVIEW_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input
            ref={commentRef}
            aria-label="Commentaire de revue fiscale"
            placeholder="Commentaire…"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="pbz-comment"
            style={{ ...fieldStyle, flex: "1 1 120px" }}
          />
          <label
            className="pbz-filepick"
            title={file ? file.name : "Rattacher une pièce complémentaire (10 Mo max.)"}
            style={{
              ...fieldStyle,
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 160,
              cursor: "pointer",
              color: file ? T.text : T.muted,
            }}
          >
            <Paperclip aria-hidden="true" size={14} style={{ flexShrink: 0 }} />
            {file && (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
            )}
            <input
              ref={fileRef}
              aria-label="Justificatif fiscal"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {exports}
          <button
            type="button"
            className="pbz-focusable"
            disabled={busy || findings.length === 0}
            onClick={() => void save().then(() => {
              if (fileRef.current) fileRef.current.value = "";
            })}
            style={{
              border: 0,
              borderRadius: 9,
              background: T.accent,
              padding: "10px 16px",
              fontSize: FONT.table,
              fontWeight: 600,
              color: "#061019",
              cursor: busy ? "progress" : "pointer",
              whiteSpace: "nowrap",
              opacity: busy || findings.length === 0 ? 0.6 : 1,
            }}
          >
            Enregistrer la revue fiscale
          </button>
        </div>
      </div>
    </section>
  );
}
