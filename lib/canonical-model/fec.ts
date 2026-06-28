import { z } from "zod";

/**
 * Modèle canonique du Fichier des Écritures Comptables (FEC).
 *
 * Les 18 rubriques sont définies par l'article A.47 A-1 du Livre des
 * procédures fiscales (LPF), dans l'ordre prescrit. Pour un FEC à champs
 * Débit/Crédit, les colonnes 12 et 13 sont `Debit`/`Credit` ; la variante
 * `Montant`/`Sens` est tolérée par l'administration (gérée au parsing).
 *
 * Source : LPF art. A.47 A-1 ; nommage du fichier : SirenFECAAAAMMJJ.
 */

const fecDate = z
  .string()
  .regex(/^\d{8}$/u, "Date FEC attendue au format AAAAMMJJ");

/** Une ligne FEC brute, telle que lue dans le fichier (montants en chaîne). */
export const FecRawEntrySchema = z.object({
  JournalCode: z.string().min(1),
  JournalLib: z.string(),
  EcritureNum: z.string().min(1),
  EcritureDate: fecDate,
  CompteNum: z.string().min(1),
  CompteLib: z.string(),
  CompAuxNum: z.string().optional().default(""),
  CompAuxLib: z.string().optional().default(""),
  PieceRef: z.string(),
  PieceDate: fecDate.or(z.literal("")),
  EcritureLib: z.string(),
  Debit: z.string(),
  Credit: z.string(),
  EcritureLet: z.string().optional().default(""),
  DateLet: z.string().optional().default(""),
  ValidDate: fecDate.or(z.literal("")),
  Montantdevise: z.string().optional().default(""),
  Idevise: z.string().optional().default(""),
});

export type FecRawEntry = z.infer<typeof FecRawEntrySchema>;

/** Ordre canonique des 18 rubriques FEC (A.47 A-1). */
export const FEC_COLUMNS: readonly (keyof FecRawEntry)[] = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

/**
 * Ligne FEC normalisée pour le moteur : montants en nombres, débit/crédit
 * unifiés et numéro de ligne d'origine conservé pour la traçabilité.
 */
export interface FecEntry {
  /** Index 1-based de la ligne dans le fichier source (hors en-tête). */
  ligne: number;
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: string; // AAAAMMJJ
  compteNum: string;
  compteLib: string;
  compAuxNum: string;
  compAuxLib: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debit: number;
  credit: number;
  ecritureLet: string;
  dateLet: string;
  validDate: string;
  /** Solde de la ligne (debit - credit). */
  montant: number;
}

/** Métadonnées d'un fichier FEC ingéré. */
export interface FecFile {
  nomFichier: string;
  siren: string | null;
  clotureAAAAMMJJ: string | null;
  fingerprint: string; // SHA-256
  separateur: string;
  encodage: string;
  nbLignes: number;
  entries: FecEntry[];
}
