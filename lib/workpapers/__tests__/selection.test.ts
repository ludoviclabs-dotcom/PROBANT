import { describe, expect, it } from "vitest";
import { freezePopulation, selectPopulation, validateSelectionSources } from "../selection";
import { importedFixture, populationFixture } from "./import-fixtures";
import { preparer, scope } from "./fixtures";
import { syntheticRegistry, SYNTHETIC_SUM_RULE } from "../calculations";
import { period } from "./fixtures";
describe("CORE-207 frozen population and deterministic selection", () => {
  it("repeats the seeded ranking, records denominator and exact amounts", async () => {
    const { batch } = await importedFixture(), { population } = populationFixture(batch);
    const request = { method: "random" as const, criteria: "synthetic", requestedSize: 1, exclusions: [], seed: "replay-01" };
    const first = selectPopulation(population, request, preparer);
    expect(selectPopulation(population, request, preparer)).toEqual(first);
    expect(first.algorithm).toBe("sha256-rank-v1"); expect(first.limitations.join(" ")).toContain("2 lignes");
    expect(() => population.items.push(population.items[0])).toThrow();
    expect(() => validateSelectionSources(population, first, [batch])).not.toThrow();
  });
  it("rejects unsupported grouping/statistics, duplicates, excess sizes and invalid exclusions", async () => {
    const { batch } = await importedFixture(), { population } = populationFixture(batch);
    const request = { method: "targeted" as const, criteria: "synthetic", requestedSize: 1, exclusions: [], selectedIds: [population.items[0].id] };
    expect(() => freezePopulation(scope, [batch, batch], "row", preparer)).toThrow();
    expect(() => freezePopulation(scope, [], "row", preparer)).toThrow();
    expect(() => freezePopulation(scope, [batch], "invoice", preparer)).toThrow();
    expect(() => selectPopulation(population, { ...request, method: "statistical" as "targeted" }, preparer)).toThrow("STATISTICAL");
    expect(() => selectPopulation(population, { ...request, requestedSize: 3 }, preparer)).toThrow();
    expect(() => selectPopulation(population, { ...request, exclusions: [{ id: request.selectedIds[0], reason: "" }] }, preparer)).toThrow();
    expect(() => selectPopulation(population, request, { ...preparer, grants: [] })).toThrow();
  });
  it("blocks tampered populations/selections before calculation", async () => {
    const { batch } = await importedFixture(), { population, selection } = populationFixture(batch);
    const forged = { ...population, items: population.items.map((i) => ({ ...i, amount: { amount: "999.00", currency: "EUR" as const } })) };
    expect(syntheticRegistry().execute({ scope, period, rule: SYNTHETIC_SUM_RULE, imports: [batch], population: forged, selection, parameters: {} }).execution).toBe("blocked");
    expect(() => validateSelectionSources(population, { ...selection, selectedAmount: { amount: "1.00", currency: "EUR" } }, [batch])).toThrow();
  });
});
