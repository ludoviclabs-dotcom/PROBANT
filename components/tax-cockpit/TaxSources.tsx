"use client";

/**
 * « Sources et méthodologie ↓ » — la traçabilité (articles, moteurs, tableau
 * de données du graphique) reste accessible mais repliée par défaut : c'est de
 * la preuve, pas de la lecture principale. Contenu issu du dataset.
 */

import { useState } from "react";
import { AccessibleChartTable } from "@/components/synthesis/AccessibleChartTable";
import type { VisualizationDataset } from "@/lib/visualization/types";
import { BODY, C, MONO } from "./fiscal-style";


export function SourcesToggle({
  dataset,
  open,
  onToggle,
}: {
  dataset: VisualizationDataset;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="fx-link"
      aria-expanded={open}
      aria-label={`Sources et méthodologie : ${dataset.title}`}
      onClick={onToggle}
      style={{
        border: 0,
        background: "transparent",
        padding: "4px 0",
        fontFamily: BODY,
        fontSize: 12,
        color: C.muted,
        cursor: "pointer",
      }}
    >
      Sources et méthodologie {open ? "↑" : "↓"}
    </button>
  );
}

export function SourcesPanel({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <div style={{ animation: "fxFadeIn .25s ease-out both" }}>
      <p style={{ margin: "14px 0 0", maxWidth: "90ch", fontSize: 11.5, lineHeight: 1.8, color: C.faint }}>
        {dataset.methodology}
        {dataset.sourceRefs && dataset.sourceRefs.length > 0 && (
          <>
            {" "}
            <span style={{ fontFamily: MONO }}>Sources : {dataset.sourceRefs.join(" · ")}</span>
          </>
        )}
      </p>
      <AccessibleChartTable dataset={dataset} />
    </div>
  );
}

export function SourcesBlock({ dataset }: { dataset: VisualizationDataset }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 18 }}>
      <SourcesToggle dataset={dataset} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && <SourcesPanel dataset={dataset} />}
    </div>
  );
}

