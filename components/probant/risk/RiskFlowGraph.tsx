"use client";

import { useMemo, type KeyboardEvent } from "react";
import type { RiskGraph, RiskNode, RiskEdge } from "@/lib/risk-mapping";
import { CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import type { CycleFamily } from "@/lib/audit-cycles/types";
import { useReducedMotion } from "@/components/charte/motion";
import { BAND_LABEL, compositeText } from "@/lib/risk-mapping/view";
import { BAND_COLOR, BandMark } from "./BandMark";
import s from "./risk.module.css";

/**
 * Graphe de flux inter-cycles en SVG 2D. Les nœuds sont positionnés en amont par
 * `layout.ts` (champ `node.position.{x,y}`, disposition radiale par famille) :
 * ce composant est un pur renderer, il ne décide d'aucune géométrie de nœud. Les
 * positions du layout (repère 640×520) sont simplement re-projetées dans le
 * viewBox (960×560) — aucune position n'est inventée. Les arcs sont tracés en
 * Bézier cubique.
 *
 * Règle de fiabilité (non négociable) : les arcs proviennent UNIQUEMENT de
 * `graph.edges` (relations `relatedCycles` déclarées, ou comptes PCG réellement
 * partagés). Aucun coefficient de contagion chiffré n'est affiché. Le survol (ou le
 * focus clavier) d'un nœud surligne ses voisins directs via `graph.edges` — c'est un
 * fait de relation, jamais une propagation quantifiée. Les particules le long des
 * arêtes sont un simple rappel visuel du lien, absentes sous mouvement réduit. La
 * carte d'info reste factuelle : « lié à N cycles » + liste des liens réels.
 *
 * Charte « instruments » : niveau du nœud par luminosité (critique en signal, élevé en encre, modéré en encre 2,
 * faible en gris, non évalué en contour tireté), relation déclarée en trait plein, comptes partagés en pointillé,
 * sélection en bleu de vérification ; aucun halo. Chaque nœud est un bouton (Tab, Entrée / Espace ouvrent le détail).
 */

interface RiskFlowGraphProps {
  graph: RiskGraph;
  t: number;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string, trigger?: HTMLElement | SVGElement | null) => void;
  onHover: (slug: string | null) => void;
}

/**
 * Repère source des positions : identique à celui passé par le shell à
 * `layoutRadialByFamily` (VIEW_W×VIEW_H de RiskMappingView). Le renderer projette
 * ce repère dans son propre viewBox sans jamais recalculer d'angle/rayon.
 */
const SRC_W = 640;
const SRC_H = 520;

const VIEW_W = 960;
const VIEW_H = 560;

/** Rayon d'un nœud, proportionnel au composite (non évalué → rayon minimal). */
function nodeRadius(node: RiskNode): number {
  const comp = node.scores.composite;
  if (comp === null) return 9;
  return 11 + (comp / 100) * 18;
}

/** Chemin Bézier cubique horizontal-ish entre deux points (poignées médianes). */
function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${mx.toFixed(1)} ${ay.toFixed(1)}, ${mx.toFixed(1)} ${by.toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

/** Position projetée d'un nœud (repère viewBox). */
interface PlacedNode {
  node: RiskNode;
  x: number;
  y: number;
}

/** Guide d'arc + label d'une famille, dérivés des nœuds positionnés. */
interface FamilyGuide {
  family: CycleFamily;
  label: string;
  arcD: string;
  lx: number;
  ly: number;
  anchor: "start" | "middle" | "end";
}

/** Nom accessible d'un nœud : cycle, niveau, composite (entier affiché) et degré. */
function nodeName(node: RiskNode, degree: number): string {
  const comp = node.scores.composite;
  const level = BAND_LABEL[node.scores.criticityBand].toLowerCase();
  const score = comp === null ? "composite non évalué" : `composite ${compositeText(comp)} sur 100`;
  return `${node.cycleSlug}, niveau ${level}, ${score}, lié à ${degree} cycle${degree > 1 ? "s" : ""}`;
}

export function RiskFlowGraph({ graph, t, selected, hovered, onSelect, onHover }: RiskFlowGraphProps) {
  // SMIL (<animateMotion>) échappe à la garde CSS reduced-motion : on ne rend
  // pas les particules du tout si l'utilisateur a demandé moins de mouvement.
  const reducedMotion = useReducedMotion();

  // Projection du repère layout (disque radial ~640×520) vers le viewBox
  // (960×560), avec des échelles X/Y INDÉPENDANTES pour occuper le canevas. Les
  // POSITIONS sont étirées ; les RAYONS utilisent une échelle uniforme (`rScale`).
  // Aucun angle ni relation n'est inventé.
  const project = useMemo(() => {
    const PAD_X = 150; // marge latérale : place pour les labels de famille
    const PAD_Y = 64;
    const positioned = graph.nodes.filter((n) => n.position !== undefined);
    const xs = positioned.map((n) => n.position!.x);
    const ys = positioned.map((n) => n.position!.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : SRC_W;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : SRC_H;
    const srcW = Math.max(1, maxX - minX);
    const srcH = Math.max(1, maxY - minY);
    const scaleX = (VIEW_W - 2 * PAD_X) / srcW;
    const scaleY = (VIEW_H - 2 * PAD_Y) / srcH;
    const rScale = Math.min(scaleX, scaleY);
    const x = (v: number) => PAD_X + (v - minX) * scaleX;
    const y = (v: number) => PAD_Y + (v - minY) * scaleY;
    return { x, y, rScale, cx: x((minX + maxX) / 2), cy: y((minY + maxY) / 2) };
  }, [graph.nodes]);

  const placed = useMemo<PlacedNode[]>(
    () =>
      graph.nodes
        .filter((n) => n.position !== undefined)
        .map((n) => ({ node: n, x: project.x(n.position!.x), y: project.y(n.position!.y) })),
    [graph.nodes, project],
  );

  const placedById = useMemo(() => {
    const map = new Map<string, PlacedNode>();
    for (const pn of placed) map.set(pn.node.id, pn);
    return map;
  }, [placed]);

  // Guides de famille : arcs pointillés + libellés, dérivés UNIQUEMENT des nœuds
  // déjà positionnés (angle moyen + rayon max par famille autour du centre projeté).
  const familyGuides = useMemo<FamilyGuide[]>(() => {
    const groups = new Map<CycleFamily, PlacedNode[]>();
    for (const pn of placed) {
      const arr = groups.get(pn.node.family) ?? [];
      arr.push(pn);
      groups.set(pn.node.family, arr);
    }
    const guides: FamilyGuide[] = [];
    for (const [family, members] of groups) {
      let sumCos = 0;
      let sumSin = 0;
      let maxR = 0;
      for (const m of members) {
        const dx = m.x - project.cx;
        const dy = m.y - project.cy;
        const a = Math.atan2(dy, dx);
        sumCos += Math.cos(a);
        sumSin += Math.sin(a);
        maxR = Math.max(maxR, Math.hypot(dx, dy));
      }
      const meanAngle = Math.atan2(sumSin, sumCos);
      const guideR = Math.min(maxR + 34, Math.min(VIEW_W, VIEW_H) / 2 - 10);
      const spread = 0.42;
      const a0 = meanAngle - spread;
      const a1 = meanAngle + spread;
      const ax0 = project.cx + guideR * Math.cos(a0);
      const ay0 = project.cy + guideR * Math.sin(a0);
      const ax1 = project.cx + guideR * Math.cos(a1);
      const ay1 = project.cy + guideR * Math.sin(a1);
      const arcD = `M ${ax0.toFixed(1)} ${ay0.toFixed(1)} A ${guideR.toFixed(1)} ${guideR.toFixed(1)} 0 0 1 ${ax1.toFixed(1)} ${ay1.toFixed(1)}`;
      const labelR = guideR + 4;
      const lx = project.cx + labelR * Math.cos(meanAngle);
      const ly = project.cy + labelR * Math.sin(meanAngle) + 4;
      const cos = Math.cos(meanAngle);
      const anchor: FamilyGuide["anchor"] = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      guides.push({ family, label: CYCLE_FAMILY_LABEL[family], arcD, lx, ly, anchor });
    }
    return guides;
  }, [placed, project]);

  // Voisins directs de chaque nœud, dérivés UNIQUEMENT de graph.edges.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      const set = map.get(a) ?? new Set<string>();
      set.add(b);
      map.set(a, set);
    };
    for (const edge of graph.edges) {
      add(edge.from, edge.to);
      add(edge.to, edge.from);
    }
    return map;
  }, [graph.edges]);

  // Rang de connectivité : les 5 nœuds les plus liés reçoivent un repère
  // séquentiel à l'entrée. Pur fait de relation (degré dans graph.edges).
  const pulseRank = useMemo(() => {
    const ranked = placed
      .map((pn) => ({ id: pn.node.id, deg: neighbors.get(pn.node.id)?.size ?? 0 }))
      .filter((r) => r.deg > 0)
      .sort((a, b) => b.deg - a.deg)
      .slice(0, 5);
    const map = new Map<string, number>();
    ranked.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [placed, neighbors]);

  const focus = hovered ?? selected;
  const focusSet = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const n of neighbors.get(focus) ?? []) set.add(n);
    return set;
  }, [focus, neighbors]);

  // Arêtes réellement traçables (deux extrémités positionnées), pré-projetées.
  const drawableEdges = useMemo(
    () =>
      graph.edges
        .map((edge) => {
          const a = placedById.get(edge.from);
          const b = placedById.get(edge.to);
          if (!a || !b) return null;
          return { edge, a, b };
        })
        .filter((e): e is { edge: RiskEdge; a: PlacedNode; b: PlacedNode } => e !== null),
    [graph.edges, placedById],
  );

  // Au repos, le maillage reste discret pour que les nœuds priment ; le survol
  // ou le focus révèle le voisinage du nœud visé.
  const edgeOpacity = (edge: RiskEdge): number => {
    if (!focus) return 0.32 * Math.max(0.15, t);
    const touches = edge.from === focus || edge.to === focus;
    return (touches ? 0.95 : 0.06) * Math.max(0.15, t);
  };

  const nodeOpacity = (id: string): number => {
    if (!focusSet) return 1;
    return focusSet.has(id) ? 1 : 0.18;
  };

  // Carte d'info : construite depuis le nœud survolé/sélectionné et ses arêtes réelles.
  const info = useMemo(() => {
    if (!focus) return null;
    const pn = placedById.get(focus);
    if (!pn) return null;
    const node = pn.node;
    const links = drawableEdges
      .filter(({ edge }) => edge.from === focus || edge.to === focus)
      .map(({ edge, a, b }) => {
        const otherId = edge.from === focus ? edge.to : edge.from;
        const other = (edge.from === focus ? b : a).node;
        const type = edge.source === "relatedCycles" ? "relation" : `${edge.weight} compte${edge.weight > 1 ? "s" : ""}`;
        return { id: otherId, slug: other.cycleSlug, type, declared: edge.source === "relatedCycles" };
      })
      .sort((x, y) => x.slug.localeCompare(y.slug));
    return { slug: node.cycleSlug, band: node.scores.criticityBand, composite: node.scores.composite, degree: links.length, links };
  }, [focus, placedById, drawableEdges]);

  function onNodeKey(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id, event.currentTarget);
    }
  }

  return (
    <div data-tour="risk-flow-graph" role="region" aria-label="Graphe des relations inter-cycles, défilement horizontal" tabIndex={0} className={s.chartRegion}>
      <div className={s.chartInner}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label="Graphe des relations inter-cycles" className={s.chart}>
          {/* Guides de famille : arcs pointillés + libellés espacés */}
          <g aria-hidden="true" style={{ animation: "pbFadeIn .8s ease .15s both" }}>
            {familyGuides.map((g) => (
              <g key={g.family}>
                <path d={g.arcD} fill="none" strokeWidth={1} strokeDasharray="1.5 4" style={{ stroke: "var(--pb-rule-strong)" }} />
                <text
                  x={g.lx.toFixed(1)}
                  y={g.ly.toFixed(1)}
                  textAnchor={g.anchor}
                  fontSize={12}
                  letterSpacing="1.2"
                  style={{ fill: "var(--pb-ink-3)", fontFamily: "var(--pb-font-mono)", textTransform: "uppercase", pointerEvents: "none" }}
                >
                  {g.label}
                </text>
              </g>
            ))}
          </g>

          {/* Arêtes : relations déclarées en trait plein (tracé progressif, fini) ; comptes PCG partagés en pointillé. */}
          <g aria-hidden="true" style={{ animation: "pbFadeIn .9s ease .25s both" }}>
            {drawableEdges.map(({ edge, a, b }, i) => {
              const isComptes = edge.source === "comptes";
              return (
                <path
                  key={edge.id}
                  d={edgePath(a.x, a.y, b.x, b.y)}
                  fill="none"
                  strokeWidth={isComptes ? 1 : 1.4}
                  pathLength={isComptes ? undefined : 1}
                  strokeDasharray={isComptes ? "1.5 3" : 1}
                  strokeLinecap="round"
                  opacity={edgeOpacity(edge)}
                  style={{
                    stroke: isComptes ? "var(--pb-ink-3)" : "var(--pb-ink-2)",
                    transition: "opacity .2s",
                    animation: isComptes ? undefined : `pbDraw .8s ease ${(0.25 + (i % 12) * 0.05).toFixed(2)}s both`,
                  }}
                />
              );
            })}
          </g>

          {/* Particules le long des arêtes : rappel visuel NON quantifié du lien. Absentes sous mouvement réduit. */}
          {!reducedMotion && (
            <g aria-hidden="true">
              {drawableEdges.map(({ edge, a, b }, i) => {
                const isComptes = edge.source === "comptes";
                const touches = !focus || edge.from === focus || edge.to === focus;
                if (!touches) return null;
                const op = (focus ? 0.85 : 0.45) * Math.max(0.15, t);
                return (
                  <circle key={`p-${edge.id}`} r={isComptes ? 1.4 : 1.9} opacity={op} style={{ fill: isComptes ? "var(--pb-ink-3)" : "var(--pb-ink-2)" }}>
                    <animateMotion dur={`${3 + (i % 4) * 0.7}s`} begin={`${(i % 5) * 0.4}s`} repeatCount="indefinite" path={edgePath(a.x, a.y, b.x, b.y)} />
                  </circle>
                );
              })}
            </g>
          )}

          {/* Nœuds : boutons focalisables (disque de niveau, anneau de sélection, anneau de focus clavier). */}
          <g>
            {placed.map(({ node, x, y }, i) => {
              const r = nodeRadius(node) * project.rScale * (0.62 + 0.38 * Math.max(0.15, t));
              const band = node.scores.criticityBand;
              const evaluated = node.scores.composite !== null;
              const isFocus = node.id === focus;
              const isSelected = node.id === selected;
              const degree = neighbors.get(node.id)?.size ?? 0;
              return (
                <g
                  key={node.id}
                  data-tour={node.cycleSlug.startsWith("immobilisations-corp") ? "risk-node-immo" : undefined}
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                  opacity={nodeOpacity(node.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={nodeName(node, degree)}
                  aria-current={isSelected ? "true" : undefined}
                  className={s.node}
                  style={{ transition: "opacity .2s" }}
                  onMouseEnter={() => onHover(node.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(node.id)}
                  onBlur={() => onHover(null)}
                  onClick={(e) => onSelect(node.id, e.currentTarget)}
                  onKeyDown={(e) => onNodeKey(e, node.id)}
                >
                  {/* Entrée sur un <g> INTERNE : le scale pivote autour du centre local et ne touche PAS le
                      translate de positionnement porté par le <g> parent. */}
                  <g style={{ animation: `pbNodeIn .45s cubic-bezier(.2,0,0,1) ${(0.2 + i * 0.03).toFixed(2)}s both` }}>
                    <circle r={r + 6} fill="transparent" />
                    <circle
                      r={r}
                      strokeWidth={isSelected ? 2.5 : evaluated ? 1 : 1.4}
                      strokeDasharray={evaluated ? undefined : "3 2"}
                      style={{
                        fill: evaluated ? BAND_COLOR[band] : "var(--pb-bg)",
                        fillOpacity: evaluated ? 0.88 : 1,
                        stroke: isSelected ? "var(--pb-verif)" : evaluated ? "var(--pb-bg)" : "var(--pb-ink-3)",
                      }}
                    />
                    {isSelected && <circle r={r + 4} fill="none" strokeWidth={1.5} style={{ stroke: "var(--pb-verif)" }} />}
                    <circle className={s.nodeFocus} r={r + 7} fill="none" strokeWidth={2} style={{ stroke: "var(--pb-verif)" }} />
                    {/* Repère séquentiel des nœuds les plus connectés (2 pulsations, fini). */}
                    {pulseRank.has(node.id) && (
                      <circle
                        r={r + 9}
                        fill="none"
                        strokeWidth={1.5}
                        opacity={0}
                        style={{ stroke: "var(--pb-ink-3)", animation: `pbNodePulse 1.1s ease ${(0.9 + pulseRank.get(node.id)! * 0.1).toFixed(2)}s 2` }}
                      />
                    )}
                    {/* Libellé du nœud survolé / focalisé / sélectionné seulement (35 titres se chevaucheraient). */}
                    {isFocus && (
                      <text
                        y={r + 20}
                        textAnchor="middle"
                        fontSize={14}
                        style={{ fill: "var(--pb-ink)", pointerEvents: "none", paintOrder: "stroke", stroke: "var(--pb-bg)", strokeWidth: 4 }}
                      >
                        {node.label}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Carte d'info au survol / focus / sélection : faits de relation uniquement (le nom du nœud porte déjà l'essentiel). */}
        {info && (
          <div className={s.card} style={{ left: 12 }} aria-hidden="true">
            <p className={s.cardTitle}>{info.slug}</p>
            <p className={s.cardLine}>
              <BandMark band={info.band} />
              <span>{info.composite !== null ? `${compositeText(info.composite)}/100 · heuristique` : "non évalué"}</span>
            </p>
            <p className={`${s.cardLine} ${s.ref}`}>
              LIÉ À {info.degree} CYCLE{info.degree > 1 ? "S" : ""}
            </p>
            {info.links.length > 0 && (
              <ul className={s.cardList}>
                {info.links.map((lk) => (
                  <li key={lk.id}>
                    <span className={s.edgeSample} data-dotted={lk.declared ? undefined : ""} />
                    <span>{lk.slug}</span>
                    <span className={s.ref}>{lk.type}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={s.cardHint}>Entrée ou clic : ouvrir le détail du cycle</p>
          </div>
        )}
      </div>
    </div>
  );
}
