import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import type { WorkpaperRun, WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { evaluateStocks, isLegacyValueReview, stampStockWork, stockOutcome, stockResultSchema, STOCK_RESULT_SCHEMA_VERSION, type StockResult } from "../stock-review";
import { assertStockBatch, type StockSourceType } from "../stock-sources";
import { boundedComparison } from "../stock-value-review";
import { C08_COUNT_ROWS, C08_CSV, C08_SYSTEM_ROWS, legacyStockResult } from "./stock-c08-fixtures";
import { countCsv, stMapping, stPeriod, stScope, systemCsv } from "./stock-fixtures";
import { createStockHarness } from "./stock-harness";

/**
 * C08 recipe — value bounds, costs and scope of the stock sheet (rule 1.1.0). Every expected amount below is computed by
 * hand from the fixture (docs/recette/c08/RECETTE.md), never read back from the engine.
 */
const actor = (scope: WorkpaperScope): Principal => ({ id: "preparer-st", grants: [{ scope, permissions: ["read", "prepare", "review", "download"] }] });
async function sources(texts: Partial<Record<StockSourceType, string>>, valued = true) {
  const batches: ImportBatch[] = [];
  for (const type of ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger", "st_value"] as StockSourceType[]) {
    if (texts[type] === undefined) continue;
    const batch = await previewImport(new File([texts[type]!], type + ".csv", { type: "text/csv" }), stScope, stMapping(type, undefined, valued), actor(stScope), type, "stocks.count");
    assertStockBatch(batch, stPeriod);
    batches.push({ ...batch, approval: { actorId: "preparer-st", at: "2027-01-20T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return batches;
}
function run(batches: ImportBatch[]): StockResult {
  const s = batches.find(b => b.document.documentType === "st_support")!;
  const work = stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "INSTR-INV")!.id } }, actor: actor(stScope), at: "2027-01-20T10:00:00.000Z" });
  return evaluateStocks(stScope, stPeriod, batches, "run-c08", work);
}
const c08 = async (texts = C08_CSV) => run(await sources(texts));
type Review = Extract<NonNullable<StockResult["valueReview"]>, { totals: { excluded: unknown } }>;
const review = (r: StockResult) => { const v = r.valueReview!; if (isLegacyValueReview(v)) throw new Error("legacy"); return v as Review; };
const unit = (r: StockResult, ref: string, lot = "") => review(r).units.find(u => u.unitId === ref + "|ENTREPOT-NORD|" + lot)!;
const exception = (r: StockResult, id: string) => r.exceptions.find(e => e.id === id);

describe("C08 — bornage de la revue de valeur", () => {
  it("cas d’origine : coût 10 €, prix 2 €, sortie 5 €, 10 unités → comparaison 130 €, actif borné à 100 €, complément 30 €", () => {
    expect(boundedComparison(1000n, 1000n, 200n - 500n)).toEqual({ carrying: 10000n, economic: 13000n, asset: 10000n, excess: 3000n });
    // Value above cost: nothing; value between 0 and cost: never above the carrying amount.
    expect(boundedComparison(1000n, 1000n, 1200n)).toEqual({ carrying: 10000n, economic: 0n, asset: 0n, excess: 0n });
    expect(boundedComparison(1000n, 1000n, 0n)).toEqual({ carrying: 10000n, economic: 10000n, asset: 10000n, excess: 0n });
    // A free item (cost 0) with exit costs above its price: the whole economic gap lies beyond the asset.
    expect(boundedComparison(500n, 0n, -100n)).toEqual({ carrying: 0n, economic: 500n, asset: 0n, excess: 500n });
  });

  it("valeur négative (REF-N) : hypothèse −3,00 € conservée, actif 100,00 €, complément 30,00 € à qualifier, aucune provision", async () => {
    const r = await c08(), n = unit(r, "REF-N");
    expect(n).toMatchObject({ status: "gap", hypothesis: { sellingPriceCents: "200", exitCostsCents: "500", currentValueCents: "-300", pieceRef: "DEV-N", basis: "reference", uomLabel: "unite" },
      cost: { unitCostCents: "1000", basis: "reference", capacity: "declared", pieceRef: "FA-N" },
      quantity: { theoretical: "1000", counted: "1000", reconstituted: "1000", difference: "0", used: "1000", basis: "reconciled" },
      statedValueCents: "10000", carryingCents: "10000", economicGapCents: "13000", assetImpairmentCents: "10000", excessCents: "3000", alternative: null, bookedCents: "0", differenceCents: "10000" });
    expect(n.judgmentBasis).toContain("valeur négative conservée");
    expect(exception(r, "VREV:REF-N|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_REVIEW_DIFFERENCE", amount: { kind: "known", value: { amount: "100.00" } } });
    const excess = exception(r, "VEXC:REF-N|ENTREPOT-NORD|")!;
    expect(excess).toMatchObject({ code: "VALUE_EXCESS_TO_QUALIFY", amount: { kind: "unknown" } });
    expect(excess.message).toContain("Le complément de 30,00 € n’est ni une dépréciation ni une provision");
    expect(excess.message).toMatch(/321-1.*322-9.*321-6.*322-12/);
  });

  it("dépréciation déjà comptabilisée : REF-P (100,00 €) sans différence ; REF-N comptabilisée à 100,00 € garde son complément à qualifier", async () => {
    const r = await c08();
    expect(unit(r, "REF-P")).toMatchObject({ status: "gap", economicGapCents: "10000", carryingCents: "32000", assetImpairmentCents: "10000", excessCents: "0", bookedCents: "10000", differenceCents: "0" });
    expect(r.exceptions.filter(e => e.unitId === "REF-P|ENTREPOT-NORD|")).toEqual([]);
    const booked = await c08({ ...C08_CSV, st_system: systemCsv(C08_SYSTEM_ROWS.map(s => s[0] === "S01" ? [...s.slice(0, 12), "100,00"] : s)) });
    expect(unit(booked, "REF-N")).toMatchObject({ assetImpairmentCents: "10000", bookedCents: "10000", differenceCents: "0", excessCents: "3000" });
    expect(exception(booked, "VREV:REF-N|ENTREPOT-NORD|")).toBeUndefined();
    expect(exception(booked, "VEXC:REF-N|ENTREPOT-NORD|")?.code).toBe("VALUE_EXCESS_TO_QUALIFY");
  });

  it("coût absent (REF-M) et unité différente (REF-U) : revue incomplète, montants inconnus, jamais nuls", async () => {
    const r = await c08();
    expect(unit(r, "REF-M")).toMatchObject({ status: "cost_missing", cost: null, economicGapCents: null, assetImpairmentCents: null, differenceCents: null, hypothesis: { currentValueCents: "300" } });
    expect(exception(r, "VREV:REF-M|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_REVIEW_INCOMPLETE", amount: { kind: "unknown" } });
    expect(exception(r, "COST:REF-M|ENTREPOT-NORD|")).toMatchObject({ code: "COST_MISSING", amount: { kind: "unknown" } });
    expect(unit(r, "REF-U")).toMatchObject({ status: "unit_incompatible", hypothesis: { uomLabel: "carton" }, cost: { uomLabel: "unite" }, economicGapCents: null });
    expect(exception(r, "VREV:REF-U|ENTREPOT-NORD|")!.message).toContain("Hypothèse en carton, coût en unite, quantité en unite");
  });

  it("lot sans coût propre (REF-L L2) : repli sur la ligne de la référence, signalé ; le lot L1 garde son coût propre", async () => {
    const r = await c08();
    expect(unit(r, "REF-L", "L1")).toMatchObject({ status: "gap", cost: { unitCostCents: "350", basis: "lot", lot: "L1" }, hypothesis: { basis: "reference_fallback" }, economicGapCents: "500", assetImpairmentCents: "500", differenceCents: "0" });
    const l2 = unit(r, "REF-L", "L2");
    expect(l2).toMatchObject({ status: "gap", cost: { unitCostCents: "400", basis: "reference_fallback", lot: "", pieceRef: "FA-L" }, economicGapCents: "2000", carryingCents: "8000", assetImpairmentCents: "2000", differenceCents: "0" });
    expect(l2.judgmentBasis).toContain("repli : coût de la référence (ligne sans lot), aucun coût propre à ce lot");
    expect(r.valuation!.units.find(u => u.unitId === "REF-L|ENTREPOT-NORD|L2")!.cost).toMatchObject({ basis: "reference_fallback", capacity: "declared" });
    expect(r.valuation!.units.find(u => u.unitId === "REF-L|ENTREPOT-NORD|L1")!.cost).toMatchObject({ basis: "lot" });
  });

  it("quantité partielle (REF-Q compté 6 pour 10) : estimation partielle sur 10, alternative sur 6, aucune estimation complète silencieuse", async () => {
    const r = await c08(), q = unit(r, "REF-Q");
    expect(q).toMatchObject({ status: "gap_partial", quantity: { theoretical: "1000", counted: "600", reconstituted: "600", difference: "-400", used: "1000", basis: "theoretical_unreconciled", quantityStatus: "quantity_difference" },
      economicGapCents: "1000", carryingCents: "5000", assetImpairmentCents: "1000", excessCents: "0", alternative: { quantity: "600", carryingCents: "3000", economicGapCents: "600", assetImpairmentCents: "600", excessCents: "0" } });
    expect(exception(r, "VQTY:REF-Q|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_QUANTITY_UNRESOLVED", amount: { kind: "unknown" } });
    expect(exception(r, "VREV:REF-Q|ENTREPOT-NORD|")).toBeUndefined();
    // Not counted at all: still partial, with no alternative since the reconstituted quantity is unknown.
    const notCounted = await c08({ ...C08_CSV, st_count: countCsv(C08_COUNT_ROWS.filter(c => c[0] !== "C07")) });
    expect(unit(notCounted, "REF-Q")).toMatchObject({ status: "gap_partial", quantity: { counted: null, reconstituted: null, basis: "theoretical_unreconciled", quantityStatus: "not_counted" }, assetImpairmentCents: "1000", alternative: null });
  });

  it("stock de tiers valorisé (REF-T) : hors revue, porté dans les exclusions avec sa valeur, signalé au cadrage", async () => {
    const r = await c08();
    expect(review(r).units.some(u => u.unitId.startsWith("REF-T|"))).toBe(false);
    expect(review(r).totals.excluded).toEqual([{ group: "third_party", units: 1, statedValueCents: "30000", unknownValues: 0 }]);
    expect(exception(r, "NOTOWN:REF-T|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_ON_NOT_OWNED", amount: { kind: "known", value: { amount: "300.00" } } });
    expect(r.valuation!.totals.population).toEqual({ tested: 9, valued: 7, unknown: 2, notTested: 1, notOwnedValueCents: "30000" });
  });

  it("absence de revue (REF-R, REF-S) et totaux : populations connues, partiel séparé du complet, part non revue", async () => {
    const r = await c08();
    expect(unit(r, "REF-R")).toMatchObject({ status: "not_reviewed", hypothesis: null, economicGapCents: null, quantity: { basis: "reconciled" } });
    expect(unit(r, "REF-S").status).toBe("not_reviewed");
    expect(review(r).totals).toEqual({
      units: { tested: 9, complete: 4, partial: 1, incomplete: 2, bookedWithoutHypothesis: 0, notReviewed: 2, excluded: 1, ownershipMismatch: 0 },
      complete: { economicGapCents: "25500", assetImpairmentCents: "22500", excessCents: "3000" },
      partial: { economicGapCents: "1000", assetImpairmentCents: "1000", excessCents: "0" },
      notReviewedCostCents: "3500", notReviewedUnknown: 1, excluded: [{ group: "third_party", units: 1, statedValueCents: "30000", unknownValues: 0 }],
      bookedCents: "12500", ledgerDepreciationCents: "12500", depreciationFramingDifferenceCents: "0" });
    expect(r.exceptions.map(e => e.code).sort()).toEqual(["COST_MISSING", "COST_MISSING", "QUANTITY_DIFFERENCE", "VALUE_EXCESS_TO_QUALIFY", "VALUE_ON_NOT_OWNED", "VALUE_QUANTITY_UNRESOLVED", "VALUE_REVIEW_DIFFERENCE", "VALUE_REVIEW_INCOMPLETE", "VALUE_REVIEW_INCOMPLETE"]);
    expect(stockOutcome(r)).toBe("exceptions_detected");
    expect(r.schemaVersion).toBe(STOCK_RESULT_SCHEMA_VERSION);
  });

  it("dépréciation non mappée : perte de valeur calculée, dépréciation comptabilisée inconnue, aucune différence inventée", async () => {
    const r = await c08({ ...C08_CSV });
    const unmapped = run(await sources(C08_CSV, false).then(b => b.filter(x => x.document.documentType !== "st_ledger")));
    expect(unit(unmapped, "REF-N")).toMatchObject({ bookedCents: null, differenceCents: null, assetImpairmentCents: "10000", statedValueCents: null });
    expect(exception(unmapped, "VBKD:REF-N|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_REVIEW_INCOMPLETE", amount: { kind: "unknown" } });
    expect(review(unmapped).totals.excluded).toEqual([{ group: "third_party", units: 1, statedValueCents: null, unknownValues: 1 }]);
    expect(unit(r, "REF-N").bookedCents).toBe("0");
  });

  it("méthode et limites : coût déclaré non reconstitué, borne interne, complément jamais converti en provision", async () => {
    const r = await c08();
    expect(r.method).toContain("bornée à la valeur comptable de référence");
    expect(r.method).toContain("l’outil ne propose ni ne comptabilise aucune dépréciation ni provision");
    expect(r.limitations.some(l => l.startsWith("Coût déclaré par la pièce citée") && l.includes("ne reconstitue ni coût moyen pondéré"))).toBe(true);
    expect(r.limitations.some(l => l.startsWith("Le complément au-delà de la valeur comptable n’est jamais converti en provision"))).toBe(true);
    expect(r.valuation!.units.find(u => u.unitId === "REF-N|ENTREPOT-NORD|")!.cost!.method).toBe("Coût moyen pondéré déclaré (PCG art. 213-34, 214-26) — non reconstitué");
  });
});

describe("C08 — contrats de résultat : 1.0.0 lisible, 1.1.0 complet", () => {
  it("un résultat stocks-result-2 reste lisible ; le contrat courant exige la revue bornée et la base des coûts", async () => {
    const r = await c08(), legacy = legacyStockResult(r);
    const parsed = stockResultSchema.parse(legacy);
    expect(isLegacyValueReview(parsed.valueReview!)).toBe(true);
    expect(stockResultSchema.safeParse({ ...legacy, schemaVersion: STOCK_RESULT_SCHEMA_VERSION }).success).toBe(false);
    expect(stockResultSchema.safeParse({ ...r, valuation: legacy.valuation }).success).toBe(false);
    // An unbounded asset impairment is refused by the current contract.
    const tampered = { ...r, valueReview: { ...review(r), units: review(r).units.map(u => u.unitId.startsWith("REF-N|") ? { ...u, assetImpairmentCents: "13000", excessCents: "0", differenceCents: "13000" } : u) } };
    expect(stockResultSchema.safeParse(tampered).success).toBe(false);
  });

  it("feuille établie en 1.0.0 : consultable, toute commande refusée sauf la révision, qui adopte la règle 1.1.0", async () => {
    const h = createStockHarness(1_801_000_000, { valued: true });
    const sources = {
      st_count: await h.accept(await h.preview("st_count", C08_CSV.st_count)), st_system: await h.accept(await h.preview("st_system", C08_CSV.st_system)),
      st_support: await h.accept(await h.preview("st_support", C08_CSV.st_support)), st_costs: await h.accept(await h.preview("st_costs", C08_CSV.st_costs)),
      st_ledger: await h.accept(await h.preview("st_ledger", C08_CSV.st_ledger)), st_value: await h.accept(await h.preview("st_value", C08_CSV.st_value)) };
    const { run: executed } = await h.executed(sources);
    expect(executed.template).toMatchObject({ version: "1.1.0", rule: { version: "1.1.0" } });
    expect((executed.result!.result as StockResult).schemaVersion).toBe(STOCK_RESULT_SCHEMA_VERSION);
    // Shape the stored head as a sheet executed before C08: rule 1.0.0 and a stocks-result-2 result.
    const list = Object.values(h.db.state.versions).map(v => v[executed.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === Math.max(...list.map(x => x.version))), stored = list[index];
    const latest: WorkpaperRun = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
      result: { ...stored.result!, ruleVersion: "1.0.0", result: legacyStockResult(stored.result!.result as StockResult) } };
    list[index] = latest;
    const read = (await h.read()).body;
    expect((read.runs.find((r: WorkpaperRun) => r.id === executed.id).result.result as StockResult).schemaVersion).toBe("stocks-result-2");
    for (const command of [
      { command: "execute", id: executed.id, expectedVersion: latest.version },
      { command: "conclude", id: executed.id, expectedVersion: latest.version, text: "Conclusion sur un résultat 1.0.0" },
      { command: "note", id: executed.id, expectedVersion: latest.version, note: { id: "legacy-note", kind: "observation", text: "x", amount: { kind: "not_applicable", reason: "x" }, blocking: false } },
      { command: "submit", id: executed.id, expectedVersion: latest.version },
    ]) expect(await h.command(command), command.command).toMatchObject({ status: 409, body: { error: "ST_RULE_REPLACED_REVISION_REQUIRED" } });
    for (const command of [{ command: "review", id: executed.id, expectedVersion: latest.version, decision: "approved", text: "x", submittedHash: "a".repeat(64) }, { command: "lock", id: executed.id, expectedVersion: latest.version }])
      expect(await h.command(command, "reviewer"), command.command).toMatchObject({ status: 409, body: { error: "ST_RULE_REPLACED_REVISION_REQUIRED" } });
    let revised = await h.ok({ command: "revise", id: executed.id, expectedVersion: latest.version });
    expect(revised.template).toMatchObject({ version: "1.1.0", rule: { version: "1.1.0" } });
    revised = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: Object.values(sources).map(b => b!.id), draft: h.draft(sources) });
    revised = await h.ok({ command: "execute", id: revised.id, expectedVersion: revised.version });
    expect((revised.result!.result as StockResult).schemaVersion).toBe(STOCK_RESULT_SCHEMA_VERSION);
    // The 1.0.0 version and its evidence stay in the history of the root sheet.
    const history = (await h.read("preparer", "&operation=history&id=" + encodeURIComponent(executed.id))).body.history as WorkpaperRun[];
    expect(history.at(-1)).toMatchObject({ template: { rule: { version: "1.0.0" } } });
  });
});
