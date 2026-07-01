"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";
import type { AuditCycle, CycleFamily } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILIES, CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import { computeMateriality } from "@/lib/audit/materiality";
import type { Finding } from "@/lib/canonical-model";
import { allFindings } from "@/lib/canonical-model/dossier";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import type { CycleRiskScore } from "@/lib/risk-mapping";
import {
  buildCycleScores,
  buildPageAggregates,
  buildRiskGraph,
  layoutRadialByFamily,
} from "@/lib/risk-mapping";
import { cn } from "@/lib/utils";
import { RiskMatrixHeatmap } from "./RiskMatrixHeatmap";
import { RiskFlowGraph } from "./RiskFlowGraph";
import { RiskBubbleChart } from "./RiskBubbleChart";
import { CycleRiskPanel } from "./CycleRiskPanel";
import { useRiskAdjustments } from "./useRiskAdjustments";

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

type ViewMode = "matrix" | "flow" | "bubble";

const VIEW_LABELS: Record<ViewMode, string> = {
  matrix: "Matrice",
  flow: "Flux",
  bubble: "Bulles",
};

const BAND_LABELS = ["critique", "élevé", "modéré", "faible"] as const;

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

  const { adjustments, setAdjustment, resetCycle, resetAll } = useRiskAdjustments();

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

  const scores = useMemo(
    () => buildCycleScores(cycles, findings, materiality, adjustments),
    [cycles, findings, materiality, adjustments],
  );

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

  // Scores filtrés par famille pour la matrice et le nuage.
  const filteredScores = useMemo(
    () =>
      familyFilter === null
        ? scores
        : scores.filter((s) => s.family === familyFilter),
    [scores, familyFilter],
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

  const selectedCycle = selected ? cycles.find((c) => c.slug === selected) : null;
  const selectedScore = selected ? scores.find((s) => s.cycleSlug === selected) : null;
  const selectedAdjustment = selected ? adjustments[selected] : undefined;
  const hasAdjustments = Object.keys(adjustments).length > 0;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Zone principale */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="p-6">
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

            <div
              role="tablist"
              aria-label="Vue de la cartographie"
              className="inline-flex rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-1"
            >
              {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                    view === mode
                      ? "bg-[var(--pb-accent)]/15 text-[var(--pb-text)]"
                      : "text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]",
                  )}
                >
                  {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Statistiques par bande */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BAND_LABELS.map((band) => (
              <div
                key={band}
                className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] px-4 py-3"
              >
                <div className="tnum text-[22px] font-bold text-[var(--pb-text)]">
                  {aggregates.distribution[band]}
                </div>
                <div className="mt-0.5 text-[11px] capitalize text-[var(--pb-text-muted)]">
                  {band}
                </div>
              </div>
            ))}
          </div>

          {/* Vue principale */}
          <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
            {view === "matrix" && (
              <RiskMatrixHeatmap
                scores={filteredScores}
                selected={selected}
                onSelect={setSelected}
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
              </div>
            )}
          </div>

          {/* Disclaimer + reset global */}
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
            Heuristique interne d'aide à la hiérarchisation — non opposable. Basée
            sur les constats du dossier démo DEMO SA · ajustements de jugement en
            mémoire de session uniquement, non persistés.
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
        <div className="w-[360px] shrink-0 overflow-y-auto border-l border-[var(--pb-border)] bg-[var(--pb-surface)]">
          <div className="p-5">
            <CycleRiskPanel
              cycle={selectedCycle}
              score={selectedScore}
              findingsById={findingsById}
              adjustment={selectedAdjustment}
              onAdjust={(patch) => setAdjustment(selectedCycle.slug, patch)}
              onReset={() => resetCycle(selectedCycle.slug)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
