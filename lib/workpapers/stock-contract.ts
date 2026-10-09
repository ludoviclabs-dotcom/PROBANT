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
  "VALUE_REVIEW_DIFFERENCE", "DEPRECIATION_FRAMING_DIFFERENCE", "VALUE_HYPOTHESIS_MISSING", "VALUE_REVIEW_INCOMPLETE"] as const;
export type StockExceptionCode = typeof ST_EXCEPTION_CODES[number];
/** Codes that leave a part of the test unknown: they make the sheet inconclusive, never a validated anomaly. */
export const ST_UNCERTAINTY_CODES: StockExceptionCode[] = ["UNIT_INCOMPATIBLE", "MOVEMENTS_INCOMPLETE", "NOT_COUNTED", "SITE_NOT_VISITED", "COST_MISSING", "COST_UNIT_INCOMPATIBLE", "FRAMING_INCOMPLETE", "VALUE_HYPOTHESIS_MISSING", "VALUE_REVIEW_INCOMPLETE"];
const cents = z.string().regex(/^-?(0|[1-9]\d*)$/);
export const ST_VALUE_KIND_LABELS: Record<string, string> = { prix_post_cloture: "Prix de vente postérieur à la clôture", tarif: "Tarif ou liste de prix", devis: "Devis ou offre", estimation_direction: "Estimation de la direction" };
/**
 * Sub-lot 3 « revue de valeur ». For each reviewed reference / site / lot: the current value per unit according to the
 * preparer's cited hypothesis (selling price − exit costs, PCG art. 214-6), compared with the documented cost; the
 * indicative gap is compared with the booked depreciation. Nothing is proposed nor booked; rotation is an indicator only.
 */
export const stockValueReviewSchema = z.object({
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
export type StockValueReview = z.infer<typeof stockValueReviewSchema>;
export const ST_COST_METHOD_LABELS: Record<string, string> = { cmp: "Coût moyen pondéré (PCG art. 213-34)", peps: "Premier entré, premier sorti (PCG art. 213-34)", identification_specifique: "Identification spécifique (PCG art. 213-33)",
  cout_standard: "Coût standard (PCG art. 213-35, si proche du coût)", prix_de_detail: "Prix de détail (PCG art. 213-35, si proche du coût)" };
const lineRefSchema = z.object({ importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), date: dateSchema }).strict();
/**
 * Sub-lot 2 « coûts et cadrage ». Every amount is integer euro CENTS carried as a string; a value is quantity
 * (hundredths) × documented unit cost (cents) ÷ 100, rounded half away from zero to the cent (internal convention).
 */
export const stockValuationSchema = z.object({
  costsProvided: z.boolean(), ledgerProvided: z.boolean(), valueMapped: z.boolean(),
  units: z.array(z.object({ unitId: id, account: z.string().max(20), owned: z.boolean(),
    cost: z.object({ ...lineRefSchema.shape, unitCostCents: cents, uomLabel: text, method: text, pieceRef: z.string().max(200), lot: z.string().max(120) }).strict().nullable(),
    costStatus: z.enum(["documented", "missing", "unit_incompatible", "not_tested"]),
    expectedValueCents: cents.nullable(), systemValueCents: cents.nullable(), recalculatedSystemValueCents: cents.nullable(),
    quantityDifferenceValueCents: cents.nullable(), priceDifferenceCents: cents.nullable() }).strict()),
  accounts: z.array(z.object({ account: id, systemValueCents: cents.nullable(), ledgerCents: cents.nullable(), differenceCents: cents.nullable(), lines: z.number().int().nonnegative(),
    notOwnedCents: cents, status: z.enum(["framed", "difference", "ledger_missing", "system_missing", "values_missing"]), ledger: lineRefSchema.nullable(), methods: z.array(text) }).strict()),
  depreciation: z.array(z.object({ account: id, ledgerCents: cents, ledger: lineRefSchema }).strict()),
  references: z.array(z.object({ reference: id, net: cents, gross: cents, compensated: z.boolean(), units: z.number().int().positive() }).strict()),
  totals: z.object({ netQuantityDifferenceCents: cents, grossQuantityDifferenceCents: cents, compensated: z.boolean(), valuedDifferences: z.number().int().nonnegative(),
    priceDifferenceNetCents: cents, systemValueCents: cents.nullable(), ledgerCents: cents.nullable() }).strict(),
}).strict();
export type StockValuation = z.infer<typeof stockValuationSchema>;
export const stockResultSchema = z.object({
  schemaVersion: z.enum(["stocks-result-1", "stocks-result-2"]), scope: scopeSchema, runId: id, closingDate: dateSchema,
  convention: z.object({ sameDay: z.enum(ST_SAME_DAY), instructions: stockCitationSchema }).strict(),
  coverage: z.object({ from: dateSchema, to: dateSchema, importId: id, fileName: z.string().min(1).max(300) }).strict().nullable(),
  sites: z.array(z.object({ site: id, countDate: dateSchema.nullable(), visited: z.boolean(), countLines: z.number().int().nonnegative(), systemLines: z.number().int().nonnegative(), units: z.number().int().nonnegative() }).strict()),
  units: z.array(stockUnitResultSchema),
  references: z.array(z.object({ reference: id, uom: z.string(), units: z.number().int().positive(), net: qty, gross: qty, compensated: z.boolean() }).strict()),
  totals: z.record(z.enum(ST_STATUSES), z.number().int().nonnegative()),
  exceptions: z.array(z.object({ id, code: z.enum(ST_EXCEPTION_CODES), label: text, message: text, unitId: z.string().nullable(), amount: knownAmountSchema }).strict()),
  evidence: z.array(proofSchema), method: text, limitations: z.array(text),
  /** Absent in sub-lot 1 results; null when no cost list and no ledger were frozen. */
  valuation: stockValuationSchema.nullable().optional(),
  /** Absent before sub-lot 3; null when no value hypotheses were frozen. */
  valueReview: stockValueReviewSchema.nullable().optional(),
}).strict();
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
export const ST_VALUE_METHOD_TEXT = "Valeur = quantité × coût unitaire documenté (référence et lot, sinon référence), arrondie au centime (demi-centime loin de zéro). Écart de quantité valorisé = écart × coût : écart potentiel, non une anomalie validée. Écart de prix = valeur théorique déclarée − quantité théorique × coût documenté. Cadrage = somme des valeurs théoriques des lignes détenues par l’entité, par compte, comparée au solde du grand livre ; les comptes 39 (dépréciations) relèvent de la revue de valeur. Méthodes internes : la méthode de coût déclarée (PCG art. 213-33 à 213-35) est affichée, jamais recalculée ni approuvée par l’outil.";
export const ST_VALUE_LIMITATIONS = [
  "Le coût documenté est celui de la pièce citée : l’outil ne recalcule ni coût moyen pondéré ni premier entré, premier sorti, et n’approuve aucune méthode.",
  "Un coût par référence et lot s’applique à tous les sites ; un coût différent par site n’est pas couvert.",
  "Un écart valorisé est un écart potentiel à expliquer : ni anomalie validée ni correction comptable.",
];
export const ST_REVIEW_METHOD_TEXT = "Revue de valeur : valeur actuelle unitaire selon l’hypothèse citée = prix de vente estimé − coûts de sortie (valeur vénale, PCG art. 214-6 ; prix et perspectives de vente, art. 214-22). Écart indicatif = (coût documenté − valeur actuelle) × quantité théorique lorsque la valeur actuelle est inférieure au coût (art. 214-5), comparé à la dépréciation comptabilisée. Méthode interne de comparaison : l’outil ne propose ni ne comptabilise aucune dépréciation ; la rotation est un indice (art. 214-16), jamais un calcul.";
export const ST_REVIEW_LIMITATIONS = [
  "L’écart indicatif dépend entièrement de l’hypothèse citée : il n’est ni une dépréciation proposée ni une estimation validée ; le jugement humain motivé et cité reste requis.",
  "Aucune dépréciation n’est déduite de la rotation, de l’ancienneté ou d’un seuil : la date du dernier mouvement est affichée comme indice.",
  "La valeur d’usage (flux actualisés) et les contrats de vente ferme (PCG art. 214-23) ne sont pas modélisés.",
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
