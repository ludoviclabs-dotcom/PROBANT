/**
 * Tests golden du moteur d'IS (TAX-05).
 *
 * Chaque scenario impose le montant exact en centimes attendu a chaque etape :
 * un arrondi different, une compensation silencieuse ou un taux code en dur
 * font echouer le test.
 */
import { describe, expect, it } from "vitest";
import { TaxRateScheduleSchema, type TaxRateSchedule } from "@/lib/knowledge/tax-rate-schedule";
import {
  CorporateTaxComputationEngine,
  CorporateTaxFindingFactory,
  CorporateTaxSnapshotSchema,
  computeCorporateTax,
} from "@/lib/tax";
import {
  coherentLiasse,
  computationInput,
  declaration2065,
  eligibleProfile,
  euros,
  liasse2033B,
  liasse2058A,
  liasse2058B,
  period,
  profile,
} from "./fixtures";

function stepOf(
  snapshot: { readonly waterfall: { readonly steps: readonly { readonly code: string; readonly runningTotalCents: number; readonly deltaCents: number; readonly status: string }[] } },
  code: string,
) {
  const step = snapshot.waterfall.steps.find((item) => item.code === code);
  if (!step) throw new Error(`etape absente : ${code}`);
  return step;
}

describe("CorporateTaxComputationEngine — scenarios golden", () => {
  it("benefice sans retraitement : la base est le resultat comptable et l'IS suit le taux normal", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.status).toBe("computed");
    expect(snapshot.accountingResultCents).toBe(10_000_000);
    expect(snapshot.reintegrationsConfirmedCents).toBe(0);
    expect(snapshot.deductionsConfirmedCents).toBe(0);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(10_000_000);
    expect(snapshot.taxableBaseCents).toBe(10_000_000);
    // 100 000,00 EUR x 25 % = 25 000,00 EUR
    expect(snapshot.grossTaxCents).toBe(2_500_000);
    expect(snapshot.outcome).toBe("passed");
    expect(snapshot.taxImpactStatus).toBe("computed");
    expect(reconciliationLines.every((line) => line.status === "matched")).toBe(true);
    expect(() => CorporateTaxSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it("perte : la base imposable est nulle et l'impot brut est nul", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingLossCents: euros(50_000) })],
    }));

    expect(snapshot.accountingResultCents).toBe(-5_000_000);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(-5_000_000);
    expect(snapshot.taxableBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.deficits.status).toBe("not_applicable");
    expect(snapshot.outcome).toBe("passed");
  });

  it("taux reduit eligible : la totalite de la base sous plafond est taxee a 15 %", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(30_000) })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    const normal = snapshot.brackets.find((bracket) => bracket.code === "normal");
    expect(reduced?.eligibility.status).toBe("eligible");
    expect(reduced?.allocatedBaseCents).toBe(3_000_000);
    expect(normal?.allocatedBaseCents).toBe(0);
    // 30 000,00 EUR x 15 % = 4 500,00 EUR
    expect(snapshot.grossTaxCents).toBe(450_000);
    expect(snapshot.taxImpactStatus).toBe("computed");
  });

  it("eligibilite inconnue : le taux reduit n'est pas applique et l'impot reste une estimation", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      // Capital libere non renseigne : une seule condition inconnue suffit.
      profile: eligibleProfile({ capitalPaidStatus: "unknown" }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(60_000) })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    expect(reduced?.eligibility.status).toBe("unknown");
    expect(reduced?.allocatedBaseCents).toBe(0);
    expect(snapshot.outcome).toBe("missing_information");
    expect(snapshot.taxImpactStatus).toBe("estimated");
    expect(snapshot.limitations.map((item) => item.code)).toContain("REDUCED_RATE_ELIGIBILITY_UNKNOWN");
    // L'estimation reste celle du taux normal : 60 000,00 x 25 % = 15 000,00 EUR
    expect(snapshot.grossTaxCents).toBe(1_500_000);
  });

  it("passage partiel du taux reduit au taux normal : le plafond de tranche est respecte au centime", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(60_000) })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    const normal = snapshot.brackets.find((bracket) => bracket.code === "normal");
    expect(reduced?.allocatedBaseCents).toBe(4_250_000);
    expect(normal?.allocatedBaseCents).toBe(1_750_000);
    // 42 500,00 x 15 % = 6 375,00 ; 17 500,00 x 25 % = 4 375,00
    expect(reduced?.taxCents).toBe(637_500);
    expect(normal?.taxCents).toBe(437_500);
    expect(snapshot.grossTaxCents).toBe(1_075_000);
  });

  it("reintegration : le total declare augmente le resultat fiscal sans compensation", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({
        accountingProfitCents: euros(100_000),
        reintegrationsCents: euros(20_000),
      })],
    }));

    expect(snapshot.reintegrationsConfirmedCents).toBe(2_000_000);
    expect(snapshot.deductionsConfirmedCents).toBe(0);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(12_000_000);
    expect(snapshot.grossTaxCents).toBe(3_000_000);

    const line = snapshot.adjustmentLines.find((item) => item.id === "declared:WR");
    expect(line?.status).toBe("confirmed");
    expect(line?.sign).toBe("positive");
    expect(line?.signedAmountCents).toBe(2_000_000);
    expect(line?.sourceRefs.length).toBeGreaterThan(0);
    expect(line?.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("deduction : le total declare diminue le resultat fiscal et porte un signe negatif", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({
        accountingProfitCents: euros(100_000),
        deductionsCents: euros(30_000),
      })],
    }));

    expect(snapshot.deductionsConfirmedCents).toBe(3_000_000);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(7_000_000);
    expect(snapshot.grossTaxCents).toBe(1_750_000);

    const line = snapshot.adjustmentLines.find((item) => item.id === "declared:XH");
    expect(line?.sign).toBe("negative");
    expect(line?.signedAmountCents).toBe(-3_000_000);
  });

  it("deficit : l'imputation declaree est retenue dans la limite du stock et du plafond legal", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: euros(100_000), deficitOffsetCents: euros(40_000) }),
        liasse2058B({ K4: euros(40_000) }),
      ],
    }));

    expect(snapshot.deficits.status).toBe("applied");
    expect(snapshot.deficits.availableStockCents).toBe(4_000_000);
    expect(snapshot.deficits.declaredOffsetCents).toBe(4_000_000);
    // Benefice inferieur a la franchise : le plafond est borne par le stock.
    expect(snapshot.deficits.legalCapCents).toBe(4_000_000);
    expect(snapshot.deficits.appliedOffsetCents).toBe(4_000_000);
    expect(snapshot.deficits.remainingStockCents).toBe(0);
    expect(snapshot.taxableBaseCents).toBe(6_000_000);
    expect(snapshot.grossTaxCents).toBe(1_500_000);
    expect(snapshot.outcome).toBe("passed");
  });

  it("liasse incoherente : benefice et perte declares ensemble bloquent le calcul sans les compenser", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000),
        WS: euros(50_000),
        WR: 0,
        XH: 0,
        XI: euros(100_000),
        XL: 0,
        XN: euros(100_000),
      })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.outcome).toBe("reconciliation_difference");
    expect(snapshot.taxImpactStatus).toBe("not_computed");
    expect(snapshot.grossTaxCents).toBe(0);
    // Aucun resultat net de 50 000 n'est fabrique a la place du reviseur.
    expect(snapshot.accountingResultCents).toBe(0);
    expect(snapshot.limitations.map((item) => item.code)).toContain("INCONSISTENT_ACCOUNTING_RESULT");
    expect(reconciliationLines).toHaveLength(0);
  });

  it("FEC et liasse differents : les observations comptables restent des candidats et l'ecart est signale", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      ledgerObservations: [{
        id: "obs-1",
        accountCode: "6512",
        label: "Amende inscrite au compte 6512",
        amountCents: euros(5_000),
        direction: "reintegration",
        category: "explicit_non_deductible",
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
      }],
      accountedPositions: {
        chargeCents: euros(26_000),
        liabilityCents: null,
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
      },
    }));

    const candidate = snapshot.adjustmentLines.find((item) => item.id === "ledger:obs-1");
    expect(candidate?.status).toBe("candidate");
    expect(candidate?.origin.kind).toBe("ledger");
    // Le candidat ne modifie pas le resultat fiscal retenu.
    expect(snapshot.reintegrationsConfirmedCents).toBe(0);
    expect(snapshot.reintegrationsProposedCents).toBe(500_000);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(10_000_000);
    // Mais il est visible comme borne de revue.
    expect(snapshot.waterfall.confirmedTaxResultCents).toBe(10_000_000);
    expect(snapshot.waterfall.proposedTaxResultCents).toBe(10_500_000);

    const chargeLine = reconciliationLines.find((line) => line.lineKey === "accounted_tax_charge");
    expect(chargeLine?.status).toBe("different");
    expect(chargeLine?.differenceAmountCents).toBe(-100_000);
    expect(snapshot.outcome).toBe("reconciliation_difference");
  });

  it("formule sans donnee : aucune valeur n'est supposee et le calcul est bloque", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({ WR: 0, XH: 0 })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.outcome).toBe("missing_information");
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.taxImpactStatus).toBe("not_computed");
    expect(snapshot.limitations.map((item) => item.code)).toContain("ACCOUNTING_RESULT_UNAVAILABLE");
  });

  it("changement de millesime : un exercice sans bareme publie ne retombe pas sur le bareme voisin", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: profile({ accountingPeriod: { startDate: "2027-01-01", endDate: "2027-12-31" } }),
      period: period({
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        fiscalYear: 2027,
        formVintage: 2027,
      }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.rateScheduleId).toBeNull();
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.outcome).toBe("missing_information");
    const limitation = snapshot.limitations.find((item) => item.code === "UNSUPPORTED_RATE_SCHEDULE");
    expect(limitation?.reason).toBe("unsupported_millesime");
    expect(limitation?.capabilityStatus).toBe("non_available");
  });
});

describe("CorporateTaxComputationEngine — provenance des taux", () => {
  /** Bareme de test : prouve que le taux vient du registre injecte, pas du moteur. */
  const alternateSchedule: TaxRateSchedule = TaxRateScheduleSchema.parse({
    id: "is-rate-schedule-test",
    taxType: "corporate_income_tax",
    fiscalYear: 2026,
    formVintages: [2026],
    currency: "EUR",
    roundingRule: "half_up_cent",
    status: "effective",
    lastVerifiedAt: "2026-08-16",
    brackets: [{
      code: "normal",
      order: 1,
      label: "Taux de test",
      rateBasisPoints: 2_000,
      baseCapCents: null,
      ruleVersionId: "is-taux-normal-2026",
      sourceId: "cgi-art-219",
      sourceVersionId: "cgi-art-219-v2026-02-21",
      locator: "bareme de test",
      conditions: [],
    }],
    deficitCarryforward: {
      ruleVersionId: "is-deficits-report-2026",
      sourceId: "cgi-art-209",
      sourceVersionId: "cgi-art-209-v2023-12-31",
      locator: "article 209, I, troisieme alinea",
      baseAllowanceCents: 100_000_000,
      marginalRateBasisPoints: 5_000,
    },
  });

  it("applique le taux du bareme fourni et non une constante interne", () => {
    const engine = new CorporateTaxComputationEngine(() => alternateSchedule);
    const { snapshot } = engine.compute(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.rateScheduleId).toBe("is-rate-schedule-test");
    // 100 000,00 x 20 % = 20 000,00 EUR
    expect(snapshot.grossTaxCents).toBe(2_000_000);
  });

  it("arrondit au centime le plus proche, demi s'ecartant de zero", () => {
    const engine = new CorporateTaxComputationEngine(() => TaxRateScheduleSchema.parse({
      ...alternateSchedule,
      brackets: [{ ...alternateSchedule.brackets[0], rateBasisPoints: 1_500 }],
    }));
    const { snapshot } = engine.compute(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: 3_333_333 })],
    }));

    // 3 333 333 x 15 % = 499 999,95 centimes -> 500 000 centimes
    expect(snapshot.grossTaxCents).toBe(500_000);
  });
});

describe("CorporateTaxComputationEngine — prudence", () => {
  it("refuse de confirmer un retraitement issu d'un seul numero de compte", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      ledgerObservations: [{
        id: "obs-1",
        accountCode: "6712",
        label: "Penalite",
        amountCents: euros(1_000),
        direction: "reintegration",
        category: "explicit_non_deductible",
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
      }],
    }));

    expect(snapshot.adjustmentLines.every((line) =>
      line.origin.kind !== "ledger" || line.status === "candidate")).toBe(true);
  });

  it("integre un retraitement confirme par revue humaine avec sa source et sa preuve", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      confirmedAdjustments: [{
        id: "adj-1",
        category: "donations_patronage",
        direction: "reintegration",
        label: "Mecenat excedant le plafond",
        amountCents: euros(2_000),
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
        sourceRefs: [{
          sourceId: "cgi-art-39",
          sourceVersionId: "cgi-art-39-v2024-02-23",
          locator: "article 39, 1",
        }],
        evidenceRefs: ["piece-justificative-12"],
        reviewEventId: "review-event-1",
      }],
    }));

    expect(snapshot.reintegrationsConfirmedCents).toBe(200_000);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(10_200_000);
    expect(snapshot.grossTaxCents).toBe(2_550_000);
  });

  it("rejette un retraitement confirme sans preuve", () => {
    expect(() => computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      confirmedAdjustments: [{
        id: "adj-1",
        category: "provisions",
        direction: "reintegration",
        label: "Provision non deductible",
        amountCents: euros(1_000),
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
        sourceRefs: [],
        evidenceRefs: [],
        reviewEventId: "review-event-1",
      }],
    }))).toThrow(/TAX_CONFIRMED_ADJUSTMENT_REQUIRES_SOURCE_AND_EVIDENCE/u);
  });

  it("signale une imputation de deficits superieure au plafond sans la corriger", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: euros(100_000), deficitOffsetCents: euros(60_000) }),
        liasse2058B({ K4: euros(40_000) }),
      ],
    }));

    expect(snapshot.deficits.legalCapCents).toBe(4_000_000);
    // La valeur declaree est conservee : le moteur ne substitue pas son plafond.
    expect(snapshot.deficits.appliedOffsetCents).toBe(6_000_000);
    expect(snapshot.limitations.map((item) => item.code)).toContain("DEFICIT_OFFSET_ABOVE_LEGAL_CAP");
  });

  it("bloque un dossier appartenant a un groupe fiscalement integre", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: profile({ corporateIncomeTaxGroupStatus: "member" }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.limitations.map((item) => item.code)).toContain("TAX_GROUP_OUT_OF_SCOPE");
  });

  it("ne qualifie jamais un montant calcule de preuve directe", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    // Les cases lues sont `direct` et une comparaison concorde : le resultat
    // calcule est corrobore, jamais directement observe.
    expect(snapshot.evidenceStrength).toBe("corroborated");
  });

  it("retombe sur une preuve derivee lorsque aucune comparaison ne concorde", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      // Sans XI/XN declares, aucune comparaison ne peut concorder.
      documentSnapshots: [liasse2058A({ WA: euros(100_000), WR: 0, XH: 0, XL: 0 })],
    }));

    expect(snapshot.evidenceStrength).toBe("derived");
    expect(snapshot.outcome).toBe("inconclusive");
  });

  it("est deterministe : deux executions identiques produisent la meme empreinte", () => {
    const build = () => computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    })).snapshot;

    expect(build().snapshotHash).toBe(build().snapshotHash);
  });
});

describe("CorporateTaxComputationEngine — regime simplifie", () => {
  it("agrege les cases detaillees du 2033-B par nature de retraitement", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: profile({ corporateIncomeTaxRegime: "simplified" }),
      documentSnapshots: [liasse2033B({
        312: euros(100_000),
        314: 0,
        316: euros(3_000),
        318: euros(2_000),
        322: euros(1_000),
        324: euros(4_000),
        352: euros(110_000),
        354: 0,
        360: 0,
        370: euros(110_000),
        372: 0,
      })],
    }));

    expect(snapshot.regime).toBe("simplified");
    expect(snapshot.reintegrationsConfirmedCents).toBe(1_000_000);
    expect(snapshot.taxResultBeforeDeficitsCents).toBe(11_000_000);
    expect(snapshot.adjustmentLines.map((line) => line.category).sort()).toEqual([
      "accounted_tax",
      "depreciation",
      "explicit_non_deductible",
      "provisions",
    ]);
    // Le millesime publie n'expose aucune case de deduction : le moteur le dit.
    expect(snapshot.limitations.map((item) => item.code)).toContain("DEDUCTIONS_NOT_READABLE_FROM_VINTAGE");
  });
});

describe("CorporateTaxFindingFactory", () => {
  it("produit un constat cite et rattache a un controle du catalogue", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));
    const findings = new CorporateTaxFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-1",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].controlId).toBe("IS.COMPUTATION.RESULT_AND_TAX.2058A");
    expect(findings[0].outcome).toBe("passed");
    expect(findings[0].sourceVersionIds.length).toBeGreaterThan(0);
    expect(findings[0].domain).toBe("tax");
  });

  it("ne produit jamais de non-conformite confirmee", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000), deficitOffsetCents: euros(60_000) }), liasse2058B({ K4: euros(40_000) })],
    }));
    const findings = new CorporateTaxFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-1",
    });

    expect(findings.every((finding) => finding.outcome !== "confirmed_non_compliance")).toBe(true);
    expect(findings.map((finding) => finding.outcome)).toContain("potential_tax_risk");
  });
});

describe("Jeu de donnees du waterfall", () => {
  it("expose la chaine complete dans l'ordre specifie", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [
        coherentLiasse({
          accountingProfitCents: euros(200_000),
          reintegrationsCents: euros(20_000),
          deductionsCents: euros(10_000),
          deficitOffsetCents: euros(50_000),
        }),
        liasse2058B({ K4: euros(50_000) }),
        declaration2065({
          "C.RESULTAT_TAUX_NORMAL": euros(117_500),
          "C.RESULTAT_TAUX_REDUIT": euros(42_500),
        }),
      ],
    }));

    expect(snapshot.waterfall.steps.map((step) => step.code)).toEqual([
      "accounting_result",
      "reintegrations_confirmed",
      "reintegrations_proposed",
      "deductions_confirmed",
      "deductions_proposed",
      "tax_result_before_deficits",
      "deficits_offset",
      "taxable_base",
      "gross_tax",
    ]);

    expect(stepOf(snapshot, "accounting_result").runningTotalCents).toBe(20_000_000);
    expect(stepOf(snapshot, "reintegrations_confirmed").runningTotalCents).toBe(22_000_000);
    expect(stepOf(snapshot, "deductions_confirmed").runningTotalCents).toBe(21_000_000);
    expect(stepOf(snapshot, "tax_result_before_deficits").runningTotalCents).toBe(21_000_000);
    expect(stepOf(snapshot, "deficits_offset").deltaCents).toBe(5_000_000);
    expect(stepOf(snapshot, "taxable_base").runningTotalCents).toBe(16_000_000);

    // 42 500,00 x 15 % + 117 500,00 x 25 % = 6 375,00 + 29 375,00 = 35 750,00 EUR
    expect(snapshot.grossTaxCents).toBe(3_575_000);
    expect(stepOf(snapshot, "gross_tax").runningTotalCents).toBe(3_575_000);
    expect(snapshot.outcome).toBe("passed");
  });

  it("laisse le cumul inchange sur une etape proposee", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      ledgerObservations: [{
        id: "obs-1",
        accountCode: "6812",
        label: "Dotation a examiner",
        amountCents: euros(7_000),
        direction: "reintegration",
        category: "depreciation",
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
      }],
    }));

    const proposed = stepOf(snapshot, "reintegrations_proposed");
    expect(proposed.status).toBe("proposed");
    expect(proposed.deltaCents).toBe(700_000);
    expect(proposed.runningTotalCents).toBe(stepOf(snapshot, "reintegrations_confirmed").runningTotalCents);
  });
});
