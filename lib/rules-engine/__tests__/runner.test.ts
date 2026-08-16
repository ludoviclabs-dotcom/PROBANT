import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/canonical-model";
import { parseFec } from "@/lib/fec/parser";
import { HARD_LAW_RULES } from "../registries/hard-law";
import {
  ALL_REGISTRIES,
  hasBlockingIngestionFinding,
  runRules,
  splitAdmissibilite,
} from "../runner";

function finding(
  controlStage: NonNullable<Finding["controlStage"]>,
  severity: Finding["severity"] = "bloquant",
): Finding {
  return {
    id: `test-${controlStage}`,
    family: "hardLaw",
    severity,
    controlStage,
    ruleId: "R-HL-future",
    ruleVersion: "1.0.0",
    cloison: "journaux",
    siloId: "journaux",
    titre: "Constat de test",
    constat: "Constat de test.",
    explication: "Explication de test.",
    mesure: { constate: 1, seuil: 0, unite: "ratio", libelle: "test" },
    source: {
      ref: "Test",
      citation: "Test",
      effectiveDate: "2026-01-01",
    },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
  };
}

describe("stages des contrôles", () => {
  it("assigne une étape explicite à chaque règle existante", () => {
    expect(ALL_REGISTRIES).toHaveLength(15);
    expect(ALL_REGISTRIES.map((rule) => rule.controlStage)).toEqual(
      expect.arrayContaining([
        "ingestion_admissibility",
        "accounting_review",
        "tax_review",
      ]),
    );
    expect(
      ALL_REGISTRIES.every(
        (rule) =>
          rule.controlStage === "ingestion_admissibility" ||
          rule.controlStage === "accounting_review" ||
          rule.controlStage === "tax_review",
      ),
    ).toBe(true);
  });

  it("ne transforme jamais un constat fiscal bloquant en rejet technique", () => {
    const fiscal = finding("tax_review");
    const { admissibilite, analyse } = splitAdmissibilite([fiscal]);

    expect(admissibilite).toEqual([]);
    expect(analyse).toEqual([fiscal]);
    expect(hasBlockingIngestionFinding([fiscal])).toBe(false);
  });

  it("réserve le rejet aux seuls constats bloquants d'admissibilité", () => {
    const technical = finding("ingestion_admissibility");
    const accounting = finding("accounting_review");

    expect(hasBlockingIngestionFinding([accounting])).toBe(false);
    expect(hasBlockingIngestionFinding([technical])).toBe(true);
  });

  it("conserve les trois signaux PRE-TAX-01 avec leur stage explicite", () => {
    const content = [
      "JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit;EcritureLet;DateLet;ValidDate;Montantdevise;Idevise",
      "VE;Ventes;VE-1;20260201;900;Compte hors PCG;;;FAC-001;20260201;Facture 1;100,00;0;;;20260201;;",
      "VE;Ventes;VE-1;20260201;706000;Prestations;;;FAC-001;20260201;Facture 1;0;90,00;;;20260201;;",
      "VE;Ventes;VE-2;20260101;411000;Clients;;;FAC-002;20260101;Facture 2;80,00;0;;;20260101;;",
      "VE;Ventes;VE-2;20260101;706000;Prestations;;;FAC-002;20260101;Facture 2;0;80,00;;;20260101;;",
    ].join("\n");
    const parsed = parseFec(content);
    const findings = runRules(
      {
        parsed,
        entries: parsed.entries,
        nomFichier: "123456789FEC20261231.txt",
        siren: "123456789",
        referentielVersion: "2026-01-01",
      },
      HARD_LAW_RULES,
    );
    const byRule = new Map(findings.map((item) => [item.ruleId, item]));

    expect(byRule.get("R-HL-006")).toMatchObject({
      controlStage: "tax_review",
      severity: "majeur",
      mesure: { constate: 1 },
      source: { ref: "LPF art. A.47 A-1, VII-1°, information 5" },
    });
    expect(byRule.get("R-HL-007")).toMatchObject({
      controlStage: "tax_review",
      severity: "majeur",
      mesure: { constate: 2 },
      source: { ref: "LPF art. A.47 A-1, VII-1°" },
    });
    expect(byRule.get("R-HL-008")).toMatchObject({
      controlStage: "accounting_review",
      severity: "majeur",
      mesure: { constate: 1 },
      source: { ref: "PCG art. 1031-1" },
    });
  });
});

