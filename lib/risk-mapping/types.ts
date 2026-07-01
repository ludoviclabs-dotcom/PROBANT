/**
 * Cartographie des risques — fondation de types du moteur `lib/risk-mapping`.
 *
 * Module isomorphe (aucun import React ni `fs`). Il ne doit JAMAIS importer
 * `lib/audit-cycles/loader.ts` (lecture filesystem, serveur uniquement) : les
 * cycles sont passés sérialisés en props depuis le Server Component.
 *
 * Modèle 3D-ready : Données pures → Layout injectable → Renderer interchangeable.
 * Le moteur (scoring/graph) ne connaît pas l'écran ; `layout.ts` est le seul à
 * décider la géométrie ; un renderer SVG 2D implémente `RiskGraphRenderer`.
 * Le champ `Vec3.z` est réservé au futur passage 3D (aucune refonte de types).
 *
 * Règle de fiabilité (non négociable) : le composite est une heuristique interne
 * jamais opposable, tracée par `isHeuristic`. Les arcs ne viennent que de
 * `relatedCycles` (+ comptes PCG réellement partagés). Aucun coefficient de
 * contagion chiffré, aucun chiffre ni citation inventé.
 */

import type { CloisonId, Severity } from "@/lib/canonical-model";
import type { CycleFamily } from "@/lib/audit-cycles/types";

/**
 * Point de géométrie. `z` est optionnel et réservé au rendu 3D futur : le
 * moteur et le layout 2D ne le renseignent pas.
 */
export interface Vec3 {
  x: number;
  y: number;
  z?: number;
}

/**
 * Les quatre axes du modèle du risque d'audit (ISA 200/315/330).
 * Détectabilité est inversée : un score élevé = bonne détection = risque moindre.
 */
export type RiskAxisId = "gravite" | "probabilite" | "detectabilite" | "exposition";

/**
 * Provenance d'un score d'axe, pour la traçabilité de l'heuristique.
 */
export type ScoreProvenance = "auto" | "auto+ajusté" | "non_évalué";

/**
 * État d'évaluation d'un cycle. « non_évalué » ≠ « 0 vert » : un cycle sans
 * constat ni standard obligatoire est gris hachuré, jamais vert.
 */
export type EvaluationState = "évalué" | "partiel" | "non_évalué";

/**
 * Bande de criticité dérivée du composite (bornes en tête de `scoring.ts`).
 */
export type CriticityBand = "faible" | "modéré" | "élevé" | "critique" | "non_évalué";

/**
 * Définition d'un axe : libellé, doctrine ISA, ajustabilité manuelle et sens.
 */
export interface RiskAxis {
  id: RiskAxisId;
  label: string;
  short: string;
  doctrine: string;
  /** L'auditeur peut appliquer un ajustement additif borné sur cet axe. */
  adjustable: boolean;
  /** Axe inversé : score élevé = risque moindre (cas de la détectabilité). */
  invertsRisk: boolean;
}

/**
 * Justification factuelle d'un score d'axe. `findingIds` référence de vrais
 * `Finding` : aucune valeur n'est produite sans ancrage dans les données.
 */
export interface RiskDriver {
  label: string;
  detail: string;
  findingIds: string[];
}

/**
 * Score d'un axe : composante auto (0-100), ajustement additif de l'auditeur,
 * valeur effective bornée, provenance et drivers factuels.
 * `value = clamp(auto + adjustment*ADJ_STEP, 0, 100)`.
 */
export interface AxisScore {
  axis: RiskAxisId;
  auto: number;
  adjustment: number;
  value: number;
  provenance: ScoreProvenance;
  drivers: RiskDriver[];
}

/**
 * Score complet d'un cycle sur les quatre axes.
 *
 * `composite` est `null` quand `evaluation === "non_évalué"` (aucun constat ni
 * standard obligatoire) — jamais 0, qui suggérerait à tort un risque maîtrisé.
 * `isHeuristic` est un littéral `true` : ce composite n'est jamais opposable.
 */
export interface CycleRiskScore {
  cycleSlug: string;
  family: CycleFamily;
  axes: Record<RiskAxisId, AxisScore>;
  composite: number | null;
  criticityBand: CriticityBand;
  evaluation: EvaluationState;
  findingCount: number;
  isHeuristic: true;
}

/**
 * Nœud du graphe = un cycle d'audit. `position` est renseigné par `layout.ts`,
 * pas par le moteur.
 */
export interface RiskNode {
  id: string;
  cycleSlug: string;
  label: string;
  family: CycleFamily;
  cloisons: CloisonId[];
  scores: CycleRiskScore;
  position?: Vec3;
}

/**
 * Origine factuelle d'un arc : relation `relatedCycles` déclarée dans les fiches
 * YAML, ou comptes PCG réellement partagés entre deux cycles.
 */
export type RiskEdgeSource = "relatedCycles" | "comptes";

/**
 * Arc entre deux cycles. `weight` pour les arcs « comptes » = nombre de préfixes
 * PCG partagés (fait mesuré) ; aucun coefficient de contagion inventé.
 * Id canonique `${min}->${max}` pour la déduplication.
 */
export interface RiskEdge {
  id: string;
  from: string;
  to: string;
  source: RiskEdgeSource;
  weight: number;
  bidirectional: boolean;
}

/**
 * Graphe complet nodes + edges, horodaté à la génération.
 */
export interface RiskGraph {
  nodes: RiskNode[];
  edges: RiskEdge[];
  generatedAt: string;
}

/**
 * Ajustement manuel de l'auditeur pour un cycle (surcouche additive bornée).
 * Ne porte que sur les axes ajustables (probabilité, détectabilité). L'auto est
 * toujours recalculé depuis les données ; l'ajustement s'ajoute par-dessus.
 */
export interface RiskAdjustment {
  probabilite: number;
  detectabilite: number;
  note?: string;
  touchedAt: string;
}

/**
 * Map des ajustements indexée par slug de cycle (persistée en session).
 */
export type RiskAdjustmentMap = Record<string, RiskAdjustment>;

/**
 * Contrat de rendu du graphe : le renderer (SVG 2D aujourd'hui, Canvas/3D
 * demain) consomme un `RiskGraph` déjà positionné. `t` = progression du tween.
 */
export interface RiskGraphRenderer {
  render(g: RiskGraph, o: { t: number; selected?: string; hovered?: string }): void;
}

/**
 * Définition des quatre axes du modèle du risque d'audit.
 * Gravité et exposition sont 100% auto (non ajustables) ; probabilité et
 * détectabilité admettent un ajustement de jugement (historique, CI, etc.).
 */
export const RISK_AXES: readonly RiskAxis[] = [
  {
    id: "gravite",
    label: "Gravité",
    short: "G",
    doctrine: "Impact potentiel sur les états financiers (ISA 320 — matérialité).",
    adjustable: false,
    invertsRisk: false,
  },
  {
    id: "probabilite",
    label: "Probabilité",
    short: "P",
    doctrine: "Risque inhérent — probabilité d'anomalie significative (ISA 315).",
    adjustable: true,
    invertsRisk: false,
  },
  {
    id: "detectabilite",
    label: "Détectabilité",
    short: "D",
    doctrine: "Capacité à détecter — inverse du risque de non-détection (ISA 330).",
    adjustable: true,
    invertsRisk: true,
  },
  {
    id: "exposition",
    label: "Exposition",
    short: "E",
    doctrine: "Exposition normative et réglementaire structurelle du cycle.",
    adjustable: false,
    invertsRisk: false,
  },
];

/**
 * Pondération de gravité, partagée à l'identique avec la Synthèse (une seule
 * vérité). Un même dossier doit donner des gravités cohérentes entre les vues.
 */
export const WSEV: Record<Severity, number> = {
  bloquant: 25,
  majeur: 8,
  mineur: 2,
  informatif: 0.5,
};

/**
 * Bornes de saturation de l'heuristique de scoring (détail en tête de
 * `scoring.ts`). Chaque borne amortit une composante brute vers [0,100].
 */

/** Saturation de la masse de gravité : gSeverity = 100·ΣWSEV/(ΣWSEV+K_SEV). */
export const K_SEV = 25;

/** Saturation de la densité de constats (composante probabilité). */
export const K_DENS = 6;

/** Saturation du nombre de risques inhérents/fraude déclarés (probabilité). */
export const K_RISK = 4;

/** Saturation du nombre de standards obligatoires (exposition). */
export const K_STD = 4;

/**
 * Pas d'un cran d'ajustement manuel (−2..+2), en points de score.
 * value = clamp(auto + adjustment*ADJ_STEP, 0, 100).
 */
export const ADJ_STEP = 12;
