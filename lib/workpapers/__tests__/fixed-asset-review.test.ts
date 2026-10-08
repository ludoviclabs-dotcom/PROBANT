import { describe, expect, it } from "vitest";
import { compareFixedAssetRecalculations, evaluateFixedAssets, fixedAssetOutcome, stampFixedAssetWork, type FixedAssetResult } from "../fixed-asset-review";
import { buildFixedAssetFacts, FixedAssetSourceError } from "../fixed-asset-sources";
import { freezePopulation } from "../selection";
import { FA_CSV, faDraft, faPeriod, faPreparer, faScope, faSources, LINEAR_2024, previewFa } from "./fixed-asset-fixtures";

const RUN = "workpaper-fa-test";
async function evaluate(texts: Parameters<typeof faSources>[0] = {}, draft = faDraft(), types?: Parameters<typeof faSources>[1]) {
  const imports = await faSources(texts, types);
  const work = stampFixedAssetWork({ scope: faScope, period: faPeriod, runId: RUN, imports, draft, actor: faPreparer, at: "2025-04-02T10:00:00Z" });
  return { imports, work, result: evaluateFixedAssets(faScope, faPeriod, imports, RUN, work) };
}
const unit = (r: FixedAssetResult, id: string) => r.units.find(u => u.unitId === id)!;
const codes = (r: FixedAssetResult) => r.exceptions.map(e => e.code + ":" + (e.unitId ?? e.targetId)).sort();
async function refusal(promise: Promise<unknown>) { try { await promise; } catch (e) { return e instanceof FixedAssetSourceError ? e.code + (e.locator?.row ? "@" + e.locator.row : "") : (e as Error).message; } return "accepted"; }

describe("Immobilisations — recette Mission 10 sur sources qualifiées", () => {
  it("ouverture 100 + entrées 20 − sorties 10 ≠ clôture 109 : écart −1,00 expliqué arithmétiquement, sans correction de la clôture", async () => {
    const { result } = await evaluate();
    const gross = unit(result, "A-001").tables.gross;
    expect(gross.status).toBe("computed");
    if (gross.status !== "computed") return;
    expect([gross.opening.amount, gross.additions.amount, gross.disposals.amount, gross.expected.amount, gross.closing.amount]).toEqual(["100.00", "20.00", "10.00", "110.00", "109.00"]);
    expect(gross.difference).toEqual({ kind: "known", value: { amount: "-1.00", currency: "EUR" } });
    const e = result.exceptions.find(x => x.code === "MOVEMENT_DIFFERENCE")!;
    expect(e.message).toContain("clôture 109.00 − (ouverture 100.00 + entrées 20.00 − sorties 10.00");
    expect(e.amount).toEqual({ kind: "known", value: { amount: "-1.00", currency: "EUR" } });
    // The amortization bridge of the same asset is separate and concordant.
    expect(unit(result, "A-001").tables.amortization).toMatchObject({ status: "computed", expected: { amount: "40.00" }, difference: { kind: "known", value: { amount: "0.00" } } });
    expect(unit(result, "A-001").vnc).toEqual({ kind: "known", value: { amount: "69.00", currency: "EUR" } });
  });

  it("sortie partielle : pont produit, recalcul exclu avec motif ; pièces d’entrée et de sortie rapprochées", async () => {
    const { result } = await evaluate();
    const a = unit(result, "A-001");
    expect(a.recalculation).toMatchObject({ status: "excluded", reason: expect.stringContaining("Sortie partielle") });
    expect(a.supports.map(s => s.lineId + ":" + s.status)).toEqual(["L02:matched", "L03:matched"]);
  });

  it("recalcul documenté : entrées, formule, arrondi et provenance ; dotation comptabilisée 12 = recalculée 12", async () => {
    const { result } = await evaluate();
    const r = unit(result, "A-002").recalculation;
    expect(r).toMatchObject({ status: "computed", method: { id: "LIN-2024", version: "1" }, inputs: { cost: { amount: "60.00" }, residual: { amount: "0.00" }, base: { amount: "60.00" }, durationMonths: 60, prorataNumerator: "12", prorataDenominator: "12", inServiceDate: "2022-01-01", rounding: "half_up_cent" } });
    expect(r.recalculated).toEqual({ kind: "known", value: { amount: "12.00", currency: "EUR" } });
    expect(r.difference).toEqual({ kind: "known", value: { amount: "0.00", currency: "EUR" } });
    expect(r.proofIds.length).toBeGreaterThanOrEqual(3);
    expect(result.formula).toContain("arrondi au centime");
  });

  it("actif en cours avec mise en service après la clôture : non applicable, jamais une dotation nulle", async () => {
    const { result } = await evaluate();
    const r = unit(result, "A-004").recalculation;
    expect(unit(result, "A-004").status).toBe("in_progress");
    expect(r.status).toBe("not_applicable");
    expect(r.reason).toBe("Mise en service postérieure à clôture");
    expect(r.recalculated.kind).toBe("not_applicable");
  });

  it("résiduel incohérent et méthode absente : recalcul bloqué avec sa cause, comptés comme incertitudes", async () => {
    const { result } = await evaluate();
    expect(unit(result, "A-005").recalculation).toMatchObject({ status: "blocked", reason: expect.stringContaining("Valeur résiduelle 50.00 EUR supérieure au coût 45.00 EUR") });
    expect(unit(result, "A-003").recalculation).toMatchObject({ status: "blocked", reason: "SOURCE REQUISE : méthode absente des paramètres.", recalculated: { kind: "unknown" } });
    expect(codes(result)).toEqual(["MOVEMENT_DIFFERENCE:A-001", "RECALCULATION_BLOCKED:A-003", "RECALCULATION_BLOCKED:A-005"]);
    const recalc = result.controls.find(c => c.id === "recalculation")!;
    expect(recalc).toMatchObject({ numerator: 1, denominator: 3, outcome: "inconclusive" });
    expect(recalc.exclusions.map(e => e.id).sort()).toEqual(["A-001", "A-004", "T-001"]);
  });

  it("actif réévalué exclu explicitement ; cadrage registre → GL par compte, convention fa-sign-1, sans compensation", async () => {
    const { result } = await evaluate();
    expect(unit(result, "T-001")).toMatchObject({ inScope: false, exclusionReason: expect.stringContaining("réévalué"), tables: { gross: { status: "excluded" } } });
    expect(result.framing.rows.map(r => r.account + ":" + (r.difference.kind === "known" ? r.difference.value.amount : "?"))).toEqual(["2051:0.00", "211:0.00", "2154:0.00", "2315:0.00", "2805:0.00", "28154:0.00", "2905:0.00", "2915:0.00"]);
    expect(result.framing.rows.find(r => r.account === "28154")).toMatchObject({ register: { amount: "-82.00" }, ledger: { amount: "-82.00" }, table: "amortization" });
    expect(result.controls.map(c => c.id + ":" + c.outcome + ":" + c.numerator + "/" + c.denominator)).toEqual(["movements:exceptions_detected:15/15", "frame:no_exception_detected:8/8", "supports:no_exception_detected:3/3", "recalculation:inconclusive:1/3"]);
    expect(fixedAssetOutcome(result)).toBe("exceptions_detected");
  });

  it("pont par famille : sommes des actifs calculés avec leur dénominateur ; écarts non compensés visibles", async () => {
    const { result } = await evaluate();
    const mat = result.families.find(f => f.family === "Matériel industriel")!;
    expect(mat.tables.gross).toMatchObject({ inScopeUnits: 4, computedUnits: 4, complete: true, opening: { amount: "205.00" }, additions: { amount: "60.00" }, disposals: { amount: "10.00" }, closing: { amount: "254.00" }, expected: { amount: "255.00" }, difference: { amount: "-1.00" }, unitsWithDifference: 1, absoluteDifference: { amount: "1.00" } });
  });

  it("tableau absent du registre : incomplet, aucune valeur réputée nulle, contrôle non concluant", async () => {
    const register = FA_CSV.fa_register.split("\n").filter(l => !/;A-002;;Matériel industriel;depreciation;/.test(l)).join("\n");
    const { result } = await evaluate({ fa_register: register });
    expect(unit(result, "A-002").tables.impairment).toMatchObject({ status: "incomplete", missing: [expect.stringContaining("absent du registre")] });
    expect(unit(result, "A-002").vnc.kind).toBe("unknown");
    expect(result.controls.find(c => c.id === "movements")).toMatchObject({ numerator: 14, denominator: 15 });
    expect(result.exceptions.some(e => e.code === "TABLE_INCOMPLETE" && e.unitId === "A-002")).toBe(true);
  });

  it("pièce absente, montant et date de pièce différents : distingués, jamais confondus", async () => {
    const support = FA_CSV.fa_support.replace("FAC-001;20.00;2024-06-15", "FAC-001;21.00;2024-06-15").replace("CES-001;10.00;2024-09-30", "CES-001;10.00;2024-10-02").replace(/FAC-004;[^\n]*\n/, "");
    const { result } = await evaluate({ fa_support: support });
    expect(unit(result, "A-001").supports.map(s => s.status)).toEqual(["amount_difference", "date_difference"]);
    expect(unit(result, "A-001").supports[0].difference).toEqual({ kind: "known", value: { amount: "-1.00", currency: "EUR" } });
    expect(unit(result, "A-004").supports[0].status).toBe("missing");
    expect(result.controls.find(c => c.id === "supports")).toMatchObject({ numerator: 2, denominator: 3, outcome: "exceptions_detected" });
  });

  it("dotation comptabilisée différente du recalcul : écart signé comptabilisé − recalculé", async () => {
    const register = FA_CSV.fa_register.replace("L14;12.00", "L14;11.00").replace("L15;24.00", "L15;23.00");
    const ledger = FA_CSV.fa_ledger.replace("28154;-82.00", "28154;-81.00");
    const { result } = await evaluate({ fa_register: register, fa_ledger: ledger });
    expect(unit(result, "A-002").recalculation.difference).toEqual({ kind: "known", value: { amount: "-1.00", currency: "EUR" } });
    expect(result.exceptions.find(e => e.code === "RECALCULATION_DIFFERENCE")?.message).toContain("dotation comptabilisée 11.00 − dotation recalculée 12.00 = -1.00 EUR");
  });

  it("méthode non documentée, non applicable ou non couverte : bloquée ou exclue, jamais remplacée par un défaut", async () => {
    expect(unit((await evaluate({}, faDraft({ methods: [] }))).result, "A-002").recalculation.reason).toContain("« LIN-2024 » non documentée");
    expect(unit((await evaluate({}, faDraft({ methods: [{ ...LINEAR_2024, from: "2025-01-01", to: "2025-12-31" }] }))).result, "A-002").recalculation.reason).toContain("non applicable au 2024-12-31");
    expect(unit((await evaluate({}, faDraft({ methods: [{ ...LINEAR_2024, kind: "not_covered", label: "Unités d’œuvre" }] }))).result, "A-002").recalculation).toMatchObject({ status: "excluded", reason: expect.stringContaining("Unités d’œuvre") });
  });

  it("pièce de mise en service absente ou divergente : recalcul bloqué", async () => {
    const r1 = (await evaluate({ fa_support: FA_CSV.fa_support.replace(/MES-002[^\n]*\n/, "") })).result;
    expect(unit(r1, "A-002").recalculation.reason).toBe("SOURCE REQUISE : pièce de mise en service absente.");
    const r2 = (await evaluate({ fa_support: FA_CSV.fa_support.replace("MES-002;60.00;2022-01-01", "MES-002;60.00;2022-03-01") })).result;
    expect(unit(r2, "A-002").recalculation.reason).toContain("Date de mise en service divergente");
  });

  it("changement de paramètres : comparaison versionnée entre deux résultats, jamais un recalcul silencieux", async () => {
    const before = (await evaluate()).result;
    const after = (await evaluate({ fa_parameters: FA_CSV.fa_parameters.replace("P-002;0.00;2022-01-01;A-002;;LIN-2024;60", "P-002;0.00;2022-01-01;A-002;;LIN-2024;48") }, faDraft({ methods: [{ ...LINEAR_2024, version: "2", source: "Politique d’amortissement révisée (pièce synthétique)" }] }))).result;
    const rows = compareFixedAssetRecalculations(before, after);
    const a2 = rows.find(r => r.unitId === "A-002")!;
    expect(a2.before).toMatchObject({ method: { version: "1" }, inputs: { durationMonths: 60 }, recalculated: { value: { amount: "12.00" } } });
    expect(a2.after).toMatchObject({ method: { version: "2" }, inputs: { durationMonths: 48 }, recalculated: { value: { amount: "15.00" } } });
    expect(a2.change).toEqual({ kind: "known", value: { amount: "3.00", currency: "EUR" } });
    expect(after.exceptions.find(e => e.code === "RECALCULATION_DIFFERENCE")?.amount).toEqual({ kind: "known", value: { amount: "-3.00", currency: "EUR" } });
  });

  it("sources refusées avec localisateur : signe, période, tableau, reprise, actif inconnu, doublon d’ouverture", async () => {
    expect(await refusal(previewFa("fa_register", FA_CSV.fa_register.replace("L02;20.00", "L02;-20.00")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_MOVEMENT_SIGN_INVALID@3");
    expect(await refusal(previewFa("fa_register", FA_CSV.fa_register.replace("L02;20.00;2024-06-15", "L02;20.00;2025-01-15")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_MOVEMENT_OUTSIDE_PERIOD@3");
    expect(await refusal(previewFa("fa_register", FA_CSV.fa_register.replace("L06;12.00;2024-12-31;A-001;;Matériel industriel;amortissement;entree", "L06;12.00;2024-12-31;A-001;;Matériel industriel;amortissement;reprise")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_REVERSAL_TABLE_INVALID@7");
    expect(await refusal(previewFa("fa_register", FA_CSV.fa_register.replace("L12;60.00;2024-12-31;A-002;;Matériel industriel;brut;cloture", "L12;60.00;2024-12-31;A-002;;Matériel industriel;brut;ouverture")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_OPENING_DATE_REQUIRED@13");
    expect(await refusal(previewFa("fa_register", FA_CSV.fa_register.replace("L18;30.00;2024-01-01;A-003;;Logiciels;brut", "L18;30.00;2024-01-01;A-003;;Logiciels;stock")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_TABLE_INVALID@19");
    const unknownAsset = await faSources({ fa_support: FA_CSV.fa_support + "\nFAC-999;5.00;2024-05-01;Z-999;;acquisition;Pièce d’un autre registre" });
    expect(await refusal(Promise.resolve().then(() => buildFixedAssetFacts(faScope, faPeriod, unknownAsset, RUN)))).toBe("FA_ASSET_UNKNOWN@9");
    expect(await refusal(previewFa("fa_parameters", FA_CSV.fa_parameters.replace(";60;12;12\nP-003", ";60;13;12\nP-003")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_PRORATA_INVALID@2");
    expect(await refusal(previewFa("fa_parameters", FA_CSV.fa_parameters.replace("P-005;50.00", "P-005;-50.00")).then(b => import("../fixed-asset-sources").then(m => m.assertFixedAssetBatch(b, faPeriod))))).toBe("FA_RESIDUAL_NEGATIVE@5");
  });

  it("source manquante bloquante : registre ou GL absent → aucune évaluation", async () => {
    const imports = await faSources({}, ["fa_register", "fa_parameters", "fa_support"]);
    expect(() => buildFixedAssetFacts(faScope, faPeriod, imports, RUN)).toThrow(FixedAssetSourceError);
    expect(await refusal(Promise.resolve().then(() => buildFixedAssetFacts(faScope, faPeriod, imports, RUN)))).toBe("FA_SOURCES_REQUIRED");
  });

  it("population : un élément par actif / composant du registre, mesuré au brut de clôture", async () => {
    const imports = await faSources();
    const population = freezePopulation(faScope, imports, "asset", faPreparer);
    expect(population.items.map(i => i.id + ":" + i.amount.amount)).toEqual(["A-001:109.00", "A-002:60.00", "A-003:30.00", "A-004:40.00", "A-005:45.00", "T-001:500.00"]);
    expect(population.importIds).toHaveLength(4);
  });
});
