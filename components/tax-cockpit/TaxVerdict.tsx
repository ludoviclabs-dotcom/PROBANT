"use client";

/**
 * Acte I — le verdict. Une phrase de synthèse générée depuis les datasets, la chaîne de preuve en strates, un
 * bandeau de cinq mesures sous filets et UNE seule prochaine action. Les chiffres sont en mono, les titres en
 * serif ; rien n'est recompté ici.
 */

import type { ReactNode } from "react";
import p from "@/components/charte/page.module.css";
import {
  buildRibbon,
  buildVerdictHeadline,
  buildVerdictSupport,
  type TaxCockpitDatasets,
} from "@/lib/tax/cockpit";
import { ActLine } from "./ActLine";
import { TaxProofStrata } from "./TaxProofStrata";
import x from "./fiscalite.module.css";

/** Montants et dénombrements : `25`, `22`, `20,00 €`, `24 850,00 €` (espaces fines ou insécables comprises). */
const FIGURE = /(\d+(?:[   ]\d{3})*(?:,\d+)?(?:[   ]?€)?)/u;

/** Met les chiffres de la phrase en mono, sans toucher au texte (le nom accessible reste la phrase entière). */
function withFigures(text: string): ReactNode[] {
  return text.split(FIGURE).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className={x.figure}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function TaxVerdict({
  datasets,
  onTreatNextAction,
}: {
  datasets: TaxCockpitDatasets;
  /** Ouvre la revue sur les constats liés à la recommandation. */
  onTreatNextAction?: (controlIds: readonly string[]) => void;
}) {
  const ribbon = buildRibbon(datasets);
  const next = datasets.capability.nextAction;
  const headline = buildVerdictHeadline(datasets);
  const prefix = `Exercice ${datasets.summary.fiscalYear} — `;
  const total = datasets.coverage.totalControls;

  return (
    <section aria-labelledby="tax-verdict-title" className={x.act}>
      <ActLine numeral="I" name="Le verdict" />
      <div className={x.verdictGrid}>
        <div className={x.verdictMain}>
          <h2 id="tax-verdict-title" className={x.verdict}>
            {headline.startsWith(prefix) ? (
              <>
                {prefix}
                {withFigures(headline.slice(prefix.length))}
              </>
            ) : (
              withFigures(headline)
            )}
          </h2>
          <p className={x.support}>{buildVerdictSupport(datasets)}</p>
        </div>
        <TaxProofStrata summary={datasets.summary} />
      </div>

      <dl className={`${p.measures} ${x.ribbon}`}>
        {ribbon.map((metric) => {
          const concluded = metric.id === "controls-concluded" ? Number.parseInt(metric.value, 10) : null;
          return (
            <div key={metric.id} className={p.measure} title={metric.tooltip} data-metric={metric.id}>
              <dt className={p.measureHead}>{metric.label}</dt>
              <dd className={x.metricValue} data-tone={metric.tone}>
                {metric.value}
                {metric.suffix && <span className={x.metricSuffix}>{metric.suffix}</span>}
                {concluded !== null && Number.isFinite(concluded) && total > 0 && (
                  <span className={x.metricBar} aria-hidden="true">
                    <span style={{ flexGrow: concluded }} data-part="done" />
                    <span style={{ flexGrow: Math.max(0, total - concluded) }} data-part="rest" />
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {next && (
        <div className={x.next}>
          <div className={x.nextText}>
            <p className={p.eyebrow}>Prochaine action</p>
            <p className={x.nextTitle}>{next.title}</p>
            <p className={x.nextSentence}>{next.action}</p>
          </div>
          <button
            type="button"
            className={p.btnPrimary}
            onClick={() => onTreatNextAction?.(next.controlIds)}
            disabled={!onTreatNextAction}
          >
            Traiter dans la revue
          </button>
        </div>
      )}
    </section>
  );
}
