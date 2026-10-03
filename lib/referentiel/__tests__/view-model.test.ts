import { describe, expect, it } from "vitest";
import { SOURCES } from "@/lib/referentiel/sources";
import {
  buildStrata,
  computeScope,
  countRegistry,
  familyOf,
  groupByFamily,
  themeCounts,
} from "@/lib/referentiel/view-model";

const sources = Object.values(SOURCES);
const all = { query: "", theme: "all", year: null, registry: "all" } as const;

describe("view-model du référentiel", () => {
  it("dérive 27 / 19 / 8 des données, jamais en dur", () => {
    expect(sources).toHaveLength(27);
    expect(countRegistry(sources, "droit-dur")).toBe(19);
    expect(countRegistry(sources, "methode")).toBe(8);
  });

  it("recherche sur référence, paraphrase, thème et version", () => {
    expect(computeScope(sources, { ...all, query: "A.47" }).searched.length).toBe(3);
    expect(computeScope(sources, { ...all, query: "isa 240" }).searched).toHaveLength(1);
    expect(computeScope(sources, { ...all, query: "Fraude" }).searched).toHaveLength(1);
    expect(computeScope(sources, { ...all, query: "2009-12-15" }).searched).toHaveLength(5);
    expect(computeScope(sources, { ...all, query: "zzz-introuvable" }).filtered).toHaveLength(0);
  });

  it("combine registre, millésime et thème", () => {
    const methode = computeScope(sources, { ...all, registry: "methode" });
    expect(methode.regScope).toHaveLength(8);
    const y2009 = computeScope(sources, { ...all, year: "2009" });
    expect(y2009.filtered.every((s) => s.effectiveDate.startsWith("2009"))).toBe(true);
    const admiss = computeScope(sources, { ...all, theme: "Admissibilité" });
    expect(admiss.filtered).toHaveLength(3);
  });

  it("trie l'index des thèmes par volume décroissant et omet les thèmes vides", () => {
    const counts = themeCounts(sources);
    expect(counts.map((c) => c.n)).toEqual([...counts.map((c) => c.n)].sort((a, b) => b - a));
    expect(counts.every((c) => c.n > 0)).toBe(true);
    expect(counts.reduce((acc, c) => acc + c.n, 0)).toBe(27);
  });

  it("construit une strate par millésime, épaisseur proportionnelle", () => {
    const strata = buildStrata(sources);
    expect(strata.map((s) => s.year)).toEqual(["2009", "2013", "2021", "2024", "2026"]);
    expect(strata.reduce((acc, s) => acc + s.items.length, 0)).toBe(27);
    for (const s of strata) expect(s.t).toBe(Math.round(4 + s.items.length * 2));
    // Empilement croissant, interstice de 16 px entre strates.
    for (let i = 1; i < strata.length; i++) {
      expect(strata[i].z).toBe(strata[i - 1].z + strata[i - 1].t + 16);
    }
    // Les 2009 sont tous de la méthode (0 % droit dur), les 2026 du droit dur.
    expect(strata[0].pct).toBe(0);
    expect(strata[4].pct).toBe(100);
  });

  it("regroupe par famille de texte dans l'ordre de première apparition", () => {
    expect(familyOf("LPF art. A.47 A-1")).toBe("Livre des procédures fiscales");
    expect(familyOf("ISRE 2400 (révisée)")).toBe("Normes d'exercice professionnel");
    expect(familyOf("CGI art. 271")).toBe("Code général des impôts");
    expect(familyOf("C. com. art. L.225-248")).toBe("Code de commerce");
    const groups = groupByFamily(sources);
    expect(groups.reduce((acc, g) => acc + g.items.length, 0)).toBe(27);
    expect(groups[0].family).toBe("Livre des procédures fiscales");
  });
});
