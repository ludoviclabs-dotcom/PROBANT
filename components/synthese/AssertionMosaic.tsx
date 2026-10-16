"use client";

import { MOSAIC_GROUP_LABEL, cellKey, type MosaicGroup, type MosaicModel } from "@/lib/synthese-view/mosaic";
import { plural } from "@/lib/synthese-view/common";
import type { Finding } from "@/lib/canonical-model/finding";
import { isFiltering, matches, type CrossFilter } from "./filter";
import s from "./synthese.module.css";

/** Luminosité par nombre de constats ; le nombre est toujours écrit dans la cellule (jamais la teinte seule). */
const RAMP = [0, 0.12, 0.22, 0.32, 0.62, 0.74, 0.86, 0.94];
const LEGEND = [1, 2, 3, 4, 7];

export interface CellRef {
  clo: string;
  column: string;
}

/**
 * Mosaïque cloison × assertion (NEP 500 §09) : le nombre de constats par cellule, luminosité graduée, échelle commune.
 * Un clic ouvre le volet de détail ; avec un filtre croisé, les nombres ne comptent que ce qui y répond. Une cellule
 * vide signifie « aucun constat », pas « assertion couverte ».
 */
export function AssertionMosaic({
  model,
  findingsById,
  filter,
  selected,
  onSelect,
  title,
  method,
}: {
  model: MosaicModel;
  findingsById: ReadonlyMap<string, Finding>;
  filter: CrossFilter;
  selected: CellRef | null;
  onSelect: (cell: CellRef, trigger: HTMLElement) => void;
  title: string;
  method: string;
}) {
  const fx = isFiltering(filter);
  const groups = (["flux", "solde", "annexe", "extra"] as MosaicGroup[])
    .map((group) => ({ group, columns: model.columns.filter((c) => c.group === group) }))
    .filter((g) => g.columns.length > 0);

  return (
    <figure data-anim-group="hm" className={s.mosaicFigure}>
      <figcaption>
        <h3 className={s.figTitle}>{title}</h3>
        <p className={s.figMethod}>{method}{fx ? " · comptes filtrés, échelle commune" : " · aucun filtre"}</p>
      </figcaption>
      <div role="region" aria-label="Matrice des constats · cloison × assertion (NEP 500 §09)" tabIndex={0} className={`${s.scrollX} ${s.mosaicScroll}`}>
        <div className={s.mosaic} style={{ gridTemplateColumns: `128px repeat(${model.columns.length}, 34px)` }}>
          <span />
          {groups.map(({ group, columns }) => (
            <span key={group} className={s.mosaicGroup} style={{ gridColumn: `span ${columns.length}` }}>
              {MOSAIC_GROUP_LABEL[group]}
            </span>
          ))}
          <span />
          {model.columns.map((column) => (
            <span key={column.key} title={column.label} className={s.mosaicHead}>
              <span aria-hidden="true">{column.short}</span>
              <span className="sr-only">{column.label}</span>
            </span>
          ))}
          {model.rows.map((clo) => {
            const dim = filter.clo && filter.clo !== clo.id;
            return (
              <div key={clo.id} className={s.mosaicRow}>
                <span className={s.mosaicRowLabel} data-dim={dim ? "" : undefined}>{clo.label}</span>
                {model.columns.map((column) => {
                  const ids = model.cells[cellKey(clo.id, column.key)];
                  const inFilter = ids.filter((id) => {
                    const f = findingsById.get(id);
                    return f ? matches(filter, f) : false;
                  }).length;
                  const n = fx ? inFilter : ids.length;
                  const alpha = RAMP[Math.min(n, 7)];
                  const isSelected = selected?.clo === clo.id && selected.column === column.key;
                  return (
                    <button
                      key={column.key}
                      type="button"
                      data-a="cell"
                      aria-label={`${clo.label} × ${column.label} : ${ids.length} ${plural(ids.length, "constat")}${fx ? `, ${inFilter} dans le filtre` : ""}`}
                      aria-haspopup="dialog"
                      className={s.mosaicCell}
                      data-empty={n ? undefined : ""}
                      data-dense={alpha >= 0.6 ? "" : undefined}
                      data-selected={isSelected ? "" : undefined}
                      style={{ background: n ? `color-mix(in srgb, var(--pb-ink) ${Math.round(alpha * 100)}%, transparent)` : undefined }}
                      onClick={(event) => onSelect({ clo: clo.id, column: column.key }, event.currentTarget)}
                    >
                      {n || "·"}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className={s.mosaicLegend}>
        <span>constats par cellule</span>
        {LEGEND.map((n) => (
          <span key={n} className={s.legendItem}>
            <span className={s.legendSwatch} style={{ background: `color-mix(in srgb, var(--pb-ink) ${Math.round(RAMP[n] * 100)}%, transparent)` }} />
            <span className={s.mono}>{n === 7 ? "7+" : n}</span>
          </span>
        ))}
        <span>· cliquez une cellule pour le détail</span>
      </div>
      <details className={s.altTable}>
        <summary>Alternative tableau : cloison × assertion</summary>
        <div role="region" aria-label="Tableau cloison × assertion" tabIndex={0} className={s.scrollX}>
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th scope="col">Cloison</th>
                {model.columns.map((column) => (
                  <th key={column.key} scope="col" className={s.alignRight}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((clo) => (
                <tr key={clo.id}>
                  <th scope="row">{clo.label}</th>
                  {model.columns.map((column) => (
                    <td key={column.key} className={s.alignRight}>{model.cells[cellKey(clo.id, column.key)].length}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
