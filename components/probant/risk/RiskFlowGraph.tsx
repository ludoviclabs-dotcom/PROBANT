"use client";

import { useMemo } from "react";
import type { RiskGraph, RiskNode, RiskEdge, CriticityBand } from "@/lib/risk-mapping";

/**
 * Graphe de flux inter-cycles en SVG 2D. Les nœuds sont positionnés en amont par
 * `layout.ts` (champ `node.position.{x,y}`) : ce composant est un pur renderer, il
 * ne décide d'aucune géométrie. Les arcs sont tracés en Bézier cubique (même
 * pattern que le Sankey de la Synthèse et les flèches d'AccountingSilo).
 *
 * Règle de fiabilité (non négociable) : les arcs proviennent UNIQUEMENT de
 * `graph.edges` (relations `relatedCycles` déclarées, ou comptes PCG réellement
 * partagés). Aucun coefficient de contagion chiffré n'est affiché. Le survol d'un
 * nœud surligne ses voisins directs via `graph.edges` — c'est un fait de relation,
 * jamais une propagation quantifiée. Le tooltip reste factuel : « lié à N cycles ».
 */

interface RiskFlowGraphProps {
  graph: RiskGraph;
  t: number;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}

const VIEW_W = 640;
const VIEW_H = 520;

/** Couleur d'accent par bande de criticité (remplissage du nœud). */
const BAND_HEX: Record<CriticityBand, string> = {
  critique: "#ef4444",
  élevé: "#f97316",
  modéré: "#eab308",
  faible: "#3b82f6",
  non_évalué: "#5c6b82",
};

const BAND_LABEL: Record<CriticityBand, string> = {
  critique: "critique",
  élevé: "élevé",
  modéré: "modéré",
  faible: "faible",
  non_évalué: "non évalué",
};

/** Rayon d'un nœud, proportionnel au composite (non évalué → rayon minimal). */
function nodeRadius(node: RiskNode): number {
  const comp = node.scores.composite;
  if (comp === null) return 7;
  return 9 + (comp / 100) * 15;
}

/** Chemin Bézier cubique horizontal-ish entre deux points (poignées médianes). */
function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${mx.toFixed(1)} ${ay.toFixed(1)}, ${mx.toFixed(1)} ${by.toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

export function RiskFlowGraph({
  graph,
  t,
  selected,
  hovered,
  onSelect,
  onHover,
}: RiskFlowGraphProps) {
  const positioned = useMemo(
    () => graph.nodes.filter((n) => n.position !== undefined),
    [graph.nodes],
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, RiskNode>();
    for (const node of positioned) map.set(node.id, node);
    return map;
  }, [positioned]);

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

  const focus = hovered ?? selected;
  const focusSet = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const n of neighbors.get(focus) ?? []) set.add(n);
    return set;
  }, [focus, neighbors]);

  const edgeOpacity = (edge: RiskEdge): number => {
    if (!focus) return 0.28 * Math.max(0.15, t);
    const touches = edge.from === focus || edge.to === focus;
    return (touches ? 0.65 : 0.05) * Math.max(0.15, t);
  };

  const nodeOpacity = (id: string): number => {
    if (!focusSet) return 1;
    return focusSet.has(id) ? 1 : 0.15;
  };

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      aria-label="Graphe des relations inter-cycles"
      style={{ display: "block" }}
    >
      {/* Arcs */}
      <g>
        {graph.edges.map((edge) => {
          const a = nodeById.get(edge.from);
          const b = nodeById.get(edge.to);
          if (!a?.position || !b?.position) return null;
          const isComptes = edge.source === "comptes";
          return (
            <path
              key={edge.id}
              d={edgePath(a.position.x, a.position.y, b.position.x, b.position.y)}
              fill="none"
              stroke={isComptes ? "#5c6b82" : "#5b9dff"}
              strokeWidth={isComptes ? 1 : 1.6}
              strokeDasharray={isComptes ? "4 4" : undefined}
              opacity={edgeOpacity(edge)}
              style={{ transition: "opacity .2s" }}
            />
          );
        })}
      </g>

      {/* Nœuds */}
      <g>
        {positioned.map((node) => {
          if (!node.position) return null;
          const r = nodeRadius(node) * (0.6 + 0.4 * Math.max(0.15, t));
          const band = node.scores.criticityBand;
          const evaluated = node.scores.evaluation !== "non_évalué";
          const degree = neighbors.get(node.id)?.size ?? 0;
          const isFocus = node.id === focus;
          return (
            <g
              key={node.id}
              transform={`translate(${node.position.x.toFixed(1)} ${node.position.y.toFixed(1)})`}
              opacity={nodeOpacity(node.id)}
              style={{ cursor: "pointer", transition: "opacity .2s" }}
              onMouseEnter={() => onHover(node.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(node.id)}
            >
              <title>
                {`${node.label}\nCriticité : ${BAND_LABEL[band]}${
                  node.scores.composite !== null
                    ? ` (${Math.round(node.scores.composite)}/100, heuristique)`
                    : ""
                }\nLié à ${degree} cycle${degree > 1 ? "s" : ""}`}
              </title>
              <circle
                r={r}
                fill={evaluated ? BAND_HEX[band] : "#10151c"}
                stroke={
                  node.id === selected
                    ? "#e6edf6"
                    : evaluated
                      ? BAND_HEX[band]
                      : "#5c6b82"
                }
                strokeWidth={node.id === selected ? 2.5 : 1.5}
                strokeDasharray={evaluated ? undefined : "3 2"}
                style={{
                  filter: isFocus ? `drop-shadow(0 0 6px ${BAND_HEX[band]}aa)` : undefined,
                  transition: "r .2s",
                }}
              />
              {isFocus && (
                <text
                  y={r + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#e6edf6"
                  style={{ pointerEvents: "none" }}
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
