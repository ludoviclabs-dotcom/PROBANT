import { describe, expect, it } from "vitest";
import { buildEquityFacts, EquitySourceError } from "../capitaux-sources";
import { evaluateEquity, stampEquityWork, type EquityResult, type EquityWork } from "../capitaux-review";
import { previewMinutes } from "../capitaux-minutes";
import { reviewEquity } from "../equity";
import { EQ_CSV, EQ_MINUTES, eqDraft, eqPeriod, eqPreparer, eqScope, eqSources, previewEq } from "./capitaux-fixtures";

const AT = "2025-04-02T10:00:00.000Z";
async function run(texts: Parameters<typeof eqSources>[0] = {}, types?: Parameters<typeof eqSources>[1], minutes?: Parameters<typeof eqSources>[2], draft = eqDraft()) {
  const imports = await eqSources(texts, types, minutes);
  const work = stampEquityWork({ scope: eqScope, period: eqPeriod, runId: "run-eq", imports, draft, actor: eqPreparer, at: AT });
  return { imports, work, result: evaluateEquity(eqScope, eqPeriod, imports, "run-eq", work) };
}
const eur = (amount: string) => ({ kind: "known", value: { amount, currency: "EUR" } });
const decision = (r: EquityResult, id: string) => r.decisions!.find(d => d.lineId === id)!;
const entry = (r: EquityResult, id: string) => r.entries.find(e => e.entryId === id)!;
const codes = (r: EquityResult) => r.exceptions.map(e => e.code + ":" + e.targetId).sort();
const refused = async (promise: Promise<unknown>) => { try { await promise; } catch (e) { return e; } throw new Error("Aucun refus"); };

describe("EQ-1101 recette : décisions, mouvements, transferts et tableau de variation", () => {
  it("distribution votée 30, comptabilisée 25, payée 25 : trois mesures distinctes, écart +5 après lecture du PV", async () => {
    const { result } = await run();
    const d = decision(result, "D1-DIV");
    expect(d).toMatchObject({ voted: { amount: "-30.00" }, booked: eur("-25.00"), payment: eur("25.00"), difference: eur("5.00"), status: "amount_divergent", entryIds: ["E04"], paymentIds: ["P01"] });
    expect(d.pv).toMatchObject({ status: "available", pieceRef: "PV-AGO-2024", page: 3, pageCount: 3 });
    expect(d.reading).toMatchObject({ status: "validated", page: 3, authorId: "preparer-eq" });
    expect(result.exceptions.find(e => e.code === "AMOUNT_DIVERGENT")).toMatchObject({ targetId: "D1-DIV", amount: eur("5.00") });
    expect(result.exceptions.find(e => e.code === "AMOUNT_DIVERGENT")!.message).toContain("comptabilisé -25.00 − voté -30.00 = 5.00 EUR");
  });
  it("transferts internes neutres : lignes équilibrées, aucun effet sur le total des capitaux propres", async () => {
    const { result } = await run();
    expect(result.transfers.map(t => [t.transferRef, t.entryIds, t.total.amount])).toEqual([["T1", ["E01", "E02", "E03"], "0.00"], ["T2", ["E05", "E06"], "0.00"]]);
    expect(result.totals).toMatchObject({ complete: true, opening: eur("301.00"), closing: eur("361.00"), expected: eur("361.00"), difference: eur("0.00"), movementsTotal: { amount: "60.00" }, transfersEffect: { amount: "0.00" } });
    expect(result.components.map(c => c.component + ":" + c.status)).toEqual(["capital:computed", "primes:computed", "reserve_legale:computed", "autres_reserves:computed", "report_a_nouveau:computed", "resultat:computed", "subventions_investissement:computed", "provisions_reglementees:computed", "autres_fonds_propres:excluded"]);
    expect(result.components.find(c => c.component === "resultat")).toMatchObject({ opening: { amount: "100.00" }, movements: { affectation_resultat: { amount: "-70.00" }, distribution: { amount: "-25.00" }, resultat_exercice: { amount: "50.00" } }, closing: { amount: "55.00" }, difference: eur("0.00") });
  });
  it("décision sans écriture, écriture sans décision, effet hors période, PV absent, décision postérieure", async () => {
    const { result } = await run();
    expect(decision(result, "D4-DIV")).toMatchObject({ status: "without_entry", booked: { kind: "not_applicable" } });
    expect(entry(result, "E09")).toMatchObject({ decisionStatus: "without_decision", effectStatus: "in_period" });
    expect(entry(result, "E07")).toMatchObject({ decisionStatus: "matched", effectStatus: "outside_period" });
    expect(decision(result, "D3-CAP")).toMatchObject({ status: "effect_outside_period", timing: "after_closing", pv: { status: "missing" }, reading: { status: "not_possible" } });
    expect(decision(result, "D5-DIV")).toMatchObject({ status: "not_expected", timing: "after_closing", reading: { status: "validated" } });
    expect(entry(result, "E10")).toMatchObject({ decisionStatus: "not_required" });
    expect(entry(result, "E13")).toMatchObject({ inScope: false, decisionStatus: "excluded" });
    expect(codes(result)).toEqual(["AMOUNT_DIVERGENT:D1-DIV", "DECISION_WITHOUT_ENTRY:D4-DIV", "EFFECT_OUTSIDE_PERIOD:E07", "EFFECT_OUTSIDE_PERIOD:E08", "ENTRY_WITHOUT_DECISION:E09", "PV_MISSING:D3-CAP", "PV_MISSING:D3-PRI", "STATEMENT_DIFFERENCE:resultat:cloture", "STATEMENT_DIFFERENCE:resultat:distribution"]);
    // The search never pairs E09 (−4) with D4-DIV (−5) on an amount.
    expect(decision(result, "D4-DIV").entryIds).toEqual([]);
  });
  it("tableau fourni ↔ reconstitué cellule par cellule ; carte des composantes et exclusion motivée", async () => {
    const { result } = await run();
    expect(result.statement.cells).toHaveLength(28);
    expect(result.statement.cells.filter(c => c.difference.kind === "known" && c.difference.value.amount !== "0.00").map(c => [c.component, c.column, c.difference])).toEqual([["resultat", "distribution", eur("-5.00")], ["resultat", "cloture", eur("-5.00")]]);
    expect(result.cartography.find(c => c.component === "ecarts_reevaluation")).toMatchObject({ status: "not_provided" });
    expect(result.cartography.find(c => c.component === "autres_fonds_propres")).toMatchObject({ status: "excluded", accounts: ["167400"] });
    expect(result.controls.map(c => [c.id, c.outcome, c.numerator, c.denominator])).toEqual([["bridge", "no_exception_detected", 8, 8], ["statement", "exceptions_detected", 28, 28], ["decisions", "exceptions_detected", 9, 9], ["entries", "exceptions_detected", 12, 12], ["minutes", "inconclusive", 8, 10]]);
  });
  it("aucun ratio ne vaut conclusion juridique : rapports exacts, conclusion juridique inconnue", async () => {
    const { result } = await run();
    expect(result.ratios.equityToCapital).toEqual({ kind: "ratio", numerator: "36100", denominator: "15000" });
    expect(result.ratios.reservesToCapital).toEqual({ kind: "ratio", numerator: "2600", denominator: "15000" });
    expect(result.legalConclusion.kind).toBe("unknown");
    expect(result.legalMeaning).toContain("Aucune règle juridique n’est implémentée");
    expect(result.conclusion).toBeNull();
  });
});

describe("EQ-1102 états inconnus, jamais nuls", () => {
  it("sans lecture validée : écritures rattachées mais comparaison inconnue, lecture à valider", async () => {
    const { result } = await run({}, undefined, undefined, eqDraft([]));
    expect(decision(result, "D1-DIV")).toMatchObject({ status: "reading_required", difference: { kind: "unknown" }, reading: { status: "pending" } });
    expect(result.exceptions.filter(e => e.code === "READING_PENDING")).toHaveLength(8);
    expect(result.controls.find(c => c.id === "minutes")).toMatchObject({ numerator: 0, denominator: 10, outcome: "inconclusive" });
  });
  it("capital et réserves incomplets : composantes inconnues, total et rapports non calculés", async () => {
    const balances = EQ_CSV.eq_balances.split("\n").filter(l => !/^B11;|^B03;|^B13;/.test(l)).join("\n");
    const { result } = await run({ eq_balances: balances });
    expect(result.components.find(c => c.component === "capital")).toMatchObject({ status: "incomplete", closing: null, expected: null, difference: { kind: "unknown" }, missing: ["Compte 101000 : clôture absente de la balance."] });
    expect(result.components.find(c => c.component === "reserve_legale")).toMatchObject({ status: "incomplete", opening: null, closing: null });
    expect(result.totals).toMatchObject({ complete: false, opening: { kind: "unknown" }, closing: { kind: "unknown" }, computedComponents: 6, inScopeComponents: 8 });
    expect(result.ratios.equityToCapital.kind).toBe("unknown");
    expect(result.ratios.reservesToCapital.kind).toBe("unknown");
    expect(result.exceptions.filter(e => e.code === "COMPONENT_INCOMPLETE").map(e => e.component)).toEqual(["capital", "reserve_legale"]);
    expect(result.controls.find(c => c.id === "bridge")).toMatchObject({ numerator: 6, denominator: 8, outcome: "inconclusive" });
    expect(result.statement.cells.find(c => c.component === "capital" && c.column === "cloture")).toMatchObject({ rebuilt: null, difference: { kind: "unknown" } });
  });
  it("registre des décisions absent : écritures non rapprochées, source requise, aucun « sans décision » inventé", async () => {
    const { result } = await run({}, ["eq_balances", "eq_entries"], [], eqDraft([]));
    expect(result.decisions).toBeNull();
    expect(entry(result, "E04").decisionStatus).toBe("source_missing");
    expect(entry(result, "E10").decisionStatus).toBe("not_required");
    expect(result.exceptions.find(e => e.code === "DECISIONS_SOURCE_MISSING")).toBeTruthy();
    expect(result.exceptions.some(e => e.code === "ENTRY_WITHOUT_DECISION")).toBe(false);
    expect(result.controls.map(c => [c.id, c.outcome])).toEqual([["bridge", "no_exception_detected"], ["statement", "inconclusive"], ["decisions", "inconclusive"], ["entries", "exceptions_detected"], ["minutes", "inconclusive"]]);
  });
  it("écart de pont expliqué à part : la clôture n’est jamais réécrite", async () => {
    const { result } = await run({ eq_balances: EQ_CSV.eq_balances.replace("B11;150.00", "B11;149.00") });
    expect(result.components.find(c => c.component === "capital")).toMatchObject({ expected: { amount: "150.00" }, closing: { amount: "149.00" }, difference: eur("-1.00") });
    expect(result.exceptions.find(e => e.code === "BRIDGE_DIFFERENCE")!.message).toContain("clôture 149.00 − (ouverture 100.00 + mouvements 50.00) = -1.00 EUR");
  });
  it("une cellule absente du tableau fourni n’est pas lue comme nulle", async () => {
    const variation = EQ_CSV.eq_variation.split("\n").filter(l => !l.includes(";subventions_investissement;subventions")).join("\n");
    const { result } = await run({ eq_variation: variation });
    expect(result.statement.cells.find(c => c.component === "subventions_investissement" && c.column === "subventions")).toMatchObject({ provided: null, rebuilt: { amount: "-3.00" }, difference: { kind: "unknown", reason: "Cellule absente du tableau fourni" } });
  });
});

describe("EQ-1103 qualification des sources et lectures citées", () => {
  it("refuse un transfert déséquilibré, une date d’effet absente, une composante inconnue, avec localisateur", async () => {
    expect(await refused(previewEq("eq_entries").then(b => buildEquityFacts(eqScope, eqPeriod, [{ ...b, approval: { actorId: "x", at: AT, previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } }], "r")))).toBeInstanceOf(EquitySourceError);
    const { assertEquityBatch } = await import("../capitaux-sources");
    const check = async (text: string) => { try { assertEquityBatch(await previewEq("eq_entries", text), eqPeriod); } catch (e) { return e as EquitySourceError; } throw new Error("accepté"); };
    expect(await check(EQ_CSV.eq_entries.replace("E03;68.00", "E03;67.00"))).toMatchObject({ code: "EQ_TRANSFER_UNBALANCED", locator: { row: 2, value: "T1" } });
    expect(await check(EQ_CSV.eq_entries.replace("augmentation_capital;2025-01-10;D3-CAP", "augmentation_capital;;D3-CAP"))).toMatchObject({ code: "EQ_EFFECT_DATE_REQUIRED", locator: { row: 8, column: "effet" } });
    expect(await check(EQ_CSV.eq_entries.replace("E09;-4.00;2024-11-15;106800;autres_reserves", "E09;-4.00;2024-11-15;106800;reserves"))).toMatchObject({ code: "EQ_COMPONENT_INVALID", locator: { row: 10, value: "reserves" } });
    expect(await check(EQ_CSV.eq_entries.replace("E10;50.00;2024-12-31;120000;resultat;resultat_exercice;2024-12-31;;", "E10;50.00;2024-12-31;120000;resultat;resultat_exercice;2024-12-31;;T9"))).toMatchObject({ code: "EQ_TRANSFER_NATURE_INVALID" });
  });
  it("un compte placé dans deux composantes selon la balance et les écritures est refusé", async () => {
    const e = await refused(run({ eq_entries: EQ_CSV.eq_entries.replace("E09;-4.00;2024-11-15;106800;autres_reserves", "E09;-4.00;2024-11-15;106800;reserves_statutaires") }));
    expect(e).toMatchObject({ code: "EQ_ACCOUNT_COMPONENT_INCONSISTENT", locator: { row: 10 } });
  });
  it("source requise manquante : balance ou écritures absentes bloquent", async () => {
    expect(await refused(run({}, ["eq_entries"], []))).toMatchObject({ code: "EQ_SOURCES_REQUIRED" });
  });
  it("une lecture humaine cite la pièce, la version et la page résolues par le serveur ; impossible sans PV", async () => {
    const { work, imports } = await run();
    const reading = work.readings.find(r => r.lineId === "D1-DIV")!;
    const pv = imports.find(b => b.document.logicalId === "eq_minutes:PV-AGO-2024")!;
    expect(reading).toMatchObject({ pieceRef: "PV-AGO-2024", page: 3, importId: pv.id, documentVersionId: pv.document.id, authorId: "preparer-eq", authoredAt: AT });
    expect(() => stampEquityWork({ scope: eqScope, period: eqPeriod, runId: "run-eq", imports, draft: eqDraft(["D3-CAP"]), actor: eqPreparer, at: AT })).toThrow("EQ_READING_PV_REQUIRED");
    const later = stampEquityWork({ scope: eqScope, period: eqPeriod, runId: "run-eq", imports, draft: eqDraft(), actor: { ...eqPreparer, id: "other" }, at: "2025-04-03T10:00:00.000Z", previous: work as EquityWork });
    expect(later.readings.find(r => r.lineId === "D1-DIV")).toMatchObject({ authorId: "preparer-eq", authoredAt: AT });
  });
  it("PV : signature PDF, PDF illisible et page hors document", async () => {
    const form = { pieceRef: "PV-X", title: "PV", documentDate: "2024-05-30" };
    await expect(previewMinutes(new File(["texte"], "pv.pdf", { type: "application/pdf" }), eqScope, form, eqPreparer)).rejects.toThrow("EQ_PDF_SIGNATURE_INVALID");
    await expect(previewMinutes(new File(["%PDF-1.7 corrompu"], "pv.pdf", { type: "application/pdf" }), eqScope, form, eqPreparer)).rejects.toThrow("EQ_PDF_INVALID");
    const decisions = EQ_CSV.eq_decisions.replace("PV-AGO-2024;3;3;Un dividende", "PV-AGO-2024;9;3;Un dividende");
    const { result } = await run({ eq_decisions: decisions }, undefined, undefined, eqDraft(EQ_MINUTES.length ? ["D1-AFF-RES"] : []));
    expect(decision(result, "D1-DIV")).toMatchObject({ pv: { status: "page_invalid", page: 9, pageCount: 3 }, status: "reading_required" });
  });
  it("reviewEquity reste réservé au contexte capitaux propres : refus hors procédure", () => {
    expect(() => reviewEquity({ context: { scope: eqScope, period: eqPeriod, purpose: "real", procedure: "fixed_assets.review" }, components: [], allocations: [], events: [], capitalComponentId: null, reserveComponentIds: null })).toThrow("EQUITY_CONTEXT_INVALID");
  });
});
