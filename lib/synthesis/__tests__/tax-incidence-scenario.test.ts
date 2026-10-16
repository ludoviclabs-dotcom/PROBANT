/**
 * C05 / C10 — incidence fiscale d'un ajustement par scénario d'IS avant/après.
 *
 * Attendus calculés à la main (barème 2026 : 15 % jusqu'à 42 500 €, 25 % au-delà ; base arrondie à l'euro,
 * CGI art. 219, I ; impôt liquidé arrondi à l'euro, CGI art. 1724) :
 * - base 50 000 € → 6 375 + 7 500 × 25 % = 8 250 € ;
 * - +1 000 € → 51 000 € → 6 375 + 8 500 × 25 % = 8 500 € : incidence +250 €, net +750 € ;
 * - −1 000 € → 49 000 € → 6 375 + 6 500 × 25 % = 8 000 € : incidence −250 €, net −750 € ;
 * - base 42 000 € (6 300 €), +1 000 puis +1 000 : 43 000 → 6 500 (+200) ; 44 000 → 6 750 (+250) ; conjoint +450 ;
 * - +0,50 € : 50 000,50 → base 50 001 → 8 250,25 → liquidé 8 250 : incidence 0 ;
 *   +1,50 € : 50 001,50 → base 50 002 → 8 250,50 → liquidé 8 251 : incidence +1 €.
 */
import { describe, expect, it } from "vitest";
import type { Finding, FinancialEffect } from "@/lib/canonical-model/finding";
import { compareCorporateTaxScenarios, corporateTaxIncidenceProvider } from "@/lib/tax";
import { coherentLiasse, computationInput, eligibleProfile, euros, period as taxPeriod } from "@/lib/tax/corporate-tax/__tests__/fixtures";
import { buildSynthesisSnapshot } from "../engine";
import { AGGREGATION_POLICY } from "../exposure";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding } from "./fixtures";

const baseInput = (profitCents = euros(50_000), overrides: Partial<Parameters<typeof computationInput>[0]> = {}) =>
  computationInput({ profile: eligibleProfile(), documentSnapshots: [coherentLiasse({ accountingProfitCents: profitCents })], ...overrides });
const validated = (id: string, effect: Partial<FinancialEffect>, line: number): Finding =>
  makeFinding(id, { statutRevue: "valide", financialEffect: makeEffect(effect), lignesSource: [line] });
const build = (findings: Finding[], provider = corporateTaxIncidenceProvider(baseInput())) =>
  buildSynthesisSnapshot(makeDossierSnapshot({ findings }), { clock: CLOCK, taxIncidence: provider });
const resultNet = (s: ReturnType<typeof build>) => s.exposure.netByTarget.find((n) => n.target === "resultat")!;

describe("C05 / C10 — incidence par scénario d'IS avant/après", () => {
  it("+1 000 € qualifié déductible : impôt +250 €, net +750 €, fournisseur et empreinte tracés", () => {
    const s = build([validated("f", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: undefined }, 1)]);
    expect(s.exposure.tax).toMatchObject({ status: "known", knownCents: 25_000, knownFindingIds: ["f"] });
    expect(resultNet(s)).toMatchObject({ uncorrectedSignedCents: 100_000, taxStatus: "known", taxKnownCents: 25_000, netAfterKnownTaxCents: 75_000 });
    expect(s.exposure.taxIncidence).toMatchObject({ provider: "c10_is_engine", providerVersion: "tax-05-corporate-income-tax-1.1.0+is-scenario-1.0.0", computedFindingIds: ["f"], pendingFindingIds: [] });
    expect(s.exposure.taxIncidence.scenarioHash).toMatch(/^[a-f0-9]{64}$/);
    expect(s.exposure.policy).toMatchObject({ version: "2.2.0", taxIncidenceRule: "is_scenario_when_provided_else_qualified_explicit_rate" });
    expect(AGGREGATION_POLICY.version).toBe("2.2.0");
  });

  it("un taux saisi ne remplace jamais le scénario : 15 % saisi, incidence calculée à 25 % marginal (+250 €)", () => {
    const s = build([validated("f", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: 15 }, 1)]);
    expect(s.exposure.tax.knownCents).toBe(25_000);
  });

  it("−1 000 € : impôt −250 €, net −750 €", () => {
    const s = build([validated("f", { amountCents: 100_000, direction: "decrease", taxQualification: "deductible" }, 1)]);
    expect(resultNet(s)).toMatchObject({ uncorrectedSignedCents: -100_000, taxKnownCents: -25_000, netAfterKnownTaxCents: -75_000 });
  });

  it("franchissement du plafond : attribution séquentielle 200 € puis 250 €, somme égale à l'incidence conjointe 450 €", () => {
    const provider = corporateTaxIncidenceProvider(baseInput(euros(42_000)));
    const s = build([validated("b", { amountCents: 100_000 }, 2), validated("a", { amountCents: 100_000 }, 1)], provider);
    expect(s.exposure.tax.knownCents).toBe(45_000);
    const comparison = compareCorporateTaxScenarios(baseInput(euros(42_000)), [
      { findingId: "b", target: "resultat", signedCents: 100_000 }, { findingId: "a", target: "resultat", signedCents: 100_000 },
    ]);
    expect(comparison.base.liquidatedTaxCents).toBe(630_000);
    expect(comparison.steps.map((step) => [step.findingId, step.liquidatedTaxCents, step.answer])).toEqual([
      ["a", 650_000, { status: "computed", taxCents: 20_000 }],
      ["b", 675_000, { status: "computed", taxCents: 25_000 }],
    ]);
    expect(comparison.totalIncidenceCents).toBe(45_000);
  });

  it("arrondis légaux dans le scénario : +0,50 € ne change pas l'impôt liquidé, +1,50 € l'augmente d'un euro", () => {
    const half = compareCorporateTaxScenarios(baseInput(), [{ findingId: "x", target: "resultat", signedCents: 50 }]);
    expect(half.steps[0]).toMatchObject({ liquidatedTaxCents: 825_000, answer: { status: "computed", taxCents: 0 } });
    const oneAndHalf = compareCorporateTaxScenarios(baseInput(), [{ findingId: "y", target: "resultat", signedCents: 150 }]);
    expect(oneAndHalf.steps[0]).toMatchObject({ liquidatedTaxCents: 825_100, answer: { status: "computed", taxCents: 100 } });
  });

  it("ajustement non qualifié : le fournisseur n'est pas interrogé, net inconnu même avec un taux saisi", () => {
    const s = build([validated("f", { amountCents: 100_000, taxQualification: undefined, taxRatePct: 25 }, 1)]);
    expect(resultNet(s).netAfterKnownTaxCents).toBeNull();
    expect(s.exposure.tax.unknown[0].reason).toMatch(/sans qualification fiscale/);
    expect(s.exposure.taxIncidence).toMatchObject({ provider: "c10_is_engine", computedFindingIds: [], scenarioHash: null, pendingFindingIds: ["f"] });
  });

  it("différence temporaire et poste de bilan sans taux : hors couverture du scénario, incidence inconnue", () => {
    const s = build([
      validated("t", { amountCents: 100_000, taxQualification: "temporary_difference" }, 1),
      validated("p", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: undefined, target: "bilan_passif" }, 2),
    ]);
    const reasons = Object.fromEntries(s.exposure.tax.unknown.map((u) => [u.findingId, u.reason]));
    expect(reasons.t).toMatch(/hors couverture du scénario d'IS/);
    expect(reasons.p).toMatch(/poste de bilan/);
    expect(s.exposure.tax).toMatchObject({ status: "unknown", knownCents: 0 });
  });

  it("poste de bilan qualifié avec taux explicite : hors scénario, la règle 2.1.0 du taux qualifié s'applique", () => {
    const s = build([validated("p", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: 25, target: "bilan_passif" }, 2)]);
    expect(s.exposure.tax).toMatchObject({ status: "known", knownCents: 25_000 });
    expect(s.exposure.taxIncidence.computedFindingIds).toEqual([]);
  });

  it("scénario de base bloqué (exercice de 18 mois) : incidence inconnue, jamais un taux à la place", () => {
    const p = { startDate: "2026-01-01", endDate: "2027-06-30" };
    const provider = corporateTaxIncidenceProvider(baseInput(euros(50_000), { profile: eligibleProfile({ accountingPeriod: p }), period: taxPeriod(p) }));
    const s = build([validated("f", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: 25 }, 1)], provider);
    expect(resultNet(s).netAfterKnownTaxCents).toBeNull();
    expect(s.exposure.tax.unknown[0].reason).toMatch(/NON_ANNUAL_PERIOD_NOT_SUPPORTED/);
    expect(s.exposure.taxIncidence.scenarioHash).toBeNull();
  });

  it("éligibilité au taux réduit inconnue : scénario seulement estimé, incidence non chiffrée", () => {
    const provider = corporateTaxIncidenceProvider(baseInput(euros(50_000), { profile: eligibleProfile({ ownershipStatus: "unknown", qualifyingIndividualOwnershipBasisPoints: null }) }));
    const s = build([validated("f", { amountCents: 100_000 }, 1)], provider);
    expect(s.exposure.tax.unknown[0].reason).toMatch(/seulement estimé/);
  });

  it("déterministe : ordre d'entrée sans effet sur l'incidence, l'empreinte du scénario et celle de la Synthèse", () => {
    const findings = [validated("a", { amountCents: 100_000 }, 1), validated("b", { amountCents: 40_000, direction: "decrease" }, 2)];
    const one = build(findings), two = build([...findings].reverse());
    expect(two.exposure.tax.knownCents).toBe(one.exposure.tax.knownCents);
    expect(two.exposure.taxIncidence.scenarioHash).toBe(one.exposure.taxIncidence.scenarioHash);
    expect(two.snapshotHash).toBe(one.snapshotHash);
  });

  it("sans fournisseur : comportement 2.1.0 conservé (taux explicite qualifié), interface vide tracée", () => {
    const s = buildSynthesisSnapshot(makeDossierSnapshot({ findings: [validated("f", { amountCents: 100_000, taxQualification: "deductible", taxRatePct: 25 }, 1)] }), { clock: CLOCK });
    expect(s.exposure.tax.knownCents).toBe(25_000);
    expect(s.exposure.taxIncidence).toEqual({ provider: "none", method: "before_after_is_scenario", providerVersion: null, computedFindingIds: [], scenarioHash: null, pendingFindingIds: [] });
  });
});

describe("C05 / C10 — restitution de la méthode", () => {
  it("la note et l'étape d'impôt du waterfall nomment le scénario d'IS ; sans fournisseur, rien n'est ajouté", async () => {
    const { generateSynthesisNote } = await import("../note");
    const { buildSynthesisDatasets } = await import("@/lib/visualization/build-datasets");
    const snapshot = makeDossierSnapshot({ findings: [validated("f", { amountCents: 100_000 }, 1)] });
    const societe = snapshot.dossier.societe;
    const withScenario = buildSynthesisSnapshot(snapshot, { clock: CLOCK, taxIncidence: corporateTaxIncidenceProvider(baseInput()) });
    expect(generateSynthesisNote(withScenario, societe)).toContain("Incidence fiscale chiffrée par scénario d'IS avant/après (tax-05-corporate-income-tax-1.1.0+is-scenario-1.0.0) pour 1 effet(s)");
    const tax = buildSynthesisDatasets({ synthesis: withScenario, societe, findings: snapshot.findings, admissibilityFindings: [] }).waterfall.steps.find((st) => st.id === "tax")!;
    expect(tax).toMatchObject({ amountCents: -25_000 });
    expect(tax.note).toContain("scénario d'IS avant/après pour f");
    const plain = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
    expect(generateSynthesisNote(plain, societe)).not.toContain("scénario d'IS");
  });
});
