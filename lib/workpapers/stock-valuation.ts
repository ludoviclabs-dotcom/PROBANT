import { money } from "@/lib/canonical-model/money";
import { formatCents, formatQuantity, ST_COST_METHOD_LABELS, type StockResult, type StockUnitResult, type StockValuation } from "./stock-contract";
import { ST_OWNED, type StCostLine, type StFact, type StockFacts } from "./stock-sources";

/**
 * Sub-lot 2 « coûts et cadrage » of the stock sheet (Mission 15). Pure functions over the frozen facts and the
 * quantity result: no value is derived without a documented cost, and no framing without the closing ledger.
 */
const abs = (n: bigint) => n < 0n ? -n : n;
/** quantity (hundredths) × unit cost (cents) ÷ 100, rounded half away from zero to the cent — internal convention. */
export function valueOf(hundredths: bigint, costCents: bigint) {
  const n = hundredths * costCents;
  return n >= 0n ? (2n * n + 100n) / 200n : -((-2n * n + 100n) / 200n);
}
const lineRef = (f: StFact) => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, row: f.locator.row ?? null, date: f.date });
/** The cost of a reference and lot, else the cost of the reference without lot. Never a neighbouring reference. */
export function costOf(costs: StCostLine[], reference: string, lot: string) {
  return costs.find(c => c.reference === reference && c.lot === lot) ?? (lot ? costs.find(c => c.reference === reference && c.lot === "") : undefined);
}
type Exception = StockResult["exceptions"][number];
export function valueStocks(facts: StockFacts, units: StockUnitResult[]): { valuation: StockValuation | null; exceptions: Exception[]; quantityValue: Map<string, { cents: bigint; cost: StCostLine }> } {
  const quantityValue = new Map<string, { cents: bigint; cost: StCostLine }>();
  if (!facts.costs && !facts.ledger) return { valuation: null, exceptions: [], quantityValue };
  const exceptions: Exception[] = [], known = (cents: bigint) => ({ kind: "known" as const, value: money(cents) }), unknown = (reason: string) => ({ kind: "unknown" as const, reason });
  const where = (u: StockUnitResult) => u.reference + " · " + u.site + (u.lot ? " · lot " + u.lot : "");
  const valued = units.map(u => {
    const f = facts.units.find(x => x.unitId === u.unitId)!, sys = f.system, owned = (sys ? ST_OWNED.includes(sys.category) : u.countCategories.every(c => ST_OWNED.includes(c)));
    const base = { unitId: u.unitId, account: sys?.account ?? "", owned, systemValueCents: sys?.valueCents ?? null, cost: null, costStatus: "not_tested" as const,
      expectedValueCents: null, recalculatedSystemValueCents: null, quantityDifferenceValueCents: null, priceDifferenceCents: null };
    if (!facts.costs || !u.inScope || u.status === "ownership_mismatch") return base;
    const c = costOf(facts.costs, u.reference, u.lot);
    if (!c) {
      exceptions.push({ id: "COST:" + u.unitId, code: "COST_MISSING", unitId: u.unitId, label: "Coût non documenté — " + where(u), message: "Aucun coût unitaire documenté pour cette référence (et ce lot) : la valeur reste inconnue, jamais nulle.", amount: unknown("Valeur inconnue") });
      return { ...base, costStatus: "missing" as const };
    }
    const cost = { ...lineRef(c), unitCostCents: c.quantity, uomLabel: c.uomLabel, method: ST_COST_METHOD_LABELS[c.method] ?? c.method, pieceRef: c.pieceRef, lot: c.lot };
    // The cost unit must be the counting unit of the system and of the count: cartons are never valued at a cost per unit.
    const uoms = new Set([...f.counts.map(x => x.uom), ...(sys ? [sys.uom] : [])]);
    if (sys ? sys.uom !== c.uom : [...uoms].some(x => x !== c.uom)) {
      exceptions.push({ id: "CUOM:" + u.unitId, code: "COST_UNIT_INCOMPATIBLE", unitId: u.unitId, label: "Unité du coût incompatible — " + where(u), message: "Coût exprimé par " + c.uomLabel + " pour une quantité en " + (sys?.uomLabel ?? u.uoms.count.join(", ")) + " : aucune conversion n’est appliquée.", amount: unknown("Valeur bloquée") });
      return { ...base, cost, costStatus: "unit_incompatible" as const };
    }
    // The quantity difference is valued only when count, system and movements share one unit (the cost's, checked above).
    const unitCost = BigInt(c.quantity), sameUnit = u.uom !== null;
    const expected = sameUnit && u.expectedClosing !== null ? valueOf(BigInt(u.expectedClosing), unitCost) : null;
    const qdv = sameUnit && u.difference !== null ? valueOf(BigInt(u.difference), unitCost) : null;
    const recalculated = sys ? valueOf(BigInt(sys.quantity), unitCost) : null;
    const price = recalculated !== null && sys?.valueCents != null ? BigInt(sys.valueCents) - recalculated : null;
    if (qdv !== null && qdv !== 0n) quantityValue.set(u.unitId, { cents: qdv, cost: c });
    if (price !== null && price !== 0n) exceptions.push({ id: "PRICE:" + u.unitId, code: "PRICE_DIFFERENCE", unitId: u.unitId, label: "Écart de prix — " + where(u),
      message: "Valeur théorique " + formatCents(sys!.valueCents) + " ; " + formatQuantity(sys!.quantity, sys!.uomLabel) + " × " + formatCents(c.quantity) + " (" + (ST_COST_METHOD_LABELS[c.method] ?? c.method) + (c.pieceRef ? ", " + c.pieceRef : "") + ") = " + formatCents(String(recalculated)) + " ; écart " + formatCents(String(price), { signed: true }) + ". À expliquer, non validé comme anomalie.",
      amount: known(price) });
    return { ...base, cost, costStatus: "documented" as const, expectedValueCents: expected === null ? null : String(expected), recalculatedSystemValueCents: recalculated === null ? null : String(recalculated),
      quantityDifferenceValueCents: qdv === null ? null : String(qdv), priceDifferenceCents: price === null ? null : String(price) };
  });
  // Value carried in a stock account for goods the entity does not own (third-party stock, received consignment).
  for (const v of valued) {
    const u = units.find(x => x.unitId === v.unitId)!;
    if (!v.owned && v.systemValueCents !== null && BigInt(v.systemValueCents) !== 0n) exceptions.push({ id: "NOTOWN:" + v.unitId, code: "VALUE_ON_NOT_OWNED", unitId: v.unitId, label: "Valeur portée sur un bien non détenu — " + where(u),
      message: "Ligne théorique en « " + (facts.units.find(x => x.unitId === v.unitId)!.system!.category === "third_party" ? "stock de tiers" : "consignation reçue") + " » valorisée " + formatCents(v.systemValueCents) + (v.account ? " sur le compte " + v.account : "") + " : exclue du cadrage, à expliquer.", amount: known(BigInt(v.systemValueCents)) });
  }
  // Framing: owned stated values per account against the closing ledger; 39x depreciation accounts go to the value review.
  const ledger = (facts.ledger ?? []).filter(l => !l.account.startsWith("39")), depreciation = (facts.ledger ?? []).filter(l => l.account.startsWith("39"));
  const accounts = new Map<string, { system: bigint; notOwned: bigint; lines: number }>();
  let unaccounted = 0;
  for (const v of valued) {
    if (v.systemValueCents === null) continue;
    if (!v.account) { if (v.owned) unaccounted++; continue; }
    const a = accounts.get(v.account) ?? { system: 0n, notOwned: 0n, lines: 0 };
    if (v.owned) { a.system += BigInt(v.systemValueCents); a.lines++; } else a.notOwned += BigInt(v.systemValueCents);
    accounts.set(v.account, a);
  }
  for (const l of ledger) if (!accounts.has(l.account)) accounts.set(l.account, { system: 0n, notOwned: 0n, lines: 0 });
  const framed = [...accounts.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([account, a]) => {
    const l = ledger.find(x => x.account === account), methods = [...new Set(valued.filter(v => v.account === account && v.cost).map(v => v.cost!.method))].sort();
    // Stated values not mapped: the system side is unknown, so no known framing difference is derived from the ledger balance.
    if (facts.ledger && !facts.valueMapped) return { account, systemValueCents: null, ledgerCents: l?.quantity ?? null, differenceCents: null, lines: 0, notOwnedCents: "0", status: "values_missing" as const, ledger: l ? lineRef(l) : null, methods };
    if (!facts.ledger) return { account, systemValueCents: String(a.system), ledgerCents: null, differenceCents: null, lines: a.lines, notOwnedCents: String(a.notOwned), status: "ledger_missing" as const, ledger: null, methods };
    if (!l) {
      exceptions.push({ id: "FRAME:" + account, code: "FRAMING_INCOMPLETE", unitId: null, label: "Compte sans solde au grand livre — " + account, message: "L’état théorique valorise " + formatCents(String(a.system)) + " sur le compte " + account + ", absent du grand livre approuvé : cadrage impossible.", amount: unknown("Solde du grand livre inconnu") });
      return { account, systemValueCents: String(a.system), ledgerCents: null, differenceCents: null, lines: a.lines, notOwnedCents: String(a.notOwned), status: "ledger_missing" as const, ledger: null, methods };
    }
    const diff = BigInt(l.quantity) - a.system;
    if (diff !== 0n) exceptions.push({ id: "FRAME:" + account, code: "FRAMING_DIFFERENCE", unitId: null, label: "Cadrage état valorisé ↔ grand livre — " + account,
      message: "Grand livre " + formatCents(l.quantity) + " ; état théorique valorisé (stock détenu) " + formatCents(String(a.system)) + " ; écart " + formatCents(String(diff), { signed: true }) + (a.lines ? "" : " : aucune ligne théorique sur ce compte") + ".", amount: known(diff) });
    return { account, systemValueCents: String(a.system), ledgerCents: l.quantity, differenceCents: String(diff), lines: a.lines, notOwnedCents: String(a.notOwned), status: a.lines ? (diff === 0n ? "framed" as const : "difference" as const) : "system_missing" as const, ledger: lineRef(l), methods };
  });
  if (facts.ledger && !facts.valueMapped) exceptions.push({ id: "FRAME:VALUES", code: "FRAMING_INCOMPLETE", unitId: null, label: "Valeurs théoriques non fournies", message: "La colonne de valeur de l’état théorique n’est pas mappée : le cadrage avec le grand livre est impossible.", amount: unknown("Valeur théorique inconnue") });
  if (facts.ledger && unaccounted) exceptions.push({ id: "FRAME:NOACCOUNT", code: "FRAMING_INCOMPLETE", unitId: null, label: "Lignes valorisées sans compte", message: unaccounted + " ligne(s) théorique(s) valorisée(s) sans compte de stock : leur cadrage est impossible.", amount: unknown("Compte inconnu") });
  // Net and gross valued differences, per reference and in total: a net total never justifies opposite differences.
  const diffs = valued.filter(v => v.quantityDifferenceValueCents !== null && v.quantityDifferenceValueCents !== "0");
  const byRef = new Map<string, bigint[]>();
  for (const v of diffs) { const r = units.find(x => x.unitId === v.unitId)!.reference; byRef.set(r, [...(byRef.get(r) ?? []), BigInt(v.quantityDifferenceValueCents!)]); }
  const references = [...byRef.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([reference, ds]) => { const net = ds.reduce((n, d) => n + d, 0n), gross = ds.reduce((n, d) => n + abs(d), 0n);
    return { reference, net: String(net), gross: String(gross), compensated: gross > 0n && abs(net) < gross, units: ds.length }; });
  const all = diffs.map(v => BigInt(v.quantityDifferenceValueCents!)), net = all.reduce((n, d) => n + d, 0n), gross = all.reduce((n, d) => n + abs(d), 0n);
  const compensated = all.length > 1 && gross > 0n && abs(net) < gross;
  if (compensated) exceptions.push({ id: "NETV:TOTAL", code: "NET_COMPENSATED_VALUE", unitId: null, label: "Total valorisé compensé",
    message: "Total net des écarts valorisés " + formatCents(String(net), { signed: true }) + " pour des écarts bruts de " + formatCents(String(gross)) + " sur " + all.length + " références / sites / lots : le net ne justifie aucun écart individuel.", amount: unknown("Écarts compensés à expliquer un par un") });
  const systemTotal = valued.filter(v => v.owned && v.systemValueCents !== null).reduce((n, v) => n + BigInt(v.systemValueCents!), 0n);
  const valuation: StockValuation = {
    costsProvided: !!facts.costs, ledgerProvided: !!facts.ledger, valueMapped: facts.valueMapped, units: valued, accounts: framed,
    depreciation: depreciation.map(l => ({ account: l.account, ledgerCents: l.quantity, ledger: lineRef(l) })), references,
    totals: { netQuantityDifferenceCents: String(net), grossQuantityDifferenceCents: String(gross), compensated, valuedDifferences: all.length,
      priceDifferenceNetCents: String(valued.reduce((n, v) => n + (v.priceDifferenceCents ? BigInt(v.priceDifferenceCents) : 0n), 0n)), systemValueCents: facts.valueMapped ? String(systemTotal) : null,
      ledgerCents: facts.ledger ? String(ledger.reduce((n, l) => n + BigInt(l.quantity), 0n)) : null },
  };
  return { valuation, exceptions, quantityValue };
}
