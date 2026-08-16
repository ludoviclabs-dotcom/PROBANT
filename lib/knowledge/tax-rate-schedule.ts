/**
 * Bareme d'impot sur les societes : plan connaissance, jamais le code applicatif.
 *
 * TAX-01 a livre les regles normatives (`initial-rule-versions.json`) mais leurs
 * taux n'existent que dans une expression textuelle non exploitable. Ce module
 * ajoute la forme structuree correspondante et refuse de demarrer si elle cesse
 * d'etre adossee a une regle et a une version de source existantes.
 *
 * Consequence voulue : un changement de millesime est un ajout de donnee, pas une
 * modification de moteur. Un millesime absent reste absent ; aucun repli sur
 * « le bareme le plus proche » n'est possible.
 */
import { z } from "zod";
import schedulesData from "@/data/tax/rates/is-rate-schedules.json";
import { taxKnowledgeRegistry } from "./tax-registry";

const CentAmountSchema = z.number().int().safe();
const BasisPointsSchema = z.number().int().min(0).max(10_000);

const RateConditionSchema = z.discriminatedUnion("operator", [
  z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    profileInput: z.string().min(1),
    operator: z.literal("lte_cents"),
    thresholdCents: CentAmountSchema.nonnegative(),
  }),
  z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    profileInput: z.string().min(1),
    operator: z.literal("equals_enum"),
    expectedValue: z.string().min(1),
  }),
  z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    profileInput: z.string().min(1),
    operator: z.literal("gte_basis_points"),
    thresholdBasisPoints: BasisPointsSchema,
  }),
]);

const RateBracketSchema = z.object({
  code: z.string().min(1),
  order: z.number().int().positive(),
  label: z.string().min(1),
  rateBasisPoints: BasisPointsSchema,
  /** Plafond de base imposable absorbee par la tranche. `null` = tranche terminale. */
  baseCapCents: CentAmountSchema.positive().nullable(),
  ruleVersionId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
  conditions: z.array(RateConditionSchema),
});

const DeficitCarryforwardSchema = z.object({
  ruleVersionId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  locator: z.string().min(1),
  /** Franchise imputable sans limitation de taux. */
  baseAllowanceCents: CentAmountSchema.nonnegative(),
  /** Part imputable de la fraction du benefice excedant la franchise. */
  marginalRateBasisPoints: BasisPointsSchema,
});

const RateScheduleSchema = z.object({
  id: z.string().min(1),
  taxType: z.literal("corporate_income_tax"),
  fiscalYear: z.number().int().min(2000).max(2200),
  formVintages: z.array(z.number().int().min(2000).max(2200)).min(1),
  currency: z.literal("EUR"),
  roundingRule: z.literal("half_up_cent"),
  status: z.enum(["effective", "future", "superseded", "review_required"]),
  lastVerifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  brackets: z.array(RateBracketSchema).min(1),
  deficitCarryforward: DeficitCarryforwardSchema,
}).superRefine((schedule, ctx) => {
  const orders = schedule.brackets.map((bracket) => bracket.order);
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brackets"], message: "ordre de tranche duplique" });
  }
  const terminal = schedule.brackets.filter((bracket) => bracket.baseCapCents === null);
  if (terminal.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brackets"], message: "un bareme doit porter exactement une tranche terminale" });
  }
  const last = [...schedule.brackets].sort((left, right) => left.order - right.order).at(-1);
  if (last && last.baseCapCents !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brackets"], message: "la tranche terminale doit etre la derniere" });
  }
});

export const TaxRateScheduleSchema = RateScheduleSchema;
export type TaxRateCondition = z.infer<typeof RateConditionSchema>;
export type TaxRateBracket = z.infer<typeof RateBracketSchema>;
export type TaxDeficitCarryforwardRule = z.infer<typeof DeficitCarryforwardSchema>;
export type TaxRateSchedule = z.infer<typeof RateScheduleSchema>;

export const taxRateSchedules: readonly TaxRateSchedule[] = Object.freeze(
  z.array(RateScheduleSchema).parse(schedulesData),
);

/**
 * Le bareme n'est pas une source autonome : chaque tranche doit pointer une regle
 * et une version de source deja publiees par le registre TAX-01.
 */
function assertAnchoredInRegistry(schedules: readonly TaxRateSchedule[]): void {
  const ruleIds = new Set(taxKnowledgeRegistry.rules.map((rule) => rule.id));
  const sourceVersionIds = new Set(taxKnowledgeRegistry.sourceVersions.map((version) => version.id));
  const errors: string[] = [];
  for (const schedule of schedules) {
    const anchors = [
      ...schedule.brackets.map((bracket) => ({ scope: `bracket:${bracket.code}`, ...bracket })),
      { scope: "deficitCarryforward", ...schedule.deficitCarryforward },
    ];
    for (const anchor of anchors) {
      if (!ruleIds.has(anchor.ruleVersionId)) {
        errors.push(`${schedule.id}/${anchor.scope}: regle inconnue ${anchor.ruleVersionId}`);
      }
      if (!sourceVersionIds.has(anchor.sourceVersionId)) {
        errors.push(`${schedule.id}/${anchor.scope}: version de source inconnue ${anchor.sourceVersionId}`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Bareme IS non adosse au registre :\n${errors.join("\n")}`);
  }
}

assertAnchoredInRegistry(taxRateSchedules);

/**
 * Selection fermee : exercice ET millesime doivent correspondre. Renvoie
 * `undefined` plutot qu'un bareme approchant.
 */
export function findCorporateTaxRateSchedule(options: {
  readonly fiscalYear: number;
  readonly formVintage: number;
}): TaxRateSchedule | undefined {
  return taxRateSchedules.find((schedule) =>
    schedule.status === "effective" &&
    schedule.fiscalYear === options.fiscalYear &&
    schedule.formVintages.includes(options.formVintage));
}

export function orderedBrackets(schedule: TaxRateSchedule): readonly TaxRateBracket[] {
  return [...schedule.brackets].sort((left, right) => left.order - right.order);
}
