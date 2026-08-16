"use client";

/**
 * Primitives partagées du cockpit fiscalité (TAX-08).
 *
 * `TaxSourceFootnote`, `TaxMethodologyPopover` et `AccessibleTaxChartTable`
 * délèguent aux primitives de la Synthèse : même contrat `VisualizationDataset`,
 * même rendu, aucune divergence de langage visuel. `TaxChartCard` est
 * l'enveloppe standard d'un panneau du cockpit (titre, méthodo, contenu,
 * alternative tabulaire, sources).
 */

import type { VisualizationDataset } from "@/lib/visualization/types";
import { AccessibleChartTable } from "@/components/synthesis/AccessibleChartTable";
import { MethodologyPopover } from "@/components/synthesis/MethodologyPopover";
import { SourceFootnote } from "@/components/synthesis/SourceFootnote";
import { FONT, T } from "@/components/synthesis/tokens";

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

/** Enveloppe standard d'un panneau du cockpit fiscalité. */
export function TaxChartCard({
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          {eyebrow && (
            <div
              style={{
                fontSize: FONT.meta - 2,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".09em",
                color: T.muted,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h3 style={{ margin: "3px 0 0", fontSize: FONT.body, fontWeight: 600, color: T.text }}>
            {dataset.title}
          </h3>
        </div>
        <TaxMethodologyPopover dataset={dataset} />
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
      <AccessibleTaxChartTable dataset={dataset} defaultOpen={tableOpen} />
      <TaxSourceFootnote dataset={dataset} />
    </section>
  );
}
