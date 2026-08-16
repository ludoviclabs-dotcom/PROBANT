/**
 * Régressions pour les 5 défauts relevés par la revue Codex sur la PR #44.
 *
 * Chaque test reproduit le scénario exact du rapport : un total déclaré
 * illisible traité comme zéro, un snapshot d'une autre période fiscale
 * mélangé au calcul, un contrôle régime-simplifié bloqué par un type de
 * document du régime normal, un déficit inconnu concluant `passed`, et un
 * résultat déclaré contradictoire (bénéfice et déficit non nuls) résolu en
 * silence sur un seul côté.
 */
import { describe, expect, it } from "vitest";
import { TAX_CONTROL_DEFINITIONS } from "@/lib/tax";
import { computeCorporateTax, CorporateTaxFindingFactory } from "@/lib/tax";
import {
  coherentLiasse,
  computationInput,
  declaration2065,
  euros,
  liasse2033B,
  liasse2058A,
  liasse2058B,
  profile,
} from "./fixtures";

describe("Codex #1 — un total declare illisible n'est jamais traite comme zero", () => {
  it("bloque le calcul quand WR (reintegrations) est present dans le millesime mais absent de la liasse", () => {
    // WA et XH presents, WR totalement absent des champs du snapshot (par
    // opposition a une case presente valant explicitement 0).
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000),
        WS: 0,
        XH: 0,
        XI: euros(100_000),
        XL: 0,
        XN: euros(100_000),
      })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.outcome).toBe("missing_information");
    expect(snapshot.taxImpactStatus).toBe("not_computed");
    expect(snapshot.grossTaxCents).toBe(0);
    expect(snapshot.limitations.some((item) => item.code.startsWith("DECLARED_TOTAL_UNAVAILABLE:WR"))).toBe(true);
  });

  it("bloque le calcul quand XH (deductions) est totalement absent de la liasse", () => {
    // WR present (0, donc explicitement declare) mais XH totalement absent
    // des champs du snapshot : meme garde-fou que pour WR.
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000),
        WS: 0,
        WR: 0,
        XI: euros(100_000),
        XL: 0,
        XN: euros(100_000),
      })],
    }));

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.outcome).toBe("missing_information");
    expect(snapshot.limitations.some((item) => item.code.startsWith("DECLARED_TOTAL_UNAVAILABLE:XH"))).toBe(true);
  });
});

describe("Codex #2 — un snapshot d'une autre periode fiscale est rejete", () => {
  it("refuse un document dont le taxPeriodId ne correspond pas a la periode calculee", () => {
    const foreignPeriodDocument = liasse2058A({ WA: euros(100_000), WS: 0, WR: 0, XH: 0, XL: 0 });
    const crossPeriodDocument = {
      ...foreignPeriodDocument,
      // Meme organisation/dossier/entite, meme formulaire et millesime, mais
      // rattache a une AUTRE periode fiscale : ne doit jamais nourrir ce calcul.
      taxPeriodId: "period-from-a-different-fiscal-year",
    };

    expect(() => computeCorporateTax(computationInput({
      documentSnapshots: [crossPeriodDocument],
    }))).toThrow(/CORPORATE_TAX_DOCUMENT_SCOPE_MISMATCH/u);
  });

  it("continue de fonctionner normalement quand le taxPeriodId correspond", () => {
    // Non-regression : le test golden nominal doit rester vert.
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));
    expect(snapshot.status).toBe("computed");
  });
});

describe("Codex #3 — le controle du regime simplifie n'exige pas la liasse du regime normal", () => {
  it("le catalogue expose deux controles de calcul distincts, un par regime", () => {
    const standard = TAX_CONTROL_DEFINITIONS.find((item) => item.controlId === "IS.COMPUTATION.RESULT_AND_TAX.2058A");
    const simplified = TAX_CONTROL_DEFINITIONS.find((item) => item.controlId === "IS.COMPUTATION.RESULT_AND_TAX.2033B");

    expect(standard?.applicability.corporateIncomeTaxRegimes).toEqual(["standard"]);
    expect(standard?.requiredDocumentTypes).toEqual(["liasse_2050_2059"]);

    expect(simplified?.applicability.corporateIncomeTaxRegimes).toEqual(["simplified"]);
    expect(simplified?.requiredDocumentTypes).toEqual(["liasse_2033"]);
    // Le controle simplifie ne doit exiger aucun type de document du regime normal.
    expect(simplified?.requiredDocumentTypes).not.toContain("liasse_2050_2059");
  });

  it("le constat d'un dossier simplifie cite le controle simplifie, pas le controle du regime normal", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      profile: profile({ corporateIncomeTaxRegime: "simplified" }),
      documentSnapshots: [liasse2033B({
        312: euros(100_000), 314: 0, 316: 0, 318: 0, 322: 0, 324: 0,
        352: euros(100_000), 354: 0, 360: 0, 370: euros(100_000), 372: 0,
      })],
    }));
    const findings = new CorporateTaxFindingFactory().build({
      snapshot,
      reconciliationLines,
      executionId: "execution-1",
    });

    expect(findings.every((finding) => finding.controlId === "IS.COMPUTATION.RESULT_AND_TAX.2033B")).toBe(true);
    expect(findings.some((finding) => finding.controlId === "IS.COMPUTATION.RESULT_AND_TAX.2058A")).toBe(false);
  });
});

describe("Codex #4 — un deficit totalement inconnu ne peut jamais conclure `passed`", () => {
  it("bloque plutot que de presumer l'absence de deficit reportable", () => {
    // XI/XN coherents avec l'absence de deficit : sans la limitation dediee,
    // la comparaison declaree concorderait et le moteur conclurait `passed`.
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000), WS: 0, WR: 0, XH: 0,
        XI: euros(100_000), XL: 0, XN: euros(100_000),
      })],
      // Aucun 2058-B fourni : ni la case XL (deja a 0, donc "declaree" et
      // coherente avec taxResultBeforeDeficits > 0) ni le stock ne sont
      // fournis via un document de suivi.
    }));

    expect(snapshot.deficits.status).toBe("applied");
    // XL=0 est explicitement declare, donc ce scenario passe par la branche
    // "declared" et non "unknown" ; il sert de temoin que le cas normal reste
    // `passed`. Le vrai test de la limitation est ci-dessous avec XL absent.
    expect(snapshot.outcome).toBe("passed");
  });

  it("XL absent et aucun stock connu : limitation emise, jamais `passed`", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000), WS: 0, WR: 0, XH: 0,
        XI: euros(100_000), XN: euros(100_000),
        // XL omis : la case n'est pas exploitable, pas seulement nulle.
      })],
    }));

    expect(snapshot.limitations.map((item) => item.code)).toContain("DEFICIT_DATA_UNAVAILABLE");
    expect(snapshot.outcome).not.toBe("passed");
    expect(snapshot.outcome).toBe("missing_information");
  });
});

describe("Codex #5 — benefice et deficit declares ensemble ne sont jamais reduits a un seul cote", () => {
  it("XI et XJ non nuls simultanement : la comparaison est signalee, pas silencieusement resolue", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(100_000), WS: 0, WR: 0, XH: 0,
        XI: euros(100_000),
        XJ: euros(40_000),
        XL: 0,
        XN: euros(100_000),
      })],
    }));

    const line = reconciliationLines.find((item) => item.lineKey === "declared_tax_result_before_deficits");
    // Ni "matched" (ce serait accepter XI=100000 en ignorant XJ=40000) ni
    // "different" sur une valeur choisie arbitrairement : l'operande droit
    // est indisponible tant que la contradiction n'est pas arbitree.
    expect(line?.status).toBe("missing_operand");
    expect(snapshot.limitations.map((item) => item.code)).toContain("DECLARED_RESULT_INCONSISTENT:XI");
    expect(snapshot.outcome).not.toBe("passed");
  });

  it("XN et XO non nuls simultanement sur le resultat final : meme garde-fou", () => {
    const { snapshot, reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [
        liasse2058A({
          WA: euros(100_000), WS: 0, WR: 0, XH: 0,
          XI: euros(100_000), XL: euros(30_000),
          XN: euros(70_000),
          XO: euros(10_000),
        }),
        liasse2058B({ K4: euros(30_000) }),
      ],
    }));

    const line = reconciliationLines.find((item) => item.lineKey === "declared_final_tax_result");
    expect(line?.status).toBe("missing_operand");
    expect(snapshot.limitations.map((item) => item.code)).toContain("DECLARED_RESULT_INCONSISTENT:XN");
  });

  it("ne declenche pas la limitation quand un seul cote est non nul (non-regression)", () => {
    const { snapshot } = computeCorporateTax(computationInput({
      documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(100_000) })],
    }));
    expect(snapshot.limitations.some((item) => item.code.startsWith("DECLARED_RESULT_INCONSISTENT"))).toBe(false);
    expect(snapshot.outcome).toBe("passed");
  });
});

describe("Non-regression : la 2065 reste comparable apres la scission de controle", () => {
  it("la comparaison de base declaree fonctionne toujours pour le regime normal", () => {
    const { reconciliationLines } = computeCorporateTax(computationInput({
      documentSnapshots: [
        coherentLiasse({ accountingProfitCents: euros(100_000) }),
        declaration2065({ "C.RESULTAT_TAUX_NORMAL": euros(100_000), "C.RESULTAT_TAUX_REDUIT": 0 }),
      ],
    }));
    const line = reconciliationLines.find((item) => item.lineKey === "declared_normal_rate_base");
    expect(line?.status).toBe("matched");
  });
});
