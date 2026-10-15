import { z } from "zod";
import { cents, money, type KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertPayrollLeaveContext, type CycleContext } from "./cycle-context";
import { frozen } from "./model";
import { dateSchema, evidence, known, methodEligible, supportedAmountSchema, unknown, type DocumentedMethod, type SupportedAmount } from "./cycle-review";
export type LeaveDocumentedMethod = Omit<DocumentedMethod, "synthetic"> & { synthetic: boolean };
const quantity = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
export const leaveRightsSchema = z.object({ employeePseudonym: z.string().regex(/^SYN-[A-Z0-9-]+$/), from: dateSchema, to: dateSchema, unit: z.enum(["working_days", "business_days", "hours"]), acquired: quantity, taken: quantity, remaining: quantity });
export type LeaveRights = z.infer<typeof leaveRightsSchema>;
export interface LeaveMethodInput { rights: LeaveRights; method: LeaveDocumentedMethod | null; base: SupportedAmount; numerator: string; denominator: string; inclusions: string[]; exclusions: string[] }
export interface PaidLeaveInput { context: CycleContext; rights: LeaveRights; first: LeaveMethodInput; second: LeaveMethodInput; comparisonMethod: LeaveDocumentedMethod | null; equivalenceEvidence: SupportedAmount["evidence"]; booked: SupportedAmount | null; associatedCharges: SupportedAmount | null }
function eligible(context: CycleContext, method: LeaveDocumentedMethod | null) {
  if (context.scope.mode === "demo") return method?.synthetic === true && methodEligible(method as DocumentedMethod, context.period.closingDate);
  if (!method || method.synthetic || !method.source.trim() || !method.approvedBy.trim()) return false;
  dateSchema.parse(method.from); dateSchema.parse(method.to);
  return !!method.id && !!method.version && method.from <= context.period.closingDate && context.period.closingDate <= method.to;
}
const q = (s: string) => BigInt(s.replace(".", ""));
/** Explicit rational supplied by a synthetic method, not a hard-coded tenth or social rate. */
export function calculateLeaveMethod(context: CycleContext, p: LeaveMethodInput): KnownAmount {
  assertPayrollLeaveContext(context); leaveRightsSchema.parse(p.rights); supportedAmountSchema.parse(p.base);
  if (!eligible(context, p.method) || !evidence(context, p.base.evidence)) return unknown("SOURCE REQUISE : méthode applicable et base");
  if (!/^\d+$/.test(p.numerator) || !/^[1-9]\d*$/.test(p.denominator) || cents(p.base.amount) < 0n) throw new Error("LEAVE_CALCULATION_PARAMETERS");
  const n = cents(p.base.amount) * BigInt(p.numerator), d = BigInt(p.denominator);
  return known(money((n * 2n + d) / (2n * d)));
}
export function comparePaidLeave(input: PaidLeaveInput) {
  assertPayrollLeaveContext(input.context); leaveRightsSchema.parse(input.rights);
  if (input.rights.from > input.rights.to || input.rights.to > input.context.period.asOfDate || q(input.rights.acquired) - q(input.rights.taken) !== q(input.rights.remaining)) throw new Error("LEAVE_RIGHTS_INCONSISTENT");
  const same = stableSha256(input.rights) === stableSha256(input.first.rights) && stableSha256(input.rights) === stableSha256(input.second.rights);
  const proof = evidence(input.context, input.equivalenceEvidence);
  const first = calculateLeaveMethod(input.context, input.first), second = calculateLeaveMethod(input.context, input.second);
  const qualification = input.context.scope.mode === "demo" || [input.first, input.second].every(m => m.inclusions.some(s => s.trim()) && m.exclusions.some(s => s.trim()));
  const comparable = qualification && same && proof && eligible(input.context, input.comparisonMethod) && first.kind === "known" && second.kind === "known";
  const selected = comparable && first.kind === "known" && second.kind === "known" ? known(cents(first.value) >= cents(second.value) ? first.value : second.value) : unknown("SOURCE REQUISE : mêmes droits/périodes/unités, règle de comparaison validée");
  if (input.associatedCharges) { supportedAmountSchema.parse(input.associatedCharges); evidence(input.context, input.associatedCharges.evidence); }
  let bookedDifference: KnownAmount = unknown("SOURCE REQUISE : montant comptabilisé sur droits identiques");
  if (input.booked) { supportedAmountSchema.parse(input.booked); const valid = evidence(input.context, input.booked.evidence); if (selected.kind === "known" && valid && input.booked.basis === stableSha256(input.rights) && input.booked.date === input.context.period.closingDate) bookedDifference = known(money(cents(selected.value) - cents(input.booked.amount))); }
  return frozen({ employeePseudonym: input.rights.employeePseudonym, rights: input.rights, first, second, comparable, indemnityForSpecifiedRights: selected, remainingRightsEstimate: unknown("Pas d’extrapolation aux droits restants sans méthode dédiée"), associatedCharges: input.associatedCharges && evidence(input.context, input.associatedCharges.evidence) && input.associatedCharges.basis === stableSha256(input.rights) && input.associatedCharges.date === input.context.period.closingDate ? input.associatedCharges : null, bookedDifference, methodVersions: [input.first.method, input.second.method, input.comparisonMethod], inputHash: stableSha256(input), mode: input.context.scope.mode, conclusion: null, warnings: input.context.scope.mode === "real" ? ["Comparaison sur droits spécifiés, sans conclusion sociale ou comptable automatique"] : ["Identifiants et montants strictement synthétiques ; aucune sécurité paie de production", "SOURCE REQUISE : règles sociales/comptables actuelles ; calcul réel désactivé"] });
}
