"use client";

/**
 * Note de source d'un graphique — les références normatives ou de code qui
 * fondent la visualisation. Texte simple, lisible par tous.
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { FONT, T } from "./tokens";

export function SourceFootnote({ dataset }: { dataset: VisualizationDataset }) {
  if (!dataset.sourceRefs || dataset.sourceRefs.length === 0) return null;
  return (
    <p
      style={{
        margin: "8px 0 0",
        fontSize: FONT.meta,
        lineHeight: 1.5,
        color: T.faint,
      }}
    >
      Sources : {dataset.sourceRefs.join(" · ")}
    </p>
  );
}

/** Enveloppe standard d'une carte graphique : titre, méthodo, contenu, table, sources. */
export function ChartCard({
  dataset,
  eyebrow,
  children,
  tableOpen = false,
}: {
  dataset: VisualizationDataset;
  eyebrow?: string;
  children: React.ReactNode;
  tableOpen?: boolean;
}) {
  return (
    <section
      aria-label={dataset.title}
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        background: T.surface2,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          {eyebrow && (
            <div
              style={{
                fontSize: FONT.meta - 2,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".09em",
                color: T.faint,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h3 style={{ margin: "3px 0 0", fontSize: FONT.body, fontWeight: 600, color: T.text }}>
            {dataset.title}
          </h3>
        </div>
        <MethodologyPopoverLazy dataset={dataset} />
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
      <AccessibleChartTableLazy dataset={dataset} defaultOpen={tableOpen} />
      <SourceFootnote dataset={dataset} />
    </section>
  );
}

// Imports locaux en bas de fichier pour éviter la circularité de barrels.
import { AccessibleChartTable as AccessibleChartTableLazy } from "./AccessibleChartTable";
import { MethodologyPopover as MethodologyPopoverLazy } from "./MethodologyPopover";
