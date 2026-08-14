import { describe, expect, it } from "vitest";
import {
  MEASURED_PAGES,
  MINIMUM_SAMPLES,
  VITAL_BUDGETS,
  classifyPage,
  percentile,
  rate,
  summarize,
  vitalBatchSchema,
  type VitalSample,
} from "../web-vitals";

describe("budgets Core Web Vitals", () => {
  it("reprend les seuils « good » au P75 exigés par la revue", () => {
    expect(VITAL_BUDGETS.LCP.good).toBe(2_500);
    expect(VITAL_BUDGETS.INP.good).toBe(200);
    expect(VITAL_BUDGETS.CLS.good).toBe(0.1);
  });

  it("classe une valeur par rapport à son budget", () => {
    expect(rate("LCP", 2_400)).toBe("good");
    expect(rate("LCP", 2_500)).toBe("good");
    expect(rate("LCP", 2_501)).toBe("needs-improvement");
    expect(rate("LCP", 4_001)).toBe("poor");
    expect(rate("CLS", 0.1)).toBe("good");
    expect(rate("CLS", 0.26)).toBe("poor");
  });
});

describe("classification des pages mesurées", () => {
  it("couvre les sept pages demandées", () => {
    expect(classifyPage("/")).toBe("landing");
    expect(classifyPage("/dashboard/depot")).toBe("depot");
    expect(classifyPage("/dashboard/synthese")).toBe("synthese");
    expect(classifyPage("/dashboard/risques")).toBe("risques");
    expect(classifyPage("/dashboard/cloisons")).toBe("cloisons");
    expect(classifyPage("/dashboard/referentiel")).toBe("referentiel");
    expect(classifyPage("/dashboard/dossier")).toBe("dossier-preuve");
  });

  it("réduit toute autre route à « autre » — aucun identifiant ne fuit", () => {
    expect(classifyPage("/dashboard/22222222-2222-4222-8222-222222222222/synthese")).toBe(
      "autre",
    );
    expect(classifyPage("/normatif/cycle-clients")).toBe("autre");
  });

  it("ignore la chaîne de requête et le fragment", () => {
    expect(classifyPage("/dashboard/synthese?dossier=secret#bloc")).toBe("synthese");
  });
});

describe("contrat d'ingestion RUM", () => {
  const valid = {
    samples: [{ name: "LCP", value: 1_800, page: "synthese", navigationType: "navigate" }],
  };

  it("accepte un lot conforme", () => {
    expect(vitalBatchSchema.safeParse(valid).success).toBe(true);
  });

  it("refuse une page hors de la liste fermée", () => {
    expect(
      vitalBatchSchema.safeParse({
        samples: [{ ...valid.samples[0], page: "/dashboard/22222222-secret" }],
      }).success,
    ).toBe(false);
  });

  it("refuse une métrique inconnue ou une valeur aberrante", () => {
    expect(
      vitalBatchSchema.safeParse({ samples: [{ ...valid.samples[0], name: "TTFB" }] }).success,
    ).toBe(false);
    expect(
      vitalBatchSchema.safeParse({ samples: [{ ...valid.samples[0], value: -1 }] }).success,
    ).toBe(false);
  });

  it("borne la taille d'un lot", () => {
    expect(
      vitalBatchSchema.safeParse({
        samples: Array.from({ length: 21 }, () => valid.samples[0]),
      }).success,
    ).toBe(false);
    expect(vitalBatchSchema.safeParse({ samples: [] }).success).toBe(false);
  });
});

describe("percentile", () => {
  it("interpole le P75", () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3.25);
    expect(percentile([10], 0.75)).toBe(10);
    expect(percentile([], 0.75)).toBeNaN();
  });

  it("ne dépend pas de l'ordre d'arrivée", () => {
    const values = [500, 100, 900, 300, 700];
    expect(percentile(values, 0.75)).toBe(percentile([...values].reverse(), 0.75));
  });
});

describe("agrégation", () => {
  function samples(page: VitalSample["page"], name: VitalSample["name"], values: number[]) {
    return values.map((value) => ({
      name,
      value,
      page,
      navigationType: "navigate" as const,
    }));
  }

  it("regroupe par page et par métrique", () => {
    const summary = summarize([
      ...samples("synthese", "LCP", [1_000, 2_000, 3_000, 4_000]),
      ...samples("depot", "LCP", [500, 600]),
    ]);
    expect(summary).toHaveLength(2);
    expect(summary.map((item) => item.page)).toEqual(["depot", "synthese"]);
  });

  it("signale un échantillon insuffisant sans refuser de publier la valeur", () => {
    const summary = summarize(samples("synthese", "LCP", [1_000, 2_000, 3_000]));
    expect(summary[0].insufficientData).toBe(true);
    expect(summary[0].sampleCount).toBe(3);
    expect(Number.isFinite(summary[0].p75)).toBe(true);
  });

  it("ne signale plus l'insuffisance au-delà du volume minimal", () => {
    const summary = summarize(
      samples("synthese", "INP", Array.from({ length: MINIMUM_SAMPLES }, () => 120)),
    );
    expect(summary[0].insufficientData).toBe(false);
    expect(summary[0].rating).toBe("good");
  });

  it("produit une sortie stable quel que soit l'ordre des échantillons", () => {
    const input = [
      ...samples("risques", "CLS", [0.02, 0.3, 0.05]),
      ...samples("cloisons", "LCP", [2_000, 5_000]),
    ];
    expect(summarize(input)).toEqual(summarize([...input].reverse()));
  });

  it("n'accepte que des pages de la liste mesurée", () => {
    for (const page of MEASURED_PAGES) {
      expect(summarize(samples(page, "LCP", [1_000]))[0].page).toBe(page);
    }
  });
});
