import { describe, it, expect } from "vitest";
import { siloById } from "@/lib/canonical-model/taxonomy";
import { buildAllRapprochementSilos } from "../demo";
import { buildFournisseursRapprochementSilo } from "../demo/fournisseurs";
import { buildStocksRapprochementSilo } from "../demo/stocks";
import { buildTresorerieRapprochementSilo } from "../demo/tresorerie";
import { buildFiscalRapprochementSilo } from "../demo/fiscal";
import { lignesDepuisTableur } from "../adapters/tabular";

describe("buildAllRapprochementSilos — couverture multi-cycles", () => {
  const silos = buildAllRapprochementSilos();

  it("produit 8 silos de rapprochement", () => {
    expect(silos).toHaveLength(8);
  });

  it("rattache chaque silo à une cloison existante de la taxonomie", () => {
    for (const s of silos) {
      expect(siloById(s.siloId), `silo ${s.siloId} absent de la taxonomie`).toBeDefined();
    }
  });

  it("chaque silo produit au moins un écart, tous marqués origine rapprochement et sourcés", () => {
    for (const s of silos) {
      expect(s.findings.length).toBeGreaterThan(0);
      for (const f of s.findings) {
        expect(f.origine).toBe("rapprochement");
        expect(f.qualification).toBeDefined();
        expect(f.source.ref.length).toBeGreaterThan(0);
        expect(f.source.citation.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("écarts spécifiques par cycle", () => {
  it("Fournisseurs : écart de solde + périmètres", () => {
    const f = buildFournisseursRapprochementSilo().findings;
    expect(f.some((x) => x.qualification === "rapprochement_solde")).toBe(true);
    expect(f.some((x) => x.qualification === "perimetre")).toBe(true);
  });

  it("Stocks : écart inventaire/compta rattaché à la dépréciation des stocks", () => {
    const f = buildStocksRapprochementSilo().findings;
    const solde = f.find((x) => x.qualification === "rapprochement_solde");
    expect(solde?.source.ref).toContain("214-19"); // PCG_DEPRECIATION_STOCK
  });

  it("Trésorerie : écart bancaire rattaché à la confirmation externe (ISA 505)", () => {
    const f = buildTresorerieRapprochementSilo().findings;
    const solde = f.find((x) => x.qualification === "rapprochement_solde");
    expect(solde?.source.ref).toBe("ISA 505");
  });

  it("Fiscal : écart CA déclaré / comptable rattaché au CGI (TVA)", () => {
    const f = buildFiscalRapprochementSilo().findings;
    const ca = f.find((x) => Math.abs(x.mesure.constate - x.mesure.seuil) === 312000);
    expect(ca).toBeDefined();
    expect(ca!.source.ref).toContain("CGI");
  });

  it("aucune détection de dépréciation hors cycle à créances (fournisseurs)", () => {
    const f = buildFournisseursRapprochementSilo().findings;
    expect(f.some((x) => x.qualification === "provision_insuffisante")).toBe(false);
  });
});

describe("adaptateur tabulaire", () => {
  it("normalise des enregistrements tableur vers DocumentLigne", () => {
    const lignes = lignesDepuisTableur(
      [{ Cpt: "411", Tiers: "DUPONT", Montant: "24 850,00", Lettre: "oui" }],
      { compte: "Cpt", tiers: "Tiers", montant: "Montant", lettre: "Lettre" },
    );
    expect(lignes[0].compte).toBe("411");
    expect(lignes[0].tiers).toBe("DUPONT");
    expect(lignes[0].montant).toBe(24850);
    expect(lignes[0].lettre).toBe(true);
  });
});
