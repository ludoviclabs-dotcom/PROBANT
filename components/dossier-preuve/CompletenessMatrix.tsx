import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { severityWord } from "@/components/charte/severity";
import { plural } from "@/lib/synthese-view/common";
import { rowCount, rowReading, type CompletenessMatrix as Matrix } from "@/lib/dossier-view/chain";
import x from "./dossier.module.css";

/** Largeur d'une case (12 px) et de l'espace qui la suit (2 px) : la tête de groupe a la largeur de ses colonnes. */
const CELL = 12;
const GAP = 2;

/**
 * Matrice de complétude : une colonne par constat (par gravité), une rangée par maillon de la chaîne ; case pleine =
 * maillon présent. Le dessin est décoratif (`aria-hidden`) : la même information est lue dans la table qui suit,
 * rangée par rangée, avec le compte et la liste la plus courte des constats concernés.
 */
export function CompletenessMatrix({ matrix }: { matrix: Matrix }) {
  let start = 0;
  const groups = matrix.groups.map((g) => {
    const group = { ...g, start };
    start += g.count;
    return group;
  });

  return (
    <div className={x.matrixScroll} role="region" aria-label="Matrice de complétude, défilement horizontal" tabIndex={0}>
      <div className={x.matrix} aria-hidden="true">
        <div className={x.mHead}>
          <span className={x.mLabel} />
          {groups.map((g) => {
            const width = g.count * (CELL + GAP) - GAP;
            const word = plural(g.count, severityWord(g.severity));
            return (
              <span key={g.severity} className={x.mGroupHead} style={{ width }}>
                <SeverityGlyph severity={g.severity} />
                {g.count}
                {width >= 96 ? ` ${word}` : ""}
              </span>
            );
          })}
        </div>
        {matrix.rows.map((row) => (
          <div key={row.key} className={x.mRow} data-key={row.key}>
            <span className={x.mLabel}>{row.label}</span>
            {groups.map((g) => (
              <span key={g.severity} className={x.mGroup}>
                {row.cells.slice(g.start, g.start + g.count).map((on, i) => (
                  <i key={matrix.columns[g.start + i].id} className={x.cell} data-on={on ? "" : undefined} />
                ))}
              </span>
            ))}
            <span className={x.mCount}>{rowCount(row, matrix)}</span>
          </div>
        ))}
      </div>
      <table className={x.srOnly}>
        <caption>
          Complétude des {matrix.total} chaînes de preuve, par étape. Colonnes par gravité :{" "}
          {matrix.groups.map((g) => `${g.count} ${plural(g.count, severityWord(g.severity))}`).join(", ")}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Étape</th>
            <th scope="col">Présente</th>
            <th scope="col">Constats concernés</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {row.label}
                {row.key === "other" && matrix.otherLabels.length > 0 ? ` (${matrix.otherLabels.join(", ")})` : ""}
              </th>
              <td>{rowCount(row, matrix)}</td>
              <td>{rowReading(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
