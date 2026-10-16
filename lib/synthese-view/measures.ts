import type { Finding, Severity } from "@/lib/canonical-model/finding";
import type { SynthesisSnapshot } from "@/lib/synthesis/types";
import type { VisualizationDataset } from "@/lib/visualization/types";
import type { ReviewStage, ReviewTally } from "./review";

/**
 * Trois mesures de décision (admissibilité du FEC, couverture, avancement de la revue) et le signal heuristique.
 * Tout est lu dans le snapshot et les datasets ; aucun ratio n'est fabriqué : sans dénominateur qualifié, la
 * couverture reste « non qualifiée » et ne porte aucun pourcentage.
 */

/* ── Signal heuristique ─────────────────────────────────────────────────── */

export type SignalBand = "faible" | "modéré" | "notable" | "élevé";

export interface SignalView {
  index: number;
  band: SignalBand;
  /** 20 segments de 5 points : plein si le segment est atteint. */
  segments: boolean[];
  aria: string;
}

export function bandOf(index: number): SignalBand {
  return index >= 60 ? "élevé" : index >= 40 ? "notable" : index >= 20 ? "modéré" : "faible";
}

export function buildSignalView(index: number): SignalView {
  const band = bandOf(index);
  return {
    index,
    band,
    segments: Array.from({ length: 20 }, (_, i) => (i + 1) * 5 <= index),
    aria: `Signal heuristique ${index} sur 100, niveau ${band}. Paramètre interne, non opposable.`,
  };
}

/* ── Admissibilité du FEC ───────────────────────────────────────────────── */

export interface AdmissibilityMeasure {
  word: string;
  /** Gravité du glyphe qui double le mot ; null si le fichier est admissible. */
  glyph: Severity | null;
  /** Une graduation par zone réglementaire (18) ; `flagged` pour celles qui portent une alerte. */
  ticks: { zone: string; flagged: boolean }[];
  text: string;
}

export function buildAdmissibilityMeasure(
  synthesis: SynthesisSnapshot,
  fecQuality: VisualizationDataset,
  admissibilityFindings: readonly Finding[],
): AdmissibilityMeasure {
  const { status, blockingCount } = synthesis.admissibility;
  const ticks = fecQuality.rows.map((row) => ({ zone: String(row.cells.zone), flagged: row.emphasis === "critical" }));
  const zones = ticks.filter((t) => t.flagged).map((t) => t.zone);
  const lines = new Set(admissibilityFindings.filter((f) => f.severity === "bloquant").flatMap((f) => f.lignesSource));
  const word = status === "rejected" ? "rejetée" : status === "admissible_with_alerts" ? "avec alertes" : "admissible";
  const glyph: Severity | null = status === "rejected" ? "bloquant" : status === "admissible_with_alerts" ? "majeur" : null;

  let text: string;
  if (status === "admissible") {
    text = `aucune alerte d’admissibilité · ${ticks.length} zones réglementaires`;
  } else {
    const parts = [`${blockingCount} ${blockingCount > 1 ? "alertes bloquantes" : "alerte bloquante"}`];
    if (zones.length) parts.push(`${zones.length > 1 ? "zones" : "zone"} ${zones.join(", ")}`);
    if (lines.size) parts.push(`${lines.size} ${lines.size > 1 ? "lignes" : "ligne"}`);
    text = parts.join(" · ");
  }
  return { word, glyph, ticks, text };
}

/* ── Couverture ─────────────────────────────────────────────────────────── */

export interface CoveragePopulationView {
  id: string;
  label: string;
  /** État de la population, dans les mots du dataset : « Population manquante », « Dénominateur non qualifié »… */
  state: string;
  /** Ratio qualifié, sinon null : aucune barre ni pourcentage sans dénominateur. */
  ratio: number | null;
  detail: string;
}

export interface CoverageMeasure {
  word: string;
  populations: CoveragePopulationView[];
  aria: string;
}

const COVERAGE_WORD: Record<SynthesisSnapshot["coverage"]["status"], string> = {
  unqualified: "non qualifiée",
  none: "nulle",
  partial: "partielle",
  substantial: "substantielle",
};

export function buildCoverageMeasure(synthesis: SynthesisSnapshot, coverage: VisualizationDataset): CoverageMeasure {
  const word = COVERAGE_WORD[synthesis.coverage.status];
  const populations = coverage.rows.map((row): CoveragePopulationView => {
    const ratio = row.cells.ratio === null || row.cells.ratio === undefined ? null : Number(row.cells.ratio);
    return {
      id: row.id,
      label: String(row.cells.dimension),
      state: String(row.cells.statut),
      ratio,
      detail: ratio === null ? String(row.cells.base) : `${row.cells.fait}/${row.cells.total} · ${ratio} %`,
    };
  });
  return { word, populations, aria: `Couverture ${word}. ${populations.map((p) => `${p.label} : ${p.state}`).join(" ; ")}.` };
}

/* ── Avancement de la revue ─────────────────────────────────────────────── */

export interface ReviewMeasure {
  reviewed: number;
  total: number;
  pct: number;
  /** Une graduation par constat, dans l'ordre du snapshot. */
  ticks: { id: string; stage: ReviewStage }[];
  text: string;
}

export function buildReviewMeasure(synthesis: SynthesisSnapshot, stages: ReadonlyMap<string, ReviewStage>, tally: ReviewTally): ReviewMeasure {
  const parts: string[] = [];
  if (tally.proposed) parts.push(`${tally.proposed} validé${tally.proposed > 1 ? "s" : ""}`);
  if (tally.corrected) parts.push(`${tally.corrected} corrigé${tally.corrected > 1 ? "s" : ""}`);
  if (tally.dismissed) parts.push(`${tally.dismissed} écarté${tally.dismissed > 1 ? "s" : ""}`);
  parts.push(`${tally.pending} en attente`);
  return {
    reviewed: synthesis.review.reviewedCount,
    total: synthesis.review.totalCount,
    pct: synthesis.review.pct,
    ticks: [...stages].map(([id, stage]) => ({ id, stage })),
    text: parts.join(" · "),
  };
}
