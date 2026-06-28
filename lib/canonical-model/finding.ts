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

export const FAMILY_LABEL: Record<FindingFamily, string> = {
  hardLaw: "Obligatoire",
  methodology: "Présomption d'audit",
  internal: "Paramètre interne",
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

/** État financier reconstruit présenté dans le silo, avec lignes annotées. */
export interface ReconstitutedStatement {
  titre: string;
  unite: "EUR" | "%";
  /** Note méthodologique courte sur la reconstitution. */
  note?: string;
  rows: StatementRow[];
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
