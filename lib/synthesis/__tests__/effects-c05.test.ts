import { describe, expect, it } from "vitest";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { generateSynthesisNote } from "@/lib/synthesis/note";
import { scoreGravite } from "@/lib/risk-mapping/scoring";
import { buildCycleScores, buildPageAggregates } from "@/lib/risk-mapping/aggregate";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding, makeReviewEvent } from "./fixtures";
import type { Finding } from "@/lib/canonical-model/finding";

/**
 * C05 — recette indépendante des effets financiers. Attendus posés depuis le prompt,
 * sans lecture de l'implémentation : un signal n'est pas un effet ; une répétition exacte
 * compte une fois ; des montants divergents sous la même identité sont un conflit sauf
 * succession démontrée ; un chevauchement partiel reste indéterminé ; aucune compensation ;
 * net inconnu sans taux ET qualification ; corrigé ≠ non corrigé.
 */
const build = (findings: Finding[], over: Parameters<typeof makeDossierSnapshot>[0] = {}) =>
  buildSynthesisSnapshot(makeDossierSnapshot({ findings, ...over }), { clock: CLOCK });
const resultNet = (s: ReturnType<typeof build>) => s.exposure.netByTarget.find((n) => n.target === "resultat");
const stage = (s: ReturnType<typeof build>, direction: "increase" | "decrease" = "increase") => s.exposure.stages.find((x) => x.target === "resultat" && x.direction === direction);

describe("signal sans effet", () => {
  it("montant 100 000 / seuil 50 000 en EUR sans effet explicite : aucune exposition, signal listé, gravité sans montant inféré", () => {
    const f = makeFinding("f-sig", { mesure: { constate: 100_000, seuil: 50_000, unite: "EUR", libelle: "solde" } });
    const s = build([f]);
    expect(s.exposure.grossDetectedExposureCents).toBe(0);
    expect(s.exposure.determinedExposureCents).toBe(0);
    expect(s.exposure.findingsWithoutEffect).toEqual(["f-sig"]);
    const g = scoreGravite([f], { significativite: 50_000, performance: 25_000, trivialite: 2_500, source: "test", basis: "test" } as never);
    expect(g.drivers.some((d) => d.label.startsWith("Signaux EUR sans effet explicite"))).toBe(true);
    expect(g.drivers.some((d) => d.label.startsWith("Effets financiers explicites"))).toBe(false);
    // Le signal pèse sur la priorité (driver, composante qualitative) mais n'ajoute aucun euro.
    const agg = buildPageAggregates([], buildCycleScores([], [f], null, {}), [f]);
    expect(agg.totalIncidenceEur).toBe(0);
    expect(agg.eurSignalsWithoutEffect).toEqual(["f-sig"]);
  });
});

describe("identité, versions, empreinte", () => {
  const same = (id: string, over: Partial<Finding> = {}) =>
    makeFinding(id, { financialEffect: makeEffect({ amountCents: 10_000 }), lignesSource: [7], ...over });

  it("doublon exact : compté une fois, écarté avec motif", () => {
    const s = build([same("f-a"), same("f-b", { ruleId: "R-OTHER" })]);
    expect(s.exposure.grossDetectedExposureCents).toBe(20_000);
    expect(s.exposure.exactRepeatsCents).toBe(10_000);
    expect(s.exposure.determinedExposureCents).toBe(10_000);
    expect(s.exposure.clusters[0].members.map((m) => m.role).sort()).toEqual(["exact_repeat", "retained"]);
  });

  it("montants 100 et 120 sous la même identité, sans succession démontrée : conflit, agrégation indéterminée, détail conservé", () => {
    const s = build([same("f-100"), same("f-120", { financialEffect: makeEffect({ amountCents: 12_000 }) })]);
    expect(s.exposure.clusters).toHaveLength(1);
    expect(s.exposure.clusters[0]).toMatchObject({ status: "conflict", retainedCents: null, boundsCents: { minCents: 10_000, maxCents: 12_000 } });
    expect(s.exposure.clusters[0].members).toHaveLength(2);
    expect(s.exposure.determinedExposureCents).toBe(0);
    expect(s.limitations.some((l) => l.code === "exposure_indeterminate" && l.subjects.includes("f-100") && l.subjects.includes("f-120"))).toBe(true);
    // Le maximum n'est jamais présenté comme une somme.
    expect(s.exposure.aggregationStatus).toBe("indeterminate");
  });

  it("succession de versions démontrée (v2 remplace v1) : dernière version retenue, l'ancienne écartée avec motif", () => {
    const s = build([
      same("f-v1", { financialEffect: makeEffect({ amountCents: 10_000, evaluationVersion: 1 }) }),
      same("f-v2", { financialEffect: makeEffect({ amountCents: 12_000, evaluationVersion: 2, supersedesFindingId: "f-v1" }) }),
    ]);
    expect(s.exposure.clusters[0]).toMatchObject({ status: "determined", retainedCents: 12_000, retainedFindingId: "f-v2" });
    expect(s.exposure.determinedExposureCents).toBe(12_000);
    const trace = s.calculationTrace.find((t) => t.metricId === "exposure.determinedExposureCents")!;
    expect(trace.excludedItems).toContainEqual(expect.objectContaining({ id: "f-v1", reason: expect.stringMatching(/version d'évaluation remplacée par f-v2/) }));
  });

  it("branches de versions (v2 → v1 et v3 → v1) : pas de prédécesseur direct, conflit", () => {
    const s = build([
      same("f-v1", { financialEffect: makeEffect({ amountCents: 10_000, evaluationVersion: 1 }) }),
      same("f-v2", { financialEffect: makeEffect({ amountCents: 12_000, evaluationVersion: 2, supersedesFindingId: "f-v1" }) }),
      same("f-v3", { financialEffect: makeEffect({ amountCents: 15_000, evaluationVersion: 3, supersedesFindingId: "f-v1" }) }),
    ]);
    expect(s.exposure.clusters[0].status).toBe("conflict");
    expect(s.exposure.supersededVersionsCents).toBe(0);
  });

  it("chaîne v1 → v2 → v3 : les versions remplacées sont tracées et affichées", () => {
    const s = build([
      same("f-v1", { financialEffect: makeEffect({ amountCents: 10_000, evaluationVersion: 1 }) }),
      same("f-v2", { financialEffect: makeEffect({ amountCents: 12_000, evaluationVersion: 2, supersedesFindingId: "f-v1" }) }),
      same("f-v3", { financialEffect: makeEffect({ amountCents: 15_000, evaluationVersion: 3, supersedesFindingId: "f-v2" }) }),
    ]);
    expect(s.exposure.determinedExposureCents).toBe(15_000);
    expect(s.exposure.supersededVersionsCents).toBe(22_000);
    expect(s.exposure.grossDetectedExposureCents).toBe(37_000);
  });

  it("répétitions exactes aux décisions de revue divergentes : conflit explicite, jamais départagé par l'ordre des identifiants", () => {
    const a = build([same("f-a", { statutRevue: "valide" }), same("f-b", { statutRevue: "ecarte", ruleId: "R-OTHER" })]);
    const b = build([same("f-a", { statutRevue: "ecarte" }), same("f-b", { statutRevue: "valide", ruleId: "R-OTHER" })]);
    for (const s of [a, b]) {
      expect(s.exposure.clusters[0].status).toBe("conflict");
      expect(s.exposure.clusters[0].reason).toMatch(/décisions de revue divergentes/);
      expect(s.exposure.determinedExposureCents).toBe(0);
      expect(s.exposure.netByTarget).toEqual([]);
    }
  });

  it("une version déclarée sans chaînage vers l'ancienne n'est pas une succession : conflit", () => {
    const s = build([
      same("f-v1", { financialEffect: makeEffect({ amountCents: 10_000, evaluationVersion: 1 }) }),
      same("f-v2", { financialEffect: makeEffect({ amountCents: 12_000, evaluationVersion: 2 }) }),
    ]);
    expect(s.exposure.clusters[0].status).toBe("conflict");
  });
});

describe("chevauchements et sens", () => {
  const mk = (id: string, lignes: number[], amountCents: number, direction: "increase" | "decrease" = "increase") =>
    makeFinding(id, { financialEffect: makeEffect({ amountCents, direction, rootCause: `cause-${id}` }), lignesSource: lignes });

  it("A = L1/L2 pour 100, B = L2/L3 pour 120 : indéterminé, bornes [120, 220], ni max ni somme", () => {
    const s = build([mk("A", [1, 2], 10_000), mk("B", [2, 3], 12_000)]);
    expect(s.exposure.clusters[0]).toMatchObject({ status: "indeterminate", retainedCents: null, boundsCents: { minCents: 12_000, maxCents: 22_000 } });
    expect(s.exposure.determinedExposureCents).toBe(0);
    expect(s.exposure.exposureBoundsCents).toEqual({ minCents: 12_000, maxCents: 22_000 });
  });

  it("chaîne L1/L2, L2/L3, L3/L4 : un seul groupe indéterminé, bornes [max, somme]", () => {
    const s = build([mk("A", [1, 2], 10_000), mk("B", [2, 3], 12_000), mk("C", [3, 4], 5_000)]);
    expect(s.exposure.clusters).toHaveLength(1);
    expect(s.exposure.clusters[0].boundsCents).toEqual({ minCents: 12_000, maxCents: 27_000 });
  });

  it("sens opposés sur des écritures communes : aucune compensation, indéterminé", () => {
    const s = build([mk("A", [1], 10_000, "increase"), mk("B", [1], 4_000, "decrease")]);
    expect(s.exposure.clusters[0]).toMatchObject({ status: "indeterminate", direction: "mixed" });
    expect(s.exposure.clusters[0].reason).toMatch(/aucune compensation/);
    expect(s.exposure.determinedExposureCents).toBe(0);
  });

  it("effets indépendants par poste et sens : conservés séparément, jamais additionnés entre postes", () => {
    const s = build([
      makeFinding("R+", { financialEffect: makeEffect({ amountCents: 10_000, direction: "increase", target: "resultat" }), lignesSource: [1] }),
      makeFinding("R-", { financialEffect: makeEffect({ amountCents: 4_000, direction: "decrease", target: "resultat" }), lignesSource: [2] }),
      makeFinding("P+", { financialEffect: makeEffect({ amountCents: 7_000, direction: "increase", target: "bilan_passif" }), lignesSource: [3] }),
    ]);
    expect(s.exposure.stages.map((st) => [st.target, st.direction, st.initialCents])).toEqual([
      ["bilan_passif", "increase", 7_000],
      ["resultat", "decrease", 4_000],
      ["resultat", "increase", 10_000],
    ]);
    expect(s.exposure.determinedExposureCents).toBe(21_000);
    expect(s.exposure.netByTarget).toEqual([]);
  });
});

describe("fiscalité : net inconnu sans taux et qualification", () => {
  it("+1 000 validé avec fiscalité inconnue (pas de taux) : brut connu, impôt inconnu, net inconnu, limitation", () => {
    const s = build([makeFinding("f", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: undefined, taxQualification: undefined }), lignesSource: [1] })]);
    const r = resultNet(s)!;
    expect(r.proposedSignedCents).toBe(100_000);
    expect(s.exposure.tax).toMatchObject({ status: "unknown", knownCents: 0 });
    expect(r.netAfterKnownTaxCents).toBeNull();
    expect(r.partialNetKnownSubsetCents).toBe(0);
    expect(s.limitations.some((l) => l.code === "tax_incidence_unknown" && l.subjects.includes("f"))).toBe(true);
    expect(s.exposure.taxIncidence).toMatchObject({ provider: "none", method: "before_after_is_scenario", pendingFindingIds: ["f"] });
  });

  it("taux explicite sans qualification fiscale : pas de net validé", () => {
    const s = build([makeFinding("f", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, taxQualification: undefined }), lignesSource: [1] })]);
    expect(resultNet(s)!.netAfterKnownTaxCents).toBeNull();
    expect(s.exposure.tax.unknown[0].reason).toMatch(/sans qualification fiscale/);
  });

  it("deux effets, un seul qualifié : impôt partiel, net inconnu et sous-total partiel nommé", () => {
    const s = build([
      makeFinding("q", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, taxQualification: "deductible" }), lignesSource: [1] }),
      makeFinding("u", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 40_000, taxRatePct: undefined, taxQualification: undefined }), lignesSource: [2] }),
    ]);
    const r = resultNet(s)!;
    expect(r.taxStatus).toBe("partial");
    expect(r.netAfterKnownTaxCents).toBeNull();
    expect(r.partialNetKnownSubsetCents).toBe(75_000);
    expect(s.exposure.tax).toMatchObject({ status: "partial", knownCents: 25_000 });
  });

  it("impôt du waterfall limité au poste résultat : un ajustement qualifié sur le passif n'entre pas dans l'étape impôt du résultat", () => {
    const snapshot = makeDossierSnapshot({ findings: [
      makeFinding("r", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, taxQualification: "deductible", target: "resultat" }), lignesSource: [1] }),
      makeFinding("p", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, taxQualification: "deductible", target: "bilan_passif" }), lignesSource: [2] }),
    ] });
    const synthesis = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
    expect(synthesis.exposure.tax.knownCents).toBe(50_000);
    const datasets = buildSynthesisDatasets({ synthesis, societe: { raisonSociale: "T", siren: "000000000", exercice: "2024", dateCloture: "20241231" }, findings: snapshot.findings, admissibilityFindings: snapshot.admissibilityFindings, dossier: snapshot });
    const byId = Object.fromEntries(datasets.waterfall.steps.map((st) => [st.id, st.amountCents]));
    expect(byId.tax).toBe(-25_000);
    expect(byId.net).toBe(75_000);
  });

  it("non déductible : impôt connu égal à zéro, net validé", () => {
    const s = build([makeFinding("n", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxQualification: "non_deductible" }), lignesSource: [1] })]);
    expect(resultNet(s)!.netAfterKnownTaxCents).toBe(100_000);
  });
});

describe("correction comptabilisée", () => {
  const corrected = (id: string, correction?: { amountCents: number }) =>
    makeFinding(id, { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, correction }), lignesSource: [1] });
  const event = (f: Finding) => makeReviewEvent(f, "corrected", `ev-${f.id}`);

  it("correction totale : corrigé = effet, résiduel nul, aucune anomalie non corrigée", () => {
    const f = corrected("c", { amountCents: 100_000 });
    const s = build([f], { reviewEvents: [event(f)] });
    expect(stage(s)).toMatchObject({ initialCents: 100_000, proposedCents: 0, correctedCents: 100_000, residualCents: 0 });
    expect(s.exposure.netByTarget).toEqual([]);
  });

  it("correction partielle 60 sur 100 : corrigé 60, résiduel 40 ; seul le résiduel alimente les anomalies non corrigées", () => {
    const f = corrected("c", { amountCents: 60_000 });
    const s = build([f], { reviewEvents: [event(f)] });
    expect(stage(s)).toMatchObject({ correctedCents: 60_000, residualCents: 40_000, proposedCents: 0 });
    expect(resultNet(s)).toMatchObject({ proposedSignedCents: 0, uncorrectedSignedCents: 40_000, netAfterKnownTaxCents: 30_000 });
  });

  it("corrigé sans détail de correction : réputé corrigé en totalité", () => {
    const f = corrected("c");
    const s = build([f], { reviewEvents: [event(f)] });
    expect(stage(s)).toMatchObject({ correctedCents: 100_000, residualCents: 0 });
  });
});

describe("invariance, double comptage, cohérence des vues", () => {
  const findings = [
    makeFinding("f-1", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 10_000, taxRatePct: 25, taxQualification: "deductible" }), lignesSource: [1] }),
    // Répétition exacte de f-1 par une autre règle, avec la MÊME décision de revue (sinon : conflit explicite).
    makeFinding("f-2", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 10_000, taxRatePct: 25, taxQualification: "deductible" }), lignesSource: [1], ruleId: "R-DUP" }),
    makeFinding("f-3", { financialEffect: makeEffect({ amountCents: 5_000, rootCause: "x" }), lignesSource: [2, 3] }),
    makeFinding("f-4", { financialEffect: makeEffect({ amountCents: 7_000, rootCause: "y" }), lignesSource: [3, 4] }),
    makeFinding("f-5", { mesure: { constate: 100_000, seuil: 50_000, unite: "EUR", libelle: "signal" } }),
  ];

  it("l'ordre d'entrée ne change ni le hash ni les agrégats", () => {
    const a = build(findings);
    const b = build([...findings].reverse());
    const c = build([findings[2], findings[4], findings[0], findings[3], findings[1]]);
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.snapshotHash).toBe(c.snapshotHash);
    expect(a.exposure).toEqual(b.exposure);
  });

  it("aucun double comptage : répétition exacte comptée une fois, bornes = déterminé + groupes indéterminés", () => {
    const s = build(findings);
    expect(s.exposure.grossDetectedExposureCents).toBe(32_000);
    expect(s.exposure.exactRepeatsCents).toBe(10_000);
    expect(s.exposure.determinedExposureCents).toBe(10_000);
    expect(s.exposure.exposureBoundsCents).toEqual({ minCents: 17_000, maxCents: 22_000 });
  });

  it("mêmes résultats dans les vues et l'export : waterfall, élément de décision et note lisent le snapshot", () => {
    const snapshot = makeDossierSnapshot({ findings });
    const synthesis = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
    const societe = { raisonSociale: "TEST SA", siren: "000000000", exercice: "2024", dateCloture: "20241231" };
    const datasets = buildSynthesisDatasets({ synthesis, societe, findings: snapshot.findings, admissibilityFindings: snapshot.admissibilityFindings, dossier: snapshot });
    const byId = Object.fromEntries(datasets.waterfall.steps.map((st) => [st.id, st.amountCents]));
    expect(byId.determined).toBe(synthesis.exposure.determinedExposureCents);
    expect(byId.repeats).toBe(-synthesis.exposure.exactRepeatsCents);
    expect(byId.undetermined).toBe(-(synthesis.exposure.exposureBoundsCents.maxCents - synthesis.exposure.determinedExposureCents));
    expect(byId.net).toBe(resultNet(synthesis)!.netAfterKnownTaxCents);
    const decision = datasets.decision.items.find((i) => i.id === "exposition-validee")!;
    expect(decision.value).toContain("100,00");
    const note = generateSynthesisNote(synthesis, societe);
    expect(note).toContain("Exposition déterminée");
    expect(note).toContain("groupe(s) d'effets non déterminés");
    expect(note).toMatch(/net après impôt 75,00/);
  });
});
