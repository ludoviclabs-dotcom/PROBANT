/**
 * Cartographie des risques — géométrie du graphe, séparée du rendu.
 *
 * Fonctions PURES : elles reçoivent un `RiskGraph` et renvoient un nouveau
 * `RiskGraph` dont chaque `node.position` est renseigné en 2D `{x, y}`. Le
 * champ `z` est laissé `undefined` (réservé au passage 3D futur — voir
 * `types.ts`). Aucun import React ni `fs`, aucun `Date.now()`.
 *
 * `layout.ts` est le SEUL module autorisé à décider la géométrie : le moteur
 * (scoring/graph) ne connaît pas l'écran et un renderer (SVG 2D aujourd'hui,
 * Canvas/3D demain) consomme un graphe déjà positionné.
 */

import type { CycleFamily } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILIES } from "@/lib/audit-cycles/types";
import type { RiskGraph, RiskNode, Vec3 } from "./types";

/**
 * Dimensions du canevas cible. Les positions sont produites dans le repère
 * `[0, width] × [0, height]`, origine en haut à gauche (repère écran).
 */
export interface LayoutSize {
  width: number;
  height: number;
}

/**
 * Options du layout radial par famille.
 */
export interface RadialLayoutOptions {
  /** Marge intérieure (px) réservée au bord du canevas. */
  padding?: number;
  /** Rayon minimal (px) du premier anneau, pour éviter l'empilement au centre. */
  innerRadius?: number;
}

const TAU = Math.PI * 2;

/**
 * Ordre stable des familles pour l'attribution des secteurs. On s'appuie sur
 * l'ordre canonique de `CYCLE_FAMILIES` afin que la géométrie soit déterministe
 * et cohérente avec le reste de l'application.
 */
const FAMILY_ORDER: readonly CycleFamily[] = CYCLE_FAMILIES.map((f) => f.id);

/**
 * Regroupe les nœuds par famille en secteurs radiaux : chaque famille présente
 * occupe une part angulaire égale du disque, et ses nœuds y sont répartis sur
 * des anneaux concentriques. Renvoie un nouveau graphe (les nœuds sont copiés,
 * `position` renseigné, `z` laissé libre).
 */
export function layoutRadialByFamily(
  graph: RiskGraph,
  size: LayoutSize,
  options: RadialLayoutOptions = {},
): RiskGraph {
  const padding = options.padding ?? 48;
  const cx = size.width / 2;
  const cy = size.height / 2;
  const maxRadius = Math.max(0, Math.min(cx, cy) - padding);
  const innerRadius = Math.min(options.innerRadius ?? 72, maxRadius);

  const families = FAMILY_ORDER.filter((family) =>
    graph.nodes.some((node) => node.family === family),
  );
  const sectorCount = families.length;
  const sectorAngle = sectorCount > 0 ? TAU / sectorCount : TAU;

  const positioned = graph.nodes.map((node) => {
    const sectorIndex = families.indexOf(node.family);
    // Un nœud sans famille reconnue (cas théorique) reste au centre plutôt que
    // d'être placé à une position arbitraire trompeuse.
    if (sectorIndex < 0) {
      return withPosition(node, { x: cx, y: cy });
    }

    const peers = graph.nodes.filter((n) => n.family === node.family);
    const rank = peers.findIndex((n) => n.id === node.id);
    const peerCount = peers.length;

    const position = radialPosition({
      cx,
      cy,
      sectorStart: sectorIndex * sectorAngle,
      sectorAngle,
      rank,
      peerCount,
      innerRadius,
      maxRadius,
    });
    return withPosition(node, position);
  });

  return { ...graph, nodes: positioned };
}

interface RadialArgs {
  cx: number;
  cy: number;
  sectorStart: number;
  sectorAngle: number;
  rank: number;
  peerCount: number;
  innerRadius: number;
  maxRadius: number;
}

/**
 * Position d'un nœud dans son secteur : l'angle est centré dans la part
 * angulaire de la famille, le rayon croît par anneaux successifs.
 */
function radialPosition(args: RadialArgs): Vec3 {
  const { cx, cy, sectorStart, sectorAngle, rank, peerCount } = args;
  const { innerRadius, maxRadius } = args;

  // Répartition angulaire : les nœuds sont étalés dans une bande centrale du
  // secteur (marge de 10 % de part et d'autre) pour éviter de coller aux bords.
  const inset = sectorAngle * 0.1;
  const usableAngle = sectorAngle - 2 * inset;
  const angle =
    peerCount <= 1
      ? sectorStart + sectorAngle / 2
      : sectorStart + inset + (usableAngle * rank) / (peerCount - 1);

  // Anneaux concentriques : chaque nœud avance d'un cran radial, borné.
  const ringSpan = Math.max(0, maxRadius - innerRadius);
  const ringStep = peerCount <= 1 ? 0 : ringSpan / peerCount;
  const radius = Math.min(maxRadius, innerRadius + ringStep * rank);

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * Options du layout matriciel (vue bubble Probabilité × Gravité).
 */
export interface MatrixLayoutOptions {
  padding?: number;
}

/**
 * Vue matricielle (bulle) : `x` porté par la probabilité (0-100), `y` par la
 * gravité (0-100, axe inversé écran de sorte que la gravité forte soit en
 * haut). Les nœuds `non_évalué` (sans valeur exploitable) sont placés sur les
 * axes à 0, à charge du renderer de les distinguer visuellement.
 */
export function layoutMatrix(
  graph: RiskGraph,
  size: LayoutSize,
  options: MatrixLayoutOptions = {},
): RiskGraph {
  const padding = options.padding ?? 48;
  const plotWidth = Math.max(0, size.width - 2 * padding);
  const plotHeight = Math.max(0, size.height - 2 * padding);

  const positioned = graph.nodes.map((node) => {
    const probability = clampScore(node.scores.axes.probabilite.value);
    const gravity = clampScore(node.scores.axes.gravite.value);
    const position: Vec3 = {
      x: padding + (probability / 100) * plotWidth,
      // Axe écran inversé : gravité 100 → haut du plot (y minimal).
      y: padding + (1 - gravity / 100) * plotHeight,
    };
    return withPosition(node, position);
  });

  return { ...graph, nodes: positioned };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

/**
 * Renvoie une copie du nœud avec `position` renseigné (`z` volontairement
 * non défini). On ne mute jamais le nœud d'entrée : le layout reste pur.
 */
function withPosition(node: RiskNode, position: Vec3): RiskNode {
  return { ...node, position: { x: position.x, y: position.y } };
}
