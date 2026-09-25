import { cents, money, type KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertContext, assertDate, type CycleContext } from "./cycle-context";
import { frozen, type EvidenceLink } from "./model";
import { compareSupported, evidence, known, methodEligible, supportedAmountSchema, unknown, type DocumentedMethod, type SupportedAmount } from "./cycle-review";
export interface InvestmentInput {
  context: CycleContext; securityId: string; categoryProposed: string; intention: string; classificationMethod: DocumentedMethod | null;
  distribution: SupportedAmount | null;
  rights: { classId: string; from: string; to: string; entitlementDate: string; numerator: string; denominator: string; homogeneous: boolean; evidence: EvidenceLink[] } | null;
  bookedDividend: SupportedAmount | null; receivedDividend: SupportedAmount | null;
  cost: SupportedAmount; bookedImpairment: SupportedAmount | null;
  externalModel: { id: string; version: string; nature: "enterprise_value" | "equity_value" | "holding_value"; securityId: string; units: "EUR"; value: SupportedAmount; assumptions: string[]; scenarios: { label: string; value: SupportedAmount }[] } | null;
}
export function reviewInvestment(input: InvestmentInput) {
  assertContext(input.context);
  if (!input.securityId.trim() || !input.intention.trim()) throw new Error("INVESTMENT_IDENTITY_REQUIRED");
  [input.cost, input.distribution, input.bookedDividend, input.receivedDividend, input.bookedImpairment].forEach((v) => { if (v) { supportedAmountSchema.parse(v); evidence(input.context, v.evidence); } });
  let expectedDividend: KnownAmount = unknown("SOURCE REQUISE : distribution votée et droits homogènes documentés");
  const r = input.rights;
  if (r) {
    [r.from, r.to, r.entitlementDate].forEach(assertDate); evidence(input.context, r.evidence);
    if (!r.classId || !/^\d+$/.test(r.numerator) || !/^[1-9]\d*$/.test(r.denominator) || BigInt(r.numerator) > BigInt(r.denominator) || r.from > r.to) throw new Error("INVESTMENT_RIGHTS_INVALID");
    if (input.distribution && r.homogeneous && r.from <= r.entitlementDate && r.entitlementDate <= r.to && r.entitlementDate <= input.context.period.asOfDate && evidence(input.context, r.evidence) && evidence(input.context, input.distribution.evidence)) {
      const n = cents(input.distribution.amount) * BigInt(r.numerator), d = BigInt(r.denominator);
      if (n < 0n) throw new Error("NEGATIVE_DISTRIBUTION");
      expectedDividend = known(money((2n * n + d) / (2n * d)));
    }
  }
  const expected = expectedDividend.kind === "known" && input.distribution ? { ...input.distribution, amount: expectedDividend.value } : null;
  let valueDifference: KnownAmount = unknown("SOURCE REQUISE : modèle versionné, nature/date/périmètre de valeur comparables");
  const model = input.externalModel;
  if (model) {
    supportedAmountSchema.parse(model.value); evidence(input.context, model.value.evidence);
    model.scenarios.forEach((s) => { supportedAmountSchema.parse(s.value); evidence(input.context, s.value.evidence); });
    if (model.id && model.version && model.nature === "holding_value" && model.units === "EUR" && model.securityId === input.securityId && model.value.date === input.context.period.closingDate && model.assumptions.length) valueDifference = compareSupported(input.context, model.value, input.cost);
  }
  return frozen({ securityId: input.securityId, categoryProposed: input.categoryProposed, classificationStatus: methodEligible(input.classificationMethod, input.context.period.closingDate) ? "documented_pending_review" : "à qualifier — SOURCE REQUISE", expectedDividend, bookedDifference: compareSupported(input.context, input.bookedDividend, expected), receivedDividend: input.receivedDividend, valueDifference, bookedImpairment: input.bookedImpairment, externalModel: model, accountingProposal: null, inputHash: stableSha256(input), mode: "demo", limitations: ["Aucun classement sur seuil 10 %, aucun choix automatique du modèle le plus favorable", "Dividende fondé sur distribution votée, jamais bénéfice total", "Valeur et coût ne sont pas deux expositions à additionner"] });
}
