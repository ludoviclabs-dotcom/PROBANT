import { money } from "@/lib/canonical-model/money";
import { formatCents, formatQuantity, ST_VALUE_KIND_LABELS, type StockResult, type StockUnitResult, type StockValueReview } from "./stock-contract";
import { ST_OWNED, type StockFacts, type StValueLine } from "./stock-sources";
import { costOf, valueOf } from "./stock-valuation";

/**
 * Sub-lot 3 « revue de valeur » of the stock sheet (Mission 15). The tool compares; it never decides. A reviewed unit is
 * a selected unit for which the preparer froze a cited and justified hypothesis; every other unit stays « non revue ».
 */
const day = 86_400_000;
type Exception = StockResult["exceptions"][number];
const hypothesisOf = (values: StValueLine[], reference: string, lot: string) => values.find(h => h.reference === reference && h.lot === lot) ?? (lot ? values.find(h => h.reference === reference && h.lot === "") : undefined);
export function reviewStockValue(facts: StockFacts, units: StockUnitResult[], closingDate: string): { review: StockValueReview | null; exceptions: Exception[] } {
  if (!facts.values) return { review: null, exceptions: [] };
  const exceptions: Exception[] = [], known = (c: bigint) => ({ kind: "known" as const, value: money(c) }), unknown = (reason: string) => ({ kind: "unknown" as const, reason });
  const where = (u: StockUnitResult) => u.reference + " · " + u.site + (u.lot ? " · lot " + u.lot : "");
  const reviewed = units.filter(u => u.inScope && u.status !== "ownership_mismatch").map(u => {
    const f = facts.units.find(x => x.unitId === u.unitId)!, sys = f.system, h = hypothesisOf(facts.values!, u.reference, u.lot);
    const booked = sys?.depreciationCents ?? null, qty = sys?.quantity ?? null;
    const rotation = h?.lastMovement ? { lastMovement: h.lastMovement, days: Math.round((Date.parse(closingDate + "T00:00:00Z") - Date.parse(h.lastMovement + "T00:00:00Z")) / day) } : null;
    const base = { unitId: u.unitId, hypothesis: null, costCents: null, systemQuantity: qty, unitGapCents: null, indicativeGapCents: null, bookedCents: booked, differenceCents: null, rotation };
    if (!h) {
      // Booked depreciation without any frozen hypothesis: the review cannot say what supports it.
      if (booked !== null && BigInt(booked) > 0n) {
        exceptions.push({ id: "VHYP:" + u.unitId, code: "VALUE_HYPOTHESIS_MISSING", unitId: u.unitId, label: "Dépréciation sans hypothèse de valeur — " + where(u), message: "Dépréciation comptabilisée " + formatCents(booked) + " sans hypothèse de valeur figée : à documenter (prix et perspectives de vente, PCG art. 214-22).", amount: unknown("Valeur actuelle non documentée") });
        return { ...base, status: "booked_without_hypothesis" as const };
      }
      return { ...base, status: "not_reviewed" as const };
    }
    const sellingPrice = BigInt(h.quantity), exitCosts = BigInt(h.exitCostsCents), current = sellingPrice - exitCosts;
    const hypothesis = { importId: h.importId, rowId: h.rowId, documentVersionId: h.documentVersionId, fileName: h.fileName, row: h.locator.row ?? null, date: h.date,
      sellingPriceCents: String(sellingPrice), exitCostsCents: String(exitCosts), currentValueCents: String(current), kind: ST_VALUE_KIND_LABELS[h.kind] ?? h.kind, pieceRef: h.pieceRef, justification: h.justification, lot: h.lot };
    const c = facts.costs ? costOf(facts.costs, u.reference, u.lot) : undefined;
    if (!c || !sys) {
      exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Revue de valeur incomplète — " + where(u), message: !sys ? "Référence absente de l’état théorique : aucune quantité à apprécier." : "Coût documenté absent : la valeur actuelle selon l’hypothèse ne peut pas être comparée au coût.", amount: unknown("Comparaison impossible") });
      return { ...base, hypothesis, status: "cost_missing" as const };
    }
    if (h.uom !== sys.uom || c.uom !== sys.uom) {
      exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Revue de valeur incomplète — " + where(u), message: "Hypothèse en " + h.uomLabel + ", coût en " + c.uomLabel + ", quantité en " + sys.uomLabel + " : aucune conversion n’est appliquée.", amount: unknown("Comparaison bloquée") });
      return { ...base, hypothesis, costCents: c.quantity, status: "unit_incompatible" as const };
    }
    const cost = BigInt(c.quantity), unitGap = current < cost ? cost - current : 0n, gap = valueOf(BigInt(sys.quantity), unitGap);
    const difference = booked === null ? null : gap - BigInt(booked);
    if (difference !== null && difference !== 0n) exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_DIFFERENCE", unitId: u.unitId, label: "Revue de valeur à apprécier — " + where(u),
      message: "Coût " + formatCents(String(cost)) + " ; valeur actuelle selon l’hypothèse " + formatCents(String(current)) + " (" + hypothesis.kind + (h.pieceRef ? ", " + h.pieceRef : "") + ") ; écart indicatif " + formatCents(String(unitGap)) + " × " + formatQuantity(sys.quantity, sys.uomLabel) + " = " + formatCents(String(gap)) + " ; dépréciation comptabilisée " + formatCents(booked) + " ; différence " + formatCents(String(difference), { signed: true }) + ". Jugement humain motivé et cité requis : l’outil ne propose ni ne comptabilise aucune dépréciation.",
      amount: known(difference) });
    if (booked === null && gap > 0n) exceptions.push({ id: "VREV:" + u.unitId, code: "VALUE_REVIEW_INCOMPLETE", unitId: u.unitId, label: "Dépréciation comptabilisée inconnue — " + where(u), message: "Écart indicatif " + formatCents(String(gap)) + " selon l’hypothèse ; la colonne de dépréciation de l’état théorique n’est pas mappée.", amount: unknown("Dépréciation comptabilisée inconnue") });
    return { ...base, hypothesis, costCents: String(cost), unitGapCents: String(unitGap), indicativeGapCents: String(gap), differenceCents: difference === null ? null : String(difference), status: unitGap > 0n ? "gap" as const : "no_gap" as const };
  });
  // Booked depreciation of the owned lines (detail) against the 39x accounts of the closing ledger (credit balances).
  const bookedTotal = facts.depreciationMapped ? facts.units.filter(u => u.system && ST_OWNED.includes(u.system.category)).reduce((n, u) => n + BigInt(u.system!.depreciationCents ?? "0"), 0n) : null;
  const ledger39 = facts.ledger ? facts.ledger.filter(l => l.account.startsWith("39")).reduce((n, l) => n - BigInt(l.quantity), 0n) : null;
  const framing = bookedTotal !== null && ledger39 !== null ? ledger39 - bookedTotal : null;
  if (framing !== null && framing !== 0n) exceptions.push({ id: "DEPR:TOTAL", code: "DEPRECIATION_FRAMING_DIFFERENCE", unitId: null, label: "Cadrage des dépréciations ↔ grand livre (comptes 39)",
    message: "Comptes 39 au grand livre " + formatCents(String(ledger39)) + " ; détail des dépréciations de l’état théorique " + formatCents(String(bookedTotal)) + " ; écart " + formatCents(String(framing), { signed: true }) + ".", amount: known(framing) });
  const gapTotal = reviewed.reduce((n, r) => n + (r.indicativeGapCents ? BigInt(r.indicativeGapCents) : 0n), 0n);
  return { exceptions, review: {
    hypothesesProvided: true, depreciationMapped: facts.depreciationMapped, units: reviewed,
    totals: { reviewed: reviewed.filter(r => r.hypothesis).length, notReviewed: reviewed.filter(r => !r.hypothesis).length, indicativeGapCents: String(gapTotal), bookedCents: bookedTotal === null ? null : String(bookedTotal),
      ledgerDepreciationCents: ledger39 === null ? null : String(ledger39), depreciationFramingDifferenceCents: framing === null ? null : String(framing) },
  } };
}
