"use client";

import { useEffect, useMemo, useState } from "react";
import type { RiskGraph, RiskNode, RiskEdge, CriticityBand } from "@/lib/risk-mapping";
import { CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import type { CycleFamily } from "@/lib/audit-cycles/types";

/**
 * `prefers-reduced-motion` côté JS : nécessaire pour les animations SVG SMIL
 * (`<animateMotion>`) que la garde CSS globale (`@media (prefers-reduced-motion:
 * reduce)` dans globals.css) ne peut pas neutraliser — cette garde ne porte que
 * sur `animation-duration`/`transition-duration` (propriétés CSS), pas sur SMIL.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Graphe de flux inter-cycles en SVG 2D. Les nœuds sont positionnés en amont par
 * `layout.ts` (champ `node.position.{x,y}`, disposition radiale par famille) :
 * ce composant est un pur renderer, il ne décide d'aucune géométrie de nœud. Les
 * positions du layout (repère 640×520) sont simplement re-projetées dans le
 * viewBox v2 (960×560) par une homothétie centrée — aucune position n'est
 * inventée. Les arcs sont tracés en Bézier cubique (même pattern que le Sankey de
 * la Synthèse et les flèches d'AccountingSilo).
 *
 * Règle de fiabilité (non négociable) : les arcs proviennent UNIQUEMENT de
 * `graph.edges` (relations `relatedCycles` déclarées, ou comptes PCG réellement
 * partagés). Aucun coefficient de contagion chiffré n'est affiché. Le survol d'un
 * nœud surligne ses voisins directs via `graph.edges` — c'est un fait de relation,
 * jamais une propagation quantifiée. Les particules le long des arêtes sont un
 * simple rappel visuel du lien, jamais un flux quantifié. Le tooltip / la carte
 * d'info restent factuels : « lié à N cycles » + liste des liens réels.
 */

interface RiskFlowGraphProps {
  graph: RiskGraph;
  t: number;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}

/**
 * Repère source des positions : identique à celui passé par le shell à
 * `layoutRadialByFamily` (VIEW_W×VIEW_H de RiskMappingView). Le renderer projette
 * ce repère dans son propre viewBox v2 sans jamais recalculer d'angle/rayon.
 */
const SRC_W = 640;
const SRC_H = 520;

/** viewBox v2 (maquette Vue Flux). */
const VIEW_W = 960;
const VIEW_H = 560;

/** Couleur d'accent par bande de criticité (remplissage du nœud), via tokens. */
const BAND_VAR: Record<CriticityBand, string> = {
  critique: "var(--pb-bloquant)",
  élevé: "var(--pb-majeur)",
  modéré: "var(--pb-mineur)",
  faible: "var(--pb-informatif)",
  non_évalué: "var(--pb-text-faint)",
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
  if (comp === null) return 9;
  return 11 + (comp / 100) * 18;
}

/** Chemin Bézier cubique horizontal-ish entre deux points (poignées médianes). */
function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${mx.toFixed(1)} ${ay.toFixed(1)}, ${mx.toFixed(1)} ${by.toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

/** Position projetée d'un nœud (repère viewBox v2). */
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

export function RiskFlowGraph({
  graph,
  t,
  selected,
  hovered,
  onSelect,
  onHover,
}: RiskFlowGraphProps) {
  // SMIL (<animateMotion>) échappe à la garde CSS reduced-motion : on ne rend
  // pas les particules du tout si l'utilisateur a demandé moins de mouvement.
  const reducedMotion = usePrefersReducedMotion();

  // Projection du repère layout (disque radial ~640×520) vers le viewBox v2
  // (960×560). Une homothétie UNIFORME laissait le disque circulaire au centre
  // d'un canevas 16:9 → ~40 % de largeur utilisée, gros vides latéraux. On
  // ajuste donc la bounding-box des positions au viewBox avec des échelles X/Y
  // INDÉPENDANTES (le disque devient une ellipse qui remplit le canevas, comme
  // la maquette). Les POSITIONS sont étirées ; les RAYONS des nœuds utilisent
  // une échelle uniforme (`rScale`) pour rester des cercles ronds. Aucun angle
  // ni relation n'est inventé : on ne fait que redistribuer les positions déjà
  // décidées par `layout.ts` pour occuper l'espace disponible.
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
    return {
      x,
      y,
      rScale,
      // Centre de la bounding-box projetée, référence des guides de famille.
      cx: x((minX + maxX) / 2),
      cy: y((minY + maxY) / 2),
    };
  }, [graph.nodes]);

  const placed = useMemo<PlacedNode[]>(
    () =>
      graph.nodes
        .filter((n) => n.position !== undefined)
        .map((n) => ({
          node: n,
          x: project.x(n.position!.x),
          y: project.y(n.position!.y),
        })),
    [graph.nodes, project],
  );

  const placedById = useMemo(() => {
    const map = new Map<string, PlacedNode>();
    for (const p of placed) map.set(p.node.id, p);
    return map;
  }, [placed]);

  // Guides de famille : arcs pointillés + labels en majuscules espacées, dérivés
  // UNIQUEMENT des nœuds déjà positionnés (angle moyen + rayon max par famille
  // autour du centre projeté). Aucune relation inventée : c'est une simple aide
  // de lecture de la disposition radiale existante.
  const familyGuides = useMemo<FamilyGuide[]>(() => {
    const groups = new Map<CycleFamily, PlacedNode[]>();
    for (const p of placed) {
      const arr = groups.get(p.node.family) ?? [];
      arr.push(p);
      groups.set(p.node.family, arr);
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
      // Angle moyen de la famille (direction résultante des nœuds).
      const meanAngle = Math.atan2(sumSin, sumCos);
      // Rayon du guide : légèrement au-delà du nœud le plus externe (borné).
      const guideR = Math.min(maxR + 34, Math.min(VIEW_W, VIEW_H) / 2 - 10);
      // Petit arc pointillé centré sur l'angle moyen (±0.42 rad), non fermé.
      const spread = 0.42;
      const a0 = meanAngle - spread;
      const a1 = meanAngle + spread;
      const ax0 = project.cx + guideR * Math.cos(a0);
      const ay0 = project.cy + guideR * Math.sin(a0);
      const ax1 = project.cx + guideR * Math.cos(a1);
      const ay1 = project.cy + guideR * Math.sin(a1);
      const arcD = `M ${ax0.toFixed(1)} ${ay0.toFixed(1)} A ${guideR.toFixed(1)} ${guideR.toFixed(1)} 0 0 1 ${ax1.toFixed(1)} ${ay1.toFixed(1)}`;
      // Label au bout du rayon moyen.
      const labelR = guideR + 4;
      const lx = project.cx + labelR * Math.cos(meanAngle);
      const ly = project.cy + labelR * Math.sin(meanAngle) + 3;
      const cos = Math.cos(meanAngle);
      const anchor: FamilyGuide["anchor"] =
        cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      guides.push({
        family,
        label: CYCLE_FAMILY_LABEL[family],
        arcD,
        lx,
        ly,
        anchor,
      });
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

  // Rang de connectivité : les 5 nœuds les plus liés reçoivent un halo
  // séquentiel à l'entrée (delay 100 ms/rang). Pur fait de relation (degré
  // dans graph.edges), aucune propagation chiffrée suggérée.
  const pulseRank = useMemo(() => {
    const ranked = placed
      .map((p) => ({ id: p.node.id, deg: neighbors.get(p.node.id)?.size ?? 0 }))
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

  const edgeOpacity = (edge: RiskEdge): number => {
    // Au repos, les ~89 relations forment un maillage dense qui écrasait les
    // nœuds : on garde les arêtes discrètes (0.16) pour que les nœuds colorés
    // priment (comme la maquette), et on les renforce nettement au survol pour
    // révéler le voisinage du nœud focalisé.
    if (!focus) return 0.16 * Math.max(0.15, t);
    const touches = edge.from === focus || edge.to === focus;
    return (touches ? 0.75 : 0.04) * Math.max(0.15, t);
  };

  const nodeOpacity = (id: string): number => {
    if (!focusSet) return 1;
    return focusSet.has(id) ? 1 : 0.14;
  };

  // Carte d'info flottante : construite depuis le nœud survolé/sélectionné et ses
  // arêtes réelles. Aucune valeur inventée.
  const info = useMemo(() => {
    if (!focus) return null;
    const p = placedById.get(focus);
    if (!p) return null;
    const node = p.node;
    const band = node.scores.criticityBand;
    const evaluated = node.scores.evaluation !== "non_évalué";
    const links = drawableEdges
      .filter(({ edge }) => edge.from === focus || edge.to === focus)
      .map(({ edge, a, b }) => {
        const otherId = edge.from === focus ? edge.to : edge.from;
        const other = (edge.from === focus ? b : a).node;
        const type =
          edge.source === "relatedCycles"
            ? "relation"
            : `${edge.weight} compte${edge.weight > 1 ? "s" : ""}`;
        return {
          id: otherId,
          slug: other.cycleSlug,
          type,
          declared: edge.source === "relatedCycles",
        };
      })
      .sort((x, y) => x.slug.localeCompare(y.slug));
    return {
      slug: node.cycleSlug,
      band,
      evaluated,
      composite: node.scores.composite,
      degree: links.length,
      links,
    };
  }, [focus, placedById, drawableEdges]);

  return (
    <div
      data-tour="risk-flow-graph"
      style={{
        position: "relative",
        borderRadius: 12,
        border: "1px solid var(--pb-border-soft)",
        background:
          "radial-gradient(ellipse at center, var(--pb-surface-inset) 0%, var(--pb-bg) 70%)",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label="Graphe des relations inter-cycles"
        style={{ display: "block" }}
      >
        {/* Guides de famille : arcs pointillés + labels espacés */}
        <g style={{ animation: "pbFadeIn .8s ease .15s both" }}>
          {familyGuides.map((g) => (
            <g key={g.family}>
              <path
                d={g.arcD}
                fill="none"
                stroke="var(--pb-border)"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.7 * Math.max(0.2, t)}
              />
              <text
                x={g.lx.toFixed(1)}
                y={g.ly.toFixed(1)}
                textAnchor={g.anchor}
                fontSize={9.5}
                fontWeight={600}
                fill="var(--pb-text-faint)"
                letterSpacing="1.5"
                style={{ textTransform: "uppercase", pointerEvents: "none" }}
              >
                {g.label}
              </text>
            </g>
          ))}
        </g>

        {/* Arêtes : les relations déclarées SE DESSINENT progressivement
            (stroke-dashoffset normalisé par pathLength, ~800 ms, stagger) ;
            les comptes PCG partagés gardent leur pointillé défilant. */}
        <g style={{ animation: "pbFadeIn .9s ease .25s both" }}>
          {drawableEdges.map(({ edge, a, b }, i) => {
            const isComptes = edge.source === "comptes";
            return (
              <path
                key={edge.id}
                d={edgePath(a.x, a.y, b.x, b.y)}
                fill="none"
                stroke={isComptes ? "var(--pb-text-faint)" : "var(--pb-accent)"}
                strokeWidth={isComptes ? 1 : 1.8}
                pathLength={isComptes ? undefined : 1}
                strokeDasharray={isComptes ? "4 4" : 1}
                strokeLinecap="round"
                opacity={edgeOpacity(edge)}
                style={{
                  transition: "opacity .2s",
                  animation: isComptes
                    ? "pbDashFlow 1.1s linear infinite"
                    : `pbDraw .8s ease ${(0.25 + (i % 12) * 0.05).toFixed(2)}s both`,
                }}
              />
            );
          })}
        </g>

        {/* Particules le long des arêtes : rappel visuel NON quantifié du lien.
            Absentes sous reduced-motion (SMIL <animateMotion> échappe à la garde
            CSS globale — cf. usePrefersReducedMotion ci-dessus). */}
        {!reducedMotion && (
          <g>
            {drawableEdges.map(({ edge, a, b }, i) => {
              const isComptes = edge.source === "comptes";
              const touches = !focus || edge.from === focus || edge.to === focus;
              if (!touches) return null;
              const op = (focus ? 0.85 : 0.5) * Math.max(0.15, t);
              return (
                <circle
                  key={`p-${edge.id}`}
                  r={isComptes ? 1.6 : 2.2}
                  fill={isComptes ? "var(--pb-text-muted)" : "var(--pb-accent)"}
                  opacity={op}
                >
                  <animateMotion
                    dur={`${3 + (i % 4) * 0.7}s`}
                    begin={`${(i % 5) * 0.4}s`}
                    repeatCount="indefinite"
                    path={edgePath(a.x, a.y, b.x, b.y)}
                  />
                </circle>
              );
            })}
          </g>
        )}

        {/* Nœuds : halo + cercle + anneau + label */}
        <g>
          {placed.map(({ node, x, y }, i) => {
            const r = nodeRadius(node) * project.rScale * (0.62 + 0.38 * Math.max(0.15, t));
            const band = node.scores.criticityBand;
            const evaluated = node.scores.evaluation !== "non_évalué";
            const bandColor = BAND_VAR[band];
            const isFocus = node.id === focus;
            const isSelected = node.id === selected;
            const stroke = isSelected
              ? "var(--pb-text)"
              : evaluated
                ? bandColor
                : "var(--pb-text-faint)";
            return (
              <g
                key={node.id}
                data-tour={
                  node.cycleSlug.startsWith("immobilisations-corp") ? "risk-node-immo" : undefined
                }
                transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
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
                  }\nLié à ${neighbors.get(node.id)?.size ?? 0} cycle${
                    (neighbors.get(node.id)?.size ?? 0) > 1 ? "s" : ""
                  }`}
                </title>
                {/* Animation d'entrée sur un <g> INTERNE : le scale pivote autour
                    du centre local (0,0 = centre du nœud) et ne touche PAS le
                    translate de positionnement porté par le <g> parent. Les avoir
                    sur le même élément faisait écraser l'attribut `transform`
                    (translate) par le `transform: scale` de l'animation CSS, ce
                    qui tirait les nœuds vers l'origine (coin haut-gauche) pendant
                    l'animation. */}
                <g
                  style={{
                    animation: `pbNodeIn .5s cubic-bezier(.34,1.56,.64,1) ${(0.2 + i * 0.03).toFixed(2)}s both`,
                  }}
                >
                {/* Halo */}
                <circle
                  r={r + (isFocus ? 12 : 7)}
                  fill={
                    evaluated
                      ? `color-mix(in srgb, ${bandColor} ${isFocus ? 26 : 14}%, transparent)`
                      : "color-mix(in srgb, var(--pb-text-faint) 10%, transparent)"
                  }
                  style={{ transition: "r .2s" }}
                />
                {/* Cercle principal (dasharray si non évalué) */}
                <circle
                  r={r}
                  fill={
                    evaluated
                      ? `color-mix(in srgb, ${bandColor} 82%, var(--pb-bg))`
                      : "var(--pb-surface-inset)"
                  }
                  stroke={stroke}
                  strokeWidth={isSelected ? 2.5 : 1.6}
                  strokeDasharray={evaluated ? undefined : "3 2"}
                  style={{ transition: "r .2s" }}
                />
                {/* Anneau externe fin */}
                <circle
                  r={r + 4}
                  fill="none"
                  stroke={
                    isFocus
                      ? evaluated
                        ? bandColor
                        : "var(--pb-text-faint)"
                      : `color-mix(in srgb, ${
                          evaluated ? bandColor : "var(--pb-text-faint)"
                        } 40%, transparent)`
                  }
                  strokeWidth={1.5}
                  opacity={isFocus ? 0.9 : 0.5}
                  style={{ transition: "opacity .2s" }}
                />
                {/* Halo séquentiel des nœuds les plus connectés (2 pulsations). */}
                {pulseRank.has(node.id) && (
                  <circle
                    r={r + 9}
                    fill="none"
                    stroke={evaluated ? bandColor : "var(--pb-text-faint)"}
                    strokeWidth={2}
                    opacity={0}
                    style={{
                      animation: `pbNodePulse 1.1s ease ${(0.9 + pulseRank.get(node.id)! * 0.1).toFixed(2)}s 2`,
                    }}
                  />
                )}
                {/* Libellé affiché UNIQUEMENT pour le nœud survolé/sélectionné :
                    avec 35 nœuds et des titres longs, un libellé permanent sous
                    chaque nœud se chevauchait massivement (comme la maquette, on
                    s'appuie sur la carte d'info au survol pour l'identité). */}
                {isFocus && (
                  <text
                    y={r + 15}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--pb-text-bright)"
                    style={{
                      pointerEvents: "none",
                      paintOrder: "stroke",
                      stroke: "var(--pb-bg)",
                      strokeWidth: 3,
                    }}
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

      {/* Carte d'info flottante au survol / sélection */}
      {info && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            width: 238,
            borderRadius: 12,
            border: "1px solid var(--pb-border-strong)",
            background: "color-mix(in srgb, var(--pb-surface) 94%, transparent)",
            backdropFilter: "blur(6px)",
            padding: "12px 14px",
            animation: "pbFadeUp .2s ease both",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--pb-text)",
              wordBreak: "break-all",
            }}
          >
            {info.slug}
          </div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                padding: "1px 8px",
                fontSize: 10,
                fontWeight: 600,
                color: info.evaluated ? BAND_VAR[info.band] : "var(--pb-text-faint)",
                background: info.evaluated
                  ? `color-mix(in srgb, ${BAND_VAR[info.band]} 15%, transparent)`
                  : "color-mix(in srgb, var(--pb-text-faint) 12%, transparent)",
                border: `1px solid color-mix(in srgb, ${
                  info.evaluated ? BAND_VAR[info.band] : "var(--pb-text-faint)"
                } 45%, transparent)`,
              }}
            >
              <span
                style={{
                  height: 7,
                  width: 7,
                  borderRadius: 999,
                  background: info.evaluated ? BAND_VAR[info.band] : "var(--pb-text-faint)",
                }}
              />
              {BAND_LABEL[info.band]}
            </span>
            <span
              className="tnum"
              style={{ fontSize: 10, color: "var(--pb-text-muted)" }}
            >
              {info.composite !== null
                ? `${Math.round(info.composite)}/100 · heuristique`
                : "non évalué"}
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: ".06em",
              color: "var(--pb-text-faint)",
            }}
          >
            LIÉ À {info.degree} CYCLE{info.degree > 1 ? "S" : ""}
          </div>
          {info.links.length > 0 && (
            <div
              style={{
                marginTop: 5,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {info.links.map((lk) => (
                <div
                  key={lk.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10.5,
                    color: "var(--pb-text-muted)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 0,
                      borderTop: `2px ${lk.declared ? "solid" : "dashed"} ${
                        lk.declared ? "var(--pb-accent)" : "var(--pb-text-faint)"
                      }`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {lk.slug}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--pb-text-faint)" }}>
                    {lk.type}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--pb-text-faint)" }}>
            cliquer : ouvrir le détail du cycle
          </div>
        </div>
      )}
    </div>
  );
}
