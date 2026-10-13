/**
 * Moteur de Synthèse — pur, reproductible, tracé.
 *
 * Entrée : un `DossierSnapshot` (l'enveloppe canonique posée par le lot
 * « dossier unique »). Sortie : un `SynthesisSnapshot`.
 *
 * Déterminisme :
 *  - l'horloge est INJECTÉE (`clock`), jamais lue ici ;
 *  - aucun aléa ;
 *  - tous les parcours sont triés de façon stable AVANT calcul et
 *    sérialisation — deux ordres d'entrée différents produisent le même
 *    snapshot, donc le même hash ;
 *  - le hash est un SHA-256 du JSON canonique, calculé SANS `generatedAt`.
 *
 * Le composant React ne calcule plus rien : il consomme ce snapshot.
 */

import type { DossierSnapshot } from "@/lib/canonical-model";
import type { Finding, Severity, FindingFamily } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { reviewEventsDigest, statusAfterReviewEvents } from "@/lib/dossier/review";
import { canonicalCompare, canonicalJson, sha256Hex } from "./canonical";
import { applyRatePct, sumCents } from "./money";
import {
  AGGREGATION_POLICY,
  collectEffects,
  deduplicateEffects,
} from "./exposure";
import type {
  AdmissibilityDimension,
  CalculationTraceEntry,
  CoverageDimension,
  CoveragePopulation,
  CoveragePopulationStatus,
  EvidenceBlock,
  ExposureDimension,
  EffectStage,
  EffectTarget,
  EffectDirection,
  AmountStatus,
  TaxEffectBlock,
  NetEffectByTarget,
  Limitation,
  ReviewDimension,
  RiskDimension,
  SynthesisSnapshot,
  Verdict,
} from "./types";

export const SYNTHESIS_SCHEMA_VERSION = "1.0.0";
export const SYNTHESIS_ENGINE_VERSION = "1.1.0";
export const SYNTHESIS_POLICY_VERSION = "1.1.0";

/**
 * Seuils de la politique de couverture. Bornes exactes documentées :
 * ratio ≥ SUBSTANTIAL_MIN ⇒ substantial ; 0 < ratio < SUBSTANTIAL_MIN ⇒
 * partial ; ratio = 0 (ou aucune écriture ET aucun contrôle) ⇒ none.
 */
export const COVERAGE_SUBSTANTIAL_MIN = 0.95;

/** Statuts de revue considérés comme clos (alignés sur lib/dossier/review). */
/** Statuts de revue qui ferment un constat (partagé avec le registre des cycles). */
export const CLOSED_REVIEW = new Set([
  "valide", "ecarte", "corrige", "confirmed", "dismissed", "corrected", "superseded",
]);

export interface SynthesisOptions {
  /** Horloge injectée — ISO 8601. Jamais de Date.now() dans le moteur. */
  clock: () => string;
}

const SEVERITIES: Severity[] = ["bloquant", "majeur", "mineur", "informatif"];
const FAMILIES: FindingFamily[] = ["hardLaw", "methodology", "internal"];

/** Poids heuristiques historiques — subordonnés, jamais un verdict. */
const HEURISTIC_WEIGHTS: Record<Severity, number> = {
  bloquant: 25, majeur: 8, mineur: 2, informatif: 0.5,
};
const HEURISTIC_SATURATION = 52;

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function buildSynthesisSnapshot(
  input: DossierSnapshot,
  options: SynthesisOptions,
): SynthesisSnapshot {
  const trace: CalculationTraceEntry[] = [];
  const limitations: Limitation[] = [];

  // Tri stable de toutes les collections d'entrée : l'ordre d'arrivée ne doit
  // jamais influencer le résultat.
  const findings = [...input.findings].sort((a, b) => canonicalCompare(a.id, b.id));
  const admissibilityFindings = [...input.admissibilityFindings].sort((a, b) =>
    canonicalCompare(a.id, b.id),
  );
  const sourceDocuments = [...input.sourceDocuments].sort((a, b) =>
    canonicalCompare(a.id, b.id),
  );
  const ctx = input.calculationContext;

  /* ── 1. Admissibility ──────────────────────────────────────────────────── */
  const blocking = admissibilityFindings.filter((f) => f.severity === "bloquant");
  const admissibility: AdmissibilityDimension = {
    status:
      blocking.length > 0
        ? "rejected"
        : admissibilityFindings.length > 0
          ? "admissible_with_alerts"
          : "admissible",
    blockingCount: blocking.length,
    alertFindingIds: admissibilityFindings.map((f) => f.id),
  };
  trace.push({
    metricId: "admissibility.status",
    formulaId: "admissibility-status",
    formulaVersion: "1.0.0",
    inputs: {
      admissibilityFindings: admissibilityFindings.map((f) => f.id),
      blockingCount: blocking.length,
    },
    excludedItems: [],
    output: admissibility.status,
    unit: "status",
    rounding: "none",
    explanation:
      "rejected si au moins une alerte d'admissibilité bloquante ; admissible_with_alerts si alertes non bloquantes ; admissible sinon.",
  });

  /* ── 2. Coverage ───────────────────────────────────────────────────────── */
  // C03 — chaque population est qualifiée séparément ; un ratio exige un dénominateur qualifié.
  // L'avancement des contrôles compté depuis les constats n'établit aucune couverture.
  const entriesRatio =
    ctx.entriesTotal > 0 ? round4(ctx.entriesAnalysed / ctx.entriesTotal) : 0;
  const controlsRatio =
    ctx.controlsEligible > 0 ? round4(ctx.controlsConcluded / ctx.controlsEligible) : 0;
  const entriesPopulation = ctx.entriesPopulation ?? (ctx.entriesTotal > 0 ? "counted" : "missing");
  const controlsBasis = ctx.controlsDenominatorBasis ?? (ctx.controlsEligible > 0 ? "declared" : "missing");
  const treated = (num: number, den: number): CoveragePopulationStatus => (num >= den ? "complete" : num > 0 ? "partial" : "untreated");
  const populations: CoveragePopulation[] = [
    entriesPopulation === "counted"
      ? { id: "entries", label: "Écritures analysées", unit: "écritures", status: treated(ctx.entriesAnalysed, ctx.entriesTotal), numerator: ctx.entriesAnalysed, denominator: ctx.entriesTotal, ratio: entriesRatio, basis: "dénombrement du parseur" }
      : { id: "entries", label: "Écritures analysées", unit: "écritures", status: entriesPopulation, numerator: ctx.entriesAnalysed, denominator: null, ratio: null,
          basis: entriesPopulation === "missing" ? "population non dénombrée : aucun ratio" : entriesPopulation === "known_empty" ? "fichier lu, zéro écriture : rien à couvrir" : "sans objet pour ce dossier" },
    controlsBasis === "catalog" || controlsBasis === "declared"
      ? { id: "controls", label: "Contrôles conclus", unit: "contrôles", status: treated(ctx.controlsConcluded, ctx.controlsEligible), numerator: ctx.controlsConcluded, denominator: ctx.controlsEligible, ratio: controlsRatio, basis: controlsBasis === "catalog" ? "catalogue des règles du moteur" : "dénominateur déclaré par le producteur" }
      : { id: "controls", label: "Contrôles conclus", unit: "contrôles", status: controlsBasis === "findings_only" ? "unqualified" : "missing", numerator: ctx.controlsConcluded, denominator: null, ratio: null,
          basis: controlsBasis === "findings_only" ? "contrôles comptés depuis les constats : dénominateur non qualifié, avancement historique seulement" : "aucun dénominateur de contrôles" },
  ];
  const qualified = populations.filter((p) => p.ratio !== null);
  const disqualifying = populations.some((p) => p.status === "missing" || p.status === "unqualified");
  // Le ratio directeur est le plus faible des populations qualifiées : on ne couvre pas mieux que sa pire dimension.
  const governingRatio = qualified.length ? Math.min(...qualified.map((p) => p.ratio as number)) : 0;
  const coverage: CoverageDimension = {
    // Une population manquante ou au dénominateur non qualifié rend la couverture non qualifiée :
    // on ne qualifie pas de « partielle » une population que l'on n'a pas dénombrée.
    status:
      disqualifying
        ? "unqualified"
        : qualified.length === 0
          ? "none"
          : governingRatio >= COVERAGE_SUBSTANTIAL_MIN && !ctx.limitedToUploadedDocuments
            ? "substantial"
            : governingRatio > 0
              ? "partial"
              : "none",
    populations,
    entriesTotal: ctx.entriesTotal,
    entriesAnalysed: ctx.entriesAnalysed,
    controlsEligible: ctx.controlsEligible,
    controlsExecuted: ctx.controlsExecuted,
    controlsConcluded: ctx.controlsConcluded,
    controlsNotConcluded: ctx.controlsNotConcluded,
    entriesRatio,
    controlsRatio,
    documentsPresent: sourceDocuments.length,
  };
  trace.push({
    metricId: "coverage.status",
    formulaId: "coverage-governing-ratio",
    formulaVersion: "1.0.0",
    inputs: {
      entriesTotal: ctx.entriesTotal,
      entriesAnalysed: ctx.entriesAnalysed,
      controlsEligible: ctx.controlsEligible,
      controlsConcluded: ctx.controlsConcluded,
      governingRatio,
      entriesPopulation,
      controlsDenominatorBasis: controlsBasis,
      limitedToUploadedDocuments: ctx.limitedToUploadedDocuments ? "yes" : "no",
      substantialMin: COVERAGE_SUBSTANTIAL_MIN,
    },
    excludedItems: populations.filter((p) => p.ratio === null).map((p) => ({ id: p.id, reason: p.basis })),
    output: coverage.status,
    unit: "status",
    rounding: "ratios arrondis à 4 décimales",
    explanation: `unqualified dès qu'une population est manquante ou au dénominateur non qualifié ; sinon min des ratios des populations qualifiées (dénominateur dénombré ou déclaré) : substantial si ≥ ${COVERAGE_SUBSTANTIAL_MIN}, partial si > 0, none si 0. Un dépôt historique reste limité aux documents fournis.`,
  });

  // Statut de revue de chaque constat (dernier événement, sinon statut porté
  // par le constat) — calculé une fois, partagé par Risk, Exposure et Review.
  const statusOf = new Map<string, string>(
    findings.map((f) => [f.id, statusAfterReviewEvents(f, input.reviewEvents)]),
  );

  /* ── 3. Risk ───────────────────────────────────────────────────────────── */
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<FindingFamily, number>;
  const matrix: Partial<Record<CloisonId, Record<Severity, number>>> = {};
  let weighted = 0;
  let openBlockingCount = 0;
  for (const f of findings) {
    bySeverity[f.severity]++;
    byFamily[f.family]++;
    weighted += HEURISTIC_WEIGHTS[f.severity];
    const row =
      matrix[f.cloison] ??
      (matrix[f.cloison] = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>);
    row[f.severity]++;
    if (f.severity === "bloquant" && !CLOSED_REVIEW.has(statusOf.get(f.id) ?? "en_attente")) {
      openBlockingCount++;
    }
  }
  const heuristicSeverityIndex = Math.round(
    (100 * weighted) / (weighted + HEURISTIC_SATURATION),
  );
  const risk: RiskDimension = {
    bySeverity,
    byFamily,
    matrix,
    totalFindings: findings.length,
    openBlockingCount,
    heuristicSeverityIndex,
    heuristicSeverityIndexIsVerdict: false,
  };
  trace.push({
    metricId: "risk.openBlockingCount",
    formulaId: "open-blocking-count",
    formulaVersion: "1.0.0",
    inputs: {
      totalBloquant: bySeverity.bloquant,
      closedStatuses: [...CLOSED_REVIEW],
    },
    excludedItems: findings
      .filter((f) => f.severity === "bloquant" && CLOSED_REVIEW.has(statusOf.get(f.id) ?? "en_attente"))
      .map((f) => ({ id: f.id, reason: `bloquant mais revue close (${statusOf.get(f.id)})` })),
    output: openBlockingCount,
    unit: "count",
    rounding: "none",
    explanation:
      "Constats de gravité bloquante dont la revue n'est pas close. Distinct de bySeverity.bloquant, qui compte tous les bloquants sans regard sur leur statut de revue.",
  });
  trace.push({
    metricId: "risk.heuristicSeverityIndex",
    formulaId: "legacy-severity-index",
    formulaVersion: "1.0.0",
    inputs: {
      weights: `bloquant=25 majeur=8 mineur=2 informatif=0.5, saturation=${HEURISTIC_SATURATION}`,
      totalFindings: findings.length,
      weightedSum: weighted,
    },
    excludedItems: [],
    output: heuristicSeverityIndex,
    unit: "index",
    rounding: "arrondi à l'entier",
    explanation:
      "HEURISTIQUE historique 100·W/(W+52), conservée comme signal subordonné. N'est jamais le verdict.",
  });

  /* ── 4. Exposure (C05) ────────────────────────────────────────────────── */
  const { records, withoutEffect } = collectEffects(findings, input.dossier.fecFingerprint);
  const dedup = deduplicateEffects(records);
  const recordOf = new Map(records.map((r) => [r.findingId, r]));
  const DISMISSED_REVIEW = new Set(["ecarte", "dismissed", "superseded"]);
  const CORRECTED_REVIEW = new Set(["corrige", "corrected"]);
  const PROPOSED_REVIEW = new Set(["valide", "confirmed"]);
  const signed = (cents: number, direction: EffectDirection) => (direction === "decrease" ? -cents : cents);

  const reviewedParts: number[] = [];
  const dismissedParts: number[] = [];
  const pendingParts: number[] = [];
  const stageMap = new Map<string, EffectStage>();
  const stageOf = (target: EffectTarget, direction: EffectDirection): EffectStage => {
    const key = `${target}|${direction}`;
    let st = stageMap.get(key);
    if (!st) {
      st = { target, direction, initialCents: 0, pendingCents: 0, proposedCents: 0, correctedCents: 0, residualCents: 0, indeterminateClusterIds: [] };
      stageMap.set(key, st);
    }
    return st;
  };
  /** Effets d'ajustement (proposés ou résiduels après correction partielle) soumis à l'incidence fiscale. */
  const adjustments: { findingId: string; target: EffectTarget; signedCents: number; proposed: boolean }[] = [];

  for (const cluster of dedup.clusters) {
    if (cluster.status !== "determined" || cluster.retainedFindingId === null) {
      // Indéterminé ou en conflit : aucun montant n'alimente une étape ; le détail et les bornes restent dans le cluster.
      const dirs = new Set(cluster.members.map((m) => m.direction));
      for (const d of dirs) stageOf(cluster.target, d).indeterminateClusterIds.push(cluster.clusterId);
      continue;
    }
    const r = recordOf.get(cluster.retainedFindingId)!;
    const amount = cluster.retainedCents ?? 0;
    const allClosed = cluster.findingIds.every((id) => CLOSED_REVIEW.has(statusOf.get(id) ?? "en_attente"));
    if (allClosed) reviewedParts.push(amount);
    const st = statusOf.get(r.findingId) ?? "en_attente";
    if (DISMISSED_REVIEW.has(st)) {
      dismissedParts.push(amount);
      continue;
    }
    const stage = stageOf(cluster.target, r.effect.direction);
    stage.initialCents += amount;
    if (CORRECTED_REVIEW.has(st)) {
      const corrected = r.effect.correction?.amountCents ?? amount;
      stage.correctedCents += corrected;
      const residual = amount - corrected;
      stage.residualCents += residual;
      if (residual > 0) adjustments.push({ findingId: r.findingId, target: cluster.target, signedCents: signed(residual, r.effect.direction), proposed: false });
    } else if (PROPOSED_REVIEW.has(st)) {
      stage.proposedCents += amount;
      adjustments.push({ findingId: r.findingId, target: cluster.target, signedCents: signed(amount, r.effect.direction), proposed: true });
    } else if (!CLOSED_REVIEW.has(st)) {
      pendingParts.push(amount);
      stage.pendingCents += amount;
    }
  }
  const stages = [...stageMap.values()].sort((a, b) => canonicalCompare(`${a.target}|${a.direction}`, `${b.target}|${b.direction}`));

  // Incidence fiscale : taux explicite ET qualification fiscale. Un taux sans qualification ne valide aucun net ;
  // une différence temporaire attend le moteur fiscal (C10) ; sans taux, inconnu.
  const taxKnown: { findingId: string; target: EffectTarget; taxCents: number }[] = [];
  const taxUnknown: { findingId: string; reason: string }[] = [];
  for (const a of adjustments) {
    const e = recordOf.get(a.findingId)!.effect;
    const q = e.taxQualification;
    if (q === "non_deductible" || q === "reclassification") taxKnown.push({ findingId: a.findingId, target: a.target, taxCents: 0 });
    else if (q === "deductible" && e.taxRatePct !== undefined) taxKnown.push({ findingId: a.findingId, target: a.target, taxCents: applyRatePct(a.signedCents, e.taxRatePct) });
    else if (q === "temporary_difference") taxUnknown.push({ findingId: a.findingId, reason: "différence temporaire : incidence fiscale à calculer par le moteur fiscal (scénario avant/après), non disponible" });
    else if (e.taxRatePct === undefined) taxUnknown.push({ findingId: a.findingId, reason: "taux d'impôt absent : incidence fiscale inconnue" });
    else taxUnknown.push({ findingId: a.findingId, reason: "taux explicite sans qualification fiscale (déductibilité non établie) : aucun net validé" });
  }
  const taxStatusOf = (known: number, unknown: number): AmountStatus => (unknown === 0 ? "known" : known === 0 ? "unknown" : "partial");
  const tax: TaxEffectBlock = {
    status: adjustments.length === 0 ? "known" : taxStatusOf(taxKnown.length, taxUnknown.length),
    knownCents: sumCents(taxKnown.map((t) => t.taxCents), "effet d'impôt connu"),
    knownFindingIds: taxKnown.map((t) => t.findingId),
    unknown: taxUnknown,
  };
  const targets = [...new Set(adjustments.map((a) => a.target))].sort(canonicalCompare);
  const netByTarget: NetEffectByTarget[] = targets.map((target) => {
    const mine = adjustments.filter((a) => a.target === target);
    const knownIds = new Set(taxKnown.filter((t) => t.target === target).map((t) => t.findingId));
    const unknownCount = mine.filter((a) => !knownIds.has(a.findingId)).length;
    const taxStatus = taxStatusOf(knownIds.size, unknownCount);
    const uncorrectedSignedCents = sumCents(mine.map((a) => a.signedCents), `anomalies non corrigées ${target}`);
    const proposedSignedCents = sumCents(mine.filter((a) => a.proposed).map((a) => a.signedCents), `ajustement proposé ${target}`);
    const knownTax = sumCents(taxKnown.filter((t) => t.target === target).map((t) => t.taxCents), `impôt connu ${target}`);
    const knownSubset = sumCents(mine.filter((a) => knownIds.has(a.findingId)).map((a) => a.signedCents), `sous-ensemble connu ${target}`);
    return {
      target,
      proposedSignedCents,
      uncorrectedSignedCents,
      taxStatus,
      netAfterKnownTaxCents: taxStatus === "known" ? uncorrectedSignedCents - knownTax : null,
      partialNetKnownSubsetCents: knownSubset - knownTax,
    };
  });

  const exposure: ExposureDimension = {
    grossDetectedExposureCents: dedup.grossCents,
    exactRepeatsCents: dedup.exactRepeatsCents,
    determinedExposureCents: dedup.determinedCents,
    exposureBoundsCents: dedup.boundsCents,
    aggregationStatus: dedup.status,
    reviewedExposureCents: sumCents(reviewedParts, "exposition revue"),
    dismissedExposureCents: sumCents(dismissedParts, "exposition écartée"),
    pendingReviewExposureCents: sumCents(pendingParts, "exposition en attente"),
    stages,
    tax,
    netByTarget,
    taxIncidence: { provider: "none", method: "before_after_is_scenario", pendingFindingIds: taxUnknown.map((t) => t.findingId) },
    byCloison: dedup.byCloison,
    clusters: dedup.clusters,
    findingsWithoutEffect: withoutEffect,
    policy: AGGREGATION_POLICY,
  };
  trace.push({
    metricId: "exposure.determinedExposureCents",
    formulaId: "exposure-identity-pipeline",
    formulaVersion: AGGREGATION_POLICY.version,
    inputs: {
      effectsCollected: records.length,
      clusters: dedup.clusters.length,
      grossCents: dedup.grossCents,
      exactRepeatsCents: dedup.exactRepeatsCents,
      boundsCents: `${dedup.boundsCents.minCents}..${dedup.boundsCents.maxCents}`,
      aggregationStatus: dedup.status,
    },
    excludedItems: [
      ...withoutEffect.map((id) => ({ id, reason: "aucun financialEffect explicite — l'écart mesuré n'est pas présumé être un impact comptable" })),
      ...dedup.excluded,
      ...dedup.clusters.filter((c) => c.status !== "determined").map((c) => ({ id: c.clusterId, reason: `${c.status} : ${c.reason ?? ""} (bornes ${c.boundsCents.minCents}..${c.boundsCents.maxCents}, constats ${c.findingIds.join(", ")})` })),
    ],
    output: dedup.determinedCents,
    unit: "cents",
    rounding: "aucun (centimes entiers de bout en bout)",
    explanation:
      "Somme des groupes DÉTERMINÉS : répétitions exactes comptées une fois ; même identité à contenus distincts retenue à sa dernière version démontrée, sinon conflit ; écritures partiellement communes sans allocation : indéterminé avec bornes. Aucun maximum n'est présenté comme une somme.",
  });
  trace.push({
    metricId: "exposure.netByTarget",
    formulaId: "net-by-target",
    formulaVersion: "2.0.0",
    inputs: {
      adjustments: adjustments.map((a) => `${a.findingId}:${a.target}:${a.signedCents}:${a.proposed ? "proposé" : "résiduel"}`),
      taxKnownFindings: taxKnown.map((t) => t.findingId),
      taxStatus: tax.status,
    },
    excludedItems: taxUnknown.map((t) => ({ id: t.findingId, reason: t.reason })),
    output: netByTarget.map((n) => `${n.target}: proposé ${n.proposedSignedCents}, non corrigé ${n.uncorrectedSignedCents}, net ${n.netAfterKnownTaxCents ?? "inconnu"} (${n.taxStatus})`).join(" ; ") || "aucun ajustement",
    unit: "cents",
    rounding: "effet d'impôt arrondi au centime par effet (applyRatePct)",
    explanation:
      "Par poste et par sens, jamais additionnés entre postes. Net après impôt seulement si chaque effet du poste a un taux explicite ET une qualification fiscale ; sinon net inconnu, avec un sous-total partiel nommé.",
  });

  /* ── 5. Review ─────────────────────────────────────────────────────────── */
  const byStatus: Record<string, number> = {};
  let reviewedCount = 0;
  for (const f of findings) {
    const st = statusOf.get(f.id) ?? "en_attente";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (CLOSED_REVIEW.has(st)) reviewedCount++;
  }
  const review: ReviewDimension = {
    reviewedCount,
    totalCount: findings.length,
    pct: findings.length === 0 ? 0 : Math.round((reviewedCount / findings.length) * 100),
    byStatus,
  };
  trace.push({
    metricId: "review.pct",
    formulaId: "review-progress",
    formulaVersion: "1.0.0",
    inputs: { reviewedCount, totalCount: findings.length },
    excludedItems: [],
    output: review.pct,
    unit: "pct",
    rounding: "arrondi à l'entier",
    explanation:
      "Part des constats dont le dernier événement de revue est un statut clos (valide/écarté/corrigé et équivalents).",
  });

  /* ── Evidence ──────────────────────────────────────────────────────────── */
  const evidence: EvidenceBlock = {
    sourceDocuments: sourceDocuments.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fingerprint: d.fingerprint,
    })),
    findingsWithoutEvidenceChain: findings
      .filter((f) => (f.preuve ?? []).length === 0)
      .map((f) => f.id),
  };

  if (ctx.limitedToUploadedDocuments) limitations.push({
    code: "limited_upload_comparison",
    message: "Comparaisons limitées aux documents fournis : l’égalité des totaux et les contrôles conclus ne démontrent pas l’exhaustivité ou la couverture des cycles. Fichiers originaux non archivés ; preuve opposable non établie.",
    subjects: [],
  });

  /* ── Limitations ───────────────────────────────────────────────────────── */
  const expected = ctx.expectedDocumentTypes ?? [];
  if (evidence.findingsWithoutEvidenceChain.length > 0) {
    limitations.push({
      code: "missing_evidence",
      message: `${evidence.findingsWithoutEvidenceChain.length} constat(s) sans chaîne de preuve complète.`,
      subjects: evidence.findingsWithoutEvidenceChain,
    });
  }
  const presentTypes = new Set(sourceDocuments.map((d) => d.documentType));
  const missingDocs = expected.filter((t) => !presentTypes.has(t as never));
  if (missingDocs.length > 0) {
    limitations.push({
      code: "missing_document",
      message: `Documents attendus absents : ${missingDocs.join(", ")}.`,
      subjects: missingDocs,
    });
  }
  if (ctx.controlsEligible > ctx.controlsExecuted) {
    limitations.push({
      code: "control_not_run",
      message: `${ctx.controlsEligible - ctx.controlsExecuted} contrôle(s) éligible(s) non exécuté(s).`,
      subjects: [],
    });
  }
  if (ctx.controlsNotConcluded > 0) {
    limitations.push({
      code: "control_inconclusive",
      message: `${ctx.controlsNotConcluded} contrôle(s) sans conclusion exploitable.`,
      subjects: [],
    });
  }
  if (coverage.status === "unqualified" || disqualifying) {
    limitations.push({
      code: "coverage_unqualified",
      message: `Couverture non qualifiée : ${populations.filter((p) => p.status === "missing" || p.status === "unqualified").map((p) => `${p.label.toLowerCase()} — ${p.basis}`).join(" ; ")}. Aucun ratio n'est présenté sans dénominateur qualifié.`,
      subjects: populations.filter((p) => p.status === "missing" || p.status === "unqualified").map((p) => p.id),
    });
  }
  if (coverage.status !== "substantial" && coverage.status !== "unqualified") {
    limitations.push({
      code: "partial_coverage",
      message:
        coverage.status === "none"
          ? "Aucune couverture mesurable : aucun résultat ne doit être présenté comme représentatif du dossier."
          : `Couverture partielle (ratio directeur ${governingRatio}) : les résultats ne portent que sur la part analysée.`,
      subjects: [],
    });
  }
  const truncatedDocs = sourceDocuments.filter((d) => d.truncated);
  if (truncatedDocs.length > 0) {
    limitations.push({
      code: "parser_warning",
      message: "Au moins un document source a été tronqué au parsing ; les lignes au-delà du plafond ne sont pas restituées.",
      subjects: truncatedDocs.map((d) => d.id),
    });
  }
  limitations.push({
    code: "source_review_required",
    message: `Référentiel normatif ${input.dossier.referentielVersion} : citations et seuils en statut « revue requise » — validation métier attendue avant tout usage opposable.`,
    subjects: [input.dossier.referentielVersion],
  });
  const internalFindings = findings.filter((f) => f.family === "internal");
  if (internalFindings.length > 0) {
    limitations.push({
      code: "internal_threshold",
      message: `${internalFindings.length} constat(s) fondé(s) sur des seuils internes PROBANT, non opposables.`,
      subjects: internalFindings.map((f) => f.id),
    });
  }
  const unsupported = sourceDocuments.filter(
    (d) => !["fec", "balance", "pdf", "cycle_document", "demo"].includes(d.documentType),
  );
  if (unsupported.length > 0) {
    limitations.push({
      code: "unsupported_format",
      message: `Format(s) de document non pris en charge : ${unsupported.map((d) => d.fileName).join(", ")}.`,
      subjects: unsupported.map((d) => d.id),
    });
  }
  for (const cluster of dedup.clusters) {
    if (cluster.status !== "determined") {
      limitations.push({
        code: "exposure_indeterminate",
        message: `Groupe d'effets ${cluster.status === "conflict" ? "en conflit" : "à chevauchement"} (${cluster.reason}) : agrégation indéterminée, bornes ${cluster.boundsCents.minCents}..${cluster.boundsCents.maxCents} centimes, arbitrage humain requis.`,
        subjects: cluster.findingIds,
      });
    }
  }
  if (tax.unknown.length > 0) {
    limitations.push({
      code: "tax_incidence_unknown",
      message: `Incidence fiscale inconnue pour ${tax.unknown.length} ajustement(s) : net après impôt non validé (${[...new Set(tax.unknown.map((t) => t.reason))].join(" ; ")}).`,
      subjects: tax.unknown.map((t) => t.findingId),
    });
  }

  /* ── Verdict — catégoriel, jamais un score ─────────────────────────────── */
  const verdict = buildVerdict(admissibility, coverage, review, blocking);
  trace.push({
    metricId: "verdict.status",
    formulaId: "categorical-verdict",
    formulaVersion: "1.0.0",
    inputs: {
      admissibility: admissibility.status,
      coverage: coverage.status,
      reviewPct: review.pct,
      blockingFindings: blocking.map((f) => f.id),
    },
    excludedItems: [],
    output: verdict.status,
    unit: "status",
    rounding: "none",
    explanation:
      "Cascade catégorielle : rejet d'admissibilité > couverture insuffisante > bloquants ouverts > revue en cours > revue close. Aucun score composite.",
  });

  /* ── Assemblage + hash ─────────────────────────────────────────────────── */
  const ruleSetVersion =
    [...new Set(findings.map((f) => f.ruleVersion))].sort().join("+") || "none";

  const body = {
    schemaVersion: SYNTHESIS_SCHEMA_VERSION,
    dossierId: input.dossier.id,
    engineVersion: SYNTHESIS_ENGINE_VERSION,
    ruleSetVersion,
    referenceSetVersion: input.dossier.referentielVersion,
    policyVersion: SYNTHESIS_POLICY_VERSION,
    sourceDocumentHashes: sourceDocuments.map((d) => d.fingerprint),
    reviewEventsDigest: reviewEventsDigest(input.reviewEvents),
    admissibility,
    coverage,
    risk,
    exposure,
    review,
    evidence,
    limitations,
    verdict,
    calculationTrace: trace,
    ...(input.workpaperProjection ? { workpaperProjection: input.workpaperProjection } : {}),
  };

  // Le hash couvre le CONTENU, pas l'horodatage : deux générations des mêmes
  // données à des instants différents portent le même hash.
  const snapshotHash = sha256Hex(canonicalJson(body));

  return {
    ...body,
    snapshotId: `sha256:${snapshotHash}`,
    generatedAt: options.clock(),
    snapshotHash,
  };
}

export function verifySynthesisSnapshotHash(snapshot: SynthesisSnapshot): boolean {
  const body: Partial<SynthesisSnapshot> = { ...snapshot };
  delete body.generatedAt;
  delete body.snapshotHash;
  delete body.snapshotId;
  return sha256Hex(canonicalJson(body)) === snapshot.snapshotHash;
}

function buildVerdict(
  admissibility: AdmissibilityDimension,
  coverage: CoverageDimension,
  review: ReviewDimension,
  blocking: Finding[],
): Verdict {
  if (admissibility.status === "rejected") {
    return {
      status: "rejected",
      headline: "Dossier non admissible",
      detail: `${blocking.length} alerte(s) bloquante(s) d'admissibilité : aucune analyse financière ne peut être présentée comme fiable tant qu'elles ne sont pas levées.`,
    };
  }
  if (coverage.status === "unqualified") {
    return {
      status: "insufficient_coverage",
      headline: "Couverture non qualifiée",
      detail:
        "Aucun dénominateur qualifié : les écritures ne sont pas dénombrées ou les contrôles sont comptés depuis les constats. L'avancement des contrôles historiques n'établit pas une couverture d'écritures ni d'audit ; aucun verdict d'exploitabilité n'est prononcé.",
    };
  }
  if (coverage.status === "none") {
    return {
      status: "insufficient_coverage",
      headline: "Couverture insuffisante pour conclure",
      detail:
        "Aucune couverture mesurable (écritures ou contrôles). Aucun verdict d'exploitabilité n'est prononcé sans couverture — les chiffres affichés ne décrivent pas le dossier.",
    };
  }
  if (blocking.length > 0) {
    return {
      status: "blocking_open",
      headline: "Alertes bloquantes à traiter",
      detail: `${blocking.length} alerte(s) bloquante(s) restent ouvertes ; les traiter avant toute conclusion.`,
    };
  }
  // 0 constat = rien à arbitrer : la revue est close par vacuité, pas « en
  // cours » (pct vaut 0 par convention sur un dénominateur nul).
  if (review.totalCount > 0 && review.pct < 100) {
    return {
      status: "under_review",
      headline:
        coverage.status === "partial"
          ? "Revue en cours — couverture partielle"
          : "Revue en cours",
      detail: `${review.reviewedCount}/${review.totalCount} constats arbitrés (${review.pct} %).${coverage.status === "partial" ? " La couverture n'est que partielle : les conclusions ne portent que sur la part analysée." : ""}`,
    };
  }
  return {
    status: "reviewed",
    headline:
      coverage.status === "partial"
        ? "Revue close — couverture partielle"
        : "Revue close",
    detail: `Tous les constats sont arbitrés.${coverage.status === "partial" ? " Attention : couverture partielle, le périmètre non analysé reste hors conclusion." : ""}`,
  };
}
