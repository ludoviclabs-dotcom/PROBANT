import type { BalanceLigne, ParsedBalance } from "./types";
import { parseMontant } from "./types";
import {
  DEMO_XLSX_LIMITS,
  readXlsxRowsInWorker,
} from "@/lib/tabular/read-xlsx-browser";
import { readCsvRows } from "@/lib/tabular/read-csv-browser";

/**
 * Parse une balance générale (XLSX / XLS / CSV) côté NAVIGATEUR via SheetJS.
 * Détecte automatiquement la ligne d'en-têtes et les colonnes
 * compte / libellé / débit / crédit (exports type Sage, Cegid, EBP…).
 *
 * SheetJS est chargé dynamiquement : il ne pèse pas sur le bundle initial et
 * n'est jamais évalué côté serveur.
 */

const RE = {
  compte: /(n[°o]?\s*)?(de\s+)?compte|^cpt\b|num.*compte/i,
  libelle: /libell|intitul|d[ée]sign|nom.*compte/i,
  debit: /d[ée]bit/i,
  credit: /cr[ée]dit/i,
};

export async function parseBalanceFile(file: File): Promise<ParsedBalance> {
  const rows = file.name.toLowerCase().endsWith(".csv")
    ? await readCsvRows(file, DEMO_XLSX_LIMITS)
    : await readXlsxRowsInWorker(file);
  const warnings: string[] = [];

  // Recherche de la ligne d'en-têtes dans les 15 premières lignes.
  let headerIdx = -1;
  let cols = { compte: -1, libelle: -1, debit: -1, credit: -1 };
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = (rows[i] ?? []).map((c) => String(c ?? "").trim());
    const find = (re: RegExp) => r.findIndex((c) => re.test(c));
    const compte = find(RE.compte);
    const debit = find(RE.debit);
    const credit = find(RE.credit);
    if (compte >= 0 && (debit >= 0 || credit >= 0)) {
      headerIdx = i;
      cols = { compte, libelle: find(RE.libelle), debit, credit };
      break;
    }
  }

  if (headerIdx < 0) {
    warnings.push(
      "En-têtes non reconnus : mapping par défaut (compte, libellé, débit, crédit).",
    );
    const width = Math.max(4, ...rows.slice(0, 20).map((r) => (r ?? []).length));
    cols = { compte: 0, libelle: 1, debit: width - 2, credit: width - 1 };
    headerIdx = 0;
  }

  const allText = rows
    .flat()
    .map((c) => String(c ?? ""))
    .join(" ");
  const exercice = allText.match(/\b(20\d{2})\b/)?.[1] ?? null;
  const siren = `${file.name} ${allText}`.match(/\b(\d{9})\b/)?.[1] ?? null;

  const lignes: BalanceLigne[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const compteNum = String(r[cols.compte] ?? "").trim();
    if (!compteNum || !/^\d/.test(compteNum)) continue; // ignore totaux / lignes vides
    const debit = cols.debit >= 0 ? parseMontant(r[cols.debit]) : 0;
    const credit = cols.credit >= 0 ? parseMontant(r[cols.credit]) : 0;
    if (debit === 0 && credit === 0) continue;
    lignes.push({
      compteNum,
      compteLib: cols.libelle >= 0 ? String(r[cols.libelle] ?? "").trim() : "",
      debit,
      credit,
      solde: Math.round((debit - credit) * 100) / 100,
    });
  }

  if (!lignes.length) {
    warnings.push("Aucune ligne de compte exploitable détectée.");
  }

  const totalDebit = Math.round(lignes.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit =
    Math.round(lignes.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  const ecartEquilibre = Math.round((totalDebit - totalCredit) * 100) / 100;

  const header = rows[headerIdx] ?? [];
  return {
    source: file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
    fileName: file.name,
    lignes,
    nbLignes: lignes.length,
    totalDebit,
    totalCredit,
    ecartEquilibre,
    equilibre: Math.abs(ecartEquilibre) < 0.5,
    exercice,
    siren,
    colonnes: {
      compte: String(header[cols.compte] ?? "Compte"),
      libelle: cols.libelle >= 0 ? String(header[cols.libelle] ?? "Libellé") : null,
      debit: String(header[cols.debit] ?? "Débit"),
      credit: String(header[cols.credit] ?? "Crédit"),
    },
    parseWarnings: warnings,
  };
}
