import { z } from "zod";
import { dateSchema, proofSchema } from "./cycle-review";
import { knownAmountSchema, scopeSchema, type EvidenceLink } from "./model";
import { ST_CATEGORIES, type StockCategory } from "./stock-population";

/**
 * Contract of the stock sheet (Mission 15, sub-lot 1 « quantités et mouvements »). Browser-safe: no engine and no
 * server-only import, so the workspace can type the server result without recomputing it.
 * Quantities are integer HUNDREDTHS of the counting unit, carried as strings; they are never monetary amounts.
 */
export const STOCK_PROCEDURE = "stocks.count" as const;
const id = z.string().trim().min(1).max(200), text = z.string().trim().min(1).max(2000);
const qty = z.string().regex(/^-?(0|[1-9]\d*)$/);
export const ST_SAME_DAY = ["before_count", "after_count"] as const;
export type StockSameDay = typeof ST_SAME_DAY[number];
export const ST_SAME_DAY_LABELS: Record<StockSameDay, string> = {
  before_count: "Mouvements datés du jour du comptage réputés antérieurs au comptage (déjà compris dans les quantités comptées)",
  after_count: "Mouvements datés du jour du comptage réputés postérieurs au comptage (à ajouter ou retrancher)",
};
export const stockCitationInputSchema = z.object({ documentId: id, rowId: id.optional() }).strict();
export type StockCitationInput = z.infer<typeof stockCitationInputSchema>;
export const stockCitationSchema = z.object({ documentVersionId: id, importId: id, fileName: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowId: id.optional(), row: z.number().int().positive().optional(), cell: z.string().max(40).optional(), page: z.number().int().positive().optional(), zone: z.string().max(80).optional() }).strict();
export type StockCitation = z.infer<typeof stockCitationSchema>;
/** What the preparer decides: the same-day convention, cited from the inventory instructions. Nothing else is typed. */
export const stockDraftSchema = z.object({ sameDay: z.enum(ST_SAME_DAY), instructions: stockCitationInputSchema }).strict();
export type StockDraft = z.infer<typeof stockDraftSchema>;
export const stockWorkSchema = z.object({ schemaVersion: z.literal("stocks-1"), sameDay: z.enum(ST_SAME_DAY), instructions: stockCitationSchema,
  configuredBy: id, configuredAt: z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis") }).strict();
export type StockWork = z.infer<typeof stockWorkSchema>;
export const stockDraftFromWork = (w: StockWork): StockDraft => ({ sameDay: w.sameDay, instructions: { documentId: w.instructions.documentVersionId, ...(w.instructions.rowId ? { rowId: w.instructions.rowId } : {}) } });

export const ST_STATUSES = ["matched", "quantity_difference", "not_in_system", "ownership_mismatch", "unit_incompatible", "movements_incomplete", "not_counted", "excluded", "site_not_visited"] as const;
export type StockStatus = typeof ST_STATUSES[number];
export const ST_STATUS_LABELS: Record<StockStatus, string> = {
  matched: "Sans écart de quantité", quantity_difference: "Écart de quantité", not_in_system: "Comptée, absente du théorique", ownership_mismatch: "Écart de propriété",
  unit_incompatible: "Unité incompatible — bloqué", movements_incomplete: "Mouvements incomplets — non concluant", not_counted: "Non comptée — non concluant",
  excluded: "Hors stock propre — présentée à part", site_not_visited: "Site non visité — non testé",
};
/** Kind of discrepancy a status carries, so the interface never relies on colour alone. */
export const ST_STATUS_KIND: Record<StockStatus, "ok" | "quantity" | "ownership" | "blocked" | "uncertain" | "apart"> = {
  matched: "ok", quantity_difference: "quantity", not_in_system: "quantity", ownership_mismatch: "ownership", unit_incompatible: "blocked", movements_incomplete: "uncertain", not_counted: "uncertain", excluded: "apart", site_not_visited: "apart",
};
export const ST_CATEGORY_LABELS: Record<StockCategory, string> = { own: "Stock propre", third_party: "Stock détenu pour le compte de tiers", consignment_in: "Consignation reçue", consignment_out: "Stock déposé chez un tiers",
  in_transit: "Stock en transit", work_in_progress: "En-cours de production", excluded: "Référence exclue" };
/** Exclusion texts are server constants: an excluded unit is listed with its motive, never silently dropped. */
export const ST_CATEGORY_EXCLUSIONS: Record<Exclude<StockCategory, "own">, string> = {
  third_party: "Stock détenu pour le compte de tiers : compté et présenté à part, hors stock propre. L’outil n’établit pas la propriété.",
  consignment_in: "Marchandises reçues en consignation : propriété du déposant, présentées à part.",
  consignment_out: "Stock déposé chez un tiers : non compté sur site ; confirmation ou procédure alternative à documenter.",
  in_transit: "Stock en transit : non comptable physiquement ; rattachement à l’exercice relevant du cut-off, hors de ce test.",
  work_in_progress: "En-cours de production : avancement non mesuré par un comptage de quantités ; hors de ce test.",
  excluded: "Référence exclue par l’état théorique, avec le motif indiqué dans la source.",
};
export const ST_SITE_NOT_VISITED = "Site non visité : aucune feuille de comptage pour ce site. Quantités non testées ; procédure alternative à documenter (NEP 501 § 06).";

const lineRef = { importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), key: id, quantity: qty, date: dateSchema };
const countLineSchema = z.object({ ...lineRef, uomLabel: text, category: z.enum(ST_CATEGORIES), sheetRef: z.string().max(200) }).strict();
const systemLineSchema = z.object({ ...lineRef, uomLabel: text, category: z.enum(ST_CATEGORIES), reason: z.string().max(2000) }).strict();
const movementLineSchema = z.object({ ...lineRef, uomLabel: text, direction: z.enum(["in", "out"]), pieceRef: z.string().max(200), inWindow: z.boolean() }).strict();
export const stockUnitResultSchema = z.object({
  unitId: id, reference: id, site: id, lot: z.string().max(120), label: z.string().max(300),
  category: z.enum(ST_CATEGORIES), countCategories: z.array(z.enum(ST_CATEGORIES)), systemCategory: z.enum(ST_CATEGORIES).nullable(),
  uom: z.string().nullable(), uoms: z.object({ count: z.array(z.string()), system: z.string().nullable(), movements: z.array(z.string()) }).strict(),
  countDate: dateSchema.nullable(), counted: qty.nullable(), countLines: z.array(countLineSchema), system: systemLineSchema.nullable(),
  movements: z.object({ direction: z.enum(["forward", "backward", "none"]), window: z.object({ from: dateSchema, to: dateSchema }).strict().nullable(),
    coverage: z.enum(["not_needed", "covered", "missing_journal", "not_covered"]), inQty: qty.nullable(), outQty: qty.nullable(), lines: z.array(movementLineSchema) }).strict(),
  expectedClosing: qty.nullable(), systemQuantity: qty.nullable(), difference: qty.nullable(),
  status: z.enum(ST_STATUSES), inScope: z.boolean(), reason: z.string().max(2000),
}).strict();
export type StockUnitResult = z.infer<typeof stockUnitResultSchema>;
export const ST_EXCEPTION_CODES = ["QUANTITY_DIFFERENCE", "NOT_IN_SYSTEM", "OWNERSHIP_MISMATCH", "NET_COMPENSATED", "UNIT_INCOMPATIBLE", "MOVEMENTS_INCOMPLETE", "NOT_COUNTED", "SITE_NOT_VISITED",
  // Sub-lot 2 « coûts et cadrage »
  "PRICE_DIFFERENCE", "VALUE_ON_NOT_OWNED", "FRAMING_DIFFERENCE", "NET_COMPENSATED_VALUE", "COST_MISSING", "COST_UNIT_INCOMPATIBLE", "FRAMING_INCOMPLETE",
  // Sub-lot 3 « revue de valeur »
  "VALUE_REVIEW_DIFFERENCE", "DEPRECIATION_FRAMING_DIFFERENCE", "VALUE_HYPOTHESIS_MISSING", "VALUE_REVIEW_INCOMPLETE",
  // Rule 1.1.0 (C08): estimate on an unreconciled quantity; economic gap beyond the carrying amount, to be qualified
  "VALUE_QUANTITY_UNRESOLVED", "VALUE_EXCESS_TO_QUALIFY"] as const;
export type StockExceptionCode = typeof ST_EXCEPTION_CODES[number];
/** Codes that leave a part of the test unknown: they make the sheet inconclusive, never a validated anomaly. */
export const ST_UNCERTAINTY_CODES: StockExceptionCode[] = ["UNIT_INCOMPATIBLE", "MOVEMENTS_INCOMPLETE", "NOT_COUNTED", "SITE_NOT_VISITED", "COST_MISSING", "COST_UNIT_INCOMPATIBLE", "FRAMING_INCOMPLETE", "VALUE_HYPOTHESIS_MISSING", "VALUE_REVIEW_INCOMPLETE", "VALUE_QUANTITY_UNRESOLVED"];
const cents = z.string().regex(/^-?(0|[1-9]\d*)$/);
export const ST_VALUE_KIND_LABELS: Record<string, string> = { prix_post_cloture: "Prix de vente postérieur à la clôture", tarif: "Tarif ou liste de prix", devis: "Devis ou offre", estimation_direction: "Estimation de la direction" };
/**
 * Rule of the stock sheet. 1.1.0 (C08): value review bounded at the carrying amount, quantity basis and cost / hypothesis
 * fallback made explicit, populations carried by the totals. Results of 1.0.0 stay readable and become stale.
 */
export const STOCK_RULE_VERSION = "1.1.0" as const;
/** Results written before C08 (`stocks-result-1`, `stocks-result-2`) stay readable; every new execution writes `stocks-result-3`. */
export const STOCK_RESULT_SCHEMA_VERSION = "stocks-result-3" as const;
/** Which line documents a cost or a value hypothesis: the unit's lot, the reference (unit without lot), or the reference as a fallback for a lot. */
export const ST_LINE_BASES = ["lot", "reference", "reference_fallback"] as const;
export type StockLineBasis = typeof ST_LINE_BASES[number];
export const ST_COST_BASIS_LABELS: Record<StockLineBasis, string> = { lot: "Coût propre au lot", reference: "Coût de la référence", reference_fallback: "Repli : coût de la référence (ligne sans lot), aucun coût propre à ce lot" };
export const ST_HYPOTHESIS_BASIS_LABELS: Record<StockLineBasis, string> = { lot: "Hypothèse propre au lot", reference: "Hypothèse de la référence", reference_fallback: "Repli : hypothèse de la référence (ligne sans lot), aucune hypothèse propre à ce lot" };
/** Capacity of the cost sub-lot: a declared cost is displayed, never rebuilt from transactions. */
export const ST_COST_CAPACITY_TEXT = "Coût déclaré par la pièce citée, avec la méthode que la source indique : l’outil ne reconstitue ni coût moyen pondéré ni premier entré, premier sorti. Une reconstitution exigerait le stock d’ouverture valorisé, les entrées valorisées et les sorties de l’exercice, que les sources Stocks ne portent pas (le journal intercalaire ne porte que des quantités).";
export const ST_QUANTITY_BASES = ["reconciled", "theoretical_unreconciled", "unknown"] as const;
export type StockQuantityBasis = typeof ST_QUANTITY_BASES[number];
export const ST_QUANTITY_BASIS_LABELS: Record<StockQuantityBasis, string> = {
  reconciled: "Quantité théorique rapprochée (égale à la quantité reconstituée à la clôture)",
  theoretical_unreconciled: "Quantité théorique non rapprochée : estimation partielle",
  unknown: "Quantité théorique inconnue : aucune estimation",
};
export const ST_REVIEW_STATUSES = ["no_gap", "gap", "gap_partial", "booked_without_hypothesis", "not_reviewed", "cost_missing", "unit_incompatible", "not_in_system"] as const;
export type StockReviewStatus = typeof ST_REVIEW_STATUSES[number];
export const ST_REVIEW_STATUS_LABELS: Record<StockReviewStatus, string> = {
  gap: "Valeur actuelle selon l’hypothèse inférieure au coût — quantité rapprochée", gap_partial: "Valeur actuelle inférieure au coût — estimation partielle, quantité non rapprochée",
  no_gap: "Valeur actuelle selon l’hypothèse au moins égale au coût", booked_without_hypothesis: "Dépréciation comptabilisée sans hypothèse", not_reviewed: "Non revue",
  cost_missing: "Coût absent — revue incomplète", unit_incompatible: "Unités incompatibles — revue incomplète", not_in_system: "Absente de l’état théorique — revue incomplète",
};
const lineRefShape = { importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), date: dateSchema };
const amountsSchema = z.object({ economicGapCents: cents, assetImpairmentCents: cents, excessCents: cents }).strict();
/**
 * Sub-lot 3 « revue de valeur », rule 1.1.0 (C08). For each reviewed reference / site / lot, on the quantity actually used:
 * (1) economic gross comparison = (documented cost − current value according to the cited hypothesis) × quantity;
 * (2) loss of value of the asset = (1) bounded at the carrying amount (quantity × documented cost);
 * (3) excess = (1) − (2), a possible distinct obligation to be qualified, never a depreciation nor an automatic provision.
 * Only (2) is compared with the booked depreciation. A negative current value is kept as such.
 */
export const stockValueReviewSchema = z.object({
  hypothesesProvided: z.literal(true), depreciationMapped: z.boolean(),
  units: z.array(z.object({ unitId: id, status: z.enum(ST_REVIEW_STATUSES),
    hypothesis: z.object({ ...lineRefShape, sellingPriceCents: cents, exitCostsCents: cents, currentValueCents: cents, kind: text, pieceRef: z.string().max(200), justification: text, lot: z.string().max(120),
      uomLabel: text, basis: z.enum(ST_LINE_BASES) }).strict().nullable(),
    cost: z.object({ ...lineRefShape, unitCostCents: cents, uomLabel: text, method: text, capacity: z.literal("declared"), pieceRef: z.string().max(200), lot: z.string().max(120), basis: z.enum(ST_LINE_BASES) }).strict().nullable(),
    quantity: z.object({ theoretical: qty.nullable(), counted: qty.nullable(), countDate: dateSchema.nullable(), reconstituted: qty.nullable(), difference: qty.nullable(), used: qty.nullable(),
      basis: z.enum(ST_QUANTITY_BASES), uomLabel: z.string().nullable(), quantityStatus: z.enum(ST_STATUSES) }).strict(),
    statedValueCents: cents.nullable(), carryingCents: cents.nullable(), economicGapCents: cents.nullable(), assetImpairmentCents: cents.nullable(), excessCents: cents.nullable(),
    /** Same comparison on the reconstituted quantity when the theoretical one is not reconciled and the reconstituted one is known. */
    alternative: z.object({ quantity: qty, carryingCents: cents, ...amountsSchema.shape }).strict().nullable(),
    bookedCents: cents.nullable(), differenceCents: cents.nullable(), judgmentBasis: text,
    rotation: z.object({ lastMovement: dateSchema, days: z.number().int().nonnegative() }).strict().nullable() }).strict()),
  totals: z.object({
    units: z.object({ tested: z.number().int().nonnegative(), complete: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), incomplete: z.number().int().nonnegative(),
      bookedWithoutHypothesis: z.number().int().nonnegative(), notReviewed: z.number().int().nonnegative(), excluded: z.number().int().nonnegative(), ownershipMismatch: z.number().int().nonnegative() }).strict(),
    /** Reconciled quantities only; `partial` carries the estimates made on an unreconciled theoretical quantity, never added to `complete`. */
    complete: amountsSchema, partial: amountsSchema,
    notReviewedCostCents: cents, notReviewedUnknown: z.number().int().nonnegative(),
    excluded: z.array(z.object({ group: z.enum([...ST_CATEGORIES, "site_not_visited", "ownership_mismatch"] as const), units: z.number().int().positive(), statedValueCents: cents.nullable(), unknownValues: z.number().int().nonnegative() }).strict()),
    bookedCents: cents.nullable(), ledgerDepreciationCents: cents.nullable(), depreciationFramingDifferenceCents: cents.nullable() }).strict(),
}).strict().superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message }), n = (v: string | null) => v === null ? null : BigInt(v);
  for (const u of r.units) {
    const economic = n(u.economicGapCents), carrying = n(u.carryingCents), asset = n(u.assetImpairmentCents), excess = n(u.excessCents);
    if (economic !== null && (carrying === null || asset === null || excess === null || asset !== (economic < carrying ? economic : carrying) || excess !== economic - asset || asset < 0n || excess < 0n)) issue("Bornage incohérent pour " + u.unitId);
    if (u.differenceCents !== null && (asset === null || u.bookedCents === null || BigInt(u.differenceCents) !== asset - BigInt(u.bookedCents))) issue("Différence incohérente pour " + u.unitId);
    if ((u.status === "gap") !== (u.quantity.basis === "reconciled" && economic !== null && economic > 0n)) issue("Statut d’écart incohérent pour " + u.unitId);
    if (u.status === "gap_partial" && (u.quantity.basis !== "theoretical_unreconciled" || economic === null || economic <= 0n)) issue("Estimation partielle incohérente pour " + u.unitId);
    if (u.alternative) { const a = u.alternative, e = BigInt(a.economicGapCents), c = BigInt(a.carryingCents);
      if (u.quantity.basis !== "theoretical_unreconciled" || BigInt(a.assetImpairmentCents) !== (e < c ? e : c) || BigInt(a.excessCents) !== e - BigInt(a.assetImpairmentCents)) issue("Alternative incohérente pour " + u.unitId); }
  }
});
export type StockValueReview = z.infer<typeof stockValueReviewSchema>;
export type StockValueReviewUnit = StockValueReview["units"][number];
/**
 * Value review written by rule 1.0.0 (`stocks-result-2`): the indicative gap was neither bounded at the carrying amount
 * nor tied to a reconciled quantity. Kept readable only; a revision re-executes the sheet under the current rule.
 */
export const stockValueReviewLegacySchema = z.object({
  hypothesesProvided: z.literal(true), depreciationMapped: z.boolean(),
  units: z.array(z.object({ unitId: id,
    hypothesis: z.object({ importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), date: dateSchema,
      sellingPriceCents: cents, exitCostsCents: cents, currentValueCents: cents, kind: text, pieceRef: z.string().max(200), justification: text, lot: z.string().max(120) }).strict().nullable(),
    costCents: cents.nullable(), systemQuantity: z.string().nullable(), unitGapCents: cents.nullable(), indicativeGapCents: cents.nullable(), bookedCents: cents.nullable(), differenceCents: cents.nullable(),
    rotation: z.object({ lastMovement: dateSchema, days: z.number().int().nonnegative() }).strict().nullable(),
    status: z.enum(["no_gap", "gap", "booked_without_hypothesis", "not_reviewed", "cost_missing", "unit_incompatible"]) }).strict()),
  totals: z.object({ reviewed: z.number().int().nonnegative(), notReviewed: z.number().int().nonnegative(), indicativeGapCents: cents, bookedCents: cents.nullable(),
    ledgerDepreciationCents: cents.nullable(), depreciationFramingDifferenceCents: cents.nullable() }).strict(),
}).strict();
export type StockValueReviewLegacy = z.infer<typeof stockValueReviewLegacySchema>;
export const isLegacyValueReview = (r: StockValueReview | StockValueReviewLegacy): r is StockValueReviewLegacy => !("excluded" in r.totals);
/** Labels of the declared method: the tool displays it, never recomputes it (capacity: declared cost, not a reconstitution). */
export const ST_COST_METHOD_LABELS: Record<string, string> = { cmp: "Coût moyen pondéré déclaré (PCG art. 213-34, 214-26) — non reconstitué", peps: "Premier entré, premier sorti déclaré (PCG art. 213-34, 214-26) — non reconstitué",
  identification_specifique: "Identification spécifique déclarée (PCG art. 213-33)", cout_standard: "Coût standard déclaré (PCG art. 213-35, si proche du coût)", prix_de_detail: "Prix de détail déclaré (PCG art. 213-35, si proche du coût)" };
const lineRefSchema = z.object({ importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), date: dateSchema }).strict();
/**
 * Sub-lot 2 « coûts et cadrage ». Every amount is integer euro CENTS carried as a string; a value is quantity
 * (hundredths) × documented unit cost (cents) ÷ 100, rounded half away from zero to the cent (internal convention).
 */
export const stockValuationSchema = z.object({
  costsProvided: z.boolean(), ledgerProvided: z.boolean(), valueMapped: z.boolean(),
  units: z.array(z.object({ unitId: id, account: z.string().max(20), owned: z.boolean(),
    // `basis` and `capacity` are written from rule 1.1.0 on (C08); a 1.0.0 result applied the reference cost to a lot silently.
    cost: z.object({ ...lineRefSchema.shape, unitCostCents: cents, uomLabel: text, method: text, pieceRef: z.string().max(200), lot: z.string().max(120),
      basis: z.enum(ST_LINE_BASES).optional(), capacity: z.literal("declared").optional() }).strict().nullable(),
    costStatus: z.enum(["documented", "missing", "unit_incompatible", "not_tested"]),
    expectedValueCents: cents.nullable(), systemValueCents: cents.nullable(), recalculatedSystemValueCents: cents.nullable(),
    quantityDifferenceValueCents: cents.nullable(), priceDifferenceCents: cents.nullable() }).strict()),
  accounts: z.array(z.object({ account: id, systemValueCents: cents.nullable(), ledgerCents: cents.nullable(), differenceCents: cents.nullable(), lines: z.number().int().nonnegative(),
    notOwnedCents: cents, status: z.enum(["framed", "difference", "ledger_missing", "system_missing", "values_missing"]), ledger: lineRefSchema.nullable(), methods: z.array(text) }).strict()),
  depreciation: z.array(z.object({ account: id, ledgerCents: cents, ledger: lineRefSchema }).strict()),
  references: z.array(z.object({ reference: id, net: cents, gross: cents, compensated: z.boolean(), units: z.number().int().positive() }).strict()),
  totals: z.object({ netQuantityDifferenceCents: cents, grossQuantityDifferenceCents: cents, compensated: z.boolean(), valuedDifferences: z.number().int().nonnegative(),
    priceDifferenceNetCents: cents, systemValueCents: cents.nullable(), ledgerCents: cents.nullable(),
    /** Rule 1.1.0: the population behind the value totals — units valued, units whose value stays unknown, units not tested and the value carried for goods not owned. */
    population: z.object({ tested: z.number().int().nonnegative(), valued: z.number().int().nonnegative(), unknown: z.number().int().nonnegative(), notTested: z.number().int().nonnegative(),
      // Known values only; null when goods not owned exist and none of their values is known (value column unmapped or empty).
      notOwnedValueCents: cents.nullable(), notOwnedUnknown: z.number().int().nonnegative() }).strict().optional() }).strict(),
}).strict();
export type StockValuation = z.infer<typeof stockValuationSchema>;
export const stockResultSchema = z.object({
  schemaVersion: z.enum(["stocks-result-1", "stocks-result-2", STOCK_RESULT_SCHEMA_VERSION]), scope: scopeSchema, runId: id, closingDate: dateSchema,
  convention: z.object({ sameDay: z.enum(ST_SAME_DAY), instructions: stockCitationSchema }).strict(),
  coverage: z.object({ from: dateSchema, to: dateSchema, importId: id, fileName: z.string().min(1).max(300) }).strict().nullable(),
  sites: z.array(z.object({ site: id, countDate: dateSchema.nullable(), visited: z.boolean(), countLines: z.number().int().nonnegative(), systemLines: z.number().int().nonnegative(), units: z.number().int().nonnegative() }).strict()),
  units: z.array(stockUnitResultSchema),
  references: z.array(z.object({ reference: id, uom: z.string(), units: z.number().int().positive(), net: qty, gross: qty, compensated: z.boolean() }).strict()),
  totals: z.record(z.enum(ST_STATUSES), z.number().int().nonnegative()),
  exceptions: z.array(z.object({ id, code: z.enum(ST_EXCEPTION_CODES), label: text, message: text, unitId: z.string().nullable(), amount: knownAmountSchema }).strict()),
  // The method joins the texts of the sub-lots run (quantities, costs, value review): longer than a single note.
  evidence: z.array(proofSchema), method: z.string().trim().min(1).max(6000), limitations: z.array(text),
  /** Absent in sub-lot 1 results; null when no cost list and no ledger were frozen. */
  valuation: stockValuationSchema.nullable().optional(),
  /** Absent before sub-lot 3; null when no value hypotheses were frozen. The 1.0.0 shape is kept readable for older results. */
  valueReview: z.union([stockValueReviewSchema, stockValueReviewLegacySchema]).nullable().optional(),
}).strict().superRefine((r, ctx) => {
  if (r.schemaVersion !== STOCK_RESULT_SCHEMA_VERSION) return;
  // The current contract carries the bounded review, the cost basis and the value populations.
  if (r.valueReview && isLegacyValueReview(r.valueReview)) ctx.addIssue({ code: "custom", message: "Revue de valeur au contrat 1.0.0 dans un résultat 1.1.0" });
  if (r.valuation && (!r.valuation.totals.population || r.valuation.units.some(u => u.cost && (!u.cost.basis || !u.cost.capacity)))) ctx.addIssue({ code: "custom", message: "Base de coût ou population absente d’un résultat 1.1.0" });
});
export type StockResult = z.infer<typeof stockResultSchema>;

export function stockOutcome(r: StockResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  if (r.exceptions.some(e => !ST_UNCERTAINTY_CODES.includes(e.code))) return "exceptions_detected";
  return r.exceptions.length ? "inconclusive" : "no_exception_detected";
}
export const stockResultEvidence = (r: StockResult): EvidenceLink[] => r.evidence.map(e => ({ ...e }));
export const ST_METHOD_TEXT = "Quantité de clôture reconstituée = quantité comptée à la date de comptage du site + entrées − sorties jusqu’à la clôture (ou − entrées + sorties entre la clôture et un comptage postérieur), comparée à la quantité théorique de la référence / site / lot. Méthode interne de calcul : ni la loi (Code de commerce, art. L123-12) ni la NEP 501 ne fixent une formule.";
export const ST_LIMITATIONS = [
  "Une quantité comptée transcrite dans une feuille ne prouve pas la présence physique : l’outil ne certifie jamais l’existence des stocks.",
  "Un écart de quantité est un écart arithmétique à expliquer, pas une anomalie validée ; sa valeur relève du sous-lot « coûts et cadrage ».",
  "Aucune conversion d’unité n’est appliquée : cartons et unités ne sont jamais comparés sans facteur documenté (non couvert par ce sous-lot).",
  "Les stocks de tiers, consignations, transits, en-cours et références exclues sont présentés à part, jamais ajoutés au stock propre.",
  "Aucune dépréciation n’est calculée, ni sur la rotation ni autrement.",
];
export const ST_VALUE_METHOD_TEXT = "Valeur = quantité × coût unitaire documenté, arrondie au centime (demi-centime loin de zéro). Le coût retenu est celui du lot ; à défaut, la ligne de la référence sans lot, signalée comme repli ; jamais le coût d’un autre lot ou d’une autre référence. Écart de quantité valorisé = écart × coût : écart potentiel, non une anomalie validée. Écart de prix = valeur théorique déclarée − quantité théorique × coût documenté. Cadrage = somme des valeurs théoriques des lignes détenues par l’entité, par compte, comparée au solde du grand livre ; les comptes 39 (dépréciations) relèvent de la revue de valeur. Méthodes internes : la méthode de coût déclarée (PCG art. 213-33 à 213-35, 214-26) est affichée, jamais recalculée ni approuvée par l’outil.";
export const ST_VALUE_LIMITATIONS = [
  ST_COST_CAPACITY_TEXT,
  "Un coût par référence et lot s’applique à tous les sites ; un coût différent par site n’est pas couvert.",
  "Un écart valorisé est un écart potentiel à expliquer : ni anomalie validée ni correction comptable.",
];
export const ST_REVIEW_METHOD_TEXT = "Revue de valeur (règle 1.1.0) : valeur actuelle unitaire selon l’hypothèse citée = prix de vente estimé − coûts de sortie (valeur vénale nette des coûts de sortie, PCG art. 214-6 ; prix et perspectives de vente, art. 214-22) ; une valeur négative est conservée telle quelle. Sur la quantité retenue, trois montants distincts : (1) comparaison économique brute = (coût documenté − valeur actuelle) × quantité lorsque la valeur actuelle est inférieure au coût ; (2) perte de valeur de l’actif = (1) bornée à la valeur comptable de référence (quantité × coût documenté), la dépréciation constatant une valeur actuelle inférieure à la valeur nette comptable (art. 214-5) sans la porter sous zéro ; (3) complément = (1) − (2), obligation éventuelle distincte à qualifier (passif : art. 321-1, 322-1, 322-2, perte sur contrat art. 322-9 ; passif éventuel : art. 321-6, 322-5 ; pertes d’exploitation futures non provisionnées : art. 322-12), ni dépréciation ni provision automatique. Seule la perte de valeur de l’actif est comparée à la dépréciation comptabilisée. La quantité retenue est la quantité théorique ; elle est rapprochée lorsque la quantité reconstituée à la clôture lui est égale : sinon l’estimation est partielle, présentée aussi sur la quantité reconstituée quand elle est connue, et n’entre pas dans le total complet. Méthode interne de comparaison : l’outil ne propose ni ne comptabilise aucune dépréciation ni provision ; la rotation est un indice (art. 214-16), jamais un calcul.";
export const ST_REVIEW_LIMITATIONS = [
  "L’écart indicatif dépend entièrement de l’hypothèse citée : il n’est ni une dépréciation proposée ni une estimation validée ; le jugement humain motivé et cité reste requis.",
  "La borne à la valeur comptable de référence (quantité × coût documenté) est un choix interne ; une valeur théorique déclarée différente relève de l’écart de prix, à expliquer avant de conclure.",
  "Le complément au-delà de la valeur comptable n’est jamais converti en provision : son traitement (passif, passif éventuel en annexe ou perte future non provisionnée) relève de la qualification humaine.",
  "Aucune dépréciation n’est déduite de la rotation, de l’ancienneté ou d’un seuil : la date du dernier mouvement est affichée comme indice.",
  "La valeur d’usage (flux actualisés), les contrats de vente ferme (PCG art. 214-23) et les positions globales sur matières (art. 214-22) ne sont pas modélisés.",
];
/** Euro cents → French text ("-2400" → "−24,00 €"). */
export function formatCents(value: string | null, options: { signed?: boolean } = {}) {
  if (value === null) return "Inconnu";
  const n = BigInt(value), abs = n < 0n ? -n : n, whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return (n < 0n ? "−" : options.signed && n > 0n ? "+" : "") + whole + "," + (abs % 100n).toString().padStart(2, "0") + "\u00a0€";
}
/** Hundredths of a counting unit → French decimal text, without rounding ("9800" → "98", "-250" → "−2,5"). */
export function formatQuantity(hundredths: string | null, uom?: string | null, options: { signed?: boolean } = {}) {
  if (hundredths === null) return "Inconnue";
  const n = BigInt(hundredths), abs = n < 0n ? -n : n, whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"), frac = (abs % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const sign = n < 0n ? "−" : options.signed && n > 0n ? "+" : "";
  return sign + whole + (frac ? "," + frac : "") + (uom ? " " + uom : "");
}
