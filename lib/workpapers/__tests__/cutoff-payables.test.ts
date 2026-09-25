import { describe, expect, it } from "vitest";
import { analyzeCutoff, reviewCutoff, uniqueEconomicExposures } from "../cutoff";
import { framePayables, searchUnrecordedLiabilities, type RpneInput } from "../payables";
import { ConfirmationRegister } from "../confirmations";
import { previewImport, MemoryImportRepository } from "../imports";
import { amountFromImport } from "../cycle-context";
import { freezePopulation, selectPopulation } from "../selection";
import { cashFixture } from "./cash-fixtures";
import { cutoffFixture, known, proof } from "./cutoff-fixtures";
import { preparer, reviewer, scope } from "./fixtures";

describe("CUT-401 shared synthetic decision framework", () => {
  it.each([["sale", false, "FAE"], ["sale", true, "PCA"], ["purchase", false, "FNP"], ["purchase", true, "CCA"]] as const)("%s future=%s proposes %s only for verified facts", (flow, future, candidate) => {
    const result = analyzeCutoff(cutoffFixture(flow, future)); expect(result.candidate).toBe(candidate); expect(result.amount).toEqual(known("100.00")); expect(result.humanStatus).toBe("pending");
  });
  it("does not infer performance or recognition from an invoice date", () => {
    const input = cutoffFixture();
    expect(analyzeCutoff({ ...input, performance: null }).status).toBe("inconclusive");
    expect(analyzeCutoff({ ...input, performance: { ...input.performance!, verified: false } }).status).toBe("inconclusive");
    const future = cutoffFixture("sale", true);
    expect(analyzeCutoff({ ...future, invoice: { ...future.invoice!, date: "2024-06-01" }, recognition: { ...future.recognition, bookingDate: undefined, alreadyRecognizedAmount: known("0.00") } }).candidate).toBeNull();
    expect(analyzeCutoff({ ...input, context: { ...input.context, purpose: "real", scope: { ...scope, mode: "real" } }, invoice: null, performance: null, basis: { ...input.basis, evidence: [] }, recognition: { ...input.recognition, evidence: [] } }).reasons).toContain("SOURCE REQUISE");
  });
  it("does not duplicate FNP and keeps missing allocation methods inconclusive", () => {
    const input = cutoffFixture();
    const treated = analyzeCutoff({ ...input, recognition: { ...input.recognition, existingAdjustments: [{ id: "FNP-1", kind: "FNP", amount: known("100.00"), evidence: [proof] }] } });
    expect(treated.status).toBe("already_treated"); expect(treated.amount.kind).toBe("not_applicable");
    expect(analyzeCutoff({ ...input, performance: { ...input.performance!, kind: "spread", startDate: "2024-06-01", endDate: "2024-07-31" } }).status).toBe("inconclusive");
    const partial = analyzeCutoff({ ...input, recognition: { ...input.recognition, bookingDate: "2024-06-30", alreadyRecognizedAmount: known("40.00") } });
    expect(partial.amount).toEqual(known("60.00"));
  });
  it("tracks signed credit notes, requires human motive and deduplicates an event across procedures", () => {
    const input = cutoffFixture();
    const credit = analyzeCutoff({ ...input, documentKind: "credit_note", originalEventKey: input.economicEventKey, basis: { net: known("-100.00"), tax: known("-20.00"), gross: known("-120.00"), evidence: [proof] } });
    expect(credit.amount).toEqual(known("-100.00"));
    const result = analyzeCutoff(input);
    expect(() => reviewCutoff(result, input.context, "validated", "", "2024-07-31T00:00:00Z", reviewer)).toThrow();
    expect(() => reviewCutoff(result, input.context, "validated", "verified", "2024-07-31T00:00:00Z", preparer)).toThrow();
    expect(reviewCutoff(result, input.context, "rejected", "Pièce complémentaire contredit le candidat", "2024-07-31T00:00:00Z", reviewer).inputHash).toBe(result.inputHash);
    const grouped = uniqueEconomicExposures([{ procedureId: "cutoff", result }, { procedureId: "rpne", result }]);
    expect(grouped).toHaveLength(1); expect(grouped[0].amount).toEqual(known("100.00")); expect(grouped[0].procedureIds).toHaveLength(2);
  });
});
async function rpneFixture(): Promise<RpneInput> {
  const file = new File(["Key;Amount;Date;BankAccount\nPAY1;-120.00;2024-07-10;SYNTHETIC-BANK-001\nPAY2;-120.00;2024-07-11;SYNTHETIC-BANK-001"], "RPNE-SYNTHETIC.csv");
  const preview = await previewImport(file, scope, { version: "rpne-1", headerRow: 1, columns: { key: "Key", amount: "Amount", date: "Date" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR" }, preparer, "subsequent_payments");
  const batch = await new MemoryImportRepository().approveAndSave(preview, file, preparer, preview.previewHash, "2024-07-31T00:00:00Z");
  const population = freezePopulation(scope, [batch], "row", preparer);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Fixture paiement 1", requestedSize: 1, selectedIds: [batch.rows[0].id], exclusions: [] }, preparer);
  const event = cutoffFixture();
  return { paymentAccountColumn: "BankAccount", context: event.context, window: { startDate: "2024-07-01", endDate: "2024-07-31", coverage: "documented", documentVersionIds: [batch.document.id] }, imports: [batch], population, selection,
    payments: batch.rows.map((r, i) => ({ id: `P${i + 1}`, bankAccountId: "SYNTHETIC-BANK-001", value: amountFromImport(batch, r.id, preparer) })), events: [event], allocations: [{ paymentId: "P1", economicEventKey: event.economicEventKey, amount: { amount: "120.00", currency: "EUR" }, evidence: proof }] };
}
describe("AP-402 supplier framing", () => {
  it("reuses exact Phase A comparisons, preserves debit observations and common confirmations", async () => {
    const { input } = await cashFixture(true, "435.30");
    const row = { id: "B1", account: "401", supplierId: "S1", value: input.ledger };
    const result = framePayables({ context: input.context, accounts: ["401"], convention: { name: "credits_negative", version: "1", validatedBy: preparer.id }, general: [row], auxiliary: [row], aged: [row], adjustments: [] });
    expect(result.generalToAuxiliary.metrics.net.amount).toBe("0.00"); expect(result.debitObservations[0].status).toBe("to_explain");
    const register = new ConfirmationRegister();
    expect(register.save({ id: "SUP1", version: 1, scope, subject: "supplier", subjectIds: ["S1"], request: null, response: null, reconciliation: { status: "not_tested", evidence: [], note: "" }, powers: { status: "not_requested", evidence: [], note: "" }, commitments: { status: "not_requested", evidence: [], note: "" } }, 0, preparer).subject).toBe("supplier");
  });
});
describe("AP-403 traceable search for unrecorded liabilities", () => {
  it("preserves an explicit split over two invoice lines, without arbitrary allocation", async () => {
    const input = await rpneFixture(), first = { ...input.events[0], basis: { net: known("50.00"), tax: known("10.00"), gross: known("60.00"), evidence: [proof] } };
    const second = { ...first, economicEventKey: "SUPPLIER-A/INVOICE-001/LINE-2" };
    const result = searchUnrecordedLiabilities({ ...input, events: [first, second], allocations: [first, second].map((event) => ({ ...input.allocations[0], economicEventKey: event.economicEventKey, amount: { amount: "60.00", currency: "EUR" } })) });
    expect(result.rows[0].items).toHaveLength(2); expect(result.rows[0].unallocated.amount).toBe("0.00"); expect(result.exposures).toHaveLength(2);
    expect(result.exposures.map((e) => e.amount)).toEqual([known("50.00"), known("50.00")]);
  });
  it("distinguishes payment 120 TTC from candidate 100 HT and retains not-tested population", async () => {
    const input = await rpneFixture(), result = searchUnrecordedLiabilities(input);
    expect(result.rows[0].status).toBe("omission_candidate"); expect(result.rows[0].paidAmount.amount).toBe("-120.00"); expect(result.exposures[0].amount).toEqual(known("100.00"));
    expect(result.rows[1].status).toBe("not_tested"); expect(result.counts).toEqual({ population: 2, selected: 1, tested: 1, notTested: 1, inconclusive: 0 });
    expect(searchUnrecordedLiabilities(input)).toEqual(result);
  });
  it("separates booked, existing FNP, invoice missing and outside-period cases", async () => {
    const input = await rpneFixture(), event = input.events[0];
    const run = (modified: typeof event) => searchUnrecordedLiabilities({ ...input, events: [modified] });
    expect(run({ ...event, recognition: { ...event.recognition, bookingDate: "2024-06-30", alreadyRecognizedAmount: known("100.00") } }).rows[0].status).toBe("booked_in_period");
    expect(run({ ...event, recognition: { ...event.recognition, existingAdjustments: [{ id: "F1", kind: "FNP", amount: known("100.00"), evidence: [proof] }] } }).rows[0].status).toBe("existing_accrual");
    expect(run({ ...event, invoice: null }).rows[0].status).toBe("inconclusive");
    expect(run({ ...event, performance: { ...event.performance!, date: "2024-07-05" } }).rows[0].status).toBe("outside_period_justified");
    expect(run({ ...event, basis: { ...event.basis, net: { kind: "unknown", reason: "Facture/base manquante" } } }).exposures).toEqual([]);
  });
  it("rejects over-allocation and scopes; incomplete windows and unallocated payments stay inconclusive", async () => {
    const input = await rpneFixture();
    expect(() => searchUnrecordedLiabilities({ ...input, allocations: [...input.allocations, ...input.allocations] })).toThrow("OVERALLOCATED");
    expect(() => searchUnrecordedLiabilities({ ...input, context: { ...input.context, scope: { ...scope, dossierId: "other" } } })).toThrow();
    expect(searchUnrecordedLiabilities({ ...input, allocations: [] }).rows[0].status).toBe("inconclusive");
    expect(searchUnrecordedLiabilities({ ...input, window: { ...input.window, coverage: "incomplete" } }).exposures).toEqual([]);
    const half = { ...input, allocations: [{ ...input.allocations[0], amount: { amount: "60.00", currency: "EUR" as const } }] };
    expect(searchUnrecordedLiabilities(half).rows[0].unallocated.amount).toBe("60.00");
  });
});
