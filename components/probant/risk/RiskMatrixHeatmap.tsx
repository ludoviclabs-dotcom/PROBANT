"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  TriangleAlert,
  CheckCircle2,
} from "lucide-react";
import type { CycleRiskScore, CriticityBand, RiskAxisId } from "@/lib/risk-mapping";
import {
  RISK_AXES,
  CURRENT_EXERCISE,
  isSimulatedExercise,
  simulateHistoricalComposite,
  type HistoricalExercise,
} from "@/lib/risk-mapping";
import { cn, wcagTextOnMix } from "@/lib/utils";

/**
 * Matrice thermique des cycles : une ligne par cycle, quatre colonnes d'axes +
 * une colonne composite (+ une colonne delta optionnelle). L'intensité de
 * chaque cellule est produite par `color-mix(in srgb, <hex axe> X%, transparent)`
 * — même pattern que la heatmap de la Synthèse (color-mix sur l'accent de
 * gravité). Une cellule « non évaluée » est rendue en fond hachuré gris, JAMAIS
 * en vert : un cycle sans constat ni standard obligatoire ne doit pas suggérer
 * un risque maîtrisé et prouvé.
 *
 * Tri/filtre pilotés par @tanstack/react-table (`useReactTable`,
 * `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`) — la
 * bibliothèque est agnostique du rendu : elle ne fait que produire l'ordre et
 * le sous-ensemble des lignes, le rendu en grille de cellules colorées reste
 * intégralement géré ici.
 *
 * Aucune valeur affichée n'est inventée : tout provient des `CycleRiskScore`
 * calculés par le moteur `lib/risk-mapping`. Le composite reste une heuristique
 * interne non opposable (disclaimer en pied). La colonne delta (optionnelle)
 * compare au composite « historique » SIMULÉ d'un exercice antérieur
 * (`lib/risk-mapping/historical.ts`) : ce n'est jamais un vrai chiffre d'audit.
 */

interface RiskMatrixHeatmapProps {
  scores: CycleRiskScore[];
  selected: string | null;
  onSelect: (slug: string) => void;
  /** Exercice de comparaison pour la colonne delta ; absent = colonne masquée. */
  comparisonExercise?: HistoricalExercise | null;
  /**
   * `cycleSlug` (fiche normative) des cycles éligibles au dépôt multi-documents
   * — signal indépendant de `evaluation`/`composite`, purement documentaire.
   * Optionnel et rétro-compatible : absent = aucun badge de couverture affiché.
   */
  depositCycleSlugs?: string[];
  /** Sous-ensemble de `depositCycleSlugs` pour lequel un dépôt a déjà réussi. */
  coveredCycleSlugs?: string[];
  /** `cycleSlug` → id du cycle de dépôt correspondant, pour le lien de dépôt. */
  depositIdByCycleSlug?: Map<string, string>;
}

/** Couleur d'accent par axe, pour l'intensité color-mix des cellules. */
const AXIS_HEX: Record<RiskAxisId, string> = {
  gravite: "#ef4444",
  probabilite: "#f97316",
  detectabilite: "#38bdf8",
  exposition: "#a78bfa",
};

/** Couleur d'accent par bande de criticité (colonne composite). */
const BAND_HEX: Record<CriticityBand, string> = {
  critique: "#ef4444",
  élevé: "#f97316",
  modéré: "#eab308",
  faible: "#3b82f6",
  non_évalué: "#5c6b82",
};

const BAND_LABEL: Record<CriticityBand, string> = {
  critique: "Critique",
  élevé: "Élevé",
  modéré: "Modéré",
  faible: "Faible",
  non_évalué: "Non évalué",
};

/** Légende de pied de tableau : plages de composite par bande + non évalué. */
const LEGEND_BANDS: { band: CriticityBand; range: string }[] = [
  { band: "faible", range: "0-25" },
  { band: "modéré", range: "26-50" },
  { band: "élevé", range: "51-75" },
  { band: "critique", range: "76-100" },
];

/** Fond hachuré gris pour les cellules non évaluées (jamais de vert). */
const HATCH =
  "repeating-linear-gradient(45deg, #1a2029 0, #1a2029 5px, #10151c 5px, #10151c 10px)";

/** Clé localStorage du tri persisté — dossierId fixe, pas de vraie multi-tenance. */
const SORT_STORAGE_KEY = "probant_risques_sort_demo-dossier";

type SortableColumnId = "cycleSlug" | RiskAxisId | "composite";

/**
 * Intensité color-mix d'une cellule d'axe. La détectabilité est INVERSÉE :
 * un score élevé = bonne détection = risque moindre, donc l'intensité suit
 * `100 − value`. Les autres axes suivent directement `value`.
 */
function axisCellPct(axis: RiskAxisId, value: number): number {
  const risk = axis === "detectabilite" ? 100 - value : value;
  return 12 + (risk / 100) * 72;
}

function axisCellBg(axis: RiskAxisId, value: number, evaluated: boolean): string {
  if (!evaluated) return HATCH;
  const pct = axisCellPct(axis, value);
  return `color-mix(in srgb, ${AXIS_HEX[axis]} ${pct.toFixed(0)}%, transparent)`;
}

/** Couleur de texte lisible (AA) pour une cellule d'axe donnée. */
function axisTextColor(axis: RiskAxisId, value: number): string {
  return wcagTextOnMix(AXIS_HEX[axis], axisCellPct(axis, value));
}

function compositeCellPct(composite: number): number {
  return 20 + (composite / 100) * 68;
}

/** Intensité color-mix de la colonne composite (bande de criticité). */
function compositeCellBg(band: CriticityBand, composite: number | null): string {
  if (composite === null) return HATCH;
  const pct = compositeCellPct(composite);
  return `color-mix(in srgb, ${BAND_HEX[band]} ${pct.toFixed(0)}%, transparent)`;
}

/** Couleur de texte lisible (AA) pour la cellule composite donnée. */
function compositeTextColor(band: CriticityBand, composite: number): string {
  return wcagTextOnMix(BAND_HEX[band], compositeCellPct(composite));
}

/** Persiste le tri courant en localStorage ; ne doit jamais faire planter le rendu. */
function persistSort(sorting: SortingState): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sorting));
  } catch {
    // localStorage indisponible (navigation privée, quota, etc.) : silencieux.
  }
}

/** Restaure le tri persisté ; retourne `null` si absent, corrompu ou indisponible. */
function restoreSort(): SortingState | null {
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every(
      (entry): entry is { id: string; desc: boolean } =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string" &&
        typeof (entry as { desc?: unknown }).desc === "boolean",
    );
    return valid ? (parsed as SortingState) : null;
  } catch {
    return null;
  }
}

const DEFAULT_SORT: SortingState = [{ id: "composite", desc: true }];

export function RiskMatrixHeatmap({
  scores,
  selected,
  onSelect,
  comparisonExercise = null,
  depositCycleSlugs,
  coveredCycleSlugs,
  depositIdByCycleSlug,
}: RiskMatrixHeatmapProps) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const [cycleQuery, setCycleQuery] = useState("");
  const [minComposite, setMinComposite] = useState<string>("");
  const [visibleBands, setVisibleBands] = useState<Record<CriticityBand, boolean>>({
    faible: true,
    modéré: true,
    élevé: true,
    critique: true,
    non_évalué: true,
  });

  // Restauration du tri persisté au montage — jamais de crash si localStorage
  // est indisponible ou corrompu (mode privé, quota dépassé, JSON invalide...).
  useEffect(() => {
    const restored = restoreSort();
    if (restored) setSorting(restored);
  }, []);

  useEffect(() => {
    persistSort(sorting);
  }, [sorting]);

  const showDelta = !!comparisonExercise && isSimulatedExercise(comparisonExercise);

  // Couverture documentaire du dépôt : signal ADDITIF, indépendant de
  // `evaluation`/`composite`. Sets dérivés une seule fois par rendu des props.
  const depositEligibleSlugs = useMemo(
    () => new Set(depositCycleSlugs ?? []),
    [depositCycleSlugs],
  );
  const depositCoveredSlugs = useMemo(
    () => new Set(coveredCycleSlugs ?? []),
    [coveredCycleSlugs],
  );

  const filteredByBand = useMemo(
    () => scores.filter((s) => visibleBands[s.criticityBand]),
    [scores, visibleBands],
  );

  const minCompositeValue = minComposite.trim() === "" ? null : Number(minComposite);
  const hasActiveThreshold =
    minCompositeValue !== null && Number.isFinite(minCompositeValue) && minCompositeValue > 0;

  const nonEvaluatedHiddenByThreshold = useMemo(() => {
    if (!hasActiveThreshold) return 0;
    return filteredByBand.filter((s) => s.composite === null).length;
  }, [filteredByBand, hasActiveThreshold]);

  const data = useMemo(() => {
    const query = cycleQuery.trim().toLowerCase();
    return filteredByBand.filter((s) => {
      if (query && !s.cycleSlug.toLowerCase().includes(query)) return false;
      if (hasActiveThreshold) {
        if (s.composite === null) return false;
        if (s.composite <= (minCompositeValue as number)) return false;
      }
      return true;
    });
  }, [filteredByBand, cycleQuery, hasActiveThreshold, minCompositeValue]);

  // Colonnes tanstack : purement des accesseurs de tri/filtre, le rendu visuel
  // en grille reste géré à la main plus bas (tanstack est agnostique du rendu).
  const columns = useMemo<ColumnDef<CycleRiskScore, unknown>[]>(() => {
    const base: ColumnDef<CycleRiskScore, unknown>[] = [
      {
        id: "cycleSlug",
        accessorFn: (row) => row.cycleSlug,
        sortingFn: "alphanumeric",
      },
      ...RISK_AXES.map(
        (axis): ColumnDef<CycleRiskScore, unknown> => ({
          id: axis.id,
          accessorFn: (row) =>
            row.evaluation === "évalué" ? row.axes[axis.id].value : null,
          sortUndefined: "last",
          sortingFn: (rowA, rowB, columnId) => {
            const a = rowA.getValue<number | null>(columnId);
            const b = rowB.getValue<number | null>(columnId);
            if (a === null && b === null) return 0;
            if (a === null) return 1;
            if (b === null) return -1;
            return a - b;
          },
        }),
      ),
      {
        id: "composite",
        accessorFn: (row) => row.composite,
        // Les non-évalués/partiels (composite null) restent TOUJOURS en fin de
        // liste, quelle que soit la direction du tri — jamais traités comme 0.
        sortingFn: (rowA, rowB, columnId) => {
          const a = rowA.getValue<number | null>(columnId);
          const b = rowB.getValue<number | null>(columnId);
          if (a === null && b === null) return 0;
          if (a === null) return 1;
          if (b === null) return -1;
          return a - b;
        },
      },
    ];
    return base;
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        // Toujours forcer les null en fin, peu importe la direction demandée :
        // on n'inverse pas manuellement l'ordre des null, sortingFn s'en charge
        // déjà (asc/desc), mais on garde une seule colonne de tri active à la fois.
        return next;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableMultiSort: false,
    enableSortingRemoval: true,
  });

  const rows = table.getRowModel().rows.map((r) => r.original);

  function toggleSort(columnId: SortableColumnId) {
    const column = table.getColumn(columnId);
    if (!column) return;
    const current = sorting.find((s) => s.id === columnId);
    if (!current) {
      setSorting([{ id: columnId, desc: true }]);
    } else if (!current.desc) {
      setSorting([]);
    } else {
      setSorting([{ id: columnId, desc: false }]);
    }
  }

  function sortIconFor(columnId: SortableColumnId) {
    const current = sorting.find((s) => s.id === columnId);
    if (!current) return <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden />;
    return current.desc ? (
      <ChevronDown className="h-3 w-3" aria-hidden />
    ) : (
      <ChevronUp className="h-3 w-3" aria-hidden />
    );
  }

  function resetFilters() {
    setCycleQuery("");
    setMinComposite("");
    setVisibleBands({
      faible: true,
      modéré: true,
      élevé: true,
      critique: true,
      non_évalué: true,
    });
  }

  const gridTemplate = `160px repeat(${RISK_AXES.length}, 1fr) 84px${showDelta ? " 64px" : ""}`;

  const bandCheckboxes: { band: CriticityBand; label: string }[] = [
    { band: "faible", label: "Faible" },
    { band: "modéré", label: "Modéré" },
    { band: "élevé", label: "Élevé" },
    { band: "critique", label: "Critique" },
    { band: "non_évalué", label: "Non évalué" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Barre de filtres */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-3 py-2.5">
        <label className="flex flex-col gap-1 text-[10px] font-medium text-[var(--pb-text-faint)]">
          Rechercher un cycle
          <input
            type="text"
            value={cycleQuery}
            onChange={(e) => setCycleQuery(e.target.value)}
            placeholder="ex. clients, immos…"
            className="w-40 rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface)] px-2 py-1 text-[11px] text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-[10px] font-medium text-[var(--pb-text-faint)]">
          Composite supérieur à
          <input
            type="number"
            min={0}
            max={100}
            value={minComposite}
            onChange={(e) => setMinComposite(e.target.value)}
            placeholder="0"
            className="w-24 rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface)] px-2 py-1 text-[11px] tabular-nums text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
          />
        </label>
        {hasActiveThreshold && nonEvaluatedHiddenByThreshold > 0 && (
          <span className="pb-0.5 text-[10px] text-[var(--pb-text-faint)]">
            {nonEvaluatedHiddenByThreshold} non affiché
            {nonEvaluatedHiddenByThreshold > 1 ? "s" : ""} (non évalués)
          </span>
        )}

        <div className="flex flex-col gap-1 text-[10px] font-medium text-[var(--pb-text-faint)]">
          Bande de criticité
          <div className="flex flex-wrap gap-2">
            {bandCheckboxes.map(({ band, label }) => (
              <label
                key={band}
                className="flex items-center gap-1 text-[10.5px] font-normal text-[var(--pb-text-muted)]"
              >
                <input
                  type="checkbox"
                  checked={visibleBands[band]}
                  onChange={(e) =>
                    setVisibleBands((prev) => ({ ...prev, [band]: e.target.checked }))
                  }
                  className="h-3 w-3 accent-[var(--pb-accent)]"
                />
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: BAND_HEX[band] }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto rounded-md border border-[var(--pb-border)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)]"
        >
          Réinitialiser les filtres
        </button>
      </div>

      <div
        role="grid"
        aria-label="Matrice thermique des cycles"
        className="grid items-center gap-1.5 text-[var(--pb-text)]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* En-tête */}
        <div role="row" className="contents">
          <button
            type="button"
            role="columnheader"
            onClick={() => toggleSort("cycleSlug")}
            className="flex items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)] hover:text-[var(--pb-text)]"
          >
            Cycle {sortIconFor("cycleSlug")}
          </button>
          {RISK_AXES.map((axis) => (
            <button
              key={axis.id}
              type="button"
              role="columnheader"
              onClick={() => toggleSort(axis.id)}
              title={`${axis.label} — ${axis.doctrine}`}
              className="flex items-center justify-center gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: AXIS_HEX[axis.id] }}
            >
              {axis.short} {sortIconFor(axis.id)}
            </button>
          ))}
          <button
            type="button"
            role="columnheader"
            onClick={() => toggleSort("composite")}
            className="flex items-center justify-center gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)]"
          >
            Comp. {sortIconFor("composite")}
          </button>
          {showDelta && (
            <div
              role="columnheader"
              title={`Variation du composite vs exercice ${comparisonExercise} (simulé)`}
              className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)]"
            >
              Δ
            </div>
          )}
        </div>

        {/* Lignes */}
        {rows.map((s) => {
          const evaluated = s.evaluation === "évalué";
          const isSelected = s.cycleSlug === selected;
          const bandColor = BAND_HEX[s.criticityBand];

          let deltaContent: React.ReactNode = null;
          if (showDelta && comparisonExercise) {
            const currentValue = simulateHistoricalComposite(
              s.cycleSlug,
              s.composite,
              CURRENT_EXERCISE,
            );
            const comparisonValue = simulateHistoricalComposite(
              s.cycleSlug,
              s.composite,
              comparisonExercise,
            );
            if (currentValue === null || comparisonValue === null) {
              deltaContent = (
                <span
                  title={`Vs exercice ${comparisonExercise} (simulé) : non comparable`}
                  className="text-[11px] text-[var(--pb-text-faint)]"
                >
                  —
                </span>
              );
            } else if (currentValue === comparisonValue) {
              deltaContent = (
                <span
                  title={`Vs exercice ${comparisonExercise} (simulé) : stable`}
                  className="text-[11px] text-[var(--pb-text-faint)]"
                >
                  —
                </span>
              );
            } else if (currentValue > comparisonValue) {
              deltaContent = (
                <span
                  title={`Vs exercice ${comparisonExercise} (simulé) : composite en hausse (+${
                    currentValue - comparisonValue
                  })`}
                  className="text-[#ef4444]"
                >
                  ▲
                </span>
              );
            } else {
              deltaContent = (
                <span
                  title={`Vs exercice ${comparisonExercise} (simulé) : composite en baisse (${
                    currentValue - comparisonValue
                  })`}
                  className="text-[#22c55e]"
                >
                  ▼
                </span>
              );
            }
          }

          const isDepositCovered = depositCoveredSlugs.has(s.cycleSlug);
          const isDepositEligible = depositEligibleSlugs.has(s.cycleSlug);
          const depositId = depositIdByCycleSlug?.get(s.cycleSlug);

          return (
            <div key={s.cycleSlug} role="row" className="contents">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  role="rowheader"
                  onClick={() => onSelect(s.cycleSlug)}
                  title={s.cycleSlug}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                    isSelected
                      ? "bg-[var(--pb-surface-3)] text-[var(--pb-text)]"
                      : "text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)]",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: bandColor }}
                  />
                  <span className="truncate">{s.cycleSlug}</span>
                </button>
                {isDepositCovered && (
                  <CheckCircle2
                    className="h-3 w-3 shrink-0 text-[#22c55e]"
                    aria-hidden
                  >
                    <title>Documents déposés pour ce cycle</title>
                  </CheckCircle2>
                )}
                {!isDepositCovered && isDepositEligible && (
                  <Link
                    href={
                      depositId
                        ? `/dashboard/depot?cycle=${encodeURIComponent(depositId)}`
                        : "/dashboard/depot"
                    }
                    title="Cliquer pour déposer les documents de ce cycle"
                    className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                  >
                    Fichier manquant
                  </Link>
                )}
              </div>

              {RISK_AXES.map((axis) => {
                const score = s.axes[axis.id];
                return (
                  <button
                    key={axis.id}
                    type="button"
                    role="gridcell"
                    onClick={() => onSelect(s.cycleSlug)}
                    title={
                      evaluated
                        ? `${axis.label} : ${Math.round(score.value)}/100 — ${axis.doctrine}`
                        : `${axis.label} : non évalué — ${axis.doctrine}`
                    }
                    aria-label={
                      evaluated
                        ? `Score ${axis.label} : ${Math.round(score.value)} sur 100, cycle ${s.cycleSlug}`
                        : `Score ${axis.label} : non évalué, cycle ${s.cycleSlug}`
                    }
                    className={cn(
                      "flex h-8 items-center justify-center rounded-md border font-mono text-xs font-bold transition-transform hover:scale-[1.04]",
                      isSelected
                        ? "border-[var(--pb-accent)]"
                        : "border-[var(--pb-border)]",
                    )}
                    style={{
                      background: axisCellBg(axis.id, score.value, evaluated),
                      color: evaluated ? axisTextColor(axis.id, score.value) : "#3a4761",
                    }}
                  >
                    {evaluated ? Math.round(score.value) : "·"}
                  </button>
                );
              })}

              <button
                type="button"
                role="gridcell"
                onClick={() => onSelect(s.cycleSlug)}
                title={
                  s.composite === null
                    ? "Composite : non évalué"
                    : `Composite : ${Math.round(s.composite)}/100 · ${BAND_LABEL[s.criticityBand]} (heuristique)`
                }
                aria-label={
                  s.composite === null
                    ? `Score composite : non évalué, cycle ${s.cycleSlug}, niveau ${BAND_LABEL[s.criticityBand]}`
                    : `Score composite : ${Math.round(s.composite)} sur 100, cycle ${s.cycleSlug}, niveau ${BAND_LABEL[s.criticityBand]}`
                }
                className={cn(
                  "flex h-8 flex-col items-center justify-center gap-0.5 rounded-md border px-1 font-mono text-xs font-extrabold transition-transform hover:scale-[1.04]",
                  isSelected ? "border-[var(--pb-accent)]" : "border-[var(--pb-border)]",
                )}
                style={{
                  background: compositeCellBg(s.criticityBand, s.composite),
                  color:
                    s.composite === null
                      ? "#3a4761"
                      : compositeTextColor(s.criticityBand, s.composite),
                }}
              >
                <span>{s.composite === null ? "·" : Math.round(s.composite)}</span>
                {s.composite !== null && (
                  <>
                    <span
                      aria-hidden
                      className="h-[2px] w-full max-w-[48px] overflow-hidden rounded-full bg-black/25"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, s.composite))}%`,
                          background: bandColor,
                        }}
                      />
                    </span>
                    <span className="text-[8px] font-medium normal-case leading-none opacity-85">
                      {BAND_LABEL[s.criticityBand]}
                    </span>
                  </>
                )}
              </button>

              {showDelta && (
                <div
                  className="flex h-8 items-center justify-center rounded-md border border-[var(--pb-border)] text-sm font-bold"
                >
                  {deltaContent}
                </div>
              )}
            </div>
          );
        })}

        {rows.length === 0 && (
          <div
            className="col-span-full py-6 text-center text-[11px] text-[var(--pb-text-faint)]"
            style={{ gridColumn: `1 / -1` }}
          >
            Aucun cycle ne correspond aux filtres actifs.
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--pb-border)] pt-2.5">
        {LEGEND_BANDS.map(({ band, range }) => (
          <span key={band} className="flex items-center gap-1.5 text-[10.5px] text-[var(--pb-text-muted)]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: BAND_HEX[band] }}
            />
            {BAND_LABEL[band]} ({range})
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--pb-text-muted)]">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: HATCH }}
          />
          Non évalué / partiel
        </span>
        {showDelta && (
          <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--pb-text-faint)]">
            <TriangleAlert className="h-3 w-3" aria-hidden />
            Δ vs exercice {comparisonExercise} (simulé)
          </span>
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
        Intensité proportionnelle au score de l'axe (détectabilité inversée : plus
        elle est faible, plus la cellule est chaude). Cellule hachurée = cycle non
        évalué, jamais assimilé à un risque maîtrisé. Le composite est une heuristique
        interne d'aide à la hiérarchisation, non opposable.
      </p>
    </div>
  );
}
