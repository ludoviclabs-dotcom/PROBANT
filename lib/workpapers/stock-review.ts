import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ImportBatch } from "./imports";
import type { NoteCitation, WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import { formatQuantity, ST_CATEGORY_EXCLUSIONS, ST_LIMITATIONS, ST_METHOD_TEXT, ST_SITE_NOT_VISITED, ST_STATUSES, stockResultSchema, stockWorkSchema, type StockCitation, type StockCitationInput, type StockDraft, type StockResult, type StockStatus, type StockUnitResult, type StockWork } from "./stock-contract";
import { buildStockFacts, type StFact, type StUnitFact } from "./stock-sources";
import { valueStocks } from "./stock-valuation";
import { reviewStockValue } from "./stock-value-review";
import { formatCents, ST_COST_METHOD_LABELS, ST_REVIEW_LIMITATIONS, ST_REVIEW_METHOD_TEXT, ST_VALUE_LIMITATIONS, ST_VALUE_METHOD_TEXT } from "./stock-contract";
import { money } from "@/lib/canonical-model/money";

export * from "./stock-contract";
/** A citation names a frozen document version and, optionally, one of its rows; file name, hash and locator are resolved here. */
export function resolveStockCitation(batches: ImportBatch[], input: StockCitationInput): StockCitation {
  const batch = batches.find(b => b.document.id === input.documentId);
  if (!batch) throw new Error("ST_CITATION_SOURCE_REQUIRED");
  const row = input.rowId ? batch.rows.find(r => r.id === input.rowId) : undefined;
  if (input.rowId && !row) throw new Error("ST_CITATION_ROW_INVALID");
  return { documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash,
    ...(row ? { rowId: row.id, ...(row.locator.row ? { row: row.locator.row } : {}), ...(row.locator.cell ? { cell: row.locator.cell } : {}), ...(row.locator.page ? { page: row.locator.page } : {}), ...(row.locator.zone ? { zone: row.locator.zone } : {}) } : {}) };
}
export const stockNoteCitation = (c: StockCitation): NoteCitation => ({ documentVersionId: c.documentVersionId, importId: c.importId, fileName: c.fileName, sha256: c.sha256,
  ...(c.rowId ? { rowId: c.rowId } : {}), ...(c.row ? { row: c.row } : {}), ...(c.page ? { page: c.page } : {}), ...(c.zone ? { zone: c.zone } : {}) });
/** The server stamps the preparer's convention against the frozen sources; the browser never types a file name or a hash. */
export function stampStockWork(input: { imports: ImportBatch[]; draft: StockDraft; actor: Principal; at: string }): StockWork {
  return stockWorkSchema.parse({ schemaVersion: "stocks-1", sameDay: input.draft.sameDay, instructions: resolveStockCitation(input.imports, input.draft.instructions), configuredBy: input.actor.id, configuredAt: input.at });
}

const day = (date: string, delta: number) => new Date(Date.parse(date + "T00:00:00Z") + delta * 86_400_000).toISOString().slice(0, 10);
const abs = (n: bigint) => n < 0n ? -n : n;
const ref = (f: StFact) => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, row: f.locator.row ?? null, key: f.key, quantity: f.quantity, date: f.date });
/**
 * Window of the intercalary movements between the count date and the closing date, under the preparer's same-day
 * convention. Forward (count on or before closing): (count, closing], plus the count day when movements of that day
 * are posterior. Backward (count after closing): (closing, count), plus the count day when its movements are anterior.
 */
export function movementWindow(countDate: string, closing: string, sameDay: StockWork["sameDay"]) {
  if (countDate <= closing) {
    const from = sameDay === "after_count" ? countDate : day(countDate, 1);
    return { direction: "forward" as const, window: from <= closing ? { from, to: closing } : null };
  }
  const from = day(closing, 1), to = sameDay === "before_count" ? countDate : day(countDate, -1);
  return { direction: "backward" as const, window: from <= to ? { from, to } : null };
}

/** Quantities only (sub-lot 1): every number is a quantity in hundredths of the counting unit, never an amount. */
export function evaluateStocks(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, work: StockWork): StockResult {
  const w = stockWorkSchema.parse(work), facts = buildStockFacts(scope, period, imports, runId), closing = period.closingDate;
  const visited = new Map(facts.sites.map(s => [s.site, s.countLines > 0]));
  const units: StockUnitResult[] = facts.units.map((u: StUnitFact) => {
    const countCategories = [...new Set(u.counts.map(c => c.category))].sort(), systemCategory = u.system?.category ?? null;
    const site = facts.sites.find(s => s.site === u.site)!, countDate = site.countDate;
    const counted = u.counts.length ? u.counts.reduce((n, c) => n + BigInt(c.quantity), 0n) : null;
    const uoms = { count: [...new Set(u.counts.map(c => c.uomLabel))], system: u.system?.uomLabel ?? null, movements: [...new Set(u.movements.map(m => m.uomLabel))] };
    const normalized = new Set([...u.counts.map(c => c.uom), ...(u.system ? [u.system.uom] : []), ...u.movements.map(m => m.uom)]);
    const base = {
      unitId: u.unitId, reference: u.reference, site: u.site, lot: u.lot, label: u.label, countCategories, systemCategory, uoms,
      uom: normalized.size === 1 ? (u.counts[0]?.uomLabel ?? u.system?.uomLabel ?? u.movements[0]?.uomLabel ?? null) : null,
      countDate: u.counts.length ? countDate : null, counted: counted === null ? null : String(counted),
      countLines: u.counts.map(c => ({ ...ref(c), uomLabel: c.uomLabel, category: c.category, sheetRef: c.sheetRef })),
      system: u.system ? { ...ref(u.system), uomLabel: u.system.uomLabel, category: u.system.category, reason: u.system.reason } : null,
      systemQuantity: u.system ? u.system.quantity : null,
    };
    const noMovement = { direction: "none" as const, window: null, coverage: "not_needed" as const, inQty: null, outQty: null, lines: u.movements.map(m => ({ ...ref(m), uomLabel: m.uomLabel, direction: m.direction, pieceRef: m.pieceRef, inWindow: false })) };
    const done = (status: StockStatus, extra: Partial<StockUnitResult> = {}): StockUnitResult => ({ ...base, category: systemCategory ?? countCategories[0] ?? "own", movements: noMovement, expectedClosing: null, difference: null, status, inScope: true, reason: "", ...extra });
    // Ownership: a unit counted under one status and carried under another, or counted under two statuses, is a discrepancy to explain.
    if ((systemCategory && countCategories.some(c => c !== systemCategory)) || countCategories.length > 1)
      return done("ownership_mismatch", { reason: "Statut compté (" + countCategories.join(", ") + ") différent du statut théorique (" + (systemCategory ?? "absent") + ")." });
    const category = systemCategory ?? countCategories[0];
    if (category !== "own") return done("excluded", { category, inScope: false, reason: ST_CATEGORY_EXCLUSIONS[category] + (category === "excluded" && u.system?.reason ? " Motif : " + u.system.reason : "") });
    if (!visited.get(u.site)) return done("site_not_visited", { inScope: false, reason: ST_SITE_NOT_VISITED });
    if (counted === null) return done("not_counted", { reason: "Site visité mais référence absente des feuilles de comptage : la quantité réelle reste inconnue, jamais nulle." });
    if (normalized.size > 1) return done("unit_incompatible", { reason: "Unités différentes (comptage : " + uoms.count.join(", ") + " ; théorique : " + (uoms.system ?? "—") + (uoms.movements.length ? " ; mouvements : " + uoms.movements.join(", ") : "") + "). Aucune conversion n’est appliquée sans facteur documenté." });
    const { direction, window } = movementWindow(countDate!, closing, w.sameDay);
    const inWindow = (date: string) => !!window && date >= window.from && date <= window.to;
    const lines = u.movements.map(m => ({ ...ref(m), uomLabel: m.uomLabel, direction: m.direction, pieceRef: m.pieceRef, inWindow: inWindow(m.date) }));
    const coverage = !window ? "not_needed" as const : !facts.coverage ? "missing_journal" as const : facts.coverage.from <= window.from && facts.coverage.to >= window.to ? "covered" as const : "not_covered" as const;
    if (coverage === "missing_journal" || coverage === "not_covered") return done("movements_incomplete", { movements: { direction, window, coverage, inQty: null, outQty: null, lines },
      reason: coverage === "missing_journal" ? "Comptage du " + countDate + " et clôture du " + closing + " : aucun journal de mouvements intercalaires approuvé. La quantité de clôture reste inconnue."
        : "Le journal couvre du " + facts.coverage!.from + " au " + facts.coverage!.to + " ; la période " + window!.from + " → " + window!.to + " n’est pas entièrement couverte." });
    const sum = (d: "in" | "out") => lines.filter(l => l.inWindow && l.direction === d).reduce((n, l) => n + BigInt(l.quantity), 0n);
    const inQty = sum("in"), outQty = sum("out"), expected = direction === "backward" ? counted - inQty + outQty : counted + inQty - outQty;
    const movements = { direction: window ? direction : "none" as const, window, coverage, inQty: String(inQty), outQty: String(outQty), lines };
    if (!u.system) return done("not_in_system", { movements, expectedClosing: String(expected), reason: "Référence comptée absente de l’état théorique : quantité système inconnue." });
    const difference = expected - BigInt(u.system.quantity);
    return done(difference === 0n ? "matched" : "quantity_difference", { movements, expectedClosing: String(expected), difference: String(difference) });
  });
  // Net and gross differences per reference and counting unit: a net total never hides opposite differences.
  const groups = new Map<string, { reference: string; uom: string; diffs: bigint[] }>();
  for (const u of units) if (u.difference !== null && u.uom) { const k = u.reference + "\u0000" + u.uom; const g = groups.get(k) ?? { reference: u.reference, uom: u.uom, diffs: [] }; g.diffs.push(BigInt(u.difference)); groups.set(k, g); }
  const references = [...groups.values()].map(g => { const net = g.diffs.reduce((n, d) => n + d, 0n), gross = g.diffs.reduce((n, d) => n + abs(d), 0n);
    return { reference: g.reference, uom: g.uom, units: g.diffs.length, net: String(net), gross: String(gross), compensated: gross > 0n && abs(net) < gross }; }).sort((a, b) => a.reference < b.reference ? -1 : 1);
  const unknown = (reason: string) => ({ kind: "unknown" as const, reason });
  const exceptions: StockResult["exceptions"] = [];
  for (const u of units) {
    const where = u.reference + " · " + u.site + (u.lot ? " · lot " + u.lot : "");
    if (u.status === "quantity_difference") exceptions.push({ id: "QTY:" + u.unitId, code: "QUANTITY_DIFFERENCE", unitId: u.unitId, label: "Écart de quantité — " + where,
      message: "Clôture reconstituée " + formatQuantity(u.expectedClosing, u.uom) + " ; théorique " + formatQuantity(u.systemQuantity, u.uom) + " ; écart " + formatQuantity(u.difference, u.uom, { signed: true }) + ". Écart arithmétique à expliquer, non validé comme anomalie.",
      amount: unknown("Écart de " + formatQuantity(u.difference, u.uom, { signed: true }) + " — valeur non établie dans le sous-lot « quantités et mouvements »") });
    if (u.status === "not_in_system") exceptions.push({ id: "SYS:" + u.unitId, code: "NOT_IN_SYSTEM", unitId: u.unitId, label: "Comptée, absente de l’état théorique — " + where, message: u.reason + " Clôture reconstituée " + formatQuantity(u.expectedClosing, u.uom) + ".", amount: unknown("Quantité système inconnue") });
    if (u.status === "ownership_mismatch") exceptions.push({ id: "OWN:" + u.unitId, code: "OWNERSHIP_MISMATCH", unitId: u.unitId, label: "Écart de propriété — " + where, message: u.reason + " La quantité n’est pas testée tant que la propriété n’est pas établie.", amount: unknown("Propriété à établir") });
    if (u.status === "unit_incompatible") exceptions.push({ id: "UOM:" + u.unitId, code: "UNIT_INCOMPATIBLE", unitId: u.unitId, label: "Unité incompatible — " + where, message: u.reason, amount: unknown("Comparaison bloquée") });
    if (u.status === "movements_incomplete") exceptions.push({ id: "MVT:" + u.unitId, code: "MOVEMENTS_INCOMPLETE", unitId: u.unitId, label: "Mouvements incomplets — " + where, message: u.reason, amount: unknown("Quantité de clôture inconnue") });
    if (u.status === "not_counted") exceptions.push({ id: "CNT:" + u.unitId, code: "NOT_COUNTED", unitId: u.unitId, label: "Non comptée — " + where, message: u.reason, amount: unknown("Quantité réelle inconnue") });
  }
  for (const r of references) if (r.compensated && r.units > 1) exceptions.push({ id: "NET:" + r.reference + ":" + r.uom, code: "NET_COMPENSATED", unitId: null, label: "Écarts compensés — " + r.reference,
    message: "Total net " + formatQuantity(r.net, r.uom, { signed: true }) + " pour des écarts bruts de " + formatQuantity(r.gross, r.uom) + " sur " + r.units + " sites ou lots : le total net ne justifie aucun écart individuel.", amount: unknown("Écarts compensés à expliquer un par un") });
  for (const s of facts.sites) if (!visited.get(s.site) && units.some(u => u.site === s.site && u.status === "site_not_visited")) exceptions.push({ id: "SITE:" + s.site, code: "SITE_NOT_VISITED", unitId: null, label: "Site non visité — " + s.site, message: ST_SITE_NOT_VISITED, amount: unknown("Quantités du site non testées") });
  const totals = Object.fromEntries(ST_STATUSES.map(s => [s, units.filter(u => u.status === s).length])) as StockResult["totals"];
  // Sub-lot 2: with a cost list or a ledger, quantity differences are valued at the documented cost and the stated values are framed.
  const { valuation, exceptions: valueExceptions, quantityValue } = valueStocks(facts, units);
  for (const e of exceptions) {
    const v = e.unitId ? quantityValue.get(e.unitId) : undefined;
    if (e.code !== "QUANTITY_DIFFERENCE" || !v) continue;
    e.message += " Valorisé " + formatCents(String(v.cents), { signed: true }) + " au coût documenté de " + formatCents(v.cost.quantity) + " (" + (ST_COST_METHOD_LABELS[v.cost.method] ?? v.cost.method) + (v.cost.pieceRef ? ", " + v.cost.pieceRef : "") + ") : écart potentiel.";
    e.amount = { kind: "known", value: money(v.cents) };
  }
  exceptions.push(...valueExceptions);
  // Sub-lot 3: with frozen value hypotheses, the indicative gap is compared with the booked depreciation — nothing is booked.
  const { review: valueReview, exceptions: reviewExceptions } = reviewStockValue(facts, units, closing);
  exceptions.push(...reviewExceptions);
  const evidence = [...new Map([...facts.units.flatMap(u => [...u.counts, ...(u.system ? [u.system] : []), ...u.movements]), ...(facts.costs ?? []), ...(facts.ledger ?? []), ...(facts.values ?? [])].map(f => [f.proof.id, f.proof])).values()];
  return stockResultSchema.parse({
    schemaVersion: "stocks-result-2", valuation, valueReview, scope, runId, closingDate: closing, convention: { sameDay: w.sameDay, instructions: w.instructions }, coverage: facts.coverage,
    sites: facts.sites.map(s => ({ site: s.site, countDate: s.countDate, visited: !!visited.get(s.site), countLines: s.countLines, systemLines: s.systemLines, units: units.filter(u => u.site === s.site).length })),
    units, references, totals, exceptions, evidence,
    method: [ST_METHOD_TEXT, ...(valuation ? [ST_VALUE_METHOD_TEXT] : []), ...(valueReview ? [ST_REVIEW_METHOD_TEXT] : [])].join(" "),
    limitations: [...(valuation ? ST_LIMITATIONS.filter(l => !l.includes("valeur relève du sous-lot")) : ST_LIMITATIONS).filter(l => !(valueReview && l.startsWith("Aucune dépréciation n’est calculée"))), ...(valuation ? ST_VALUE_LIMITATIONS : []), ...(valueReview ? ST_REVIEW_LIMITATIONS : [])],
  });
}
