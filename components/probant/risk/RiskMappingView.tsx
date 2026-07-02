"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Network } from "lucide-react";
import type { AuditCycle, CycleFamily } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILIES, CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import { computeMateriality, type MaterialityThresholds } from "@/lib/audit/materiality";
import type { Finding } from "@/lib/canonical-model";
import { allFindings } from "@/lib/canonical-model/dossier";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import type { CriticityBand, CycleRiskScore } from "@/lib/risk-mapping";
import {
  buildCycleScores,
  buildPageAggregates,
  buildRiskGraph,
  layoutRadialByFamily,
  criticityBand,
  CURRENT_EXERCISE,
  isSimulatedExercise,
  simulateHistoricalComposite,
  type HistoricalExercise,
} from "@/lib/risk-mapping";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";
import { RiskMatrixHeatmap } from "./RiskMatrixHeatmap";
import { RiskFlowGraph } from "./RiskFlowGraph";
import { RiskBubbleChart } from "./RiskBubbleChart";
import { RiskTemporalChart } from "./RiskTemporalChart";
import { ThresholdSimulator } from "./ThresholdSimulator";
import { CycleRiskPanel } from "./CycleRiskPanel";
import { useRiskAdjustments } from "./useRiskAdjustments";
import { useDepositCoverage } from "./useDepositCoverage";
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";

/**
 * Shell client de la cartographie des risques. Il assemble le moteur pur
 * `lib/risk-mapping` (scoring, agrégats, graphe, layout) et les vues (matrice,
 * graphe de flux, nuage, panneau détail), détient l'état d'interface et le hook
 * d'ajustements de jugement.
 *
 * Les constats proviennent du dossier démo `DEMO_DOSSIER` (même source que la
 * Synthèse), fusionnés best-effort avec d'éventuels constats « live » déposés en
 * `sessionStorage` par le module de dépôt FEC. La fusion est déduplicée par
 * `finding.id`. La matérialité est dérivée de la base passée en props.
 *
 * Règle de fiabilité (non négociable) : le composite est une heuristique interne
 * jamais opposable (marqueur `isHeuristic` porté par chaque score). Les arcs du
 * graphe ne viennent que de `relatedCycles` et des comptes PCG réellement
 * partagés. `GENERATED_AT` est une constante : aucun `Date.now()` au rendu, pour
 * exclure tout écart d'hydratation serveur/client.
 */

/** Clés `sessionStorage` des constats déposés (même source que la revue live). */
const LIVE_FINDINGS_KEY = "probant:live-findings";
const LIVE_ADMISSIBILITE_KEY = "probant:live-admissibilite";

/**
 * Horodatage de génération du graphe, figé. La valeur n'est pas opposable : elle
 * étiquette la production de la carte heuristique. Constante volontaire pour ne
 * jamais appeler `Date.now()`/`new Date()` pendant le rendu.
 */
const GENERATED_AT = "2026-07-01T00:00:00.000Z";

const VIEW_W = 640;
const VIEW_H = 520;

type ViewMode = "matrix" | "flow" | "bubble" | "temporal";

/** Ordre des onglets du contrôle segmenté — pilote la position de la pastille. */
const VIEW_ORDER: ViewMode[] = ["matrix", "flow", "bubble", "temporal"];

const VIEW_LABELS: Record<ViewMode, string> = {
  matrix: "Matrice",
  flow: "Flux",
  bubble: "Bulles",
  temporal: "Temporel",
};

/**
 * Cartes de distribution cliquables : bandes de criticité « scorables » (hors
 * non évalué), dans l'ordre décroissant de gravité. Le libellé est celui de la
 * bande ; `hex` sert au point de couleur et à la mini-barre (mêmes teintes de
 * sévérité que la matrice/panneau, jamais un hex recopié en dur ailleurs).
 */
const STAT_BANDS: { band: CriticityBand; label: string; hex: string }[] = [
  { band: "critique", label: "Critique", hex: "#ef4444" },
  { band: "élevé", label: "Élevé", hex: "#f97316" },
  { band: "modéré", label: "Modéré", hex: "#eab308" },
  { band: "faible", label: "Faible", hex: "#3b82f6" },
];

/** Options du sélecteur d'exercice — 2024 réel, 2022/2023 explicitement simulés. */
const EXERCISE_OPTIONS: { value: HistoricalExercise; label: string }[] = [
  { value: 2022, label: "2022 simulé" },
  { value: 2023, label: "2023 simulé" },
  { value: CURRENT_EXERCISE, label: "2024 réel" },
];

/**
 * Lit un tableau de `Finding` sérialisé dans `sessionStorage` sans jamais lever :
 * une clé absente ou illisible retombe sur une liste vide.
 */
function readLiveFindings(key: string): Finding[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Finding[]) : [];
  } catch {
    return [];
  }
}

/** Fusionne les constats démo et live en dédupliquant par `finding.id`. */
function mergeFindings(base: Finding[], live: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of base) byId.set(f.id, f);
  for (const f of live) byId.set(f.id, f);
  return [...byId.values()];
}

export function RiskMappingView({
  cycles,
  materialityBasis,
}: {
  cycles: AuditCycle[];
  materialityBasis: { chiffreAffaires: number };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("matrix");
  const [familyFilter, setFamilyFilter] = useState<CycleFamily | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<HistoricalExercise>(CURRENT_EXERCISE);
  const [simulatedThreshold, setSimulatedThreshold] = useState<number | null>(null);
  // Filtre de bande piloté par les cartes de distribution : un clic restreint la
  // matrice à cette bande ; recliquer la même carte annule le filtre. Passé à
  // `RiskMatrixHeatmap` via `activeBand`. Local au shell, jamais persisté.
  const [activeBand, setActiveBand] = useState<CriticityBand | null>(null);

  // Tracking : une seule fois au montage, garde par ref pour ignorer le
  // double appel du Strict Mode en dev (l'effet s'exécute deux fois en dev).
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track("demo_viewed", { source: "risques" });
  }, []);

  // Tween d'entrée : même patron que la Synthèse (cubic ease-out ~950 ms).
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const dur = 950;
    const start = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setT(ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const { adjustments, setAdjustment, resetCycle, resetAll, saveStatus } = useRiskAdjustments();
  const coverage = useDepositCoverage();

  // Cycles de dépôt éligibles pour la matrice : slug (base normative) → id de
  // dépôt, pour le lien "Fichier manquant" et pour distinguer les cycles liés
  // à un dépôt de ceux qui ne le sont pas (la majorité des 35 fiches YAML).
  const depositCycleSlugs = useMemo(
    () => AUDIT_CYCLES.map((c) => c.config.cycleSlug),
    [],
  );
  const depositIdByCycleSlug = useMemo(
    () => new Map(AUDIT_CYCLES.map((c) => [c.config.cycleSlug, c.id])),
    [],
  );

  // Constats démo + live. Sentinelle `null` = pas encore hydraté (pattern
  // CloisonsViewLive) : on ne fige pas un premier rendu qui ignorerait des
  // constats déposés côté client.
  const demoFindings = useMemo(() => allFindings(DEMO_DOSSIER), []);
  const [liveFindings, setLiveFindings] = useState<Finding[] | null>(null);
  useEffect(() => {
    setLiveFindings([
      ...readLiveFindings(LIVE_ADMISSIBILITE_KEY),
      ...readLiveFindings(LIVE_FINDINGS_KEY),
    ]);
  }, []);

  const findings = useMemo(
    () => mergeFindings(demoFindings, liveFindings ?? []),
    [demoFindings, liveFindings],
  );

  const materiality = useMemo(
    () => computeMateriality(materialityBasis),
    [materialityBasis],
  );

  // Seuil de matérialité alternatif du simulateur ISA 320 (Bloc 4) : substitue
  // `significativite` par la valeur simulée et dérive performance/trivialité
  // proportionnellement aux ratios réels de `materiality`. Reste `null` si
  // aucune simulation n'est active, ou si aucun seuil réel n'existe (rien à
  // simuler sans base de matérialité).
  const simulatedMateriality = useMemo<MaterialityThresholds | null>(() => {
    if (simulatedThreshold === null || !materiality) return null;
    const ratioPerf = materiality.significativite > 0
      ? materiality.performance / materiality.significativite
      : 0.75;
    const ratioTriv = materiality.significativite > 0
      ? materiality.trivialite / materiality.significativite
      : 0.05;
    return {
      ...materiality,
      significativite: Math.round(simulatedThreshold),
      performance: Math.round(simulatedThreshold * ratioPerf),
      trivialite: Math.round(simulatedThreshold * ratioTriv),
    };
  }, [materiality, simulatedThreshold]);

  const activeMateriality = simulatedMateriality ?? materiality;

  // Scores « réels » (seuil réel) — TOUJOURS utilisés pour le panneau détail :
  // celui-ci ne doit jamais montrer de drivers/constats calculés sur un seuil
  // simulé.
  const realScores = useMemo(
    () => buildCycleScores(cycles, findings, materiality, adjustments),
    [cycles, findings, materiality, adjustments],
  );

  // Scores affichés dans la matrice/les vues agrégées : recalculés avec le
  // seuil simulé quand la simulation est active, sinon identiques aux scores
  // réels.
  const scores = useMemo(
    () =>
      simulatedMateriality
        ? buildCycleScores(cycles, findings, activeMateriality, adjustments)
        : realScores,
    [simulatedMateriality, cycles, findings, activeMateriality, adjustments, realScores],
  );

  // Cycles dont la bande de criticité change entre seuil réel et seuil simulé
  // — alimente le badge + la liste repliable du simulateur de seuil.
  const thresholdImpact = useMemo(() => {
    if (!simulatedMateriality) return [];
    const realBySlug = new Map(realScores.map((s) => [s.cycleSlug, s]));
    const changes: { cycleSlug: string; before: CriticityBand; after: CriticityBand }[] = [];
    for (const s of scores) {
      const before = realBySlug.get(s.cycleSlug)?.criticityBand;
      if (before && before !== s.criticityBand) {
        changes.push({ cycleSlug: s.cycleSlug, before, after: s.criticityBand });
      }
    }
    return changes;
  }, [simulatedMateriality, realScores, scores]);

  const aggregates = useMemo(
    () => buildPageAggregates(cycles, scores, findings),
    [cycles, scores, findings],
  );

  const graph = useMemo(() => {
    const scoreMap = new Map<string, CycleRiskScore>(
      scores.map((s) => [s.cycleSlug, s]),
    );
    const raw = buildRiskGraph(cycles, scoreMap, GENERATED_AT);
    return layoutRadialByFamily(raw, { width: VIEW_W, height: VIEW_H });
  }, [cycles, scores]);

  const findingsById = useMemo(() => {
    const map: Record<string, Finding> = {};
    for (const f of findings) map[f.id] = f;
    return map;
  }, [findings]);

  // Familles réellement présentes, pour le filtre.
  const presentFamilies = useMemo(() => {
    const present = new Set<CycleFamily>(cycles.map((c) => c.family));
    return CYCLE_FAMILIES.filter((f) => present.has(f.id));
  }, [cycles]);

  // Exercice de comparaison passé à la matrice pour la colonne delta : `null`
  // quand l'exercice sélectionné est l'exercice réel courant (rien à comparer).
  const comparisonExercise = isSimulatedExercise(selectedExercise) ? selectedExercise : null;

  // Sous un exercice simulé sélectionné, substitue le composite affiché par la
  // valeur simulée de `simulateHistoricalComposite` (valeur pédagogique : la
  // matrice reflète alors « à quoi ressemblerait ce cycle en {exercice} »).
  // La bande de criticité est recalculée à partir de ce composite simulé.
  // Ne touche JAMAIS aux axes/drivers sous-jacents : seul `composite` (et la
  // bande qui en dérive) est substitué, jamais utilisé par le panneau détail.
  const exerciseScores = useMemo(() => {
    if (!isSimulatedExercise(selectedExercise)) return scores;
    return scores.map((s) => {
      const simulatedComposite = simulateHistoricalComposite(
        s.cycleSlug,
        s.composite,
        selectedExercise,
      );
      if (simulatedComposite === s.composite) return s;
      // Réutilise `criticityBand` (source unique des bornes) plutôt qu'une
      // logique inline : garantit la cohérence avec le reste des vues si les
      // seuils de bande évoluent.
      return {
        ...s,
        composite: simulatedComposite,
        criticityBand: criticityBand(simulatedComposite),
      };
    });
  }, [scores, selectedExercise]);

  // Scores filtrés par famille pour la matrice et le nuage.
  const filteredScores = useMemo(
    () =>
      familyFilter === null
        ? exerciseScores
        : exerciseScores.filter((s) => s.family === familyFilter),
    [exerciseScores, familyFilter],
  );

  // Graphe filtré par famille : le renderer ne trace un arc que si ses deux
  // extrémités sont positionnées, donc restreindre les nœuds suffit.
  const filteredGraph = useMemo(
    () =>
      familyFilter === null
        ? graph
        : { ...graph, nodes: graph.nodes.filter((n) => n.family === familyFilter) },
    [graph, familyFilter],
  );

  // Panneau détail : TOUJOURS les vrais scores (seuil réel, exercice réel),
  // jamais la version substituée par le simulateur de seuil ou l'exercice
  // simulé sélectionné — drivers et constats doivent rester opposables.
  const selectedCycle = selected ? cycles.find((c) => c.slug === selected) : null;
  const selectedScore = selected ? realScores.find((s) => s.cycleSlug === selected) : null;
  const selectedAdjustment = selected ? adjustments[selected] : undefined;
  const hasAdjustments = Object.keys(adjustments).length > 0;

  // Nombre total de cycles scorés — dénominateur du pourcentage des cartes de
  // distribution. Toujours dérivé de `scores.length` (jamais codé en dur).
  const totalCycles = scores.length;

  // Clic sur une carte de distribution : bascule le filtre de bande (toggle sur
  // reclic) ET force la vue Matrice — le filtre ne s'applique qu'à la matrice.
  function handleBandCardClick(band: CriticityBand) {
    setActiveBand((prev) => (prev === band ? null : band));
    setView("matrix");
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Zone principale */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="px-[26px] pb-[30px] pt-[22px]">
          {/* En-tête */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pb-accent)]/15 text-[var(--pb-accent)]">
                <Network className="h-[18px] w-[18px]" />
              </span>
              <h1 className="text-[20px] font-bold text-[var(--pb-text)]">
                Cartographie des risques
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pb-accent)]/40 bg-[var(--pb-accent)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--pb-accent)]">
                cockpit intérim du CAC
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-[var(--pb-text-muted)]">
              Croisement des constats et des fiches cycles pour scorer chaque
              cycle sur quatre axes (gravité, probabilité, détectabilité,
              exposition) et hiérarchiser l'attention. Le composite est une{" "}
              <strong className="text-[var(--pb-text)]">
                heuristique interne d'aide à la décision, jamais opposable
              </strong>{" "}
              — seuls les constats sourcés et les risques déclarés font foi.
            </p>
            <div className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--pb-text-faint)]">
              <span>
                {aggregates.evaluatedCycleCount} cycle(s) évalué(s) ·{" "}
                {aggregates.unevaluatedCycleCount} non évalué(s)
              </span>
              <span>·</span>
              <span>{findings.length} constat(s) — données démo DEMO SA</span>
              {aggregates.unattachedFindings.length > 0 && (
                <>
                  <span>·</span>
                  <span>{aggregates.unattachedFindings.length} non rattaché(s)</span>
                </>
              )}
              {materiality && (
                <>
                  <span>·</span>
                  <span>
                    seuil ISA 320 :{" "}
                    {materiality.significativite.toLocaleString("fr-FR")} €
                  </span>
                </>
              )}
              {coverage && (
                <>
                  <span>·</span>
                  <span
                    className="flex items-center gap-1.5"
                    title="Cycles couverts par un dépôt de documents rapproché"
                  >
                    {coverage.coveredCycleSlugs.length}/{coverage.total} cycles
                    couverts (dépôt)
                    <span
                      aria-hidden
                      className="inline-block h-1 w-[60px] overflow-hidden rounded-full bg-[var(--pb-surface-3)]"
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--pb-accent)]"
                        style={{
                          width: `${
                            coverage.total > 0
                              ? (coverage.coveredCycleSlugs.length / coverage.total) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Barre d'outils : bascule de vue + filtre famille */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFamilyFilter(null)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors",
                  familyFilter === null
                    ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
                    : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]",
                )}
              >
                Toutes familles
              </button>
              {presentFamilies.map((f) => {
                const active = familyFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFamilyFilter(active ? null : f.id)}
                    title={CYCLE_FAMILY_LABEL[f.id]}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors",
                      active
                        ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
                        : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]",
                    )}
                  >
                    {f.short}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--pb-text-faint)]">
                Exercice
                <select
                  value={selectedExercise}
                  onChange={(e) =>
                    setSelectedExercise(Number(e.target.value) as HistoricalExercise)
                  }
                  className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1.5 text-[12px] font-medium text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
                >
                  {EXERCISE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Contrôle segmenté avec pastille glissante (transform animé) */}
              <div
                role="tablist"
                aria-label="Vue de la cartographie"
                className="relative grid grid-cols-4 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-1"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-1 top-1 left-1 rounded-lg bg-[var(--pb-accent)]/15 ring-1 ring-inset ring-[var(--pb-accent)]/30"
                  style={{
                    width: "calc((100% - 8px) / 4)",
                    transform: `translateX(${VIEW_ORDER.indexOf(view) * 100}%)`,
                    transition: "transform .28s cubic-bezier(.16,1,.3,1)",
                  }}
                />
                {VIEW_ORDER.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={view === mode}
                    data-tour-tab={mode}
                    onClick={() => setView(mode)}
                    className={cn(
                      "relative z-[1] rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                      view === mode
                        ? "text-[var(--pb-text)]"
                        : "text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]",
                    )}
                  >
                    {VIEW_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bandeau d'avertissement : exercice simulé sélectionné */}
          {isSimulatedExercise(selectedExercise) && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <p className="text-[12px] font-medium leading-relaxed text-amber-300">
                Données {selectedExercise} SIMULÉES à des fins de démonstration —
                aucun dossier réel ne les a produites. Les composites et bandes de
                criticité affichés ci-dessous sont recalculés par une variation
                déterministe autour de l'exercice réel {CURRENT_EXERCISE}, jamais
                un vrai chiffre d'audit.
              </p>
            </div>
          )}

          {/* Simulateur de seuil ISA 320 */}
          {materiality && (
            <div className="mb-4">
              <ThresholdSimulator
                actualThreshold={materiality.significativite}
                onSimulate={setSimulatedThreshold}
              />
              {simulatedMateriality && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                  <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-400">
                    {thresholdImpact.length} cycle(s) changeraient de bande
                  </span>
                  {thresholdImpact.length > 0 && (
                    <details className="text-[11px] text-[var(--pb-text-muted)]">
                      <summary className="cursor-pointer select-none font-medium text-[var(--pb-text)]">
                        Voir le détail
                      </summary>
                      <ul className="mt-1.5 space-y-0.5">
                        {thresholdImpact.map((change) => (
                          <li key={change.cycleSlug} className="tnum">
                            {change.cycleSlug} : {change.before} → {change.after}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cartes de distribution cliquables (filtre de bande → matrice) */}
          <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_BANDS.map(({ band, label, hex }) => {
              const count = aggregates.distribution[band];
              const pct = totalCycles > 0 ? (count / totalCycles) * 100 : 0;
              const isActive = activeBand === band;
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => handleBandCardClick(band)}
                  aria-pressed={isActive}
                  title={
                    isActive
                      ? `Filtre actif : ${label} — cliquer pour tout réafficher`
                      : `Filtrer la matrice sur la bande ${label}`
                  }
                  className="group flex flex-col rounded-xl border bg-[var(--pb-surface)] px-4 py-3 text-left transition-all hover:-translate-y-px"
                  style={{
                    borderColor: isActive
                      ? `color-mix(in srgb, ${hex} 60%, transparent)`
                      : "var(--pb-border)",
                    background: isActive
                      ? `color-mix(in srgb, ${hex} 8%, var(--pb-surface))`
                      : undefined,
                  }}
                >
                  <span className="flex items-center gap-[7px] text-[11px] font-semibold text-[var(--pb-text-muted)]">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: hex }}
                    />
                    {label}
                  </span>
                  <span className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono text-[24px] font-bold leading-none tabular-nums text-[var(--pb-text)]">
                      {count}
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--pb-text-faint)]">
                      {pct.toFixed(0)} %
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="mt-2.5 block h-[3px] w-full overflow-hidden rounded-full bg-[var(--pb-track)]"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: hex,
                        animation: "pbGrowX .5s cubic-bezier(.16,1,.3,1) both",
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Vue principale — ré-anime à chaque changement d'onglet (key=view) */}
          <div
            key={view}
            className="rounded-2xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4"
            style={{ animation: "pbFadeUp .35s cubic-bezier(.16,1,.3,1) both" }}
          >
            {view === "matrix" && (
              <RiskMatrixHeatmap
                scores={filteredScores}
                selected={selected}
                onSelect={setSelected}
                comparisonExercise={comparisonExercise}
                depositCycleSlugs={depositCycleSlugs}
                coveredCycleSlugs={coverage?.coveredCycleSlugs ?? []}
                depositIdByCycleSlug={depositIdByCycleSlug}
                activeBand={activeBand}
              />
            )}
            {view === "flow" && (
              <div style={{ opacity: 0.4 + 0.6 * t, transition: "opacity .2s" }}>
                <RiskFlowGraph
                  graph={filteredGraph}
                  t={t}
                  selected={selected}
                  hovered={hovered}
                  onSelect={setSelected}
                  onHover={setHovered}
                />
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
                  Trait plein = relation déclarée entre cycles ; trait pointillé =
                  comptes PCG partagés. Le survol d'un nœud surligne ses voisins
                  directs (fait de relation, aucune propagation chiffrée).
                </p>
              </div>
            )}
            {view === "bubble" && (
              <div style={{ opacity: 0.4 + 0.6 * t, transition: "opacity .2s" }}>
                <RiskBubbleChart scores={filteredScores} onSelect={setSelected} />
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
                  Abscisse = probabilité (ISA 315), ordonnée = gravité (ISA 320,
                  axe inversé — fort en haut), rayon = exposition normative. Les
                  cycles non évalués sont exclus : les placer à l'origine
                  suggérerait à tort un risque nul.
                </p>
              </div>
            )}
            {view === "temporal" && (
              <div style={{ opacity: 0.4 + 0.6 * t, transition: "opacity .2s" }}>
                <RiskTemporalChart
                  scores={realScores}
                  cycles={cycles.map((c) => c.slug)}
                />
              </div>
            )}
          </div>

          {/* Disclaimer + reset global */}
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
            Heuristique interne d'aide à la hiérarchisation — non opposable. Basée
            sur les constats du dossier démo DEMO SA · ajustements de jugement
            sauvegardés côté serveur (persistance simulée, non durable au
            redémarrage — pas une vraie base de données).
            {hasAdjustments && (
              <button
                type="button"
                onClick={resetAll}
                className="ml-2 underline hover:text-[var(--pb-text-muted)]"
              >
                Réinitialiser tous les ajustements
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Panneau détail (cycle sélectionné) */}
      {selectedCycle && selectedScore && (
        <div className="w-[352px] shrink-0 overflow-y-auto border-l border-[var(--pb-border)] bg-[var(--pb-surface)]">
          <div className="px-[18px] pb-[26px] pt-[18px]">
            <CycleRiskPanel
              key={selectedCycle.slug}
              cycle={selectedCycle}
              score={selectedScore}
              findingsById={findingsById}
              adjustment={selectedAdjustment}
              onAdjust={(patch) => setAdjustment(selectedCycle.slug, patch)}
              onReset={() => resetCycle(selectedCycle.slug)}
              onClose={() => setSelected(null)}
              saveStatus={saveStatus}
            />
          </div>
        </div>
      )}
    </div>
  );
}
