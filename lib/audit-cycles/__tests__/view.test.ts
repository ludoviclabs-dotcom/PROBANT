import { describe, expect, it } from "vitest";
import { loadAllCycles, loadAllSources, loadVeilleReport } from "../loader";
import { buildCoverageMatrix, buildCycleIndex, referenceFamilyOf, sourceSpread, REFERENCE_FAMILIES } from "../view";

describe("modèles de vue Audit Normatif 360 (données réelles du dépôt)", () => {
  it("classe chaque type de source dans un seul référentiel", () => {
    const types = REFERENCE_FAMILIES.flatMap((f) => f.types);
    expect(new Set(types).size).toBe(types.length);
    expect(referenceFamilyOf("H3C_H2A")).toBe("nep");
    expect(referenceFamilyOf("ANC")).toBe("fr_comptable");
    expect(referenceFamilyOf(undefined)).toBeNull();
  });

  it("numérote l'index de 01 à 35 sans trou, famille par famille", async () => {
    const cycles = await loadAllCycles();
    const index = buildCycleIndex(cycles, null);
    const numbers = index.flatMap((f) => f.items.map((i) => i.n));
    expect(numbers).toEqual(cycles.map((_, i) => String(i + 1).padStart(2, "0")));
    expect(index.reduce((sum, f) => sum + Number(f.count), 0)).toBe(cycles.length);
  });

  it("compte dans la matrice des sources distinctes, toutes connues du registre", async () => {
    const [cycles, sources, veille] = await Promise.all([loadAllCycles(), loadAllSources(), loadVeilleReport()]);
    const matrix = buildCoverageMatrix(cycles, sources, veille);
    expect(matrix.unresolved).toBe(0);
    const rows = matrix.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(cycles.length);
    // Chaque cycle cite au moins une norme d'audit internationale ou française.
    for (const row of rows) {
      const audit = row.cells.filter((c) => c.family === "isa" || c.family === "nep").reduce((s, c) => s + c.count, 0);
      expect(audit, row.slug).toBeGreaterThan(0);
    }
    // Le total d'une colonne = nombre de cycles qui citent au moins une source du référentiel.
    for (const col of matrix.columns) {
      expect(col.total).toBe(rows.filter((r) => r.cells.find((c) => c.family === col.id)!.count > 0).length);
    }
  });

  it("répartit tout le registre", async () => {
    const sources = await loadAllSources();
    expect(sourceSpread(sources).reduce((s, f) => s + f.count, 0)).toBe(sources.length);
  });
});
