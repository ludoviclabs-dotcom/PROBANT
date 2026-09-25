import type { CutoffInput } from "../cutoff";
import type { EvidenceLink } from "../model";
import { scope, period } from "./fixtures";
export const proof: EvidenceLink = { id: "SYNTHETIC-PROOF", scope, procedureId: "SYNTHETIC-WP", documentVersionId: "SYNTHETIC-DOC", rowId: "SYNTHETIC-ROW", locator: { row: 2 }, precision: "row", status: "verified", purpose: "Fixture entièrement synthétique, non issue du guide" };
export const known = (amount: string) => ({ kind: "known" as const, value: { amount, currency: "EUR" as const } });
export function cutoffFixture(flow: CutoffInput["flow"] = "purchase", future = false): CutoffInput {
  return { context: { scope, period, purpose: "synthetic_technical" }, economicEventKey: "SUPPLIER-A/INVOICE-001/LINE-1", flow, documentKind: "invoice",
    invoice: { id: "INVOICE-001", date: "2024-07-05", availableAtClosing: "no", evidence: [proof] },
    performance: { date: future ? "2024-07-05" : "2024-06-30", kind: "point", verified: true, evidence: [proof] },
    basis: { net: known("100.00"), tax: known("20.00"), gross: known("120.00"), evidence: [proof] },
    recognition: { searched: true, alreadyRecognizedAmount: known(future ? "100.00" : "0.00"), bookingDate: future ? "2024-06-30" : undefined, evidence: [proof], existingAdjustments: [] } };
}
