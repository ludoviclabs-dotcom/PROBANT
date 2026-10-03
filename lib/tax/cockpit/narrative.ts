/**
 * Récit du cockpit fiscalité : phrase de synthèse, ruban de métriques et
 * fil d'Ariane de la revue.
 *
 * Tout est dérivé des datasets déjà construits depuis les snapshots moteurs :
 * ce module met en forme (pluriels, assemblage de phrases), il ne recompte rien
 * qui ne soit déjà dans un dataset et n'invente aucune interprétation. Le
 * wording respecte `docs/tax/TAX_OUTPUT_TAXONOMY.md` (aucune qualification
 * juridique : pas de « fraude », de « redressement certain », etc.).
 */
import type { TaxControlOutcome } from "@/lib/canonical-model";
import {
  TAX_OUTCOME_LABEL,
  TAX_OUTCOME_ORDER,
  TAX_OUTCOME_TONE,
  TAX_OUTCOME_WORDING,
  TAX_TYPE_SHORT_LABEL,
} from "./labels";
import type { TaxCockpitDatasets } from "./types";

type Tone = "critical" | "warning" | "positive" | "neutral";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function capabilityItem(datasets: TaxCockpitDatasets, id: string) {
  return datasets.capability.items.find((item) => item.id === id);
}

function segmentCount(datasets: TaxCockpitDatasets, key: string): number {
  return datasets.coverage.segments.find((segment) => segment.key === key)?.count ?? 0;
}

function integerValue(text: string | undefined): number | null {
  if (text === undefined) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Contrôles (hors lignes de rapprochement) d'une sortie donnée. */
function controlsWithOutcome(datasets: TaxCockpitDatasets, outcome: TaxControlOutcome) {
  return datasets.findings.rows.filter(
    (row) =>
      datasets.findings.details[row.id]?.controlId !== null &&
      datasets.findings.outcomeByRowId[row.id] === outcome,
  );
}

function unsigned(amount: string): string {
  return amount.replace(/^[-−]\s?/u, "");
}

/** Phrase de synthèse (2 lignes max) — « Exercice 2026 — 25 contrôles exécutés, … ». */
export function buildVerdictHeadline(datasets: TaxCockpitDatasets): string {
  const total = datasets.coverage.totalControls;
  const prefix = `Exercice ${datasets.summary.fiscalYear} — `;
  if (total === 0) return `${prefix}aucun contrôle exécuté sur ce périmètre.`;

  const concluded = integerValue(capabilityItem(datasets, "controls-concluded")?.value);
  const parts: string[] = [plural(total, "contrôle exécuté", "contrôles exécutés")];
  if (concluded !== null) parts.push(plural(concluded, "conclu", "conclus"));

  const differences = segmentCount(datasets, "difference");
  if (differences > 0) {
    const rows = controlsWithOutcome(datasets, "reconciliation_difference");
    const only = differences === 1 && rows.length === 1 ? rows[0] : null;
    if (only) {
      const detail = datasets.findings.details[only.id];
      const amount = detail && detail.amountDisplay !== "—" ? ` de ${unsigned(detail.amountDisplay)}` : "";
      parts.push(`1 incohérence ${String(only.cells.tax)}${amount} à qualifier`);
    } else {
      parts.push(`${differences} incohérences à qualifier`);
    }
  }

  const risks = segmentCount(datasets, "risk");
  if (risks > 0) parts.push(`${plural(risks, "risque potentiel", "risques potentiels")} à qualifier`);

  const missing = segmentCount(datasets, "missing");
  if (missing > 0) {
    const rows = controlsWithOutcome(datasets, "missing_information");
    const only = missing === 1 && rows.length === 1 ? rows[0] : null;
    parts.push(
      only
        ? `1 donnée manquante (${String(only.cells.tax)})`
        : plural(missing, "donnée manquante", "données manquantes"),
    );
  }
  return `${prefix}${parts.join(", ")}.`;
}

export interface TaxStatusLine {
  readonly tax: string;
  readonly label: string;
  readonly tone: Tone;
}

/** Statut d'attention le plus prioritaire de chaque impôt (ordre de la taxonomie). */
export function buildTaxStatusLines(datasets: TaxCockpitDatasets): TaxStatusLine[] {
  const rank = (label: string | null) => {
    const index = TAX_OUTCOME_ORDER.findIndex((outcome) => TAX_OUTCOME_LABEL[outcome] === label);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const lines: TaxStatusLine[] = [];
  for (const taxType of datasets.riskMatrix.taxes) {
    const cells = datasets.riskMatrix.cells.filter((cell) => cell.taxType === taxType);
    const worst = [...cells].sort((a, b) => rank(a.worstOutcomeLabel) - rank(b.worstOutcomeLabel))[0];
    if (!worst?.worstOutcomeLabel) continue;
    const outcome = TAX_OUTCOME_ORDER.find((o) => TAX_OUTCOME_LABEL[o] === worst.worstOutcomeLabel);
    lines.push({
      tax: TAX_TYPE_SHORT_LABEL[taxType],
      label: worst.worstOutcomeLabel,
      tone: outcome ? TAX_OUTCOME_TONE[outcome] : "neutral",
    });
  }
  return lines;
}

/** Paragraphe d'appui sous la phrase de synthèse — énoncés factuels uniquement. */
export function buildVerdictSupport(datasets: TaxCockpitDatasets): string {
  const taxes = capabilityItem(datasets, "applicable-taxes");
  const documents = capabilityItem(datasets, "documents");
  const sentences: string[] = [];
  if (taxes) sentences.push(`Impôts applicables au dossier : ${taxes.detail ?? taxes.value}.`);
  if (documents) sentences.push(`Pièces disponibles : ${documents.value}.`);
  const statuses = buildTaxStatusLines(datasets);
  if (statuses.length > 0) {
    sentences.push(
      `Statut le plus prioritaire par impôt — ${statuses.map((line) => `${line.tax} : ${line.label}`).join(" · ")}.`,
    );
  }
  return sentences.join(" ");
}

export interface RibbonMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Suffixe typographique discret (« /25 »). */
  readonly suffix?: string;
  readonly tone: Tone;
  readonly tooltip: string;
}

/** Ruban de cinq métriques : valeurs et tooltips viennent des datasets. */
export function buildRibbon(datasets: TaxCockpitDatasets): RibbonMetric[] {
  const taxes = capabilityItem(datasets, "applicable-taxes");
  const concluded = capabilityItem(datasets, "controls-concluded");
  const risks = capabilityItem(datasets, "potential-risks");
  const missing = capabilityItem(datasets, "missing-data");
  const differences = segmentCount(datasets, "difference");
  const total = datasets.coverage.totalControls;
  const metrics: RibbonMetric[] = [];
  if (taxes) {
    metrics.push({
      id: taxes.id,
      label: taxes.label,
      value: taxes.value,
      tone: "neutral",
      tooltip: `${taxes.value} impôt(s) applicable(s) au dossier : ${taxes.detail ?? "—"}.`,
    });
  }
  if (concluded) {
    metrics.push({
      id: concluded.id,
      label: concluded.label,
      value: concluded.value,
      suffix: `/${total}`,
      tone: "neutral",
      tooltip: `${concluded.value} contrôle(s) sur ${total} ont abouti à une conclusion. ${concluded.detail ?? ""}`.trim(),
    });
  }
  metrics.push({
    id: "reconciliation-differences",
    label: TAX_OUTCOME_LABEL.reconciliation_difference,
    value: String(differences),
    tone: differences > 0 ? "critical" : "neutral",
    tooltip: `${differences} contrôle(s) en sortie « ${TAX_OUTCOME_LABEL.reconciliation_difference} ». ${TAX_OUTCOME_WORDING.reconciliation_difference}`,
  });
  if (risks) {
    metrics.push({
      id: risks.id,
      // Libellé court du ruban ; le libellé complet du dataset reste dans l'infobulle.
      label: "Écarts et risques",
      value: risks.value,
      tone: "neutral",
      tooltip: `${risks.label} — ${risks.detail ?? ""}`.trim(),
    });
  }
  if (missing) {
    metrics.push({
      id: missing.id,
      label: missing.label,
      value: missing.value,
      tone: Number(missing.value) > 0 ? "warning" : "neutral",
      tooltip: missing.detail ?? "",
    });
  }
  return metrics;
}

export type StepperState = "done" | "current" | "pending";

export interface StepperStep {
  readonly id: "data" | "controls" | "analysis" | "decision";
  readonly label: string;
  readonly state: StepperState;
}

/**
 * Fil d'Ariane Données → Contrôles → Analyse → Décision.
 * - Données : franchie si toutes les pièces attendues sont au dossier.
 * - Contrôles : franchie si des contrôles ont été exécutés.
 * - Analyse : en cours tant que le statut d'attention n'est pas « positif ».
 * - Décision : en cours dès qu'un événement de revue est enregistré.
 */
export function buildReviewStepper(
  datasets: TaxCockpitDatasets,
  reviewEventCount: number,
): StepperStep[] {
  const documentsComplete = capabilityItem(datasets, "documents")?.tone !== "warning";
  const hasControls = datasets.coverage.totalControls > 0;
  const analysisDone = hasControls && datasets.summary.headlineTone === "positive";
  return [
    { id: "data", label: "Données", state: documentsComplete ? "done" : "current" },
    {
      id: "controls",
      label: "Contrôles",
      state: !documentsComplete ? "pending" : hasControls ? "done" : "current",
    },
    {
      id: "analysis",
      label: "Analyse",
      state: !documentsComplete || !hasControls ? "pending" : analysisDone ? "done" : "current",
    },
    {
      id: "decision",
      label: "Décision",
      state: reviewEventCount > 0 ? "current" : "pending",
    },
  ];
}

/** `AAAA-MM-JJ` → `JJ.MM.AAAA` (mise en forme pure). */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

/** Phrases de lecture des écarts d'un jeu de barres de comparaison (valeurs du dataset). */
export function buildDifferenceReadings(
  bars: readonly {
    readonly label: string;
    readonly statusLabel: string;
    readonly differenceCents: number | null;
  }[],
  format: (cents: number) => string,
): string[] {
  return bars
    .filter((bar) => bar.differenceCents !== null && bar.differenceCents !== 0)
    .map((bar) => `${bar.label} — ${bar.statusLabel} : écart de ${format(Math.abs(bar.differenceCents!))}`);
}
