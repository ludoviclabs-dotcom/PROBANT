/**
 * Phrases de lecture du cockpit fiscalité.
 *
 * Chaque phrase est une mise en mots de valeurs déjà présentes dans les
 * datasets (compteurs, libellés, montants formatés du snapshot) : aucune
 * grandeur n'est calculée ici, seulement sélectionnée et formulée.
 */

import type { TaxCockpitDatasets, TaxComparisonBarRow } from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";

const TAX_SHORT: Readonly<Record<string, string>> = {
  "differences-corporate_income_tax": "l'IS",
  "differences-vat": "la TVA",
  "differences-cfe": "la CFE",
};

function item(datasets: TaxCockpitDatasets, id: string) {
  return datasets.capability.items.find((candidate) => candidate.id === id) ?? null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

function joinFr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** Écarts de rapprochement relevés, par impôt, tels que publiés par le dataset d'exposition. */
export function exposureDifferences(datasets: TaxCockpitDatasets) {
  return datasets.exposure.rows
    .filter((row) => row.id.startsWith("differences-") && row.emphasis)
    .map((row) => ({ id: row.id, tax: TAX_SHORT[row.id] ?? row.id, amount: String(row.cells.amount) }));
}

/** Phrase de synthèse de l'acte I (2 lignes max). */
export function verdictSentence(datasets: TaxCockpitDatasets): string {
  const { summary, coverage } = datasets;
  const year = `Exercice ${summary.fiscalYear}`;
  if (coverage.totalControls === 0) {
    return `${year} — aucun contrôle fiscal n'a pu être exécuté sur ce dossier.`;
  }
  const concluded = item(datasets, "controls-concluded")?.value ?? "0";
  const missing = coverage.segments.find((segment) => segment.key === "missing")?.count ?? 0;
  const differences = exposureDifferences(datasets);
  const tail: string[] = [];
  if (differences.length > 0) {
    tail.push(
      `${differences.length > 1 ? "des écarts de rapprochement" : "un écart de rapprochement"} à qualifier — ${joinFr(
        differences.map((difference) => `${difference.amount} sur ${difference.tax}`),
      )}`,
    );
  }
  if (missing > 0) tail.push(plural(missing, "donnée manquante", "données manquantes"));
  return `${year} — ${plural(coverage.totalControls, "contrôle exécuté", "contrôles exécutés")}, ${concluded} conclus${
    tail.length > 0 ? `, ${joinFr(tail)}` : ""
  }.`;
}

/** Paragraphe de contexte sous la phrase de synthèse. */
export function verdictContext(datasets: TaxCockpitDatasets): string {
  const taxes = item(datasets, "applicable-taxes");
  const documents = item(datasets, "documents");
  const missing = item(datasets, "missing-data");
  const parts: string[] = [];
  if (taxes) {
    parts.push(
      `${plural(Number(taxes.value), "impôt applicable", "impôts applicables")} (${taxes.detail ?? "aucun"})`,
    );
  }
  if (documents) parts.push(`${documents.value} document(s) disponible(s)`);
  const head = parts.length > 0 ? `Périmètre contrôlé : ${joinFr(parts)}. ` : "";
  const limits = missing?.detail ? `${missing.detail} ` : "";
  return `${head}${limits}Le statut affiché est un ordre d'attention, pas une note globale.`;
}

/** Lecture d'un bloc de rapprochement à deux opérandes (IS, CFE). */
export function reconciliationReading(bars: readonly TaxComparisonBarRow[], fallback: string): string {
  if (bars.length === 0) return fallback;
  const gaps = bars.filter((bar) => bar.differenceCents !== null && bar.differenceCents !== 0);
  const unavailable = bars.filter((bar) => bar.values.some((value) => value.amountCents === null));
  if (gaps.length === 0 && unavailable.length === 0) {
    return `Les ${plural(bars.length, "rapprochement")} coïncident exactement : aucun écart n'est ouvert.`;
  }
  const sentences: string[] = [];
  if (gaps.length > 0) {
    sentences.push(
      `${bars.length - gaps.length} rapprochement(s) sur ${bars.length} coïncident. ${gaps
        .map((bar) => `« ${bar.label} » diverge de ${formatCents(Math.abs(bar.differenceCents!))}`)
        .join(" ; ")}.`,
    );
  }
  if (unavailable.length > 0) {
    sentences.push(
      `${plural(unavailable.length, "ligne")} sans opérande disponible : ${unavailable.map((bar) => `« ${bar.label} »`).join(", ")}.`,
    );
  }
  return sentences.join(" ");
}

/** Lecture du bloc TVA (théorique / comptabilisée / déclarée). */
export function vatReading(bars: readonly TaxComparisonBarRow[], fallback: string): string {
  if (bars.length === 0) return fallback;
  const missingTheoretical = bars.filter((bar) => bar.values.some((value) => value.amountCents === null));
  const gaps = bars.filter((bar) => bar.differenceCents !== null && bar.differenceCents !== 0);
  const sentences: string[] = [];
  if (gaps.length === 0) {
    sentences.push("Les montants comptabilisés et déclarés concordent sur chaque agrégat.");
  } else {
    sentences.push(
      gaps
        .map((bar) => `« ${bar.label} » : comptabilisé et déclaré diffèrent de ${formatCents(Math.abs(bar.differenceCents!))}`)
        .join(" ; ") + ".",
    );
  }
  if (missingTheoretical.length > 0) {
    sentences.push(
      `Une valeur est absente du dossier pour ${joinFr(missingTheoretical.map((bar) => `« ${bar.label} »`))} : elle reste « non disponible », jamais zéro.`,
    );
  }
  return sentences.join(" ");
}

/** Date ISO `YYYY-MM-DD` → `DD.MM.YYYY` (affichage uniquement). */
export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}
