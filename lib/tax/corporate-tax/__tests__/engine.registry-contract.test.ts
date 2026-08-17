/**
 * Contrat entre le barème publié et le moteur.
 *
 * Le barème est une donnée : le moteur doit l'honorer littéralement, et échouer
 * de façon lisible lorsqu'il ne sait pas l'honorer. Aucune condition ne doit être
 * évaluée sur un autre fait que celui qu'elle désigne.
 */
import { describe, expect, it } from "vitest";
import { TaxRateScheduleSchema, type TaxRateSchedule } from "@/lib/knowledge/tax-rate-schedule";
import { CorporateTaxComputationEngine } from "@/lib/tax";
import { coherentLiasse, computationInput, eligibleProfile, euros } from "./fixtures";

const DEFICIT_RULE = {
  ruleVersionId: "is-deficits-report-2026",
  sourceId: "cgi-art-209",
  sourceVersionId: "cgi-art-209-v2023-12-31",
  locator: "article 209, I, troisieme alinea",
  baseAllowanceCents: 100_000_000,
  marginalRateBasisPoints: 5_000,
};

function scheduleWith(brackets: unknown[]): TaxRateSchedule {
  return TaxRateScheduleSchema.parse({
    id: "is-rate-schedule-contract-test",
    taxType: "corporate_income_tax",
    fiscalYear: 2026,
    formVintages: [2026],
    currency: "EUR",
    roundingRule: "half_up_cent",
    status: "effective",
    lastVerifiedAt: "2026-08-16",
    brackets,
    deficitCarryforward: DEFICIT_RULE,
  });
}

const NORMAL_BRACKET = {
  code: "normal",
  order: 2,
  label: "Taux normal",
  rateBasisPoints: 2_500,
  baseCapCents: null,
  ruleVersionId: "is-taux-normal-2026",
  sourceId: "cgi-art-219",
  sourceVersionId: "cgi-art-219-v2026-02-21",
  locator: "article 219, I, deuxieme alinea",
  conditions: [],
};

describe("Une condition est évaluée sur le fait qu'elle désigne", () => {
  it("n'accorde pas un taux réduit en lisant un autre fait du profil", () => {
    // La condition désigne un fait que le moteur ne sait pas évaluer.
    // Elle doit rester `unknown`, jamais être satisfaite par substitution.
    const schedule = scheduleWith([
      {
        code: "reduced_sme",
        order: 1,
        label: "Taux reduit conditionne a un fait non modelise",
        rateBasisPoints: 1_500,
        baseCapCents: 4_250_000,
        ruleVersionId: "is-taux-reduit-pme-2026",
        sourceId: "cgi-art-219",
        sourceVersionId: "cgi-art-219-v2026-02-21",
        locator: "article 219, I-b",
        conditions: [{
          code: "fait_non_modelise",
          label: "Condition portant sur un fait que le moteur ne connait pas",
          profileInput: "profile:factNotModelledByTheEngine",
          operator: "gte_basis_points",
          thresholdBasisPoints: 7_500,
        }],
      },
      NORMAL_BRACKET,
    ]);

    const engine = new CorporateTaxComputationEngine(() => schedule);
    const { snapshot } = engine.compute(computationInput({
      // Profil dont la détention est connue à 100 % : si le moteur lisait la
      // détention au lieu du fait désigné, il conclurait à tort « satisfait ».
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    expect(reduced?.eligibility.status).toBe("unknown");
    expect(reduced?.allocatedBaseCents).toBe(0);
    expect(snapshot.outcome).toBe("missing_information");
  });

  it("évalue chaque condition sur son propre fait lorsque plusieurs coexistent", () => {
    const schedule = scheduleWith([
      {
        code: "reduced_sme",
        order: 1,
        label: "Taux reduit",
        rateBasisPoints: 1_500,
        baseCapCents: 4_250_000,
        ruleVersionId: "is-taux-reduit-pme-2026",
        sourceId: "cgi-art-219",
        sourceVersionId: "cgi-art-219-v2026-02-21",
        locator: "article 219, I-b",
        conditions: [{
          code: "capital_fully_paid",
          label: "Capital entierement libere",
          profileInput: "profile:capitalPaidStatus",
          operator: "equals_enum",
          expectedValue: "fully_paid",
        }],
      },
      NORMAL_BRACKET,
    ]);

    const engine = new CorporateTaxComputationEngine(() => schedule);
    const { snapshot } = engine.compute(computationInput({
      profile: eligibleProfile({ capitalPaidStatus: "partially_paid" }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    expect(reduced?.eligibility.status).toBe("not_eligible");
    expect(reduced?.eligibility.conditions[0]?.observedValue).toBe("partially_paid");
  });
});

describe("Un barème que le moteur ne sait pas appliquer", () => {
  it("produit une limitation lisible plutôt qu'une exception, quand la base ne peut être ventilée", () => {
    // Tranche terminale elle-même conditionnée, avec une condition inconnue :
    // aucune tranche ne peut absorber la base.
    const schedule = scheduleWith([{
      ...NORMAL_BRACKET,
      order: 1,
      conditions: [{
        code: "capital_fully_paid",
        label: "Capital entierement libere",
        profileInput: "profile:capitalPaidStatus",
        operator: "equals_enum",
        expectedValue: "fully_paid",
      }],
    }]);

    const engine = new CorporateTaxComputationEngine(() => schedule);
    const { snapshot } = engine.compute(computationInput({
      profile: eligibleProfile({ capitalPaidStatus: "unknown" }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.grossTaxCents).toBeNull();
    expect(snapshot.taxImpactStatus).toBe("not_computed");
    expect(snapshot.limitations.map((item) => item.code)).toContain("TAXABLE_BASE_NOT_ALLOCATABLE");
  });
});
