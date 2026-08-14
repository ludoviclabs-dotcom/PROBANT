import { z } from "zod";

/**
 * Core Web Vitals — collecte RUM interne.
 *
 * PROBANT n'installe **aucun connecteur SaaS** (contrainte produit) : la
 * mesure de terrain est collectée par l'application elle-même, avec l'API
 * `PerformanceObserver` du navigateur, et agrégée côté serveur.
 *
 * Les seuils sont ceux de la définition « good » des Core Web Vitals, évalués
 * au **75e percentile**, conformément à la méthodologie de référence.
 */
export const WEB_VITAL_NAMES = ["LCP", "INP", "CLS"] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];

export interface VitalBudget {
  /** Limite « good » au P75. */
  readonly good: number;
  /** Limite « needs improvement » au P75 ; au-delà, « poor ». */
  readonly needsImprovement: number;
  readonly unit: "ms" | "score";
}

export const VITAL_BUDGETS: Readonly<Record<WebVitalName, VitalBudget>> = {
  LCP: { good: 2_500, needsImprovement: 4_000, unit: "ms" },
  INP: { good: 200, needsImprovement: 500, unit: "ms" },
  CLS: { good: 0.1, needsImprovement: 0.25, unit: "score" },
};

/**
 * Pages mesurées.
 *
 * La route est normalisée vers cette liste fermée : aucune valeur venue du
 * navigateur n'entre telle quelle dans les métriques, et un identifiant de
 * dossier ne peut pas se retrouver dans une dimension de télémétrie.
 */
export const MEASURED_PAGES = [
  "landing",
  "depot",
  "synthese",
  "risques",
  "cloisons",
  "referentiel",
  "dossier-preuve",
  "autre",
] as const;

export type MeasuredPage = (typeof MEASURED_PAGES)[number];

const PAGE_PATTERNS: readonly { page: MeasuredPage; pattern: RegExp }[] = [
  { page: "landing", pattern: /^\/$/u },
  { page: "depot", pattern: /^\/dashboard\/depot(\/|$)/u },
  { page: "synthese", pattern: /^\/dashboard\/synthese(\/|$)/u },
  { page: "risques", pattern: /^\/dashboard\/risques(\/|$)/u },
  { page: "cloisons", pattern: /^\/dashboard\/cloisons(\/|$)/u },
  { page: "referentiel", pattern: /^\/dashboard\/referentiel(\/|$)/u },
  { page: "dossier-preuve", pattern: /^\/dashboard\/dossier(\/|$)/u },
];

export function classifyPage(pathname: string): MeasuredPage {
  const normalized = pathname.split("?")[0].split("#")[0];
  return PAGE_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.page ?? "autre";
}

export const vitalSampleSchema = z.object({
  name: z.enum(WEB_VITAL_NAMES),
  value: z.number().min(0).max(3_600_000),
  page: z.enum(MEASURED_PAGES),
  /** Type de navigation : distingue un chargement à froid d'une navigation SPA. */
  navigationType: z.enum(["navigate", "reload", "back-forward", "prerender", "unknown"]),
});

export type VitalSample = z.infer<typeof vitalSampleSchema>;

export const vitalBatchSchema = z.object({
  samples: z.array(vitalSampleSchema).min(1).max(20),
});

export type VitalRating = "good" | "needs-improvement" | "poor";

export function rate(name: WebVitalName, value: number): VitalRating {
  const budget = VITAL_BUDGETS[name];
  if (value <= budget.good) return "good";
  if (value <= budget.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * 75e percentile par interpolation linéaire.
 *
 * Le percentile est calculé sur les valeurs **effectivement observées** ; avec
 * peu d'échantillons il reste publiable, mais il doit être présenté comme
 * insuffisamment alimenté — d'où `sampleCount` dans le résultat.
 */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export interface VitalSummary {
  readonly name: WebVitalName;
  readonly page: MeasuredPage;
  readonly p75: number;
  readonly sampleCount: number;
  readonly rating: VitalRating;
  /** Vrai tant que l'échantillon est trop faible pour conclure. */
  readonly insufficientData: boolean;
}

/** Volume minimal en deçà duquel un P75 ne conclut rien. */
export const MINIMUM_SAMPLES = 30;

export function summarize(samples: readonly VitalSample[]): VitalSummary[] {
  const groups = new Map<string, { name: WebVitalName; page: MeasuredPage; values: number[] }>();
  for (const sample of samples) {
    const key = `${sample.page}:${sample.name}`;
    const group = groups.get(key) ?? { name: sample.name, page: sample.page, values: [] };
    group.values.push(sample.value);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const p75 = percentile(group.values, 0.75);
      return {
        name: group.name,
        page: group.page,
        p75,
        sampleCount: group.values.length,
        rating: rate(group.name, p75),
        insufficientData: group.values.length < MINIMUM_SAMPLES,
      };
    })
    .sort((left, right) =>
      left.page === right.page
        ? left.name.localeCompare(right.name)
        : left.page.localeCompare(right.page),
    );
}
