import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CalculationRegistry, SYNTHETIC_SUM_RULE, syntheticRegistry } from "../calculations";
import { MemoryImportRepository } from "../imports";
import { linkImportedEvidence, linkPdfReference, resolveEvidence } from "../evidence";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { importedFixture, populationFixture } from "./import-fixtures";
import { period, scope, preparer, fixtureRun } from "./fixtures";
describe("CORE-203 calculation registry", () => {
  it("records a pure exact result, all inputs and zero findings", async () => {
    const { batch } = await importedFixture(); const request = { scope, period, rule: SYNTHETIC_SUM_RULE, imports: [batch], ...populationFixture(batch), parameters: {} };
    const registry = syntheticRegistry(), first = registry.execute(request), second = registry.execute({ ...request, parameters: {} });
    expect(second).toEqual(first); expect(first.result).toEqual({ amount: "0.30", currency: "EUR" }); expect(first.findings).toEqual([]);
    expect(first.sourceRefs[0].mappingVersion).toBe("1");
    expect(stableSha256({ a: 1, b: 2 })).toBe(stableSha256({ b: 2, a: 1 }));
    expect(registry.execute({ ...request, period: { ...period, asOfDate: "2024-08-01" } }).inputHash).not.toBe(first.inputHash);
  });
  it("records blocked/failed rather than an artificial finding", async () => {
    const { batch } = await importedFixture(), request = { scope, period, rule: SYNTHETIC_SUM_RULE, imports: [batch], ...populationFixture(batch), parameters: {} };
    const registry = syntheticRegistry();
    expect(registry.execute({ ...request, imports: [] }).execution).toBe("blocked");
    expect(registry.execute({ ...request, parameters: { unexpected: true } }).execution).toBe("failed");
    expect(registry.execute({ ...request, rule: { id: "missing", version: "1" } }).outcome).toBe("inconclusive");
    const broken = new CalculationRegistry(); broken.register(SYNTHETIC_SUM_RULE, z.unknown(), z.unknown(), z.number().finite(), () => NaN);
    expect(broken.execute(request).execution).toBe("failed");
    let value = 0; const impure = new CalculationRegistry(); impure.register(SYNTHETIC_SUM_RULE, z.unknown(), z.unknown(), z.number(), () => value++);
    expect(impure.execute(request).execution).toBe("failed");
  });
});
describe("CORE-204 evidence", () => {
  it("links directly to a zero-finding procedure, row and exact cell", async () => {
    const { batch, repo } = await importedFixture(), run = fixtureRun({ importIds: [batch.id] });
    const link = linkImportedEvidence(run, batch, batch.rows[0].id, "Reproduction", preparer, "B2");
    expect(link.locator?.cell).toBe("B2"); expect(link.procedureId).toBe(run.id); expect(run.findings).toEqual([]);
    expect(resolveEvidence(link, preparer, repo).availability).toBe("available");
    expect(resolveEvidence(link, preparer, new MemoryImportRepository()).availability).toBe("unavailable");
    expect(() => linkImportedEvidence(run, batch, batch.rows[0].id, "x", preparer, "B3")).toThrow();
    expect(() => linkImportedEvidence({ ...run, scope: { ...scope, dossierId: "other" } }, batch, batch.rows[0].id, "x", preparer)).toThrow();
  });
  it("PDF location stays a suggestion without an asserted extraction", async () => {
    const { batch } = await importedFixture();
    const link = linkPdfReference(fixtureRun(), { ...batch.document, format: "pdf" }, { page: 2, zone: "table" }, "Pièce à vérifier", preparer);
    expect(link.status).toBe("suggestion"); expect(link.precision).toBe("zone");
    expect(() => linkPdfReference(fixtureRun(), { ...batch.document, format: "pdf" }, { page: 0 }, "x", preparer)).toThrow();
  });
});
