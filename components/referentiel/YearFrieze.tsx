"use client";

import { useMemo } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import p from "@/components/charte/page.module.css";
import type { SourceNormative } from "@/lib/canonical-model";
import { plural } from "@/lib/synthese-view/common";
import { buildFrieze, registryFamily, registryLabel } from "@/lib/referentiel/view-model";
import { registryOf } from "./themes";
import x from "./referentiel.module.css";

const HARD = registryLabel("droit-dur");
const METHOD = registryLabel("methode");

/**
 * Frise des millésimes d'entrée en vigueur : une barre par année, longueur proportionnelle au nombre de textes du
 * registre (pleine pour le droit dur, en tirets pour la méthode d'audit), le nombre écrit. Chaque millésime est un
 * bouton à bascule qui filtre la bibliothèque ; le survol ou le focus en montre les textes dans le panneau voisin.
 * Statique : aucune animation.
 */
export function YearFrieze({
  sources,
  year,
  peekYear,
  onPeek,
  onToggleYear,
  onClearYear,
}: {
  sources: SourceNormative[];
  year: string | null;
  peekYear: string | null;
  onPeek: (year: string | null) => void;
  onToggleYear: (year: string) => void;
  onClearYear: () => void;
}) {
  const frieze = useMemo(() => buildFrieze(sources), [sources]);
  const shownYear = peekYear ?? year;
  const shown = shownYear ? frieze.find((f) => f.year === shownYear) : undefined;
  const first = frieze[0]?.year;
  const last = frieze[frieze.length - 1]?.year;

  return (
    <div className={x.friezeBlock}>
      <div className={x.subheadRow}>
        <h3 id="rf-millesimes" className={x.subhead}>
          Millésimes d’entrée en vigueur
        </h3>
        <span className={x.subheadNote}>une barre par millésime · longueur proportionnelle au nombre de textes</span>
        {year && (
          <button type="button" className={`${p.btnQuiet} ${x.clearYear}`} onClick={onClearYear}>
            Tous les millésimes
          </button>
        )}
      </div>

      <div className={x.friezeWrap}>
        <div className={x.frieze}>
          <div role="group" aria-labelledby="rf-millesimes">
            <ul className={x.years} data-filtered={year ? "" : undefined}>
              {frieze.map((f) => (
                <li key={f.year}>
                  <button
                    type="button"
                    className={x.year}
                    aria-pressed={year === f.year}
                    onClick={() => onToggleYear(f.year)}
                    onMouseEnter={() => onPeek(f.year)}
                    onMouseLeave={() => onPeek(null)}
                    onFocus={() => onPeek(f.year)}
                    onBlur={() => onPeek(null)}
                  >
                    {/* Nom accessible en une phrase ; l'année et le nombre visibles y figurent tels quels. */}
                    <span className={x.srOnly}>
                      {`${f.year}, ${f.total} ${plural(f.total, "texte")} : ${f.hardLaw} de droit dur, ${f.methodology} de méthode d’audit`}
                    </span>
                    <span className={x.yearLabel} aria-hidden="true">
                      {f.year}
                    </span>
                    <span className={x.track} aria-hidden="true">
                      {f.hardLaw > 0 && <span className={x.segHard} style={{ width: `${f.hardLawPct}%` }} />}
                      {f.methodology > 0 && <span className={x.segMethod} style={{ width: `${f.methodologyPct}%` }} />}
                    </span>
                    <span className={x.yearCount} aria-hidden="true">
                      {f.total}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <ul className={x.friezeLegend} aria-label="Lecture des barres">
            <li>
              <span className={x.swatchHard} aria-hidden="true" />
              {HARD}
            </li>
            <li>
              <span className={x.swatchMethod} aria-hidden="true" />
              {METHOD}
            </li>
          </ul>
        </div>

        <div className={`${p.panel} ${x.yearPanel}`}>
          <div className={x.yearPanelBody}>
            <div className={x.yearPanelHead}>
              <span className={p.key}>{shown ? `Millésime ${shown.year}` : "Lecture de la frise"}</span>
              {shown && (
                <span className={x.count}>
                  {shown.total} {plural(shown.total, "texte")}
                </span>
              )}
            </div>
            {shown ? (
              <ul className={x.yearRefs}>
                {shown.items.map((s) => {
                  const reg = registryOf(s.theme);
                  return (
                    <li key={s.ref}>
                      <FamilyRule family={registryFamily(reg)} width={16} />
                      <span>
                        {s.ref}
                        <span className={x.srOnly}>, {registryLabel(reg)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={x.yearPanelText}>
                {frieze.length} {plural(frieze.length, "millésime")} d’entrée en vigueur, de {first} à {last}. Survolez
                ou parcourez au clavier un millésime pour lire ses textes ; choisissez-le pour filtrer la bibliothèque.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
