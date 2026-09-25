import { z } from "zod";
import { cents, money, type Money, type KnownAmount } from "@/lib/canonical-model/money";
import { isCivilDate } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, moneySchema, scopeSchema, type EvidenceLink } from "./model";
import { assertContext, assertDate, assertUnique, type CycleContext } from "./cycle-context";

export const CYCLE_REVIEW_VERSION = "1.0.0";
export const dateSchema = z.string().refine(isCivilDate, "Date civile ISO requise");
export const proofSchema = z.object({ id: z.string().min(1), scope: scopeSchema, procedureId: z.string().min(1), documentVersionId: z.string().min(1), rowId: z.string().optional(), locator: z.object({ sheet: z.string().optional(), row: z.number().int().positive().optional(), cell: z.string().optional(), page: z.number().int().positive().optional(), zone: z.string().optional() }).optional(), precision: z.enum(["cell", "row", "page", "zone", "document"]), status: z.enum(["verified", "suggestion"]), purpose: z.string().min(1) });
export const supportedAmountSchema = z.object({ amount: moneySchema, date: dateSchema, basis: z.string().min(1), evidence: z.array(proofSchema) });
export type SupportedAmount = z.infer<typeof supportedAmountSchema>;
export function evidence(context: CycleContext, links: EvidenceLink[]) {
  for (const link of links) { proofSchema.parse(link); assertScope(context.scope, link.scope); }
  return links.length > 0 && links.every((p) => p.status === "verified");
}
export const unknown = (reason: string): KnownAmount => ({ kind: "unknown", reason });
export const known = (value: Money): KnownAmount => ({ kind: "known", value });
export function compareSupported(context: CycleContext, left: SupportedAmount | null, right: SupportedAmount | null): KnownAmount {
  assertContext(context);
  if (!left || !right) return unknown("SOURCE REQUISE : deux montants documentés");
  supportedAmountSchema.parse(left); supportedAmountSchema.parse(right);
  const leftProven = evidence(context, left.evidence), rightProven = evidence(context, right.evidence);
  const proven = leftProven && rightProven;
  if (!proven || left.date !== right.date || left.basis !== right.basis) return unknown("Bases, dates ou preuves non comparables");
  return known(money(cents(left.amount) - cents(right.amount)));
}
/** Exact rational; never Infinity, never a percentage implying audit coverage. */
export function ratio(numerator: Money, denominator: Money) {
  const d = cents(denominator);
  return d === 0n ? { kind: "unknown" as const, reason: "Dénominateur nul" } : { kind: "ratio" as const, numerator: cents(numerator).toString(), denominator: d.toString() };
}
export interface BalanceLine { id: string; key: string; account?: string; party?: string; value: SupportedAmount }
export function reconcileBalances(context: CycleContext, left: BalanceLine[], right: BalanceLine[], dimension: "key" | "account" | "party" = "key") {
  assertContext(context);
  for (const rows of [left, right]) {
    assertUnique(rows.map((r) => r.id));
    rows.forEach((r) => { supportedAmountSchema.parse(r.value); if (!r.key.trim() || !r[dimension]?.trim() || r.value.date !== context.period.closingDate) throw new Error("BALANCE_SCOPE_OR_DATE"); evidence(context, r.value.evidence); });
  }
  const rows = [...new Set([...left, ...right].map((r) => r[dimension]!))].sort().map((key) => {
    const a = left.filter((r) => r[dimension] === key), b = right.filter((r) => r[dimension] === key);
    const total = (ls: BalanceLine[]) => money(ls.reduce((s, r) => s + cents(r.value.amount), 0n));
    const comparable = a.length > 0 && b.length > 0 && new Set([...a, ...b].map((r) => r.value.basis)).size === 1 && [...a, ...b].every((r) => evidence(context, r.value.evidence));
    return { key, left: total(a), right: total(b), difference: comparable ? known(money(cents(total(a)) - cents(total(b)))) : unknown("Périmètre, base ou preuve incomplets"), sourceLines: [...a, ...b] };
  });
  const complete = rows.length > 0 && rows.every((r) => r.difference.kind === "known");
  return frozen({ rows, net: complete ? known(money(rows.reduce((s, r) => s + (r.difference.kind === "known" ? cents(r.difference.value) : 0n), 0n))) : unknown("Cadrage partiel ou population absente"), gross: complete ? known(money(rows.reduce((s, r) => { const n = r.difference.kind === "known" ? cents(r.difference.value) : 0n; return s + (n < 0n ? -n : n); }, 0n))) : unknown("Cadrage partiel ou population absente"), inputHash: stableSha256({ context, left, right, dimension }), convention: `gauche moins droite ; clé ${dimension} ; crédits négatifs ; résidus non compensés` });
}
export interface DocumentedMethod { id: string; version: string; source: string; from: string; to: string; approvedBy: string; synthetic: true }
export function methodEligible(method: DocumentedMethod | null, date: string) {
  assertDate(date);
  if (!method) return false;
  assertDate(method.from); assertDate(method.to);
  return method.synthetic === true && !!method.id && !!method.version && !!method.source.trim() && !!method.approvedBy.trim() && method.from <= date && date <= method.to;
}
