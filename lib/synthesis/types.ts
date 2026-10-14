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

/** `unqualified` : aucun dénominateur qualifié — ni ratio, ni « nulle » présumée. */
export type CoverageStatus = "none" | "partial" | "substantial" | "unqualified";

/**
 * État d'une population de couverture (C03). `missing` : non dénombrée ; `known_empty` :
 * dénombrée à zéro ; `not_applicable` ; `unqualified` : dénominateur non qualifié (compté
 * depuis les constats) ; `untreated` / `partial` / `complete` : dénombrée et traitée à 0 %,
 * entre 0 et 100 %, ou à 100 %.
 */
export type CoveragePopulationStatus = "missing" | "known_empty" | "not_applicable" | "unqualified" | "untreated" | "partial" | "complete";

export interface CoveragePopulation {
  id: "entries" | "controls";
  label: string;
  unit: string;
  status: CoveragePopulationStatus;
  numerator: number;
  /** Dénominateur qualifié, sinon null : aucun ratio n'est calculé sans dénominateur. */
  denominator: number | null;
  /** Ratio à 4 décimales, null sans dénominateur qualifié. */
  ratio: number | null;
  /** Origine du dénominateur ou motif de l'absence de ratio. */
  basis: string;
}

export interface CoverageDimension {
  status: CoverageStatus;
  /** Populations qualifiées séparément : un ratio exige un dénominateur qualifié (C03). */
  populations: CoveragePopulation[];
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
   * Constats de gravité bloquante dont la revue n'est PAS close (dernier
   * événement de revue hors statuts clos — cf. review.byStatus). Distinct de
   * `bySeverity.bloquant`, qui compte tous les bloquants sans regard sur leur
   * statut de revue : un bloquant déjà validé/écarté/corrigé n'est plus un
   * blocage ouvert.
   */
  openBlockingCount: number;
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
  /** Répétition exacte (même identité économique ET même empreinte de contenu) : comptée une fois. */
  exactRepeatRule: "count_once";
  /** Même identité, contenus distincts : succession de versions démontrée (dernière retenue) ou conflit (indéterminé). */
  sameIdentityDistinctContentRule: "version_chain_or_conflict";
  /** Identités distinctes à lignes partiellement communes sans allocation : agrégation indéterminée, bornes et détail conservés. */
  overlapRule: "indeterminate_with_bounds";
  /** Sens opposés dans un même groupe : aucune compensation, indéterminé. */
  oppositeDirectionsRule: "no_netting_indeterminate";
}

export type EffectTarget = "resultat" | "bilan_actif" | "bilan_passif" | "capitaux_propres" | "presentation";
export type EffectDirection = "increase" | "decrease";
export type ClusterStatus = "determined" | "conflict" | "indeterminate";
export type MemberRole = "retained" | "exact_repeat" | "superseded" | "conflicting" | "overlapping";

export interface ExposureClusterMember {
  findingId: string;
  identity: string;
  contentFingerprint: string;
  amountCents: number;
  direction: EffectDirection;
  /** Poste de l'effet porté par ce membre (le pont par poste et sens se lit membre par membre). */
  target: EffectTarget;
  /** Cloison du constat porteur. */
  cloison: CloisonId;
  evaluationVersion: number | null;
  role: MemberRole;
}

/** Étape de revue du représentant d'un groupe déterminé (dernier événement, sinon statut porté). */
export type EffectReviewStage = "dismissed" | "pending" | "proposed" | "corrected";

export interface ExposureClusterView {
  clusterId: string;
  findingIds: string[];
  identities: string[];
  target: EffectTarget;
  direction: EffectDirection | "mixed";
  status: ClusterStatus;
  /** Montant retenu lorsque l'agrégation est déterminée ; null sinon (jamais un maximum présenté comme une somme). */
  retainedCents: number | null;
  /** Bornes de l'effet du groupe : au moins le plus grand membre, au plus la somme des membres (sans compensation). */
  boundsCents: { minCents: number; maxCents: number };
  /** Constat dont le statut de revue gouverne le groupe (représentant retenu), ou null si indéterminé. */
  retainedFindingId: string | null;
  /** Étape de revue du représentant retenu ; null si le groupe n'est pas déterminé. */
  reviewStage: EffectReviewStage | null;
  /** Part comptabilisée du montant retenu (statut corrigé ; sans détail : l'effet entier) ; null sinon. */
  correctedCents: number | null;
  reason?: string;
  members: ExposureClusterMember[];
}

export type AmountStatus = "known" | "partial" | "unknown";

/**
 * Pont de l'effet pour UN poste et UN sens, de la détection à l'anomalie non corrigée.
 * Invariants (centimes) :
 *   détecté − répétitions exactes − versions remplacées − hors agrégat = déterminé ;
 *   déterminé − écarté = initial ; initial = en attente + proposé + corrigé + résiduel.
 * Jamais additionné entre postes ni entre sens.
 */
export interface EffectStage {
  target: EffectTarget;
  direction: EffectDirection;
  /** Effets explicites détectés, avant toute déduplication. */
  detectedCents: number;
  /** Répétitions exactes (même identité, même contenu) : comptées une fois. */
  exactRepeatsCents: number;
  /** Versions d'évaluation remplacées par une succession démontrée. */
  supersededCents: number;
  /** Contenus des groupes en conflit ou à chevauchement : hors agrégat (bornes dans les groupes). */
  undeterminedCents: number;
  /** Groupes déterminés (avant revue). */
  determinedCents: number;
  /** Groupes déterminés écartés en revue. */
  dismissedCents: number;
  /** Exposition initiale déterminée (hors constats écartés). */
  initialCents: number;
  /** Encore en attente d'arbitrage. */
  pendingCents: number;
  /** Ajustement proposé : validé, non encore comptabilisé. */
  proposedCents: number;
  /** Correction comptabilisée (totale ou partielle). */
  correctedCents: number;
  /** Anomalie résiduelle après correction partielle (jamais alimentée par la part corrigée). */
  residualCents: number;
  /** Groupes de ce poste/sens dont l'agrégation est indéterminée (conflit ou chevauchement). */
  indeterminateClusterIds: string[];
}

export interface TaxEffectBlock {
  status: AmountStatus;
  /** Effet d'impôt connu : taux explicite ET qualification fiscale déductible (ou non déductible : 0). */
  knownCents: number;
  knownFindingIds: string[];
  /** Effets d'ajustement dont l'incidence fiscale est inconnue, avec le motif. */
  unknown: { findingId: string; reason: string }[];
}

export interface NetEffectByTarget {
  target: EffectTarget;
  /** Ajustement proposé signé (augmentation +, diminution −), non comptabilisé. */
  proposedSignedCents: number;
  /** Anomalies non corrigées signées : proposé + résiduel après correction partielle. */
  uncorrectedSignedCents: number;
  taxStatus: AmountStatus;
  /** Effet d'impôt connu du poste (sous-ensemble des effets qualifiés). */
  taxKnownCents: number;
  /** Net après impôt connu : null si l'incidence fiscale est inconnue pour au moins un effet du poste. */
  netAfterKnownTaxCents: number | null;
  /** Sous-total partiel, nommé comme tel : net des seuls effets à incidence fiscale connue. */
  partialNetKnownSubsetCents: number;
}

/** Interface réservée à C10 : incidence fiscale incrémentale avant/après par scénario d'IS. */
export interface TaxIncidenceInterface {
  provider: "none" | "c10_is_engine";
  method: "before_after_is_scenario";
  /** Effets d'ajustement en attente d'une incidence calculée par le moteur fiscal. */
  pendingFindingIds: string[];
}

/**
 * Les champs scalaires ci-dessous (brut, répétitions, versions, déterminé, bornes, revu, écarté, en
 * attente) sont des VOLUMES en valeur absolue, tous postes et sens confondus : contrôles de cohérence
 * du pipeline, tracés, jamais présentés comme un montant comptable. Les vues et exports lisent
 * `stages` (par poste et sens) et `netByTarget` (par poste).
 */
export interface ExposureDimension {
  /** Somme brute des effets explicites détectés (avant toute déduplication) — volume, tous postes. */
  grossDetectedExposureCents: number;
  /** Montant des répétitions exactes écartées (même identité et même contenu). */
  exactRepeatsCents: number;
  /** Montant des versions d'évaluation remplacées par une version ultérieure démontrée. */
  supersededVersionsCents: number;
  /** Exposition dédupliquée DÉTERMINÉE : somme des groupes déterminés seulement. */
  determinedExposureCents: number;
  /** Bornes de l'exposition totale incluant les groupes indéterminés. */
  exposureBoundsCents: { minCents: number; maxCents: number };
  aggregationStatus: "determined" | "indeterminate";
  /** Part déterminée dont la revue humaine est close. */
  reviewedExposureCents: number;
  /** Part déterminée portée par des constats ÉCARTÉS. */
  dismissedExposureCents: number;
  /** Part déterminée encore EN ATTENTE de revue. */
  pendingReviewExposureCents: number;
  /** Effets par poste et par sens, par étape ; jamais additionnés entre postes. */
  stages: EffectStage[];
  tax: TaxEffectBlock;
  netByTarget: NetEffectByTarget[];
  taxIncidence: TaxIncidenceInterface;
  /** Groupes d'effets ; un périmètre (cycle, silo, cloison) se lit par `restrictExposure`. */
  clusters: ExposureClusterView[];
  /** Constats SANS effet financier explicite — exclus, jamais présumés. Les signaux EUR y restent. */
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
  | "limited_upload_comparison"
  | "missing_document"
  | "missing_evidence"
  | "control_not_run"
  | "control_inconclusive"
  | "partial_coverage"
  | "coverage_unqualified"
  | "parser_warning"
  | "source_review_required"
  | "exposure_indeterminate"
  | "tax_incidence_unknown"
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
  /** Projection démonstrative verrouillée, jamais assimilée à une validation de production. */
  workpaperProjection?: import("@/lib/workpapers/projection").WorkpaperProjection;
  schemaVersion: string;
  dossierId: string;
  /** Identifiant adressé par contenu: `sha256:<snapshotHash>`. */
  snapshotId: string;
  /** Horodatage injecté (clock) — EXCLU du snapshotHash. */
  generatedAt: string;
  engineVersion: string;
  ruleSetVersion: string;
  referenceSetVersion: string;
  policyVersion: string;
  /** Empreintes des documents sources, triées (stables). */
  sourceDocumentHashes: string[];
  /** Digest canonique de la chaîne append-only des événements de revue. */
  reviewEventsDigest: string;

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
