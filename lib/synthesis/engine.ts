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
import { statusAfterReviewEvents } from "@/lib/dossier/review";
import { canonicalJson, sha256Hex } from "./canonical";
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
  EvidenceBlock,
  ExposureDimension,
  Limitation,
  ReviewDimension,
  RiskDimension,
  SynthesisSnapshot,
  Verdict,
} from "./types";

export const SYNTHESIS_SCHEMA_VERSION = "1.0.0";
export const SYNTHESIS_ENGINE_VERSION = "1.0.0";
export const SYNTHESIS_POLICY_VERSION = "1.0.0";

/**
 * Seuils de la politique de couverture. Bornes exactes documentées :
 * ratio ≥ SUBSTANTIAL_MIN ⇒ substantial ; 0 < ratio < SUBSTANTIAL_MIN ⇒
 * partial ; ratio = 0 (ou aucune écriture ET aucun contrôle) ⇒ none.
 */
export const COVERAGE_SUBSTANTIAL_MIN = 0.95;

/** Statuts de revue considérés comme clos (alignés sur lib/dossier/review). */
const CLOSED_REVIEW = new Set([
  "valide", "ecarte", "corrige", "confirmed", "dismissed", "corrected", "superseded",
]);
/** Statuts valant validation d'un ajustement. */
const VALIDATED_REVIEW = new Set(["valide", "corrige", "confirmed", "corrected"]);

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
  const findings = [...input.findings].sort((a, b) => a.id.localeCompare(b.id));
  const admissibilityFindings = [...input.admissibilityFindings].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const sourceDocuments = [...input.sourceDocuments].sort((a, b) =>
    a.id.localeCompare(b.id),
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
  const entriesRatio =
    ctx.entriesTotal > 0 ? round4(ctx.entriesAnalysed / ctx.entriesTotal) : 0;
  const controlsRatio =
    ctx.controlsEligible > 0 ? round4(ctx.controlsConcluded / ctx.controlsEligible) : 0;
  // Le ratio directeur est le plus faible des deux : on ne couvre pas mieux
  // que sa pire dimension.
  const governingRatio = Math.min(
    ctx.entriesTotal > 0 ? entriesRatio : controlsRatio,
    ctx.controlsEligible > 0 ? controlsRatio : entriesRatio,
  );
  const coverage: CoverageDimension = {
    status:
      governingRatio >= COVERAGE_SUBSTANTIAL_MIN
        ? "substantial"
        : governingRatio > 0
          ? "partial"
          : "none",
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
      substantialMin: COVERAGE_SUBSTANTIAL_MIN,
    },
    excludedItems: [],
    output: coverage.status,
    unit: "status",
    rounding: "ratios arrondis à 4 décimales",
    explanation: `min(ratio écritures, ratio contrôles conclus) ; substantial si ≥ ${COVERAGE_SUBSTANTIAL_MIN}, partial si > 0, none sinon.`,
  });

  /* ── 3. Risk ───────────────────────────────────────────────────────────── */
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<FindingFamily, number>;
  const matrix: Partial<Record<CloisonId, Record<Severity, number>>> = {};
  let weighted = 0;
  for (const f of findings) {
    bySeverity[f.severity]++;
    byFamily[f.family]++;
    weighted += HEURISTIC_WEIGHTS[f.severity];
    const row =
      matrix[f.cloison] ??
      (matrix[f.cloison] = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>);
    row[f.severity]++;
  }
  const heuristicSeverityIndex = Math.round(
    (100 * weighted) / (weighted + HEURISTIC_SATURATION),
  );
  const risk: RiskDimension = {
    bySeverity,
    byFamily,
    matrix,
    totalFindings: findings.length,
    heuristicSeverityIndex,
    heuristicSeverityIndexIsVerdict: false,
  };
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

  /* ── 4. Exposure ───────────────────────────────────────────────────────── */
  const { records, withoutEffect } = collectEffects(findings, input.dossier.fecFingerprint);
  const dedup = deduplicateEffects(records);

  const statusOf = new Map<string, string>(
    findings.map((f) => [f.id, statusAfterReviewEvents(f, input.reviewEvents)]),
  );

  // Exposition revue : clusters dont TOUS les membres ont une revue close.
  // Ventilation complémentaire du montant retenu de chaque cluster selon le
  // statut de revue du constat RETENU : écarté / en attente. Ces agrégats
  // alimentent le waterfall d'exposition — l'UI ne recalcule rien.
  const reviewedParts: number[] = [];
  const dismissedParts: number[] = [];
  const pendingParts: number[] = [];
  const DISMISSED_REVIEW = new Set(["ecarte", "dismissed"]);
  for (const cluster of dedup.clusters) {
    const allClosed = cluster.findingIds.every((id) =>
      CLOSED_REVIEW.has(statusOf.get(id) ?? "en_attente"),
    );
    if (allClosed) reviewedParts.push(cluster.retainedCents);
    // Le montant retenu du cluster suit le statut de son constat retenu
    // (premier findingId du cluster trié = représentant max_magnitude n'est
    // pas garanti premier ; on retrouve le retenu par son montant).
    const retainedId =
      cluster.findingIds.length === 1
        ? cluster.findingIds[0]
        : cluster.findingIds.find((id) => {
            const r = records.find((x) => x.findingId === id);
            return r?.effect.amountCents === cluster.retainedCents;
          }) ?? cluster.findingIds[0];
    const st = statusOf.get(retainedId) ?? "en_attente";
    if (DISMISSED_REVIEW.has(st)) dismissedParts.push(cluster.retainedCents);
    else if (!CLOSED_REVIEW.has(st)) pendingParts.push(cluster.retainedCents);
  }

  // Ajustement validé : somme SIGNÉE des effets des constats validés
  // (les doublons exacts écartés à l'étape 1 ne comptent pas deux fois).
  const excludedIds = new Set(dedup.excluded.map((e) => e.id));
  const validatedRecords = records.filter(
    (r) => VALIDATED_REVIEW.has(statusOf.get(r.findingId) ?? "") && !excludedIds.has(r.findingId),
  );
  const validatedAdjustmentCents = sumCents(
    validatedRecords.map((r) =>
      r.effect.direction === "decrease" ? -r.effect.amountCents : r.effect.amountCents,
    ),
    "ajustement validé",
  );

  // Effet d'impôt : uniquement sur taux EXPLICITES. Un effet validé sans taux
  // génère une limitation — jamais un taux implicite.
  const withRate = validatedRecords.filter((r) => r.effect.taxRatePct !== undefined);
  const withoutRate = validatedRecords.filter((r) => r.effect.taxRatePct === undefined);
  const taxEffectCents = sumCents(
    withRate.map((r) =>
      applyRatePct(
        r.effect.direction === "decrease" ? -r.effect.amountCents : r.effect.amountCents,
        r.effect.taxRatePct as number,
      ),
    ),
    "effet d'impôt",
  );

  const exposure: ExposureDimension = {
    grossDetectedExposureCents: dedup.grossCents,
    deduplicatedExposureCents: dedup.deduplicatedCents,
    reviewedExposureCents: sumCents(reviewedParts, "exposition revue"),
    dismissedExposureCents: sumCents(dismissedParts, "exposition écartée"),
    pendingReviewExposureCents: sumCents(pendingParts, "exposition en attente"),
    validatedAdjustmentCents,
    taxEffectCents,
    netFinancialStatementEffectCents: validatedAdjustmentCents - taxEffectCents,
    byCloison: dedup.byCloison,
    clusters: dedup.clusters,
    findingsWithoutEffect: withoutEffect,
    policy: AGGREGATION_POLICY,
  };
  trace.push({
    metricId: "exposure.deduplicatedExposureCents",
    formulaId: "exposure-dedup-pipeline",
    formulaVersion: AGGREGATION_POLICY.version,
    inputs: {
      effectsCollected: records.length,
      clusters: dedup.clusters.length,
      grossCents: dedup.grossCents,
    },
    excludedItems: [
      ...withoutEffect.map((id) => ({
        id,
        reason: "aucun financialEffect explicite — l'écart mesuré n'est pas présumé être un impact comptable",
      })),
      ...dedup.excluded,
    ],
    output: dedup.deduplicatedCents,
    unit: "cents",
    rounding: "aucun (centimes entiers de bout en bout)",
    explanation:
      "Somme des montants retenus par cluster après déduplication exacte puis agrégation max_magnitude ; clusters ambigus inclus de façon conservatrice et marqués review_required.",
  });
  trace.push({
    metricId: "exposure.netFinancialStatementEffectCents",
    formulaId: "net-effect",
    formulaVersion: "1.0.0",
    inputs: {
      validatedAdjustmentCents,
      taxEffectCents,
      validatedFindings: validatedRecords.map((r) => r.findingId),
    },
    excludedItems: withoutRate.map((r) => ({
      id: r.findingId,
      reason: "effet validé sans taux d'impôt explicite — effet d'impôt non calculé",
    })),
    output: validatedAdjustmentCents - taxEffectCents,
    unit: "cents",
    rounding: "effet d'impôt arrondi au centime par effet (applyRatePct)",
    explanation:
      "Ajustement validé (somme signée : increase = +, decrease = −) diminué de l'effet d'impôt calculé sur les seuls taux explicites.",
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

  /* ── Limitations ───────────────────────────────────────────────────────── */
  const expected = ctx.expectedDocumentTypes ?? [];
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
      message: `${ctx.controlsNotConcluded} contrôle(s) exécuté(s) sans conclusion.`,
      subjects: [],
    });
  }
  if (coverage.status !== "substantial") {
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
    if (cluster.ambiguous) {
      limitations.push({
        code: "source_review_required",
        message: `Cluster d'exposition ambigu (${cluster.ambiguityReason}) : contribution conservatrice retenue, arbitrage humain requis.`,
        subjects: cluster.findingIds,
      });
    }
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
    admissibility,
    coverage,
    risk,
    exposure,
    review,
    evidence,
    limitations,
    verdict,
    calculationTrace: trace,
  };

  // Le hash couvre le CONTENU, pas l'horodatage : deux générations des mêmes
  // données à des instants différents portent le même hash.
  const snapshotHash = sha256Hex(canonicalJson(body));

  return { ...body, generatedAt: options.clock(), snapshotHash };
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
