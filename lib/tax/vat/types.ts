/**
 * Contrats du moteur de réconciliation TVA (TAX-06).
 *
 * Trois principes structurent ces types :
 *
 * 1. **Le FEC ne confirme rien.** Toute opération reconstruite depuis les
 *    écritures est un `VatTransactionCandidate`, et tout signal porte le suffixe
 *    `_candidate`. Aucune conclusion ne repose sur un numéro de compte seul.
 *
 * 2. **Les taux sont observés, jamais présumés.** Le registre ne publie aucune
 *    source de taux légal de TVA. Un `VatRateBucket` agrège donc un taux
 *    *constaté* (TVA ÷ base) ; le moteur ne déclare jamais qu'un taux est
 *    légalement correct ou incorrect, seulement qu'il est majoritaire ou
 *    atypique dans ce dossier.
 *
 * 3. **La preuve est étagée.** `VatEvidenceTier` matérialise la règle du lot :
 *    FEC seul = signal, FEC + déclaration = réconciliation, + facture = contrôle
 *    renforcé.
 */
import type {
  BasisPoints,
  CentAmount,
  EvidenceStrength,
  TaxControlOutcome,
  TaxLimitation,
  TaxSourceRef,
  TaxTraceStep,
} from "@/lib/canonical-model";
import type { DeclarationReadingIssue } from "../declaration-reading";

/** Régimes TVA couverts par le MVP. Les autres sont bloqués explicitement. */
export type VatRegime = "real_normal" | "mini_real" | "real_simplified";

export type VatFrequency = "monthly" | "quarterly" | "annual";

export type VatDirection = "collected" | "deductible";

/**
 * Couverture normative de la période.
 *
 * La recodification de la TVA dans le code des impositions sur les biens et
 * services au 1er septembre 2026 fait expirer des versions de sources sans
 * successeur publié. Une période qui déborde cette frontière n'est pas traitée
 * avec « la version la plus proche » : elle est déclarée non couverte.
 */
export interface VatNormativeCoverage {
  readonly status: "covered" | "partially_covered" | "not_covered";
  /** Dernier jour effectivement couvert par toutes les sources requises. */
  readonly coveredThroughDate: string | null;
  /** Premier jour non couvert, s'il existe. */
  readonly uncoveredFromDate: string | null;
  readonly expiringSourceVersionIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
}

/**
 * Période déclarative TVA.
 *
 * `TaxPeriod` (TAX-02) reste l'identité canonique et porte `taxType: "vat"` ;
 * `VatPeriod` en est une projection enrichie des faits propres à la TVA
 * (régime, formulaire attendu, couverture normative). Elle ne remplace pas la
 * période canonique : elle la référence par `taxPeriodId`.
 */
export interface VatPeriod {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxPeriodId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly frequency: VatFrequency;
  readonly regime: VatRegime;
  /** Formulaire attendu pour ce régime : `3310-CA3-SD` ou `3517-S-SD`. */
  readonly expectedFormNumber: string;
  readonly formVintage: number;
  readonly normativeCoverage: VatNormativeCoverage;
  readonly canonicalJson: string;
  readonly contentHash: string;
}

/**
 * Signaux portés par une opération candidate.
 *
 * Tous sont suffixés `_candidate` ou décrivent une absence factuelle : aucun
 * n'affirme une infraction.
 */
export type VatTransactionSignal =
  | "missing_piece_reference"
  | "missing_piece_date"
  | "duplicate_piece_candidate"
  | "period_shift_candidate"
  | "reverse_charge_candidate"
  | "unusual_rate_candidate"
  | "rate_not_derivable"
  | "base_not_linked";

/** Qualité du rapprochement base ↔ TVA au sein de l'écriture. */
export type VatLinkage = "same_entry" | "base_only" | "vat_only" | "unresolved";

export interface VatTransactionCandidate {
  readonly id: string;
  readonly direction: VatDirection;
  readonly journalCode: string;
  readonly ecritureNum: string;
  readonly ecritureDate: string;
  readonly pieceRef: string | null;
  readonly pieceDate: string | null;
  readonly baseAmountCents: CentAmount | null;
  readonly vatAmountCents: CentAmount | null;
  /** Taux constaté = TVA ÷ base. `null` si non dérivable. */
  readonly observedRateBasisPoints: BasisPoints | null;
  readonly baseAccounts: readonly string[];
  readonly vatAccounts: readonly string[];
  readonly linkage: VatLinkage;
  readonly signals: readonly VatTransactionSignal[];
  readonly evidenceStrength: EvidenceStrength;
  readonly sourceLineNumbers: readonly number[];
  readonly candidateHash: string;
}

/**
 * Agrégat par taux constaté.
 *
 * `status` qualifie la place du taux **dans ce dossier**, pas sa légalité :
 * `dominant` (part majoritaire), `secondary`, `outlier` (part marginale, à
 * examiner), `unresolved` (taux non dérivable).
 */
export interface VatRateBucket {
  readonly key: string;
  readonly direction: VatDirection;
  readonly rateBasisPoints: BasisPoints | null;
  readonly label: string;
  /** `null` lorsque aucune base HT n'est rattachable au bucket. */
  readonly baseAmountCents: CentAmount | null;
  readonly vatAccountedCents: CentAmount;
  /** base × taux constaté, arrondi au centime. */
  readonly vatTheoreticalCents: CentAmount | null;
  readonly differenceCents: CentAmount | null;
  readonly transactionCount: number;
  readonly transactionIds: readonly string[];
  readonly shareOfBaseBasisPoints: BasisPoints;
  readonly status: "dominant" | "secondary" | "outlier" | "unresolved";
}

export interface VatDeclarationBox {
  readonly code: string;
  readonly label: string;
  readonly amountCents: CentAmount;
  readonly snapshotId: string;
  readonly contentHash: string;
}

/**
 * Lecture normalisée d'une CA3 ou d'une CA12.
 *
 * `status: "absent"` est une information de plein droit : elle n'est jamais
 * assimilée à une déclaration à zéro.
 */
export interface VatDeclarationSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly vatPeriodId: string;
  readonly formNumber: string;
  readonly formVintage: number;
  readonly regime: VatRegime;
  readonly status: "available" | "absent" | "unreadable";
  readonly boxes: readonly VatDeclarationBox[];
  readonly grossVatCents: CentAmount | null;
  readonly deductibleVatCents: CentAmount | null;
  readonly netDueCents: CentAmount | null;
  readonly creditCents: CentAmount | null;
  readonly creditCarriedForwardCents: CentAmount | null;
  /**
   * Base HT au taux normal (CA3 case 08). Le millésime publié n'expose aucune
   * case de base pour les autres taux : la ventilation déclarée reste partielle.
   */
  readonly normalRateBaseCents: CentAmount | null;
  readonly issues: readonly DeclarationReadingIssue[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}

/**
 * Niveau de preuve atteint par un contrôle, au sens des règles du lot :
 * FEC seul = signal ou estimation ; FEC + déclaration = réconciliation ;
 * FEC + déclaration + facture = contrôle renforcé.
 */
export type VatEvidenceTier =
  | "ledger_only"
  | "ledger_and_declaration"
  | "ledger_declaration_and_invoice"
  | "insufficient";

export interface VatControlResult {
  readonly controlId: string;
  readonly title: string;
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly evidenceTier: VatEvidenceTier;
  readonly detail: string;
  readonly observedCents: CentAmount | null;
  readonly comparedCents: CentAmount | null;
  readonly differenceCents: CentAmount | null;
  readonly reconciliationLineIds: readonly string[];
  readonly limitationIds: readonly string[];
  readonly transactionIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly resultHash: string;
}

// -- Jeux de données de visualisation ---------------------------------------

export interface VatSalesByRateDataset {
  readonly buckets: readonly VatRateBucket[];
  readonly totalBaseCents: CentAmount | null;
  readonly currency: "EUR";
}

export interface VatComparisonRow {
  readonly key: string;
  readonly label: string;
  readonly theoreticalCents: CentAmount | null;
  readonly accountedCents: CentAmount | null;
  readonly declaredCents: CentAmount | null;
}

export interface VatComparisonDataset {
  readonly rows: readonly VatComparisonRow[];
  readonly currency: "EUR";
}

export type VatWaterfallStepCode =
  | "vat_collected"
  | "vat_deductible"
  | "vat_net_before_credit"
  | "credit_carried_forward"
  | "vat_net_due"
  | "vat_credit_to_carry";

export interface VatWaterfallStep {
  readonly code: VatWaterfallStepCode;
  readonly label: string;
  readonly order: number;
  readonly kind: "base" | "delta" | "subtotal" | "total";
  readonly sign: "positive" | "negative" | "neutral";
  readonly deltaCents: CentAmount;
  readonly runningTotalCents: CentAmount;
  readonly status: "computed" | "declared" | "unavailable";
}

export interface VatWaterfallDataset {
  readonly steps: readonly VatWaterfallStep[];
  readonly currency: "EUR";
}

export interface VatTimelineEntry {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly frequency: VatFrequency;
  readonly collectedAccountedCents: CentAmount;
  readonly deductibleAccountedCents: CentAmount;
  readonly declaredNetCents: CentAmount | null;
  readonly status: "reconciled" | "difference" | "declaration_absent";
}

export interface VatTimelineDataset {
  readonly entries: readonly VatTimelineEntry[];
  readonly currency: "EUR";
}

export interface VatMissingPieceCell {
  readonly transactionId: string;
  readonly direction: VatDirection;
  readonly ecritureDate: string;
  readonly journalCode: string;
  readonly pieceRef: string | null;
  readonly missingSignals: readonly VatTransactionSignal[];
  readonly vatAmountCents: CentAmount | null;
}

export interface VatMissingPieceMatrixDataset {
  readonly cells: readonly VatMissingPieceCell[];
  readonly signalCounts: Readonly<Partial<Record<VatTransactionSignal, number>>>;
}

export interface VatDatasets {
  readonly salesByRate: VatSalesByRateDataset;
  readonly comparison: VatComparisonDataset;
  readonly netWaterfall: VatWaterfallDataset;
  readonly timeline: VatTimelineDataset;
  readonly missingPieces: VatMissingPieceMatrixDataset;
}

// -- Sortie principale -------------------------------------------------------

export interface VatReconciliationSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly vatPeriodId: string;
  readonly taxPeriodId: string;
  readonly taxType: "vat";
  readonly regime: VatRegime;
  readonly frequency: VatFrequency;
  readonly engineVersion: string;
  readonly calculationVersion: string;
  readonly status: "reconciled" | "blocked";

  readonly period: VatPeriod;
  readonly declaration: VatDeclarationSnapshot;
  readonly transactionCandidates: readonly VatTransactionCandidate[];
  readonly rateBuckets: readonly VatRateBucket[];

  readonly collectedAccountedCents: CentAmount;
  readonly deductibleAccountedCents: CentAmount;
  readonly collectedTheoreticalCents: CentAmount | null;
  readonly netAccountedCents: CentAmount;
  readonly netDeclaredCents: CentAmount | null;

  readonly controls: readonly VatControlResult[];
  readonly reconciliationLineIds: readonly string[];
  readonly datasets: VatDatasets;

  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly evidenceTier: VatEvidenceTier;
  readonly limitations: readonly TaxLimitation[];
  readonly notes: readonly VatNote[];
  readonly trace: readonly TaxTraceStep[];
  readonly sourceRefs: readonly TaxSourceRef[];

  readonly createdAt: string;
  readonly createdBy: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}

export type VatNoteKind = "method" | "limitation" | "difference" | "prudence";

export interface VatNote {
  readonly id: string;
  readonly code: string;
  readonly kind: VatNoteKind;
  readonly message: string;
  readonly relatedControlIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly noteHash: string;
}
