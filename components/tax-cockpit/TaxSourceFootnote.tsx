"use client";

/**
 * Primitives partagées du cockpit fiscalité (TAX-08).
 *
 * `TaxSourceFootnote`, `TaxMethodologyPopover` et `AccessibleTaxChartTable`
 * délèguent aux primitives de la Synthèse : même contrat `VisualizationDataset`,
 * aucune divergence de contenu. La refonte les replie derrière un lien discret
 * « Sources et méthodologie ↓ » : la traçabilité reste à un clic, sans bruit.
 * `TaxChartCard` est l'enveloppe standard d'un bloc : zone sans bordure,
 * titre, phrase de lecture, contenu, sources repliées.
 */

import { useId, useState } from "react";
import type { VisualizationDataset } from "@/lib/visualization/types";
import { AccessibleChartTable } from "@/components/synthesis/AccessibleChartTable";
import { MethodologyPopover } from "@/components/synthesis/MethodologyPopover";
import { SourceFootnote } from "@/components/synthesis/SourceFootnote";
import { FONT } from "@/components/synthesis/tokens";
import { BLOCK_TITLE, EYEBROW, INK_FAINT, QUIET_BUTTON, READING } from "./cockpit-style";

export function TaxSourceFootnote({ dataset }: { dataset: VisualizationDataset }) {
  return <SourceFootnote dataset={dataset} />;
}

export function TaxMethodologyPopover({ dataset }: { dataset: VisualizationDataset }) {
  return <MethodologyPopover dataset={dataset} />;
}

export function AccessibleTaxChartTable({
  dataset,
  defaultOpen = false,
}: {
  dataset: VisualizationDataset;
  defaultOpen?: boolean;
}) {
  return <AccessibleChartTable dataset={dataset} defaultOpen={defaultOpen} />;
}

/**
 * Accordéon « Sources et méthodologie » : méthodologie du dataset, sources
 * normatives et alternative tabulaire. Replié par défaut.
 */
export function SourcesDisclosure({
  dataset,
  defaultOpen = false,
  tableOpen = false,
  style,
}: {
  dataset: VisualizationDataset;
  defaultOpen?: boolean;
  tableOpen?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div style={style}>
      <button
        type="button"
        className="pbz-focusable pbz-quiet"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        style={QUIET_BUTTON}
      >
        Sources et méthodologie{" "}
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            transition: "transform .2s ease",
            transform: open ? "rotate(180deg)" : undefined,
          }}
        >
          ↓
        </span>
      </button>
      {open && (
        <div id={panelId} className="pbz-fade" style={{ marginTop: 8, maxWidth: "90ch" }}>
          {dataset.methodology && (
            <p style={{ margin: 0, fontSize: FONT.meta, lineHeight: 1.8, color: INK_FAINT }}>
              {dataset.methodology}
            </p>
          )}
          <TaxSourceFootnote dataset={dataset} />
          <AccessibleTaxChartTable dataset={dataset} defaultOpen={tableOpen} />
        </div>
      )}
    </div>
  );
}

/** Enveloppe standard d'un bloc du cockpit fiscalité (zone sans bordure). */
export function TaxChartCard({
  dataset,
  eyebrow,
  reading,
  children,
  tableOpen = false,
  sourcesOpen = false,
}: {
  dataset: VisualizationDataset;
  eyebrow?: string;
  /** Phrase de lecture placée au-dessus du graphique. */
  reading?: string;
  children: React.ReactNode;
  tableOpen?: boolean;
  sourcesOpen?: boolean;
}) {
  return (
    <section aria-label={dataset.title} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div style={{ ...EYEBROW, letterSpacing: ".14em", marginBottom: 6 }}>{eyebrow}</div>}
          <h3 style={BLOCK_TITLE}>{dataset.title}</h3>
        </div>
        <TaxMethodologyPopover dataset={dataset} />
      </div>
      {reading && <p style={READING}>{reading}</p>}
      <div style={{ marginTop: 20 }}>{children}</div>
      <SourcesDisclosure
        dataset={dataset}
        defaultOpen={sourcesOpen || tableOpen}
        tableOpen={tableOpen}
        style={{ marginTop: 18 }}
      />
    </section>
  );
}
