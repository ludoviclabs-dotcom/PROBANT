"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useActiveDossier } from "@/lib/dossier/client";
import { REVIEW_EVENT_STATUSES, type ReviewEventStatus } from "@/lib/dossier";

const STATUS_LABEL: Record<ReviewEventStatus, string> = {
  pending: "En attente",
  needs_evidence: "Preuve requise",
  confirmed: "Confirmé",
  dismissed: "Écarté",
  corrected: "Corrigé",
  superseded: "Remplacé",
};

export function ReviewEventPanel() {
  const { snapshot, appendReviewDecision } = useActiveDossier();
  const [findingId, setFindingId] = useState(snapshot.findings[0]?.id ?? "");
  const [newStatus, setNewStatus] = useState<ReviewEventStatus>("confirmed");
  const [comment, setComment] = useState("");
  const [evidenceId, setEvidenceId] = useState(snapshot.sourceDocuments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const events = useMemo(() => [...snapshot.reviewEvents].reverse(), [snapshot.reviewEvents]);

  useEffect(() => {
    setFindingId(snapshot.findings[0]?.id ?? "");
    setEvidenceId(snapshot.sourceDocuments[0]?.id ?? "");
    setComment("");
    setMessage("");
  }, [snapshot.dossier.id, snapshot.findings, snapshot.sourceDocuments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!findingId) return;
    setBusy(true);
    setMessage("");
    try {
      await appendReviewDecision({
        findingId,
        newStatus,
        comment,
        relatedEvidenceIds: evidenceId ? [evidenceId] : [],
      });
      setComment("");
      setMessage("Décision ajoutée à l'historique; un nouveau snapshot est actif.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Décision non enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{ border: "1px solid #1c2430", borderRadius: 12, background: "#0f1419", marginBottom: 16 }}>
      <summary className="pbz-focusable" style={{ cursor: "pointer", padding: "12px 14px", color: "#e6edf6", fontSize: 13, fontWeight: 700 }}>
        Revue append-only · {snapshot.reviewEvents.length} événement(s)
      </summary>
      <div style={{ padding: "4px 14px 14px" }}>
        <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ color: "#8a99af", fontSize: 11 }}>Constat
            <select value={findingId} onChange={(event) => setFindingId(event.target.value)} disabled={busy || snapshot.findings.length === 0} style={{ display: "block", width: "100%", marginTop: 4, padding: 8, background: "#0b0e13", color: "#e6edf6", border: "1px solid #324563", borderRadius: 7 }}>
              {snapshot.findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.id} · {finding.titre}</option>)}
            </select>
          </label>
          <label style={{ color: "#8a99af", fontSize: 11 }}>Nouveau statut
            <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as ReviewEventStatus)} disabled={busy} style={{ display: "block", width: "100%", marginTop: 4, padding: 8, background: "#0b0e13", color: "#e6edf6", border: "1px solid #324563", borderRadius: 7 }}>
              {REVIEW_EVENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
            </select>
          </label>
          <label style={{ color: "#8a99af", fontSize: 11 }}>Preuve liée
            <select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} disabled={busy} style={{ display: "block", width: "100%", marginTop: 4, padding: 8, background: "#0b0e13", color: "#e6edf6", border: "1px solid #324563", borderRadius: 7 }}>
              <option value="">Aucune</option>
              {snapshot.sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}
            </select>
          </label>
          <label style={{ color: "#8a99af", fontSize: 11 }}>Commentaire
            <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} disabled={busy} style={{ display: "block", width: "100%", marginTop: 4, padding: 9, background: "#0b0e13", color: "#e6edf6", border: "1px solid #324563", borderRadius: 7 }} />
          </label>
          <button type="submit" disabled={busy || !findingId} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #5b9dff", background: "#11203a", color: "#e6edf6", fontWeight: 700, cursor: findingId ? "pointer" : "not-allowed" }}>Enregistrer la décision</button>
        </form>
        <p role="status" aria-live="polite" style={{ color: "#8a99af", fontSize: 11.5 }}>{message}</p>
        {events.length > 0 && (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", color: "#c7d2e3", fontSize: 11 }}>
            <caption style={{ textAlign: "left", color: "#8a99af", paddingBottom: 6 }}>Historique, événement le plus récent en premier</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Constat</th><th scope="col">Transition</th><th scope="col">Acteur</th><th scope="col">Hash</th></tr></thead>
            <tbody>{events.map((reviewEvent) => <tr key={reviewEvent.id} style={{ borderTop: "1px solid #1c2430" }}><td>{reviewEvent.createdAt}</td><td>{reviewEvent.findingId}</td><td>{STATUS_LABEL[reviewEvent.previousStatus]} → {STATUS_LABEL[reviewEvent.newStatus]}</td><td>{reviewEvent.actorId} ({reviewEvent.actorRole})</td><td><code title={reviewEvent.eventHash}>{reviewEvent.eventHash.slice(0, 12)}…</code></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </details>
  );
}
