/**
 * Tests du moteur de réconciliation TVA (TAX-06).
 *
 * Les treize scénarios exigés par le lot, plus les gardes de prudence : le FEC
 * ne confirme rien, les taux sont constatés et non présumés, et une période non
 * couverte par le registre n'est jamais traitée avec une version voisine.
 */
import { describe, expect, it } from "vitest";
import {
  VatControlEngine,
  VatFindingFactory,
  VatReconciliationSnapshotSchema,
  assessNormativeCoverage,
  deriveObservedRate,
  reconcileVat,
} from "@/lib/tax";
import {
  ca3,
  ca12,
  creditNoteEntry,
  euros,
  purchaseEntry,
  reconciliationInput,
  reverseChargeEntry,
  saleEntry,
  vatPeriod,
  vatProfile,
} from "./fixtures";

function controlOf(
  snapshot: { readonly controls: readonly { readonly controlId: string }[] },
  controlId: string,
) {
  const control = snapshot.controls.find((item) => item.controlId === controlId);
  if (!control) throw new Error(`controle absent : ${controlId}`);
  return control as (typeof snapshot.controls)[number] & {
    readonly outcome: string;
    readonly evidenceTier: string;
    readonly transactionIds: readonly string[];
    readonly observedCents: number | null;
    readonly comparedCents: number | null;
    readonly differenceCents: number | null;
  };
}

/** Jeu nominal : une vente à 20 % constaté, un achat à 20 % constaté. */
function nominalLedger() {
  return [
    ...saleEntry({ ecritureNum: "V1", baseEuros: 1_000, vatEuros: 200 }),
    ...purchaseEntry({ ecritureNum: "A1", baseEuros: 500, vatEuros: 100 }),
  ];
}

const NOMINAL_INVOICES = ["FA-V1", "FF-A1"];

describe("CA3 mensuelle", () => {
  it("rapproche ecritures et declaration mensuelle sans ecart", () => {
    const { snapshot, reconciliationLines } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [ca3({
        "08": euros(1_000),
        "16": euros(200),
        "23": euros(100),
        "28": euros(100),
        "25": 0,
        "22": 0,
        "27": 0,
      })],
    }));

    expect(snapshot.status).toBe("reconciled");
    expect(snapshot.frequency).toBe("monthly");
    expect(snapshot.declaration.formNumber).toBe("3310-CA3-SD");
    expect(snapshot.collectedAccountedCents).toBe(20_000);
    expect(snapshot.deductibleAccountedCents).toBe(10_000);
    expect(snapshot.netAccountedCents).toBe(10_000);
    expect(reconciliationLines.every((line) => line.status === "matched")).toBe(true);
    // Pieces fournies : le niveau de preuve le plus haut du lot est atteint.
    expect(snapshot.evidenceTier).toBe("ledger_declaration_and_invoice");
    expect(snapshot.outcome).toBe("passed");
    expect(() => VatReconciliationSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it("execute les seize controles du MVP", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));
    expect(snapshot.controls).toHaveLength(16);
  });
});

describe("CA3 trimestrielle", () => {
  it("traite une periode trimestrielle couverte par le registre", () => {
    const period = vatPeriod({
      id: "vat-period-q2",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      frequency: "quarterly",
    });
    const { snapshot } = reconcileVat(reconciliationInput({
      period,
      fecEntries: [...saleEntry({ ecritureNum: "V1", baseEuros: 3_000, vatEuros: 600, ecritureDate: "20260515", pieceDate: "20260515" })],
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(3_000), "16": euros(600), "23": 0, "28": euros(600), "25": 0, "22": 0, "27": 0 }, "vat-period-q2")],
    }));

    expect(snapshot.frequency).toBe("quarterly");
    expect(snapshot.period.normativeCoverage.status).toBe("covered");
    expect(snapshot.collectedAccountedCents).toBe(60_000);
    expect(snapshot.outcome).toBe("passed");
  });
});

describe("CA12", () => {
  it("utilise le formulaire du reel simplifie et signale la couverture annuelle incomplete", () => {
    const period = vatPeriod({
      id: "vat-period-2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      frequency: "annual",
    });
    const { snapshot } = reconcileVat(reconciliationInput({
      profile: vatProfile({ vatRegime: "real_simplified" }),
      period,
      fecEntries: nominalLedger(),
      documentSnapshots: [ca12({
        "19": euros(200),
        "26": euros(100),
        "54": euros(100),
        "29": 0,
        "24": 0,
        "51": 0,
      }, "vat-period-2026")],
    }));

    expect(snapshot.regime).toBe("real_simplified");
    expect(snapshot.declaration.formNumber).toBe("3517-S-SD");
    expect(snapshot.declaration.grossVatCents).toBe(20_000);
    expect(snapshot.declaration.deductibleVatCents).toBe(10_000);
    // Le millesime CA12 publie n'expose aucune base HT.
    expect(snapshot.declaration.normalRateBaseCents).toBeNull();
    // L'exercice 2026 complet deborde la couverture des sources TVA.
    expect(snapshot.period.normativeCoverage.status).not.toBe("covered");
    expect(snapshot.limitations.some((item) => item.code.startsWith("VAT_SOURCE_NOT_COVERED"))).toBe(true);
  });
});

describe("Credit de TVA", () => {
  it("reconnait une position credeitrice et la rapproche du credit declare", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: [
        ...saleEntry({ ecritureNum: "V1", baseEuros: 500, vatEuros: 100 }),
        ...purchaseEntry({ ecritureNum: "A1", baseEuros: 2_000, vatEuros: 400 }),
      ],
      availableInvoiceRefs: ["FA-V1", "FF-A1"],
      documentSnapshots: [ca3({
        "08": euros(500),
        "16": euros(100),
        "23": euros(400),
        "28": 0,
        "25": euros(300),
        "22": 0,
        "27": euros(300),
      })],
    }));

    expect(snapshot.netAccountedCents).toBe(-30_000);
    const credit = controlOf(snapshot, "VAT.CREDIT");
    expect(credit.outcome).toBe("passed");
    expect(credit.observedCents).toBe(30_000);
    expect(credit.comparedCents).toBe(30_000);

    const waterfall = snapshot.datasets.netWaterfall.steps;
    expect(waterfall.find((step) => step.code === "vat_credit_to_carry")?.runningTotalCents).toBe(30_000);
    expect(waterfall.find((step) => step.code === "vat_net_due")?.runningTotalCents).toBe(0);
  });
});

describe("Taux multiples", () => {
  it("agrege par taux constate et signale le taux marginal sans le declarer errone", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: [
        ...saleEntry({ ecritureNum: "V1", baseEuros: 100_000, vatEuros: 20_000 }),
        ...saleEntry({ ecritureNum: "V2", baseEuros: 10_000, vatEuros: 1_000 }),
        ...saleEntry({ ecritureNum: "V3", baseEuros: 100, vatEuros: 3 }),
      ],
      availableInvoiceRefs: ["FA-V1", "FA-V2", "FA-V3"],
      documentSnapshots: [ca3({ "08": euros(110_100), "16": euros(21_003), "23": 0, "28": euros(21_003), "25": 0, "22": 0, "27": 0 })],
    }));

    const collected = snapshot.rateBuckets.filter((bucket) => bucket.direction === "collected");
    expect(collected.map((bucket) => bucket.rateBasisPoints).sort((a, b) => (a ?? 0) - (b ?? 0)))
      .toEqual([300, 1_000, 2_000]);
    expect(collected.find((bucket) => bucket.rateBasisPoints === 2_000)?.status).toBe("dominant");
    expect(collected.find((bucket) => bucket.rateBasisPoints === 300)?.status).toBe("outlier");

    const unusual = controlOf(snapshot, "VAT.RATE.UNUSUAL");
    // Un taux atypique appelle un examen, jamais une non-conformite.
    expect(unusual.outcome).toBe("review_recommendation");
    expect(snapshot.datasets.salesByRate.totalBaseCents).toBe(euros(110_100));
  });
});

describe("Exigibilite decalee", () => {
  it("signale une piece datee hors periode sans qualifier le fait generateur", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: [
        ...saleEntry({
          ecritureNum: "V1",
          baseEuros: 1_000,
          vatEuros: 200,
          ecritureDate: "20260305",
          // Facture de fevrier comptabilisee en mars.
          pieceDate: "20260225",
        }),
      ],
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": 0, "28": euros(200), "25": 0, "22": 0, "27": 0 })],
    }));

    const shift = controlOf(snapshot, "VAT.PERIOD.SHIFT");
    expect(shift.outcome).toBe("review_recommendation");
    expect(shift.transactionIds).toHaveLength(1);
    expect(snapshot.transactionCandidates[0].signals).toContain("period_shift_candidate");
  });
});

describe("Facture manquante", () => {
  it("sans inventaire de pieces, le droit a deduction reste inconclusive", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));

    const piece = controlOf(snapshot, "VAT.PIECE.MISSING");
    expect(piece.outcome).toBe("inconclusive");
    expect(snapshot.notes.map((note) => note.code)).toContain("NO_INVOICE_INVENTORY");
  });

  it("avec inventaire, une deduction sans piece devient un risque a examiner", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      // La facture fournisseur FF-A1 manque a l'inventaire.
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));

    const piece = controlOf(snapshot, "VAT.PIECE.MISSING");
    expect(piece.outcome).toBe("potential_tax_risk");
    // L'inventaire permet de constater la pièce manquante, mais la déduction
    // concernée n'atteint pas le niveau de preuve « + facture ».
    expect(piece.evidenceTier).toBe("ledger_and_declaration");
    expect(snapshot.datasets.missingPieces.cells.length).toBeGreaterThan(0);
  });
});

describe("Autoliquidation", () => {
  it("signale une ecriture portant TVA collectee et deductible de meme montant", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: [...reverseChargeEntry({ ecritureNum: "A9", baseEuros: 1_000, vatEuros: 200 })],
      availableInvoiceRefs: ["FF-A9"],
      documentSnapshots: [ca3({ "08": 0, "16": euros(200), "23": euros(200), "28": 0, "25": 0, "22": 0, "27": 0 })],
    }));

    const reverse = controlOf(snapshot, "VAT.REVERSE_CHARGE.CANDIDATE");
    expect(reverse.outcome).toBe("review_recommendation");
    expect(snapshot.collectedAccountedCents).toBe(20_000);
    expect(snapshot.deductibleAccountedCents).toBe(20_000);
    expect(snapshot.netAccountedCents).toBe(0);
    // La qualification de l'operation reste humaine.
    expect(snapshot.transactionCandidates.every((candidate) => candidate.evidenceStrength === "derived")).toBe(true);
  });
});

describe("Avoir", () => {
  it("conserve le sens negatif d'un avoir sans le compenser silencieusement", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: [
        ...saleEntry({ ecritureNum: "V1", baseEuros: 1_000, vatEuros: 200 }),
        ...creditNoteEntry({ ecritureNum: "V2", baseEuros: 300, vatEuros: 60 }),
      ],
      availableInvoiceRefs: ["FA-V1", "AV-V2"],
      documentSnapshots: [ca3({ "08": euros(700), "16": euros(140), "23": 0, "28": euros(140), "25": 0, "22": 0, "27": 0 })],
    }));

    const creditNote = snapshot.transactionCandidates.find((candidate) => candidate.ecritureNum === "V2");
    expect(creditNote?.baseAmountCents).toBe(-euros(300));
    expect(creditNote?.vatAmountCents).toBe(-euros(60));
    // Le taux constate d'un avoir reste positif : deux montants negatifs.
    expect(creditNote?.observedRateBasisPoints).toBe(2_000);
    expect(snapshot.collectedAccountedCents).toBe(euros(140));
    expect(snapshot.outcome).toBe("passed");
  });
});

describe("Arrondis", () => {
  it("derive un taux constate au point de base le plus proche", () => {
    // 6 667 / 33 333 = 20,0012 % -> 2 000 points de base
    expect(deriveObservedRate(33_333, 6_667)).toBe(2_000);
    expect(deriveObservedRate(10_000, 2_000)).toBe(2_000);
    // Base nulle : aucun taux n'est invente.
    expect(deriveObservedRate(0, 500)).toBeNull();
    // Sens opposes : le taux n'a pas de sens.
    expect(deriveObservedRate(1_000, -200)).toBeNull();
  });

  it("expose un ecart d'arrondi au centime entre TVA theorique et comptabilisee", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      // 333,33 HT et 66,66 de TVA : le taux constate arrondit a 20 %, mais
      // 333,33 x 20 % = 66,666 -> 66,67. L'ecart d'un centime est expose.
      fecEntries: [...saleEntry({ ecritureNum: "V1", baseEuros: 333.33, vatEuros: 66.66 })],
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": 33_333, "16": 6_666, "23": 0, "28": 6_666, "25": 0, "22": 0, "27": 0 })],
    }));

    const bucket = snapshot.rateBuckets.find((item) => item.direction === "collected");
    expect(bucket?.rateBasisPoints).toBe(2_000);
    expect(bucket?.baseAmountCents).toBe(33_333);
    expect(bucket?.vatAccountedCents).toBe(6_666);
    expect(bucket?.vatTheoreticalCents).toBe(6_667);
    expect(bucket?.differenceCents).toBe(-1);

    const theoretical = controlOf(snapshot, "VAT.THEORETICAL.BY_RATE");
    expect(theoretical.outcome).toBe("reconciliation_difference");
    expect(theoretical.differenceCents).toBe(1);
  });
});

describe("Declaration absente", () => {
  it("ne traite pas l'absence de declaration comme une declaration a zero", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      documentSnapshots: [],
    }));

    expect(snapshot.declaration.status).toBe("absent");
    expect(snapshot.declaration.grossVatCents).toBeNull();
    expect(snapshot.netDeclaredCents).toBeNull();
    expect(controlOf(snapshot, "VAT.DECLARED").outcome).toBe("missing_information");
    expect(controlOf(snapshot, "VAT.NET").outcome).toBe("inconclusive");
    expect(snapshot.outcome).toBe("missing_information");
    expect(snapshot.limitations.map((item) => item.code)).toContain("VAT_DECLARATION_UNAVAILABLE");
    expect(snapshot.evidenceTier).toBe("ledger_only");
  });
});

describe("Regime incoherent", () => {
  it("bloque un reel simplifie declare mensuellement", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      profile: vatProfile({ vatRegime: "real_simplified" }),
      period: vatPeriod({ frequency: "monthly" }),
      fecEntries: nominalLedger(),
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.controls).toHaveLength(0);
    expect(snapshot.limitations.map((item) => item.code)).toContain("REGIME_FREQUENCY_INCONSISTENT");
    expect(snapshot.outcome).toBe("missing_information");
  });

  it("bloque un regime hors perimetre", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      profile: vatProfile({ vatRegime: "franchise" }),
      fecEntries: nominalLedger(),
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.limitations.map((item) => item.code)).toContain("UNSUPPORTED_VAT_REGIME");
  });

  it("bloque un assujetti membre d'un groupe TVA", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      profile: vatProfile({ vatGroupStatus: "member" }),
      fecEntries: nominalLedger(),
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.limitations.map((item) => item.code)).toContain("VAT_GROUP_OUT_OF_SCOPE");
  });
});

describe("Changement reglementaire de periode", () => {
  it("declare la couverture rompue au 1er septembre 2026", () => {
    const coverage = assessNormativeCoverage({
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      requirements: ["taxPoint"],
    });
    expect(coverage.status).toBe("partially_covered");
    expect(coverage.coveredThroughDate).toBe("2026-08-31");
    expect(coverage.uncoveredFromDate).toBe("2026-09-01");
    expect(coverage.expiringSourceVersionIds).toContain("cgi-art-269-v2022-01-01");
  });

  it("bloque les controles dependant d'une source non couverte, sans version voisine", () => {
    const period = vatPeriod({
      id: "vat-period-sept",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    const { snapshot } = reconcileVat(reconciliationInput({
      period,
      fecEntries: [...saleEntry({ ecritureNum: "V1", baseEuros: 1_000, vatEuros: 200, ecritureDate: "20260915", pieceDate: "20260915" })],
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": 0, "28": euros(200), "25": 0, "22": 0, "27": 0 }, "vat-period-sept")],
    }));

    // Le fait generateur et l'obligation de facturation ne sont plus couverts.
    expect(controlOf(snapshot, "VAT.PERIOD.SHIFT").outcome).toBe("missing_information");
    expect(controlOf(snapshot, "VAT.ENTRY.NO_REFERENCE").outcome).toBe("missing_information");
    expect(snapshot.limitations.some((item) =>
      item.code === "VAT_SOURCE_NOT_COVERED:VAT.PERIOD.SHIFT" &&
      item.capabilityStatus === "non_available" &&
      item.reason === "unsupported_millesime")).toBe(true);
    expect(snapshot.outcome).toBe("missing_information");

    // Les controles purement declaratifs restent possibles.
    expect(controlOf(snapshot, "VAT.FORM.COHERENCE").outcome).toBe("passed");
  });
});

describe("Prudence", () => {
  it("ne confirme jamais un retraitement a partir du seul numero de compte", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));

    expect(snapshot.transactionCandidates.every((candidate) =>
      candidate.evidenceStrength === "derived" || candidate.evidenceStrength === "insufficient")).toBe(true);
    expect(snapshot.notes.map((note) => note.code)).toContain("OBSERVED_RATES_ONLY");
    expect(snapshot.notes.map((note) => note.code)).toContain("NO_TRANSMISSION");
  });

  it("est deterministe : les memes entrees produisent la meme empreinte", () => {
    // Les entrees sont construites une seule fois : deux lectures de FEC dont
    // les numeros de ligne different portent une provenance differente, et
    // doivent donc legitimement produire des empreintes differentes.
    const entries = nominalLedger();
    const declaration = ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 });
    const build = () => reconcileVat(reconciliationInput({
      fecEntries: entries,
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [declaration],
    })).snapshot;

    expect(build().snapshotHash).toBe(build().snapshotHash);
  });

  it("est insensible a l'ordre d'arrivee des lignes du FEC", () => {
    const entries = nominalLedger();
    const declaration = ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 });
    const run = (fecEntries: typeof entries) => reconcileVat(reconciliationInput({
      fecEntries,
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [declaration],
    })).snapshot;

    const reversed = [...entries].reverse();
    expect(run(reversed).snapshotHash).toBe(run(entries).snapshotHash);
  });

  it("distingue deux lectures de FEC dont la provenance differe", () => {
    // Meme contenu metier, numeros de ligne differents : l'empreinte doit
    // changer, sans quoi la trace ne serait plus une preuve de provenance.
    const declaration = ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 });
    const run = () => reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [declaration],
    })).snapshot;

    expect(run().snapshotHash).not.toBe(run().snapshotHash);
  });

  it("refuse un document rattache a une autre periode fiscale", () => {
    expect(() => reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      documentSnapshots: [ca3({ "16": euros(200) }, "une-autre-periode")],
    }))).toThrow(/VAT_DOCUMENT_SCOPE_MISMATCH/u);
  });

  it("n'emet aucun outcome de non-conformite confirmee", () => {
    const { snapshot } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(999), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));

    expect(snapshot.controls.every((control) => control.outcome !== "confirmed_non_compliance")).toBe(true);
    expect(snapshot.outcome).not.toBe("confirmed_non_compliance");
  });
});

describe("VatFindingFactory", () => {
  it("rattache le constat au controle du regime et respecte ses outcomes autorises", () => {
    const { snapshot, reconciliationLines } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: NOMINAL_INVOICES,
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));
    const findings = new VatFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-vat-1",
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.controlId === "VAT.FORM.CA3.RECONCILIATION")).toBe(true);
    expect(findings.every((finding) => finding.domain === "tax" && finding.taxType === "vat")).toBe(true);
  });

  it("cite le controle CA12 pour le reel simplifie, jamais le controle CA3", () => {
    const period = vatPeriod({
      id: "vat-period-2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      frequency: "annual",
    });
    const { snapshot, reconciliationLines } = reconcileVat(reconciliationInput({
      profile: vatProfile({ vatRegime: "real_simplified" }),
      period,
      fecEntries: nominalLedger(),
      documentSnapshots: [ca12({ "19": euros(200), "26": euros(100), "54": euros(100), "29": 0, "24": 0, "51": 0 }, "vat-period-2026")],
    }));
    const findings = new VatFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-vat-1",
    });

    expect(findings.some((finding) => finding.controlId === "VAT.FORM.CA12.RECONCILIATION")).toBe(true);
    expect(findings.some((finding) => finding.controlId === "VAT.FORM.CA3.RECONCILIATION")).toBe(false);
  });

  it("route un risque de deduction vers le controle qui l'autorise", () => {
    const { snapshot, reconciliationLines } = reconcileVat(reconciliationInput({
      fecEntries: nominalLedger(),
      availableInvoiceRefs: ["FA-V1"],
      documentSnapshots: [ca3({ "08": euros(1_000), "16": euros(200), "23": euros(100), "28": euros(100), "25": 0, "22": 0, "27": 0 })],
    }));
    const findings = new VatFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-vat-1",
    });

    const risk = findings.find((finding) => finding.outcome === "potential_tax_risk");
    // `VAT.FORM.CA3.RECONCILIATION` n'autorise pas `potential_tax_risk`.
    expect(risk?.controlId).toBe("VAT.DEDUCTIBLE.SUPPORT");
  });
});

describe("Injection du plan comptable", () => {
  it("accepte un plan de comptes atypique sans modifier le moteur", () => {
    const engine = new VatControlEngine();
    const { snapshot } = engine.reconcile(reconciliationInput({
      accountMap: {
        collectedVatPrefixes: ["9957"],
        deductibleVatPrefixes: ["9956"],
        payableVatPrefixes: ["9955"],
        salesBasePrefixes: ["90"],
        purchaseBasePrefixes: ["96"],
        fixedAssetBasePrefixes: ["92"],
      },
      fecEntries: [
        ...saleEntry({ ecritureNum: "V1", baseEuros: 1_000, vatEuros: 200 }),
      ],
      documentSnapshots: [],
    }));

    // Les comptes standards ne sont plus reconnus : aucun candidat.
    expect(snapshot.transactionCandidates).toHaveLength(0);
    expect(snapshot.collectedAccountedCents).toBe(0);
  });
});
