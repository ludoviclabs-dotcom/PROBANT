"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AuditCycle, CycleFamily } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILIES, CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import { computeMateriality, type MaterialityThresholds } from "@/lib/audit/materiality";
import type { Finding } from "@/lib/canonical-model";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
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
import { BAND_LABEL, buildDistribution } from "@/lib/risk-mapping/view";
import { track } from "@/lib/analytics/track";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { InstrumentPage, PageIntro, SectionHead } from "@/components/charte/InstrumentPage";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { prefersReducedMotion } from "@/components/charte/motion";
import p from "@/components/charte/page.module.css";
import { RiskMatrixHeatmap } from "./RiskMatrixHeatmap";
import { RiskFlowGraph } from "./RiskFlowGraph";
import { RiskBubbleChart } from "./RiskBubbleChart";
import { RiskTemporalChart } from "./RiskTemporalChart";
import { ThresholdSimulator } from "./ThresholdSimulator";
import { CycleRiskPanel } from "./CycleRiskPanel";
import { BandSwatch } from "./BandMark";
import { useRiskAdjustments } from "./useRiskAdjustments";
import { useDepositCoverage } from "./useDepositCoverage";
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";
import s from "./risk.module.css";

/**
 * Shell client de la cartographie des risques. Il assemble le moteur pur
 * `lib/risk-mapping` (scoring, agrégats, graphe, layout) et les vues (registre,
 * graphe de flux, nuage, vue temporelle, panneau détail), détient l'état
 * d'interface et le hook d'ajustements de jugement.
 *
 * Les constats proviennent exclusivement du `DossierSnapshot` actif.
 * La matérialité est dérivée de la base passée en props.
 *
 * Règle de fiabilité (non négociable) : le composite est une heuristique interne
 * jamais opposable (marqueur `isHeuristic` porté par chaque score). Les arcs du
 * graphe ne viennent que de `relatedCycles` et des comptes PCG réellement
 * partagés. `GENERATED_AT` est une constante : aucun `Date.now()` au rendu, pour
 * exclure tout écart d'hydratation serveur/client.
 *
 * Charte « instruments » (comme la Synthèse) : en-tête éditorial et relevés, barre d'outils à bascules soulignées,
 * répartition par niveau, registre à filets continus et panneau de détail sur le plan 2 (Échap le ferme et rend le
 * focus à la ligne qui l'a ouvert). La mise en forme des chiffres vient de `lib/risk-mapping/view`.
 */

/**
 * Horodatage de génération du graphe, figé. La valeur n'est pas opposable : elle
 * étiquette la production de la carte heuristique. Constante volontaire pour ne
 * jamais appeler `Date.now()`/`new Date()` pendant le rendu.
 */
const GENERATED_AT = "2026-07-01T00:00:00.000Z";

const VIEW_W = 640;
const VIEW_H = 520;

type ViewMode = "matrix" | "flow" | "bubble" | "temporal";

const VIEW_ORDER: ViewMode[] = ["matrix", "flow", "bubble", "temporal"];

const VIEW_LABELS: Record<ViewMode, string> = {
  matrix: "matrice",
  flow: "flux",
  bubble: "bulles",
  temporal: "temporel",
};

const VIEW_TITLES: Record<ViewMode, string> = {
  matrix: "Registre des cycles",
  flow: "Flux entre cycles",
  bubble: "Probabilité × gravité",
  temporal: "Évolution du composite",
};

const VIEW_NOTES: Record<ViewMode, string> = {
  matrix: "tri par en-tête · une ligne ouvre le détail",
  flow: "trait plein : relation déclarée · pointillé : comptes partagés",
  bubble: "rayon : exposition · cycles non évalués exclus",
  temporal: "2022 et 2023 simulés · 2024 réel",
};

/** Options du sélecteur d'exercice — 2024 réel, 2022/2023 explicitement simulés. */
const EXERCISE_OPTIONS: { value: HistoricalExercise; label: string }[] = [
  { value: 2022, label: "2022 simulé" },
  { value: 2023, label: "2023 simulé" },
  { value: CURRENT_EXERCISE, label: "2024 réel" },
];

type Trigger = HTMLElement | SVGElement;

export function RiskMappingView({ cycles }: { cycles: AuditCycle[] }) {
  const uid = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("matrix");
  const [familyFilter, setFamilyFilter] = useState<CycleFamily | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<HistoricalExercise>(CURRENT_EXERCISE);
  const [simulatedThreshold, setSimulatedThreshold] = useState<number | null>(null);
  // Filtre de bande piloté par la répartition : un clic restreint le registre à
  // cette bande ; recliquer le même niveau annule le filtre. Local, jamais persisté.
  const [activeBand, setActiveBand] = useState<CriticityBand | null>(null);

  // Tracking : une seule fois au montage, garde par ref pour ignorer le
  // double appel du Strict Mode en dev (l'effet s'exécute deux fois en dev).
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track("demo_viewed", { source: "risques" });
  }, []);

  // Tween d'entrée des vues graphiques (~950 ms, fini) ; état final immédiat sous mouvement réduit.
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) {
      rafRef.current = requestAnimationFrame(() => setT(1));
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }
    const dur = 950;
    const start = performance.now();
    const ease = (q: number) => 1 - Math.pow(1 - q, 3);
    const tick = (now: number) => {
      const q = Math.min(1, (now - start) / dur);
      setT(ease(q));
      if (q < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const activeSnapshot = useActiveDossierSnapshot();
  const { adjustments, setAdjustment, resetCycle, resetAll, saveStatus } = useRiskAdjustments(activeSnapshot.dossier.id);
  const coverage = useDepositCoverage();

  // Cycles de dépôt éligibles pour le registre : slug (base normative) → id de
  // dépôt, pour le lien « fichier manquant » et pour distinguer les cycles liés
  // à un dépôt de ceux qui ne le sont pas (la majorité des 35 fiches YAML).
  const depositCycleSlugs = useMemo(() => AUDIT_CYCLES.map((c) => c.config.cycleSlug), []);
  const depositIdByCycleSlug = useMemo(() => new Map(AUDIT_CYCLES.map((c) => [c.config.cycleSlug, c.id])), []);

  const findings = useMemo(() => activeSnapshot.findings, [activeSnapshot.findings]);

  // Projection des effets PARTAGÉE avec la Synthèse (mêmes constats, mêmes événements de revue,
  // même document source) : la gravité lit les mêmes groupes et les mêmes montants par poste et sens.
  const exposure = useMemo(() => projectSnapshotExposure(activeSnapshot).exposure, [activeSnapshot]);

  const materiality = useMemo(
    () => computeMateriality(activeSnapshot.calculationContext.materialityBasis ?? { chiffreAffaires: 0 }),
    [activeSnapshot.calculationContext.materialityBasis],
  );

  // Seuil de matérialité alternatif du simulateur ISA 320 (Bloc 4) : substitue
  // `significativite` par la valeur simulée et dérive performance/trivialité
  // proportionnellement aux ratios réels de `materiality`. Reste `null` si
  // aucune simulation n'est active, ou si aucun seuil réel n'existe.
  const simulatedMateriality = useMemo<MaterialityThresholds | null>(() => {
    if (simulatedThreshold === null || !materiality) return null;
    const ratioPerf = materiality.significativite > 0 ? materiality.performance / materiality.significativite : 0.75;
    const ratioTriv = materiality.significativite > 0 ? materiality.trivialite / materiality.significativite : 0.05;
    return {
      ...materiality,
      significativite: Math.round(simulatedThreshold),
      performance: Math.round(simulatedThreshold * ratioPerf),
      trivialite: Math.round(simulatedThreshold * ratioTriv),
    };
  }, [materiality, simulatedThreshold]);

  const activeMateriality = simulatedMateriality ?? materiality;

  // Scores « réels » (seuil réel) — TOUJOURS utilisés pour le panneau détail :
  // celui-ci ne doit jamais montrer de drivers/constats calculés sur un seuil simulé.
  const realScores = useMemo(
    () => buildCycleScores(cycles, findings, materiality, adjustments, exposure),
    [cycles, findings, materiality, adjustments, exposure],
  );

  // Scores affichés dans le registre/les vues agrégées : recalculés avec le
  // seuil simulé quand la simulation est active, sinon identiques aux scores réels.
  const scores = useMemo(
    () => (simulatedMateriality ? buildCycleScores(cycles, findings, activeMateriality, adjustments, exposure) : realScores),
    [simulatedMateriality, cycles, findings, activeMateriality, adjustments, realScores, exposure],
  );

  // Cycles dont la bande de criticité change entre seuil réel et seuil simulé.
  const thresholdImpact = useMemo(() => {
    if (!simulatedMateriality) return [];
    const realBySlug = new Map(realScores.map((sc) => [sc.cycleSlug, sc]));
    const changes: { cycleSlug: string; before: CriticityBand; after: CriticityBand }[] = [];
    for (const sc of scores) {
      const before = realBySlug.get(sc.cycleSlug)?.criticityBand;
      if (before && before !== sc.criticityBand) changes.push({ cycleSlug: sc.cycleSlug, before, after: sc.criticityBand });
    }
    return changes;
  }, [simulatedMateriality, realScores, scores]);

  const aggregates = useMemo(() => buildPageAggregates(cycles, scores, findings, undefined, exposure), [cycles, scores, findings, exposure]);

  const graph = useMemo(() => {
    const scoreMap = new Map<string, CycleRiskScore>(scores.map((sc) => [sc.cycleSlug, sc]));
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

  // Exercice de comparaison passé au registre pour la colonne Δ : `null`
  // quand l'exercice sélectionné est l'exercice réel courant (rien à comparer).
  const comparisonExercise = isSimulatedExercise(selectedExercise) ? selectedExercise : null;

  // Composite de l'exercice réel par cycle : second terme de l'écart Δ (jamais la valeur déjà simulée).
  const currentComposites = useMemo(() => new Map(scores.map((sc) => [sc.cycleSlug, sc.composite])), [scores]);

  // Sous un exercice simulé sélectionné, substitue le composite affiché par la
  // valeur simulée de `simulateHistoricalComposite` (valeur pédagogique). La bande
  // est recalculée par `criticityBand` (source unique des bornes). Ne touche JAMAIS
  // aux axes/drivers sous-jacents ni au panneau détail.
  const exerciseScores = useMemo(() => {
    if (!isSimulatedExercise(selectedExercise)) return scores;
    return scores.map((sc) => {
      const simulatedComposite = simulateHistoricalComposite(sc.cycleSlug, sc.composite, selectedExercise);
      if (simulatedComposite === sc.composite) return sc;
      return { ...sc, composite: simulatedComposite, criticityBand: criticityBand(simulatedComposite) };
    });
  }, [scores, selectedExercise]);

  // Scores filtrés par famille pour le registre et le nuage.
  const filteredScores = useMemo(
    () => (familyFilter === null ? exerciseScores : exerciseScores.filter((sc) => sc.family === familyFilter)),
    [exerciseScores, familyFilter],
  );

  // Graphe filtré par famille : le renderer ne trace un arc que si ses deux
  // extrémités sont positionnées, donc restreindre les nœuds suffit.
  const filteredGraph = useMemo(
    () => (familyFilter === null ? graph : { ...graph, nodes: graph.nodes.filter((n) => n.family === familyFilter) }),
    [graph, familyFilter],
  );

  // Panneau détail : TOUJOURS les vrais scores (seuil réel, exercice réel).
  const selectedCycle = selected ? cycles.find((c) => c.slug === selected) : null;
  const selectedScore = selected ? realScores.find((sc) => sc.cycleSlug === selected) : null;
  const selectedAdjustment = selected ? adjustments[selected] : undefined;
  const hasAdjustments = Object.keys(adjustments).length > 0;
  const panelOpen = Boolean(selectedCycle && selectedScore);

  // Total des cycles scorés — dénominateur des parts de la répartition.
  const totalCycles = scores.length;
  const distribution = useMemo(() => buildDistribution(aggregates.distribution, totalCycles), [aggregates.distribution, totalCycles]);

  // ── Panneau : ouverture (focus sur le titre), fermeture (Échap, ✕) et retour du focus ──
  const triggerRef = useRef<Trigger | null>(null);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const openCycle = useCallback((slug: string, trigger?: Trigger | null) => {
    triggerRef.current = trigger ?? null;
    setSelected(slug);
    setFocusRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (focusRequest > 0) panelTitleRef.current?.focus();
  }, [focusRequest]);

  const closePanel = useCallback(() => {
    const slug = selected;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    setSelected(null);
    // Retour à l'élément qui a ouvert le panneau ; à défaut (vue changée entre-temps), à la ligne du registre.
    const fallback = slug ? document.querySelector<HTMLElement>(`button[data-cycle="${slug}"]`) : null;
    const target = trigger && trigger.isConnected ? trigger : fallback;
    target?.focus();
  }, [selected]);

  function onPanelKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePanel();
    }
  }

  // Changer de vue efface le survol du graphe (un nœud démonté ne reçoit pas son mouseleave).
  function changeView(mode: ViewMode) {
    setView(mode);
    setHovered(null);
  }

  // Bascule d'onglets : flèches gauche/droite, Début/Fin (tabindex itinérant).
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const i = VIEW_ORDER.indexOf(view);
    const next =
      event.key === "ArrowRight"
        ? VIEW_ORDER[(i + 1) % VIEW_ORDER.length]
        : event.key === "ArrowLeft"
          ? VIEW_ORDER[(i - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]
          : event.key === "Home"
            ? VIEW_ORDER[0]
            : event.key === "End"
              ? VIEW_ORDER[VIEW_ORDER.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    changeView(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }

  // Clic sur un niveau de la répartition : bascule le filtre de bande (annulé au
  // reclic) ET force la vue Matrice — le filtre ne s'applique qu'au registre.
  function handleBandClick(band: CriticityBand) {
    setActiveBand((prev) => (prev === band ? null : band));
    changeView("matrix");
  }

  const unattached = aggregates.unattachedFindings.length;
  const coveredCount = coverage?.coveredCycleSlugs.length ?? 0;

  return (
    <InstrumentPage>
      <PageIntro
        index="03"
        eyebrowNote="cockpit intérim du CAC"
        title="Cartographie des risques"
        lead={
          <>
            Chaque cycle est noté sur quatre axes — gravité, probabilité, détectabilité, exposition — à partir des constats et des
            fiches cycles. Le composite est une <strong>heuristique interne d&apos;aide à la décision, jamais opposable</strong> :
            seuls les constats sourcés et les risques déclarés font foi.
          </>
        }
        aside={
          <dl className={`${p.readouts} ${s.readouts}`}>
            <div>
              <dt>Cycles évalués</dt>
              <dd>
                {aggregates.evaluatedCycleCount}
                <span className={p.readoutNote}>
                  {" "}
                  · {aggregates.unevaluatedCycleCount} non évalué{aggregates.unevaluatedCycleCount > 1 ? "s" : ""}
                </span>
              </dd>
            </div>
            <div>
              <dt>Constats</dt>
              <dd>
                {findings.length}
                <span className={p.readoutNote}>
                  {" "}
                  · {activeSnapshot.dossier.demoMode ? `données fictives ${activeSnapshot.dossier.societe.raisonSociale}` : "dossier actif"}
                  {unattached > 0 && ` · ${unattached} non rattaché${unattached > 1 ? "s" : ""}`}
                </span>
              </dd>
            </div>
            {materiality && (
              <div>
                <dt>Seuil ISA 320</dt>
                <dd>{materiality.significativite.toLocaleString("fr-FR")} €</dd>
              </div>
            )}
            {coverage && (
              <div title="Comparaisons enregistrées sur les documents fournis ; aucune couverture de cycle démontrée">
                <dt>Dépôt documentaire</dt>
                <dd>
                  {coveredCount}/{coverage.total}
                  <span className={p.readoutNote}> cycles comparés (dépôt limité)</span>
                  <span aria-hidden="true" className={s.coverageBar}>
                    <span style={{ width: `${coverage.total > 0 ? (coveredCount / coverage.total) * 100 : 0}%` }} />
                  </span>
                </dd>
              </div>
            )}
          </dl>
        }
      />

      {/* Barre d'outils : familles, exercice, vue. */}
      <div className={`${p.toolbar} ${s.toolbar}`}>
        <span className={p.toggleGroup} role="group" aria-label="Famille de cycles">
          <span className={p.key} aria-hidden="true">
            Famille
          </span>
          <button type="button" className={p.toggle} aria-pressed={familyFilter === null} onClick={() => setFamilyFilter(null)}>
            toutes
          </button>
          {presentFamilies.map((f) => {
            const active = familyFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className={p.toggle}
                aria-pressed={active}
                title={CYCLE_FAMILY_LABEL[f.id]}
                onClick={() => setFamilyFilter(active ? null : f.id)}
              >
                {f.short.toLowerCase()}
              </button>
            );
          })}
        </span>

        <label className={p.field}>
          <span className={p.key}>Exercice</span>
          <select value={selectedExercise} onChange={(e) => setSelectedExercise(Number(e.target.value) as HistoricalExercise)}>
            {EXERCISE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <span role="tablist" aria-label="Vue de la cartographie" className={s.tabs}>
          {VIEW_ORDER.map((mode) => (
            <button
              key={mode}
              id={`${uid}-tab-${mode}`}
              type="button"
              role="tab"
              aria-selected={view === mode}
              aria-controls={`${uid}-tabpanel`}
              tabIndex={view === mode ? 0 : -1}
              data-tour-tab={mode}
              className={p.toggle}
              onClick={() => changeView(mode)}
              onKeyDown={onTabKey}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </span>
      </div>

      {/* Exercice simulé sélectionné : avis à filet tireté (présomption, jamais un vrai chiffre). */}
      {isSimulatedExercise(selectedExercise) && (
        <p className={s.notice}>
          <span className={s.noticeKey}>Données {selectedExercise} SIMULÉES</span>
          <span className={s.noticeText}>
            à des fins de démonstration — aucun dossier réel ne les a produites. Les composites et bandes de criticité affichés
            ci-dessous sont recalculés par une variation déterministe autour de l&apos;exercice réel {CURRENT_EXERCISE}, jamais un vrai
            chiffre d&apos;audit.
          </span>
        </p>
      )}

      {/* Simulateur de seuil ISA 320 et, quand il est actif, son impact sur les bandes. */}
      {materiality && (
        <ThresholdSimulator actualThreshold={materiality.significativite} onSimulate={setSimulatedThreshold}>
          {simulatedMateriality && (
            <div className={s.impact} aria-live="polite">
              <span>
                <span className={s.impactCount}>{thresholdImpact.length}</span> cycle(s) changeraient de bande
              </span>
              {thresholdImpact.length > 0 && (
                <details>
                  <summary>Voir le détail</summary>
                  <ul className={s.impactList}>
                    {thresholdImpact.map((change) => (
                      <li key={change.cycleSlug}>
                        {change.cycleSlug} : {BAND_LABEL[change.before].toLowerCase()} → {BAND_LABEL[change.after].toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </ThresholdSimulator>
      )}

      {/* Répartition par niveau : un clic filtre le registre (et y ramène). */}
      <section aria-labelledby={`${uid}-dist`} className={s.section}>
        <SectionHead id={`${uid}-dist`} title={`Répartition des ${totalCycles} cycles`} note="cliquer un niveau filtre le registre" />
        <div className={s.distBar} aria-hidden="true">
          {distribution
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <span key={entry.band} className={s.distSeg} data-band={entry.band} style={{ flex: `${entry.count} 1 0` }} />
            ))}
        </div>
        <div className={s.levels}>
          {distribution.map((entry) => {
            const isActive = activeBand === entry.band;
            return (
              <button
                key={entry.band}
                type="button"
                className={s.levelBtn}
                aria-pressed={isActive}
                onClick={() => handleBandClick(entry.band)}
                title={isActive ? `Filtre actif : ${entry.label} — cliquer pour tout réafficher` : `Filtrer le registre sur le niveau ${entry.label}`}
              >
                <span className={s.levelHead}>
                  <BandSwatch band={entry.band} />
                  <span className={s.levelName}>{entry.label}</span>
                  {entry.range && <span className={s.levelRange}>{entry.range}</span>}
                </span>
                <span className={s.levelCount}>
                  {entry.count}
                  <span className={s.levelPct}> · {entry.percent} %</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Vue active + panneau de détail du cycle. */}
      <section aria-labelledby={`${uid}-view`} className={s.section}>
        <SectionHead id={`${uid}-view`} title={VIEW_TITLES[view]} note={VIEW_NOTES[view]} />
        <div className={s.workspace} data-panel={panelOpen ? "" : undefined}>
          <div key={view} id={`${uid}-tabpanel`} role="tabpanel" aria-labelledby={`${uid}-tab-${view}`} className={s.view}>
            {view === "matrix" && (
              <RiskMatrixHeatmap
                scores={filteredScores}
                selected={selected}
                onSelect={openCycle}
                comparisonExercise={comparisonExercise}
                currentComposites={currentComposites}
                depositCycleSlugs={depositCycleSlugs}
                coveredCycleSlugs={coverage?.coveredCycleSlugs ?? []}
                depositIdByCycleSlug={depositIdByCycleSlug}
                activeBand={activeBand}
              />
            )}
            {view === "flow" && (
              <>
                <RiskFlowGraph graph={filteredGraph} t={t} selected={selected} hovered={hovered} onSelect={openCycle} onHover={setHovered} />
                <p className={p.note}>
                  Trait plein = relation déclarée entre cycles ; trait pointillé = comptes PCG partagés. Le survol ou le focus
                  d&apos;un nœud surligne ses voisins directs (fait de relation, aucune propagation chiffrée). Tab parcourt les
                  nœuds, Entrée ouvre le détail.
                </p>
              </>
            )}
            {view === "bubble" && (
              <>
                <RiskBubbleChart scores={filteredScores} onSelect={openCycle} selected={selected} />
                <p className={p.note}>
                  Abscisse = probabilité (ISA 315), ordonnée = gravité (ISA 320, axe inversé — fort en haut), rayon = exposition
                  normative. Les cycles non évalués sont exclus : les placer à l&apos;origine suggérerait à tort un risque nul.
                </p>
              </>
            )}
            {view === "temporal" && <RiskTemporalChart scores={realScores} cycles={cycles.map((c) => c.slug)} />}
          </div>

          {panelOpen && selectedCycle && selectedScore && (
            <aside className={s.aside} aria-labelledby={`${uid}-panel-title`} onKeyDown={onPanelKey}>
              <CycleRiskPanel
                key={selectedCycle.slug}
                cycle={selectedCycle}
                score={selectedScore}
                findingsById={findingsById}
                adjustment={selectedAdjustment}
                onAdjust={(patch) => setAdjustment(selectedCycle.slug, patch)}
                onReset={() => resetCycle(selectedCycle.slug)}
                onClose={closePanel}
                saveStatus={saveStatus}
                titleRef={panelTitleRef}
                titleId={`${uid}-panel-title`}
              />
            </aside>
          )}
        </div>
      </section>

      {/* Avertissement de méthode + réinitialisation globale. */}
      <div className={s.section}>
        <p className={p.note}>
          <FamilyRule family="internal" />
          <span>
            Heuristique interne d&apos;aide à la hiérarchisation — non opposable. Basée sur les constats du dossier actif ; les
            ajustements de jugement sont sauvegardés côté serveur en persistance simulée, non durable au redémarrage — pas une
            vraie base de données.
          </span>
        </p>
        {hasAdjustments && (
          <button type="button" className={p.btnQuiet} onClick={resetAll}>
            Réinitialiser tous les ajustements
          </button>
        )}
      </div>
    </InstrumentPage>
  );
}
