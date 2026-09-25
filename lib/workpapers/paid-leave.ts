import { z } from "zod";
import { cents, money, type KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertContext, type CycleContext } from "./cycle-context";
import { frozen } from "./model";
import { dateSchema, evidence, known, methodEligible, supportedAmountSchema, unknown, type DocumentedMethod, type SupportedAmount } from "./cycle-review";
const quantity = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
export const leaveRightsSchema = z.object({ employeePseudonym: z.string().regex(/^SYN-[A-Z0-9-]+$/), from: dateSchema, to: dateSchema, unit: z.enum(["working_days", "business_days", "hours"]), acquired: quantity, taken: quantity, remaining: quantity });
export type LeaveRights = z.infer<typeof leaveRightsSchema>;
export interface LeaveMethodInput { rights: LeaveRights; method: DocumentedMethod | null; base: SupportedAmount; numerator: string; denominator: string; inclusions: string[]; exclusions: string[] }
export interface PaidLeaveInput { context: CycleContext; rights: LeaveRights; first: LeaveMethodInput; second: LeaveMethodInput; comparisonMethod: DocumentedMethod | null; equivalenceEvidence: SupportedAmount["evidence"]; booked: SupportedAmount | null; associatedCharges: SupportedAmount | null }
const q = (s: string) => BigInt(s.replace(".", ""));
/** Explicit rational supplied by a synthetic method, not a hard-coded tenth or social rate. */
export function calculateLeaveMethod(context: CycleContext, p: LeaveMethodInput): KnownAmount {
  assertContext(context); leaveRightsSchema.parse(p.rights); supportedAmountSchema.parse(p.base);
  if (!methodEligible(p.method, context.period.closingDate) || !evidence(context, p.base.evidence)) return unknown("SOURCE REQUISE : méthode applicable et base");
  if (!/^\d+$/.test(p.numerator) || !/^[1-9]\d*$/.test(p.denominator) || cents(p.base.amount) < 0n) throw new Error("LEAVE_CALCULATION_PARAMETERS");
  const n = cents(p.base.amount) * BigInt(p.numerator), d = BigInt(p.denominator);
  return known(money((n * 2n + d) / (2n * d)));
}
export function comparePaidLeave(input: PaidLeaveInput) {
  assertContext(input.context); leaveRightsSchema.parse(input.rights);
  if (input.rights.from > input.rights.to || input.rights.to > input.context.period.asOfDate || q(input.rights.acquired) - q(input.rights.taken) !== q(input.rights.remaining)) throw new Error("LEAVE_RIGHTS_INCONSISTENT");
  const same = stableSha256(input.rights) === stableSha256(input.first.rights) && stableSha256(input.rights) === stableSha256(input.second.rights);
  const proof = evidence(input.context, input.equivalenceEvidence);
  const first = calculateLeaveMethod(input.context, input.first), second = calculateLeaveMethod(input.context, input.second);
  const comparable = same && proof && methodEligible(input.comparisonMethod, input.context.period.closingDate) && first.kind === "known" && second.kind === "known";
  const selected = comparable && first.kind === "known" && second.kind === "known" ? known(cents(first.value) >= cents(second.value) ? first.value : second.value) : unknown("SOURCE REQUISE : mêmes droits/périodes/unités, règle de comparaison validée");
  if (input.associatedCharges) { supportedAmountSchema.parse(input.associatedCharges); evidence(input.context, input.associatedCharges.evidence); }
  let bookedDifference: KnownAmount = unknown("SOURCE REQUISE : montant comptabilisé sur droits identiques");
  if (input.booked) { supportedAmountSchema.parse(input.booked); const valid = evidence(input.context, input.booked.evidence); if (selected.kind === "known" && valid && input.booked.basis === stableSha256(input.rights) && input.booked.date === input.context.period.closingDate) bookedDifference = known(money(cents(selected.value) - cents(input.booked.amount))); }
  return frozen({ employeePseudonym: input.rights.employeePseudonym, rights: input.rights, first, second, comparable, indemnityForSpecifiedRights: selected, remainingRightsEstimate: unknown("Pas d’extrapolation aux droits restants sans méthode dédiée"), associatedCharges: input.associatedCharges, bookedDifference, methodVersions: [input.first.method, input.second.method, input.comparisonMethod], inputHash: stableSha256(input), mode: "demo", conclusion: null, warnings: ["Identifiants et montants strictement synthétiques ; aucune sécurité paie de production", "SOURCE REQUISE : règles sociales/comptables actuelles ; calcul réel désactivé"] });
}
