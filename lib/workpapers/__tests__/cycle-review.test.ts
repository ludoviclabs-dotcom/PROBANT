import { expect, it } from "vitest";
import { compareSupported, reconcileBalances } from "../cycle-review";
import { recalculateDepreciation } from "../fixed-assets";
import { period, scope } from "./fixtures";
import { known, proof } from "./cutoff-fixtures";
const context = { scope, period, purpose: "synthetic_technical" as const };
const value = { amount: known("10.00").value, date: period.closingDate, basis: "EUR", evidence: [proof] };
it("population absente reste inconnue, jamais zéro démontré", () => {
  const result = reconcileBalances(context, [], []);
  expect(result.net.kind).toBe("unknown"); expect(result.gross.kind).toBe("unknown");
});
it("contrôle le scope de droite même sans preuve à gauche", () => {
  expect(() => compareSupported(context, { ...value, evidence: [] }, { ...value, evidence: [{ ...proof, scope: { ...scope, dossierId: "SYN-OTHER" } }] })).toThrow();
});
it("amortissement non calculable entre bases incompatibles", () => {
  expect(recalculateDepreciation(context, { kind: "linear", method: { id: "SYN", version: "1", source: "fixture synthétique", from: period.startDate, to: period.closingDate, approvedBy: "SYN", synthetic: true }, cost: value, residual: { ...value, basis: "TTC" }, inServiceDate: period.startDate, durationMonths: 60, prorata: { numerator: "1", denominator: "1", evidence: [proof] }, rounding: "half_up_cent" }).kind).toBe("unknown");
});
