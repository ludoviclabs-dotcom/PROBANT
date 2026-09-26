"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import {
  buildTaxEvidenceExportPackage,
  verifyTaxEvidenceExportPackage,
} from "@/lib/evidence/tax-package";
import type { TaxEvidenceExportPackage } from "@/lib/evidence/tax-types";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import type { ReviewEvent } from "@/lib/canonical-model";
import { FONT } from "@/components/synthesis/tokens";
import { INK_FAINT } from "./cockpit-style";

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

const itemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  padding: "9px 11px",
  textAlign: "left",
  fontSize: FONT.table,
  color: "#c7d3e4",
  cursor: "pointer",
};

/**
 * Menu « Exporter » de la barre de décision : les six exports du paquet de
 * preuve fiscal (JSON, CSV, notes HTML/PDF, manifeste, vérification des
 * empreintes) regroupés derrière un seul bouton. Handlers et formats inchangés.
 */
export function TaxEvidenceExportToolbar({
  source,
  reviewEvents = [],
  supplementalEvidence = [],
}: {
  source: TaxCockpitSource;
  reviewEvents?: readonly ReviewEvent[];
  supplementalEvidence?: readonly TaxSupplementalEvidence[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const cache = useRef<{ readonly key: string; readonly promise: Promise<TaxEvidenceExportPackage> } | null>(null);
  const packageKey = [
    source.synthesis.snapshotHash,
    ...reviewEvents.map((event) => event.eventHash),
    ...supplementalEvidence.map((item) => item.sha256),
  ].join(":");
  const getPackage = useCallback(() => {
    if (cache.current?.key !== packageKey) {
      cache.current = {
        key: packageKey,
        promise: buildTaxEvidenceExportPackage({ source, reviewEvents, supplementalEvidence }, {
          applicationVersion: APPLICATION_VERSION,
          activeContext: {
            organizationId: source.organizationId,
            dossierId: source.dossierId,
          },
        }),
      };
    }
    return cache.current.promise;
  }, [packageKey, reviewEvents, source, supplementalEvidence]);
  const run = useCallback(async (action: (pack: TaxEvidenceExportPackage) => void) => {
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
  }, [getPackage]);

  // Le message suit le menu : il disparaît avec lui, sauf génération en cours.
  useEffect(() => {
    if (!open && !busy) setMessage("");
  }, [open, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <section
      ref={rootRef}
      aria-label="Exports du dossier de preuve fiscal"
      style={{ position: "relative" }}
    >
      {(open || busy) && (
        <div
          className="pbz-fade"
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            right: 0,
            width: 250,
            zIndex: 55,
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 12,
            background: "#14171e",
            padding: 6,
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
          }}
        >
          {open && (
          <div id={panelId}>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) => {
            download(pack.taxProfileJson, "application/json;charset=utf-8", "tax-profile.json");
            download(pack.taxComputationJson, "application/json;charset=utf-8", "tax-computation.json");
          })}>Exporter JSON fiscaux</button>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) => {
            download(pack.csv.reconciliationLines, "text/csv;charset=utf-8", "tax-reconciliation-lines.csv");
            download(pack.csv.findings, "text/csv;charset=utf-8", "tax-findings.csv");
            download(pack.csv.controls, "text/csv;charset=utf-8", "tax-controls.csv");
            download(pack.csv.sources, "text/csv;charset=utf-8", "tax-sources.csv");
            download(pack.csv.reviewEvents, "text/csv;charset=utf-8", "tax-review-events.csv");
          })}>Exporter CSV fiscaux</button>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) =>
            download(pack.html, "text/html;charset=utf-8", "fiscal-note.html"))}>Note HTML</button>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) =>
            download(pack.pdf, "application/pdf", "fiscal-note.pdf"))}>Note PDF</button>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) =>
            download(pack.manifestJson, "application/json;charset=utf-8", "tax-manifest.json"))}>Manifeste</button>
          <button type="button" className="pbz-focusable pbz-row" disabled={busy} style={itemStyle} onClick={() => void run((pack) => {
            const errors = verifyTaxEvidenceExportPackage(pack);
            setMessage(errors.length === 0
              ? `Hashes vérifiés · ${pack.manifest.artifacts.length} artefacts`
              : `Échec : ${errors.join(", ")}`);
          })}>Vérifier les empreintes</button>
          </div>
          )}
          <p role="status" aria-live="polite" style={{ margin: "6px 11px 4px", fontSize: FONT.meta, lineHeight: 1.5, color: INK_FAINT }}>
            {busy ? "Génération du paquet fiscal…" : message || "PDF standard; PDF/A non validé. Aucun avis juridique."}
          </p>
        </div>
      )}
      <button
        type="button"
        className="pbz-focusable"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 9,
          background: "transparent",
          padding: "10px 14px",
          fontSize: FONT.table,
          color: "#c7d3e4",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Exporter
        <ChevronUp aria-hidden="true" size={13} style={{ transition: "transform .2s ease", transform: open ? undefined : "rotate(180deg)" }} />
      </button>
    </section>
  );
}
