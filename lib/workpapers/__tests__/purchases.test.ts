import { expect, it } from "vitest";
import { testPurchases, type PurchaseInput } from "../purchases";
import { importedFixture, populationFixture } from "./import-fixtures";
import { period, scope, preparer } from "./fixtures";
import { amountFromImport } from "../cycle-context";
import { cutoffFixture, known, proof } from "./cutoff-fixtures";
async function fixture(): Promise<PurchaseInput> { const { batch } = await importedFixture(); return { context: { scope, period, purpose: "synthetic_technical" }, imports: [batch], ...populationFixture(batch), invoices: [{ id: "INVOICE-001", amount: { amount: known("0.30").value, date: period.closingDate, basis: "HT", evidence: [proof] } }], tests: batch.rows.map((r) => ({ id: r.id, line: amountFromImport(batch, r.id, preparer), invoiceId: "INVOICE-001", allocated: r.normalized!.amount, basis: "HT", evidence: [proof], cutoff: cutoffFixture() })) }; }
it("facture répartie sur deux lignes avec sélection figée et zéro résidu", async () => { const r = testPurchases(await fixture()); expect(r.rows).toHaveLength(2); expect(r.invoiceRemainders[0].remainder).toEqual(known("0.00").value); expect(r.detailConclusion).toBeNull(); });
it("ne compare pas HT/TTC et refuse double allocation", async () => { const x = await fixture(); x.tests[0].basis = "TTC"; expect(testPurchases(x).rows[0].difference.kind).toBe("unknown"); x.tests[1].allocated = known("0.30").value; expect(() => testPurchases(x)).toThrow("OVERALLOCATED"); });
it("refuse source ou sélection modifiées", async () => { const x = await fixture(); x.selection = { ...x.selection, selectedIds: [] }; expect(() => testPurchases(x)).toThrow(); });
it("QF-12 : une base d'événement non comparable ne crée aucun ajustement", async () => {
  const result = testPurchases(await fixture());
  expect(result.rows.every((row) => row.cutoffResult.status === "inconclusive" && row.cutoffResult.candidate === null)).toBe(true);
  expect(result.exposures).toHaveLength(0);
});
it("QF-12 : une facture déjà enregistrée est apurée, sans exposition résiduelle", async () => {
  const input = await fixture();
  for (const test of input.tests) {
    test.cutoff.basis = { ...test.cutoff.basis, net: known("0.30"), tax: known("0.00"), gross: known("0.30") };
  }
  const result = testPurchases(input);
  expect(result.rows.every((row) => row.cutoffResult.candidate === null)).toBe(true);
  expect(result.exposures).toHaveLength(0);
});
