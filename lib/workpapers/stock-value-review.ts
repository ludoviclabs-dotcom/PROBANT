import { money } from "@/lib/canonical-model/money";
import { formatCents, formatQuantity, ST_COST_BASIS_LABELS, ST_COST_METHOD_LABELS, ST_HYPOTHESIS_BASIS_LABELS, ST_QUANTITY_BASIS_LABELS, ST_VALUE_KIND_LABELS, type StockQuantityBasis, type StockResult, type StockUnitResult, type StockValueReview, type StockValueReviewUnit } from "./stock-contract";
import { ST_OWNED, type StockFacts, type StValueLine } from "./stock-sources";
import { costOf, lineBasis, valueOf } from "./stock-valuation";

/**
 * Sub-lot 3 « revue de valeur » of the stock sheet (Mission 15), rule 1.1.0 (C08). The tool compares; it never decides.
 * A reviewed unit is a tested unit for which the preparer froze a cited and justified hypothesis; every other unit stays
 * « non revue », and the units outside the test are carried by the totals with their motive and stated value.
 */
const day = 86_400_000;
type Exception = StockResult["exceptions"][number];
const fr = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7) + "/" + date.slice(0, 4);
const hypothesisOf = (values: StValueLine[], reference: string, lot: string) => values.find(h => h.reference === reference && h.lot === lot) ?? (lot ? values.find(h => h.reference === reference && h.lot === "") : undefined);
/**
 * Comparison on one quantity (hundredths) at the documented unit cost and the hypothesis' current value (cents, possibly negative):
 * economic gross gap; loss of value of the asset, bounded at the carrying amount; excess beyond it, to be qualified.
 */
export function boundedComparison(quantity: bigint, unitCost: bigint, currentValue: bigint) {
  const carrying = valueOf(quantity, unitCost), economic = valueOf(quantity, currentValue < unitCost ? unitCost - currentValue : 0n);
  const asset = economic < carrying ? economic : carrying;
  return { carrying, economic, asset, excess: economic - asset };
}
/** Quantity actually used for the comparison: the theoretical one, reconciled only when the reconstituted closing equals it. */
function quantityOf(u: StockUnitResult, theoretical: string | null, uomLabel: string | null): StockValueReviewUnit["quantity"] {
  const basis: StockQuantityBasis = theoretical === null ? "unknown" : u.status === "matched" ? "reconciled" : "theoretical_unreconciled";
  return { theoretical, counted: u.counted, countDate: u.countDate, reconstituted: u.expectedClosing, difference: u.difference, used: theoretical, basis, uomLabel, quantityStatus: u.status };
}
export function reviewStockValue(facts: StockFacts, units: StockUnitResult[], closingDate: string): { review: StockValueReview | null; exceptions: Exception[] } {
  if (!facts.values) return { review: null, exceptions: [] };
  const exceptions: Exception[] = [], known = (c: bigint) => ({ kind: "known" as const, value: money(c) }), unknown = (reason: string) => ({ kind: "unknown" as const, reason });
  const where = (u: StockUnitResult) => u.reference + " · " + u.site + (u.lot ? " · lot " + u.lot : "");
  const tested = units.filter(u => u.inScope && u.status !== "ownership_mismatch");
  const reviewed = tested.map((u): StockValueReviewUnit => {
    const f = facts.units.find(x => x.unitId === u.unitId)!, sys = f.system, h = hypothesisOf(facts.values!, u.reference, u.lot);
    const booked = sys?.depreciationCents ?? null, quantity = quantityOf(u, sys?.quantity ?? null, sys?.uomLabel ?? u.uom);
    const rotation = h?.lastMovement ? { lastMovement: h.lastMovement, days: Math.round((Date.parse(closingDate + "T00:00:00Z") - Date.parse(h.lastMovement + "T00:00:00Z")) / day) } : null;
    const base = { unitId: u.unitId, hypothesis: null, cost: null, quantity, statedValueCents: sys?.valueCents ?? null, carryingCents: null, economicGapCents: null, assetImpairmentCents: null, excessCents: null,
      alternative: null, bookedCents: booked, differenceCents: null, rotation };
    if (!h) {
      // Booked depreciation without any frozen hypothesis: the review cannot say what supports it.
      if (booked !== null && BigInt(booked) > 0n) {
        exceptions.push({ id: "VHYP:" + u.unitId, code: "VALUE_HYPOTHESIS_MISSING", unitId: u.unitId, label: "Dépréciation sans hypothèse de valeur — " + where(u), message: "Dépréciation comptabilisée " + formatCents(booked) + " sans hypothèse de valeur figée : à documenter (prix et perspectives de vente, PCG art. 214-22).", amount: unknown("Valeur actuelle non documentée") });
        return { ...base, status: "booked_without_hypothesis", judgmentBasis: "Aucune hypothèse de valeur figée : la dépréciation comptabilisée de " + formatCents(booked) + " n’est rattachée à aucune pièce de valeur." };
      }
      return { ...base, status: "not_reviewed", judgmentBasis: "Aucune hypothèse de valeur figée : unité non revue." };
    }
    const sellingPrice = BigInt(h.quantity), exitCosts = BigInt(h.exitCostsCents), current = sellingPrice - exitCosts, hBasis = lineBasis(h, u.lot);
    const hypothesis = { importId: h.importId, rowId: h.rowId, documentVersionId: h.documentVersionId, fileName: h.fileName, row: h.locator.row ?? null, date: h.date,
      sellingPriceCents: String(sellingPrice), exitCostsCents: String(exitCosts), currentValueCents: String(current), kind: ST_VALUE_KIND_LABELS[h.kind] ?? h.kind, pieceRef: h.pieceRef, justification: h.justification, lot: h.lot,
      uomLabel: h.uomLabel, basis: hBasis };
    const hypothesisText = "valeur actuelle selon " + hypothesis.kind.toLowerCase() + (h.pieceRef ? " " + h.pieceRef : "") + " du " + fr(h.date) + " : " + formatCents(String(sellingPrice)) + " − " + formatCents(String(exitCosts)) + " = " + formatCents(String(current)) + " par " + h.uomLabel
      + (current < 0n ? " (valeur négative conservée : les coûts de sortie dépassent le prix)" : "") + (hBasis === "reference_fallback" ? " — " + ST_HYPOTHESIS_BASIS_LABELS.reference_fallback.toLowerCase() : "");
    const c = facts.costs ? costOf(facts.costs, u.reference, u.lot) : undefined;
    const cost = c ? { importId: c.importId, rowId: c.rowId, documentVersionId: c.documentVersionId, fileName: c.fileName, row: c.locator.row ?? null, date: c.date, unitCostCents: c.quantity, uomLabel: c.uomLabel,
      method: ST_COST_METHOD_LABELS[c.method] ?? c.method, capacity: "declared" as const, pieceRef: c.pieceRef, lot: c.lot, basis: lineBasis(c, u.lot) } : null;
    if (!sys) {
      exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Revue de valeur incomplète — " + where(u), message: "Référence absente de l’état théorique : aucune quantité comptabilisée à apprécier ; " + hypothesisText + ".", amount: unknown("Comparaison impossible") });
      return { ...base, hypothesis, cost, status: "not_in_system", judgmentBasis: "Hypothèse figée, mais aucune ligne théorique : quantité comptabilisée inconnue, aucune estimation." };
    }
    if (!c || !cost) {
      exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Revue de valeur incomplète — " + where(u), message: "Coût documenté absent : la valeur actuelle selon l’hypothèse ne peut pas être comparée au coût ; " + hypothesisText + ".", amount: unknown("Comparaison impossible") });
      return { ...base, hypothesis, status: "cost_missing", judgmentBasis: "Coût documenté absent pour cette référence et ce lot : aucune comparaison, la valeur reste inconnue." };
    }
    const costText = "coût " + formatCents(c.quantity) + " par " + c.uomLabel + " (" + cost.method + (c.pieceRef ? ", pièce " + c.pieceRef : "") + " du " + fr(c.date) + (cost.basis === "reference_fallback" ? " ; " + ST_COST_BASIS_LABELS.reference_fallback.toLowerCase() : "") + ")";
    if (h.uom !== sys.uom || c.uom !== sys.uom) {
      exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Revue de valeur incomplète — " + where(u), message: "Hypothèse en " + h.uomLabel + ", coût en " + c.uomLabel + ", quantité en " + sys.uomLabel + " : aucune conversion n’est appliquée.", amount: unknown("Comparaison bloquée") });
      return { ...base, hypothesis, cost, status: "unit_incompatible", judgmentBasis: "Unités différentes (hypothèse " + h.uomLabel + ", coût " + c.uomLabel + ", quantité " + sys.uomLabel + ") : aucune conversion, aucune estimation." };
    }
    const unitCost = BigInt(c.quantity), main = boundedComparison(BigInt(sys.quantity), unitCost, current);
    const reconstituted = u.expectedClosing === null ? null : BigInt(u.expectedClosing);
    const alt = quantity.basis === "theoretical_unreconciled" && reconstituted !== null && reconstituted >= 0n ? boundedComparison(reconstituted, unitCost, current) : null;
    const alternative = alt ? { quantity: String(reconstituted), carryingCents: String(alt.carrying), economicGapCents: String(alt.economic), assetImpairmentCents: String(alt.asset), excessCents: String(alt.excess) } : null;
    const difference = booked === null ? null : main.asset - BigInt(booked);
    const status = main.economic > 0n ? (quantity.basis === "reconciled" ? "gap" as const : "gap_partial" as const) : "no_gap" as const;
    const qtyText = formatQuantity(sys.quantity, sys.uomLabel), stated = sys.valueCents;
    const judgmentBasis = [costText.charAt(0).toUpperCase() + costText.slice(1), hypothesisText, "quantité retenue " + qtyText + " — " + ST_QUANTITY_BASIS_LABELS[quantity.basis].charAt(0).toLowerCase() + ST_QUANTITY_BASIS_LABELS[quantity.basis].slice(1)
      + (quantity.basis === "theoretical_unreconciled" ? " (reconstituée " + formatQuantity(u.expectedClosing, u.uom) + ", statut « " + u.status + " »)" : ""),
      "valeur comptable de référence " + qtyText + " × " + formatCents(c.quantity) + " = " + formatCents(String(main.carrying)) + (stated !== null && BigInt(stated) !== main.carrying ? " ; valeur théorique déclarée " + formatCents(stated) + " : écart de prix à expliquer avant de conclure" : "")].join(" ; ") + ".";
    const amounts = "comparaison économique " + formatCents(String(main.economic)) + " ; perte de valeur de l’actif bornée à la valeur comptable " + formatCents(String(main.carrying)) + " : " + formatCents(String(main.asset)) + (main.excess > 0n ? " ; complément à qualifier " + formatCents(String(main.excess)) : "");
    if (status !== "gap_partial" && difference !== null && difference !== 0n) exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_DIFFERENCE", unitId: u.unitId, label: "Revue de valeur à apprécier — " + where(u),
      message: "Coût " + formatCents(c.quantity) + " ; valeur actuelle selon l’hypothèse " + formatCents(String(current)) + " (" + hypothesis.kind + (h.pieceRef ? ", " + h.pieceRef : "") + ") ; quantité retenue " + qtyText + " (" + ST_QUANTITY_BASIS_LABELS[quantity.basis].toLowerCase() + ") ; " + amounts + " ; dépréciation comptabilisée " + formatCents(booked) + " ; différence " + formatCents(String(difference), { signed: true }) + ". Jugement humain motivé et cité requis : l’outil ne propose ni ne comptabilise aucune dépréciation.",
      amount: known(difference) });
    if (status === "gap_partial") exceptions.push({ id: "VQTY:" + u.unitId, code: "VALUE_QUANTITY_UNRESOLVED", unitId: u.unitId, label: "Estimation partielle : quantité non rapprochée — " + where(u),
      message: "Quantité théorique " + qtyText + ", reconstituée " + formatQuantity(u.expectedClosing, u.uom) + " (statut « " + u.status + " ») : sur la quantité théorique, " + amounts + (alt ? " ; sur la quantité reconstituée, comparaison économique " + formatCents(String(alt.economic)) + ", perte de valeur de l’actif " + formatCents(String(alt.asset)) + (alt.excess > 0n ? ", complément " + formatCents(String(alt.excess)) : "") : " ; quantité reconstituée inconnue")
        + " ; dépréciation comptabilisée " + formatCents(booked) + ". L’estimation reste partielle tant que l’écart de quantité n’est pas résolu.", amount: unknown("Estimation partielle : quantité non rapprochée") });
    if (booked === null && main.economic > 0n) exceptions.push({ id: "VBKD:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Dépréciation comptabilisée inconnue — " + where(u), message: "Perte de valeur de l’actif " + formatCents(String(main.asset)) + " selon l’hypothèse ; la colonne de dépréciation de l’état théorique n’est pas mappée.", amount: unknown("Dépréciation comptabilisée inconnue") });
    if (main.excess > 0n) exceptions.push({ id: "VEXC:" + u.unitId, code: "VALUE_EXCESS_TO_QUALIFY", unitId: u.unitId, label: "Complément au-delà de la valeur comptable — " + where(u),
      message: "Comparaison économique " + formatCents(String(main.economic)) + " sur " + qtyText + (status === "gap_partial" ? " (quantité non rapprochée)" : "") + " ; la perte de valeur de l’actif est bornée à sa valeur comptable de référence " + formatCents(String(main.carrying)) + ". Le complément de " + formatCents(String(main.excess)) + " n’est ni une dépréciation ni une provision : obligation éventuelle à qualifier (passif si obligation envers un tiers et sortie de ressources probable, PCG art. 321-1, 322-1, 322-2, perte sur contrat art. 322-9 ; passif éventuel mentionné en annexe, art. 321-6 et 322-5 ; perte d’exploitation future non provisionnée, art. 322-12).",
      amount: unknown("Passif non qualifié : le complément économique n’est pas l’estimation d’une sortie de ressources (PCG art. 321-2)") });
    return { ...base, hypothesis, cost, status, carryingCents: String(main.carrying), economicGapCents: String(main.economic), assetImpairmentCents: String(main.asset), excessCents: String(main.excess), alternative,
      differenceCents: difference === null ? null : String(difference), judgmentBasis };
  });
  // Booked depreciation of the owned lines (detail) against the 39x accounts of the closing ledger (credit balances).
  const bookedTotal = facts.depreciationMapped ? facts.units.filter(u => u.system && ST_OWNED.includes(u.system.category)).reduce((n, u) => n + BigInt(u.system!.depreciationCents ?? "0"), 0n) : null;
  const ledger39 = facts.ledger ? facts.ledger.filter(l => l.account.startsWith("39")).reduce((n, l) => n - BigInt(l.quantity), 0n) : null;
  const framing = bookedTotal !== null && ledger39 !== null ? ledger39 - bookedTotal : null;
  if (framing !== null && framing !== 0n) exceptions.push({ id: "DEPR:TOTAL", code: "DEPRECIATION_FRAMING_DIFFERENCE", unitId: null, label: "Cadrage des dépréciations ↔ grand livre (comptes 39)",
    message: "Comptes 39 au grand livre " + formatCents(String(ledger39)) + " ; détail des dépréciations de l’état théorique " + formatCents(String(bookedTotal)) + " ; écart " + formatCents(String(framing), { signed: true }) + ".", amount: known(framing) });
  const sum = (rows: StockValueReviewUnit[], key: "economicGapCents" | "assetImpairmentCents" | "excessCents") => String(rows.reduce((n, r) => n + (r[key] ? BigInt(r[key]!) : 0n), 0n));
  const amounts = (rows: StockValueReviewUnit[]) => ({ economicGapCents: sum(rows, "economicGapCents"), assetImpairmentCents: sum(rows, "assetImpairmentCents"), excessCents: sum(rows, "excessCents") });
  const by = (...statuses: StockValueReviewUnit["status"][]) => reviewed.filter(r => statuses.includes(r.status));
  // Part not reviewed: units without hypothesis, at documented cost × theoretical quantity when both are known in the same unit.
  let notReviewedCost = 0n, notReviewedUnknown = 0;
  for (const r of by("not_reviewed", "booked_without_hypothesis")) {
    const u = units.find(x => x.unitId === r.unitId)!, sys = facts.units.find(x => x.unitId === r.unitId)!.system, c = facts.costs ? costOf(facts.costs, u.reference, u.lot) : undefined;
    if (sys && c && c.uom === sys.uom) notReviewedCost += valueOf(BigInt(sys.quantity), BigInt(c.quantity)); else notReviewedUnknown++;
  }
  // Units outside the value review, grouped by motive, with the value the theoretical state carries for them.
  const groups = new Map<string, { units: number; stated: bigint; unknown: number }>();
  for (const u of units.filter(x => !x.inScope || x.status === "ownership_mismatch")) {
    const group = u.status === "ownership_mismatch" ? "ownership_mismatch" : u.status === "site_not_visited" ? "site_not_visited" : u.category, g = groups.get(group) ?? { units: 0, stated: 0n, unknown: 0 };
    const stated = facts.units.find(x => x.unitId === u.unitId)!.system?.valueCents ?? null;
    g.units++; if (stated === null) g.unknown++; else g.stated += BigInt(stated);
    groups.set(group, g);
  }
  const excluded = [...groups.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([group, g]) => ({ group: group as StockValueReview["totals"]["excluded"][number]["group"], units: g.units,
    // A group whose stated values are all unknown carries no total: never a zero standing for unknown values.
    statedValueCents: facts.valueMapped && g.unknown < g.units ? String(g.stated) : null, unknownValues: facts.valueMapped ? g.unknown : g.units }));
  return { exceptions, review: {
    hypothesesProvided: true, depreciationMapped: facts.depreciationMapped, units: reviewed,
    totals: {
      units: { tested: tested.length, complete: by("gap", "no_gap").length, partial: by("gap_partial").length, incomplete: by("cost_missing", "unit_incompatible", "not_in_system").length,
        bookedWithoutHypothesis: by("booked_without_hypothesis").length, notReviewed: by("not_reviewed").length, excluded: units.filter(x => !x.inScope).length, ownershipMismatch: units.filter(x => x.status === "ownership_mismatch").length },
      complete: amounts(by("gap", "no_gap")), partial: amounts(by("gap_partial")), notReviewedCostCents: String(notReviewedCost), notReviewedUnknown, excluded,
      bookedCents: bookedTotal === null ? null : String(bookedTotal), ledgerDepreciationCents: ledger39 === null ? null : String(ledger39), depreciationFramingDifferenceCents: framing === null ? null : String(framing) },
  } };
}
