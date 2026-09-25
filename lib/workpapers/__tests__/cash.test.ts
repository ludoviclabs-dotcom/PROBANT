import { describe, expect, it } from "vitest";
import { bankPopulation, reconcileCash, clearCash, CASH_TEMPLATE, registerCash } from "../cash";
import { CalculationRegistry } from "../calculations";
import { ConfirmationRegister, type ConfirmationRecord } from "../confirmations";
import { WorkpaperService } from "../service";
import { MemoryWorkpaperRepository } from "../repository";
import { freezePopulation, selectPopulation } from "../selection";
import { linkImportedEvidence } from "../evidence";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { CASH_GUIDE_EXAMPLES, CASH_EXAMPLE_WARNING } from "../cash-examples";
import { fixtureRun, preparer, reviewer, scope, period } from "./fixtures";
import { cashFixture } from "./cash-fixtures";
import type { SourcedAmount } from "../cycle-context";
function syntheticPayment(base: SourcedAmount, date: string, amount = "40.00"): SourcedAmount {
  return { amount: { amount, currency: "EUR" }, date, source: { ...base.source, id: "POST-ROW", documentVersionId: "POST-DOC", normalized: { key: "POST", amount: { amount, currency: "EUR" }, date } } };
}
describe("CASH-301/302 identity, sources and arithmetic", () => {
  it("does not merge accounts by bank label or documentary alias", async () => {
    const { input } = await cashFixture();
    expect(bankPopulation(input.context, [input.account, { ...input.account, id: "another", accountReference: "ACCOUNT-002" }]).accounts).toHaveLength(2);
    expect(() => bankPopulation(input.context, [input.account, { ...input.account, id: "another" }])).toThrow();
    expect(() => reconcileCash({ ...input, context: { ...input.context, scope: { ...scope, mode: "real" } } })).toThrow("SOURCE REQUISE");
  });
  it("keeps signed -5.00 difference and compensating +100/-100 gross 200", async () => {
    const { input } = await cashFixture();
    expect(reconcileCash(input).difference.amount).toBe("-5.00");
    const { input: offset } = await cashFixture(true, "435.30");
    const result = reconcileCash(offset); expect(result.difference.amount).toBe("0.00"); expect(result.grossUnexplained.amount).toBe("200.00"); expect(result.unexplainedCount).toBe(2);
    expect(reconcileCash({ ...offset, items: [...offset.items].reverse() })).toEqual(result);
  });
  it("rejects unvalidated conventions, source mismatch and wrong closing date", async () => {
    const { input } = await cashFixture();
    expect(() => reconcileCash({ ...input, convention: { ...input.convention, validatedBy: "" } })).toThrow();
    expect(() => reconcileCash({ ...input, statement: { ...input.statement, amount: { amount: "1.00", currency: "EUR" } } })).toThrow("SOURCE_AMOUNT");
    expect(() => reconcileCash({ ...input, statement: syntheticPayment(input.statement, "2024-07-01") })).toThrow("CLOSING");
    expect(() => reconcileCash({ ...input, account: { ...input.account, accountReference: "OTHER" } })).toThrow("BANK_ACCOUNT");
  });
});
describe("CASH-303 post-closing clearance", () => {
  it("distinguishes open, fully cleared and explicitly corrected items", async () => {
    const { input: original } = await cashFixture(true);
    const input = { ...original, items: original.items.map((i) => ({ ...i, explained: true, explanation: "Élément temporaire synthétique documenté" })) };
    const window = { startDate: "2024-07-01", endDate: "2024-07-31", documentVersionIds: ["POST-DOC"], coverage: "documented" as const };
    expect(clearCash(input, window, ["R1"], [], []).rows[0].status).toBe("open");
    const payment = { id: "POST", accountId: input.account.id, value: syntheticPayment(input.statement, "2024-07-05", "100.00") };
    expect(clearCash(input, window, ["R1"], [payment], [{ itemId: "R1", settlementId: "POST", amount: { amount: "100.00", currency: "EUR" } }]).rows[0].status).toBe("cleared");
    const corrected = clearCash(input, window, ["R1"], [], [], [{ itemId: "R1", proof: payment.value, reason: "Correction documentée dans la fixture" }]);
    expect(corrected.rows[0].status).toBe("corrected"); expect(corrected.rows[0].closingAmount.amount).toBe("100.00");
  });
  it("allocates 40/100 without rewriting closing, preserves untested and pre-closing inconsistency", async () => {
    const { input } = await cashFixture(true);
    const before = JSON.stringify(input), window = { startDate: "2024-07-01", endDate: "2024-07-31", documentVersionIds: ["POST-DOC"], coverage: "documented" as const };
    const payment = { id: "POST", accountId: input.account.id, value: syntheticPayment(input.statement, "2024-07-05") };
    const allocations = [{ itemId: "R1", settlementId: "POST", amount: { amount: "40.00", currency: "EUR" as const } }];
    const result = clearCash(input, window, ["R1"], [payment], allocations);
    expect(result.rows[0].status).toBe("partially_cleared"); expect(result.rows[0].remainingAmount.amount).toBe("60.00"); expect(result.rows[1].status).toBe("not_tested"); expect(JSON.stringify(input)).toBe(before);
    const early = clearCash(input, window, ["R1"], [{ ...payment, value: syntheticPayment(input.statement, "2024-06-30") }], allocations);
    expect(early.rows[0].status).toBe("unexplained"); expect(early.rows[0].settledAmount.amount).toBe("0.00");
    expect(() => clearCash(input, window, ["R1"], [payment], [...allocations, ...allocations])).toThrow("OVERALLOCATION");
    expect(clearCash(input, { ...window, coverage: "incomplete" }, ["R1"], [payment], allocations).rows[0].status).toBe("not_tested");
  });
});
describe("CASH-304 confirmations", () => {
  it("retains missing powers separately, requires direct-origin evidence and refuses stale versions", async () => {
    const { batch } = await cashFixture(), run = fixtureRun({ importIds: [batch.id] });
    const evidence = linkImportedEvidence(run, batch, batch.rows[0].id, "Synthetic confirmation attachment", preparer);
    const record: ConfirmationRecord = { id: "C1", version: 1, scope, subject: "bank", subjectIds: ["BANK-A-001"], request: { date: "2024-07-01", channel: "synthetic", evidence }, response: null,
      reconciliation: { status: "not_tested", evidence: [], note: "" }, powers: { status: "missing", evidence: [], note: "Attendus" }, commitments: { status: "not_requested", evidence: [], note: "" } };
    const register = new ConfirmationRegister(); register.save(record, 0, preparer);
    const response = { date: "2024-07-05", confirmedAt: "2024-06-30", origin: "direct_documented" as const, channel: "synthetic", evidence };
    expect(() => register.save({ ...record, version: 2, response }, 1, preparer)).toThrow("DIRECT_ORIGIN");
    const next = register.save({ ...record, version: 2, response: { ...response, origin: "client_provided" } }, 1, preparer);
    expect(next.powers.status).toBe("missing"); expect(register.history(scope, "C1", preparer)).toHaveLength(2);
    expect(() => register.save({ ...record, version: 2 }, 1, preparer)).toThrow("STALE");
  });
});
describe("CASH-305 technical vertical path", () => {
  it("classifies arithmetic exceptions correctly and refuses altered source/context metadata", async () => {
    const { input, batch } = await cashFixture(), registry = new CalculationRegistry(); registerCash(registry);
    const population = freezePopulation(scope, [batch], "row", preparer), selection = selectPopulation(population, { method: "targeted", criteria: "All synthetic", requestedSize: population.items.length, selectedIds: population.items.map((i) => i.id), exclusions: [] }, preparer);
    const request = { scope, period, rule: CASH_TEMPLATE.rule!, imports: [batch], population, selection, parameters: input };
    expect(registry.execute(request).outcome).toBe("exceptions_detected"); expect(registry.execute(request).findings).toEqual([]);
    expect(registry.execute({ ...request, parameters: { ...input, context: { ...input.context, scope: { ...scope, dossierId: "other" } } } }).execution).toBe("failed");
    expect(registry.execute({ ...request, parameters: { ...input, ledger: { ...input.ledger, source: { ...input.ledger.source, documentVersionId: "changed" } } } }).execution).toBe("failed");
  });
  it("imports, calculates, documents, reviews and projects without an invented finding", async () => {
    const { input, batch, imports } = await cashFixture(false, "435.30"), registry = new CalculationRegistry(); registerCash(registry);
    let actor = preparer;
    const service = new WorkpaperService(new MemoryWorkpaperRepository(), imports, registry, async () => actor, () => "2024-07-31T12:00:00Z");
    let run = await service.create(scope, period, CASH_TEMPLATE, "CASH-SYNTHETIC");
    const population = freezePopulation(scope, [batch], "row", preparer), selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les lignes de la fixture synthétique", requestedSize: population.items.length, selectedIds: population.items.map((i) => i.id), exclusions: [] }, preparer);
    run = await service.attachInputs(scope, run.id, run.version, population, selection); run = await service.transition(scope, run.id, run.version, "ready");
    run = await service.execute(scope, run.id, run.version, input); expect(run.result?.outcome).toBe("no_exception_detected"); expect(run.findings).toEqual([]);
    for (const row of batch.rows) run = await service.addEvidence(scope, run.id, run.version, batch.id, row.id, "Source synthétique du pont");
    run = await service.conclude(scope, run.id, run.version, "Accord arithmétique synthétique uniquement. Sources métier requises.");
    run = await service.transition(scope, run.id, run.version, "awaiting_review"); actor = reviewer;
    run = await service.transition(scope, run.id, run.version, "approved", "Revue technique de fixture", run.submittedHash);
    const base = buildDemoDossierSnapshot(); const projected = await service.lockAndProject(scope, run.id, run.version, { ...base, dossier: { ...base.dossier, id: scope.dossierId, organizationId: scope.organizationId, period } });
    expect(projected.workpaperProjection?.lockedRuns[0].template.id).toBe(CASH_TEMPLATE.id);
    expect(CASH_GUIDE_EXAMPLES.every((e) => !e.originalAvailable)).toBe(true); expect(CASH_EXAMPLE_WARNING).toContain("SOURCE REQUISE");
  });
});
