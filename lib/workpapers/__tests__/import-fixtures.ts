import { previewImport, MemoryImportRepository } from "../imports";
import { freezePopulation, selectPopulation } from "../selection";
import { scope, preparer } from "./fixtures";
const mapping = { version: "1", headerRow: 1, columns: { key: "Key", amount: "Amount", date: "Date" }, delimiter: ";" as const, decimal: "." as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
export async function importedFixture() {
  const file = new File(["Key;Amount;Date\n001;0.10;2024-06-30\n002;0.20;2024-06-30"], "synthetic.csv");
  const repo = new MemoryImportRepository(), preview = await previewImport(file, scope, mapping, preparer);
  const batch = await repo.approveAndSave(preview, file, preparer, preview.previewHash, "2024-08-01T00:00:00Z");
  return { batch, repo, file };
}
export function populationFixture(batch: Awaited<ReturnType<typeof importedFixture>>["batch"]) {
  const population = freezePopulation(scope, [batch], "row", preparer);
  const selection = selectPopulation(population, { method: "targeted", criteria: "All synthetic rows", exclusions: [], requestedSize: 2, selectedIds: population.items.map((i) => i.id) }, preparer);
  return { population, selection };
}
