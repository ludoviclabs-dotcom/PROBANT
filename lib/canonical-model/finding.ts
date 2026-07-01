import type { CloisonId } from "./taxonomy";

/**
 * Modèle de constat (« finding »).
 *
 * Trois familles, jamais mélangées :
 *  - hardLaw     : contrainte obligatoire (LPF, PCG). Non négociable.
 *  - methodology : présomption / procédure d'audit-révision (ISA, ISRE).
 *  - internal    : heuristique, ratio ou seuil propre à PROBANT.
 *
 * Chaque constat porte sa source normative citée, son seuil, son écart et
 * la chaîne de preuve permettant de le reconstituer.
 */

export type FindingFamily = "hardLaw" | "methodology" | "internal";

export type Severity = "bloquant" | "majeur" | "mineur" | "informatif";

export type StatutRevue = "en_attente" | "valide" | "ecarte";

/**
 * Risque que le constat soit un faux positif. Aide explicite à la décision du
 * réviseur (le réviseur garde la main : ce champ n'écarte jamais un constat,
 * il le qualifie). « faible » = signal robuste, « élevé » = à confirmer avant
 * d'alerter sur une fraude éventuelle.
 */
export type FauxPositifRisk = "faible" | "moyen" | "eleve";

export const FAUX_POSITIF_LABEL: Record<FauxPositifRisk, string> = {
  faible: "Faux positif improbable",
  moyen: "Faux positif possible",
  eleve: "Faux positif à confirmer",
};

export const FAUX_POSITIF_SHORT: Record<FauxPositifRisk, string> = {
  faible: "Risque faible",
  moyen: "Risque moyen",
  eleve: "Risque élevé",
};

export const FAUX_POSITIF_HEX: Record<FauxPositifRisk, string> = {
  faible: "#22c55e",
  moyen: "#eab308",
  eleve: "#f97316",
};

export const FAMILY_LABEL: Record<FindingFamily, string> = {
  hardLaw: "Obligatoire",
  methodology: "Présomption d'audit",
  internal: "Paramètre interne",
};

/**
 * Origine d'un constat :
 *  - analyse        : détecté sur un document unique (FEC) par le moteur de règles.
 *  - rapprochement  : issu de la confrontation de deux documents (module rapprochement).
 */
export type FindingOrigine = "analyse" | "rapprochement";

/**
 * Qualification normée d'un écart issu du rapprochement multi-documents.
 * Chaque qualification s'appuie sur une source sourcée (cf. lib/referentiel/
 * sources) — aucune base inventée. Distincte de `FindingFamily` (qui qualifie
 * la force normative) : ici on qualifie la NATURE de l'écart constaté.
 */
export type QualificationEcart =
  | "rapprochement_solde"
  | "perimetre"
  | "lettrage"
  | "anteriorite"
  | "provision_insuffisante"
  | "cutoff"
  | "valorisation"
  | "fiscal"
  | "a_justifier";

export const QUALIFICATION_LABEL: Record<QualificationEcart, string> = {
  rapprochement_solde: "Écart de rapprochement",
  perimetre: "Écart de périmètre",
  lettrage: "Écart de lettrage",
  anteriorite: "Écart d'antériorité",
  provision_insuffisante: "Dépréciation insuffisante",
  cutoff: "Rattachement / cut-off",
  valorisation: "Écart de valorisation",
  fiscal: "Incidence fiscale",
  a_justifier: "À justifier",
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  bloquant: 0,
  majeur: 1,
  mineur: 2,
  informatif: 3,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  bloquant: "Bloquant",
  majeur: "Majeur",
  mineur: "Mineur",
  informatif: "Informatif",
};

/** Thème normatif d'une source (classification pour la page Référentiel). */
export type SourceTheme =
  | "Admissibilité"
  | "Comptabilisation"
  | "Rattachement"
  | "Présentation"
  | "Fraude"
  | "Risque"
  | "Matérialité"
  | "Procédures analytiques"
  | "Éléments probants"
  | "Examen limité";

/** Référence normative opposable rattachée à un constat. */
export interface SourceNormative {
  /** Référence courte affichée en badge : "PCG art. 214-13", "LPF A.47 A-1". */
  ref: string;
  /** Citation textuelle du texte applicable. */
  citation: string;
  /** Date d'effet de la version du texte appliquée. */
  effectiveDate: string;
  /** URL ou identifiant de la source si disponible. */
  url?: string;
  /** Thème normatif (classification d'affichage du référentiel). */
  theme?: SourceTheme;
}

/**
 * Seuil de matérialité (ISA 320) appliqué à un constat chiffré, pour pondérer
 * la décision et écarter les faux positifs sous le seuil de signification.
 */
export interface SeuilApplique {
  type: "significativite" | "performance" | "trivialite";
  base:
    | "total_bilan"
    | "chiffre_affaires"
    | "resultat_net"
    | "total_charges"
    | "total_produits";
  /** Taux appliqué à la base (ex. 0.05 = 5 %). */
  tauxApplique: number;
  /** Montant absolu du seuil résultant. */
  montantCalcule: number;
  /** Référentiel du seuil (ex. "ISA 320"). */
  source: string;
  /** L'écart chiffré du constat dépasse-t-il ce seuil ? */
  depasse: boolean;
}

/** Une grandeur chiffrée constatée vs son seuil de référence. */
export interface Mesure {
  /** Valeur constatée dans les comptes. */
  constate: number;
  /** Seuil ou valeur attendue de référence. */
  seuil: number;
  /** Unité d'affichage. */
  unite: "EUR" | "%" | "ratio" | "jours";
  /** Libellé court de ce qui est mesuré. */
  libelle: string;
}

/** Une ligne d'un état financier reconstruit, annotable visuellement. */
export interface StatementRow {
  id: string;
  label: string;
  compte?: string;
  /** Valeur affichée (montant ou taux selon l'unité de l'état). */
  valeur: number;
  kind: "ligne" | "sous-total" | "total";
  /** Si renseigné, la ligne est entourée et reliée au finding correspondant. */
  flaggedBy?: string;
  severity?: Severity;
}

/** Document croisé dans un rapprochement, pour affichage en chip de statut. */
export interface StatementDocument {
  label: string;
  /** Toujours "analyse" en mode démo : les 2 documents du cycle sont déjà chargés. */
  statut: "analyse";
}

/** État financier reconstruit présenté dans le silo, avec lignes annotées. */
export interface ReconstitutedStatement {
  titre: string;
  unite: "EUR" | "%";
  /** Note méthodologique courte sur la reconstitution. */
  note?: string;
  rows: StatementRow[];
  /** Documents croisés (rapprochement) — absent pour les silos analytiques classiques. */
  documents?: StatementDocument[];
}

/** Étape de la chaîne de preuve (source → transformation → règle → résultat). */
export interface EvidenceStep {
  etape: string;
  detail: string;
  hash?: string;
}

export interface Finding {
  id: string;
  family: FindingFamily;
  severity: Severity;

  ruleId: string;
  ruleVersion: string;

  cloison: CloisonId;
  siloId: string;

  titre: string;
  /** Constat en langage métier, une à deux phrases. */
  constat: string;
  /** Explication : pourquoi c'est un problème, que faire. */
  explication: string;

  /** Mesure principale : constaté vs seuil. */
  mesure: Mesure;

  source: SourceNormative;

  comptesConcernes: string[];
  /** Numéros de lignes FEC concernées (traçabilité). */
  lignesSource: number[];

  /** Faisceau d'indices : signaux ayant déclenché ou renforcé le constat. */
  faisceau: string[];

  /** Annotation courte affichée le long de la flèche dans le silo. */
  annotation?: string;
  /** Identifiant de la ligne d'état reconstruit pointée par ce finding. */
  cibleRowId?: string;

  /** Chaîne de preuve reconstituable. */
  preuve: EvidenceStep[];

  statutRevue: StatutRevue;
  commentaireRevue?: string;

  /**
   * Risque de faux positif (aide à la décision). Optionnel : peut être
   * renseigné par la règle/le scénario, ou dérivé au moment de l'analyse
   * (cf. lib/audit/materiality).
   */
  fauxPositifRisk?: FauxPositifRisk;

  /**
   * Seuil de matérialité appliqué pour pondérer le constat. Optionnel :
   * calculé à la volée lors de la construction du document annoté.
   */
  seuilApplique?: SeuilApplique;

  /**
   * Origine du constat. Absent = "analyse" (rétro-compatible). Renseigné à
   * "rapprochement" par le moteur de rapprochement multi-documents.
   */
  origine?: FindingOrigine;

  /**
   * Qualification de l'écart, renseignée pour les constats issus du
   * rapprochement multi-documents. Optionnelle.
   */
  qualification?: QualificationEcart;

  /**
   * Slug de la fiche cycle (lib/audit-cycles) qui fonde la justification
   * normative de ce constat. Permet le cross-linking vers la base de
   * connaissance sourcée. Optionnel.
   */
  cycleSlug?: string;
}

/** Détermine si un constat relève d'une non-conformité réglementaire dure. */
export function isReglementaire(f: Finding): boolean {
  return f.family === "hardLaw";
}

export const FAMILY_OF_SOURCE_KIND = {
  hardLaw: "réglementaire",
  methodology: "méthodologique",
  internal: "interne",
} as const;
