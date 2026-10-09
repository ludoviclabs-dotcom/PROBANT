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
export const ST_EXCEPTION_CODES = ["QUANTITY_DIFFERENCE", "NOT_IN_SYSTEM", "OWNERSHIP_MISMATCH", "NET_COMPENSATED", "UNIT_INCOMPATIBLE", "MOVEMENTS_INCOMPLETE", "NOT_COUNTED", "SITE_NOT_VISITED"] as const;
export type StockExceptionCode = typeof ST_EXCEPTION_CODES[number];
/** Codes that leave a part of the test unknown: they make the sheet inconclusive, never a validated anomaly. */
export const ST_UNCERTAINTY_CODES: StockExceptionCode[] = ["UNIT_INCOMPATIBLE", "MOVEMENTS_INCOMPLETE", "NOT_COUNTED", "SITE_NOT_VISITED"];
export const stockResultSchema = z.object({
  schemaVersion: z.literal("stocks-result-1"), scope: scopeSchema, runId: id, closingDate: dateSchema,
  convention: z.object({ sameDay: z.enum(ST_SAME_DAY), instructions: stockCitationSchema }).strict(),
  coverage: z.object({ from: dateSchema, to: dateSchema, importId: id, fileName: z.string().min(1).max(300) }).strict().nullable(),
  sites: z.array(z.object({ site: id, countDate: dateSchema.nullable(), visited: z.boolean(), countLines: z.number().int().nonnegative(), systemLines: z.number().int().nonnegative(), units: z.number().int().nonnegative() }).strict()),
  units: z.array(stockUnitResultSchema),
  references: z.array(z.object({ reference: id, uom: z.string(), units: z.number().int().positive(), net: qty, gross: qty, compensated: z.boolean() }).strict()),
  totals: z.record(z.enum(ST_STATUSES), z.number().int().nonnegative()),
  exceptions: z.array(z.object({ id, code: z.enum(ST_EXCEPTION_CODES), label: text, message: text, unitId: z.string().nullable(), amount: knownAmountSchema }).strict()),
  evidence: z.array(proofSchema), method: text, limitations: z.array(text),
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
/** Hundredths of a counting unit → French decimal text, without rounding ("9800" → "98", "-250" → "−2,5"). */
export function formatQuantity(hundredths: string | null, uom?: string | null, options: { signed?: boolean } = {}) {
  if (hundredths === null) return "Inconnue";
  const n = BigInt(hundredths), abs = n < 0n ? -n : n, whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"), frac = (abs % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const sign = n < 0n ? "−" : options.signed && n > 0n ? "+" : "";
  return sign + whole + (frac ? "," + frac : "") + (uom ? " " + uom : "");
}
