import { cents, money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertContext, assertDate, assertUnique, type CycleContext } from "./cycle-context";
import { frozen, type EvidenceLink } from "./model";
import { compareSupported, evidence, known, ratio, supportedAmountSchema, unknown, type SupportedAmount } from "./cycle-review";
export interface EquityInput {
  context: CycleContext;
  components: { id: string; accounts: string[]; opening: SupportedAmount; movements: { id: string; internalTransferId?: string; value: SupportedAmount }[]; closing: SupportedAmount }[];
  allocations: { id: string; decision: SupportedAmount | null; booked: SupportedAmount | null; payment: SupportedAmount | null; decisionReference: string; readingValidated: boolean }[];
  events: { id: string; effectiveDate: string; description: string; evidence: EvidenceLink[]; review: "pending" | "reviewed"; reviewer?: string; accountingMovementId: string | null }[];
  capitalComponentId: string; reserveComponentIds: string[];
}
export function reviewEquity(input: EquityInput) {
  assertContext(input.context); assertUnique(input.components.map((c) => c.id)); assertUnique(input.components.flatMap((c) => c.accounts)); assertUnique(input.allocations.map((a) => a.id)); assertUnique(input.events.map((e) => e.id)); assertUnique(input.components.flatMap((c) => c.movements.map((m) => m.id)));
  const rows = input.components.map((c) => {
    if (!c.accounts.length) throw new Error("EQUITY_MAPPING_REQUIRED");
    const all = [c.opening, c.closing, ...c.movements.map((m) => m.value)];
    all.forEach((v) => { supportedAmountSchema.parse(v); evidence(input.context, v.evidence); });
    if (c.opening.date !== input.context.period.startDate || c.closing.date !== input.context.period.closingDate || c.movements.some((m) => m.value.date < input.context.period.startDate || m.value.date > input.context.period.closingDate)) throw new Error("EQUITY_DATE_MISMATCH");
    const movement = money(c.movements.reduce((s, m) => s + cents(m.value.amount), 0n));
    const expected = money(cents(c.opening.amount) + cents(movement));
    const complete = all.every((v) => evidence(input.context, v.evidence)) && new Set(all.map((v) => v.basis)).size === 1;
    return { ...c, movement, expected, difference: complete ? known(money(cents(c.closing.amount) - cents(expected))) : unknown("SOURCE REQUISE : mouvements/PV") };
  });
  const transfers = new Map<string, bigint>();
  input.components.flatMap((c) => c.movements).forEach((m) => { if (m.internalTransferId) transfers.set(m.internalTransferId, (transfers.get(m.internalTransferId) ?? 0n) + cents(m.value.amount)); });
  if ([...transfers.values()].some((v) => v !== 0n)) throw new Error("UNBALANCED_INTERNAL_TRANSFER");
  input.events.forEach((e) => { assertDate(e.effectiveDate); evidence(input.context, e.evidence); if (!e.description.trim() || !["pending", "reviewed"].includes(e.review) || (e.review === "reviewed" && (!e.reviewer || !evidence(input.context, e.evidence)))) throw new Error("EQUITY_EVENT_REVIEW_REQUIRED"); });
  const allocations = input.allocations.map((a) => {
    if (a.payment) { supportedAmountSchema.parse(a.payment); evidence(input.context, a.payment.evidence); }
    return { ...a, difference: a.readingValidated && a.decisionReference.trim() ? compareSupported(input.context, a.booked, a.decision) : unknown("SOURCE REQUISE : PV et lecture validée"), paymentIsSeparate: true };
  });
  const capital = rows.find((c) => c.id === input.capitalComponentId);
  if (!capital || input.reserveComponentIds.some((id) => !rows.some((r) => r.id === id))) throw new Error("EQUITY_RATIO_MAPPING_REQUIRED");
  const closing = money(rows.reduce((s, c) => s + cents(c.closing.amount), 0n));
  const reserves = money(rows.filter((c) => input.reserveComponentIds.includes(c.id)).reduce((s, c) => s + cents(c.closing.amount), 0n));
  return frozen({ rows, allocations, events: input.events, totalVariation: money(rows.reduce((s, r) => s + cents(r.movement), 0n)), internalTransfers: [...transfers.keys()], ratios: { equityToCapital: ratio(closing, capital.closing.amount), reservesToCapital: ratio(reserves, capital.closing.amount) }, legalConclusion: unknown("SOURCE REQUISE : règle juridique applicable"), inputHash: stableSha256(input), mode: "demo" });
}
