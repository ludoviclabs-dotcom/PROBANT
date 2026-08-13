/**
 * Tests du plan de connaissance.
 *
 * Deux natures de tests, délibérément séparées :
 *
 *  1. les données réelles chargent et passent les huit contrôles ;
 *  2. chaque contrôle ÉCHOUE bien sur une violation fabriquée.
 *
 * Le second point est le seul qui prouve quelque chose. Un garde-fou qu'on n'a
 * jamais vu se déclencher n'est pas un garde-fou : c'est une fonction qui
 * retourne un tableau vide.
 */

import { describe, expect, it } from "vitest";
import {
  loadCrosswalks,
  loadFecControls,
  loadIfrs,
  loadKnowledgeBase,
  loadNep,
  loadPcg,
  loadStatistics,
} from "@/lib/knowledge/content/loader";
import {
  checkEndorsementNotAssumedPositive,
  checkMandatoryControlsHaveSource,
  checkNoExcessiveIfrsQuotation,
  checkNoFutureStandardPresentedAsEffective,
  checkNoSecondarySourceAsMandatory,
  checkPcgDifferencesAreSourced,
  checkStatisticsAreIsolated,
  checkStatisticsAreQualified,
  isEffectiveAt,
  validateKnowledgeBase,
} from "@/lib/knowledge/content/validation";
import type {
  Crosswalk,
  FecControlSet,
  IfrsSet,
  IfrsStandard,
  StatisticSet,
} from "@/lib/knowledge/content/schemas";

/** Date de référence figée : les tests ne doivent pas dépendre de l'horloge. */
const AT = "2026-08-14";

/* ───────────────────────── Chargement des données réelles ─────────────────── */

describe("chargement", () => {
  it("charge et valide les six référentiels", async () => {
    const kb = await loadKnowledgeBase();
    expect(kb.fecFields.fields).toHaveLength(18);
    expect(kb.fecControls.controls.length).toBeGreaterThan(0);
    expect(kb.nep.entries.length).toBeGreaterThan(0);
    expect(kb.ifrs.entries.length).toBeGreaterThan(0);
    expect(kb.crosswalks).toHaveLength(6);
  });

  it("couvre les 21 normes IAS/IFRS prioritaires du produit", async () => {
    const ifrs = await loadIfrs();
    const ids = ifrs.entries.map((e) => e.id);
    const attendus = [
      "ias-2", "ias-7", "ias-8", "ias-10", "ias-12", "ias-16", "ias-19",
      "ias-21", "ias-24", "ias-36", "ias-37", "ias-38",
      "ifrs-3", "ifrs-7", "ifrs-9", "ifrs-10", "ifrs-15", "ifrs-16",
      "ifrs-17", "ifrs-18", "ifrs-19",
    ];
    for (const id of attendus) expect(ids).toContain(id);
    expect(attendus).toHaveLength(21);
  });

  it("couvre les douze familles de contrôles FEC", async () => {
    const controls = await loadFecControls();
    const familles = new Set(controls.controls.map((c) => c.family));
    for (const f of [
      "presence", "ordre", "type", "date", "montant", "sequence",
      "equilibre", "compte", "piece", "periode", "devise", "lettrage",
    ]) {
      expect([...familles]).toContain(f);
    }
    expect(familles.size).toBe(12);
  });

  it("couvre les neuf thèmes NEP demandés", async () => {
    const nep = await loadNep();
    const themes = new Set(nep.entries.flatMap((e) => e.themes));
    for (const t of [
      "documentation", "planification", "risques", "materialite",
      "reponses_aux_risques", "anomalies", "elements_probants",
      "selection", "rapport",
    ]) {
      expect([...themes]).toContain(t);
    }
  });

  it("indexe une version consolidée du PCG et des règlements datés", async () => {
    const pcg = await loadPcg();
    expect(pcg.consolidatedVersion).toBe("2026-01-01");
    // Chaque exigence porte les trois attributs de datation exigés.
    for (const r of pcg.requirements) {
      expect(r).toHaveProperty("effectiveFrom");
      expect(r).toHaveProperty("effectiveTo");
      expect(["verified", "review_required", "out_of_scope"]).toContain(r.status);
    }
  });
});

/* ──────────────────── Les données réelles passent les contrôles ───────────── */

describe("intégrité des données réelles", () => {
  it("passe les huit contrôles sans erreur", async () => {
    const [fecControls, ifrs, crosswalks, statistics] = await Promise.all([
      loadFecControls(),
      loadIfrs(),
      loadCrosswalks(),
      loadStatistics(),
    ]);

    const report = validateKnowledgeBase(
      { fecControls, ifrs, crosswalks, statistics },
      AT,
    );

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("ne présente aucune norme comme applicable avant sa date d'effet", async () => {
    const ifrs = await loadIfrs();
    for (const s of ifrs.entries) {
      if (s.presentedAsEffective) expect(isEffectiveAt(s, AT)).toBe(true);
    }
  });

  it("n'affirme pas l'adoption UE d'IFRS 19, non adoptée au 17/07/2026", async () => {
    const ifrs = await loadIfrs();
    const ifrs19 = ifrs.entries.find((e) => e.id === "ifrs-19");
    expect(ifrs19?.euEndorsement.status).toBe("not_endorsed");
  });

  it("ne présente pas IFRS 18 comme applicable en 2026", async () => {
    const ifrs = await loadIfrs();
    const ifrs18 = ifrs.entries.find((e) => e.id === "ifrs-18");
    expect(ifrs18?.iasbEffectiveDate).toBe("2027-01-01");
    expect(isEffectiveAt(ifrs18!, AT)).toBe(false);
    expect(ifrs18?.presentedAsEffective).toBe(false);
  });

  it("cloisonne les statistiques : aucune n'est atteignable par un crosswalk", async () => {
    const [crosswalks, statistics] = await Promise.all([
      loadCrosswalks(),
      loadStatistics(),
    ]);
    expect(checkStatisticsAreIsolated(crosswalks)).toEqual([]);
    for (const s of statistics.statistics) {
      expect(s.contributesToScore).toBe(false);
    }
  });
});

/* ─────────────── Chaque contrôle échoue bien sur une violation ────────────── */

/** Fabrique une norme IFRS minimale, valide, que chaque test dégrade ensuite. */
function makeStandard(over: Partial<IfrsStandard> = {}): IfrsStandard {
  return {
    id: "ifrs-99",
    number: "IFRS 99",
    title: "Norme de test",
    iasbStatus: "issued",
    iasbEffectiveDate: null,
    presentedAsEffective: false,
    euEndorsement: { status: "unknown", sources: [] },
    scope: "Périmètre de test.",
    topics: [],
    affectedCycles: [],
    pcgDifferences: [],
    dataRequirements: [],
    disclosureRequirements: [],
    status: "review_required",
    sources: [{ sourceId: "ifrs-standards-master", kind: "primary" }],
    ...over,
  } as IfrsStandard;
}

const asIfrsSet = (entries: IfrsStandard[]): IfrsSet => ({
  referentialId: "test",
  label: "test",
  entries,
});

describe("K-001 — règle obligatoire sans source", () => {
  it("échoue quand un contrôle hard_law ne cite aucune source primaire", () => {
    const set: FecControlSet = {
      referentialId: "test",
      label: "test",
      controls: [
        {
          id: "FEC-PRESENCE-999",
          family: "presence",
          label: "Contrôle opposable non sourcé",
          expectation: "…",
          appliesTo: [],
          basis: "hard_law",
          sources: [],
          variant: "both",
          status: "verified",
        },
      ],
    };
    const issues = checkMandatoryControlsHaveSource(set);
    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe("K-001");
  });

  it("accepte un contrôle internal sans source", () => {
    const set: FecControlSet = {
      referentialId: "test",
      label: "test",
      controls: [
        {
          id: "FEC-PRESENCE-998",
          family: "presence",
          label: "Heuristique interne",
          expectation: "…",
          appliesTo: [],
          basis: "internal",
          sources: [],
          variant: "both",
          status: "review_required",
        },
      ],
    };
    expect(checkMandatoryControlsHaveSource(set)).toEqual([]);
  });
});

describe("K-002 — source de doctrine classée obligatoire", () => {
  it("échoue quand une publication EY est déclarée primaire", () => {
    const set: FecControlSet = {
      referentialId: "test",
      label: "test",
      controls: [
        {
          id: "FEC-COMPTE-999",
          family: "compte",
          label: "Contrôle appuyé sur de la doctrine",
          expectation: "…",
          appliesTo: [],
          basis: "hard_law",
          sources: [
            { sourceId: "ey-guide-fec", kind: "primary", url: "https://www.ey.com/x" },
          ],
          variant: "both",
          status: "verified",
        },
      ],
    };
    const issues = checkNoSecondarySourceAsMandatory(set, asIfrsSet([]));
    expect(issues.some((i) => i.control === "K-002")).toBe(true);
  });

  it("échoue aussi pour PwC sur une fiche IFRS", () => {
    const std = makeStandard({
      sources: [{ sourceId: "pwc-manual", kind: "primary", url: "https://www.pwc.com/x" }],
    });
    const issues = checkNoSecondarySourceAsMandatory(
      { referentialId: "t", label: "t", controls: [] },
      asIfrsSet([std]),
    );
    expect(issues.some((i) => i.control === "K-002")).toBe(true);
  });
});

describe("K-003 — norme IFRS future présentée effective", () => {
  it("échoue quand une norme à effet 2027 est présentée applicable en 2026", () => {
    const std = makeStandard({
      iasbEffectiveDate: "2027-01-01",
      presentedAsEffective: true,
    });
    const issues = checkNoFutureStandardPresentedAsEffective(asIfrsSet([std]), AT);
    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe("K-003");
  });

  it("échoue quand la date d'effet est inconnue mais la norme dite applicable", () => {
    const std = makeStandard({ iasbEffectiveDate: null, presentedAsEffective: true });
    expect(checkNoFutureStandardPresentedAsEffective(asIfrsSet([std]), AT)).toHaveLength(1);
  });

  it("accepte une norme dont la date d'effet est atteinte", () => {
    const std = makeStandard({
      iasbEffectiveDate: "2020-01-01",
      presentedAsEffective: true,
    });
    expect(checkNoFutureStandardPresentedAsEffective(asIfrsSet([std]), AT)).toEqual([]);
  });
});

describe("K-004 — adoption UE inconnue présentée positive", () => {
  it("échoue quand « endorsed » est affirmé sans base ni source", () => {
    const std = makeStandard({
      euEndorsement: { status: "endorsed", sources: [] },
    });
    const issues = checkEndorsementNotAssumedPositive(asIfrsSet([std]));
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.control === "K-004")).toBe(true);
  });

  it("accepte le statut « unknown », qui n'affirme rien", () => {
    const std = makeStandard({ euEndorsement: { status: "unknown", sources: [] } });
    expect(checkEndorsementNotAssumedPositive(asIfrsSet([std]))).toEqual([]);
  });
});

describe("K-005 — différence PCG/IFRS sans source", () => {
  it("échoue quand une divergence est affirmée sans source", () => {
    const std = makeStandard({
      pcgDifferences: [
        {
          topic: "Frais de développement",
          ifrsTreatment: "Activation sous conditions",
          pcgTreatment: "Option",
          status: "review_required",
          sources: [],
        },
      ],
    });
    const issues = checkPcgDifferencesAreSourced(asIfrsSet([std]));
    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe("K-005");
  });
});

describe("K-006 — statistique sans date, unité ou périmètre", () => {
  it("échoue quand l'unité et le périmètre sont vides", () => {
    const set: StatisticSet = {
      referentialId: "test",
      label: "test",
      statistics: [
        {
          id: "stat-test",
          label: "Mesure incomplète",
          value: 42,
          unit: "  ",
          asOf: "2026-01-01",
          scope: "",
          status: "review_required",
          sources: [{ sourceId: "x", kind: "primary" }],
          contributesToScore: false,
        },
      ],
    };
    const issues = checkStatisticsAreQualified(set);
    expect(issues.map((i) => i.message).sort()).toEqual([
      "périmètre vide",
      "unité vide",
    ]);
  });
});

describe("K-007 — citation IFRS excessive", () => {
  it("échoue au-delà du plafond de citation", () => {
    const std = makeStandard({ note: `Extrait : « ${"a".repeat(250)} »` });
    const issues = checkNoExcessiveIfrsQuotation(asIfrsSet([std]));
    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe("K-007");
  });

  it("accepte une citation courte", () => {
    const std = makeStandard({ note: "Le texte parle de « juste valeur »." });
    expect(checkNoExcessiveIfrsQuotation(asIfrsSet([std]))).toEqual([]);
  });
});

describe("K-008 — cloisonnement des statistiques", () => {
  it("échoue si un crosswalk référence une statistique", () => {
    const cw: Crosswalk[] = [
      {
        kind: "control_source",
        label: "test",
        links: [
          {
            from: "FEC-COMPTE-001",
            to: "stat-taux-anomalie",
            relation: "related",
            status: "review_required",
            sources: [],
          },
        ],
      },
    ];
    const issues = checkStatisticsAreIsolated(cw);
    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe("K-008");
  });
});
