"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useActiveDossier } from "@/lib/dossier/client";
import { REVIEW_EVENT_STATUSES, type ReviewEventStatus } from "@/lib/dossier";
import s from "./evidence.module.css";

const STATUS_LABEL: Record<ReviewEventStatus, string> = {
  pending: "En attente",
  needs_evidence: "Preuve requise",
  confirmed: "Confirmé",
  dismissed: "Écarté",
  corrected: "Corrigé",
  superseded: "Remplacé",
};

/**
 * Revue append-only : le journal complet des décisions (constat, nouveau statut, preuve liée, commentaire) et
 * l'historique des événements chaînés par hachage. Le geste rapide « Valider / Écarter » de la chaîne de preuve
 * écrit dans le même journal ; ce panneau porte le commentaire et la preuve liée. Rendu selon la charte.
 */
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
    <details className={s.review}>
      <summary>Revue append-only · {snapshot.reviewEvents.length} événement(s)</summary>
      <div className={s.reviewBody}>
        <form onSubmit={(event) => void submit(event)} className={s.reviewForm}>
          <label className={s.reviewField}>Constat
            <select value={findingId} onChange={(event) => setFindingId(event.target.value)} disabled={busy || snapshot.findings.length === 0}>
              {snapshot.findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.id} · {finding.titre}</option>)}
            </select>
          </label>
          <label className={s.reviewField}>Nouveau statut
            <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as ReviewEventStatus)} disabled={busy}>
              {REVIEW_EVENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
            </select>
          </label>
          <label className={s.reviewField}>Preuve liée
            <select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} disabled={busy}>
              <option value="">Aucune</option>
              {snapshot.sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}
            </select>
          </label>
          <label className={s.reviewField}>Commentaire
            <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} disabled={busy} />
          </label>
          <button type="submit" disabled={busy || !findingId} className={s.reviewSubmit}>Enregistrer la décision</button>
        </form>
        <p role="status" aria-live="polite" className={s.reviewMessage}>{message}</p>
        {events.length > 0 && (
          <div role="region" aria-label="Historique des décisions de revue" tabIndex={0} className={s.scrollX}>
            <table className={s.reviewTable}>
              <caption>Historique, événement le plus récent en premier</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Constat</th><th scope="col">Transition</th><th scope="col">Acteur</th><th scope="col">Hash</th></tr></thead>
              <tbody>{events.map((reviewEvent) => <tr key={reviewEvent.id}><td>{reviewEvent.createdAt}</td><td>{reviewEvent.findingId}</td><td>{STATUS_LABEL[reviewEvent.previousStatus]} → {STATUS_LABEL[reviewEvent.newStatus]}</td><td>{reviewEvent.actorId} ({reviewEvent.actorRole})</td><td><code title={reviewEvent.eventHash}>{reviewEvent.eventHash.slice(0, 12)}…</code></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
