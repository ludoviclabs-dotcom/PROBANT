import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { CL_ASSERTIONS } from "@/lib/workpapers/closing-contract";
import { NEP_500_SOURCE, RULE_ASSERTIONS, SIGNAL_RULES, assertionFromFinancialEffect, resolveAssertions } from "../assertions";
import { RULE_PROCEDURES, regimeReferences, resolveProcedure } from "../procedures";

const demo = buildDemoDossierSnapshot();
const byRule = (ruleId: string) => demo.findings.find((f) => f.ruleId === ruleId)!;

describe("résolveur d'assertions (NEP 500 §09)", () => {
  it("n'emploie que les 13 assertions du contrat de clôture, et cite sa source", () => {
    for (const entry of Object.values(RULE_ASSERTIONS)) for (const a of entry.assertions) expect(CL_ASSERTIONS).toContain(a);
    expect(NEP_500_SOURCE.url).toMatch(/^https:\/\/h2a-france\.org\//);
    expect(NEP_500_SOURCE.consultedOn).toBe("2026-10-13");
  });
  it("constat qualitatif de valorisation sans impact : assertion résolue par la règle, pas par un montant", () => {
    const titres = byRule("R-PCG-TITRES");
    expect(titres.financialEffect).toBeUndefined();
    expect(resolveAssertions(titres)).toMatchObject({ basis: "rule", assertions: ["solde_evaluation"] });
  });
  it("deux constats Clients d'objectifs différents reçoivent des assertions différentes", () => {
    const litigieuse = resolveAssertions(byRule("R-PCG-CREANCES"));
    const fae = resolveAssertions({ ruleId: "R-ME-003", family: "methodology" });
    expect(litigieuse.assertions).toEqual(["solde_evaluation"]);
    expect(fae.assertions).toEqual(["flux_separation", "flux_exhaustivite"]);
  });
  it("une règle de conformité du fichier ne porte aucune assertion ; un signal interne reste non résolu", () => {
    expect(resolveAssertions({ ruleId: "R-HL-004", family: "hardLaw" })).toMatchObject({ basis: "file_conformity", assertions: [] });
    expect(resolveAssertions(byRule("R-IN-GEARING"))).toMatchObject({ basis: "unresolved", assertions: [] });
  });
  it("sans règle connue, l'effet financier explicite est traduit dans le vocabulaire NEP 500, sinon non résolu", () => {
    expect(resolveAssertions({ ruleId: "R-INCONNUE", family: "internal", financialEffect: { amountCents: 1, direction: "increase", target: "resultat", assertion: "exhaustivite", rootCause: "", period: "2024", basis: "measured" } })).toMatchObject({ basis: "financial_effect", assertions: ["flux_exhaustivite"] });
    expect(assertionFromFinancialEffect({ assertion: "exhaustivite", target: "bilan_actif" })).toBe("solde_exhaustivite");
    expect(assertionFromFinancialEffect({ assertion: "rattachement", target: "resultat" })).toBe("flux_separation");
    expect(resolveAssertions({ ruleId: "R-INCONNUE", family: "internal" })).toMatchObject({ basis: "unresolved" });
  });
  it("chaque constat de la démonstration est résolu, non résolu ou conformité : jamais « non qualifié » par absence de montant", () => {
    for (const f of demo.findings) {
      const r = resolveAssertions(f);
      if (r.basis === "unresolved") expect(SIGNAL_RULES.has(f.ruleId), f.ruleId).toBe(true);
      else expect(r.assertions.length > 0 || r.basis === "file_conformity").toBe(true);
    }
  });
});

describe("résolveur de procédures", () => {
  it("créance litigieuse → revue de recouvrabilité ; produit non facturé → rattachement : pas la même procédure du compte 418", () => {
    const litigieuse = resolveProcedure(byRule("R-PCG-CREANCES"));
    const fae = resolveProcedure({ ...byRule("R-PCG-CREANCES"), ruleId: "R-ME-003" });
    expect(litigieuse.title).toMatch(/recouvrabilité/i);
    expect(litigieuse.steps.join(" ")).toMatch(/491/);
    expect(litigieuse.steps.join(" ")).not.toMatch(/418/);
    expect(fae.title).toMatch(/non encore facturés/i);
    expect(fae.steps.join(" ")).toMatch(/418/);
    expect(litigieuse.references.map((r) => r.ref)).toContain("NEP 501 §07-08");
  });
  it("date FEC invalide : localisation, correction à la source, revalidation — pas une collecte de preuve générique", () => {
    const p = resolveProcedure({ ruleId: "R-HL-004", family: "hardLaw", comptesConcernes: [], siloId: "journaux", lignesSource: [12, 48], source: { ref: "LPF A.47 A-1", citation: "", effectiveDate: "2014-01-01" } });
    expect(p.status).toBe("resolved");
    expect(p.steps).toHaveLength(3);
    expect(p.steps[0]).toMatch(/Localiser/);
    expect(p.steps[1]).toMatch(/Corriger à la source/);
    expect(p.steps[2]).toMatch(/revalider/i);
    expect(p.steps.join(" ")).not.toMatch(/éléments probants/);
    expect(p.population.sourceLines).toBe(2);
    expect(p.assertionBasis).toBe("file_conformity");
  });
  it("un constat sans procédure connue reste « Procédure à définir », avec ce qui est connu", () => {
    const p = resolveProcedure(byRule("R-IN-GEARING"));
    expect(p.status).toBe("to_define");
    expect(p.title).toBe("Procédure à définir");
    expect(p.steps).toEqual([]);
    expect(p.population.silo).toBe("Dettes financières");
    expect(p.sourceOfFinding.ref).toBe(byRule("R-IN-GEARING").source.ref);
    expect(p.leftToProfessional).toMatch(/sans procédure générique/);
  });
  it("la population et la source viennent du constat, jamais réécrites", () => {
    const f = byRule("R-PCG-CREANCES");
    const p = resolveProcedure(f);
    expect(p.population.accounts).toEqual(f.comptesConcernes);
    expect(p.sourceOfFinding).toEqual({ ref: f.source.ref, effectiveDate: f.source.effectiveDate, url: f.source.url });
  });
  it("chaque procédure connue cite au moins une étape et toute référence pointe vers la H2A", () => {
    for (const [id, entry] of Object.entries(RULE_PROCEDURES)) {
      expect(entry.steps.length, id).toBeGreaterThan(0);
      for (const r of entry.references) expect(r.url, id).toMatch(/^https:\/\/h2a-france\.org\//);
    }
  });
  it("les références dépendent du régime sans confondre audit et examen limité", () => {
    expect(regimeReferences("audit", "2024").references.map((r) => r.ref)).toEqual(["NEP 330", "NEP 500 §09"]);
    const limited = regimeReferences("examen_limite", "2024");
    expect(limited.references.map((r) => r.ref)).toEqual(["NEP 2410 §08, §17-18"]);
    expect(limited.note).toMatch(/ne sont pas requis par la norme/);
    expect(regimeReferences("non_renseigne", "2024").note).toMatch(/sans en présumer/);
    expect(regimeReferences("non_renseigne", "2024").note).toMatch(/Exercice 2024/);
  });
});
