import { log } from "./logger";
import { sanitizeLogFields } from "./fields";

/**
 * Métriques métier PROBANT.
 *
 * Le plan de refonte fixe la liste des SLI ; aucun SLO chiffré n'est déclaré
 * ici tant que le corpus de benchmark n'existe pas — annoncer un objectif non
 * mesuré serait inventer une capacité.
 *
 * Les métriques sont émises comme des lignes de log structurées : un
 * collecteur (OTel, Datadog, Vercel Log Drain) les agrège sans que PROBANT
 * embarque un SDK de télémétrie.
 */
export const BUSINESS_METRICS = [
  "ingestion_duration_ms",
  "parse_rows_per_second",
  "control_duration_ms",
  "snapshot_build_duration_ms",
  "export_duration_ms",
  "job_error_rate",
] as const;

export type BusinessMetric = (typeof BUSINESS_METRICS)[number];

export interface MetricDimensions {
  readonly organizationId?: string;
  readonly dossierId?: string;
  readonly jobId?: string;
  readonly documentType?: "fec" | "balance" | "pdf" | "cycle_document";
  readonly outcome?: "success" | "denied" | "rejected" | "error";
  readonly parserVersion?: string;
}

export function recordMetric(
  metric: BusinessMetric,
  value: number,
  dimensions: MetricDimensions = {},
): void {
  if (!Number.isFinite(value) || value < 0) return;
  const safe = sanitizeLogFields({ ...dimensions });
  log("info", "metric", {
    ...safe,
    // Le nom et la valeur passent par des champs dédiés du schéma de log.
    metricName: metric,
    metricValue: value,
  });
}

/** Chronomètre une opération et émet la métrique correspondante. */
export async function measure<T>(
  metric: BusinessMetric,
  dimensions: MetricDimensions,
  operation: () => Promise<T>,
  clock: () => number = () => performance.now(),
): Promise<T> {
  const started = clock();
  try {
    const result = await operation();
    recordMetric(metric, clock() - started, { ...dimensions, outcome: "success" });
    return result;
  } catch (error) {
    recordMetric(metric, clock() - started, { ...dimensions, outcome: "error" });
    throw error;
  }
}

/** Débit de parsing : lignes par seconde, arrondi au dixième. */
export function rowsPerSecond(lineCount: number, durationMs: number): number {
  if (durationMs <= 0 || lineCount <= 0) return 0;
  return Math.round((lineCount / (durationMs / 1_000)) * 10) / 10;
}
