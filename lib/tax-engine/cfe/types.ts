/**
 * Contrats du module CFE (TAX-07-CFE).
 *
 * Ce module **ne calcule pas la CFE**. Le registre ne publie ni base locative,
 * ni taux communal, ni délibération : aucune cotisation n'est recalculable et le
 * lot l'interdit explicitement. Il rapproche.
 *
 * L'avis est donc une **donnée d'entrée** — importée d'un document ou saisie par
 * une personne — et non un résultat. Tout ce que le moteur produit est la
 * confrontation de cet avis avec la charge comptabilisée, les règlements, les
 * établissements du profil et la période.
 */
import type {
  CentAmount,
  EvidenceStrength,
  TaxControlOutcome,
  TaxLimitation,
  TaxSourceRef,
  TaxTraceStep,
} from "@/lib/canonical-model";
import type { SourceCoverage } from "@/lib/tax/source-coverage";

/**
 * Origine de l'avis. Le lot autorise deux voies : « importer ou saisir l'avis ».
 * Aucune troisième voie — en particulier, aucun avis reconstitué par calcul.
 */
export type CfeNoticeProvenance = "imported_document" | "manual_entry";

export interface CfeNoticeLine {
  readonly code: string;
  readonly label: string;
  readonly amountCents: CentAmount;
}

export interface CfeNotice {
  readonly id: string;
  readonly establishmentId: string;
  readonly taxYear: number;
  readonly periodStartDate: string;
  readonly periodEndDate: string;
  readonly lines: readonly CfeNoticeLine[];
  /** `null` lorsque le total de l'avis n'a pas pu être lu : valeur inconnue. */
  readonly totalDueCents: CentAmount | null;
  readonly provenance: CfeNoticeProvenance;
  /** Obligatoire pour un avis importé, `null` pour une saisie. */
  readonly sourceDocumentId: string | null;
  /** Qui a importé ou saisi : un avis n'entre jamais sans porteur. */
  readonly capturedBy: string;
  readonly capturedAt: string;
  readonly noticeHash: string;
}

/**
 * Préfixes du plan comptable général. Ils *repèrent* des écritures et ne
 * concluent rien ; ils sont injectables pour un plan atypique.
 */
export interface CfeAccountMap {
  readonly chargeAccountPrefixes: readonly string[];
  readonly liabilityAccountPrefixes: readonly string[];
  readonly settlementAccountPrefixes: readonly string[];
}

export type CfeLedgerRole = "charge" | "settlement" | "liability";

export interface CfeLedgerCandidate {
  readonly id: string;
  readonly role: CfeLedgerRole;
  readonly journalCode: string;
  readonly ecritureNum: string;
  readonly ecritureDate: string;
  readonly pieceRef: string | null;
  readonly accountNumber: string;
  readonly amountCents: CentAmount;
  readonly sourceLineNumbers: readonly number[];
  readonly evidenceStrength: EvidenceStrength;
  readonly candidateHash: string;
}

export interface CfeLedgerPosition {
  readonly chargeCents: CentAmount;
  readonly settlementCents: CentAmount;
  readonly liabilityBalanceCents: CentAmount;
  readonly candidates: readonly CfeLedgerCandidate[];
}

export type CfeExemptionStatus = "none" | "claimed" | "unknown";

export type CfeApplicabilityStatus = "applicable" | "not_applicable" | "unknown";

export interface CfeApplicability {
  readonly status: CfeApplicabilityStatus;
  readonly exemptionStatus: CfeExemptionStatus;
  readonly frenchEstablishmentIds: readonly string[];
  readonly unverifiedEstablishmentIds: readonly string[];
  /** Couverture de la période par la doctrine CFE publiée. */
  readonly sourceCoverage: SourceCoverage;
  readonly reasons: readonly string[];
}

/**
 * Capacité réellement atteinte par le module sur ce dossier.
 *
 * `reconcile` est le maximum du lot : `compute` n'est jamais atteignable sans
 * base locative ni taux local, et le module ne le revendique pas.
 */
export type CfeCapability = "reconcile" | "recommend_review" | "blocked";

export interface CfeControlResult {
  readonly controlId: string;
  readonly title: string;
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly detail: string;
  readonly observedCents: CentAmount | null;
  readonly comparedCents: CentAmount | null;
  readonly differenceCents: CentAmount | null;
  readonly toleranceCents: CentAmount;
  readonly reconciliationLineIds: readonly string[];
  readonly limitationIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly resultHash: string;
}

export type CfeNoteKind = "method" | "limitation" | "difference" | "prudence";

export interface CfeNote {
  readonly id: string;
  readonly code: string;
  readonly kind: CfeNoteKind;
  readonly message: string;
  readonly relatedControlIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly noteHash: string;
}

export interface CfeEstablishmentComparison {
  readonly establishmentId: string;
  readonly inProfile: boolean;
  readonly inNotices: boolean;
  readonly municipality: string | null;
  readonly verificationStatus: "verified" | "unverified" | "unknown" | "absent";
  readonly noticeTotalCents: CentAmount | null;
}

export interface CfeReconciliationSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly taxPeriodId: string;
  readonly taxType: "cfe";
  readonly taxYear: number;
  readonly engineVersion: string;
  readonly calculationVersion: string;
  readonly status: "reconciled" | "blocked";
  /** Ce que le module a réellement fait, exposé sans ambiguïté. */
  readonly capability: CfeCapability;

  readonly applicability: CfeApplicability;
  readonly notices: readonly CfeNotice[];
  readonly noticeTotalCents: CentAmount | null;
  readonly ledger: CfeLedgerPosition;
  readonly establishmentComparisons: readonly CfeEstablishmentComparison[];

  readonly controls: readonly CfeControlResult[];
  readonly reconciliationLineIds: readonly string[];
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly limitations: readonly TaxLimitation[];
  readonly notes: readonly CfeNote[];
  readonly trace: readonly TaxTraceStep[];
  readonly sourceRefs: readonly TaxSourceRef[];

  readonly createdAt: string;
  readonly createdBy: string;
  readonly canonicalJson: string;
  readonly snapshotHash: string;
}
