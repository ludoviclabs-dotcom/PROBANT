/**
 * Modèle de données « Audit Normatif 360 » — base de connaissance normative
 * des cycles d'audit financier.
 *
 * Ce module est INDÉPENDANT du moteur de constat FEC de PROBANT
 * (lib/canonical-model, lib/rules-engine). Il ne décrit pas des anomalies
 * détectées dans un FEC, mais le référentiel normatif applicable à chaque
 * cycle d'audit : normes, seuils, ratios, procédures, risques.
 *
 * Règle de fiabilité fondamentale : aucune exigence ne doit être inventée.
 * Chaque élément porte un `NormativeStatus` qui distingue ce qui est
 * obligatoire de ce qui relève de la pratique ou du jugement professionnel.
 */

import type { CloisonId } from "@/lib/canonical-model";

/**
 * Statut normatif d'un élément du référentiel.
 *
 * DISTINCT de `FindingFamily` (hardLaw/methodology/internal), qui qualifie
 * la nature d'un constat produit par le moteur FEC. Ici on qualifie la force
 * normative d'une information de la base de connaissance.
 *
 * - OBLIGATOIRE    : exigence issue d'une norme, loi, règlement ou texte officiel.
 * - RECOMMANDE     : guide professionnel, doctrine, pratique reconnue, non obligatoire.
 * - BONNE_PRATIQUE : pratique d'audit usuelle (notamment Big Four), sans force normative.
 * - PARAMETRABLE   : seuil/ratio/borne dépendant du jugement, du secteur ou du risque.
 * - A_VALIDER      : information présente mais nécessitant revue humaine / source manquante.
 */
export type NormativeStatus =
  | "OBLIGATOIRE"
  | "RECOMMANDE"
  | "BONNE_PRATIQUE"
  | "PARAMETRABLE"
  | "A_VALIDER";

export const NORMATIVE_STATUSES: NormativeStatus[] = [
  "OBLIGATOIRE",
  "RECOMMANDE",
  "BONNE_PRATIQUE",
  "PARAMETRABLE",
  "A_VALIDER",
];

/**
 * Type d'une source officielle.
 */
export type SourceType =
  | "ISA"
  | "NEP"
  | "IFRS"
  | "IAS"
  | "PCG"
  | "EU_DIRECTIVE"
  | "EU_REGULATION"
  | "CODE_COMMERCE"
  | "CGI"
  | "AFA"
  | "CNCC"
  | "H3C_H2A"
  | "ANC"
  | "OTHER_OFFICIAL";

/**
 * Famille de rattachement d'un cycle d'audit.
 */
export type CycleFamily =
  | "ACTIF_IMMOBILISE"
  | "ACTIF_CIRCULANT"
  | "TRESORERIE"
  | "CAPITAUX_PROPRES_FINANCEMENT"
  | "PASSIF_ENGAGEMENTS"
  | "COMPTE_RESULTAT"
  | "TRANSVERSAL";

export const CYCLE_FAMILIES: { id: CycleFamily; label: string; short: string }[] = [
  { id: "ACTIF_IMMOBILISE", label: "Actif immobilisé", short: "Immobilisé" },
  { id: "ACTIF_CIRCULANT", label: "Actif circulant", short: "Circulant" },
  { id: "TRESORERIE", label: "Trésorerie & équivalents", short: "Trésorerie" },
  {
    id: "CAPITAUX_PROPRES_FINANCEMENT",
    label: "Capitaux propres & financement",
    short: "Financement",
  },
  {
    id: "PASSIF_ENGAGEMENTS",
    label: "Passif & engagements hors bilan",
    short: "Passif",
  },
  { id: "COMPTE_RESULTAT", label: "Compte de résultat", short: "Résultat" },
  { id: "TRANSVERSAL", label: "Cycles transversaux", short: "Transversal" },
];

/**
 * Catégorie d'un risque dans la matrice des risques.
 */
export type RiskCategory = "RISQUE_INHERENT" | "RISQUE_CONTROLE" | "RISQUE_FRAUDE";

/**
 * Assertions d'audit standard (ISA 315).
 */
export type AuditAssertion =
  | "Existence"
  | "Exhaustivité"
  | "Exactitude"
  | "Évaluation"
  | "Droits et obligations"
  | "Présentation"
  | "Rattachement";

/**
 * Statut de revue du contenu d'un cycle (indépendant du NormativeStatus).
 */
export type ReviewStatus = "DRAFT" | "REVIEW_REQUIRED" | "VALIDATED";

/**
 * Référence à une source officielle, telle qu'utilisée dans une fiche cycle.
 * `id` pointe vers une entrée du registre central (data/sources/*.yml).
 */
export interface SourceReference {
  id: string;
  label: string;
  type?: SourceType;
  url?: string;
  paragraph?: string;
  article?: string;
  status: NormativeStatus;
  note?: string;
}

/**
 * Bloc de matérialité — toutes les plages chiffrées doivent être BONNE_PRATIQUE.
 */
export interface MaterialityBlock {
  benchmark?: string;
  formula: string;
  recommendedRange: string;
  status: NormativeStatus;
  sourceIds: string[];
  caveat: string;
}

export interface MaterialityGuidance {
  globalMateriality: MaterialityBlock;
  performanceMateriality: MaterialityBlock;
  clearlyTrivialThreshold: MaterialityBlock;
}

/**
 * Ratio analytique avec borne d'alerte indicative.
 */
export interface Ratio {
  name: string;
  formula: string;
  alertThreshold: string;
  interpretation: string;
  status: NormativeStatus;
  sourceIds: string[];
  caveat?: string;
}

/**
 * Procédure analytique de revue (ISA 520 / NEP 520).
 */
export interface AnalyticalProcedure {
  name: string;
  objective: string;
  method: string;
  expectedVariation: string;
  anomalyTrigger: string;
  benchmark: string[];
  assertions: AuditAssertion[];
  sourceIds: string[];
}

/**
 * Test de détail (procédure substantive).
 */
export interface DetailTest {
  name: string;
  nature: string;
  extent: string;
  timing: string;
  samplingMethod: string;
  evidenceRequired: string[];
  assertions: AuditAssertion[];
  sourceIds: string[];
}

/**
 * Risque identifié pour un cycle.
 */
export interface Risk {
  name: string;
  category: RiskCategory;
  description: string;
  indicators: string[];
  response: string[];
  sourceIds: string[];
}

/**
 * Différence de traitement entre IFRS et PCG.
 */
export interface IFRSvsPCGDifference {
  topic: string;
  ifrsTreatment: string;
  pcgTreatment: string;
  auditImpact: string;
  sourceIds: string[];
}

/**
 * Seuil réglementaire ou règle de seuil chiffrée.
 */
export interface ThresholdRule {
  label: string;
  value: string;
  status: NormativeStatus;
  sourceIds: string[];
  caveat?: string;
}

/**
 * Cycle d'audit complet — un fichier YAML = un cycle.
 */
export interface AuditCycle {
  /** Slug unique = nom du fichier YAML sans extension. */
  slug: string;
  family: CycleFamily;
  title: string;
  summary: string;

  /** Comptes PCG concernés (préfixes). */
  pcgAccounts: string[];

  /** Correspondance avec les silos PROBANT FEC (cross-linking, peut être vide). */
  probantSiloIds: string[];

  /** Cloison(s) PROBANT de rattachement (navigation transversale). */
  probantCloisons: CloisonId[];

  applicableStandards: SourceReference[];
  thresholds: ThresholdRule[];
  materiality: MaterialityGuidance;
  ratios: Ratio[];
  analyticalProcedures: AnalyticalProcedure[];
  detailTests: DetailTest[];
  risks: Risk[];
  ifrsVsPcg: IFRSvsPCGDifference[];
  officialSources: SourceReference[];

  keyPoints: string[];
  relatedCycles: string[];

  reviewStatus: ReviewStatus;
  lastReviewedAt?: string;
}

/**
 * Entrée du registre central des sources (data/sources/*.yml).
 */
export interface NormativeSource {
  id: string;
  label: string;
  type: SourceType;
  url?: string;
  paragraph?: string;
  article?: string;
  status: NormativeStatus;
  effectiveDate?: string;
  summary?: string;
  note?: string;
}

/**
 * Document méthodologique (data/methodology/*.yml).
 * La structure du contenu varie d'un document à l'autre — on conserve donc
 * un payload brut typé en `unknown` pour l'affichage générique.
 */
export interface MethodologyDocument {
  slug: string;
  title: string;
  description?: string;
  status?: NormativeStatus;
  sourceIds?: string[];
  /** Contenu structuré variable selon le document. */
  content: Record<string, unknown>;
}

/**
 * Élément allégé indexé pour la recherche Fuse.js (sérialisable côté client).
 */
export interface CycleSearchItem {
  slug: string;
  title: string;
  family: CycleFamily;
  pcgAccounts: string[];
  /** Mots-clés agrégés : références de normes, libellés de risques/ratios. */
  keywords: string[];
}

/**
 * Libellés FR des familles, pour affichage.
 */
export const CYCLE_FAMILY_LABEL: Record<CycleFamily, string> = {
  ACTIF_IMMOBILISE: "Actif immobilisé",
  ACTIF_CIRCULANT: "Actif circulant",
  TRESORERIE: "Trésorerie & équivalents",
  CAPITAUX_PROPRES_FINANCEMENT: "Capitaux propres & financement",
  PASSIF_ENGAGEMENTS: "Passif & engagements hors bilan",
  COMPTE_RESULTAT: "Compte de résultat",
  TRANSVERSAL: "Cycles transversaux",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  DRAFT: "Brouillon",
  REVIEW_REQUIRED: "Revue requise",
  VALIDATED: "Validé",
};
