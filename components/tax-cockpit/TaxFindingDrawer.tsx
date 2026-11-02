"use client";

/**
 * Panneau de détail d'une ligne (plan 2, à droite) : montant, formule, données, limites, preuve, sources et
 * historique de revue. Les décisions s'enregistrent via la même session append-only que la barre du bas ; une
 * ligne de rapprochement n'a pas de constat de revue rattaché, ses boutons restent donc désactivés (et le disent).
 * Dialogue non modal : le focus entre sur « Fermer », Échap referme, le focus revient à la ligne ouverte.
 */

import { useEffect, useRef, useState } from "react";
import p from "@/components/charte/page.module.css";
import type { VisualizationRow } from "@/lib/visualization/types";
import { displayControlDetail, TAX_OUTCOME_LABEL, type TaxFindingRowDetail } from "@/lib/tax/cockpit";
import type { TaxControlOutcome } from "@/lib/canonical-model";
import { asOutcome, OutcomeMark } from "./OutcomeMark";
import { findingReading, findingTitle } from "./finding-text";
import { REVIEW_ACTIONS, type TaxReviewSession } from "./useTaxReviewSession";
import x from "./fiscalite.module.css";

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
  const title = findingTitle(row, detail);
  // La formule d'un contrôle est la phrase du moteur (même texte que la lecture) : même projection d'accents.
  const formula = detail.controlId ? displayControlDetail(detail.controlId, detail.formula) : detail.formula;

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
  const labelOf = (value: string | undefined) => REVIEW_ACTIONS.find((item) => item.value === value)?.label ?? value ?? "—";

  return (
    <div role="dialog" aria-modal="false" aria-label={`Détail du contrôle : ${title}`} className={x.drawer}>
      <div className={x.drawerHead}>
        <div>
          <p className={p.key}>{detail.taxLabel}</p>
          <h2 className={x.drawerTitle}>{title}</h2>
          <p className={x.drawerOutcome}>
            <OutcomeMark
              outcome={asOutcome(outcome)}
              label={TAX_OUTCOME_LABEL[outcome as TaxControlOutcome] ?? String(row.cells.status)}
            />
          </p>
        </div>
        <button ref={closeRef} type="button" className={x.drawerClose} aria-label="Fermer le détail" onClick={onClose}>
          ×
        </button>
      </div>

      <div className={x.drawerBody}>
        <div className={x.drawerAmount}>
          <span className={p.key}>Montant</span>
          <span className={x.drawerAmountValue}>{detail.amountDisplay}</span>
        </div>
        <dl className={x.drawerList}>
          <div>
            <dt className={p.key}>Formule / normalisations</dt>
            <dd>{formula}</dd>
          </div>
          {!detail.controlId && (
            <div>
              <dt className={p.key}>Lecture</dt>
              <dd>{findingReading(detail)}</dd>
            </div>
          )}
          <div>
            <dt className={p.key}>Données utilisées</dt>
            <dd className={x.monoSmall}>{detail.usedData.length > 0 ? detail.usedData.join(" · ") : "—"}</dd>
          </div>
          <div>
            <dt className={p.key}>Limites</dt>
            <dd>{detail.limits.length > 0 ? detail.limits.join(" ") : "Aucune limite spécifique documentée sur cette ligne."}</dd>
          </div>
          <div>
            <dt className={p.key}>Preuve</dt>
            <dd className={detail.controlId ? undefined : x.monoSmall}>{detail.evidence}</dd>
          </div>
          <div>
            <dt className={p.key}>Sources</dt>
            <dd className={x.monoSmall}>{detail.sources.length > 0 ? detail.sources.join(" · ") : "—"}</dd>
          </div>
          {detail.controlId && (
            <div>
              <dt className={p.key}>Contrôle</dt>
              <dd className={x.monoSmall}>{detail.controlId}</dd>
            </div>
          )}
          <div>
            <dt className={p.key}>Historique de revue</dt>
            <dd>
              {history.length === 0
                ? detail.review
                : history.map((event) => (
                    <span key={event.id} className={x.block}>
                      {labelOf(event.action)}
                      {event.comment ? ` — ${event.comment}` : ""}
                    </span>
                  ))}
            </dd>
          </div>
        </dl>

        <label className={x.drawerComment}>
          <span className={p.key}>Commentaire de revue</span>
          <textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Documenter la décision…"
            className={`${p.input} ${x.textarea}`}
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
        <div className={x.drawerActions}>
          {QUICK_ACTIONS.map((action, index) => (
            <button
              key={action}
              type="button"
              disabled={!canDecide}
              className={index === 0 ? p.btnPrimary : p.btnSecondary}
              onClick={() => (action === "attach_evidence" ? fileRef.current?.click() : void decide(action))}
            >
              {labelOf(action)}
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className={x.drawerStatus}>
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
