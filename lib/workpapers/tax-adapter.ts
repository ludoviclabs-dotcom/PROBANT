import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { TaxControlContext } from "@/lib/canonical-model/tax";
import { buildTaxCapabilityMatrix } from "@/lib/tax/control-planner";
import { TaxProfileSchema, TaxPeriodSchema } from "@/lib/tax/schemas";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertContext, assertUnique, type CycleContext } from "./cycle-context";
import { frozen } from "./model";
import { evidence, known, methodEligible, supportedAmountSchema, unknown, type DocumentedMethod, type SupportedAmount } from "./cycle-review";
export interface TaxAdapterInput {
  context: CycleContext; tax: TaxControlContext; ruleVersion: string; sourceVersions: string[];
  resultConvention: "profit_positive" | "credits_negative"; resultBasis: "before_tax" | "after_tax";
  accountingResult: SupportedAmount; clientAccountingResult: SupportedAmount;
  adjustments: { id: string; economicEventId: string; kind: "deduction" | "reintegration"; isIncomeTaxExpense: boolean; value: SupportedAmount; method: DocumentedMethod | null }[];
}
export function exactTaxCents(value: Money): number { const n = cents(value), result = Number(n); if (!Number.isSafeInteger(result) || BigInt(result) !== n) throw new Error("TAX_EXACT_RANGE_EXCEEDED"); return result; }
export function adaptTaxWorkpaper(input: TaxAdapterInput) {
  assertContext(input.context); TaxProfileSchema.parse(input.tax.profile); TaxPeriodSchema.parse(input.tax.period);
  const { scope, period } = input.context;
  if (input.tax.organizationId !== scope.organizationId || input.tax.dossierId !== scope.dossierId || input.tax.period.startDate !== period.startDate || input.tax.period.endDate !== period.closingDate || input.tax.profile.accountingPeriod.startDate !== period.startDate || input.tax.profile.accountingPeriod.endDate !== period.closingDate || input.tax.period.taxType !== "corporate_income_tax") throw new Error("TAX_ADAPTER_SCOPE_OR_PERIOD");
  if (!input.ruleVersion.trim() || !input.sourceVersions.length || !["profit_positive", "credits_negative"].includes(input.resultConvention) || !["before_tax", "after_tax"].includes(input.resultBasis)) throw new Error("TAX_ADAPTER_PARAMETERS");
  assertUnique(input.sourceVersions); assertUnique(input.adjustments.map((a) => a.id)); assertUnique(input.adjustments.map((a) => a.economicEventId));
  const supported = (v: SupportedAmount) => { supportedAmountSchema.parse(v); exactTaxCents(v.amount); const valid = evidence(input.context, v.evidence); if (v.evidence.some((e) => !input.sourceVersions.includes(e.documentVersionId))) throw new Error("TAX_SOURCE_VERSION_MISSING"); return valid && v.date === period.closingDate; };
  const accountingValid = supported(input.accountingResult), clientValid = supported(input.clientAccountingResult);
  const result = money(cents(input.accountingResult.amount) * (input.resultConvention === "credits_negative" ? -1n : 1n));
  const comparable = accountingValid && clientValid && input.accountingResult.basis === input.clientAccountingResult.basis && input.accountingResult.basis === input.resultBasis;
  const adjustments = input.adjustments.map((a) => {
    const valid = supported(a.value);
    if (!["deduction", "reintegration"].includes(a.kind) || cents(a.value.amount) < 0n) throw new Error("TAX_ADJUSTMENT_SIGN");
    if (a.isIncomeTaxExpense && (input.resultBasis === "before_tax" || a.kind !== "reintegration")) throw new Error("TAX_EXPENSE_DOUBLE_ADJUSTMENT");
    return { ...a, eligible: valid && methodEligible(a.method, period.closingDate), status: "human_review_required" };
  });
  const fiscalBridge: KnownAmount = comparable && adjustments.every((a) => a.eligible) ? known(money(adjustments.reduce((s, a) => s + cents(a.value.amount) * (a.kind === "reintegration" ? 1n : -1n), cents(result)))) : unknown("SOURCE REQUISE : résultat cadré et retraitements documentés");
  const capabilities = buildTaxCapabilityMatrix(input.tax);
  return frozen({ missionId: scope.dossierId, periodId: scope.periodId, mode: scope.mode, sourceVersions: input.sourceVersions, taxProfileId: input.tax.profile.id, taxProfileVersion: input.tax.profile.version, ruleVersion: input.ruleVersion, accountingResult: result, accountingDifference: comparable ? known(money(cents(result) - cents(input.clientAccountingResult.amount))) : unknown("Bases comptables non comparables"), adjustments, fiscalBridge, taxDue: unknown("Moteur IS non exécuté : planification et pont descriptif seulement"), capabilities, inputHash: stableSha256(input), conclusion: null });
}
