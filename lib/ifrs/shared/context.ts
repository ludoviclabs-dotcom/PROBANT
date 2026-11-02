import { z } from "zod";
import { isCivilDate, periodIssues, type AccountingPeriod } from "@/lib/canonical-model/period";
import { assertScope, periodId, scopeSchema, type WorkpaperScope } from "@/lib/workpapers/model";

/**
 * Contexte d'un atelier IFRS (C00 § 4.1) : dossier, exercice, référentiel et première application.
 * Le périmètre et la période viennent du serveur (session et feuille) ; seul le référentiel est déclaré par le travail de la feuille.
 */
export const IFRS_JURISDICTIONS = ["IASB", "EU_adopted"] as const;
export type IfrsJurisdiction = typeof IFRS_JURISDICTIONS[number];
export const ifrsFrameworkSchema = z.object({
  standard: z.literal("IFRS 16"), jurisdiction: z.enum(IFRS_JURISDICTIONS),
  edition: z.string().trim().min(1).max(100), editionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
/** Aucune méthode de transition n'est choisie en V1 (X32) : la première application est toujours « non applicable », avec son motif. */
export const firstApplicationSchema = z.object({ kind: z.literal("not_applicable"), reason: z.string().trim().min(1).max(2000) }).strict();
export const ifrsPeriodSchema = z.object({
  startDate: z.string().refine(isCivilDate), closingDate: z.string().refine(isCivilDate), asOfDate: z.string().refine(isCivilDate),
  currency: z.literal("EUR"), validation: z.enum(["provisional", "confirmed"]),
  comparative: z.object({ startDate: z.string().refine(isCivilDate), closingDate: z.string().refine(isCivilDate) }).strict().optional(),
}).strict().refine(p => !periodIssues(p as AccountingPeriod).length);
export const ifrsContextSchema = z.object({ scope: scopeSchema, period: ifrsPeriodSchema, framework: ifrsFrameworkSchema, firstApplication: firstApplicationSchema }).strict();
export type IfrsFramework = z.infer<typeof ifrsFrameworkSchema>;
export type IfrsContext = { scope: WorkpaperScope; period: AccountingPeriod; framework: IfrsFramework; firstApplication: z.infer<typeof firstApplicationSchema> };

/** Contexte admis pour ce périmètre serveur : un autre dossier, une autre organisation, un autre mode ou un autre exercice est refusé. */
export function assertIfrsContext(expected: WorkpaperScope, value: unknown): IfrsContext {
  const parsed = ifrsContextSchema.safeParse(value);
  if (!parsed.success) throw new Error("L16_REQUEST_INVALID");
  const context = parsed.data as IfrsContext;
  assertScope(expected, context.scope);
  if (periodId(context.period) !== expected.periodId) throw new Error("WORKPAPER_PERIOD_INVALID");
  return context;
}

/**
 * Motifs qui empêchent une exécution réelle pour ce référentiel, indépendamment du moteur.
 * X33 : la juridiction `EU_adopted` n'est activable en réel qu'avec la relecture nommée du texte UE (`euReviewedText`, null sinon), et
 * seulement pour l'édition relue : une feuille qui déclare une autre empreinte d'édition reste bloquée.
 */
export function frameworkBlockers(framework: IfrsFramework, mode: WorkpaperScope["mode"], euReviewedText: { sha256: string } | null): string[] {
  if (mode !== "real" || framework.jurisdiction !== "EU_adopted") return [];
  if (!euReviewedText) return ["X33 : texte de l'Union européenne sans relecture personnelle nommée, juridiction EU_adopted non activable en réel"];
  return framework.editionFingerprint === euReviewedText.sha256 ? [] : ["X33 : édition déclarée différente du texte de l'Union européenne relu"];
}
