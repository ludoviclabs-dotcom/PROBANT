"use client";

/**
 * La décision : barre collante en bas de page (plan 2, filet fort). À gauche le résumé de la chaîne append-only,
 * au centre le constat, l'action et le commentaire, à droite le menu « Exporter » (tous les exports du dossier de
 * preuve) et le bouton primaire « Enregistrer la revue fiscale ». Logique inchangée : seul l'habillage suit la
 * charte (filets, rayons 2 px, aucune ombre, cibles de 44 px). Sous 760 px, « Revue » déplie les champs.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReviewEventAction } from "@/lib/canonical-model";
import { buildTaxEvidenceExportPackage, verifyTaxEvidenceExportPackage } from "@/lib/evidence/tax-package";
import type { TaxEvidenceExportPackage } from "@/lib/evidence/tax-types";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import p from "@/components/charte/page.module.css";
import { REVIEW_ACTIONS, type TaxReviewSession } from "./useTaxReviewSession";
import x from "./fiscalite.module.css";

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
    <div className={x.bar} data-open={open}>
      <section aria-label="Revue append-only des constats fiscaux" className={x.barReview}>
        <p role="status" aria-live="polite" className={x.barSummary} data-idle={!session.busy && !session.message}>
          {summary}
        </p>
        <div className={x.barFields}>
          <label className={x.barField}>
            <span className={p.key}>Constat</span>
            <select
              aria-label="Constat fiscal à revoir"
              value={findingId}
              onChange={(event) => onFindingChange(event.target.value)}
              className={x.control}
            >
              {session.findings.map((finding) => (
                <option key={finding.id} value={finding.id}>
                  {finding.title}
                </option>
              ))}
            </select>
          </label>
          <label className={x.barField}>
            <span className={p.key}>Action</span>
            <select
              aria-label="Action de revue fiscale"
              value={action}
              onChange={(event) => setAction(event.target.value as ReviewEventAction)}
              className={x.control}
            >
              {REVIEW_ACTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`${x.barField} ${x.barComment}`}>
            <span className={p.key}>Commentaire</span>
            <input
              ref={commentRef}
              aria-label="Commentaire de revue fiscale"
              placeholder="Commentaire…"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className={x.control}
            />
          </label>
          {action === "attach_evidence" && (
            <label className={x.barField}>
              <span className={p.key}>Justificatif</span>
              <input
                ref={fileRef}
                aria-label="Justificatif fiscal"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className={`${x.control} ${x.fileControl}`}
              />
            </label>
          )}
        </div>
      </section>

      <div className={x.barActions}>
        <button type="button" className={`${p.btnSecondary} ${x.barToggle}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Revue
        </button>
        <ExportMenu source={source} session={session} />
        <button
          type="button"
          className={`${p.btnPrimary} ${x.barSave}`}
          aria-label="Enregistrer la revue fiscale"
          disabled={session.busy || session.findings.length === 0}
          onClick={() => void save()}
        >
          {/* Un seul nœud de texte : le `gap` du bouton ne doit pas s'insérer entre les deux morceaux du libellé. */}
          <span>
            Enregistrer<span className={x.hideNarrow}> la revue fiscale</span>
          </span>
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
    <section ref={rootRef} aria-label="Exports du dossier de preuve fiscal" className={x.exportRoot}>
      {open && (
        <div id={menuId} className={x.exportMenu}>
          {items.map((item) => (
            <button key={item.label} type="button" disabled={busy} className={x.exportItem} onClick={item.onClick}>
              {item.label}
            </button>
          ))}
          <p role="status" aria-live="polite" className={x.exportStatus} data-message={message ? "" : undefined}>
            {busy ? "Génération du paquet fiscal…" : message || "PDF standard ; PDF/A non validé. Aucun avis juridique."}
          </p>
        </div>
      )}
      <button
        type="button"
        className={p.btnSecondary}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Exporter
      </button>
    </section>
  );
}
