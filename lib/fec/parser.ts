import { FEC_COLUMNS, type FecEntry } from "@/lib/canonical-model";

/**
 * Parsing d'un FEC à plat (texte) vers le modèle canonique.
 *
 * Gère la détection de séparateur, la variante Débit/Crédit vs Montant/Sens,
 * et la conversion des montants au format français. Les contrôles
 * d'admissibilité réglementaires sont assurés ensuite par les règles hardLaw.
 */

export interface ParsedFec {
  separateur: string;
  separateurNom: string;
  headerColumns: string[];
  /** Variante de montants détectée. */
  variante: "debit-credit" | "montant-sens" | "inconnue";
  entries: FecEntry[];
  /** Anomalies de bas niveau détectées au parsing (alimentent hardLaw). */
  parseErrors: string[];
}

const SEPARATEURS: { char: string; nom: string }[] = [
  { char: "\t", nom: "tabulation" },
  { char: "|", nom: "barre verticale" },
  { char: ";", nom: "point-virgule" },
];

/** Détecte le séparateur le plus probable depuis la ligne d'en-tête. */
export function detectSeparateur(headerLine: string): { char: string; nom: string } {
  let best = SEPARATEURS[0];
  let bestCount = -1;
  for (const sep of SEPARATEURS) {
    const count = headerLine.split(sep.char).length - 1;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

/** Convertit un montant FEC (format français) en nombre. */
export function parseMontant(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/\s/gu, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function parseFec(content: string): ParsedFec {
  const parseErrors: string[] = [];
  const normalized = content.replace(/^﻿/u, ""); // BOM
  const lines = normalized.split(/\r\n|\n|\r/u).filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      separateur: ";",
      separateurNom: "point-virgule",
      headerColumns: [],
      variante: "inconnue",
      entries: [],
      parseErrors: ["Fichier vide."],
    };
  }

  const sep = detectSeparateur(lines[0]);
  const headerColumns = lines[0].split(sep.char).map((c) => c.trim());

  const hasDebitCredit =
    headerColumns.includes("Debit") && headerColumns.includes("Credit");
  const hasMontantSens =
    headerColumns.includes("Montant") && headerColumns.includes("Sens");
  const variante: ParsedFec["variante"] = hasDebitCredit
    ? "debit-credit"
    : hasMontantSens
      ? "montant-sens"
      : "inconnue";

  const idx = (name: string) => headerColumns.indexOf(name);
  const col = (cells: string[], name: string): string => {
    const i = idx(name);
    return i >= 0 && i < cells.length ? cells[i].trim() : "";
  };

  const entries: FecEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep.char);
    if (cells.length < 13) {
      parseErrors.push(
        `Ligne ${i + 1} : ${cells.length} colonnes lues, structure incomplète.`,
      );
      continue;
    }

    let debit = 0;
    let credit = 0;
    if (variante === "debit-credit") {
      debit = parseMontant(col(cells, "Debit"));
      credit = parseMontant(col(cells, "Credit"));
    } else if (variante === "montant-sens") {
      const montant = parseMontant(col(cells, "Montant"));
      const sens = col(cells, "Sens").toUpperCase();
      if (sens.startsWith("D")) debit = montant;
      else credit = montant;
    }

    if (Number.isNaN(debit) || Number.isNaN(credit)) {
      parseErrors.push(`Ligne ${i + 1} : montant non numérique.`);
      debit = Number.isNaN(debit) ? 0 : debit;
      credit = Number.isNaN(credit) ? 0 : credit;
    }

    entries.push({
      ligne: i,
      journalCode: col(cells, "JournalCode"),
      journalLib: col(cells, "JournalLib"),
      ecritureNum: col(cells, "EcritureNum"),
      ecritureDate: col(cells, "EcritureDate"),
      compteNum: col(cells, "CompteNum"),
      compteLib: col(cells, "CompteLib"),
      compAuxNum: col(cells, "CompAuxNum"),
      compAuxLib: col(cells, "CompAuxLib"),
      pieceRef: col(cells, "PieceRef"),
      pieceDate: col(cells, "PieceDate"),
      ecritureLib: col(cells, "EcritureLib"),
      debit,
      credit,
      ecritureLet: col(cells, "EcritureLet"),
      dateLet: col(cells, "DateLet"),
      validDate: col(cells, "ValidDate"),
      montant: debit - credit,
    });
  }

  return {
    separateur: sep.char,
    separateurNom: sep.nom,
    headerColumns,
    variante,
    entries,
    parseErrors,
  };
}

/** Vérifie que l'en-tête contient les 18 rubriques (ou la variante Montant/Sens). */
export function headerConformite(headerColumns: string[]): {
  conforme: boolean;
  manquantes: string[];
  ordreRespecte: boolean;
} {
  const variantesMontant = new Set(["Montant", "Sens"]);
  const attendues = FEC_COLUMNS.filter(
    (c) => c !== "Debit" && c !== "Credit",
  ) as string[];

  const present = new Set(headerColumns);
  const hasDC = present.has("Debit") && present.has("Credit");
  const hasMS = present.has("Montant") && present.has("Sens");

  const manquantes = attendues.filter((c) => !present.has(c));
  if (!hasDC && !hasMS) manquantes.push("Debit/Credit ou Montant/Sens");

  // Ordre : on vérifie que les colonnes communes apparaissent dans l'ordre canonique.
  const canonical = FEC_COLUMNS.filter(
    (c) => present.has(c as string) && !variantesMontant.has(c as string),
  );
  let ordreRespecte = true;
  let lastIdx = -1;
  for (const c of canonical) {
    const at = headerColumns.indexOf(c as string);
    if (at < lastIdx) {
      ordreRespecte = false;
      break;
    }
    lastIdx = at;
  }

  return {
    conforme: manquantes.length === 0,
    manquantes,
    ordreRespecte,
  };
}
