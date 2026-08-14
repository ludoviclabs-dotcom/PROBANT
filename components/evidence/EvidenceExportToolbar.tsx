"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveDossier } from "@/lib/dossier/client";
import {
  buildEvidenceExportPackage,
  verifyEvidenceExportPackage,
} from "@/lib/evidence/package";
import type { EvidenceExportPackage } from "@/lib/evidence/types";
import type { SynthesisSnapshot } from "@/lib/synthesis";

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

const buttonStyle = {
  border: "1px solid #324563",
  borderRadius: 9,
  background: "#0f1419",
  color: "#e6edf6",
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
} as const;

export function EvidenceExportToolbar({ synthesis }: { synthesis: SynthesisSnapshot }) {
  const { context, snapshot, resetToDemo } = useActiveDossier();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cache = useRef<{ key: string; promise: Promise<EvidenceExportPackage> } | null>(null);
  const cacheKey = `${context.organizationId}:${context.dossierId}:${synthesis.snapshotHash}`;

  useEffect(() => {
    cache.current = null;
    setMessage("");
  }, [cacheKey]);

  const getPackage = useCallback(() => {
    if (cache.current?.key === cacheKey) return cache.current.promise;
    const promise = buildEvidenceExportPackage(snapshot, synthesis, {
      applicationVersion: APPLICATION_VERSION,
      activeContext: context,
    });
    cache.current = { key: cacheKey, promise };
    return promise;
  }, [cacheKey, context, snapshot, synthesis]);

  const run = useCallback(async (action: (pack: EvidenceExportPackage) => void) => {
    setBusy(true);
    setMessage("");
    try {
      action(await getPackage());
    } catch (error) {
      cache.current = null;
      setMessage(error instanceof Error ? error.message : "Export impossible.");
    } finally {
      setBusy(false);
    }
  }, [getPackage]);

  const artifactName = useCallback(
    (pack: EvidenceExportPackage, format: EvidenceExportPackage["manifest"]["artifacts"][number]["format"]) =>
      pack.manifest.artifacts.find((artifact) => artifact.format === format)?.fileName ?? `probant-${format}`,
    [],
  );

  return (
    <section
      aria-label="Exports du dossier de preuve"
      style={{ border: "1px solid #1c2430", borderRadius: 12, padding: 12, background: "#0b0e13", marginBottom: 16 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => download(pack.canonicalJson, "application/json;charset=utf-8", artifactName(pack, "canonical_json")))}>Exporter JSON</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => {
          download(pack.csv.findings, "text/csv;charset=utf-8", artifactName(pack, "findings_csv"));
          download(pack.csv.reviewEvents, "text/csv;charset=utf-8", artifactName(pack, "review_events_csv"));
          download(pack.csv.controls, "text/csv;charset=utf-8", artifactName(pack, "controls_csv"));
          download(pack.csv.sources, "text/csv;charset=utf-8", artifactName(pack, "sources_csv"));
        })}>Exporter CSV</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => download(pack.html, "text/html;charset=utf-8", artifactName(pack, "accessible_html")))}>Exporter HTML</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => download(pack.pdf, "application/pdf", artifactName(pack, "pdf")))}>Exporter PDF</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => download(pack.manifestJson, "application/json;charset=utf-8", `manifest-${synthesis.snapshotHash.slice(0, 12)}.json`))}>Télécharger manifeste</button>
        <button type="button" disabled={busy} style={buttonStyle} onClick={() => void run((pack) => {
          const errors = verifyEvidenceExportPackage(pack);
          setMessage(errors.length === 0 ? `Hashes vérifiés · ${pack.manifest.artifacts.length} artefacts` : `Échec : ${errors.join(", ")}`);
        })}>Vérifier hash</button>
        {snapshot.sourceKind === "demo" && (
          <button type="button" disabled={busy} style={buttonStyle} onClick={() => void resetToDemo().then(() => setMessage("Démonstration réinitialisée."))}>Réinitialiser DEMO</button>
        )}
      </div>
      <p role="status" aria-live="polite" style={{ minHeight: 18, margin: "8px 0 0", color: message.startsWith("Échec") ? "#f87171" : "#8a99af", fontSize: 11.5 }}>
        {busy ? "Génération du paquet de preuve…" : message || "PDF standard dérivé du HTML accessible; statut d'archivage non validé."}
      </p>
    </section>
  );
}
