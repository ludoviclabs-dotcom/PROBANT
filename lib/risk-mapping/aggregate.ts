/**
 * Agrégation page de la cartographie des risques.
 *
 * `buildCycleScores` rattache les constats aux cycles (via `attach.ts`) puis
 * score chaque cycle (via `scoring.ts`). Les agrégats page décrivent l'ensemble
 * du dossier : distribution par bande de criticité, cycles les plus critiques,
 * moyennes de composite par famille.
 *
 * L'incidence chiffrée en EUR est dédupliquée par `finding.id` au niveau page :
 * un même constat rattaché à plusieurs cycles ne compte qu'une fois dans le
 * total d'incidence global (pas de double comptage).
 *
 * Fonctions PURES : aucun import React ni `fs`, aucun `Date.now()`.
 */

import type { Finding } from "@/lib/canonical-model/finding";
import type { AuditCycle, CycleFamily } from "@/lib/audit-cycles/types";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import type { CriticityBand, CycleRiskScore, RiskAdjustmentMap } from "./types";
import { attachFindingsToCycles } from "./attach";
import { scoreCycle } from "./scoring";

/** Incidence chiffrée d'un constat en EUR (0 si l'unité n'est pas EUR). */
function findingInc(f: Finding): number {
  return f.mesure.unite === "EUR" ? Math.abs(f.mesure.constate - f.mesure.seuil) : 0;
}

/** Distribution du nombre de cycles par bande de criticité. */
export type BandDistribution = Record<CriticityBand, number>;

/** Composite moyen d'une famille de cycles (sur les cycles évalués). */
export interface FamilyAverage {
  family: CycleFamily;
  /** Moyenne des composites non nuls, ou null si aucun cycle évalué. */
  averageComposite: number | null;
  /** Nombre de cycles de la famille pris en compte (composite non nul). */
  evaluatedCount: number;
  /** Nombre total de cycles de la famille. */
  totalCount: number;
}

/** Agrégats page : distribution, top risques, moyennes par famille, incidence. */
export interface RiskPageAggregates {
  distribution: BandDistribution;
  /** Cycles évalués triés par composite décroissant (top d'abord). */
  topRisks: CycleRiskScore[];
  familyAverages: FamilyAverage[];
  /** Nombre de cycles rattachés à au moins un constat. */
  evaluatedCycleCount: number;
  /** Nombre de cycles « non évalués » (ni constat ni standard obligatoire). */
  unevaluatedCycleCount: number;
  /** Somme des incidences EUR, dédupliquée par `finding.id`. */
  totalIncidenceEur: number;
  /** Constats rattachés à aucun cycle (jamais perdus). */
  unattachedFindings: Finding[];
}

/**
 * Score chaque cycle à partir des constats rattachés et des ajustements.
 * L'ordre de sortie suit l'ordre d'entrée des cycles (déterministe).
 */
export function buildCycleScores(
  cycles: AuditCycle[],
  findings: Finding[],
  materiality: MaterialityThresholds | null,
  adjustments: RiskAdjustmentMap,
): CycleRiskScore[] {
  const { byCycle } = attachFindingsToCycles(cycles, findings);
  return cycles.map((cycle) =>
    scoreCycle(
      cycle,
      byCycle.get(cycle.slug) ?? [],
      materiality,
      adjustments[cycle.slug],
    ),
  );
}

function emptyDistribution(): BandDistribution {
  return {
    faible: 0,
    modéré: 0,
    élevé: 0,
    critique: 0,
    non_évalué: 0,
  };
}

/**
 * Calcule les agrégats page à partir des scores et du rattachement des constats.
 * `topN` borne la liste des cycles les plus critiques (défaut 8).
 */
export function buildPageAggregates(
  cycles: AuditCycle[],
  scores: CycleRiskScore[],
  findings: Finding[],
  topN = 8,
): RiskPageAggregates {
  const distribution = emptyDistribution();
  for (const s of scores) {
    distribution[s.criticityBand] += 1;
  }

  const evaluated = scores.filter((s) => s.composite !== null);
  const topRisks = [...evaluated]
    .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0))
    .slice(0, topN);

  const scoreBySlug = new Map<string, CycleRiskScore>();
  for (const s of scores) scoreBySlug.set(s.cycleSlug, s);

  const familyBuckets = new Map<CycleFamily, CycleRiskScore[]>();
  for (const cycle of cycles) {
    const s = scoreBySlug.get(cycle.slug);
    if (!s) continue;
    const bucket = familyBuckets.get(cycle.family);
    if (bucket) bucket.push(s);
    else familyBuckets.set(cycle.family, [s]);
  }

  const familyAverages: FamilyAverage[] = [];
  for (const [family, bucket] of familyBuckets) {
    const evaluatedInFamily = bucket.filter((s) => s.composite !== null);
    const sum = evaluatedInFamily.reduce((acc, s) => acc + (s.composite ?? 0), 0);
    familyAverages.push({
      family,
      averageComposite:
        evaluatedInFamily.length > 0 ? sum / evaluatedInFamily.length : null,
      evaluatedCount: evaluatedInFamily.length,
      totalCount: bucket.length,
    });
  }

  const { unattached } = attachFindingsToCycles(cycles, findings);

  // Déduplication de l'incidence par finding.id : un constat rattaché à
  // plusieurs cycles ne compte qu'une fois dans le total page.
  const seen = new Set<string>();
  let totalIncidenceEur = 0;
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    totalIncidenceEur += findingInc(f);
  }

  return {
    distribution,
    topRisks,
    familyAverages,
    evaluatedCycleCount: scores.filter((s) => s.findingCount > 0).length,
    unevaluatedCycleCount: distribution.non_évalué,
    totalIncidenceEur,
    unattachedFindings: unattached,
  };
}
