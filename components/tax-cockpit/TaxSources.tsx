"use client";

/**
 * « Sources et méthodologie » — la traçabilité (méthode, articles, moteurs, tableau de données de la figure) reste
 * accessible mais repliée : c'est de la preuve, pas de la lecture principale. Le tableau rend le MÊME dataset que la
 * figure (colonnes, lignes, résumé en légende) — mêmes libellés que les moteurs, sans projection d'affichage —, dans
 * un registre de la charte : filets, chiffres en mono, aucune couleur porteuse de sens.
 */

import { useId, useState } from "react";
import p from "@/components/charte/page.module.css";
import type { VisualizationDataset } from "@/lib/visualization/types";
import x from "./fiscalite.module.css";

export function SourcesToggle({
  dataset,
  open,
  onToggle,
  controls,
}: {
  dataset: VisualizationDataset;
  open: boolean;
  onToggle: () => void;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className={p.btnQuiet}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-label={`Sources et méthodologie : ${dataset.title}`}
      onClick={onToggle}
    >
      Sources et méthodologie {open ? "↑" : "↓"}
    </button>
  );
}

export function SourcesPanel({ dataset, id }: { dataset: VisualizationDataset; id?: string }) {
  return (
    <div id={id} className={x.sourcesPanel}>
      <p className={x.methodText}>
        {dataset.methodology}
        {dataset.sourceRefs && dataset.sourceRefs.length > 0 && (
          <>
            {" "}
            <span className={x.mono}>Sources : {dataset.sourceRefs.join(" · ")}</span>
          </>
        )}
      </p>
      <DatasetTable dataset={dataset} />
    </div>
  );
}

export function SourcesBlock({ dataset }: { dataset: VisualizationDataset }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={x.sourcesBlock}>
      <SourcesToggle dataset={dataset} open={open} onToggle={() => setOpen((o) => !o)} controls={id} />
      {open && <SourcesPanel dataset={dataset} id={id} />}
    </div>
  );
}

/** Alternative tabulaire de la figure, repliée derrière son propre `<details>` (navigable au clavier). */
function DatasetTable({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <details className={x.dataDetails}>
      <summary>Données du graphique « {dataset.title} »</summary>
      <div role="region" aria-label={`Tableau de données : ${dataset.title}, défilement horizontal`} tabIndex={0} className={p.scrollX}>
        <table className={`${p.register} ${x.dataTable}`} aria-label={`Tableau de données : ${dataset.title}`}>
          <caption className={x.dataCaption}>{dataset.summary}</caption>
          <thead>
            <tr>
              {dataset.columns.map((column) => (
                <th key={column.key} scope="col" className={column.align === "right" ? p.num : undefined}>
                  {column.label}
                  {column.unit ? ` (${column.unit})` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.rows.length === 0 ? (
              <tr>
                <td colSpan={dataset.columns.length} className={p.faint}>
                  Aucune donnée.
                </td>
              </tr>
            ) : (
              dataset.rows.map((row) => (
                <tr key={row.id} data-emphasis={row.emphasis}>
                  {dataset.columns.map((column) => {
                    const value = row.cells[column.key];
                    const numeric = typeof value === "number" || column.align === "right";
                    return (
                      <td key={column.key} className={numeric ? p.num : undefined}>
                        {value ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
