"use client";

/**
 * Tiroir de détail d'une ligne (420 px, coulissant à droite) : formule,
 * données, limites, preuve, sources et historique de revue. Les décisions
 * s'enregistrent via la même session append-only que la barre du bas ; une
 * ligne de rapprochement n'a pas de constat de revue rattaché, ses boutons
 * restent donc désactivés (et le disent).
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { VisualizationRow } from "@/lib/visualization/types";
import type { TaxFindingRowDetail } from "@/lib/tax/cockpit";
import { TAX_OUTCOME_LABEL } from "@/lib/tax/cockpit";
import type { TaxControlOutcome } from "@/lib/canonical-model";
import { BODY, C, MONO, OUTCOME_COLOR, OUTCOME_MARK, SANS } from "./fiscal-style";
import { REVIEW_ACTIONS, type TaxReviewSession } from "./useTaxReviewSession";

const dt: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".12em",
  color: C.faint,
};
const dd: React.CSSProperties = { margin: "6px 0 0", lineHeight: 1.6, color: C.textSoft };

const QUICK_ACTIONS = ["confirm", "dismiss", "request_evidence", "attach_evidence"] as const;

export function TaxFindingDrawer({
  row,
  detail,
  outcome,
  session,
  onClose,
}: {
  row: VisualizationRow;
  detail: TaxFindingRowDetail;
  outcome: string;
  session?: TaxReviewSession;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const findingId = session?.findingIdForControl(detail.controlId);
  const history = findingId ? (session?.events.filter((event) => event.findingId === findingId) ?? []) : [];
  const color = OUTCOME_COLOR[outcome] ?? C.accent;
  const rawLabel = String(row.cells.label ?? row.id);
  const title =
    detail.controlId && rawLabel.startsWith(`${detail.controlId} — `)
      ? rawLabel.slice(detail.controlId.length + 3)
      : rawLabel;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, row.id]);

  async function decide(action: (typeof QUICK_ACTIONS)[number], file: File | null = null) {
    if (!session || !findingId) return;
    const saved = await session.save({ findingId, action, comment, file });
    if (saved) setComment("");
  }

  const canDecide = Boolean(session && findingId) && !session?.busy;
  const labelOf = (value: string | undefined) =>
    REVIEW_ACTIONS.find((item) => item.value === value)?.label ?? value ?? "—";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Détail du contrôle : ${title}`}
      className="fx-drawer"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        maxWidth: "92%",
        zIndex: 60,
        background: C.drawer,
        borderLeft: `1px solid ${C.lineStrong}`,
        boxShadow: "-28px 0 60px rgba(0,0,0,.5)",
        display: "flex",
        flexDirection: "column",
        animation: "fxSlideIn .28s cubic-bezier(.2,.7,.3,1) both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "20px 22px 16px",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...dt, letterSpacing: ".14em" }}>{detail.taxLabel}</div>
          <h2
            style={{
              margin: "6px 0 0",
              fontFamily: SANS,
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1.3,
              color: C.text,
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </h2>
          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color }}>
            <span aria-hidden="true">{OUTCOME_MARK[outcome]} </span>
            {TAX_OUTCOME_LABEL[outcome as TaxControlOutcome] ?? String(row.cells.status)}
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="fx-icon-btn"
          aria-label="Fermer le détail"
          onClick={onClose}
          style={{
            border: 0,
            borderRadius: 8,
            background: "rgba(255,255,255,.05)",
            padding: 6,
            color: C.muted,
            cursor: "pointer",
            lineHeight: 0,
          }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.faint }}>Montant</span>
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 24, color: C.text }}>
            {detail.amountDisplay}
          </span>
        </div>
        <dl style={{ margin: "22px 0 0", display: "flex", flexDirection: "column", gap: 16, fontSize: 12.5 }}>
          <div>
            <dt style={dt}>Formule / normalisations</dt>
            <dd style={dd}>{detail.formula}</dd>
          </div>
          <div>
            <dt style={dt}>Données utilisées</dt>
            <dd style={{ ...dd, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, overflowWrap: "anywhere" }}>
              {detail.usedData.length > 0 ? detail.usedData.join(" · ") : "—"}
            </dd>
          </div>
          <div>
            <dt style={dt}>Limites</dt>
            <dd style={dd}>
              {detail.limits.length > 0 ? detail.limits.join(" ") : "Aucune limite spécifique documentée sur cette ligne."}
            </dd>
          </div>
          <div>
            <dt style={dt}>Preuve</dt>
            <dd style={dd}>{detail.evidence}</dd>
          </div>
          <div>
            <dt style={dt}>Sources</dt>
            <dd style={{ ...dd, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, overflowWrap: "anywhere" }}>
              {detail.sources.length > 0 ? detail.sources.join(" · ") : "—"}
            </dd>
          </div>
          <div>
            <dt style={dt}>Historique de revue</dt>
            <dd style={{ ...dd, color: C.muted }}>
              {history.length === 0
                ? detail.review
                : history.map((event) => (
                    <span key={event.id} style={{ display: "block" }}>
                      {labelOf(event.action)}
                      {event.comment ? ` — ${event.comment}` : ""}
                    </span>
                  ))}
            </dd>
          </div>
        </dl>

        <label style={{ ...dt, marginTop: 22, display: "block" }}>
          Commentaire de revue
          <textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Documenter la décision…"
            style={{
              marginTop: 8,
              display: "block",
              width: "100%",
              resize: "vertical",
              border: `1px solid ${C.lineStrong}`,
              borderRadius: 10,
              background: C.fill,
              padding: "10px 12px",
              fontFamily: BODY,
              fontSize: 12.5,
              textTransform: "none",
              letterSpacing: 0,
              color: C.text,
            }}
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          hidden
          aria-label="Justificatif fiscal du contrôle"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (file) void decide("attach_evidence", file);
          }}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map((action, index) => (
            <button
              key={action}
              type="button"
              disabled={!canDecide}
              className={index === 0 ? "fx-btn-primary" : "fx-btn-ghost"}
              onClick={() => (action === "attach_evidence" ? fileRef.current?.click() : void decide(action))}
              style={
                index === 0
                  ? {
                      border: 0,
                      borderRadius: 9,
                      background: C.accent,
                      padding: "9px 14px",
                      fontFamily: BODY,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "#061019",
                      cursor: canDecide ? "pointer" : "not-allowed",
                      opacity: canDecide ? 1 : 0.45,
                    }
                  : {
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 9,
                      background: "transparent",
                      padding: "9px 14px",
                      fontFamily: BODY,
                      fontSize: 12.5,
                      color: C.textSoft,
                      cursor: canDecide ? "pointer" : "not-allowed",
                      opacity: canDecide ? 1 : 0.45,
                    }
              }
            >
              {labelOf(action)}
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" style={{ margin: "12px 0 0", minHeight: 17, fontSize: 11.5, lineHeight: 1.5, color: C.muted }}>
          {!session
            ? "La revue n'est pas disponible sur ce dossier."
            : !findingId
              ? "Aucun constat de revue n'est rattaché à cette ligne de rapprochement : la décision se prend sur le contrôle correspondant."
              : session.message}
        </p>
      </div>
    </div>
  );
}
