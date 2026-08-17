"use client";

import { useCallback, useRef, useState } from "react";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import {
  buildTaxEvidenceExportPackage,
  verifyTaxEvidenceExportPackage,
} from "@/lib/evidence/tax-package";
import type { TaxEvidenceExportPackage } from "@/lib/evidence/tax-types";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import type { ReviewEvent } from "@/lib/canonical-model";
import { FONT, T } from "@/components/synthesis/tokens";

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

const buttonStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  background: T.surface,
  color: T.text,
  padding: "7px 11px",
  fontSize: FONT.meta,
  fontWeight: 600,
  cursor: "pointer",
};

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

  return (
    <section
      aria-label="Exports du dossier de preuve fiscal"
      style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, background: T.surface }}
    >
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => {
          download(pack.taxProfileJson, "application/json;charset=utf-8", "tax-profile.json");
          download(pack.taxComputationJson, "application/json;charset=utf-8", "tax-computation.json");
        })}>Exporter JSON fiscaux</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => {
          download(pack.csv.reconciliationLines, "text/csv;charset=utf-8", "tax-reconciliation-lines.csv");
          download(pack.csv.findings, "text/csv;charset=utf-8", "tax-findings.csv");
          download(pack.csv.controls, "text/csv;charset=utf-8", "tax-controls.csv");
          download(pack.csv.sources, "text/csv;charset=utf-8", "tax-sources.csv");
          download(pack.csv.reviewEvents, "text/csv;charset=utf-8", "tax-review-events.csv");
        })}>Exporter CSV fiscaux</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) =>
          download(pack.html, "text/html;charset=utf-8", "fiscal-note.html"))}>Note HTML</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) =>
          download(pack.pdf, "application/pdf", "fiscal-note.pdf"))}>Note PDF</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) =>
          download(pack.manifestJson, "application/json;charset=utf-8", "tax-manifest.json"))}>Manifeste</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => {
          const errors = verifyTaxEvidenceExportPackage(pack);
          setMessage(errors.length === 0
            ? `Hashes vérifiés · ${pack.manifest.artifacts.length} artefacts`
            : `Échec : ${errors.join(", ")}`);
        })}>Vérifier</button>
      </div>
      <p role="status" aria-live="polite" style={{ margin: "8px 0 0", minHeight: 17, color: T.muted, fontSize: FONT.meta }}>
        {busy ? "Génération du paquet fiscal…" : message || "PDF standard; PDF/A non validé. Aucun avis juridique."}
      </p>
    </section>
  );
}
