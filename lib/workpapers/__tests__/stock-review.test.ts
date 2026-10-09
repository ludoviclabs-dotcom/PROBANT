import { describe, expect, it } from "vitest";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { previewImport, type ImportBatch } from "../imports";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { evaluateStocks, formatQuantity, movementWindow, stampStockWork, stockOutcome, type StockDraft, type StockResult } from "../stock-review";
import { assertStockBatch, StockSourceError, type StockSourceType } from "../stock-sources";
import { COUNT_ROWS, countCsv, MOVEMENT_ROWS, movementCsv, ST_CSV, stMapping, stPeriod, stScope, SYSTEM_ROWS, systemCsv } from "./stock-fixtures";

const actor = (scope: WorkpaperScope): Principal => ({ id: "preparer-st", grants: [{ scope, permissions: ["read", "prepare", "review", "download"] }] });
/** Approved batches built through the real tabular parser and the stock row qualification. */
async function sources(texts: Partial<Record<StockSourceType, string>>, options: { coverage?: { from: string; to: string }; period?: AccountingPeriod; scope?: WorkpaperScope; valued?: boolean } = {}) {
  const period = options.period ?? stPeriod, scope = options.scope ?? stScope, batches: ImportBatch[] = [];
  for (const type of ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"] as StockSourceType[]) {
    const text = texts[type];
    if (text === undefined) continue;
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), scope, stMapping(type, options.coverage, options.valued), actor(scope), type, "stocks.count");
    assertStockBatch(batch, period);
    expect(batch.report.blocking).toEqual([]);
    batches.push({ ...batch, approval: { actorId: "preparer-st", at: "2027-01-10T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return batches;
}
/** Sub-lot 1 sources only: no cost list and no ledger, so no value is derived. */
const all = () => sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_movements: ST_CSV.st_movements, st_support: ST_CSV.st_support });
const instructions = (batches: ImportBatch[]) => { const s = batches.find(b => b.document.documentType === "st_support")!; return { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "INSTR-INV")!.id }; };
function run(batches: ImportBatch[], draft: Partial<StockDraft> = {}, period = stPeriod, scope = stScope): StockResult {
  const work = stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: instructions(batches), ...draft }, actor: actor(scope), at: "2027-01-10T10:00:00.000Z" });
  return evaluateStocks(scope, period, batches, "run-st", work);
}
const unit = (r: StockResult, id: string) => r.units.find(u => u.unitId === id)!;

describe("ST-1501 cas de référence — quantités calculées à la main", () => {
  it("98 unités comptées contre 100 au théorique : écart −2 unités, écart arithmétique non validé, valeur non établie", async () => {
    const r = run(await all()), a = unit(r, "REF-A|ENTREPOT-NORD|L1");
    expect(a).toMatchObject({ status: "quantity_difference", counted: "9800", expectedClosing: "9800", systemQuantity: "10000", difference: "-200", inScope: true, movements: { direction: "none", coverage: "not_needed" } });
    const e = r.exceptions.find(x => x.id === "QTY:REF-A|ENTREPOT-NORD|L1")!;
    expect(e.code).toBe("QUANTITY_DIFFERENCE");
    expect(e.message).toContain("écart −2 unite");
    // No monetary value is derived in the quantity sub-lot: the amount stays unknown, never zero.
    expect(e.amount).toEqual({ kind: "unknown", reason: "Écart de −2 unite — valeur non établie dans le sous-lot « quantités et mouvements »" });
  });
  it("comptage du 20/12 + entrées − sorties jusqu’à la clôture : 40 + 10 − 5 = 45, égal au théorique ; le mouvement du jour du comptage suit la convention citée", async () => {
    const batches = await all(), before = unit(run(batches), "REF-D|ENTREPOT-SUD|");
    expect(before).toMatchObject({ status: "matched", countDate: "2026-12-20", counted: "4000", movements: { direction: "forward", window: { from: "2026-12-21", to: "2026-12-31" }, coverage: "covered", inQty: "1000", outQty: "500" }, expectedClosing: "4500", difference: "0" });
    expect(before.movements.lines.find(l => l.key === "M004")!.inWindow).toBe(false);
    // Under the opposite convention, the sale of the count day is posterior: 40 + 10 − 5 − 3 = 42 against 45.
    const after = unit(run(batches, { sameDay: "after_count" }), "REF-D|ENTREPOT-SUD|");
    expect(after).toMatchObject({ status: "quantity_difference", movements: { window: { from: "2026-12-20", to: "2026-12-31" }, outQty: "800" }, expectedClosing: "4200", difference: "-300" });
  });
  it("total net compensé : REF-E +5 au Nord et −5 au Sud, net 0 pour 10 d’écarts bruts — signalé, jamais conclu sur le net", async () => {
    const r = run(await all());
    expect(unit(r, "REF-E|ENTREPOT-NORD|L7")).toMatchObject({ status: "quantity_difference", difference: "500" });
    expect(unit(r, "REF-E|ENTREPOT-SUD|L7")).toMatchObject({ status: "quantity_difference", expectedClosing: "1200", difference: "-500" });
    expect(r.references.find(x => x.reference === "REF-E")).toEqual({ reference: "REF-E", uom: "unite", units: 2, net: "0", gross: "1000", compensated: true });
    expect(r.exceptions.find(e => e.code === "NET_COMPENSATED")!.message).toContain("Total net 0 unite pour des écarts bruts de 10 unite");
  });
  it("cartons contre unités : bloqué, aucune conversion implicite ni écart calculé", async () => {
    const b = unit(run(await all()), "REF-B|ENTREPOT-NORD|");
    expect(b).toMatchObject({ status: "unit_incompatible", expectedClosing: null, difference: null, uoms: { count: ["carton"], system: "unite" } });
  });
  it("stock tiers, consignations, transit, en-cours et référence exclue : présentés à part avec leur motif, jamais ajoutés au stock propre", async () => {
    const r = run(await all());
    expect(unit(r, "REF-T|ENTREPOT-NORD|")).toMatchObject({ status: "excluded", category: "third_party", inScope: false });
    expect(unit(r, "REF-T|ENTREPOT-NORD|").reason).toContain("compté et présenté à part");
    expect(["REF-X|ENTREPOT-NORD|", "REF-Y|ENTREPOT-SUD|", "REF-Z|ENTREPOT-NORD|", "REF-K|ENTREPOT-SUD|"].map(id => [unit(r, id).category, unit(r, id).inScope])).toEqual([["work_in_progress", false], ["in_transit", false], ["excluded", false], ["consignment_out", false]]);
    expect(unit(r, "REF-Z|ENTREPOT-NORD|").reason).toContain("Article retiré du catalogue");
    // Counted as own but carried as received consignment: an ownership discrepancy, the quantity is not tested.
    expect(unit(r, "REF-F|ENTREPOT-NORD|")).toMatchObject({ status: "ownership_mismatch", countCategories: ["own"], systemCategory: "consignment_in", difference: null });
  });
  it("référence non comptée, comptée hors théorique et site non visité : inconnus, jamais nuls", async () => {
    const r = run(await all());
    expect(unit(r, "REF-H|ENTREPOT-NORD|")).toMatchObject({ status: "not_counted", counted: null, difference: null, inScope: true });
    expect(unit(r, "REF-G|ENTREPOT-NORD|")).toMatchObject({ status: "not_in_system", expectedClosing: "700", systemQuantity: null, difference: null });
    expect(unit(r, "REF-W|DEPOT-OUEST|")).toMatchObject({ status: "site_not_visited", inScope: false });
    expect(r.sites.find(s => s.site === "DEPOT-OUEST")).toMatchObject({ visited: false, countDate: null });
    expect(r.exceptions.find(e => e.code === "SITE_NOT_VISITED")!.message).toContain("NEP 501 § 06");
  });
  it("issue et décompte : 9 exceptions ou incertitudes, exceptions détectées ; aucune valeur monétaire dans le résultat", async () => {
    const r = run(await all());
    expect(r.exceptions.map(e => e.code).sort()).toEqual(["NET_COMPENSATED", "NOT_COUNTED", "NOT_IN_SYSTEM", "OWNERSHIP_MISMATCH", "QUANTITY_DIFFERENCE", "QUANTITY_DIFFERENCE", "QUANTITY_DIFFERENCE", "SITE_NOT_VISITED", "UNIT_INCOMPATIBLE"]);
    expect(stockOutcome(r)).toBe("exceptions_detected");
    expect(r.totals).toMatchObject({ matched: 2, quantity_difference: 3, not_in_system: 1, ownership_mismatch: 1, unit_incompatible: 1, not_counted: 1, excluded: 5, site_not_visited: 1, movements_incomplete: 0 });
    expect(r.exceptions.every(e => e.amount.kind === "unknown")).toBe(true);
  });
});

describe("ST-1502 mouvements, dates et unités", () => {
  it("inventaire décalé sans mouvements : non concluant (journal absent), la clôture reste inconnue", async () => {
    const r = run(await sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_support: ST_CSV.st_support }));
    expect(unit(r, "REF-D|ENTREPOT-SUD|")).toMatchObject({ status: "movements_incomplete", movements: { coverage: "missing_journal", inQty: null }, expectedClosing: null, difference: null });
    expect(r.exceptions.find(e => e.id === "MVT:REF-D|ENTREPOT-SUD|")!.code).toBe("MOVEMENTS_INCOMPLETE");
    // The north warehouse, counted at closing, needs no movement: its quantity test still runs.
    expect(unit(r, "REF-A|ENTREPOT-NORD|L1").status).toBe("quantity_difference");
  });
  it("journal ne couvrant qu’une partie de la période intercalaire : non concluant, jamais complété", async () => {
    const rows = MOVEMENT_ROWS.filter(m => m[6] >= "2026-12-25");
    const r = run(await sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_support: ST_CSV.st_support, st_movements: movementCsv(rows) }, { coverage: { from: "2026-12-25", to: "2026-12-31" } }));
    expect(unit(r, "REF-D|ENTREPOT-SUD|").movements.coverage).toBe("not_covered");
    expect(unit(r, "REF-D|ENTREPOT-SUD|").reason).toContain("n’est pas entièrement couverte");
  });
  it("seulement des incertitudes : feuille non concluante", async () => {
    const count = countCsv([["C1", "REF-D", "ENTREPOT-SUD", "", "unite", "40", "2026-12-20", "propre", "", ""]]), system = systemCsv([["S1", "REF-D", "ENTREPOT-SUD", "", "unite", "45", "2026-12-31", "propre", "", ""]]);
    const r = run(await sources({ st_count: count, st_system: system, st_support: ST_CSV.st_support }));
    expect(stockOutcome(r)).toBe("inconclusive");
  });
  it("comptage postérieur à la clôture : clôture = compté − entrées + sorties entre la clôture et le comptage", async () => {
    const count = countCsv([["C1", "REF-P", "MAGASIN-EST", "", "kg", "100,5", "2027-01-05", "propre", "", "Farine"]]);
    const system = systemCsv([["S1", "REF-P", "MAGASIN-EST", "", "kg", "110", "2026-12-31", "propre", "", "Farine"]]);
    const moves = movementCsv([["M1", "REF-P", "MAGASIN-EST", "", "kg", "20", "2027-01-02", "entree", "BR-9", ""], ["M2", "REF-P", "MAGASIN-EST", "", "kg", "30,25", "2027-01-04", "sortie", "BL-9", ""], ["M3", "REF-P", "MAGASIN-EST", "", "kg", "4", "2027-01-05", "sortie", "BL-10", "Jour du comptage"]]);
    const batches = await sources({ st_count: count, st_system: system, st_movements: moves, st_support: ST_CSV.st_support }, { coverage: { from: "2027-01-01", to: "2027-01-05" } });
    // before_count: the sale of 5 January preceded the count, so it is reversed too: 100,5 − 20 + 30,25 + 4 = 114,75.
    expect(unit(run(batches), "REF-P|MAGASIN-EST|")).toMatchObject({ movements: { direction: "backward", window: { from: "2027-01-01", to: "2027-01-05" } }, expectedClosing: "11475", difference: "475", status: "quantity_difference" });
    expect(unit(run(batches, { sameDay: "after_count" }), "REF-P|MAGASIN-EST|")).toMatchObject({ movements: { window: { from: "2027-01-01", to: "2027-01-04" } }, expectedClosing: "11075", difference: "75" });
    expect(formatQuantity("11475", "kg")).toBe("114,75 kg");
  });
  it("fenêtre de mouvements : bornes exactes selon le sens et la convention", () => {
    expect(movementWindow("2026-12-31", "2026-12-31", "before_count")).toEqual({ direction: "forward", window: null });
    expect(movementWindow("2026-12-31", "2026-12-31", "after_count")).toEqual({ direction: "forward", window: { from: "2026-12-31", to: "2026-12-31" } });
    expect(movementWindow("2027-01-01", "2026-12-31", "after_count")).toEqual({ direction: "backward", window: null });
    expect(movementWindow("2027-01-01", "2026-12-31", "before_count")).toEqual({ direction: "backward", window: { from: "2027-01-01", to: "2027-01-01" } });
  });
  it("mouvements dans une autre unité que le comptage : bloqué", async () => {
    const moves = movementCsv([["M1", "REF-D", "ENTREPOT-SUD", "", "carton", "1", "2026-12-22", "entree", "BR-1", ""]]);
    const r = run(await sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_support: ST_CSV.st_support, st_movements: moves }));
    expect(unit(r, "REF-D|ENTREPOT-SUD|")).toMatchObject({ status: "unit_incompatible", uoms: { movements: ["carton"] } });
  });
  it("mouvement d’une référence absente du comptage et du théorique : aucune unité de test créée, le gel n’échoue pas", async () => {
    const moves = movementCsv([...MOVEMENT_ROWS, ["M9", "REF-Q", "ENTREPOT-NORD", "L9", "unite", "4", "2026-12-23", "sortie", "BL-9", "Hors population"], ["M10", "REF-Q", "SITE-INCONNU", "", "unite", "2", "2026-12-23", "entree", "BR-9", ""]]);
    const base = run(await all()), r = run(await sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_support: ST_CSV.st_support, st_movements: moves }));
    expect(r.units.map(u => u.unitId)).toEqual(base.units.map(u => u.unitId));
    expect(r.units.some(u => u.reference === "REF-Q")).toBe(false);
    expect(r.sites.map(s => s.site)).toEqual(base.sites.map(s => s.site));
  });
});

describe("ST-1503 qualification des sources (refus avec localisation)", () => {
  const refused = async (type: StockSourceType, text: string, code: string, period = stPeriod) => {
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), stScope, stMapping(type), actor(stScope), type, "stocks.count");
    let error: unknown; try { assertStockBatch(batch, period); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(StockSourceError);
    expect((error as StockSourceError).code).toBe(code);
    return (error as StockSourceError).locator;
  };
  it("statut inconnu, quantité négative, site à deux dates, unité mélangée, séparateur réservé", async () => {
    expect(await refused("st_count", countCsv([["C1", "REF-A", "N", "", "unite", "1", "2026-12-31", "louee", "", ""]]), "ST_CATEGORY_INVALID")).toMatchObject({ row: 2, column: "Statut", value: "louee" });
    await refused("st_count", countCsv([["C1", "REF-A", "N", "", "unite", "-1", "2026-12-31", "propre", "", ""]]), "ST_QUANTITY_NEGATIVE");
    await refused("st_count", countCsv([["C1", "REF-A", "N", "", "unite", "1", "2026-12-30", "propre", "", ""], ["C2", "REF-B", "N", "", "unite", "1", "2026-12-31", "propre", "", ""]]), "ST_SITE_COUNT_DATE_MIXED");
    await refused("st_count", countCsv([["C1", "REF-A", "N", "", "unite", "1", "2026-12-31", "propre", "", ""], ["C2", "REF-A", "N", "", "carton", "1", "2026-12-31", "propre", "", ""]]), "ST_COUNT_UNIT_MIXED");
    await refused("st_count", countCsv([["C1", "REF|A", "N", "", "unite", "1", "2026-12-31", "propre", "", ""]]), "ST_REFERENCE_REQUIRED");
  });
  it("théorique hors date de clôture, en double, exclusion sans motif ; mouvement hors période déclarée", async () => {
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-30", "propre", "", ""]]), "ST_SYSTEM_DATE_CLOSING_REQUIRED");
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-31", "propre", "", ""], ["S2", "REF-A", "N", "", "unite", "2", "2026-12-31", "propre", "", ""]]), "ST_SYSTEM_UNIT_DUPLICATE");
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-31", "exclue", "", ""]]), "ST_EXCLUSION_REASON_REQUIRED");
    await refused("st_movements", movementCsv([["M1", "REF-A", "N", "", "unite", "1", "2026-12-19", "entree", "", ""]]), "ST_MOVEMENT_OUTSIDE_COVERAGE");
    await refused("st_movements", movementCsv([["M1", "REF-A", "N", "", "unite", "1", "2026-12-22", "retour", "", ""]]), "ST_DIRECTION_INVALID");
  });
  it("comptages et théorique strictement identiques : aucune exception", async () => {
    const r = run(await sources({ st_count: countCsv(COUNT_ROWS.slice(2, 3)), st_system: systemCsv(SYSTEM_ROWS.slice(2, 3)), st_support: ST_CSV.st_support }));
    expect(stockOutcome(r)).toBe("no_exception_detected");
    expect(r.units).toHaveLength(1);
  });
  it("la citation des instructions doit désigner une source figée", async () => {
    const batches = await all();
    expect(() => stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: { documentId: "source-inconnue" } }, actor: actor(stScope), at: "2027-01-10T10:00:00.000Z" })).toThrow("ST_CITATION_SOURCE_REQUIRED");
    const support = batches.find(b => b.document.documentType === "st_support")!;
    expect(() => stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: { documentId: support.document.id, rowId: "row-inconnue" } }, actor: actor(stScope), at: "2027-01-10T10:00:00.000Z" })).toThrow("ST_CITATION_ROW_INVALID");
  });
});
