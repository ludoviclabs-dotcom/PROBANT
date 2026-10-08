import { cents, money, type KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertDate, assertEquityContext, assertUnique, type CycleContext } from "./cycle-context";
import { frozen, type EvidenceLink } from "./model";
import { evidence, known, ratio, supportedAmountSchema, unknown, type SupportedAmount } from "./cycle-review";
/**
 * Equity components, decisions and events. A component whose opening or closing is not established stays unknown (never zero);
 * ratios are exact arithmetic, never a legal conclusion. Real mode is reserved to the qualified equity procedure (Mission 11).
 */
export interface EquityInput {
  context: CycleContext;
  components: { id: string; accounts: string[]; opening: SupportedAmount | null; movements: { id: string; internalTransferId?: string; value: SupportedAmount }[]; closing: SupportedAmount | null }[];
  allocations: { id: string; decision: SupportedAmount | null; booked: SupportedAmount | null; payment: SupportedAmount | null; decisionReference: string; readingValidated: boolean }[];
  events: { id: string; effectiveDate: string; description: string; evidence: EvidenceLink[]; review: "pending" | "reviewed"; reviewer?: string; accountingMovementId: string | null }[];
  /** null = capital not established: ratios stay unknown. */
  capitalComponentId: string | null;
  /** null = reserves not established: the reserves ratio stays unknown, never computed on an empty set. */
  reserveComponentIds: string[] | null;
}
/** Comparison on the equity context (demo or qualified real procedure); bases, dates and proofs must agree. */
export function compareEquitySupported(context: CycleContext, left: SupportedAmount | null, right: SupportedAmount | null): KnownAmount {
  assertEquityContext(context);
  if (!left || !right) return unknown("SOURCE REQUISE : deux montants documentés");
  supportedAmountSchema.parse(left); supportedAmountSchema.parse(right);
  if (!evidence(context, left.evidence) || !evidence(context, right.evidence) || left.date !== right.date || left.basis !== right.basis) return unknown("Bases, dates ou preuves non comparables");
  return known(money(cents(left.amount) - cents(right.amount)));
}
export function reviewEquity(input: EquityInput) {
  const context = input.context;
  assertEquityContext(context); assertUnique(input.components.map((c) => c.id)); assertUnique(input.components.flatMap((c) => c.accounts)); assertUnique(input.allocations.map((a) => a.id)); assertUnique(input.events.map((e) => e.id)); assertUnique(input.components.flatMap((c) => c.movements.map((m) => m.id)));
  const rows = input.components.map((c) => {
    if (!c.accounts.length) throw new Error("EQUITY_MAPPING_REQUIRED");
    const all = [c.opening, c.closing, ...c.movements.map((m) => m.value)].filter((v): v is SupportedAmount => !!v);
    all.forEach((v) => { supportedAmountSchema.parse(v); evidence(context, v.evidence); });
    if ((c.opening && c.opening.date !== context.period.startDate) || (c.closing && c.closing.date !== context.period.closingDate) || c.movements.some((m) => m.value.date < context.period.startDate || m.value.date > context.period.closingDate)) throw new Error("EQUITY_DATE_MISMATCH");
    const movement = money(c.movements.reduce((s, m) => s + cents(m.value.amount), 0n));
    const expected = c.opening ? money(cents(c.opening.amount) + cents(movement)) : null;
    const complete = !!c.opening && !!c.closing && all.every((v) => evidence(context, v.evidence)) && new Set(all.map((v) => v.basis)).size === 1;
    const difference = complete && expected ? known(money(cents(c.closing!.amount) - cents(expected))) : unknown(!c.opening || !c.closing ? "Composante incomplète : ouverture ou clôture non établie — aucune valeur réputée nulle" : "SOURCE REQUISE : mouvements/PV");
    return { ...c, movement, expected, difference };
  });
  const transfers = new Map<string, bigint>();
  input.components.flatMap((c) => c.movements).forEach((m) => { if (m.internalTransferId) transfers.set(m.internalTransferId, (transfers.get(m.internalTransferId) ?? 0n) + cents(m.value.amount)); });
  if ([...transfers.values()].some((v) => v !== 0n)) throw new Error("UNBALANCED_INTERNAL_TRANSFER");
  input.events.forEach((e) => { assertDate(e.effectiveDate); evidence(context, e.evidence); if (!e.description.trim() || !["pending", "reviewed"].includes(e.review) || (e.review === "reviewed" && (!e.reviewer || !evidence(context, e.evidence)))) throw new Error("EQUITY_EVENT_REVIEW_REQUIRED"); });
  const allocations = input.allocations.map((a) => {
    if (a.payment) { supportedAmountSchema.parse(a.payment); evidence(context, a.payment.evidence); }
    return { ...a, difference: a.readingValidated && a.decisionReference.trim() ? compareEquitySupported(context, a.booked, a.decision) : unknown("SOURCE REQUISE : PV et lecture validée"), paymentIsSeparate: true };
  });
  const capital = input.capitalComponentId === null ? null : rows.find((c) => c.id === input.capitalComponentId);
  if ((input.capitalComponentId !== null && !capital) || (input.reserveComponentIds ?? []).some((id) => !rows.some((r) => r.id === id))) throw new Error("EQUITY_RATIO_MAPPING_REQUIRED");
  const closings = rows.map((c) => c.closing);
  const closing = closings.every((c): c is SupportedAmount => !!c) ? money(closings.reduce((s, c) => s + cents(c.amount), 0n)) : null;
  const reserveRows = input.reserveComponentIds === null ? null : rows.filter((c) => input.reserveComponentIds!.includes(c.id));
  const reserves = reserveRows && reserveRows.every((c) => !!c.closing) ? money(reserveRows.reduce((s, c) => s + cents(c.closing!.amount), 0n)) : null;
  const capitalClosing = capital?.closing?.amount ?? null;
  const ratios = {
    equityToCapital: !capitalClosing ? unknown("Capital non établi : rapport non calculé") : !closing ? unknown("Capitaux propres incomplets : rapport non calculé") : ratio(closing, capitalClosing),
    reservesToCapital: !capitalClosing ? unknown("Capital non établi : rapport non calculé") : !reserves ? unknown("Réserves non établies : rapport non calculé") : ratio(reserves, capitalClosing),
  };
  return frozen({ rows, allocations, events: input.events, totalVariation: money(rows.reduce((s, r) => s + cents(r.movement), 0n)), internalTransfers: [...transfers.keys()], ratios, legalConclusion: unknown("SOURCE REQUISE : règle juridique applicable"), inputHash: stableSha256(input), mode: context.scope.mode });
}
