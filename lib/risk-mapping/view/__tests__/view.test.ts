import { describe, expect, it } from "vitest";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { computeMateriality } from "@/lib/audit/materiality";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { buildCycleScores } from "../../aggregate";
import { criticityBand } from "../../scoring";
import { simulateHistoricalComposite } from "../../historical";
import type { CriticityBand, CycleRiskScore } from "../../types";
import {
  ALL_BANDS_VISIBLE,
  BAND_ORDER,
  BAND_RANGE,
  ariaSort,
  bandOfDisplayed,
  bandRangeText,
  buildDistribution,
  compositePreciseText,
  compositeText,
  countByBand,
  displayComposite,
  exerciseDelta,
  filterRegister,
  nextSort,
  parseStoredSort,
  parseThreshold,
  unevaluatedText,
  type ScoredBand,
} from "..";

/** Score minimal : seuls les champs lus par les modèles de vue comptent. */
function score(cycleSlug: string, composite: number | null, evaluation: CycleRiskScore["evaluation"] = composite === null ? "non_évalué" : "évalué"): CycleRiskScore {
  const axis = { auto: 0, adjustment: 0, value: 0, provenance: "auto" as const, drivers: [] };
  return {
    cycleSlug,
    family: "TRANSVERSAL",
    axes: {
      gravite: { ...axis, axis: "gravite" },
      probabilite: { ...axis, axis: "probabilite" },
      detectabilite: { ...axis, axis: "detectabilite" },
      exposition: { ...axis, axis: "exposition" },
    },
    composite,
    criticityBand: criticityBand(composite),
    evaluation,
    findingCount: composite === null ? 0 : 1,
    isHeuristic: true,
  };
}

describe("composite affiché", () => {
  it("garde l'entier affiché dans la bande du moteur près d'une borne (cas resultat-fiscal-is : 24,54)", () => {
    // Attendu posé à la main : 24,542 est sous la borne 25, donc « faible » ; sa partie entière est 24.
    expect(criticityBand(24.542)).toBe("faible");
    expect(displayComposite(24.542)).toBe(24);
    expect(bandOfDisplayed(24.542)).toBe("faible");
    // L'arrondi au plus proche, utilisé jusqu'ici, affichait 25 — un entier de la bande « modéré ».
    expect(criticityBand(Math.round(24.542))).toBe("modéré");
  });

  it("ne change jamais de bande, sur toute l'échelle au millième", () => {
    for (let i = 0; i <= 100_000; i += 1) {
      const x = i / 1000;
      expect(bandOfDisplayed(x)).toBe(criticityBand(x));
    }
  });

  it("reste nul pour un cycle non évalué, jamais 0", () => {
    expect(displayComposite(null)).toBeNull();
    expect(compositeText(null)).toBe("—");
    expect(bandOfDisplayed(null)).toBe("non_évalué");
    expect(displayComposite(Number.NaN)).toBeNull();
  });

  it("borne et tronque l'affichage", () => {
    expect(displayComposite(100)).toBe(100);
    expect(displayComposite(104)).toBe(100);
    expect(displayComposite(-3)).toBe(0);
    expect(displayComposite(56.798)).toBe(56);
    expect(compositeText(74.999)).toBe("74");
  });

  it("donne une décimale tronquée au survol (24,96 → 24,9, pas 25,0)", () => {
    expect(compositePreciseText(24.96)).toBe("24,9");
    expect(compositePreciseText(24.542)).toBe("24,5");
    expect(compositePreciseText(null)).toBe("non évalué");
  });
});

describe("plages des bandes", () => {
  it("reprennent exactement les bornes de criticityBand", () => {
    for (const band of Object.keys(BAND_RANGE) as ScoredBand[]) {
      const { min, max } = BAND_RANGE[band];
      expect(criticityBand(min)).toBe(band);
      expect(criticityBand(max)).toBe(band);
      if (max < 100) {
        expect(criticityBand(max + 0.999)).toBe(band);
        expect(criticityBand(max + 1)).not.toBe(band);
      }
      if (min > 0) expect(criticityBand(min - 0.001)).not.toBe(band);
    }
  });

  it("affiche les plages de la légende et aucune pour « non évalué »", () => {
    expect(bandRangeText("faible")).toBe("0-24");
    expect(bandRangeText("modéré")).toBe("25-54");
    expect(bandRangeText("élevé")).toBe("55-74");
    expect(bandRangeText("critique")).toBe("75-100");
    expect(bandRangeText("non_évalué")).toBeNull();
  });
});

describe("répartition", () => {
  it("compte « non évalué » à part et calcule les parts entières", () => {
    // Répartition du dossier démo relevée le 30/10/2026 : 0 critique, 2 élevés, 19 modérés, 9 faibles, 5 non évalués.
    const rows = buildDistribution({ critique: 0, élevé: 2, modéré: 19, faible: 9, non_évalué: 5 }, 35);
    expect(rows.map((r) => r.band)).toEqual(BAND_ORDER);
    // 2/35 = 5,71 % → 6 ; 19/35 = 54,29 % → 54 ; 9/35 = 25,71 % → 26 ; 5/35 = 14,29 % → 14.
    expect(rows.map((r) => [r.label, r.count, r.percent])).toEqual([
      ["Critique", 0, 0],
      ["Élevé", 2, 6],
      ["Modéré", 19, 54],
      ["Faible", 9, 26],
      ["Non évalué", 5, 14],
    ]);
  });

  it("ne divise pas par zéro", () => {
    expect(buildDistribution({ critique: 0, élevé: 0, modéré: 0, faible: 0, non_évalué: 0 }, 0).every((r) => r.percent === 0)).toBe(true);
  });
});

describe("écart avec un exercice simulé", () => {
  it("compare les deux entiers affichés et porte un mot", () => {
    const past = simulateHistoricalComposite("cycle-x", 40.7, 2022) as number;
    const delta = exerciseDelta("cycle-x", 40.7, 2022);
    expect(delta.points).toBe(40 - past);
    if (40 - past > 0) {
      expect(delta.kind).toBe("up");
      expect(delta.text).toBe(`+${40 - past}`);
      expect(delta.word).toBe("hausse");
    } else if (40 - past < 0) {
      expect(delta.kind).toBe("down");
      expect(delta.text).toBe(`−${past - 40}`);
      expect(delta.word).toBe("baisse");
    } else {
      expect(delta.kind).toBe("stable");
    }
  });

  it("signale les deux sens avec un signe typographique", () => {
    // Recherche de deux cycles fictifs dont l'écart simulé est non nul dans chaque sens.
    let up = null;
    let down = null;
    for (let i = 0; i < 200 && (!up || !down); i += 1) {
      const d = exerciseDelta(`c-${i}`, 50, 2023);
      if (d.kind === "up") up = d;
      if (d.kind === "down") down = d;
    }
    expect(up?.text).toMatch(/^\+\d+$/);
    expect(up?.title).toContain("composite en hausse");
    expect(down?.text).toMatch(/^−\d+$/);
    expect(down?.title).toContain("composite en baisse");
  });

  it("n'invente pas d'écart pour un cycle non évalué", () => {
    expect(exerciseDelta("cycle-x", null, 2022)).toMatchObject({ kind: "na", points: null, text: "—", word: "non comparable" });
  });
});

describe("filtres du registre", () => {
  const scores = [score("tva-etat", 24.542), score("creances-clients", 25.1), score("provisions", 56.8), score("ifrs16", null, "partiel")];
  const base = { query: "", minComposite: "", visibleBands: ALL_BANDS_VISIBLE, activeBand: null as CriticityBand | null };

  it("compare le seuil à l'entier affiché et compte à part les cycles sans composite", () => {
    const r = filterRegister(scores, { ...base, minComposite: "24" });
    expect(r.rows.map((s) => s.cycleSlug)).toEqual(["creances-clients", "provisions"]);
    expect(r.hiddenUnevaluated).toBe(1);
    expect(r.thresholdActive).toBe(true);
  });

  it("ignore un seuil vide, nul ou illisible", () => {
    expect(parseThreshold("")).toBeNull();
    expect(parseThreshold("0")).toBeNull();
    expect(parseThreshold("abc")).toBeNull();
    expect(filterRegister(scores, { ...base, minComposite: "0" }).rows).toHaveLength(4);
  });

  it("combine recherche, bandes visibles et bande de la répartition", () => {
    expect(filterRegister(scores, { ...base, query: "CLIENTS" }).rows.map((s) => s.cycleSlug)).toEqual(["creances-clients"]);
    expect(filterRegister(scores, { ...base, visibleBands: { ...ALL_BANDS_VISIBLE, modéré: false } }).rows).toHaveLength(3);
    expect(filterRegister(scores, { ...base, activeBand: "non_évalué" }).rows.map((s) => s.cycleSlug)).toEqual(["ifrs16"]);
  });

  it("compte les cycles par bande", () => {
    expect(countByBand(scores)).toEqual({ faible: 1, modéré: 1, élevé: 1, critique: 0, non_évalué: 1 });
  });

  it("ne présente jamais une ligne non évaluée comme maîtrisée", () => {
    expect(unevaluatedText("non_évalué")).toContain("jamais assimilé à un risque maîtrisé");
    expect(unevaluatedText("partiel")).toMatch(/^exposition seule/);
  });
});

describe("tri du registre", () => {
  it("suit décroissant → croissant → aucun", () => {
    const a = nextSort([], "gravite");
    expect(a).toEqual([{ id: "gravite", desc: true }]);
    const b = nextSort(a, "gravite");
    expect(b).toEqual([{ id: "gravite", desc: false }]);
    expect(nextSort(b, "gravite")).toEqual([]);
    expect(nextSort(b, "composite")).toEqual([{ id: "composite", desc: true }]);
  });

  it("expose aria-sort", () => {
    expect(ariaSort([{ id: "composite", desc: true }], "composite")).toBe("descending");
    expect(ariaSort([{ id: "composite", desc: false }], "composite")).toBe("ascending");
    expect(ariaSort([{ id: "composite", desc: true }], "gravite")).toBe("none");
  });

  it("restaure un tri stocké valide et rejette le reste", () => {
    expect(parseStoredSort('[{"id":"gravite","desc":false}]')).toEqual([{ id: "gravite", desc: false }]);
    expect(parseStoredSort("[]")).toEqual([]);
    expect(parseStoredSort(null)).toBeNull();
    expect(parseStoredSort("{")).toBeNull();
    expect(parseStoredSort('{"id":"x"}')).toBeNull();
    expect(parseStoredSort('[{"id":1,"desc":true}]')).toBeNull();
  });
});

describe("dossier démo", () => {
  it("chaque composite affiché tombe dans la bande calculée par le moteur", async () => {
    const cycles = await loadAllCycles();
    const snapshot = buildDemoDossierSnapshot();
    const exposure = projectSnapshotExposure(snapshot).exposure;
    const materiality = computeMateriality(snapshot.calculationContext.materialityBasis ?? { chiffreAffaires: 0 });
    const scores = buildCycleScores(cycles, snapshot.findings, materiality, {}, exposure);
    expect(scores.length).toBeGreaterThan(0);
    for (const s of scores) expect(bandOfDisplayed(s.composite), s.cycleSlug).toBe(s.criticityBand);
  });
});
