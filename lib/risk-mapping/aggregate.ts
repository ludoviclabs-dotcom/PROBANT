/**
 * Agrégation page de la cartographie des risques.
 *
 * `buildCycleScores` rattache les constats aux cycles (via `attach.ts`) puis
 * score chaque cycle (via `scoring.ts`). Les agrégats page décrivent l'ensemble
 * du dossier : distribution par bande de criticité, cycles les plus critiques,
 * moyennes de composite par famille.
 *
 * Les effets chiffrés (C05 : effets financiers EXPLICITES seulement, jamais un écart au
 * seuil) viennent de la projection PARTAGÉE avec la Synthèse (`lib/synthesis/exposure`) :
 * répétitions exactes comptées une fois, versions remplacées et constats écartés exclus,
 * conflits et chevauchements indéterminés, effets tenus par poste et par sens. Le total de
 * page est la projection du dossier entier (un constat rattaché à plusieurs cycles ne compte
 * qu'une fois) ; les signaux EUR sans effet sont comptés à part, sans montant.
 *
 * Fonctions PURES : aucun import React ni `fs`, aucun `Date.now()`.
 */

import type { Finding } from "@/lib/canonical-model/finding";
import type { AuditCycle, CycleFamily } from "@/lib/audit-cycles/types";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import type { CriticityBand, CycleRiskScore, RiskAdjustmentMap } from "./types";
import { projectExposure, type ScopedExposure } from "@/lib/synthesis/exposure";
import type { ExposureDimension } from "@/lib/synthesis/types";
import { attachFindingsToCycles } from "./attach";
import { isEurSignalWithoutEffect, riskEffects, scoreCycle } from "./scoring";

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
  /**
   * Effets financiers EXPLICITES du dossier, lus dans la projection partagée avec la Synthèse :
   * pont par poste et sens, groupes indéterminés à part. Aucun chiffre unique tous postes.
   */
  effects: ScopedExposure;
  /** Signaux EUR sans effet explicite : priorité qualitative, incidence comptable inconnue. */
  eurSignalsWithoutEffect: string[];
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
  exposure?: Pick<ExposureDimension, "clusters">,
): CycleRiskScore[] {
  const { byCycle } = attachFindingsToCycles(cycles, findings);
  // Une projection pour tout le dossier, lue cycle par cycle : un même groupe d'effets est jugé
  // identiquement dans chaque cycle qu'il touche (aucune déduplication locale divergente).
  const shared = exposure ?? projectExposure(findings, "risk-mapping").exposure;
  return cycles.map((cycle) =>
    scoreCycle(
      cycle,
      byCycle.get(cycle.slug) ?? [],
      materiality,
      adjustments[cycle.slug],
      shared,
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
  exposure?: Pick<ExposureDimension, "clusters">,
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

  // Un constat rattaché à plusieurs cycles ne compte qu'une fois : le total page est la
  // projection du dossier entier, pas la somme des cycles.
  const unique = [...new Map(findings.map((f) => [f.id, f])).values()];
  const effects = riskEffects(unique, exposure);
  const eurSignalsWithoutEffect = unique.filter(isEurSignalWithoutEffect).map((f) => f.id);

  return {
    distribution,
    topRisks,
    familyAverages,
    evaluatedCycleCount: scores.filter((s) => s.findingCount > 0).length,
    unevaluatedCycleCount: distribution.non_évalué,
    effects,
    eurSignalsWithoutEffect,
    unattachedFindings: unattached,
  };
}
