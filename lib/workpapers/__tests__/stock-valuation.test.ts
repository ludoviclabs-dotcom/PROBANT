import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { evaluateStocks, formatCents, stampStockWork, stockOutcome, type StockResult } from "../stock-review";
import { assertStockBatch, StockSourceError, type StockSourceType } from "../stock-sources";
import { valueOf } from "../stock-valuation";
import { COST_ROWS, costCsv, LEDGER_ROWS, ledgerCsv, ST_CSV, stMapping, stPeriod, stScope, SYSTEM_ROWS, systemCsv } from "./stock-fixtures";

const actor = (scope: WorkpaperScope): Principal => ({ id: "preparer-st", grants: [{ scope, permissions: ["read", "prepare", "review", "download"] }] });
async function sources(texts: Partial<Record<StockSourceType, string>>, valued = true) {
  const batches: ImportBatch[] = [];
  for (const type of ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"] as StockSourceType[]) {
    if (texts[type] === undefined) continue;
    const batch = await previewImport(new File([texts[type]!], type + ".csv", { type: "text/csv" }), stScope, stMapping(type, undefined, valued), actor(stScope), type, "stocks.count");
    assertStockBatch(batch, stPeriod);
    expect(batch.report.blocking).toEqual([]);
    batches.push({ ...batch, approval: { actorId: "preparer-st", at: "2027-01-10T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return batches;
}
function run(batches: ImportBatch[]): StockResult {
  const s = batches.find(b => b.document.documentType === "st_support")!;
  const work = stampStockWork({ imports: batches, draft: { sameDay: "before_count", instructions: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "INSTR-INV")!.id } }, actor: actor(stScope), at: "2027-01-10T10:00:00.000Z" });
  return evaluateStocks(stScope, stPeriod, batches, "run-st", work);
}
const valued = () => sources({ ...ST_CSV });
const v = (r: StockResult, id: string) => r.valuation!.units.find(u => u.unitId === id)!;

describe("ST-1521 coûts — cas de référence calculés à la main", () => {
  it("98 comptées contre 100 au coût documenté de 12,00 € : écart potentiel −24,00 €, montant connu sur la note, jamais une anomalie validée", async () => {
    const r = run(await valued()), a = v(r, "REF-A|ENTREPOT-NORD|L1");
    expect(a).toMatchObject({ costStatus: "documented", cost: { unitCostCents: "1200", pieceRef: "FA-501", fileName: "st_costs.csv", row: 2 }, quantityDifferenceValueCents: "-2400", expectedValueCents: "117600", recalculatedSystemValueCents: "120000", systemValueCents: "120000", priceDifferenceCents: "0" });
    const e = r.exceptions.find(x => x.id === "QTY:REF-A|ENTREPOT-NORD|L1")!;
    expect(e.amount).toEqual({ kind: "known", value: { amount: "-24.00", currency: "EUR" } });
    expect(e.message).toContain("Valorisé −24,00 € au coût documenté de 12,00 € (Coût moyen pondéré (PCG art. 213-34), FA-501) : écart potentiel.");
    expect(e.message).toContain("non validé comme anomalie");
  });
  it("écart de prix : REF-C 410,00 € au théorique pour 50 × 8,00 € = 400,00 € — écart +10,00 €", async () => {
    const r = run(await valued());
    expect(v(r, "REF-C|ENTREPOT-NORD|")).toMatchObject({ recalculatedSystemValueCents: "40000", systemValueCents: "41000", priceDifferenceCents: "1000" });
    expect(r.exceptions.find(e => e.id === "PRICE:REF-C|ENTREPOT-NORD|")).toMatchObject({ code: "PRICE_DIFFERENCE", amount: { kind: "known", value: { amount: "10.00" } } });
    // Cartons cannot be valued, but the system line (in units, like the cost) can still be checked: 120 × 0,30 = 36,00.
    expect(v(r, "REF-B|ENTREPOT-NORD|")).toMatchObject({ costStatus: "documented", expectedValueCents: null, quantityDifferenceValueCents: null, priceDifferenceCents: "0" });
  });
  it("total net compensé en valeur : −24 + 20 − 20 = −24,00 € pour 64,00 € d’écarts bruts ; REF-E net 0 pour 40,00 € bruts", async () => {
    const r = run(await valued());
    expect(r.valuation!.totals).toMatchObject({ netQuantityDifferenceCents: "-2400", grossQuantityDifferenceCents: "6400", compensated: true, valuedDifferences: 3 });
    expect(r.valuation!.references.find(x => x.reference === "REF-E")).toEqual({ reference: "REF-E", net: "0", gross: "4000", compensated: true, units: 2 });
    expect(r.exceptions.find(e => e.code === "NET_COMPENSATED_VALUE")!.message).toContain("Total net des écarts valorisés −24,00 € pour des écarts bruts de 64,00 €");
  });
  it("coût absent : valeur inconnue (jamais nulle), incertitude ; comptée hors théorique : valeur reconstituée seulement", async () => {
    const r = run(await valued());
    expect(v(r, "REF-H|ENTREPOT-NORD|")).toMatchObject({ costStatus: "missing", cost: null, priceDifferenceCents: null });
    expect(r.exceptions.find(e => e.id === "COST:REF-H|ENTREPOT-NORD|")).toMatchObject({ code: "COST_MISSING", amount: { kind: "unknown" } });
    expect(v(r, "REF-G|ENTREPOT-NORD|")).toMatchObject({ expectedValueCents: "14000", quantityDifferenceValueCents: null, systemValueCents: null });
  });
  it("coût exprimé dans une autre unité : bloqué, sans conversion", async () => {
    const costs = costCsv(COST_ROWS.map(c => c[0] === "K01" ? [...c.slice(0, 3), "carton", ...c.slice(4)] : c));
    const r = run(await sources({ ...ST_CSV, st_costs: costs }));
    expect(v(r, "REF-A|ENTREPOT-NORD|L1")).toMatchObject({ costStatus: "unit_incompatible", quantityDifferenceValueCents: null });
    expect(r.exceptions.find(e => e.id === "QTY:REF-A|ENTREPOT-NORD|L1")!.amount.kind).toBe("unknown");
    expect(r.exceptions.some(e => e.code === "COST_UNIT_INCOMPATIBLE")).toBe(true);
  });
  it("coût d’une référence sans lot appliqué à ses lots ; jamais le coût d’une autre référence", async () => {
    const costs = costCsv(COST_ROWS.map(c => c[0] === "K05" ? [c[0], c[1], "", ...c.slice(3)] : c));
    const r = run(await sources({ ...ST_CSV, st_costs: costs }));
    expect(v(r, "REF-E|ENTREPOT-SUD|L7").cost).toMatchObject({ lot: "", unitCostCents: "400" });
    expect(valueOf(-250n, 333n)).toBe(-833n);
    expect(valueOf(250n, 333n)).toBe(833n);
  });
});

describe("ST-1522 cadrage état valorisé ↔ grand livre et propriété", () => {
  it("371 et 331 cadrés, 321 écart +10,00 € ; 397 réservé à la revue de valeur ; consignation reçue valorisée exclue du cadrage et signalée", async () => {
    const r = run(await valued()), acc = (a: string) => r.valuation!.accounts.find(x => x.account === a)!;
    expect(acc("371000")).toMatchObject({ systemValueCents: "293400", ledgerCents: "293400", differenceCents: "0", status: "framed", notOwnedCents: "180000" });
    expect(acc("321000")).toMatchObject({ systemValueCents: "109000", ledgerCents: "110000", differenceCents: "1000", status: "difference" });
    expect(acc("331000")).toMatchObject({ status: "framed", differenceCents: "0" });
    expect(r.valuation!.depreciation).toEqual([expect.objectContaining({ account: "397000", ledgerCents: "-15000" })]);
    expect(r.exceptions.find(e => e.id === "FRAME:321000")).toMatchObject({ code: "FRAMING_DIFFERENCE", amount: { kind: "known", value: { amount: "10.00" } } });
    expect(r.exceptions.find(e => e.id === "NOTOWN:REF-F|ENTREPOT-NORD|")).toMatchObject({ code: "VALUE_ON_NOT_OWNED", amount: { kind: "known", value: { amount: "1800.00" } } });
    expect(r.valuation!.totals).toMatchObject({ systemValueCents: "427400", ledgerCents: "428400", priceDifferenceNetCents: "1000" });
    expect(acc("371000").methods).toEqual(["Coût moyen pondéré (PCG art. 213-34)", "Premier entré, premier sorti (PCG art. 213-34)"]);
  });
  it("compte valorisé absent du grand livre : cadrage incomplet, jamais réputé nul ; compte au grand livre sans ligne théorique : écart", async () => {
    const r = run(await sources({ ...ST_CSV, st_ledger: ledgerCsv([...LEDGER_ROWS.filter(l => l[0] !== "331000"), ["355000", "500,00", "2026-12-31", "Produits finis"]]) }));
    expect(r.valuation!.accounts.find(a => a.account === "331000")).toMatchObject({ status: "ledger_missing", ledgerCents: null, differenceCents: null });
    expect(r.exceptions.find(e => e.id === "FRAME:331000")!.code).toBe("FRAMING_INCOMPLETE");
    expect(r.valuation!.accounts.find(a => a.account === "355000")).toMatchObject({ status: "system_missing", differenceCents: "50000" });
  });
  it("issue et décompte : 14 exceptions et incertitudes, exceptions détectées", async () => {
    const r = run(await valued());
    expect(r.schemaVersion).toBe("stocks-result-2");
    expect(r.exceptions).toHaveLength(14);
    expect(r.exceptions.filter(e => ["PRICE_DIFFERENCE", "VALUE_ON_NOT_OWNED", "FRAMING_DIFFERENCE", "NET_COMPENSATED_VALUE", "COST_MISSING"].includes(e.code)).map(e => e.code).sort()).toEqual(["COST_MISSING", "FRAMING_DIFFERENCE", "NET_COMPENSATED_VALUE", "PRICE_DIFFERENCE", "VALUE_ON_NOT_OWNED"]);
    expect(stockOutcome(r)).toBe("exceptions_detected");
    expect(formatCents("-2400")).toBe("−24,00 €");
  });
  it("sans liste de coûts ni grand livre : aucune valeur dérivée (sous-lot 1 inchangé)", async () => {
    const r = run(await sources({ st_count: ST_CSV.st_count, st_system: ST_CSV.st_system, st_movements: ST_CSV.st_movements, st_support: ST_CSV.st_support }));
    expect(r.valuation).toBeNull();
    expect(r.exceptions).toHaveLength(9);
  });
});

describe("ST-1523 qualification des coûts, du grand livre et des valeurs", () => {
  const refused = async (type: StockSourceType, text: string, code: string) => {
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), stScope, stMapping(type, undefined, true), actor(stScope), type, "stocks.count");
    let error: unknown; try { assertStockBatch(batch, stPeriod); } catch (e) { error = e; }
    expect((error as StockSourceError).code).toBe(code);
    return (error as StockSourceError).locator;
  };
  it("méthode inconnue, coût en double, compte hors classe 3, valeur absente pour une ligne détenue", async () => {
    expect(await refused("st_costs", costCsv([["K1", "REF-A", "", "unite", "1,00", "2026-12-01", "lifo", "", ""]]), "ST_COST_METHOD_INVALID")).toMatchObject({ column: "Methode", value: "lifo" });
    await refused("st_costs", costCsv([["K1", "REF-A", "", "unite", "1,00", "2026-12-01", "cmp", "", ""], ["K2", "REF-A", "", "unite", "2,00", "2026-12-01", "cmp", "", ""]]), "ST_COST_DUPLICATE");
    await refused("st_ledger", ledgerCsv([["607000", "1,00", "2026-12-31", "Achats"]]), "ST_LEDGER_ACCOUNT_INVALID");
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-31", "propre", "", "", "", "371000"]]), "ST_SYSTEM_VALUE_REQUIRED");
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-31", "propre", "", "", "12,5x", "371000"]]), "ST_VALUE_FORMAT_INVALID");
    await refused("st_system", systemCsv([["S1", "REF-A", "N", "", "unite", "1", "2026-12-31", "propre", "", "", "12,00", "601000"]]), "ST_SYSTEM_ACCOUNT_REQUIRED");
    expect(SYSTEM_ROWS[6][7]).toBe("consignation_recue");
    // A mapped column absent from the file is refused by name, never read as empty values.
    const noValues = "Ligne;Reference;Site;Lot;Unite;Quantite;Date;Statut;Motif;Libelle\nS1;REF-A;N;;unite;1;2026-12-31;propre;;\n";
    expect(await refused("st_system", noValues, "ST_COLUMN_NOT_FOUND")).toMatchObject({ column: "Valeur" });
  });
});
