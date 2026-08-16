import type { TaxRecommendation } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";

export interface TaxRecommendationRule {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly triggerInputCodes: readonly string[];
  readonly kind: TaxRecommendation["kind"];
  readonly title: string;
  readonly action: string;
  readonly priority: TaxRecommendation["priority"];
}

export const TAX_RECOMMENDATION_RULES: readonly TaxRecommendationRule[] = [
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_2058A",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:liasse_2050_2059"],
    kind: "request_document",
    title: "Obtenir le tableau 2058-A",
    action: "Demander la liasse 2050-2059 contenant le tableau 2058-A du millésime et de l'exercice contrôlés.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_2033B",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:liasse_2033"],
    kind: "request_document",
    title: "Obtenir le tableau 2033-B",
    action: "Demander la liasse 2033 contenant le tableau 2033-B du millésime et de l'exercice contrôlés.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_2065",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:declaration_2065"],
    kind: "request_document",
    title: "Obtenir la déclaration 2065",
    action: "Demander la déclaration 2065 du millésime et de l'exercice contrôlés.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_CA3",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:declaration_tva_ca3"],
    kind: "request_document",
    title: "Obtenir la CA3 de la période",
    action: "Demander la déclaration CA3 correspondant exactement à la période de TVA contrôlée.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_CA12",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:declaration_tva_ca12"],
    kind: "request_document",
    title: "Obtenir la CA12 de l'exercice",
    action: "Demander la déclaration annuelle CA12 correspondant exactement à l'exercice de TVA contrôlé.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.REQUEST_INVOICES",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["document:invoice"],
    kind: "additional_evidence",
    title: "Obtenir les factures associées",
    action: "Obtenir les factures et pièces justificatives associées aux écritures de TVA déductible examinées.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_CIT_REGIME",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["profile:corporateIncomeTaxRegime"],
    kind: "human_confirmation",
    title: "Confirmer le régime d'impôt sur les sociétés",
    action: "Renseigner puis confirmer le régime d'imposition applicable à l'exercice.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_VAT_REGIME",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["profile:vatRegime"],
    kind: "human_confirmation",
    title: "Confirmer le régime de TVA",
    action: "Renseigner puis confirmer le régime de TVA et sa périodicité déclarative.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_CAPITAL_PAID",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["profile:capitalPaidStatus"],
    kind: "human_confirmation",
    title: "Confirmer la libération du capital",
    action: "Documenter et confirmer si le capital est entièrement libéré pour la période contrôlée.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_OWNERSHIP",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["profile:ownershipStatus"],
    kind: "human_confirmation",
    title: "Confirmer le taux de détention",
    action: "Documenter et confirmer le taux et la nature de la détention du capital pour la période contrôlée.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_TURNOVER",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["profile:turnoverAmountCents"],
    kind: "human_confirmation",
    title: "Confirmer le chiffre d'affaires",
    action: "Renseigner et justifier le chiffre d'affaires de référence de l'exercice.",
    priority: "required",
  },
  {
    ruleId: "TAX.RECOMMENDATION.CONFIRM_PERIOD",
    ruleVersion: "1.0.0",
    triggerInputCodes: ["period:accountingPeriodAlignment"],
    kind: "human_confirmation",
    title: "Confirmer la période contrôlée",
    action: "Confirmer le rattachement entre la période fiscale, l'exercice comptable et les documents déposés.",
    priority: "required",
  },
] as const;

const ruleById = new Map(TAX_RECOMMENDATION_RULES.map((rule) => [rule.ruleId, rule]));

export function recommendationsForMissingInputs(input: {
  readonly controlId: string;
  readonly missingInputCodes: readonly string[];
  readonly allowedRuleIds: readonly string[];
}): readonly TaxRecommendation[] {
  const missing = new Set(input.missingInputCodes);
  return [...input.allowedRuleIds]
    .sort()
    .flatMap((ruleId) => {
      const rule = ruleById.get(ruleId);
      if (!rule) throw new Error(`TAX_RECOMMENDATION_RULE_UNKNOWN:${ruleId}`);
      const requestedInputCodes = rule.triggerInputCodes.filter((code) => missing.has(code)).sort();
      if (requestedInputCodes.length === 0) return [];
      const recommendation = {
        recommendationId: `${rule.ruleId}:${input.controlId}`,
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
        kind: rule.kind,
        title: rule.title,
        action: rule.action,
        requestedInputCodes,
        controlIds: [input.controlId],
        priority: rule.priority,
      } satisfies Omit<TaxRecommendation, "recommendationHash">;
      return [{ ...recommendation, recommendationHash: stableHash(recommendation) }];
    });
}

