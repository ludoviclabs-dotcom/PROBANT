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
  Search,
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
  /**
   * Filtre de bande piloté depuis le shell (cartes de stats). Si fourni et
   * non-`null`, restreint les lignes visibles à cette seule bande — EN PLUS des
   * chips internes. Absent/`null` = comportement actuel inchangé (rétro-compat).
   */
  activeBand?: CriticityBand | null;
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
  { band: "faible", range: "0-24" },
  { band: "modéré", range: "25-54" },
  { band: "élevé", range: "55-74" },
  { band: "critique", range: "75-100" },
];

/**
 * Fond hachuré gris pour les cellules non évaluées (jamais de vert). Texture
 * distincte des tokens de surface — même motif que la légende de pied (v2).
 */
const HATCH =
  "repeating-linear-gradient(45deg, #1a2029 0, #1a2029 3px, #10151c 3px, #10151c 6px)";

/** Clé localStorage du tri persisté — dossierId fixe, pas de vraie multi-tenance. */
const SORT_STORAGE_KEY = "probant_risques_sort_demo-dossier";

type SortableColumnId = "cycleSlug" | RiskAxisId | "composite";

/**
 * Intensité color-mix d'une cellule d'axe. La détectabilité est INVERSÉE :
 * un score élevé = bonne détection = risque moindre, donc l'intensité suit
 * `100 − value`. Les autres axes suivent directement `value`.
 */
function axisRisk(axis: RiskAxisId, value: number): number {
  return axis === "detectabilite" ? 100 - value : value;
}

/** `#rrggbb` → `rgba(r,g,b,a)` (les hex d'axe/bande sont statiques et valides). */
function rgbaHex(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Fond d'une cellule d'axe : dégradé horizontal fonction du RISQUE
 * (détectabilité inversée via `axisRisk`) — teinté à faible alpha à gauche,
 * sombre à droite, exactement comme la maquette v2. Non évalué → hachures.
 */
function axisCellBg(axis: RiskAxisId, value: number, evaluated: boolean): string {
  if (!evaluated) return HATCH;
  const risk = axisRisk(axis, value);
  return `linear-gradient(90deg, ${rgbaHex(AXIS_HEX[axis], 0.04 + (risk / 100) * 0.14)}, rgba(14,20,31,.6))`;
}

/**
 * Barre de remplissage d'une cellule d'axe : dégradé `rgba(hex,.45) → hex` +
 * halo (`box-shadow`), largeur = valeur brute de l'axe (le fond encode le
 * risque, la barre encode la valeur — double codage de la maquette v2).
 */
function axisBarFill(axis: RiskAxisId): { background: string; boxShadow: string } {
  const hex = AXIS_HEX[axis];
  return {
    background: `linear-gradient(90deg, ${rgbaHex(hex, 0.45)}, ${hex})`,
    boxShadow: `0 0 6px ${rgbaHex(hex, 0.35)}`,
  };
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

/** Circonférence du mini-anneau composite (r = 8.5) pour le stroke-dasharray. */
const COMPOSITE_RING_C = 2 * Math.PI * 8.5;

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
  activeBand = null,
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

  // Compteur de cycles par bande (sur l'ensemble des scores reçus), affiché
  // dans chaque chip de bande. Compté sur `scores`, pas sur les lignes filtrées :
  // le chip indique combien de cycles relèvent de la bande, indépendamment de
  // la recherche/seuil actifs.
  const bandCounts = useMemo(() => {
    const counts: Record<CriticityBand, number> = {
      faible: 0,
      modéré: 0,
      élevé: 0,
      critique: 0,
      non_évalué: 0,
    };
    for (const s of scores) counts[s.criticityBand] += 1;
    return counts;
  }, [scores]);

  const filteredByBand = useMemo(
    () =>
      scores.filter(
        (s) =>
          visibleBands[s.criticityBand] &&
          // Filtre externe (carte de stats) : si fourni, restreint à la bande.
          (activeBand === null || s.criticityBand === activeBand),
      ),
    [scores, visibleBands, activeBand],
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
          // `undefined` (et non `null`) pour les non-évalués : c'est la seule
          // valeur que `sortUndefined` sait placer HORS du comparateur inversé
          // par `desc`. Avec `null` + un sortingFn qui renvoie ±1, `desc`
          // inversait le placement et faisait remonter les non-évalués en tête.
          accessorFn: (row) =>
            row.evaluation === "évalué" ? row.axes[axis.id].value : undefined,
          sortUndefined: "last",
          sortingFn: "basic",
        }),
      ),
      {
        id: "composite",
        // Non-évalués/partiels (composite null) → `undefined` + `sortUndefined:
        // "last"` : TOUJOURS en fin de liste quelle que soit la direction du
        // tri, jamais traités comme 0 ni remontés en tête sous tri décroissant.
        accessorFn: (row) => row.composite ?? undefined,
        sortUndefined: "last",
        sortingFn: "basic",
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
        // Les non-évalués (undefined) restent en fin via `sortUndefined: "last"`
        // sur chaque colonne, quelle que soit la direction — rien à forcer ici.
        return typeof updater === "function" ? updater(old) : updater;
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

  const gridTemplate = `168px repeat(${RISK_AXES.length}, minmax(72px, 1fr)) 104px${showDelta ? " 60px" : ""}`;

  const bandChips: { band: CriticityBand; label: string }[] = [
    { band: "faible", label: "Faible" },
    { band: "modéré", label: "Modéré" },
    { band: "élevé", label: "Élevé" },
    { band: "critique", label: "Critique" },
    { band: "non_évalué", label: "Non évalué" },
  ];

  const showingLabel =
    rows.length === scores.length
      ? `${rows.length} affichés`
      : `${rows.length} / ${scores.length} affichés`;

  return (
    <div className="flex flex-col gap-3">
      {/* Barre de filtres v2 */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-[11px] border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] px-3 py-2.5">
        {/* Recherche avec loupe intégrée */}
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-[9px] h-[13px] w-[13px] text-[var(--pb-text-faint)]"
            aria-hidden
          />
          <input
            type="text"
            value={cycleQuery}
            onChange={(e) => setCycleQuery(e.target.value)}
            placeholder="Rechercher un cycle…"
            aria-label="Rechercher un cycle"
            className="w-[190px] rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] py-1.5 pl-7 pr-2.5 text-[11.5px] text-[var(--pb-text)] outline-none transition-colors focus:border-[var(--pb-accent)]"
          />
        </div>

        {/* Chips de bande avec compteur */}
        <div className="flex flex-wrap gap-1.5">
          {bandChips.map(({ band, label }) => {
            const on = visibleBands[band];
            const color = BAND_HEX[band];
            return (
              <button
                key={band}
                type="button"
                aria-pressed={on}
                title={`${on ? "Masquer" : "Afficher"} la bande ${label}`}
                onClick={() =>
                  setVisibleBands((prev) => ({ ...prev, [band]: !prev[band] }))
                }
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors"
                style={{
                  borderColor: on
                    ? `color-mix(in srgb, ${color} 55%, transparent)`
                    : "var(--pb-border)",
                  background: on
                    ? `color-mix(in srgb, ${color} 16%, transparent)`
                    : "transparent",
                  color: on ? "var(--pb-text-bright)" : "var(--pb-text-faint)",
                  opacity: on ? 1 : 0.6,
                }}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: color, opacity: on ? 1 : 0.5 }}
                />
                {label}
                <span className="tabular-nums opacity-65">{bandCounts[band]}</span>
              </button>
            );
          })}
        </div>

        {/* Seuil composite (fonctionnalité conservée) */}
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--pb-text-faint)]">
          Comp. &gt;
          <input
            type="number"
            min={0}
            max={100}
            value={minComposite}
            onChange={(e) => setMinComposite(e.target.value)}
            placeholder="0"
            aria-label="Composite supérieur à"
            className="w-16 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1.5 text-[11px] tabular-nums text-[var(--pb-text)] outline-none transition-colors focus:border-[var(--pb-accent)]"
          />
        </label>
        {hasActiveThreshold && nonEvaluatedHiddenByThreshold > 0 && (
          <span className="text-[10px] text-[var(--pb-text-faint)]">
            {nonEvaluatedHiddenByThreshold} masqué
            {nonEvaluatedHiddenByThreshold > 1 ? "s" : ""} (non évalués)
          </span>
        )}

        <span className="ml-auto text-[10.5px] tabular-nums text-[var(--pb-text-faint)]">
          {showingLabel}
        </span>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-[var(--pb-border)] bg-transparent px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)]"
        >
          Réinitialiser
        </button>
      </div>

      <div className="max-h-[600px] overflow-y-auto rounded-[10px]">
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
            className="flex items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)] transition-colors hover:text-[var(--pb-text)]"
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
              className="flex items-center justify-center gap-0.5 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
              style={{ color: AXIS_HEX[axis.id] }}
            >
              {axis.short} {sortIconFor(axis.id)}
            </button>
          ))}
          <button
            type="button"
            role="columnheader"
            onClick={() => toggleSort("composite")}
            className="flex items-center justify-center gap-0.5 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)] transition-colors hover:text-[var(--pb-text)]"
          >
            Comp. {sortIconFor("composite")}
          </button>
          {showDelta && (
            <div
              role="columnheader"
              title={`Variation du composite vs exercice ${comparisonExercise} (simulé)`}
              className="px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--pb-text-faint)]"
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

          const compositePct =
            s.composite === null ? 0 : Math.max(0, Math.min(100, s.composite));
          const ringDash = `${((compositePct / 100) * COMPOSITE_RING_C).toFixed(2)} ${COMPOSITE_RING_C.toFixed(2)}`;

          return (
            <div key={s.cycleSlug} role="row" className="contents">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  role="rowheader"
                  onClick={() => onSelect(s.cycleSlug)}
                  title={s.cycleSlug}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
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
                  {s.findingCount > 0 && (
                    <span
                      title={`${s.findingCount} constat${s.findingCount > 1 ? "s" : ""} rattaché${s.findingCount > 1 ? "s" : ""}`}
                      className="ml-auto shrink-0 font-mono text-[9px] text-[var(--pb-text-faint)]"
                    >
                      {s.findingCount}fc
                    </span>
                  )}
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
                      "relative flex h-9 items-center gap-2 overflow-hidden rounded-md border px-2.5 transition-colors",
                      isSelected
                        ? "border-[var(--pb-accent)]"
                        : "border-[var(--pb-border-soft)] hover:border-[var(--pb-border-strong)]",
                    )}
                    style={{ background: axisCellBg(axis.id, score.value, evaluated) }}
                  >
                    {!evaluated && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ background: HATCH, animation: "pbHatchBurst 2.4s ease both" }}
                      />
                    )}
                    <span
                      className="relative shrink-0 text-right font-mono text-xs font-bold tabular-nums"
                      style={{ width: 22, color: evaluated ? AXIS_HEX[axis.id] : "#3a4761" }}
                    >
                      {evaluated ? Math.round(score.value) : "·"}
                    </span>
                    {evaluated && (
                      <span
                        aria-hidden
                        className="relative block h-1 flex-1 overflow-hidden rounded-full"
                        style={{ background: "rgba(13,18,28,.85)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, score.value))}%`,
                            ...axisBarFill(axis.id),
                            animation: "pbGrowX .6s cubic-bezier(.16,1,.3,1) both",
                          }}
                        />
                      </span>
                    )}
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
                  "relative flex h-9 items-center gap-2 overflow-hidden rounded-md border px-2",
                  isSelected ? "border-[var(--pb-accent)]" : "border-[var(--pb-border)] hover:border-[var(--pb-border-strong)]",
                )}
                style={{
                  background: compositeCellBg(s.criticityBand, s.composite),
                }}
              >
                {s.composite === null && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: HATCH, animation: "pbHatchBurst 2.4s ease both" }}
                  />
                )}
                <svg width="22" height="22" viewBox="0 0 22 22" className="relative shrink-0" aria-hidden>
                  <circle
                    cx="11"
                    cy="11"
                    r="8.5"
                    fill="none"
                    stroke="var(--pb-track)"
                    strokeWidth="2.6"
                  />
                  {s.composite !== null && (
                    <circle
                      cx="11"
                      cy="11"
                      r="8.5"
                      fill="none"
                      stroke={bandColor}
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeDasharray={ringDash}
                      transform="rotate(-90 11 11)"
                    />
                  )}
                </svg>
                <span className="relative flex flex-col items-start leading-[1.15]">
                  <span
                    className="font-mono text-[13px] font-extrabold"
                    style={{
                      color:
                        s.composite === null
                          ? "#3a4761"
                          : compositeTextColor(s.criticityBand, s.composite),
                    }}
                  >
                    {s.composite === null ? "·" : Math.round(s.composite)}
                  </span>
                  <span className="text-[8.5px] font-semibold text-[var(--pb-text-muted)]">
                    {BAND_LABEL[s.criticityBand]}
                  </span>
                </span>
              </button>

              {showDelta && (
                <div
                  role="gridcell"
                  className="flex h-9 items-center justify-center rounded-md border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] text-sm font-bold"
                >
                  {deltaContent}
                </div>
              )}
            </div>
          );
        })}

        {rows.length === 0 && (
          <div
            className="col-span-full py-[26px] text-center text-[11px] text-[var(--pb-text-faint)]"
            style={{ gridColumn: `1 / -1` }}
          >
            Aucun cycle ne correspond aux filtres actifs.
          </div>
        )}
      </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--pb-border)] pt-[11px]">
        {LEGEND_BANDS.map(({ band, range }) => (
          <span key={band} className="flex items-center gap-1.5 text-[10.5px] text-[var(--pb-text-muted)]">
            <span
              aria-hidden
              className="h-[9px] w-[9px] rounded-full"
              style={{ background: BAND_HEX[band] }}
            />
            {BAND_LABEL[band]} ({range})
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--pb-text-muted)]">
          <span
            aria-hidden
            className="h-[9px] w-[9px] rounded-[3px]"
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

      <p className="text-[10.5px] leading-[1.55] text-[var(--pb-text-faint)]">
        Jauge proportionnelle au score de l'axe (détectabilité inversée : plus elle
        est faible, plus la cellule est chaude). Cellule hachurée = cycle non évalué,
        jamais assimilé à un risque maîtrisé. Le composite est une heuristique interne
        d'aide à la hiérarchisation, non opposable.
      </p>
    </div>
  );
}
