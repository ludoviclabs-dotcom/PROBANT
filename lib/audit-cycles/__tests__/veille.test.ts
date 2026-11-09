import { describe, expect, it } from "vitest";
import type { AuditCycle, MethodologyDocument, NormativeSource } from "../types";
import {
  buildVeilleReport,
  classifyLink,
  cycleSourceIds,
  daysBetween,
  evolutionTiming,
  isIsoDate,
  methodologySourceIds,
  samePage,
  validateVeille,
  type VeilleData,
  type VeilleEvolution,
} from "../veille";

/*
  Attendus établis à la main, indépendamment de l'implémentation : dates calculées sur le calendrier
  (2025-11-09 → 2026-11-09 = 365 jours, 2026 n'étant pas bissextile), rangs de la file tirés de la règle écrite
  dans veille.ts (évolution en vigueur 1, lien mort 2, à venir 3, redirection ou sans adresse 4, non vérifiée 5).
*/

const ARRETE = "2026-11-09";

function source(id: string, extra: Partial<NormativeSource> = {}): NormativeSource {
  return { id, label: id.toUpperCase(), type: "ISA", status: "OBLIGATOIRE", url: `https://example.org/${id}`, ...extra };
}

function cycle(slug: string, applicable: string[], extra: Partial<AuditCycle> = {}): AuditCycle {
  return {
    slug,
    family: "TRANSVERSAL",
    title: `Cycle ${slug}`,
    summary: "",
    pcgAccounts: [],
    probantSiloIds: [],
    probantCloisons: [],
    applicableStandards: applicable.map((id) => ({ id, label: id, status: "OBLIGATOIRE" as const })),
    thresholds: [],
    materiality: undefined as unknown as AuditCycle["materiality"],
    ratios: [],
    analyticalProcedures: [],
    detailTests: [],
    risks: [],
    ifrsVsPcg: [],
    officialSources: [],
    keyPoints: [],
    relatedCycles: [],
    reviewStatus: "REVIEW_REQUIRED",
    ...extra,
  };
}

function evolution(id: string, extra: Partial<VeilleEvolution> = {}): VeilleEvolution {
  return {
    id,
    title: `Évolution ${id}`,
    short: id.toUpperCase(),
    kind: "revision",
    group: "audit",
    issuer: "IAASB",
    officialUrl: `https://example.org/e/${id}`,
    readAt: "2026-11-01",
    access: "read_official_page",
    publishedOn: null,
    effectiveRule: "Exercices ouverts à compter de…",
    effectiveFrom: "2026-01-01",
    quote: null,
    normatifSourceIds: [],
    outdatedInProbant: "Libellé ancien.",
    integration: "a_integrer",
    limits: [],
    ...extra,
  };
}

const veilleOf = (evolutions: VeilleEvolution[], extra: Partial<VeilleData> = {}): VeilleData => ({
  arreteAu: ARRETE,
  perimetre: "test",
  methode: "test",
  reverificationDays: 365,
  evolutions,
  ...extra,
});

describe("dates de la veille", () => {
  it("valide les dates AAAA-MM-JJ réelles seulement", () => {
    expect(isIsoDate("2026-11-09")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("09/11/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("compte les jours sans fuseau horaire", () => {
    expect(daysBetween("2025-11-09", "2026-11-09")).toBe(365);
    expect(daysBetween("2026-11-09", "2026-11-09")).toBe(0);
    expect(daysBetween("2026-11-10", "2026-11-09")).toBe(-1);
  });

  it("situe une évolution à la date d'arrêté, bornes comprises", () => {
    expect(evolutionTiming({ effectiveFrom: "2026-11-09" }, ARRETE)).toBe("en_vigueur");
    expect(evolutionTiming({ effectiveFrom: "2026-11-10" }, ARRETE)).toBe("a_venir");
    expect(evolutionTiming({ effectiveFrom: null }, ARRETE)).toBe("sans_date");
  });
});

describe("relevé des liens", () => {
  it("ne confond pas une variante d'écriture avec une redirection", () => {
    expect(samePage("https://www.ifrs.org/a/ias-2.html", "https://www.ifrs.org/a/ias-2/")).toBe(true);
    expect(samePage("https://www.ifrs.org/a/ias-8-accounting-policies.html", "https://www.ifrs.org/a/ias-8-basis-of-preparation/")).toBe(false);
  });

  it("qualifie chaque réponse HTTP", () => {
    const u = "https://example.org/page";
    expect(classifyLink(u, 200, u)).toBe("ok");
    expect(classifyLink(u, 200, "https://example.org/autre")).toBe("redirige");
    expect(classifyLink(u, 404, u)).toBe("introuvable");
    expect(classifyLink(u, 410, u)).toBe("introuvable");
    expect(classifyLink(u, 403, u)).toBe("non_controlable");
    expect(classifyLink(u, null, null)).toBe("injoignable");
    expect(classifyLink(u, 503, u)).toBe("injoignable");
  });
});

describe("références citées", () => {
  it("réunit normes, sources et sourceIds des blocs d'un cycle, sans doublon", () => {
    const c = cycle("c", ["isa-240"], {
      officialSources: [{ id: "isa-240", label: "x", status: "OBLIGATOIRE" }],
      ratios: [{ name: "r", formula: "", alertThreshold: "", interpretation: "", status: "PARAMETRABLE", sourceIds: ["isa-520"] }],
    });
    expect([...cycleSourceIds(c)].sort()).toEqual(["isa-240", "isa-520"]);
  });

  it("parcourt le contenu méthodologique à toute profondeur", () => {
    const doc: MethodologyDocument = {
      slug: "m",
      title: "M",
      sourceIds: ["isa-320"],
      content: { a: [{ sourceIds: ["nep-320"] }, { b: { sourceIds: ["isa-450"] } }] },
    };
    expect([...methodologySourceIds(doc)].sort()).toEqual(["isa-320", "isa-450", "nep-320"]);
  });
});

describe("rapport de veille", () => {
  const sources = [
    source("isa-570"),
    source("isa-240", { url: "https://example.org/mort" }),
    source("isa-600"),
    source("ias-1", { type: "IAS", verifiedAt: "2025-11-09" }),
    source("nep-300", { type: "NEP", knowledgeSourceId: "h2a-nep-300" }),
    source("sans-adresse", { url: undefined, verifiedAt: "2026-10-01" }),
  ];
  const cycles = [cycle("continuite", ["isa-570", "ias-1"]), cycle("fraude", ["isa-240"]), cycle("calme", ["nep-300"])];
  const methodology: MethodologyDocument[] = [{ slug: "fraud-risk", title: "Fraude", sourceIds: ["isa-240"], content: {} }];
  const report = buildVeilleReport({
    veille: veilleOf([
      evolution("isa-570-r", { effectiveFrom: "2026-12-15", normatifSourceIds: ["isa-570"] }),
      evolution("ifrs-18", { group: "ifrs", effectiveFrom: "2027-01-01", normatifSourceIds: ["ias-1"] }),
      evolution("anc-2022-06", { group: "france", effectiveFrom: "2025-01-01", normatifSourceIds: ["ias-1"], cycleSlugs: ["calme"] }),
      evolution("deja", { effectiveFrom: "2024-01-01", normatifSourceIds: ["isa-600"], integration: "integre" }),
    ]),
    sources,
    cycles,
    methodology,
    linkCheck: {
      checkedAt: "2026-11-09",
      tool: "test",
      entries: [
        { url: "https://example.org/isa-570", httpStatus: 200, finalUrl: "https://example.org/isa-570", outcome: "ok" },
        { url: "https://example.org/mort", httpStatus: 404, finalUrl: "https://example.org/mort", outcome: "introuvable" },
      ],
    },
    knowledge: [{ knowledgeSourceId: "h2a-nep-300", lastVerifiedAt: "2026-08-13" }],
  });
  const byId = new Map(report.sources.map((s) => [s.id, s]));

  it("ne réputé vérifiée qu'une source lue à une date tracée", () => {
    expect(byId.get("isa-570")!.verification).toMatchObject({ state: "jamais", date: null });
    // 2025-11-09 → 2026-11-09 = 365 jours : encore dans le délai de 365 jours.
    expect(byId.get("ias-1")!.verification).toMatchObject({ state: "verifiee", ageDays: 365 });
    expect(byId.get("nep-300")!.verification).toMatchObject({ state: "verifiee", date: "2026-08-13" });
    expect(byId.get("nep-300")!.verification.provenance).toContain("h2a-nep-300");
  });

  it("passe « à revérifier » au-delà du délai", () => {
    const r = buildVeilleReport({
      veille: veilleOf([]),
      sources: [source("vieux", { verifiedAt: "2025-11-08" })],
      cycles: [],
      methodology: [],
      linkCheck: null,
      knowledge: [],
    });
    expect(r.sources[0].verification).toMatchObject({ state: "a_reverifier", ageDays: 366 });
  });

  it("ignore une vérification postérieure à l'arrêté", () => {
    const r = buildVeilleReport({
      veille: veilleOf([]),
      sources: [source("futur", { verifiedAt: "2026-12-01" })],
      cycles: [],
      methodology: [],
      linkCheck: null,
      knowledge: [],
    });
    expect(r.sources[0].verification.state).toBe("jamais");
  });

  it("distingue lien joignable, introuvable, non relevé et absent", () => {
    expect(byId.get("isa-570")!.link.state).toBe("ok");
    expect(byId.get("isa-240")!.link.state).toBe("introuvable");
    expect(byId.get("isa-600")!.link.state).toBe("non_releve");
    expect(byId.get("sans-adresse")!.link.state).toBe("sans_url");
    expect(report.counts.liens).toMatchObject({ ok: 1, introuvable: 1, non_releve: 3, sans_url: 1 });
  });

  it("ordonne la file sans additionner les constats", () => {
    // ias-1 : ANC 2022-06 en vigueur non intégrée → rang 1, même si elle est aussi touchée par IFRS 18 à venir.
    expect(byId.get("ias-1")!.queue.rank).toBe(1);
    expect(byId.get("ias-1")!.queue.reasons).toHaveLength(2);
    expect(byId.get("isa-240")!.queue.rank).toBe(2); // lien introuvable
    expect(byId.get("isa-570")!.queue.rank).toBe(3); // révision à venir
    expect(byId.get("sans-adresse")!.queue.rank).toBe(4); // aucune adresse
    expect(byId.get("isa-600")!.queue.rank).toBe(5); // évolution intégrée, mais jamais vérifiée
    expect(byId.get("nep-300")!.queue.rank).toBe(6); // rien à signaler
    expect(report.sources.map((s) => s.queue.rank)).toEqual([...report.sources.map((s) => s.queue.rank)].sort((a, b) => a - b));
  });

  it("expose les cycles par les sources citées et par rattachement explicite", () => {
    const ex = new Map(report.cycles.map((c) => [c.slug, c]));
    expect(ex.get("continuite")!.enVigueur.map((e) => e.id)).toEqual(["anc-2022-06"]);
    expect(ex.get("continuite")!.aVenir.map((e) => e.id).sort()).toEqual(["ifrs-18", "isa-570-r"]);
    expect(ex.get("calme")!.enVigueur.map((e) => e.id)).toEqual(["anc-2022-06"]);
    expect(ex.get("fraude")!.deadLinks).toEqual(["isa-240"]);
    // Une évolution intégrée n'expose personne.
    expect(report.cycles.every((c) => ![...c.enVigueur, ...c.aVenir].some((e) => e.id === "deja"))).toBe(true);
    expect(report.counts.cyclesExposes).toBe(2);
  });

  it("compte les évolutions par situation", () => {
    expect(report.counts).toMatchObject({ evolutions: 4, enVigueurAIntegrer: 1, aVenirAIntegrer: 2, integrees: 1 });
    expect(report.evolutions.map((e) => e.id)).toEqual(["deja", "anc-2022-06", "isa-570-r", "ifrs-18"]);
  });
});

describe("projets à surveiller et amendements ciblés", () => {
  const sources = [source("isa-500"), source("ias-9")];
  const cycles = [cycle("achats", ["isa-500", "ias-9"])];
  const veille = veilleOf([
    // Exposé-sondage : aucune norme finale, rien à intégrer.
    evolution("projet", { effectiveFrom: null, integration: "a_surveiller", normatifSourceIds: ["isa-500"] }),
    // Amendement ciblé : complète la source sans périmer les fiches qui la citent.
    evolution("cible", { normatifSourceIds: ["ias-9"], exposeCycles: false }),
  ]);
  const report = buildVeilleReport({ veille, sources, cycles, methodology: [], linkCheck: null, knowledge: [] });

  it("un projet à surveiller n'expose ni cycle ni file de revue", () => {
    const ex = report.cycles[0];
    expect(ex.enVigueur.map((e) => e.id)).not.toContain("projet");
    expect(ex.aVenir.map((e) => e.id)).not.toContain("projet");
    const isa500 = report.sources.find((s) => s.id === "isa-500")!;
    expect(isa500.queue.reasons.some((r) => r.includes("PROJET"))).toBe(false);
    expect(report.counts.aSurveiller).toBe(1);
  });

  it("exposeCycles: false garde la source concernée mais n'expose pas les fiches qui la citent", () => {
    const cible = report.evolutions.find((e) => e.id === "cible")!;
    expect(cible.sources.map((s) => s.id)).toEqual(["ias-9"]);
    expect(cible.cycles).toEqual([]);
    expect(report.cycles[0].enVigueur).toEqual([]);
    // La source reste signalée dans la file : l'évolution est ouverte.
    expect(report.sources.find((s) => s.id === "ias-9")!.queue.rank).toBe(1);
    expect(report.counts.enVigueurAIntegrer).toBe(1);
  });

  it("une évolution à surveiller ou une norme absente du registre peut n'être rattachée à rien", () => {
    const issues = validateVeille({
      sources,
      cycles,
      methodology: [],
      veille: veilleOf([
        evolution("sans-rattachement-projet", { integration: "a_surveiller" }),
        evolution("sans-rattachement-absente", { kind: "absence_registre" }),
      ]),
    });
    expect(issues).toEqual([]);
  });
});

describe("validation de la veille", () => {
  const base = { sources: [source("isa-570")], cycles: [cycle("c", [])], methodology: [] as MethodologyDocument[] };

  it("accepte une évolution complète", () => {
    expect(validateVeille({ ...base, veille: veilleOf([evolution("ok", { normatifSourceIds: ["isa-570"] })]) })).toEqual([]);
  });

  it("refuse les identifiants inconnus, les doublons et les dates invalides", () => {
    const issues = validateVeille({
      ...base,
      veille: veilleOf([
        evolution("a", { normatifSourceIds: ["inconnue"], effectiveFrom: "2026-13-01" }),
        evolution("a", { normatifSourceIds: ["isa-570"], cycleSlugs: ["absent"] }),
      ]),
    });
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        "Source inconnue du registre : inconnue",
        "Date invalide : 2026-13-01",
        "Identifiant en double.",
        "Cycle inconnu : absent",
      ]),
    );
  });

  it("exige la preuve d'une évolution établie et la provenance d'un fait repris", () => {
    const issues = validateVeille({
      ...base,
      veille: veilleOf([
        evolution("sans-preuve", { normatifSourceIds: ["isa-570"], officialUrl: null }),
        evolution("repris", { normatifSourceIds: ["isa-570"], access: "repris_du_depot" }),
        evolution("lu-apres", { normatifSourceIds: ["isa-570"], readAt: "2026-12-01" }),
        evolution("orphelin"),
      ]),
    });
    expect(issues.map((i) => `${i.field} ${i.message}`)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("evolutions.sans-preuve Une évolution établie"),
        expect.stringContaining("evolutions.repris Un fait repris du dépôt"),
        expect.stringContaining("evolutions.lu-apres.readAt Lecture postérieure"),
        expect.stringContaining("evolutions.orphelin Évolution rattachée à aucune"),
      ]),
    );
  });

  it("refuse un texte devenu objet : un « : » non quoté en YAML (régression du panneau de détail)", () => {
    // `- La nouvelle définition n'est pas recopiée ici : la lire…` est lu par YAML comme { "La nouvelle … ici": "la lire…" }.
    const asObject = { "La nouvelle définition n'est pas recopiée ici": "la lire à l'article 513-5" } as unknown as string;
    const issues = validateVeille({
      ...base,
      veille: veilleOf([
        evolution("limite-objet", { normatifSourceIds: ["isa-570"], limits: [asObject] }),
        evolution("note-objet", { normatifSourceIds: ["isa-570"], integrationNote: asObject }),
        evolution("titre-objet", { normatifSourceIds: ["isa-570"], title: asObject }),
      ]),
    });
    expect(issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["evolutions.limite-objet.limits", "evolutions.note-objet.integrationNote", "evolutions.titre-objet.title"]),
    );
  });

  it("n'exige pas d'adresse pour un fait officiellement illisible", () => {
    const issues = validateVeille({
      ...base,
      veille: veilleOf([evolution("illisible", { normatifSourceIds: ["isa-570"], access: "inaccessible", officialUrl: null, readAt: null })]),
    });
    expect(issues).toEqual([]);
  });
});
