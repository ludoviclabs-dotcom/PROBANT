"use client";

import { useState } from "react";
import Link from "next/link";
import type { CoverageMatrix as Matrix, ReferenceFamily } from "@/lib/audit-cycles/view";
import { VeilleGlyph } from "./VeilleMarks";
import n from "./normatif.module.css";

/** Au-delà, les barres s'arrêtent et seul le nombre continue (lisibilité de la cellule). */
const MAX_BARS = 8;

/**
 * Matrice de couverture normative : une ligne par cycle, une colonne par référentiel. Chaque barre est une source
 * distincte citée ; le carré de signal marque une cellule dont une source est touchée par une évolution non
 * intégrée (voir la page Veille). Choisir un référentiel en tête de colonne estompe les autres colonnes.
 * C'est un vrai tableau : les nombres sont lus par les lecteurs d'écran, les barres sont décoratives.
 */
export function CoverageMatrix({ matrix }: { matrix: Matrix }) {
  const [focus, setFocus] = useState<ReferenceFamily | null>(null);
  let row = 0;

  return (
    <>
      <div className={n.matrixFrame} role="region" aria-label="Matrice de couverture — défilement horizontal" tabIndex={0}>
        <table className={n.matrix} data-focus={focus ?? undefined}>
          <caption className="sr-only">
            Nombre de sources distinctes citées par chaque cycle, par référentiel. Un repère signale une évolution
            normative non intégrée.
          </caption>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              {matrix.columns.map((col) => (
                <th key={col.id} scope="col" title={col.label}>
                  <button
                    type="button"
                    className={n.colButton}
                    aria-pressed={focus === col.id}
                    onClick={() => setFocus((f) => (f === col.id ? null : col.id))}
                  >
                    {col.short}
                    <small>
                      {col.total} cycle{col.total > 1 ? "s" : ""}
                    </small>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {matrix.groups.map((group) => (
            <tbody key={group.id}>
              <tr className={n.matrixGroup}>
                <th scope="colgroup" colSpan={matrix.columns.length + 1}>
                  {group.title}
                </th>
              </tr>
              {group.rows.map((r) => {
                const delay = Math.min(row++ * 18, 600);
                return (
                  <tr key={r.slug}>
                    <th scope="row">
                      <Link href={`/normatif/cycles/${r.slug}`}>{r.title}</Link>
                    </th>
                    {r.cells.map((cell) => (
                      <td key={cell.family} className={n.cell} data-col-active={focus === cell.family ? "" : undefined}>
                        {cell.count === 0 ? (
                          <span className={n.cellZero} aria-label="aucune">
                            ·
                          </span>
                        ) : (
                          <>
                            <span className={n.cellBars} aria-hidden="true">
                              {Array.from({ length: Math.min(cell.count, MAX_BARS) }, (_, i) => (
                                <span key={i} className={n.cellBar} style={{ animationDelay: `${delay + i * 25}ms` }} />
                              ))}
                            </span>
                            <span className={n.cellNum}>{cell.count}</span>
                            {cell.flagged.length > 0 ? (
                              <span
                                className={n.cellFlag}
                                role="img"
                                title={`Veille : ${cell.flagged.join(", ")}`}
                                aria-label={`veille : ${cell.flagged.join(", ")}`}
                              >
                                <VeilleGlyph glyph="sq-fill" size={7} />
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className={n.legend}>
        <span>
          <span className={n.cellBars} aria-hidden="true">
            <span className={n.cellBar} style={{ height: 12 }} />
          </span>
          une source distincte citée
        </span>
        <span>
          <VeilleGlyph glyph="sq-fill" size={8} /> source touchée par une évolution non intégrée
        </span>
        <span>Choisir un référentiel en tête de colonne pour le faire ressortir.</span>
        {matrix.unresolved > 0 ? <span>{matrix.unresolved} référence(s) hors registre, non classée(s).</span> : null}
      </p>
    </>
  );
}
