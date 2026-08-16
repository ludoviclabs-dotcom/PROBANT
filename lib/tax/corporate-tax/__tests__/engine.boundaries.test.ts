/**
 * Tests de frontiere du moteur d'IS.
 *
 * Complementaires aux golden : ils visent les bords ou un moteur financier casse
 * silencieusement — seuil de tranche exact, seuil au centime pres, base nulle,
 * deficit egal ou superieur a la base, tres grands montants, ordre d'entree,
 * et absence des documents de comparaison.
 */
import { describe, expect, it } from "vitest";
import { findCorporateTaxRateSchedule } from "@/lib/knowledge/tax-rate-schedule";
import { applyBasisPoints, computeCorporateTax } from "@/lib/tax";
import {
  coherentLiasse,
  computationInput,
  eligibleProfile,
  euros,
  liasse2058A,
  liasse2058B,
  profile,
} from "./fixtures";

const schedule = findCorporateTaxRateSchedule({ fiscalYear: 2026, formVintage: 2026 });
if (!schedule) throw new Error("bareme 2026 introuvable : le registre est incoherent");

const reducedBracket = schedule.brackets.find((bracket) => bracket.code === "reduced_sme");
const normalBracket = schedule.brackets.find((bracket) => bracket.code === "normal");
if (!reducedBracket?.baseCapCents || !normalBracket) throw new Error("tranches attendues absentes");

const REDUCED_CAP = reducedBracket.baseCapCents;

function taxFor(input: Parameters<typeof computeCorporateTax>[0]) {
  return computeCorporateTax(input).snapshot;
}

describe("Provenance : l'attendu est derive du registre, pas reecrit dans le test", () => {
  it("l'impot au taux normal egale la base multipliee par le taux publie", () => {
    const base = euros(100_000);
    const snapshot = taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: base })],
    }));

    expect(snapshot.taxableBaseCents).toBe(base);
    expect(snapshot.grossTaxCents).toBe(applyBasisPoints(base, normalBracket.rateBasisPoints));
  });

  it("la ventilation eligible suit les plafonds et taux publies", () => {
    const base = REDUCED_CAP + euros(20_000);
    const snapshot = taxFor(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: base })],
    }));

    const expected =
      applyBasisPoints(REDUCED_CAP, reducedBracket.rateBasisPoints) +
      applyBasisPoints(base - REDUCED_CAP, normalBracket.rateBasisPoints);
    expect(snapshot.grossTaxCents).toBe(expected);
  });
});

describe("Seuils de tranche", () => {
  it("base exactement egale au plafond : rien ne deborde sur le taux normal", () => {
    const snapshot = taxFor(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: REDUCED_CAP })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    const normal = snapshot.brackets.find((bracket) => bracket.code === "normal");
    expect(reduced?.allocatedBaseCents).toBe(REDUCED_CAP);
    expect(normal?.allocatedBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(applyBasisPoints(REDUCED_CAP, reducedBracket.rateBasisPoints));
  });

  it("plafond moins un centime : tout reste au taux reduit", () => {
    const base = REDUCED_CAP - 1;
    const snapshot = taxFor(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: base })],
    }));

    expect(snapshot.brackets.find((bracket) => bracket.code === "reduced_sme")?.allocatedBaseCents).toBe(base);
    expect(snapshot.brackets.find((bracket) => bracket.code === "normal")?.allocatedBaseCents).toBe(0);
  });

  it("plafond plus un centime : exactement un centime bascule au taux normal", () => {
    const snapshot = taxFor(computationInput({
      profile: eligibleProfile(),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: REDUCED_CAP + 1 })],
    }));

    const reduced = snapshot.brackets.find((bracket) => bracket.code === "reduced_sme");
    const normal = snapshot.brackets.find((bracket) => bracket.code === "normal");
    expect(reduced?.allocatedBaseCents).toBe(REDUCED_CAP);
    expect(normal?.allocatedBaseCents).toBe(1);
    // Un centime au taux normal arrondit a zero : l'impot n'augmente pas.
    expect(normal?.taxCents).toBe(applyBasisPoints(1, normalBracket.rateBasisPoints));
    expect(snapshot.grossTaxCents).toBe(applyBasisPoints(REDUCED_CAP, reducedBracket.rateBasisPoints));
  });
});

describe("Bases nulles et deficits", () => {
  it("resultat fiscal exactement nul : base et impot nuls, ventilation coherente", () => {
    const snapshot = taxFor(computationInput({
      documentSnapshots: [coherentLiasse({
        accountingProfitCents: euros(50_000),
        deductionsCents: euros(50_000),
      })],
    }));

    expect(snapshot.taxResultBeforeDeficitsCents).toBe(0);
    expect(snapshot.taxableBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.brackets.every((bracket) => bracket.allocatedBaseCents === 0)).toBe(true);
  });

  it("deficit imputable exactement egal a la base : base ramenee a zero sans passer sous zero", () => {
    const amount = euros(100_000);
    const snapshot = taxFor(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: amount, deficitOffsetCents: amount }),
        liasse2058B({ K4: amount }),
      ],
    }));

    expect(snapshot.deficits.appliedOffsetCents).toBe(amount);
    expect(snapshot.deficits.remainingStockCents).toBe(0);
    expect(snapshot.taxableBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(0);
  });

  it("stock de deficits superieur au benefice : l'imputation reste bornee par le plafond legal", () => {
    const benefit = euros(100_000);
    const snapshot = taxFor(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: benefit, deficitOffsetCents: benefit }),
        liasse2058B({ K4: euros(900_000) }),
      ],
    }));

    // Benefice sous la franchise : le plafond ne peut pas depasser le benefice.
    expect(snapshot.deficits.legalCapCents).toBe(benefit);
    expect(snapshot.deficits.appliedOffsetCents).toBe(benefit);
    expect(snapshot.deficits.remainingStockCents).toBe(euros(800_000));
    expect(snapshot.taxableBaseCents).toBe(0);
    expect(snapshot.grossTaxCents).toBe(0);
  });

  it("benefice au-dessus de la franchise : le plafond ajoute la quote-part marginale", () => {
    const rule = schedule.deficitCarryforward;
    // Franchise + 2 000 000,00 EUR de fraction excedentaire.
    const excess = euros(2_000_000);
    const benefit = rule.baseAllowanceCents + excess;
    const snapshot = taxFor(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: benefit, deficitOffsetCents: 0 }),
        liasse2058B({ K4: benefit }),
      ],
    }));

    const expectedCap = rule.baseAllowanceCents + applyBasisPoints(excess, rule.marginalRateBasisPoints);
    expect(snapshot.deficits.legalCapCents).toBe(expectedCap);
  });
});

describe("Très grands montants", () => {
  /**
   * 50 milliards d'euros : le produit `base x taux` depasse la plage des entiers
   * surs de JavaScript. Le resultat doit rester exact au centime.
   */
  it("calcule au centime exact quand le produit intermediaire sort de la plage sure", () => {
    const base = 5_000_000_000_000; // 50 000 000 000,00 EUR
    expect(base * normalBracket.rateBasisPoints > Number.MAX_SAFE_INTEGER).toBe(true);

    const snapshot = taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: base })],
    }));

    expect(snapshot.taxableBaseCents).toBe(base);
    expect(snapshot.grossTaxCents).toBe(1_250_000_000_000);
    expect(Number.isSafeInteger(snapshot.grossTaxCents)).toBe(true);
  });

  it("rejette des le champ une valeur au-dela de la plage sure", () => {
    // Premiere ligne de defense : le schema du champ declaratif.
    expect(() => coherentLiasse({ accountingProfitCents: Number.MAX_SAFE_INTEGER + 2 }))
      .toThrow(/too_big|Number must be less than or equal/u);
  });

  it("refuse une somme hors plage sure plutot que de la tronquer", () => {
    // Seconde ligne de defense : chaque case est valide isolement, mais leur
    // somme sort de la plage sure. Le moteur doit echouer, jamais arrondir.
    const huge = 9_000_000_000_000_000; // < Number.MAX_SAFE_INTEGER
    expect(Number.isSafeInteger(huge)).toBe(true);
    expect(huge * 2 > Number.MAX_SAFE_INTEGER).toBe(true);

    expect(() => taxFor(computationInput({
      documentSnapshots: [liasse2058A({ WA: huge, WS: 0, WR: huge, XH: 0, XL: 0 })],
    }))).toThrow(/TAX_AMOUNT_OUT_OF_SAFE_RANGE/u);
  });
});

describe("Ordre d'entrée", () => {
  it("permuter les documents sans signification metier ne change pas l'empreinte", () => {
    const liasse = coherentLiasse({ accountingProfitCents: euros(100_000), deficitOffsetCents: euros(20_000) });
    const followUp = liasse2058B({ K4: euros(40_000) });

    const forward = taxFor(computationInput({ documentSnapshots: [liasse, followUp] }));
    const reversed = taxFor(computationInput({ documentSnapshots: [followUp, liasse] }));

    expect(reversed.snapshotHash).toBe(forward.snapshotHash);
  });

  it("permuter les observations comptables ne change pas l'empreinte", () => {
    const observation = (id: string, accountCode: string, amountCents: number) => ({
      id,
      accountCode,
      label: `Observation ${id}`,
      amountCents,
      direction: "reintegration" as const,
      category: "explicit_non_deductible" as const,
      snapshotId: "fec-snapshot-1",
      contentHash: "c".repeat(64),
    });
    const a = observation("obs-a", "6512", euros(1_000));
    const b = observation("obs-b", "6712", euros(2_000));

    const forward = taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      ledgerObservations: [a, b],
    }));
    const reversed = taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      ledgerObservations: [b, a],
    }));

    expect(reversed.snapshotHash).toBe(forward.snapshotHash);
  });
});

describe("Preuve exigée pour toute confirmation", () => {
  it("refuse une deduction confirmee sans source normative", () => {
    expect(() => taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      confirmedAdjustments: [{
        id: "adj-1",
        category: "timing_difference",
        direction: "deduction",
        label: "Produit fiscalement decale",
        amountCents: euros(3_000),
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
        sourceRefs: [],
        evidenceRefs: ["piece-9"],
        reviewEventId: "review-event-1",
      }],
    }))).toThrow(/TAX_CONFIRMED_ADJUSTMENT_REQUIRES_SOURCE_AND_EVIDENCE/u);
  });

  it("refuse un montant de retraitement negatif plutot que d'inverser son sens", () => {
    expect(() => taxFor(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      confirmedAdjustments: [{
        id: "adj-1",
        category: "provisions",
        direction: "reintegration",
        label: "Montant negatif",
        amountCents: -euros(1_000),
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
        sourceRefs: [{
          sourceId: "cgi-art-39",
          sourceVersionId: "cgi-art-39-v2024-02-23",
          locator: "article 39, 1",
        }],
        evidenceRefs: ["piece-9"],
        reviewEventId: "review-event-1",
      }],
    }))).toThrow(/TAX_ADJUSTMENT_MAGNITUDE_MUST_BE_POSITIVE/u);
  });
});

describe("Documents de comparaison absents", () => {
  it("sans 2065, aucune comparaison de base declaree n'est fabriquee", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(reconciliationLines.some((line) => line.lineKey === "declared_normal_rate_base")).toBe(false);
    expect(reconciliationLines.some((line) => line.lineKey === "declared_reduced_rate_base")).toBe(false);
    // L'absence n'invente ni concordance ni ecart.
    expect(snapshot.outcome).toBe("passed");
  });

  it("sans charge ni dette comptabilisee, aucune comparaison comptable n'est produite", () => {
    const { reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(reconciliationLines.some((line) => line.lineKey === "accounted_tax_charge")).toBe(false);
    expect(reconciliationLines.some((line) => line.lineKey === "accounted_tax_liability")).toBe(false);
  });

  it("une dette comptabilisee seule ne produit que sa propre comparaison", () => {
    const { reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
      accountedPositions: {
        chargeCents: null,
        liabilityCents: euros(25_000),
        snapshotId: "fec-snapshot-1",
        contentHash: "c".repeat(64),
      },
    }));

    expect(reconciliationLines.some((line) => line.lineKey === "accounted_tax_charge")).toBe(false);
    const liability = reconciliationLines.find((line) => line.lineKey === "accounted_tax_liability");
    expect(liability?.status).toBe("matched");
    // La dette est nette des acomptes : la normalisation doit le dire.
    expect(liability?.normalizationNotes.length).toBeGreaterThan(0);
  });
});

describe("Régime hors périmètre", () => {
  it("bloque un régime exonéré sans tenter un calcul dégradé", () => {
    const snapshot = taxFor(computationInput({
      profile: profile({ corporateIncomeTaxRegime: "exempt" }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.limitations.map((item) => item.code)).toContain("UNSUPPORTED_CIT_REGIME");
  });
});
