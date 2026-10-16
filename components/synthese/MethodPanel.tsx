"use client";

import { CapabilityAccess } from "@/components/probant/CapabilityAccess";
import { ModuleAvailability } from "@/components/probant/ModuleAvailability";
import { ReviewEventPanel } from "@/components/evidence/ReviewEventPanel";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { SynthesisDatasets, VisualizationDataset } from "@/lib/visualization/types";
import s from "./synthese.module.css";

function DatasetTable({ dataset, caption }: { dataset: VisualizationDataset; caption: string }) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={s.scrollX}>
      <table className={s.dataTable}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {dataset.columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === "right" ? s.alignRight : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.rows.map((row) => (
            <tr key={row.id}>
              {dataset.columns.map((column, i) => {
                const value = row.cells[column.key];
                const text = value === null || value === undefined ? "—" : String(value);
                return i === 0 ? (
                  <th key={column.key} scope="row">{text}</th>
                ) : (
                  <td key={column.key} className={column.align === "right" ? s.alignRight : undefined}>{text}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Couverture des travaux (C03) : procédures réalisées, pièces et versions. Sans travail, rien n'est réputé couvert. */
function WorkCoverage({ dataset }: { dataset: VisualizationDataset }) {
  return (
    <section aria-label="Couverture des travaux" className={s.methodSection}>
      <h3 className={s.methodTitle}>Couverture des travaux</h3>
      {dataset.rows.length === 0 ? (
        <p role="status" className={s.methodNote}>
          Aucune procédure réalisée dans ce dossier : couverture des travaux <strong>non établie</strong>. Aucune assertion n’est réputée couverte sans travail, pièce et version.
        </p>
      ) : (
        <DatasetTable dataset={dataset} caption={dataset.title} />
      )}
      {dataset.methodology && <p className={s.methodHint}>{dataset.methodology}</p>}
    </section>
  );
}

/**
 * Méthode : tout ce qui documente l'analyse sans la conduire — capacités et travaux par cycle, disponibilité par
 * module, couverture des travaux, journal de revue, versions appliquées, empreintes. Replié par défaut ; il s'ouvre
 * de lui-même quand on suit une ancre de preuve (`#wp-…`).
 */
export function MethodPanel({ open, onToggle, snapshot, datasets }: { open: boolean; onToggle: (open: boolean) => void; snapshot: DossierSnapshot; datasets: SynthesisDatasets }) {
  return (
    <details id="methode" open={open} onToggle={(event) => onToggle(event.currentTarget.open)} className={s.method}>
      <summary>
        <span className={s.methodKey}>Méthode</span>
        <span className={s.methodSummary}>capacités, disponibilité et limites par module</span>
      </summary>
      <div className={s.methodBody}>
        <CapabilityAccess />
        <ModuleAvailability snapshot={snapshot} />
        <WorkCoverage dataset={datasets.workCoverage} />
        <ReviewEventPanel />
        <section aria-label="Versions appliquées" className={s.methodSection}>
          <h3 className={s.methodTitle}>Versions appliquées</h3>
          <DatasetTable dataset={datasets.standardsTimeline} caption={datasets.standardsTimeline.title} />
          {datasets.standardsTimeline.sourceRefs && <p className={s.methodHint}>Sources : {datasets.standardsTimeline.sourceRefs.join(" · ")}</p>}
        </section>
        <section aria-label="Empreintes et chaîne du snapshot" className={s.methodSection}>
          <h3 className={s.methodTitle}>Empreintes et chaîne du snapshot</h3>
          <DatasetTable dataset={datasets.evidenceFlow} caption={datasets.evidenceFlow.title} />
          {datasets.evidenceFlow.methodology && <p className={s.methodHint}>{datasets.evidenceFlow.methodology}</p>}
        </section>
        <section aria-label="Zones réglementaires du FEC" className={s.methodSection}>
          <h3 className={s.methodTitle}>Zones réglementaires du FEC (art. A.47 A-1)</h3>
          <DatasetTable dataset={datasets.fecQuality} caption={datasets.fecQuality.title} />
          {datasets.fecQuality.methodology && <p className={s.methodHint}>{datasets.fecQuality.methodology}</p>}
        </section>
      </div>
    </details>
  );
}
