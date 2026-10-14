import { describe, expect, it } from "vitest";
import { loadAllSources, loadCycle } from "@/lib/audit-cycles/loader";
import { validateCycle } from "@/lib/audit-cycles/validation";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { SCENARIO_MAP } from "@/lib/demo/scenarios";
import { SOURCES } from "@/lib/referentiel/sources";
import { articleVersion } from "../capitaux-legal";

/**
 * C09 follow-up — the knowledge base, the source registries and the demos paraphrase the Code de
 * commerce without concluding. Expected wording written by hand from Légifrance (read on
 * 14/10/2026), not from the engine: L232-10 (two versions), L223-42 / L225-248 (since 11/03/2023),
 * L227-1 (SAS).
 */
const L225_248_SINCE_2023 = "C. com. art. L225-248, version en vigueur depuis le 11/03/2023 (loi n° 2023-171 du 09/03/2023, art. 14)";

/** L223-42 : les associés de SARL décident dans les quatre mois ; L225-248 : l'organe de SA convoque l'AGE dans ce délai. */
function expectDistinctHalfCapitalProcedures(text: string, sarl: string) {
  expect(text).toContain(sarl + ", les associés décident, dans les quatre mois qui suivent l'approbation des comptes");
  expect(text).toContain("est tenu de convoquer dans ce délai l'assemblée générale extraordinaire à l'effet de décider");
  expect(text).not.toMatch(/associés se prononcent sur la dissolution anticipée dans les quatre mois/);
}

describe("C09 — base de connaissance capitaux-propres.yml : texte paraphrasé, signal à examiner", () => {
  it("réserve légale : un vingtième du bénéfice diminué des pertes antérieures, jusqu’au dixième du capital ; deux versions datées", async () => {
    const c = await loadCycle("capitaux-propres");
    const rl = c.thresholds.find(t => t.label === "Dotation à la réserve légale")!;
    expect(rl.value).toContain("SARL et sociétés par actions (C. com. art. L232-10)");
    expect(rl.value).toContain("un vingtième");
    expect(rl.value).toContain("diminué le cas échéant des pertes antérieures");
    expect(rl.value).toContain("lorsque la réserve atteint le dixième du capital social");
    expect(rl.value).not.toMatch(/5\s*%|bénéfice net/);
    expect(rl.caveat).toContain("du 21/09/2000 au 30/09/2025");
    expect(rl.caveat).toContain("depuis le 01/10/2025 (ord. n° 2025-229, art. 62");
    expect(rl.sourceIds).toEqual(["cc-capitaux-propres", "legifrance-code-commerce"]);
  });

  it("moitié du capital : signal « à examiner » par forme sociale, ni alerte de dissolution ni délai calculé", async () => {
    const c = await loadCycle("capitaux-propres");
    const half = c.thresholds.find(t => t.label === "Capitaux propres inférieurs à la moitié du capital social")!;
    for (const article of ["L223-42", "L225-248", "L227-1"]) expect(half.value).toContain(article);
    expectDistinctHalfCapitalProcedures(half.value, "en SARL (C. com. art. L223-42)");
    expect(half.caveat).toContain("11/03/2023 (loi n° 2023-171, art. 14)");
    expect(half.caveat).toContain("ni alerte de dissolution ni délai calculé");
    const ratio = c.ratios.find(r => r.name === "Pertes cumulées / Capital social")!;
    expect(ratio.alertThreshold).toContain("signal « à examiner »");
    expect(ratio.alertThreshold).toContain("L225-248 (SA, SCA ; SAS par le renvoi de l'art. L227-1)");
    expect(ratio.sourceIds).toEqual(["isa-520", "cc-capitaux-propres"]);
    const risk = c.risks.find(r => r.name === "Capitaux propres inférieurs aux seuils légaux menaçant la continuité")!;
    expect(risk.description).toContain("situation à examiner au regard de l'art. L223-42 (SARL) ou L225-248");
    expect(risk.description).toContain("Aucune de ces suites n'est conclue automatiquement.");
    expect(risk.sourceIds).toEqual(["isa-315", "isa-570", "cc-capitaux-propres"]);
    const all = JSON.stringify(c);
    for (const conclusion of ["alerte légale", "déclenchant une", "délais légaux", "5 % du bénéfice", "Alerter si"]) expect(all).not.toContain(conclusion);
    expect(validateCycle(c).errors).toEqual([]);
  });
});

describe("C09 — démonstration HOLDING-CP-1 : signal daté, chiffres inchangés", () => {
  const holding = SCENARIO_MAP["holding-invest"];
  const silo = holding.silos.find(s => s.siloId === "capitaux-propres")!;
  const finding = silo.findings.find(f => f.id === "HOLDING-CP-1")!;
  const texts = [finding.titre, finding.constat, finding.explication, ...finding.faisceau, finding.annotation ?? "", ...finding.preuve.map(p => p.detail)];

  it("garde les montants 32 000 / 500 000, la règle, la gravité et la ligne pointée", () => {
    expect(finding.mesure).toEqual({ constate: 32000, seuil: 250000, unite: "EUR", libelle: "capitaux propres vs 50 % du capital" });
    expect([finding.ruleId, finding.severity, finding.family, finding.cibleRowId]).toEqual(["R-CCOM-CAPITAL", "bloquant", "hardLaw", "hld-cp-total"]);
    const rows = Object.fromEntries(silo.statement.rows.map(r => [r.id, r]));
    expect(rows["hld-capital"].valeur).toBe(500000);
    expect(rows["hld-cp-total"]).toMatchObject({ valeur: 32000, flaggedBy: "HOLDING-CP-1" });
  });

  it("cite la version de L225-248 applicable au 31/12/2024 et ne conclut ni à une procédure manquée, ni à une dissolution, ni à un délai", () => {
    expect(finding.explication).toContain(L225_248_SINCE_2023);
    expect(finding.preuve.find(p => p.etape === "Règle")!.detail).toContain(L225_248_SINCE_2023);
    expect(finding.preuve.find(p => p.etape === "Résultat")!.detail).toBe("Signal à examiner — aucune conclusion juridique, aucune alerte de dissolution, aucun délai calculé");
    for (const conclusion of [/non engagée/, /dissolution judiciaire/, /alerte bloquante/, /4 mois/, /sous 2 ans/, /anomalie bloquante/, /seuil légal/]) {
      for (const text of texts) expect(text).not.toMatch(conclusion);
    }
    expect(holding.description).not.toMatch(/non engagée/);
    expect(holding.risquesDominants).not.toContain("Alerte capitaux propres (bloquant)");
  });
});

describe("C09 — démonstration DEMO-CP-1 (DEMO SA) : signal daté, chiffres et gravité inchangés", () => {
  const silo = DEMO_DOSSIER.silos.find(x => x.siloId === "capitaux-propres")!;
  const finding = silo.findings.find(f => f.id === "DEMO-CP-1")!;
  const texts = [finding.titre, finding.constat, finding.explication, ...finding.faisceau, finding.annotation ?? "", ...finding.preuve.map(p => p.detail)];

  it("garde les montants 220 000 / 500 000, la règle, la gravité « majeur » et la ligne pointée", () => {
    expect(finding.mesure).toEqual({ constate: 220000, seuil: 250000, unite: "EUR", libelle: "capitaux propres vs ½ capital" });
    expect([finding.ruleId, finding.severity, finding.family, finding.cibleRowId]).toEqual(["R-CCOM-CAPITAL", "majeur", "hardLaw", "cp-total"]);
    const rows = Object.fromEntries(silo.statement.rows.map(r => [r.id, r]));
    expect(rows["cp-capital"].valeur).toBe(500000);
    expect(rows["cp-total"]).toMatchObject({ valeur: 220000, flaggedBy: "DEMO-CP-1", severity: "majeur" });
  });

  it("cite la version de L225-248 applicable au 31/12/2024, sans procédure manquée, délai ni dissolution conclus", () => {
    expect(finding.explication).toContain(L225_248_SINCE_2023);
    expect(finding.preuve.find(p => p.etape === "Règle")!.detail).toContain(L225_248_SINCE_2023);
    for (const conclusion of [/sans trace de consultation/, /doit être consultée/, /quatre mois/, /sous deux exercices/, /aucune AG tracée/, /Perte de la moitié/]) {
      for (const text of texts) expect(text).not.toMatch(conclusion);
    }
  });
});

describe("C09 — registres de sources : C. com. art. L225-248 daté, formes sociales nommées", () => {
  it("SOURCES.CCOM_CAPITAL : version depuis le 11/03/2023, URL de l’article et accord avec le moteur C09", () => {
    const s = SOURCES.CCOM_CAPITAL;
    expect(s).toMatchObject({ ref: "C. com. art. L225-248", effectiveDate: "2023-03-11", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047292156" });
    expect(s.citation).toContain("dans les quatre mois qui suivent l'approbation des comptes ayant fait apparaître cette perte");
    expect(s.citation).not.toContain("dissolution éventuelle");
    const engine = articleVersion("L225-248", "2024-12-31")!;
    expect([engine.from, engine.url]).toEqual([s.effectiveDate, s.url]);
  });

  it("data/sources cc-capitaux-propres : L223-42, L225-248 et L227-1 nommés, texte à examiner sans alerte", async () => {
    const source = (await loadAllSources()).find(x => x.id === "cc-capitaux-propres")!;
    for (const article of ["L232-10", "L223-42", "L225-248", "L227-1"]) expect(source.label).toContain(article);
    expect(source.summary).toContain("signal « à examiner », sans alerte de dissolution ni délai calculé");
    expect(source.summary).not.toMatch(/Obligation de consultation|</);
    expect(source.note).toContain("11/03/2023 (loi n° 2023-171, art. 14)");
    expectDistinctHalfCapitalProcedures(source.note!, "en SARL (L223-42)");
  });
});
