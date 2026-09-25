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

/** L'absence, le zéro et une valeur illisible ne sont jamais interchangeables. */
export type MontantParse =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "valid"; value: number };

export function parseMontant(v: unknown): MontantParse {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { kind: "absent" };
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? { kind: "valid", value: v } : { kind: "invalid" };
  }
  if (typeof v !== "string") return { kind: "invalid" };
  const normalized = v.trim().replace(/\s|\u00a0|\u202f/gu, "").replace(/€$/u, "");
  // Séparateurs français ou valeur décimale non groupée ; toute autre graphie
  // est rejetée, jamais assimilée à zéro. Sans virgule, un seul groupe « .ddd »
  // (« 12.500 ») est ambigu entre milliers et décimales : il est refusé.
  const grouped = /^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/u.test(normalized);
  const plain = /^[+-]?\d+(?:[,.]\d{1,2})?$/u.test(normalized);
  const ambiguous = /^[+-]?\d{1,3}\.\d{3}$/u.test(normalized);
  if ((!grouped && !plain) || ambiguous) return { kind: "invalid" };
  const decimal = grouped
    ? normalized.replace(/\./gu, "").replace(",", ".")
    : normalized.replace(",", ".");
  const value = Number(decimal);
  return Number.isFinite(value) ? { kind: "valid", value } : { kind: "invalid" };
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
  return rows.map((r, index) => {
    const parsed = parseMontant(r[map.montant]);
    if (parsed.kind !== "valid") {
      throw new Error(`Montant ${parsed.kind === "absent" ? "absent" : "invalide"} à la ligne ${index + 1}.`);
    }
    const ligne: DocumentLigne = { montant: parsed.value };
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
