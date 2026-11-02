"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { useReactTable, getCoreRowModel, getSortedRowModel, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { FamilyRule } from "@/components/charte/FamilyRule";
import p from "@/components/charte/page.module.css";
import type { CycleRiskScore, CriticityBand, RiskAxisId } from "@/lib/risk-mapping";
import { RISK_AXES, isSimulatedExercise, type HistoricalExercise } from "@/lib/risk-mapping";
import {
  ALL_BANDS_VISIBLE,
  BAND_LABEL,
  BAND_ORDER,
  DEFAULT_SORT,
  ariaSort,
  axisText,
  bandRangeText,
  compositePreciseText,
  compositeText,
  countByBand,
  exerciseDelta,
  filterRegister,
  gaugeWidth,
  nextSort,
  parseStoredSort,
  unevaluatedText,
} from "@/lib/risk-mapping/view";
import { BandMark, BandSwatch } from "./BandMark";
import s from "./risk.module.css";

/**
 * Registre des cycles (vue « Matrice ») : une ligne par cycle, le nombre de constats rattachés, les quatre axes
 * (valeur + jauge ; la détectabilité est INVERSÉE et tracée en pointillé), le composite avec son niveau (pastille +
 * mot), et un écart Δ quand un exercice simulé est comparé. Une ligne sans composite est hachurée et porte la doctrine
 * « jamais assimilé à un risque maîtrisé » : un cycle sans constat ni standard obligatoire ne suggère jamais un risque
 * maîtrisé et prouvé.
 *
 * Tri piloté par @tanstack/react-table (ordre des lignes seulement) ; filtres, entier affiché, plages et écart viennent
 * des modèles de vue purs de `lib/risk-mapping/view`. Aucune valeur affichée n'est inventée : tout provient des
 * `CycleRiskScore` du moteur `lib/risk-mapping`. Le composite reste une heuristique interne non opposable ; l'écart Δ
 * compare au composite « historique » SIMULÉ d'un exercice antérieur (`lib/risk-mapping/historical.ts`), jamais à un
 * vrai chiffre d'audit.
 */

interface RiskMatrixHeatmapProps {
  scores: CycleRiskScore[];
  selected: string | null;
  /** Ouvre le détail d'un cycle ; `trigger` reçoit le focus à la fermeture du panneau. */
  onSelect: (slug: string, trigger?: HTMLElement | SVGElement | null) => void;
  /** Exercice de comparaison pour la colonne Δ ; absent = colonne masquée. */
  comparisonExercise?: HistoricalExercise | null;
  /**
   * Composite de l'exercice RÉEL par cycle (avant substitution par l'exercice simulé), pour la colonne Δ.
   * Absent : l'écart est lu sur `scores` (comportement antérieur).
   */
  currentComposites?: ReadonlyMap<string, number | null>;
  /**
   * `cycleSlug` (fiche normative) des cycles éligibles au dépôt multi-documents
   * — signal indépendant de `evaluation`/`composite`, purement documentaire.
   */
  depositCycleSlugs?: string[];
  /** Sous-ensemble de `depositCycleSlugs` pour lequel un dépôt a déjà réussi. */
  coveredCycleSlugs?: string[];
  /** `cycleSlug` → id du cycle de dépôt correspondant, pour le lien de dépôt. */
  depositIdByCycleSlug?: Map<string, string>;
  /**
   * Filtre de bande piloté depuis la répartition. Si non-`null`, restreint les lignes à cette seule bande — EN PLUS des
   * bascules internes.
   */
  activeBand?: CriticityBand | null;
}

/** Clé localStorage du tri persisté — dossierId fixe, pas de vraie multi-tenance. */
const SORT_STORAGE_KEY = "probant_risques_sort_demo-dossier";

type SortableColumnId = "cycleSlug" | "findingCount" | RiskAxisId | "composite";

/** Persiste le tri courant en localStorage ; ne doit jamais faire planter le rendu. */
function persistSort(sorting: SortingState): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sorting));
  } catch {
    // localStorage indisponible (navigation privée, quota, etc.) : silencieux.
  }
}

function restoreSort(): SortingState | null {
  try {
    return parseStoredSort(window.localStorage.getItem(SORT_STORAGE_KEY));
  } catch {
    return null;
  }
}

const AXIS_WORD: Record<RiskAxisId, string> = {
  gravite: "gravité",
  probabilite: "probabilité",
  detectabilite: "détectabilité",
  exposition: "exposition",
};

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path d="M1.5 5.2 4 7.6 8.6 2.4" fill="none" strokeWidth="1.4" style={{ stroke: "var(--pb-ink-2)" }} />
    </svg>
  );
}

export function RiskMatrixHeatmap({
  scores,
  selected,
  onSelect,
  comparisonExercise = null,
  currentComposites,
  depositCycleSlugs,
  coveredCycleSlugs,
  depositIdByCycleSlug,
  activeBand = null,
}: RiskMatrixHeatmapProps) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const [cycleQuery, setCycleQuery] = useState("");
  const [minComposite, setMinComposite] = useState<string>("");
  const [visibleBands, setVisibleBands] = useState<Record<CriticityBand, boolean>>(ALL_BANDS_VISIBLE);

  // Restauration du tri persisté au montage — jamais de crash si localStorage
  // est indisponible ou corrompu (mode privé, quota dépassé, JSON invalide...).
  useEffect(() => {
    const restored = restoreSort();
    if (restored) setSorting(restored);
  }, []);

  useEffect(() => {
    persistSort(sorting);
  }, [sorting]);

  // Signal des cellules composite dont la BANDE vient de changer (simulateur
  // ISA 320, ajustements de jugement) : la bande précédente est mémorisée par
  // cycle et un voile bref est rejoué quand elle diffère — jamais au premier
  // rendu (prev inconnu). Neutralisé par prefers-reduced-motion (tokens.css).
  const prevBandsRef = useRef<Map<string, CriticityBand>>(new Map());
  const [bandFlash, setBandFlash] = useState<Record<string, number>>({});
  useEffect(() => {
    const prev = prevBandsRef.current;
    const changed: string[] = [];
    for (const sc of scores) {
      const before = prev.get(sc.cycleSlug);
      if (before !== undefined && before !== sc.criticityBand) changed.push(sc.cycleSlug);
      prev.set(sc.cycleSlug, sc.criticityBand);
    }
    if (changed.length > 0) {
      setBandFlash((m) => {
        const next = { ...m };
        for (const slug of changed) next[slug] = (next[slug] ?? 0) + 1;
        return next;
      });
    }
  }, [scores]);

  const showDelta = !!comparisonExercise && isSimulatedExercise(comparisonExercise);

  // Couverture documentaire du dépôt : signal ADDITIF, indépendant de
  // `evaluation`/`composite`.
  const depositEligibleSlugs = useMemo(() => new Set(depositCycleSlugs ?? []), [depositCycleSlugs]);
  const depositCoveredSlugs = useMemo(() => new Set(coveredCycleSlugs ?? []), [coveredCycleSlugs]);

  // Compteur par bande sur l'ensemble des scores reçus (indépendant de la recherche et du seuil).
  const bandCounts = useMemo(() => countByBand(scores), [scores]);

  const selection = useMemo(
    () => filterRegister(scores, { query: cycleQuery, minComposite, visibleBands, activeBand }),
    [scores, cycleQuery, minComposite, visibleBands, activeBand],
  );

  // Colonnes tanstack : purement des accesseurs de tri, le rendu reste géré ici.
  const columns = useMemo<ColumnDef<CycleRiskScore, unknown>[]>(
    () => [
      { id: "cycleSlug", accessorFn: (row) => row.cycleSlug, sortingFn: "alphanumeric" },
      { id: "findingCount", accessorFn: (row) => row.findingCount, sortingFn: "basic" },
      ...RISK_AXES.map(
        (axis): ColumnDef<CycleRiskScore, unknown> => ({
          id: axis.id,
          // `undefined` (et non `null`) pour les non-évalués : c'est la seule
          // valeur que `sortUndefined` sait placer HORS du comparateur inversé
          // par `desc` — les non-évalués restent en fin de liste dans les deux sens.
          accessorFn: (row) => (row.evaluation === "évalué" ? row.axes[axis.id].value : undefined),
          sortUndefined: "last",
          sortingFn: "basic",
        }),
      ),
      {
        id: "composite",
        // Composite null → `undefined` + `sortUndefined: "last"` : TOUJOURS en fin
        // de liste, jamais traité comme 0 ni remonté en tête sous tri décroissant.
        accessorFn: (row) => row.composite ?? undefined,
        sortUndefined: "last",
        sortingFn: "basic",
      },
    ],
    [],
  );

  const table = useReactTable({
    data: selection.rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => setSorting((old) => (typeof updater === "function" ? updater(old) : updater)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    enableSortingRemoval: true,
  });

  const rows = table.getRowModel().rows.map((r) => r.original);

  function toggleSort(columnId: SortableColumnId) {
    setSorting((current) => nextSort(current, columnId));
  }

  function resetFilters() {
    setCycleQuery("");
    setMinComposite("");
    setVisibleBands(ALL_BANDS_VISIBLE);
  }

  // Un clic n'importe où dans la ligne ouvre le détail ; le clavier passe par le bouton du nom (seule cible focalisable).
  function onRowClick(event: MouseEvent<HTMLTableRowElement>, slug: string) {
    if ((event.target as Element).closest("a, button")) return;
    onSelect(slug, event.currentTarget.querySelector<HTMLButtonElement>("button[data-cycle]"));
  }

  const showingLabel = rows.length === scores.length ? `${rows.length} affichés` : `${rows.length} / ${scores.length} affichés`;
  const columnCount = 7 + (showDelta ? 1 : 0);

  const sortArrow = (id: SortableColumnId) => {
    const state = ariaSort(sorting, id);
    if (state === "none") return null;
    return (
      <span aria-hidden="true" className={s.sortArrow}>
        {state === "descending" ? "↓" : "↑"}
      </span>
    );
  };

  return (
    <div>
      <div className={s.filters}>
        <label className={p.field}>
          <span className={p.key}>Cycle</span>
          <input
            type="search"
            value={cycleQuery}
            onChange={(e) => setCycleQuery(e.target.value)}
            placeholder="Rechercher un cycle…"
            aria-label="Rechercher un cycle"
            className={`${p.input} ${s.search}`}
          />
        </label>

        <span className={p.toggleGroup} role="group" aria-label="Niveaux affichés">
          <span className={p.key} aria-hidden="true">
            Niveaux
          </span>
          {[...BAND_ORDER].reverse().map((band) => {
            const on = visibleBands[band];
            return (
              <button
                key={band}
                type="button"
                className={p.toggle}
                aria-pressed={on}
                title={`${on ? "Masquer" : "Afficher"} la bande ${BAND_LABEL[band]}`}
                onClick={() => setVisibleBands((prev) => ({ ...prev, [band]: !prev[band] }))}
              >
                <span className={s.level}>
                  <BandSwatch band={band} />
                  {BAND_LABEL[band]}
                </span>
                <span className={s.chipCount}>{bandCounts[band]}</span>
              </button>
            );
          })}
        </span>

        <label className={p.field}>
          <span className={p.key}>Composite &gt;</span>
          <input
            type="number"
            min={0}
            max={100}
            value={minComposite}
            onChange={(e) => setMinComposite(e.target.value)}
            placeholder="0"
            aria-label="Composite supérieur à"
            className={`${p.input} ${s.threshold}`}
          />
        </label>
        {selection.thresholdActive && selection.hiddenUnevaluated > 0 && (
          <span className={p.faint}>
            {selection.hiddenUnevaluated} masqué{selection.hiddenUnevaluated > 1 ? "s" : ""} (non évalués)
          </span>
        )}

        <span className={`${s.countText} ${s.filtersEnd}`} aria-live="polite">
          {showingLabel}
        </span>
        <button type="button" className={p.btnQuiet} onClick={resetFilters}>
          Réinitialiser
        </button>
      </div>

      <div data-tour="risk-matrix" role="region" aria-label="Registre des cycles, défilement horizontal" tabIndex={0} className={s.region}>
        <table className={s.matrix}>
          <caption className="sr-only">
            Registre des cycles : nombre de constats, quatre axes du risque et composite heuristique non opposable, une ligne par cycle.
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort(sorting, "cycleSlug")}>
                <button type="button" className={s.sortBtn} onClick={() => toggleSort("cycleSlug")}>
                  Cycle {sortArrow("cycleSlug")}
                </button>
              </th>
              <th scope="col" className={s.numHead} aria-sort={ariaSort(sorting, "findingCount")}>
                <button type="button" className={s.sortBtn} onClick={() => toggleSort("findingCount")}>
                  Constats {sortArrow("findingCount")}
                </button>
              </th>
              {RISK_AXES.map((axis) => (
                <th key={axis.id} scope="col" aria-sort={ariaSort(sorting, axis.id)}>
                  <button type="button" className={s.sortBtn} onClick={() => toggleSort(axis.id)} title={`${axis.label} — ${axis.doctrine}`}>
                    <span>
                      <span className={s.axisLetter}>{axis.short}</span> {AXIS_WORD[axis.id]}
                    </span>
                    {axis.invertsRisk && <span className={s.headNote}>inversée</span>}
                    {sortArrow(axis.id)}
                  </button>
                </th>
              ))}
              <th scope="col" aria-sort={ariaSort(sorting, "composite")}>
                <button type="button" className={s.sortBtn} onClick={() => toggleSort("composite")} title="Composite — heuristique interne, non opposable">
                  <span className={s.level}>
                    <FamilyRule family="internal" />
                    Composite
                  </span>
                  {sortArrow("composite")}
                </button>
              </th>
              {showDelta && (
                <th scope="col" className={s.deltaHead} title={`Variation du composite vs exercice ${comparisonExercise} (simulé)`}>
                  Δ vs {comparisonExercise}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((sc, rowIdx) => {
              const evaluated = sc.evaluation === "évalué";
              const isSelected = sc.cycleSlug === selected;
              const isDepositCovered = depositCoveredSlugs.has(sc.cycleSlug);
              const isDepositEligible = depositEligibleSlugs.has(sc.cycleSlug);
              const depositId = depositIdByCycleSlug?.get(sc.cycleSlug);
              const band = BAND_LABEL[sc.criticityBand];
              const shown = compositeText(sc.composite);
              const delta =
                showDelta && comparisonExercise
                  ? exerciseDelta(sc.cycleSlug, currentComposites ? (currentComposites.get(sc.cycleSlug) ?? null) : sc.composite, comparisonExercise)
                  : null;
              return (
                <tr
                  key={sc.cycleSlug}
                  data-selected={isSelected ? "" : undefined}
                  className={evaluated ? undefined : s.unevaluated}
                  onClick={(e) => onRowClick(e, sc.cycleSlug)}
                  style={{ animationDelay: `${Math.min(rowIdx, 16) * 30}ms` }}
                >
                  <th scope="row">
                    <button
                      type="button"
                      data-cycle={sc.cycleSlug}
                      className={s.cycleBtn}
                      title={sc.cycleSlug}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={(e) => onSelect(sc.cycleSlug, e.currentTarget)}
                    >
                      {sc.cycleSlug}
                    </button>
                    {isDepositCovered && (
                      <span className={s.sub} title="Documents comparés ; couverture du cycle non démontrée">
                        <CheckGlyph />
                        documents comparés
                      </span>
                    )}
                    {!isDepositCovered && isDepositEligible && (
                      <span className={s.sub}>
                        <Link
                          href={depositId ? `/dashboard/depot?cycle=${encodeURIComponent(depositId)}` : "/dashboard/depot"}
                          title="Cliquer pour déposer les documents de ce cycle"
                          aria-label={`Fichier manquant — déposer les documents du cycle ${sc.cycleSlug}`}
                        >
                          fichier manquant
                        </Link>
                      </span>
                    )}
                  </th>
                  <td className={s.num} title={`${sc.findingCount} constat${sc.findingCount > 1 ? "s" : ""} rattaché${sc.findingCount > 1 ? "s" : ""}`}>
                    {sc.findingCount}
                  </td>
                  {evaluated ? (
                    RISK_AXES.map((axis) => {
                      const value = sc.axes[axis.id].value;
                      return (
                        <td key={axis.id} title={`${axis.label} : ${axisText(value)}/100 — ${axis.doctrine}`}>
                          <span className={s.ax}>
                            <span className={s.axValue}>{axisText(value)}</span>
                            <span aria-hidden="true" className={s.bar} data-inverted={axis.invertsRisk ? "" : undefined}>
                              <span style={{ width: `${gaugeWidth(value)}%` }} />
                            </span>
                          </span>
                        </td>
                      );
                    })
                  ) : (
                    <td colSpan={RISK_AXES.length} className={s.unevaluatedText}>
                      {unevaluatedText(sc.evaluation)}
                    </td>
                  )}
                  <td
                    className={s.composite}
                    title={sc.composite === null ? "Composite : non évalué" : `Composite : ${shown}/100 (${compositePreciseText(sc.composite)} avant troncature) · ${band} (heuristique)`}
                    aria-label={
                      sc.composite === null
                        ? `Score composite : non évalué, cycle ${sc.cycleSlug}, niveau ${band}`
                        : `Score composite : ${shown} sur 100, cycle ${sc.cycleSlug}, niveau ${band}`
                    }
                  >
                    {bandFlash[sc.cycleSlug] ? <span key={`flash-${bandFlash[sc.cycleSlug]}`} aria-hidden="true" className={s.flash} /> : null}
                    <BandMark band={sc.criticityBand} value={sc.composite === null ? "·" : shown} />
                  </td>
                  {delta && (
                    <td title={delta.title}>
                      <span className={s.delta}>
                        <span className={s.deltaValue}>{delta.text}</span>
                        <span className={s.deltaWord}>{delta.word}</span>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className={s.empty}>
                  Aucun cycle ne correspond aux filtres actifs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className={s.legend} aria-label="Légende des niveaux">
        {(["faible", "modéré", "élevé", "critique"] as const).map((band) => (
          <li key={band}>
            <BandSwatch band={band} />
            {BAND_LABEL[band]} <span className={s.legendRange}>{bandRangeText(band)}</span>
          </li>
        ))}
        <li>
          <BandSwatch band="non_évalué" />
          Non évalué / partiel
        </li>
        {showDelta && <li>Δ vs exercice {comparisonExercise} (simulé)</li>}
      </ul>

      <p className={p.note}>
        <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
          <line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" strokeDasharray="2 2" style={{ stroke: "var(--pb-ink-2)" }} />
        </svg>
        <span>
          Jauge proportionnelle au score de l&apos;axe. Barre pointillée : détectabilité, lue à l&apos;inverse — plus elle est
          courte, plus le cycle est exposé. Ligne hachurée = cycle non évalué, jamais assimilé à un risque maîtrisé. Le composite
          affiché est la partie entière de l&apos;heuristique interne (il reste ainsi dans la bande calculée) ; il aide à
          hiérarchiser et n&apos;est pas opposable.
        </span>
      </p>
    </div>
  );
}
