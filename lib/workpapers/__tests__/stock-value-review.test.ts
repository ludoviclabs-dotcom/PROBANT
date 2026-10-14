import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { evaluateStocks, isLegacyValueReview, stampStockWork, stockOutcome, type StockResult, type StockValueReview } from "../stock-review";
import { assertStockBatch, buildStockFacts, StockSourceError, type StockSourceType } from "../stock-sources";
import { ST_CSV, stMapping, stPeriod, stScope, SYSTEM_ROWS, systemCsv, VALUE_ROWS, valueCsv } from "./stock-fixtures";

const actor = (scope: WorkpaperScope): Principal => ({ id: "preparer-st", grants: [{ scope, permissions: ["read", "prepare", "review", "download"] }] });
async function sources(texts: Partial<Record<StockSourceType, string>>) {
  const batches: ImportBatch[] = [];
  for (const type of ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger", "st_value"] as StockSourceType[]) {
    if (texts[type] === undefined) continue;
    const batch = await previewImport(new File([texts[type]!], type + ".csv", { type: "text/csv" }), stScope, stMapping(type, undefined, true), actor(stScope), type, "stocks.count");
    assertStockBatch(batch, stPeriod);
    batches.push({ ...batch, approval: { actorId: "preparer-st", at: "2027-01-10T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return batches;
}
function run(batches: ImportBatch[]): StockResult {
  const s = batches.find(b => b.document.documentType === "st_support")!;
  const work = stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "INSTR-INV")!.id } }, actor: actor(stScope), at: "2027-01-10T10:00:00.000Z" });
  return evaluateStocks(stScope, stPeriod, batches, "run-st", work);
}
const r7 = async () => run(await sources({ ...ST_CSV }));
const review = (r: StockResult): StockValueReview => { const v = r.valueReview!; if (isLegacyValueReview(v)) throw new Error("Revue 1.0.0 inattendue"); return v; };
const unit = (r: StockResult, id: string) => review(r).units.find(u => u.unitId === id)!;

describe("ST-1531 revue de valeur — hypothèses citées, écart indicatif, aucune dépréciation proposée", () => {
  it("REF-C : (8,00 − (6,00 − 0,50)) × 50 = 125,00 € d’écart indicatif contre 150,00 € comptabilisés — différence −25,00 € à apprécier", async () => {
    const r = await r7(), c = unit(r, "REF-C|ENTREPOT-NORD|");
    expect(c).toMatchObject({ status: "gap", cost: { unitCostCents: "800", basis: "reference" }, quantity: { theoretical: "5000", used: "5000", basis: "reconciled" }, economicGapCents: "12500", carryingCents: "40000",
      assetImpairmentCents: "12500", excessCents: "0", bookedCents: "15000", differenceCents: "-2500",
      hypothesis: { sellingPriceCents: "600", exitCostsCents: "50", currentValueCents: "550", pieceRef: "FV-901", kind: "Prix de vente postérieur à la clôture", fileName: "st_value.csv", row: 3 } });
    // The stated value (410,00) differs from 50 × 8,00: the judgment basis says so before any conclusion.
    expect(c.judgmentBasis).toContain("valeur théorique déclarée 410,00 € : écart de prix à expliquer avant de conclure");
    const e = r.exceptions.find(x => x.id === "VREV:REF-C|ENTREPOT-NORD|")!;
    expect(e).toMatchObject({ code: "VALUE_REVIEW_DIFFERENCE", amount: { kind: "known", value: { amount: "-25.00" } } });
    expect(e.message).toContain("l’outil ne propose ni ne comptabilise aucune dépréciation");
  });
  it("REF-A et REF-D au-dessus du coût : aucun écart ; l’ancienneté du dernier mouvement de REF-D (355 jours) n’entraîne aucun calcul", async () => {
    const r = await r7();
    // REF-A: 98 counted for 100 — the quantity is not reconciled, but a value above cost leaves no gap on either quantity.
    expect(unit(r, "REF-A|ENTREPOT-NORD|L1")).toMatchObject({ status: "no_gap", economicGapCents: "0", assetImpairmentCents: "0", differenceCents: "0",
      quantity: { theoretical: "10000", reconstituted: "9800", basis: "theoretical_unreconciled" }, alternative: { quantity: "9800", carryingCents: "117600", economicGapCents: "0" } });
    expect(unit(r, "REF-D|ENTREPOT-SUD|")).toMatchObject({ status: "no_gap", economicGapCents: "0", quantity: { basis: "reconciled" }, rotation: { lastMovement: "2026-01-10", days: 355 } });
    expect(r.exceptions.some(e => e.unitId === "REF-D|ENTREPOT-SUD|")).toBe(false);
  });
  it("dépréciation comptabilisée sans hypothèse (REF-E Nord) ; références non revues listées ; cadrage des comptes 39 : 150,00 − 170,00 = −20,00 €", async () => {
    const r = await r7();
    expect(unit(r, "REF-E|ENTREPOT-NORD|L7")).toMatchObject({ status: "booked_without_hypothesis", bookedCents: "2000" });
    expect(r.exceptions.find(e => e.id === "VHYP:REF-E|ENTREPOT-NORD|L7")).toMatchObject({ code: "VALUE_HYPOTHESIS_MISSING", amount: { kind: "unknown" } });
    expect(unit(r, "REF-H|ENTREPOT-NORD|").status).toBe("not_reviewed");
    expect(review(r).totals).toEqual({
      units: { tested: 8, complete: 3, partial: 0, incomplete: 0, bookedWithoutHypothesis: 1, notReviewed: 4, excluded: 6, ownershipMismatch: 1 },
      complete: { economicGapCents: "12500", assetImpairmentCents: "12500", excessCents: "0" }, partial: { economicGapCents: "0", assetImpairmentCents: "0", excessCents: "0" },
      // Not reviewed at documented cost: REF-B 120 × 0,30 + REF-E Sud 17 × 4,00 + REF-E Nord 20 × 4,00 = 184,00 ; REF-G (absent du théorique) et REF-H (sans coût) inconnus.
      notReviewedCostCents: "18400", notReviewedUnknown: 2,
      excluded: [{ group: "consignment_out", units: 1, statedValueCents: "36000", unknownValues: 0 }, { group: "excluded", units: 1, statedValueCents: "3000", unknownValues: 0 },
        { group: "in_transit", units: 1, statedValueCents: "45000", unknownValues: 0 }, { group: "ownership_mismatch", units: 1, statedValueCents: "180000", unknownValues: 0 },
        { group: "site_not_visited", units: 1, statedValueCents: "100000", unknownValues: 0 }, { group: "third_party", units: 1, statedValueCents: null, unknownValues: 1 },
        { group: "work_in_progress", units: 1, statedValueCents: "25000", unknownValues: 0 }],
      bookedCents: "17000", ledgerDepreciationCents: "15000", depreciationFramingDifferenceCents: "-2000" });
    expect(r.exceptions.find(e => e.id === "DEPR:TOTAL")).toMatchObject({ code: "DEPRECIATION_FRAMING_DIFFERENCE", amount: { kind: "known", value: { amount: "-20.00" } } });
    expect(review(r).units.some(u => u.unitId === "REF-F|ENTREPOT-NORD|")).toBe(false);
  });
  it("issue : 17 exceptions et incertitudes ; méthode et limites de la revue présentes ; sans hypothèses, la revue n’est pas lancée", async () => {
    const r = await r7();
    expect(r.exceptions).toHaveLength(17);
    expect(stockOutcome(r)).toBe("exceptions_detected");
    expect(r.method).toContain("l’outil ne propose ni ne comptabilise aucune dépréciation");
    expect(r.limitations.some(l => l.startsWith("Aucune dépréciation n’est déduite de la rotation"))).toBe(true);
    const { st_value: _v, ...rest } = ST_CSV; void _v;
    expect(run(await sources(rest)).valueReview).toBeNull();
  });
  it("hypothèse dans une autre unité ou coût absent : revue incomplète, jamais un écart nul", async () => {
    const carton = run(await sources({ ...ST_CSV, st_value: valueCsv(VALUE_ROWS.map(v => v[0] === "V02" ? [...v.slice(0, 3), "carton", ...v.slice(4)] : v)) }));
    expect(unit(carton, "REF-C|ENTREPOT-NORD|")).toMatchObject({ status: "unit_incompatible", economicGapCents: null, assetImpairmentCents: null });
    const { st_costs: _c, ...noCosts } = ST_CSV; void _c;
    const r = run(await sources(noCosts));
    expect(unit(r, "REF-C|ENTREPOT-NORD|")).toMatchObject({ status: "cost_missing", economicGapCents: null, assetImpairmentCents: null });
    expect(r.exceptions.find(e => e.id === "VREV:REF-C|ENTREPOT-NORD|")!.code).toBe("VALUE_REVIEW_INCOMPLETE");
  });
});

describe("ST-1532 qualification des hypothèses et des dépréciations", () => {
  const refused = async (type: StockSourceType, text: string, code: string) => {
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), stScope, stMapping(type, undefined, true), actor(stScope), type, "stocks.count");
    let error: unknown; try { assertStockBatch(batch, stPeriod); } catch (e) { error = e; }
    expect((error as StockSourceError).code).toBe(code);
    return (error as StockSourceError).locator;
  };
  it("justification trop courte, pièce absente, coûts de sortie absents, nature inconnue, dernier mouvement après la clôture", async () => {
    const row = (patch: Record<number, string>) => valueCsv([VALUE_ROWS[1].map((c, i) => patch[i] ?? c)]);
    expect(await refused("st_value", row({ 9: "Vu" }), "ST_VALUE_JUSTIFICATION_REQUIRED")).toMatchObject({ column: "Justification" });
    await refused("st_value", row({ 8: "" }), "ST_VALUE_PIECE_REQUIRED");
    await refused("st_value", row({ 5: "" }), "ST_VALUE_EXIT_COST_REQUIRED");
    await refused("st_value", row({ 7: "intuition" }), "ST_VALUE_KIND_INVALID");
    await refused("st_value", row({ 10: "2027-01-05" }), "ST_LAST_MOVEMENT_INVALID");
    await refused("st_system", systemCsv([[...SYSTEM_ROWS[0].slice(0, 12), ""]]), "ST_SYSTEM_DEPRECIATION_REQUIRED");
  });
  it("hypothèse sur une référence inconnue : refusée avec sa ligne, jamais ignorée", async () => {
    const batches = await sources({ ...ST_CSV, st_value: valueCsv([...VALUE_ROWS, ["V09", "REF-INCONNUE", "", "unite", "1,00", "0,00", "2027-01-05", "tarif", "T-1", "Tarif de la référence inconnue", "", ""]]) });
    let error: unknown; try { buildStockFacts(stScope, stPeriod, batches, "run-st"); } catch (e) { error = e; }
    expect(error).toMatchObject({ code: "ST_VALUE_REFERENCE_UNKNOWN", locator: { row: 5, value: "REF-INCONNUE" } });
  });
});
