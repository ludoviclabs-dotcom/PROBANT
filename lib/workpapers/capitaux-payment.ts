import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { knownAmountSchema } from "./model";

/**
 * Settlement of a voted decision (C09) — internal method, not a legal rule.
 * Decision, booking and payment remain three separate measures: the voted magnitude is compared with
 * the payments that cite the decision, at the closing date and at the review date. An absent payments
 * source keeps every amount unknown; nothing unknown becomes zero.
 */
export const PAYMENT_STATUSES = ["paid", "partially_paid", "unpaid", "overpaid", "unknown", "not_applicable"] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Payée", partially_paid: "Partiellement payée", unpaid: "Votée, non payée", overpaid: "Paiements supérieurs au vote", unknown: "Paiement inconnu", not_applicable: "Sans paiement attendu",
};
export const paymentStateSchema = z.object({
  status: z.enum(PAYMENT_STATUSES), voted: knownAmountSchema, paidAtClosing: knownAmountSchema, paidAtReview: knownAmountSchema,
  remainingAtClosing: knownAmountSchema, remainingAtReview: knownAmountSchema, paymentIds: z.array(z.string().min(1)), meaning: z.string().min(1).max(2000),
}).strict();
export type PaymentState = z.infer<typeof paymentStateSchema>;

const known = (value: Money): KnownAmount => ({ kind: "known", value });
const na = (reason: string): KnownAmount => ({ kind: "not_applicable", reason });
const unknown = (reason: string): KnownAmount => ({ kind: "unknown", reason });

export interface PaymentInput {
  /** Voted magnitude (positive) of the decision in force, or null when the vote itself is not established. */
  voted: Money | null;
  payments: { id: string; amount: Money; date: string }[];
  /** True when a payments source was frozen with the sheet. */
  sourcePresent: boolean;
  /** True when the decision calls for a settlement (distribution, capital contribution). */
  applies: boolean;
  closingDate: string; asOfDate: string;
}

export function paymentState(input: PaymentInput): PaymentState {
  const ids = input.payments.map(p => p.id).sort();
  if (!input.applies && !input.payments.length) {
    const reason = "Décision sans règlement attendu selon son type";
    return { status: "not_applicable", voted: input.voted ? known(input.voted) : na(reason), paidAtClosing: na(reason), paidAtReview: na(reason), remainingAtClosing: na(reason), remainingAtReview: na(reason), paymentIds: [], meaning: reason + "." };
  }
  if (!input.applies) {
    const reason = "Règlement rattaché à une décision dont le type n’appelle pas de paiement : à expliquer";
    return { status: "unknown", voted: input.voted ? known(input.voted) : na("Type sans paiement attendu"), paidAtClosing: unknown(reason), paidAtReview: unknown(reason), remainingAtClosing: unknown(reason), remainingAtReview: unknown(reason), paymentIds: ids, meaning: reason + "." };
  }
  if (!input.sourcePresent) {
    const reason = "SOURCE REQUISE : règlements";
    return { status: "unknown", voted: input.voted ? known(input.voted) : unknown("Vote non établi"), paidAtClosing: unknown(reason), paidAtReview: unknown(reason), remainingAtClosing: unknown(reason), remainingAtReview: unknown(reason), paymentIds: ids,
      meaning: "Aucune source de règlements figée : le paiement reste inconnu, jamais réputé nul." };
  }
  const atClosing = input.payments.filter(p => p.date <= input.closingDate).reduce((s, p) => s + cents(p.amount), 0n);
  const atReview = input.payments.filter(p => p.date <= input.asOfDate).reduce((s, p) => s + cents(p.amount), 0n);
  if (!input.voted) {
    const reason = "Vote non établi : reste à payer non calculé";
    return { status: "unknown", voted: unknown("Vote non établi"), paidAtClosing: known(money(atClosing)), paidAtReview: known(money(atReview)), remainingAtClosing: unknown(reason), remainingAtReview: unknown(reason), paymentIds: ids, meaning: reason + "." };
  }
  const voted = cents(input.voted);
  const status: PaymentStatus = atReview === 0n ? "unpaid" : atReview < voted ? "partially_paid" : atReview === voted ? "paid" : "overpaid";
  const meaning = {
    paid: "Règlements cités égaux au montant voté à la date de revue.",
    partially_paid: "Règlements cités inférieurs au montant voté : le reste est présenté à part, sans écriture proposée.",
    unpaid: "Aucun règlement cité à la date de revue : le montant voté reste à payer (dette envers les associés hors sources Capitaux propres).",
    overpaid: "Règlements cités supérieurs au montant voté : écart à expliquer.",
  }[status as "paid" | "partially_paid" | "unpaid" | "overpaid"];
  return { status, voted: known(input.voted), paidAtClosing: known(money(atClosing)), paidAtReview: known(money(atReview)),
    remainingAtClosing: known(money(voted - atClosing)), remainingAtReview: known(money(voted - atReview)), paymentIds: ids, meaning };
}
