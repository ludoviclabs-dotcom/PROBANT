import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { evaluateStocks, stampStockWork, stockOutcome, type StockResult } from "../stock-review";
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
const unit = (r: StockResult, id: string) => r.valueReview!.units.find(u => u.unitId === id)!;

describe("ST-1531 revue de valeur — hypothèses citées, écart indicatif, aucune dépréciation proposée", () => {
  it("REF-C : (8,00 − (6,00 − 0,50)) × 50 = 125,00 € d’écart indicatif contre 150,00 € comptabilisés — différence −25,00 € à apprécier", async () => {
    const r = await r7(), c = unit(r, "REF-C|ENTREPOT-NORD|");
    expect(c).toMatchObject({ status: "gap", costCents: "800", unitGapCents: "250", systemQuantity: "5000", indicativeGapCents: "12500", bookedCents: "15000", differenceCents: "-2500",
      hypothesis: { sellingPriceCents: "600", exitCostsCents: "50", currentValueCents: "550", pieceRef: "FV-901", kind: "Prix de vente postérieur à la clôture", fileName: "st_value.csv", row: 3 } });
    const e = r.exceptions.find(x => x.id === "VREV:REF-C|ENTREPOT-NORD|")!;
    expect(e).toMatchObject({ code: "VALUE_REVIEW_DIFFERENCE", amount: { kind: "known", value: { amount: "-25.00" } } });
    expect(e.message).toContain("l’outil ne propose ni ne comptabilise aucune dépréciation");
  });
  it("REF-A et REF-D au-dessus du coût : aucun écart ; l’ancienneté du dernier mouvement de REF-D (355 jours) n’entraîne aucun calcul", async () => {
    const r = await r7();
    expect(unit(r, "REF-A|ENTREPOT-NORD|L1")).toMatchObject({ status: "no_gap", unitGapCents: "0", indicativeGapCents: "0", differenceCents: "0" });
    expect(unit(r, "REF-D|ENTREPOT-SUD|")).toMatchObject({ status: "no_gap", indicativeGapCents: "0", rotation: { lastMovement: "2026-01-10", days: 355 } });
    expect(r.exceptions.some(e => e.unitId === "REF-D|ENTREPOT-SUD|")).toBe(false);
  });
  it("dépréciation comptabilisée sans hypothèse (REF-E Nord) ; références non revues listées ; cadrage des comptes 39 : 150,00 − 170,00 = −20,00 €", async () => {
    const r = await r7();
    expect(unit(r, "REF-E|ENTREPOT-NORD|L7")).toMatchObject({ status: "booked_without_hypothesis", bookedCents: "2000" });
    expect(r.exceptions.find(e => e.id === "VHYP:REF-E|ENTREPOT-NORD|L7")).toMatchObject({ code: "VALUE_HYPOTHESIS_MISSING", amount: { kind: "unknown" } });
    expect(unit(r, "REF-H|ENTREPOT-NORD|").status).toBe("not_reviewed");
    expect(r.valueReview!.totals).toEqual({ reviewed: 3, notReviewed: 5, indicativeGapCents: "12500", bookedCents: "17000", ledgerDepreciationCents: "15000", depreciationFramingDifferenceCents: "-2000" });
    expect(r.exceptions.find(e => e.id === "DEPR:TOTAL")).toMatchObject({ code: "DEPRECIATION_FRAMING_DIFFERENCE", amount: { kind: "known", value: { amount: "-20.00" } } });
    expect(r.valueReview!.units.some(u => u.unitId === "REF-F|ENTREPOT-NORD|")).toBe(false);
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
    expect(unit(carton, "REF-C|ENTREPOT-NORD|")).toMatchObject({ status: "unit_incompatible", indicativeGapCents: null });
    const { st_costs: _c, ...noCosts } = ST_CSV; void _c;
    const r = run(await sources(noCosts));
    expect(unit(r, "REF-C|ENTREPOT-NORD|")).toMatchObject({ status: "cost_missing", indicativeGapCents: null });
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
