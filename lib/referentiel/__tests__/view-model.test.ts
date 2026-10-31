import { describe, expect, it } from "vitest";
import type { SourceTheme } from "@/lib/canonical-model";
import { SOURCES } from "@/lib/referentiel/sources";
import {
  SEUILS_FAMILY,
  SEUILS_FAMILY_LABEL,
  buildFrieze,
  computeScope,
  countRegistry,
  familyOf,
  groupByFamily,
  indexCounts,
  registryFamily,
  registryLabel,
  selectRegistry,
  themeCounts,
} from "@/lib/referentiel/view-model";
import { registryOf } from "@/components/referentiel/themes";

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

  it("frise : une barre par millésime, comptes du registre actuel (relevés à la main dans sources.ts)", () => {
    const frieze = buildFrieze(sources);
    // 2009 : ISA 320, 330, 500, 505, 520. 2013 : LPF art. A.47 A-1 (×3, 02/08/2013) et ISRE 2400 (31/12/2013).
    // 2021 : ISA 240, 315. 2023 : C. com. art. L225-248, version en vigueur depuis le 11/03/2023 (loi n° 2023-171).
    // 2024 : douze articles du PCG et CGI art. 271. 2026 : PCG art. 1131-1 et 1031-1.
    expect(Object.fromEntries(frieze.map((f) => [f.year, f.total]))).toEqual({
      "2009": 5,
      "2013": 4,
      "2021": 2,
      "2023": 1,
      "2024": 13,
      "2026": 2,
    });
    expect(frieze.map((f) => f.year)).toEqual(["2009", "2013", "2021", "2023", "2024", "2026"]);
    expect(frieze.reduce((acc, f) => acc + f.total, 0)).toBe(27);
    for (const f of frieze) {
      expect(f.items).toHaveLength(f.total);
      expect(f.hardLaw + f.methodology).toBe(f.total);
    }
    // Composition : 2009 tout en méthode d'audit, 2013 trois LPF et une ISRE, 2024 tout en droit dur.
    const by = Object.fromEntries(frieze.map((f) => [f.year, f]));
    expect([by["2009"].hardLaw, by["2009"].methodology]).toEqual([0, 5]);
    expect([by["2013"].hardLaw, by["2013"].methodology]).toEqual([3, 1]);
    expect([by["2024"].hardLaw, by["2024"].methodology]).toEqual([13, 0]);
  });

  it("frise : longueur proportionnelle au nombre de textes, le millésime le plus fourni vaut 100 %", () => {
    const by = Object.fromEntries(buildFrieze(sources).map((f) => [f.year, f]));
    expect(by["2024"].hardLawPct).toBe(100);
    expect(by["2024"].methodologyPct).toBe(0);
    expect(by["2009"].methodologyPct).toBeCloseTo((5 / 13) * 100, 10);
    expect(by["2013"].hardLawPct).toBeCloseTo((3 / 13) * 100, 10);
    expect(by["2013"].methodologyPct).toBeCloseTo((1 / 13) * 100, 10);
    expect(by["2023"].hardLawPct + by["2023"].methodologyPct).toBeCloseTo((1 / 13) * 100, 10);
    expect(buildFrieze([])).toEqual([]);
  });

  it("familles : droit dur (trait plein), méthode d'audit (tirets) ; paramètre interne réservé aux seuils", () => {
    expect(registryFamily("droit-dur")).toBe("hardLaw");
    expect(registryLabel("droit-dur")).toBe("Droit dur");
    expect(registryFamily("methode")).toBe("methodology");
    expect(registryLabel("methode")).toBe("Méthode d’audit");
    expect(SEUILS_FAMILY).toBe("internal");
    expect(SEUILS_FAMILY_LABEL).toBe("Paramètre interne · non opposable");
    // Les ISA / ISRE sont toutes de méthode d'audit, aucune n'est qualifiée d'interne.
    const isa = sources.filter((s) => /^(ISA|ISRE) /.test(s.ref));
    expect(isa).toHaveLength(8);
    for (const s of isa) {
      const reg = registryOf(s.theme);
      expect(reg).toBe("methode");
      expect(registryFamily(reg)).not.toBe("internal");
      expect(registryLabel(reg)).not.toMatch(/interne/i);
    }
    // Aucune source citée ne tombe dans la famille des paramètres internes.
    for (const s of sources) expect(registryFamily(registryOf(s.theme))).not.toBe("internal");
  });

  it("filtre par millésime : seules les entrées de l'année, combinables avec la famille", () => {
    const y2024 = computeScope(sources, { ...all, year: "2024" });
    expect(y2024.filtered).toHaveLength(13);
    expect(y2024.filtered.every((s) => s.effectiveDate.startsWith("2024"))).toBe(true);
    expect(computeScope(sources, { ...all, year: "2024", registry: "methode" }).filtered).toHaveLength(0);
    const y2013m = computeScope(sources, { ...all, year: "2013", registry: "methode" }).filtered;
    expect(y2013m.map((s) => s.ref)).toEqual(["ISRE 2400 (révisée)"]);
    expect(computeScope(sources, { ...all, year: "1999" }).filtered).toHaveLength(0);
  });

  it("index : chaque compte vaut le résultat du filtre, millésime compris", () => {
    // Millésime 2009 : cinq ISA, aucune entrée de droit dur. Avant correctif, l'index affichait encore
    // « Droit dur 19 » et « Comptabilisation 8 », qui menaient à une liste vide.
    const y2009 = computeScope(sources, { ...all, year: "2009" });
    const counts = indexCounts(y2009, "all");
    expect(counts.registries).toEqual({ all: 5, "droit-dur": 0, methode: 5 });
    expect(counts.themesAll).toBe(5);
    expect(counts.themes.map((t) => [t.theme, t.n])).toEqual([
      ["Éléments probants", 2],
      ["Risque", 1],
      ["Matérialité", 1],
      ["Procédures analytiques", 1],
    ]);

    // Invariant sur tous les millésimes et familles : le compte d'un thème = entrées affichées en le choisissant.
    for (const year of [null, "2009", "2013", "2021", "2023", "2024", "2026"]) {
      for (const registry of ["all", "droit-dur", "methode"] as const) {
        const base = { ...all, year, registry };
        const c = indexCounts(computeScope(sources, base), "all");
        for (const t of c.themes) {
          expect(computeScope(sources, { ...base, theme: t.theme }).filtered).toHaveLength(t.n);
        }
        for (const r of ["droit-dur", "methode"] as const) {
          expect(computeScope(sources, { ...base, registry: r }).filtered).toHaveLength(c.registries[r]);
        }
      }
    }
  });

  it("index : le thème actif reste listé à zéro pour pouvoir être retiré", () => {
    const scope = computeScope(sources, { ...all, year: "2009", theme: "Comptabilisation" });
    expect(scope.filtered).toHaveLength(0);
    const counts = indexCounts(scope, "Comptabilisation");
    expect(counts.themes.find((t) => t.theme === "Comptabilisation")).toEqual({
      theme: "Comptabilisation",
      n: 0,
      registry: "droit-dur",
    });
  });

  it("index : avec un thème actif, le compte d'une famille vaut la liste obtenue en la choisissant", () => {
    // Cas relevé en revue : thème « Admissibilité » + famille « Droit dur », puis retour à « toutes » — le thème est
    // gardé, la liste montre 3 entrées ; le compte de « toutes » doit dire 3, pas 27.
    const withTheme = computeScope(sources, { ...all, registry: "droit-dur", theme: "Admissibilité" });
    const c = indexCounts(withTheme, "Admissibilité");
    expect(c.registries).toEqual({ all: 3, "droit-dur": 3, methode: 8 });
    expect(selectRegistry("Admissibilité", "all")).toEqual({ registry: "all", theme: "Admissibilité" });
    expect(selectRegistry("Admissibilité", "methode")).toEqual({ registry: "methode", theme: "all" });

    // Invariant : pour tout millésime, tout thème actif et toute famille choisie, compte = entrées affichées après choix.
    const themes = [...new Set(sources.map((s) => s.theme))].filter((t): t is SourceTheme => t !== undefined);
    for (const year of [null, "2009", "2013", "2021", "2023", "2024", "2026"]) {
      for (const theme of ["all", ...themes] as const) {
        for (const registry of ["all", "droit-dur", "methode"] as const) {
          const base = { ...all, year, theme, registry };
          const counts = indexCounts(computeScope(sources, base), theme);
          for (const choice of ["all", "droit-dur", "methode"] as const) {
            const next = { ...base, ...selectRegistry(theme, choice) };
            expect(computeScope(sources, next).filtered).toHaveLength(counts.registries[choice]);
          }
        }
      }
    }
  });

  it("regroupe par famille de texte dans l'ordre de première apparition", () => {
    expect(familyOf("LPF art. A.47 A-1")).toBe("Livre des procédures fiscales");
    expect(familyOf("ISRE 2400 (révisée)")).toBe("Normes d'exercice professionnel");
    expect(familyOf("CGI art. 271")).toBe("Code général des impôts");
    expect(familyOf("C. com. art. L225-248")).toBe("Code de commerce");
    const groups = groupByFamily(sources);
    expect(groups.reduce((acc, g) => acc + g.items.length, 0)).toBe(27);
    expect(groups[0].family).toBe("Livre des procédures fiscales");
  });
});
