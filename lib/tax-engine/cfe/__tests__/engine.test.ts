/**
 * Tests du module CFE (TAX-07-CFE).
 *
 * Le module **rapproche** ; il ne calcule pas. Ces tests vérifient d'abord
 * qu'il refuse de prétendre calculer, puis les neuf scénarios exigés par le lot.
 *
 * Le seul seuil que possède le module est sa **tolérance de rapprochement** :
 * aucun seuil légal n'existe, faute de base locative et de taux communal
 * publiés. Les scénarios « seuil exact / juste en dessous / juste au-dessus »
 * portent donc sur cette tolérance, qui reste de famille `internal`.
 */
import { describe, expect, it } from "vitest";
import {
  CfeFindingFactory,
  CfeReconciliationEngine,
  CfeReconciliationSnapshotSchema,
  assessCfeApplicability,
  reconcileCfe,
} from "../index";
import {
  cfeNotice,
  cfePeriod,
  cfeProfile,
  chargeEntry,
  euros,
  reconciliationInput,
  settlementEntry,
} from "./fixtures";

function controlOf(snapshot: { readonly controls: readonly { readonly controlId: string }[] }, controlId: string) {
  const control = snapshot.controls.find((item) => item.controlId === controlId);
  if (!control) throw new Error(`controle absent : ${controlId}`);
  return control as (typeof snapshot.controls)[number] & {
    readonly outcome: string;
    readonly differenceCents: number | null;
    readonly toleranceCents: number;
    readonly limitationIds: readonly string[];
  };
}

/** Dossier nominal : un avis de 1 200 €, charge et règlement identiques. */
function nominalInput(overrides = {}) {
  return reconciliationInput({
    notices: [cfeNotice({ totalDueCents: euros(1_200) })],
    fecEntries: [
      ...chargeEntry({ amountEuros: 1_200 }),
      ...settlementEntry({ amountEuros: 1_200 }),
    ],
    ...overrides,
  });
}

describe("Le module ne calcule jamais la cotisation", () => {
  it("porte toujours la limitation d'incalculabilite et trace son abstention", () => {
    const { snapshot } = reconcileCfe(nominalInput());

    expect(snapshot.limitations.map((item) => item.code)).toContain("CFE_BASE_NOT_RECOMPUTABLE");
    const abstention = snapshot.trace.find((step) => step.operation === "abstain_from_computation");
    expect(abstention).toBeDefined();
    expect(abstention?.inputRefs).toEqual(["base_locative", "deliberation_collectivite", "taux_communal"]);
    expect(snapshot.notes.map((note) => note.code)).toContain("NO_RECOMPUTATION");
  });

  it("ne revendique jamais une capacite de calcul", () => {
    const { snapshot } = reconcileCfe(nominalInput());
    // `compute` n'existe pas dans le type : la capacite maximale est `reconcile`.
    expect(["reconcile", "recommend_review", "blocked"]).toContain(snapshot.capability);
    expect(snapshot.capability).toBe("reconcile");
  });

  it("le schema refuse un snapshot qui aurait perdu la limitation d'incalculabilite", () => {
    const { snapshot } = reconcileCfe(nominalInput());
    const tampered = {
      ...snapshot,
      limitations: snapshot.limitations.filter((item) => item.code !== "CFE_BASE_NOT_RECOMPUTABLE"),
    };
    expect(() => CfeReconciliationSnapshotSchema.parse(tampered))
      .toThrow(/incalculabilite/u);
  });
});

describe("Rapprochement nominal", () => {
  it("rapproche avis, charge et reglement sans ecart", () => {
    const { snapshot, reconciliationLines } = reconcileCfe(nominalInput());

    expect(snapshot.status).toBe("reconciled");
    expect(snapshot.capability).toBe("reconcile");
    expect(snapshot.noticeTotalCents).toBe(euros(1_200));
    expect(snapshot.ledger.chargeCents).toBe(euros(1_200));
    expect(snapshot.ledger.settlementCents).toBe(euros(1_200));
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("passed");
    expect(controlOf(snapshot, "CFE.NOTICE.VS.PAYMENT").outcome).toBe("passed");
    expect(reconciliationLines.every((line) => line.status === "matched")).toBe(true);
    expect(snapshot.outcome).toBe("passed");
    expect(() => CfeReconciliationSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it("execute les huit controles du module", () => {
    const { snapshot } = reconcileCfe(nominalInput());
    expect(snapshot.controls).toHaveLength(8);
  });
});

describe("Seuil de tolerance", () => {
  const withDifference = (differenceCents: number, toleranceCents: number) =>
    reconcileCfe(reconciliationInput({
      toleranceCents,
      notices: [cfeNotice({ totalDueCents: euros(1_200) + differenceCents })],
      fecEntries: [
        ...chargeEntry({ amountEuros: 1_200 }),
        ...settlementEntry({ amountEuros: 1_200 }),
      ],
    })).snapshot;

  it("ecart exactement egal a la tolerance : rapproche", () => {
    const snapshot = withDifference(500, 500);
    const control = controlOf(snapshot, "CFE.NOTICE.VS.CHARGE");
    expect(control.differenceCents).toBe(500);
    expect(control.toleranceCents).toBe(500);
    expect(control.outcome).toBe("passed");
  });

  it("ecart juste en dessous de la tolerance : rapproche", () => {
    const snapshot = withDifference(499, 500);
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("passed");
  });

  it("ecart juste au-dessus de la tolerance : ecart signale", () => {
    const snapshot = withDifference(501, 500);
    const control = controlOf(snapshot, "CFE.NOTICE.VS.CHARGE");
    expect(control.differenceCents).toBe(501);
    expect(control.outcome).toBe("reconciliation_difference");
  });

  it("la tolerance par defaut est nulle : un centime suffit a signaler", () => {
    const snapshot = withDifference(1, 0);
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("reconciliation_difference");
  });

  it("une tolerance de rapprochement reste de famille interne", () => {
    const { reconciliationLines } = reconcileCfe(reconciliationInput({
      toleranceCents: 500,
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));
    expect(reconciliationLines.every((line) => line.toleranceFamily === "internal")).toBe(true);
  });

  it("refuse une tolerance negative", () => {
    expect(() => reconcileCfe(reconciliationInput({ toleranceCents: -1 })))
      .toThrow(/CFE_NEGATIVE_TOLERANCE/u);
  });
});

describe("Donnees manquantes", () => {
  it("sans avis, le module ne peut que recommander une revue", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.capability).toBe("recommend_review");
    expect(controlOf(snapshot, "CFE.NOTICE.AVAILABLE").outcome).toBe("missing_information");
    expect(snapshot.limitations.map((item) => item.code)).toContain("CFE_NOTICE_UNAVAILABLE");
    expect(snapshot.outcome).toBe("missing_information");
    // L'absence dans PROBANT ne vaut pas absence d'avis.
    expect(snapshot.noticeTotalCents).toBeNull();
  });

  it("sans ecritures, le rapprochement reste inconclusive et non concordant", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [],
    }));

    // Charge et reglement valent zero : ce n'est pas une absence, c'est un ecart.
    expect(snapshot.ledger.chargeCents).toBe(0);
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("reconciliation_difference");
  });
});

describe("Valeur inconnue", () => {
  it("un total d'avis illisible n'est jamais remplace par une somme partielle", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [
        cfeNotice({ id: "n1", totalDueCents: euros(800) }),
        cfeNotice({ id: "n2", establishmentId: "etab-lyon", totalDueCents: null }),
      ],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.noticeTotalCents).toBeNull();
    expect(controlOf(snapshot, "CFE.NOTICE.AVAILABLE").outcome).toBe("missing_information");
    expect(snapshot.limitations.map((item) => item.code)).toContain("CFE_NOTICE_TOTAL_UNREADABLE");
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("inconclusive");
  });
});

describe("Exercice different", () => {
  it("signale un avis dont la periode ne correspond pas a la periode controlee", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({
        taxYear: 2025,
        periodStartDate: "2025-01-01",
        periodEndDate: "2025-12-31",
      })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(controlOf(snapshot, "CFE.PERIOD.COHERENCE").outcome).toBe("reconciliation_difference");
    expect(snapshot.outcome).toBe("reconciliation_difference");
  });

  it("accepte un avis dont la periode correspond exactement", () => {
    const { snapshot } = reconcileCfe(nominalInput());
    expect(controlOf(snapshot, "CFE.PERIOD.COHERENCE").outcome).toBe("passed");
  });
});

describe("Exoneration", () => {
  it("une exoneration verifiee rend la CFE non applicable", () => {
    const applicability = assessCfeApplicability({
      profile: cfeProfile({
        parameters: [{
          key: "cfe_exemption",
          value: true,
          verificationStatus: "verified",
          sourceRefs: ["profil-fiscal"],
          verifiedBy: "reviewer-1",
          verifiedAt: "2026-08-16T10:00:00.000Z",
        }],
      }),
      periodStartDate: "2026-05-01",
      periodEndDate: "2026-12-31",
    });

    expect(applicability.exemptionStatus).toBe("claimed");
    expect(applicability.status).toBe("not_applicable");
  });

  it("signale une exoneration declaree alors qu'un avis porte un montant du", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      profile: cfeProfile({
        parameters: [{
          key: "cfe_exemption",
          value: true,
          verificationStatus: "verified",
          sourceRefs: ["profil-fiscal"],
          verifiedBy: "reviewer-1",
          verifiedAt: "2026-08-16T10:00:00.000Z",
        }],
      }),
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(controlOf(snapshot, "CFE.EXEMPTION.CONSISTENCY").outcome).toBe("reconciliation_difference");
    expect(snapshot.notes.map((note) => note.code)).toContain("EXEMPTION_WITH_NOTICE");
  });

  it("une exoneration non verifiee ne suffit pas a ecarter l'impot", () => {
    const applicability = assessCfeApplicability({
      profile: cfeProfile({
        parameters: [{
          key: "cfe_exemption",
          value: true,
          verificationStatus: "unverified",
          sourceRefs: ["profil-fiscal"],
          verifiedBy: null,
          verifiedAt: null,
        }],
      }),
      periodStartDate: "2026-05-01",
      periodEndDate: "2026-12-31",
    });

    expect(applicability.exemptionStatus).toBe("unknown");
    expect(applicability.status).toBe("unknown");
  });

  it("un statut d'exoneration inconnu bloque la conclusion", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      profile: cfeProfile({ parameters: [] }),
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [
        ...chargeEntry({ amountEuros: 1_200 }),
        ...settlementEntry({ amountEuros: 1_200 }),
      ],
    }));

    expect(controlOf(snapshot, "CFE.EXEMPTION.CONSISTENCY").outcome).toBe("missing_information");
    expect(snapshot.limitations.map((item) => item.code)).toContain("CFE_EXEMPTION_STATUS_UNKNOWN");
    expect(snapshot.outcome).toBe("missing_information");
  });
});

describe("Coherence des etablissements", () => {
  it("signale un avis rattache a un etablissement absent du profil", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ establishmentId: "etab-inconnu", totalDueCents: euros(1_200) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    const control = controlOf(snapshot, "CFE.ESTABLISHMENT.COHERENCE");
    expect(control.outcome).toBe("reconciliation_difference");
    const comparison = snapshot.establishmentComparisons.find((item) => item.establishmentId === "etab-inconnu");
    expect(comparison?.inProfile).toBe(false);
    expect(comparison?.verificationStatus).toBe("absent");
  });

  it("signale un etablissement du profil sans avis rattache", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      profile: cfeProfile({
        establishments: [
          {
            establishmentId: "etab-paris",
            countryCode: "FR",
            postalCode: "75001",
            municipality: "Paris",
            isPrincipal: true,
            verificationStatus: "verified",
          },
          {
            establishmentId: "etab-lyon",
            countryCode: "FR",
            postalCode: "69001",
            municipality: "Lyon",
            isPrincipal: false,
            verificationStatus: "verified",
          },
        ],
      }),
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(controlOf(snapshot, "CFE.ESTABLISHMENT.COHERENCE").outcome).toBe("review_recommendation");
  });

  it("additionne les avis d'un meme etablissement", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [
        cfeNotice({ id: "n1", totalDueCents: euros(700) }),
        cfeNotice({ id: "n2", totalDueCents: euros(500) }),
      ],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.noticeTotalCents).toBe(euros(1_200));
    const comparison = snapshot.establishmentComparisons.find((item) => item.establishmentId === "etab-paris");
    expect(comparison?.noticeTotalCents).toBe(euros(1_200));
  });
});

describe("Declaration divergente", () => {
  it("signale un avis qui diverge de la charge comptabilisee", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ totalDueCents: euros(1_500) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    const control = controlOf(snapshot, "CFE.NOTICE.VS.CHARGE");
    expect(control.outcome).toBe("reconciliation_difference");
    expect(control.differenceCents).toBe(euros(300));
  });

  it("signale un detail d'avis qui ne totalise pas le montant du", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({
        totalDueCents: euros(1_200),
        lines: [
          { code: "cotisation_cfe", label: "Cotisation CFE", amountCents: euros(1_000) },
          { code: "taxes_additionnelles", label: "Taxes additionnelles", amountCents: euros(150) },
        ],
      })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(controlOf(snapshot, "CFE.NOTICE.INTERNAL_CONSISTENCY").outcome).toBe("reconciliation_difference");
  });

  it("accepte un detail d'avis qui totalise exactement", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({
        totalDueCents: euros(1_200),
        lines: [
          { code: "cotisation_cfe", label: "Cotisation CFE", amountCents: euros(1_050) },
          { code: "taxes_additionnelles", label: "Taxes additionnelles", amountCents: euros(150) },
        ],
      })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(controlOf(snapshot, "CFE.NOTICE.INTERNAL_CONSISTENCY").outcome).toBe("passed");
  });
});

describe("Arrondis", () => {
  it("convertit les euros decimaux du FEC en centimes exacts", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ totalDueCents: 120_055 })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200.55 })],
    }));

    // 1 200,55 EUR -> 120 055 centimes, sans derive de flottant.
    expect(snapshot.ledger.chargeCents).toBe(120_055);
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").outcome).toBe("passed");
  });

  it("conserve l'exactitude au centime sur un montant a decimales delicates", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ totalDueCents: 33_333 })],
      fecEntries: [...chargeEntry({ amountEuros: 333.33 })],
    }));

    expect(snapshot.ledger.chargeCents).toBe(33_333);
    expect(controlOf(snapshot, "CFE.NOTICE.VS.CHARGE").differenceCents).toBe(0);
  });
});

describe("Couverture de la doctrine publiee", () => {
  it("signale une periode anterieure a la publication de la doctrine", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      period: cfePeriod({
        id: "cfe-period-early",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
      notices: [cfeNotice({
        periodStartDate: "2026-01-01",
        periodEndDate: "2026-12-31",
      })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.applicability.sourceCoverage.status).not.toBe("covered");
    expect(snapshot.applicability.sourceCoverage.uncoveredFromDate).toBe("2026-01-01");
    expect(snapshot.limitations.map((item) => item.code)).toContain("CFE_DOCTRINE_NOT_COVERED");
  });
});

describe("Prudence et provenance", () => {
  it("accepte un avis saisi a la main, avec son porteur", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ provenance: "manual_entry", sourceDocumentId: null, capturedBy: "reviewer-2" })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.notices[0].provenance).toBe("manual_entry");
    expect(snapshot.notices[0].capturedBy).toBe("reviewer-2");
  });

  it("refuse un avis importe sans document source", () => {
    expect(() => reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ provenance: "imported_document", sourceDocumentId: null })],
    }))).toThrow(/CFE_IMPORTED_NOTICE_WITHOUT_DOCUMENT/u);
  });

  it("refuse un avis sans porteur", () => {
    expect(() => reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ capturedBy: "  " })],
    }))).toThrow(/CFE_NOTICE_WITHOUT_CAPTURER/u);
  });

  it("ne conclut jamais depuis un numero de compte seul", () => {
    const { snapshot } = reconcileCfe(nominalInput());
    expect(snapshot.ledger.candidates.every((item) => item.evidenceStrength === "derived")).toBe(true);
  });

  it("bloque une periode qui ne releve pas de la CFE", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      period: cfePeriod({ taxType: "vat" }),
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.capability).toBe("blocked");
    expect(snapshot.controls).toHaveLength(0);
    expect(snapshot.limitations.map((item) => item.code)).toContain("PERIOD_NOT_CFE");
  });

  it("accepte un plan comptable atypique sans modifier le moteur", () => {
    const engine = new CfeReconciliationEngine();
    const { snapshot } = engine.reconcile(reconciliationInput({
      accountMap: {
        chargeAccountPrefixes: ["9351"],
        liabilityAccountPrefixes: ["9470"],
        settlementAccountPrefixes: ["9120"],
      },
      notices: [cfeNotice({ totalDueCents: euros(1_200) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    // Les comptes standards ne sont plus reconnus.
    expect(snapshot.ledger.chargeCents).toBe(0);
    expect(snapshot.ledger.candidates).toHaveLength(0);
  });

  it("est deterministe : les memes entrees produisent la meme empreinte", () => {
    const input = nominalInput();
    expect(reconcileCfe(input).snapshot.snapshotHash)
      .toBe(reconcileCfe(input).snapshot.snapshotHash);
  });

  it("n'emet aucune non-conformite confirmee", () => {
    const { snapshot } = reconcileCfe(reconciliationInput({
      notices: [cfeNotice({ totalDueCents: euros(9_999) })],
      fecEntries: [...chargeEntry({ amountEuros: 1_200 })],
    }));

    expect(snapshot.controls.every((control) => control.outcome !== "confirmed_non_compliance")).toBe(true);
    expect(snapshot.outcome).not.toBe("confirmed_non_compliance");
  });
});

describe("CfeFindingFactory", () => {
  it("rattache le constat au controle CFE du catalogue", () => {
    const { snapshot, reconciliationLines } = reconcileCfe(nominalInput());
    const findings = new CfeFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-cfe-1",
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.controlId === "CFE.NOTICE.RECONCILIATION")).toBe(true);
    expect(findings.every((finding) => finding.taxType === "cfe")).toBe(true);
    // Le module ne chiffre aucun impact : il ne calcule pas.
    expect(findings.every((finding) => finding.taxImpactStatus === "not_computed")).toBe(true);
  });

  it("cite le document source d'un avis importe", () => {
    const { snapshot, reconciliationLines } = reconcileCfe(nominalInput());
    const findings = new CfeFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-cfe-1",
    });

    expect(findings[0].documentSnapshotIds).toContain("tax-notice-doc-1");
  });
});
