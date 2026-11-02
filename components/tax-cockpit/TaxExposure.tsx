"use client";

/**
 * Acte III — l'exposition. Un registre impôt × cycle (nombre de contrôles, micro-barre décorative, sortie la plus
 * prioritaire en glyphe + mot, décomposition en clair), la ligne « Tous cycles » et sa légende ; puis la zone de
 * travail : toutes les lignes de réconciliation et tous les contrôles, filtrables par sortie (bascules soulignées
 * avec leur dénombrement), paginées par 100 ; un clic ou Entrée ouvre le tiroir de détail.
 */

import { useId, useMemo, useState } from "react";
import p from "@/components/charte/page.module.css";
import {
  buildOutcomeFilters,
  TAX_TYPE_LABEL,
  TAX_TYPE_SHORT_LABEL,
  type TaxCockpitDatasets,
  type TaxRiskMatrixCell,
} from "@/lib/tax/cockpit";
import { ActLine } from "./ActLine";
import { findingReading, findingTitle } from "./finding-text";
import { asOutcome, OutcomeGlyph, OutcomeMark, outcomeOfLabel, type OutcomeKey } from "./OutcomeMark";
import { SourcesBlock } from "./TaxSources";
import x from "./fiscalite.module.css";

const PAGE_SIZE = 100;

/** Segment de couverture → sortie (glyphe de la légende). */
const SEGMENT_OUTCOME: Readonly<Record<string, OutcomeKey>> = {
  passed: "passed",
  difference: "reconciliation_difference",
  risk: "potential_tax_risk",
  missing: "missing_information",
  inconclusive: "inconclusive",
};

export function TaxExposure({
  datasets,
  outcomeFilter,
  onOutcomeFilterChange,
  activeRowId,
  onOpenRow,
}: {
  datasets: TaxCockpitDatasets;
  outcomeFilter: string;
  onOutcomeFilterChange: (outcome: string) => void;
  activeRowId: string | null;
  onOpenRow: (rowId: string, opener: HTMLElement) => void;
}) {
  const { riskMatrix, coverage, findings } = datasets;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const uid = useId();
  const filters = useMemo(() => buildOutcomeFilters(findings), [findings]);

  const filteredRows = useMemo(
    () =>
      outcomeFilter === "tous"
        ? findings.rows
        : findings.rows.filter((row) => findings.outcomeByRowId[row.id] === outcomeFilter),
    [findings.rows, findings.outcomeByRowId, outcomeFilter],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  const choose = (outcome: string) => {
    onOutcomeFilterChange(outcome);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section aria-labelledby="tax-exposure-title" className={x.act}>
      <ActLine numeral="III" name="L'exposition" />
      <h2 id="tax-exposure-title" className={x.actTitle}>
        Couverture des contrôles et lignes à traiter
      </h2>
      <p className={x.lede}>
        Les <span className={x.mono}>{coverage.totalControls}</span> contrôles exécutés, croisés par impôt et par cycle de
        revue. La micro-barre décompose les sorties de chaque croisement ; la dernière colonne en donne la plus
        prioritaire, en mot.
      </p>

      {riskMatrix.cells.length === 0 ? (
        <p className={x.empty}>Aucun contrôle exécuté sur ce périmètre.</p>
      ) : (
        <div role="region" aria-label={`${riskMatrix.title}, défilement horizontal`} tabIndex={0} className={`${p.scrollX} ${x.tableRegion}`}>
          <table className={`${p.register} ${x.matrixTable}`}>
            <caption className="sr-only">{riskMatrix.summary}</caption>
            <thead>
              <tr>
                <th scope="col">Impôt</th>
                <th scope="col">Cycle</th>
                <th scope="col" className={p.num}>
                  Contrôles
                </th>
                <th scope="col">Décomposition</th>
                <th scope="col">Sortie prioritaire</th>
              </tr>
            </thead>
            <tbody>
              {riskMatrix.taxes.flatMap((taxType) => {
                const cells = riskMatrix.cells.filter((cell) => cell.taxType === taxType);
                return cells.map((cell, index) => (
                  <MatrixRow key={`${cell.taxType}:${cell.cycle}`} cell={cell} first={index === 0} span={cells.length} />
                ));
              })}
              {coverage.totalControls > 0 && (
                <tr className={x.matrixTotal}>
                  <th scope="row" colSpan={2}>
                    Tous cycles
                  </th>
                  <td className={p.num}>{coverage.totalControls}</td>
                  <td>
                    <span className={x.microbar} aria-hidden="true">
                      {coverage.segments
                        .filter((segment) => segment.count > 0)
                        .map((segment) => (
                          <span key={segment.key} data-outcome={SEGMENT_OUTCOME[segment.key] ?? "none"} style={{ flexGrow: segment.count }} />
                        ))}
                    </span>
                  </td>
                  <td>
                    <ul className={x.legend} aria-label={coverage.summary}>
                      {coverage.segments.map((segment) => (
                        <li key={segment.key}>
                          <OutcomeGlyph outcome={SEGMENT_OUTCOME[segment.key] ?? "none"} />
                          {segment.label} : <span className={x.mono}>{segment.count}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {coverage.totalControls > 0 && (
        <>
          <p className={p.note}>
            Une sortie « non concluant » n&apos;est pas une anomalie : c&apos;est une procédure supplémentaire à programmer
            (ISA 330). Le niveau de preuve retenu est le plus faible niveau nécessaire à la conclusion, jamais une moyenne.
          </p>
          <SourcesBlock dataset={riskMatrix} />
        </>
      )}

      <h3 className={x.linesTitle} id={`${uid}-lines`}>
        Lignes de réconciliation et contrôles
      </h3>
      <div role="group" aria-label="Filtrer les lignes par statut" className={x.filterBar}>
        <span className={p.key} aria-hidden="true">
          Lignes
        </span>
        <FilterToggle
          label="Toutes"
          count={filters.total}
          pressed={outcomeFilter === "tous"}
          onClick={() => choose("tous")}
          descriptionId={`${uid}-all`}
        />
        {filters.options.map((option) => (
          <FilterToggle
            key={option.outcome}
            label={option.label}
            count={option.count}
            pressed={outcomeFilter === option.outcome}
            onClick={() => choose(option.outcome)}
            descriptionId={`${uid}-${option.outcome}`}
          />
        ))}
        <span className={x.filterNote}>
          <span className={x.mono}>{filters.reconciliationLines}</span> réconciliations ·{" "}
          <span className={x.mono}>{filters.controls}</span> contrôles
        </span>
      </div>

      <div role="table" aria-labelledby={`${uid}-lines`} aria-describedby={`${uid}-note`} className={x.lines}>
        <div role="rowgroup">
          <div role="row" className={x.linesHead}>
            <div role="columnheader">Impôt</div>
            <div role="columnheader">Contrôle</div>
            <div role="columnheader">Sortie</div>
            <div role="columnheader">Lecture</div>
            <div role="columnheader" className={x.right}>
              Montant
            </div>
          </div>
        </div>
        <div role="rowgroup">
          {visibleRows.length === 0 ? (
            <div role="row" className={x.linesEmpty}>
              <div role="cell">Aucune ligne pour ce filtre.</div>
            </div>
          ) : (
            visibleRows.map((row) => {
              const detail = findings.details[row.id];
              const outcome = asOutcome(findings.outcomeByRowId[row.id]);
              const controlId = detail?.controlId ?? null;
              const amount = detail?.amountDisplay ?? "—";
              return (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  data-row-id={row.id}
                  data-active={activeRowId === row.id ? "" : undefined}
                  className={x.lineRow}
                  onClick={(event) => onOpenRow(row.id, event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenRow(row.id, event.currentTarget);
                    }
                  }}
                >
                  <div role="cell" className={x.cTax}>
                    {String(row.cells.tax)}
                  </div>
                  <div role="cell" className={x.cCtrl}>
                    {findingTitle(row, detail)}
                    {controlId && <span className={x.controlId}>{controlId}</span>}
                  </div>
                  <div role="cell" className={x.cOut}>
                    <OutcomeMark outcome={outcome} label={String(row.cells.status)} />
                  </div>
                  <div role="cell" className={x.cRead}>
                    {findingReading(detail)}
                  </div>
                  <div role="cell" className={x.cAmt} data-muted={amount === "—" ? "" : undefined}>
                    {amount}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {filteredRows.length > visibleCount && (
        <button type="button" className={p.btnQuiet} onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
          Afficher {Math.min(PAGE_SIZE, filteredRows.length - visibleCount)} ligne(s) de plus ({filteredRows.length - visibleCount}{" "}
          restantes)
        </button>
      )}
      <p id={`${uid}-note`} className={x.linesNote}>
        <span className={x.mono}>{visibleRows.length}</span> ligne(s) affichée(s) ·{" "}
        <span className={x.mono}>{coverage.totalControls}</span> contrôles exécutés au total sur l&apos;exercice. Un clic sur
        une ligne ouvre son détail : montant, formule, données utilisées, limites, preuve, sources, historique.
      </p>
      <SourcesBlock dataset={findings} />
    </section>
  );
}

/** Bascule soulignée : le mot est le nom accessible, le dénombrement en est la description. */
function FilterToggle({
  label,
  count,
  pressed,
  onClick,
  descriptionId,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
  descriptionId: string;
}) {
  return (
    <button type="button" className={`${p.toggle} ${x.filterToggle}`} aria-pressed={pressed} aria-describedby={descriptionId} onClick={onClick}>
      {label}
      <span className={x.filterCount} aria-hidden="true">
        {count}
      </span>
      <span id={descriptionId} hidden>
        {count} ligne{count > 1 ? "s" : ""}
      </span>
    </button>
  );
}

function MatrixRow({ cell, first, span }: { cell: TaxRiskMatrixCell; first: boolean; span: number }) {
  const breakdown = cell.outcomeBreakdown.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(" · ");
  return (
    <tr data-matrix-cell={`${cell.taxType}:${cell.cycle}`}>
      {first && (
        <th scope="rowgroup" rowSpan={span} className={x.matrixTax}>
          <abbr title={TAX_TYPE_LABEL[cell.taxType]}>{TAX_TYPE_SHORT_LABEL[cell.taxType]}</abbr>
        </th>
      )}
      <th scope="row" className={x.matrixCycle}>
        {cell.cycle}
      </th>
      <td className={p.num}>{cell.controlCount}</td>
      <td>
        <span className={x.microbar} aria-hidden="true">
          {cell.outcomeBreakdown.map((entry) => (
            <span key={entry.outcome} data-outcome={entry.outcome} style={{ flexGrow: entry.count }} />
          ))}
        </span>
      </td>
      <td>
        {cell.worstOutcomeLabel ? <OutcomeMark outcome={outcomeOfLabel(cell.worstOutcomeLabel)} label={cell.worstOutcomeLabel} /> : "—"}
        <span className={x.breakdown}>{breakdown}</span>
      </td>
    </tr>
  );
}
