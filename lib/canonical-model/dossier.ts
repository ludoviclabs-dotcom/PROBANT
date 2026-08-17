
import type { CloisonId } from "./taxonomy";
import type {
  Finding,
  FindingFamily,
  ReconstitutedStatement,
  Severity,
} from "./finding";
import type { FecEntry } from "./fec";

/**
 * Un dossier reprÃ©sente une exÃ©cution d'analyse sur un jeu de comptes
 * (un FEC, un exercice). Il agrÃ¨ge l'Ã©tat financier reconstruit par silo,
 * les constats et les alertes d'admissibilitÃ©.
 */

export interface Societe {
  raisonSociale: string;
  siren: string;
  exercice: string; // ex. "2024"
  dateCloture: string; // AAAAMMJJ
}

/** Vue d'un silo : Ã©tat reconstruit + constats rattachÃ©s. */
export interface SiloView {
  siloId: string;
  statement: ReconstitutedStatement;
  findings: Finding[];
}

export interface Dossier {
  id: string;
  societe: Societe;
  demoMode: boolean;
  fecFingerprint: string;
  referentielVersion: string;
  createdAt: string; // ISO, injectÃ© Ã  la gÃ©nÃ©ration (jamais Date.now() ici)

  /**
   * Alertes bloquantes d'admissibilitÃ© (conformitÃ© d'ingestion FEC).
   * TraitÃ©es en amont de toute analyse financiÃ¨re.
   */
  admissibilite: Finding[];

  /** Vues par silo, contenant l'Ã©tat reconstruit et les constats. */
  silos: SiloView[];
}

/** Origine du snapshot. La persistance durable est reservee a PR-03. */
export type DossierSourceKind = "demo" | "session" | "persistent";

export interface SourceDocumentSummary {
  id: string;
  dossierId: string;
  fileName: string;
  documentType: "fec" | "balance" | "pdf" | "cycle_document" | "demo";
  /** SHA-256 hexadecimal complet du document source. */
  fingerprint: string;
  lineCount?: number;
  pageCount?: number;
  parserVersion?: string;
  /** Localisation logique, sans URL signee ni secret. */
  location?: {
    provider: "s3" | "session" | "demo";
    bucket?: string;
    key: string;
    versionId?: string;
  };
  truncated?: boolean;
  createdAt: string;
}

export type ReviewEventStatus =
  | "pending"
  | "needs_evidence"
  | "confirmed"
  | "dismissed"
  | "corrected"
  | "superseded";

/**
 * Action métier à l'origine d'un événement de revue.
 *
 * Le champ reste optionnel pour préserver la vérification des événements
 * historiques. Les événements fiscaux le renseignent afin de distinguer, par
 * exemple, un écartement d'un marquage non applicable sans réécrire le statut
 * générique ni l'historique.
 */
export type ReviewEventAction =
  | "confirm"
  | "dismiss"
  | "request_evidence"
  | "correct"
  | "replace"
  | "mark_not_applicable"
  | "mark_inconclusive"
  | "attach_evidence";

export interface ReviewEvent {
  id: string;
  /** Présent sur les événements fiscaux pour imposer le cloisonnement tenant. */
  organizationId?: string;
  dossierId: string;
  findingId: string;
  /** Métadonnée couverte par `eventHash`; absente des événements historiques. */
  action?: ReviewEventAction;
  actorId: string;
  actorRole: string;
  previousStatus: ReviewEventStatus;
  newStatus: ReviewEventStatus;
  comment: string;
  relatedEvidenceIds: string[];
  createdAt: string;
  previousEventHash: string | null;
  eventHash: string;
}

export interface CalculationContext {
  entriesTotal: number;
  entriesAnalysed: number;
  controlsEligible: number;
  controlsExecuted: number;
  controlsConcluded: number;
  controlsNotConcluded: number;
  controlsNotApplicable?: number;
  expectedDocumentTypes?: string[];
  cycleIdsEligible?: string[];
  cycleIdsCovered?: string[];
  materialityAmount?: number;
  materialityBasis?: { chiffreAffaires: number };
  scenarioMeta?: {
    label: string;
    secteur: string;
    forme: string;
    exercice: string;
  };
  taxEffectCents?: number;
  notes: string[];
}

/**
 * Projection canonique et immutable d'un dossier a un instant donne.
 * Toutes les pages de restitution doivent consommer cette meme enveloppe.
 */
export interface DossierSnapshot {
  dossier: Dossier;
  sourceDocuments: SourceDocumentSummary[];
  findings: Finding[];
  admissibilityFindings: Finding[];
  reviewEvents: ReviewEvent[];
  calculationContext: CalculationContext;
  snapshotVersion: string;
  snapshotHash: string;
  sourceKind: DossierSourceKind;
  /** Lignes disponibles pour la restitution détaillée de session. */
  ledgerEntries?: FecEntry[];
}

export interface DossierCounts {
  parSeverite: Record<Severity, number>;
  parFamille: Record<FindingFamily, number>;
  parStatut: { en_attente: number; valide: number; ecarte: number };
  bloquantesAdmissibilite: number;
  totalFindings: number;
  /** Incidence potentielle estimÃ©e (somme |Ã©cart EUR|) par cloison. */
  incidenceParCloison: Partial<Record<CloisonId, number>>;
}

export function allFindings(d: Dossier): Finding[] {
  return [...d.admissibilite, ...d.silos.flatMap((s) => s.findings)];
}

export function computeCounts(d: Dossier): DossierCounts {
  const findings = allFindings(d);
  const parSeverite: Record<Severity, number> = {
    bloquant: 0,
    majeur: 0,
    mineur: 0,
    informatif: 0,
  };
  const parFamille: Record<FindingFamily, number> = {
    hardLaw: 0,
    methodology: 0,
    internal: 0,
  };
  const parStatut = { en_attente: 0, valide: 0, ecarte: 0 };
  const incidenceParCloison: Partial<Record<CloisonId, number>> = {};

  for (const f of findings) {
    parSeverite[f.severity]++;
    parFamille[f.family]++;
    parStatut[f.statutRevue]++;
    if (f.mesure.unite === "EUR") {
      const ecart = Math.abs(f.mesure.constate - f.mesure.seuil);
      incidenceParCloison[f.cloison] =
        (incidenceParCloison[f.cloison] ?? 0) + ecart;
    }
  }

  return {
    parSeverite,
    parFamille,
    parStatut,
    bloquantesAdmissibilite: d.admissibilite.length,
    totalFindings: findings.length,
    incidenceParCloison,
  };
}

/** Paquet de revue exportable (PDF/JSON). */
export interface ReviewPack {
  probantVersion: string;
  referentielVersion: string;
  societe: Societe;
  dateExport: string;
  counts: DossierCounts;
  alertesBloquantes: Finding[];
  findingsParCloison: Partial<Record<CloisonId, Finding[]>>;
  decisionsHumaines: {
    findingId: string;
    titre: string;
    statut: string;
    commentaire?: string;
  }[];
}
