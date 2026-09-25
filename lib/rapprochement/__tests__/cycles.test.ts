import { describe, it, expect } from "vitest";
import { siloById } from "@/lib/canonical-model/taxonomy";
import { buildAllRapprochementSilos } from "../demo";
import { buildFournisseursRapprochementSilo } from "../demo/fournisseurs";
import { buildStocksRapprochementSilo } from "../demo/stocks";
import { buildTresorerieRapprochementSilo } from "../demo/tresorerie";
import { buildFiscalRapprochementSilo } from "../demo/fiscal";
import { lignesDepuisTableur, parseMontant } from "../adapters/tabular";
import { rapprocher } from "../engine";
import { CONFIG_CLIENTS } from "../demo/clients";

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

  it("distingue montant absent, zéro et valeur invalide", () => {
    expect(parseMontant(null)).toEqual({ kind: "absent" });
    expect(parseMontant("")).toEqual({ kind: "absent" });
    expect(parseMontant("0,00 €")).toEqual({ kind: "valid", value: 0 });
    expect(parseMontant("12 500,00 €")).toEqual({ kind: "valid", value: 12500 });
    expect(parseMontant("12\u202f500,00\u00a0€")).toEqual({ kind: "valid", value: 12500 });
    expect(parseMontant("illisible")).toEqual({ kind: "invalid" });
  });

  it("refuse les lignes illisibles au lieu de conclure à 100 % sans exception", () => {
    const map = { tiers: "Tiers", montant: "Montant" };
    expect(() => lignesDepuisTableur([{ Tiers: "ACME", Montant: "12 500,00 €" }, { Tiers: "ERREUR", Montant: "N/A" }], map)).toThrow(/invalide.*ligne 2/u);
    const source = { id: "a", label: "A", type: "balance_auxiliaire" as const, format: "csv" as const, lignes: lignesDepuisTableur([{ Tiers: "ACME", Montant: "12 500,00 €" }], map) };
    const cible = { ...source, id: "b", label: "B", lignes: lignesDepuisTableur([{ Tiers: "AUTRE", Montant: "12 500,00 €" }], map) };
    const result = rapprocher(source, cible, CONFIG_CLIENTS);
    expect(result.ecarts.length).toBeGreaterThan(0);
    expect(result.tauxRapprochement).toBe(1); // égalité des totaux ≠ absence d'exception
    expect(() => rapprocher({ ...source, lignes: [] }, cible, CONFIG_CLIENTS)).toThrow(/aucune ligne/u);
  });
});
