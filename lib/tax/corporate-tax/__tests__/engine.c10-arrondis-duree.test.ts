/**
 * Mission C10 — arrondis legaux et duree de l'exercice (moteur IS 1.1.0).
 *
 * Attendus etablis a la main, independamment de l'implementation :
 * - CGI art. 219, I : « le benefice imposable est arrondi a l'euro le plus proche.
 *   La fraction d'euro egale a 0,50 est comptee pour 1 » (version du 21/02/2026) ;
 * - CGI art. 1724 : la liquidation est arrondie a l'euro le plus proche, 0,50 compte
 *   pour 1, « au niveau du decompte de chaque impot » (version du 31/03/2002) ;
 * - BOI-IS-LIQ-20-20 § 50 et 60 (21/06/2023) : plafond de 42 500 EUR ajuste prorata
 *   temporis pour un exercice plus court ; deux periodes d'imposition pour un exercice
 *   plus long sans bilan dans l'annee civile. Le moteur refuse ces deux cas.
 */
import { describe, expect, it } from "vitest";
import { computeCorporateTax } from "@/lib/tax";
import { roundCentsToNearestEuroHalfUp } from "../arithmetic";
import { CORPORATE_TAX_ENGINE_VERSION } from "../engine";
import { corporateTaxPeriodLength } from "../period";
import {
  coherentLiasse,
  computationInput,
  eligibleProfile,
  euros,
  liasse2058B,
  period,
  profile,
} from "./fixtures";

const tax = (input: Parameters<typeof computeCorporateTax>[0]) => computeCorporateTax(input);

describe("C10 — arrondi du benefice imposable a l'euro (CGI art. 219, I)", () => {
  it("base 50 000,49 EUR : arrondie a 50 000 EUR, PME eligible 8 250,00 EUR", () => {
    const { snapshot } = tax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: 5_000_049 })],
    }));
    expect(snapshot.engineVersion).toBe("tax-05-corporate-income-tax-1.1.0");
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(5_000_049);
    expect(snapshot.taxableProfitBeforeRoundingCents).toBe(5_000_049);
    expect(snapshot.taxableBaseCents).toBe(5_000_000);
    // 42 500 x 15 % = 6 375 ; 7 500 x 25 % = 1 875 ; total 8 250,00 EUR.
    expect(snapshot.grossTaxCents).toBe(825_000);
    expect(snapshot.liquidatedTaxCents).toBe(825_000);
    expect(snapshot.notes.find((note) => note.code === "TAXABLE_BASE_ROUNDED_TO_EURO")?.sourceRefs[0]?.sourceId).toBe("cgi-art-219");
  });

  it("base 50 000,50 EUR : la fraction de 0,50 compte pour un euro, base 50 001 EUR", () => {
    const { snapshot } = tax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: 5_000_050 })],
    }));
    expect(snapshot.taxableBaseCents).toBe(5_000_100);
    // 6 375 + 7 501 x 25 % = 6 375 + 1 875,25 = 8 250,25 EUR avant arrondi ; liquide 8 250 EUR.
    expect(snapshot.grossTaxCents).toBe(825_025);
    expect(snapshot.liquidatedTaxCents).toBe(825_000);
    const trace = snapshot.trace.find((step) => step.id === "step-taxable-base");
    expect(trace?.operation).toBe("round_taxable_profit_to_nearest_euro_half_counted_as_one");
  });

  it("societe non eligible au taux reduit : base 50 000 EUR, impot 12 500 EUR", () => {
    const { snapshot } = tax(computationInput({
      profile: profile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(50_000) })],
    }));
    expect(snapshot.brackets.find((bracket) => bracket.code === "reduced_sme")?.eligibility.status).toBe("not_eligible");
    expect(snapshot.grossTaxCents).toBe(1_250_000);
    expect(snapshot.liquidatedTaxCents).toBe(1_250_000);
  });

  it("le pont et les deficits restent au centime ; seule la base apres deficits est arrondie", () => {
    const { snapshot } = tax(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: 10_000_030, deficitOffsetCents: 4_000_010 }),
        liasse2058B({ K4: euros(50_000) }),
      ],
    }));
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(10_000_030);
    expect(snapshot.deficits.appliedOffsetCents).toBe(4_000_010);
    // 50 000,00 - 40 000,10 = 9 999,90 EUR de stock restant, au centime.
    expect(snapshot.deficits.remainingStockCents).toBe(999_990);
    // 100 000,30 - 40 000,10 = 60 000,20 EUR -> base 60 000 EUR -> 25 % = 15 000 EUR.
    expect(snapshot.taxableProfitBeforeRoundingCents).toBe(6_000_020);
    expect(snapshot.taxableBaseCents).toBe(6_000_000);
    expect(snapshot.liquidatedTaxCents).toBe(1_500_000);
  });

  it("benefice inferieur a 0,50 EUR : base nulle, impot nul", () => {
    const { snapshot } = tax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: 49 })],
    }));
    expect(snapshot.taxableProfitBeforeRoundingCents).toBe(49);
    expect(snapshot.taxableBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.liquidatedTaxCents).toBe(0);
  });

  it("arrondi a l'euro : ,49 vers le bas, ,50 vers le haut, aucun montant negatif", () => {
    expect(roundCentsToNearestEuroHalfUp(149, "t")).toBe(100);
    expect(roundCentsToNearestEuroHalfUp(150, "t")).toBe(200);
    expect(roundCentsToNearestEuroHalfUp(0, "t")).toBe(0);
    expect(() => roundCentsToNearestEuroHalfUp(-1, "t")).toThrow("TAX_EURO_ROUNDING_NEGATIVE");
  });
});

describe("C10 — liquidation arrondie une fois (CGI art. 1724)", () => {
  it("la charge comptabilisee est comparee a l'impot liquide, pas a la somme au centime des tranches", () => {
    const { snapshot, reconciliationLines } = tax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: 5_000_050 })],
      accountedPositions: { chargeCents: 825_000, liabilityCents: null, snapshotId: "fec-1", contentHash: "c".repeat(64) },
    }));
    expect(snapshot.grossTaxCents).toBe(825_025);
    const charge = reconciliationLines.find((line) => line.lineKey === "accounted_tax_charge");
    expect(charge?.leftOperand?.amountCents).toBe(825_000);
    expect(charge?.status).toBe("matched");
    expect(charge?.traceStepIds).toContain("step-liquidation");
  });
});

describe("C10 — exercice d'une duree differente de douze mois", () => {
  const run = (startDate: string, endDate: string) => tax(computationInput({
    profile: eligibleProfile({ accountingPeriod: { startDate, endDate } }),
    period: period({ startDate, endDate }),
    documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(50_000) })],
  })).snapshot;

  it("exercice de 18 mois : refus cible, jamais le plafond de 42 500 EUR sans ajustement", () => {
    const snapshot = run("2026-01-01", "2027-06-30");
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.brackets).toEqual([]);
    expect(snapshot.grossTaxCents).toBeNull();
    expect(snapshot.liquidatedTaxCents).toBeNull();
    const limitation = snapshot.limitations.find((item) => item.code === "NON_ANNUAL_PERIOD_NOT_SUPPORTED");
    expect(limitation).toMatchObject({ scope: "period", capabilityStatus: "future", resolvability: "future_engine", requiredInputs: ["period:duration"] });
    expect(limitation?.message).toContain("deux periodes d'imposition");
    const note = snapshot.notes.find((item) => item.code === "PERIOD_LENGTH_RULE");
    expect(note?.kind).toBe("method");
    expect(note?.sourceRefs.map((ref) => ref.sourceId)).toEqual(["bofip-is-liq-20-10", "bofip-is-liq-20-20", "cgi-art-219"]);
  });

  it("exercice court (01/01 au 15/09) : refus cible, le prorata n'est pas modelise", () => {
    const snapshot = run("2026-01-01", "2026-09-15");
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.grossTaxCents).toBeNull();
    expect(snapshot.limitations.find((item) => item.code === "NON_ANNUAL_PERIOD_NOT_SUPPORTED")?.message).toContain("prorata temporis");
  });

  it("exercice de douze mois decale (01/07 au 30/06) : calcule normalement", () => {
    const snapshot = run("2025-07-01", "2026-06-30");
    expect(snapshot.status).toBe("computed");
    expect(snapshot.limitations.some((item) => item.code === "NON_ANNUAL_PERIOD_NOT_SUPPORTED")).toBe(false);
    expect(snapshot.liquidatedTaxCents).toBe(825_000);
  });

  it("reconnait les douze mois au quantieme pres, y compris un 29 fevrier", () => {
    expect(corporateTaxPeriodLength("2026-01-01", "2026-12-31")).toBe("twelve_months");
    expect(corporateTaxPeriodLength("2026-03-01", "2027-02-28")).toBe("twelve_months");
    expect(corporateTaxPeriodLength("2026-01-31", "2027-01-30")).toBe("twelve_months");
    expect(corporateTaxPeriodLength("2024-02-29", "2025-02-28")).toBe("twelve_months");
    expect(corporateTaxPeriodLength("2026-01-01", "2026-12-30")).toBe("shorter_than_twelve_months");
    expect(corporateTaxPeriodLength("2026-01-01", "2027-01-01")).toBe("longer_than_twelve_months");
    expect(corporateTaxPeriodLength("2026-02-30", "2027-02-28")).toBe("invalid");
    expect(corporateTaxPeriodLength("2026-12-31", "2026-01-01")).toBe("invalid");
  });

  it("le moteur courant est la version 1.1.0", () => {
    expect(CORPORATE_TAX_ENGINE_VERSION).toBe("tax-05-corporate-income-tax-1.1.0");
  });
});
