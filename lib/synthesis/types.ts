/**
 * Modèle du SynthesisSnapshot — la sortie unique du moteur de Synthèse.
 *
 * Cinq dimensions indépendantes (admissibility, coverage, risk, exposure,
 * review) : AUCUN score composite n'en fait la synthèse. Le « verdict » est
 * catégoriel et dérivé de règles explicites tracées — jamais d'un indice
 * agrégé. L'indice heuristique historique survit uniquement comme signal
 * subordonné (`risk.heuristicSeverityIndex`), marqué comme tel.
 *
 * Tout montant est en centimes entiers. Toute valeur affichée par la page
 * Synthèse doit provenir de ce snapshot — le composant React n'est plus le
 * moteur métier.
 */

import type {
  FindingFamily,
  Severity,
} from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";

/* ─────────────────────────────── Trace de calcul ─────────────────────────── */

/** Trace d'un KPI : d'où vient chaque chiffre, ce qui en a été exclu. */
export interface CalculationTraceEntry {
  metricId: string;
  formulaId: string;
  formulaVersion: string;
  /** Références des entrées (ids de constats, compteurs, clés de contexte). */
  inputs: Record<string, string | number | string[]>;
  /** Éléments écartés du calcul, avec la raison — jamais d'exclusion muette. */
  excludedItems: { id: string; reason: string }[];
  output: number | string;
  unit: "cents" | "count" | "pct" | "ratio" | "index" | "status";
  /** Politique d'arrondi appliquée (`none` si aucune). */
  rounding: string;
  explanation: string;
}

/* ─────────────────────────────── Dimensions ──────────────────────────────── */

export type AdmissibilityStatus = "admissible" | "admissible_with_alerts" | "rejected";

export interface AdmissibilityDimension {
  status: AdmissibilityStatus;
  blockingCount: number;
  alertFindingIds: string[];
}

export type CoverageStatus = "none" | "partial" | "substantial";

export interface CoverageDimension {
  status: CoverageStatus;
  entriesTotal: number;
  entriesAnalysed: number;
  controlsEligible: number;
  controlsExecuted: number;
  controlsConcluded: number;
  controlsNotConcluded: number;
  /** Ratio d'écritures analysées, 4 décimales (arrondi tracé). */
  entriesRatio: number;
  /** Ratio de contrôles conclus parmi les éligibles, 4 décimales. */
  controlsRatio: number;
  documentsPresent: number;
}

export interface RiskDimension {
  bySeverity: Record<Severity, number>;
  byFamily: Record<FindingFamily, number>;
  /** Matrice cloison × gravité (comptes de constats). */
  matrix: Partial<Record<CloisonId, Record<Severity, number>>>;
  totalFindings: number;
  /**
   * Indice heuristique historique (poids 25/8/2/0.5, saturation /(W+52)).
   * SUBORDONNÉ : jamais utilisé pour le verdict. Conservé pour continuité
   * visuelle, marqué heuristique, tracé comme les autres KPI.
   */
  heuristicSeverityIndex: number;
  heuristicSeverityIndexIsVerdict: false;
}

/** Politique d'agrégation appliquée aux clusters d'effets qui se recouvrent. */
export interface AggregationPolicy {
  policyId: string;
  version: string;
  /** Règle appliquée à un cluster cohérent : montant maximal retenu. */
  coherentClusterRule: "max_magnitude";
  /** Règle appliquée à un cluster ambigu : conservateur + revue requise. */
  ambiguousClusterRule: "max_magnitude_and_review_required";
}

export interface ExposureClusterView {
  clusterId: string;
  findingIds: string[];
  effectKeys: string[];
  retainedCents: number;
  ambiguous: boolean;
  ambiguityReason?: string;
}

export interface ExposureDimension {
  /** Somme brute des effets explicites détectés (avant déduplication). */
  grossDetectedExposureCents: number;
  /** Après déduplication exacte + agrégation par cluster. */
  deduplicatedExposureCents: number;
  /** Part de l'exposition dédupliquée dont la revue humaine est close. */
  reviewedExposureCents: number;
  /** Somme signée des effets des constats VALIDÉS (ajustement proposé). */
  validatedAdjustmentCents: number;
  /** Effet d'impôt sur l'ajustement validé (taux explicites uniquement). */
  taxEffectCents: number;
  /** Effet net sur les états financiers : ajustement validé − effet d'impôt. */
  netFinancialStatementEffectCents: number;
  /** Exposition dédupliquée ventilée par cloison. */
  byCloison: Partial<Record<CloisonId, number>>;
  clusters: ExposureClusterView[];
  /** Constats SANS effet financier explicite — exclus, jamais présumés. */
  findingsWithoutEffect: string[];
  policy: AggregationPolicy;
}

export interface ReviewDimension {
  reviewedCount: number;
  totalCount: number;
  pct: number;
  byStatus: Record<string, number>;
}

/* ────────────────────────────── Autres blocs ─────────────────────────────── */

export type LimitationCode =
  | "missing_document"
  | "control_not_run"
  | "control_inconclusive"
  | "partial_coverage"
  | "parser_warning"
  | "source_review_required"
  | "internal_threshold"
  | "unsupported_format";

export interface Limitation {
  code: LimitationCode;
  message: string;
  /** Éléments concernés (ids de constats, de documents, de clusters). */
  subjects: string[];
}

export interface EvidenceBlock {
  /** Empreintes des documents sources, triées par id de document. */
  sourceDocuments: { id: string; fileName: string; fingerprint: string }[];
  /** Constats dont la chaîne de preuve est vide. */
  findingsWithoutEvidenceChain: string[];
}

export type VerdictStatus =
  | "rejected"
  | "insufficient_coverage"
  | "blocking_open"
  | "under_review"
  | "reviewed";

/**
 * Verdict CATÉGORIEL — dérivé d'admissibility, coverage et review par des
 * règles explicites (voir engine.ts), jamais d'un score. En particulier :
 * aucun dossier ne peut être déclaré exploitable si la couverture n'est pas
 * au moins partielle — c'est la fin du « exploitable » inconditionnel.
 */
export interface Verdict {
  status: VerdictStatus;
  headline: string;
  detail: string;
}

/* ─────────────────────────────── Snapshot ────────────────────────────────── */

export interface SynthesisSnapshot {
  schemaVersion: string;
  dossierId: string;
  /** Horodatage injecté (clock) — EXCLU du snapshotHash. */
  generatedAt: string;
  engineVersion: string;
  ruleSetVersion: string;
  referenceSetVersion: string;
  policyVersion: string;
  /** Empreintes des documents sources, triées (stables). */
  sourceDocumentHashes: string[];

  admissibility: AdmissibilityDimension;
  coverage: CoverageDimension;
  risk: RiskDimension;
  exposure: ExposureDimension;
  review: ReviewDimension;
  evidence: EvidenceBlock;
  limitations: Limitation[];
  verdict: Verdict;

  calculationTrace: CalculationTraceEntry[];

  /**
   * SHA-256 du JSON canonique du snapshot SANS `generatedAt` ni `snapshotHash`
   * lui-même : deux exécutions sur les mêmes données — même dans un ordre
   * d'entrée différent — produisent le même hash.
   */
  snapshotHash: string;
}
