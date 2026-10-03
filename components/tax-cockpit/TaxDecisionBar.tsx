"use client";

/**
 * Acte IV — la décision : barre sticky en bas de page. À gauche le résumé de
 * la chaîne append-only, au centre le constat + l'action + le commentaire, à
 * droite le menu « Exporter » (tous les exports du dossier de preuve) et le
 * bouton primaire « Enregistrer la revue fiscale ». Comportement identique à
 * l'ancien panneau de revue et à l'ancienne barre d'export.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import type { ReviewEventAction } from "@/lib/canonical-model";
import { buildTaxEvidenceExportPackage, verifyTaxEvidenceExportPackage } from "@/lib/evidence/tax-package";
import type { TaxEvidenceExportPackage } from "@/lib/evidence/tax-types";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import { BODY, C, MONO } from "./fiscal-style";
import { REVIEW_ACTIONS, type TaxReviewSession } from "./useTaxReviewSession";

const APPLICATION_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

function download(content: string | Uint8Array, mediaType: string, fileName: string): void {
  const blob = new Blob([content as BlobPart], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const field: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 9,
  background: "rgba(255,255,255,.03)",
  padding: "9px 11px",
  fontFamily: BODY,
  fontSize: 12.5,
  color: C.text,
};

export function TaxDecisionBar({
  source,
  session,
  findingId,
  onFindingChange,
  focusSignal,
}: {
  source: TaxCockpitSource;
  session: TaxReviewSession;
  findingId: string;
  onFindingChange: (findingId: string) => void;
  /** Incrémenté par le parent pour amener le focus sur le commentaire. */
  focusSignal: number;
}) {
  const [action, setAction] = useState<ReviewEventAction>("confirm");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const commentRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal > 0) {
      setOpen(true);
      commentRef.current?.focus();
    }
  }, [focusSignal]);

  async function save() {
    const saved = await session.save({ findingId, action, comment, file });
    if (saved) {
      setComment("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const summary = session.busy
    ? "Hachage et ajout à la chaîne…"
    : session.message ||
      `${session.events.length} événement(s) · ${session.evidence.length} pièce(s) · snapshot ${session.projectedHash.slice(0, 12)}`;

  return (
    <div
      className="fx-bar"
      data-open={open}
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 50,
        minHeight: 72,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 24px",
        backdropFilter: "blur(14px)",
        background: "rgba(12,14,19,.9)",
        borderTop: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <section
        aria-label="Revue append-only des constats fiscaux"
        style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 18, flexWrap: "wrap" }}
      >
        <p
          role="status"
          aria-live="polite"
          className="fx-bar-summary"
          data-idle={!session.busy && !session.message}
          style={{ margin: 0, maxWidth: 280, fontSize: 11.5, lineHeight: 1.5, color: C.faint }}
        >
          {summary}
        </p>
        <div className="fx-bar-fields" style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10 }}>
          <select
            aria-label="Constat fiscal à revoir"
            value={findingId}
            onChange={(event) => onFindingChange(event.target.value)}
            style={{ ...field, minWidth: 190, maxWidth: 280 }}
          >
            {session.findings.map((finding) => (
              <option key={finding.id} value={finding.id}>
                {finding.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Action de revue fiscale"
            value={action}
            onChange={(event) => setAction(event.target.value as ReviewEventAction)}
            style={field}
          >
            {REVIEW_ACTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            ref={commentRef}
            aria-label="Commentaire de revue fiscale"
            placeholder="Commentaire…"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            style={{ ...field, flex: 1, minWidth: 100 }}
          />
          {action === "attach_evidence" && (
            <input
              ref={fileRef}
              aria-label="Justificatif fiscal"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={{ ...field, maxWidth: 220, fontSize: 11.5 }}
            />
          )}
        </div>
      </section>

      <div
        className="fx-bar-actions"
        style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="fx-bar-toggle fx-btn-ghost"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{
            alignItems: "center",
            gap: 6,
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 9,
            background: "transparent",
            padding: "10px 14px",
            fontFamily: BODY,
            fontSize: 12.5,
            color: C.textSoft,
            cursor: "pointer",
          }}
        >
          Revue
        </button>
        <ExportMenu source={source} session={session} />
        <button
          type="button"
          className="fx-btn-primary"
          disabled={session.busy || session.findings.length === 0}
          onClick={() => void save()}
          style={{
            border: 0,
            borderRadius: 9,
            background: C.accent,
            padding: "10px 16px",
            fontFamily: BODY,
            fontSize: 12.5,
            fontWeight: 600,
            color: "#061019",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Enregistrer <span className="fx-hide-m">la revue fiscale</span>
        </button>
      </div>
    </div>
  );
}

function ExportMenu({ source, session }: { source: TaxCockpitSource; session: TaxReviewSession }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const cache = useRef<{ readonly key: string; readonly promise: Promise<TaxEvidenceExportPackage> } | null>(null);
  const { events: reviewEvents, evidence: supplementalEvidence } = session;
  const packageKey = [
    source.synthesis.snapshotHash,
    ...reviewEvents.map((event) => event.eventHash),
    ...supplementalEvidence.map((item) => item.sha256),
  ].join(":");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const getPackage = useCallback(() => {
    if (cache.current?.key !== packageKey) {
      cache.current = {
        key: packageKey,
        promise: buildTaxEvidenceExportPackage(
          { source, reviewEvents, supplementalEvidence },
          {
            applicationVersion: APPLICATION_VERSION,
            activeContext: { organizationId: source.organizationId, dossierId: source.dossierId },
          },
        ),
      };
    }
    return cache.current.promise;
  }, [packageKey, reviewEvents, source, supplementalEvidence]);

  const run = useCallback(
    async (action: (pack: TaxEvidenceExportPackage) => void) => {
      setBusy(true);
      setMessage("");
      try {
        action(await getPackage());
      } catch (error) {
        cache.current = null;
        setMessage(error instanceof Error ? error.message : "Export fiscal impossible.");
      } finally {
        setBusy(false);
      }
    },
    [getPackage],
  );

  const items: { label: string; onClick: () => void }[] = [
    {
      label: "Exporter JSON fiscaux",
      onClick: () =>
        void run((pack) => {
          download(pack.taxProfileJson, "application/json;charset=utf-8", "tax-profile.json");
          download(pack.taxComputationJson, "application/json;charset=utf-8", "tax-computation.json");
        }),
    },
    {
      label: "Exporter CSV fiscaux",
      onClick: () =>
        void run((pack) => {
          download(pack.csv.reconciliationLines, "text/csv;charset=utf-8", "tax-reconciliation-lines.csv");
          download(pack.csv.findings, "text/csv;charset=utf-8", "tax-findings.csv");
          download(pack.csv.controls, "text/csv;charset=utf-8", "tax-controls.csv");
          download(pack.csv.sources, "text/csv;charset=utf-8", "tax-sources.csv");
          download(pack.csv.reviewEvents, "text/csv;charset=utf-8", "tax-review-events.csv");
        }),
    },
    {
      label: "Note HTML",
      onClick: () => void run((pack) => download(pack.html, "text/html;charset=utf-8", "fiscal-note.html")),
    },
    {
      label: "Note PDF",
      onClick: () => void run((pack) => download(pack.pdf, "application/pdf", "fiscal-note.pdf")),
    },
    {
      label: "Manifeste",
      onClick: () =>
        void run((pack) => download(pack.manifestJson, "application/json;charset=utf-8", "tax-manifest.json")),
    },
    {
      label: "Vérifier",
      onClick: () =>
        void run((pack) => {
          const errors = verifyTaxEvidenceExportPackage(pack);
          setMessage(
            errors.length === 0
              ? `Hashes vérifiés · ${pack.manifest.artifacts.length} artefacts`
              : `Échec : ${errors.join(", ")}`,
          );
        }),
    },
  ];

  return (
    <section ref={rootRef} aria-label="Exports du dossier de preuve fiscal" style={{ position: "relative" }}>
      {open && (
        <div
          id={menuId}
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            right: 0,
            width: 226,
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 12,
            background: C.drawer,
            padding: 6,
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            animation: "fxFadeIn .16s ease-out both",
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={busy}
              className="fx-menu-item"
              onClick={item.onClick}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                padding: "9px 11px",
                textAlign: "left",
                fontFamily: BODY,
                fontSize: 12.5,
                color: C.textSoft,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
          <p
            role="status"
            aria-live="polite"
            style={{ margin: "6px 11px 4px", minHeight: 15, fontSize: 10.5, lineHeight: 1.5, color: C.muted, fontFamily: message ? MONO : BODY }}
          >
            {busy ? "Génération du paquet fiscal…" : message || "PDF standard ; PDF/A non validé. Aucun avis juridique."}
          </p>
        </div>
      )}
      <button
        type="button"
        className="fx-btn-ghost"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 9,
          background: "transparent",
          padding: "10px 14px",
          fontFamily: BODY,
          fontSize: 12.5,
          color: C.textSoft,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Exporter
        <ChevronUp size={13} aria-hidden="true" />
      </button>
    </section>
  );
}
