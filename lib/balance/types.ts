/**
 * Modèles canoniques des formats d'ingestion AGRÉGÉS (balance, liasse).
 *
 * Distincts du modèle FEC ligne à ligne (`lib/canonical-model`) : une balance
 * ou une liasse fiscale ne contient pas d'écritures, mais des soldes par compte
 * ou des postes d'états financiers. Le moteur de règles FEC ne s'y applique
 * donc pas ; ces formats font l'objet d'une validation légère dédiée.
 */

/** Une ligne de balance : un compte avec ses cumuls et son solde. */
export interface BalanceLigne {
  compteNum: string;
  compteLib: string;
  debit: number;
  credit: number;
  /** Solde = débit − crédit (positif = solde débiteur). */
  solde: number;
}

/** Balance générale parsée depuis un fichier XLSX ou CSV. */
export interface ParsedBalance {
  source: "xlsx" | "csv";
  fileName: string;
  lignes: BalanceLigne[];
  nbLignes: number;
  totalDebit: number;
  totalCredit: number;
  /** Écart total débit − total crédit. */
  ecartEquilibre: number;
  equilibre: boolean;
  exercice: string | null;
  siren: string | null;
  /** En-têtes source retenus pour le mapping canonique. */
  colonnes: {
    compte: string;
    libelle: string | null;
    debit: string;
    credit: string;
  };
  parseWarnings: string[];
}

/** Un contrôle léger appliqué à une balance (hors moteur FEC). */
export interface BalanceCheck {
  id: string;
  ok: boolean;
  severity: "bloquant" | "majeur" | "mineur" | "informatif";
  label: string;
  detail: string;
}

export interface BalanceValidation {
  checks: BalanceCheck[];
  nbAlertes: number;
}

/** Un poste d'états financiers extrait au mieux d'une liasse PDF. */
export interface LiassePoste {
  label: string;
  montant: number;
}

/** Liasse / états financiers PDF — extraction best-effort. */
export interface ParsedLiasse {
  source: "pdf";
  fileName: string;
  nbPages: number;
  siren: string | null;
  exercice: string | null;
  postes: LiassePoste[];
  /** Vrai si l'extraction est trop pauvre (PDF scanné, non tabulaire…). */
  needsManualReview: boolean;
  textPreview: string;
  charCount: number;
}

/** Convertit un montant texte (format FR ou US, parenthèses négatives) en nombre. */
export function parseMontant(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  // retire espaces (y compris insécables/fines) et tout sauf chiffres , . -
  s = s.replace(/[\s  ]/g, "").replace(/[^0-9,.-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // "1.234,56" → point = séparateur de milliers, virgule = décimale
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}
