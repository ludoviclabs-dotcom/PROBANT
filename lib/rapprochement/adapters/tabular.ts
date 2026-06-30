import type { DocumentLigne, DocumentSource, FormatDocument, TypeDocument } from "../types";

/**
 * Adaptateur tabulaire : normalise des lignes issues d'un tableur (xlsx/csv)
 * vers `DocumentLigne[]`. L'extraction binaire xlsx/PDF est hors périmètre ici
 * (Phase ingestion) ; cet adaptateur prend en entrée des enregistrements déjà
 * décodés en objets, ce qui couvre csv et xlsx une fois la feuille lue.
 */

/** Correspondance colonnes du tableur → champs normalisés. */
export interface MappageColonnes {
  compte?: string;
  tiers?: string;
  piece?: string;
  date?: string;
  echeance?: string;
  montant: string;
  libelle?: string;
  /** Colonne booléenne/texte indiquant un poste déjà lettré/déprécié. */
  lettre?: string;
}

type Enregistrement = Record<string, string | number | boolean | null | undefined>;

function toNombre(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(/ /g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(1|true|oui|x|lettr)/i.test(v.trim());
  return false;
}

/** Convertit des enregistrements tabulaires en lignes normalisées. */
export function lignesDepuisTableur(
  rows: Enregistrement[],
  map: MappageColonnes,
): DocumentLigne[] {
  return rows.map((r) => {
    const ligne: DocumentLigne = { montant: toNombre(r[map.montant]) };
    if (map.compte && r[map.compte] != null) ligne.compte = String(r[map.compte]);
    if (map.tiers && r[map.tiers] != null) ligne.tiers = String(r[map.tiers]);
    if (map.piece && r[map.piece] != null) ligne.piece = String(r[map.piece]);
    if (map.date && r[map.date] != null) ligne.date = String(r[map.date]);
    if (map.echeance && r[map.echeance] != null) ligne.echeance = String(r[map.echeance]);
    if (map.libelle && r[map.libelle] != null) ligne.libelle = String(r[map.libelle]);
    if (map.lettre) ligne.lettre = toBool(r[map.lettre]);
    return ligne;
  });
}

/** Construit un `DocumentSource` à partir d'enregistrements tabulaires. */
export function documentDepuisTableur(
  meta: { id: string; label: string; type: TypeDocument; format?: FormatDocument },
  rows: Enregistrement[],
  map: MappageColonnes,
): DocumentSource {
  return {
    id: meta.id,
    label: meta.label,
    type: meta.type,
    format: meta.format ?? "csv",
    lignes: lignesDepuisTableur(rows, map),
  };
}
