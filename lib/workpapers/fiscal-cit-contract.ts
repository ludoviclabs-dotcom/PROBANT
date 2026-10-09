import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CIT_CATEGORIES, CIT_GROUP_STATUSES, CIT_REGIMES, CIT_TREATMENTS } from "./fiscal-labels";
import { civilDate, declarativePeriodSchema, fiscalCitationInputSchema, resolvedCitationSchema } from "./fiscal-work";
import { blockedRuleSchema } from "./fiscal-vat-contract";
import type { ImportBatch } from "./imports";
import { knownAmountSchema, scopeSchema, type EvidenceLink } from "./model";

/**
 * Contract of the IS sheet (Mission 13, second sub-lot): human draft, stamped work, result, outcome and evidence.
 * No engine, parser or registry import here. The calculation is `computeCorporateTax` (TAX-05), called in fiscal-cit.ts.
 */
export const CIT_PROCEDURE = "is.computation" as const;
const id = z.string().trim().min(1).max(200), text = z.string().trim().max(10000), timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis");
const cents = z.number().int().refine(Number.isSafeInteger, "Centimes entiers sûrs");
const positiveCents = z.string().regex(/^[1-9]\d{0,12}$/);
const legalSourceSchema = z.object({ sourceId: id, sourceVersionId: id, locator: z.string().trim().min(1).max(200) }).strict();
const profileDraft = z.object({ regime: z.enum(CIT_REGIMES), groupStatus: z.enum(CIT_GROUP_STATUSES), turnoverCents: z.string().regex(/^(0|[1-9]\d{0,14})$/).nullable(),
  capitalPaid: z.enum(["fully_paid", "partially_paid", "unknown"]), ownershipBasisPoints: z.number().int().min(0).max(10000).nullable(), siren: z.string().regex(/^\d{9}$/).nullable(), evidence: fiscalCitationInputSchema.nullable() }).strict();
const adjustmentDraft = z.object({ id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/), label: text.min(1).max(300), category: z.enum(CIT_CATEGORIES), direction: z.enum(["reintegration", "deduction"]),
  amountCents: positiveCents, treatment: z.enum(CIT_TREATMENTS), legalSource: legalSourceSchema.nullable(), citation: fiscalCitationInputSchema }).strict();
/**
 * The browser names the vintage, the basis of the documented bridge, the profile and the documented adjustments.
 * « before_tax » means the corporate income tax recorded is already excluded from the starting result.
 */
export const citDraftSchema = z.object({ formVintage: z.number().int().min(2000).max(2200), resultBasis: z.enum(["after_tax", "before_tax"]), profile: profileDraft, adjustments: z.array(adjustmentDraft).max(50) }).strict();
export type CitDraft = z.infer<typeof citDraftSchema>;
const accountMapSchema = z.object({ resultClasses: z.array(id), taxCharge: z.array(id), taxLiability: z.array(id) }).strict();
export const citWorkSchema = z.object({
  tax: z.literal("cit"), schemaVersion: z.literal("fiscal-cit-1"), period: declarativePeriodSchema, frequency: z.literal("annual"), formVintage: z.number().int().min(2000).max(2200), resultBasis: z.enum(["after_tax", "before_tax"]),
  profile: profileDraft.omit({ evidence: true }).extend({ status: z.enum(["draft", "confirmed"]), confirmedBy: id.nullable(), confirmedAt: timestamp.nullable(), evidence: resolvedCitationSchema.nullable() }).strict(),
  adjustments: z.array(adjustmentDraft.omit({ citation: true }).extend({ citation: resolvedCitationSchema, authorId: id, at: timestamp }).strict()).max(50),
  accountMap: accountMapSchema, configuredBy: id, configuredAt: timestamp,
}).strict().superRefine((w, ctx) => {
  if ((w.profile.status === "confirmed") !== (!!w.profile.confirmedBy && !!w.profile.confirmedAt && !!w.profile.evidence)) ctx.addIssue({ code: "custom", message: "FX_PROFILE_CONFIRMATION_INVALID" });
  if (w.profile.status === "confirmed" && w.profile.regime === "unknown") ctx.addIssue({ code: "custom", message: "FX_PROFILE_UNKNOWN_CANNOT_BE_CONFIRMED" });
  if (new Set(w.adjustments.map(a => a.id)).size !== w.adjustments.length) ctx.addIssue({ code: "custom", message: "FX_ADJUSTMENT_DUPLICATE" });
  // One corporate income tax adjustment at most, never on a before-tax basis, never as a deduction: a second one would count the tax twice.
  const tax = w.adjustments.filter(a => a.category === "accounted_tax");
  if (tax.length > 1 || (tax.length === 1 && (w.resultBasis === "before_tax" || tax[0].direction !== "reintegration"))) ctx.addIssue({ code: "custom", message: "FX_CIT_DOUBLE_TAX_ADJUSTMENT" });
  if (w.adjustments.some(a => a.treatment === "proposed_correction" && !a.legalSource)) ctx.addIssue({ code: "custom", message: "FX_CIT_CORRECTION_SOURCE_REQUIRED" });
});
export type CitWork = z.infer<typeof citWorkSchema>;
export const CIT_METHOD_TEXT = "Le moteur IS (TAX-05) part du résultat comptable déclaré (2058-A ou 2033-B), reprend les retraitements déclarés, impute les déficits sous le plafond publié et ventile la base par tranche du barème publié pour l’exercice et le millésime. La feuille cadre ce résultat sur le FEC (classes 6 et 7, table interne documentée) et documente les retraitements par pièce ; elle ne liquide pas l’impôt.";
export const CIT_LIMITATIONS = [
  "Le moteur reprend les totaux déclarés de retraitements ; un retraitement documenté qui les détaille n’est pas ajouté une seconde fois. Seule une correction proposée, absente de la déclaration, entre dans le calcul.",
  "Aucun retraitement n’est déduit d’un numéro de compte : sans pièce et source citées, il n’existe pas.",
  "Un barème ou un millésime non publié bloque le calcul ; aucun barème voisin n’est appliqué.",
  "Taux réduit seulement si toutes ses conditions sont renseignées dans un profil confirmé ; une condition inconnue laisse l’impôt estimé au taux normal et le résultat non concluant.",
  "Aucun intérêt, aucune pénalité, aucune liquidation ni télétransmission ; intégration fiscale et contributions additionnelles hors périmètre.",
  "Les autres impôts et taxes sont des capacités séparées : cette feuille ne les couvre pas.",
];
const CIT_EXCEPTION_CODES = ["FRAMING_DIFFERENCE", "BRIDGE_UNEXPLAINED", "ENGINE_DIFFERENCE", "PROPOSED_CORRECTION",
  "ENGINE_BLOCKED", "PROFILE_UNCONFIRMED", "LIASSE_ABSENT", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"] as const;
export type CitExceptionCode = typeof CIT_EXCEPTION_CODES[number];
export const CIT_UNCERTAINTY_CODES: CitExceptionCode[] = ["ENGINE_BLOCKED", "PROFILE_UNCONFIRMED", "LIASSE_ABSENT", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"];
const locatorSchema = z.object({ sheet: z.string().optional(), row: z.number().int().positive().optional(), cell: z.string().optional(), page: z.number().int().positive().optional(), zone: z.string().optional() }).strict();
const outcomes = z.enum(["passed", "confirmed_non_compliance", "reconciliation_difference", "potential_tax_risk", "missing_information", "inconclusive", "review_recommendation"]);
export const citResultSchema = z.object({
  schemaVersion: z.literal("fiscal-cit-result-1"), tax: z.literal("cit"), scope: scopeSchema, runId: id, period: declarativePeriodSchema, fiscalYear: z.number().int(), formVintage: z.number().int(), resultBasis: z.enum(["after_tax", "before_tax"]),
  accountingPeriod: z.object({ startDate: civilDate, closingDate: civilDate }).strict(),
  profile: z.object({ id, contentHash: z.string(), status: z.enum(["draft", "confirmed"]), regime: z.enum(CIT_REGIMES), groupStatus: z.enum(CIT_GROUP_STATUSES), turnoverCents: z.string().nullable(), capitalPaid: text, ownershipBasisPoints: z.number().int().nullable(),
    confirmedBy: id.nullable(), confirmedAt: text.nullable(), evidence: resolvedCitationSchema.nullable() }).strict(),
  engine: z.object({ name: z.literal("computeCorporateTax"), version: text, calculationVersion: text, snapshotId: id, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["computed", "blocked"]), outcome: outcomes,
    taxImpactStatus: z.enum(["not_computed", "estimated", "computed", "reviewed"]), rateScheduleId: text.nullable(), notes: z.array(z.object({ code: id, kind: text, message: text }).strict()), limitations: z.array(z.object({ code: id, message: text, scope: text }).strict()) }).strict(),
  method: text, limitations: z.array(text),
  framing: z.object({ status: z.enum(["framed", "difference", "unknown"]), reason: text.nullable(), fecLines: z.number().int().nonnegative(), fecLinesInExercise: z.number().int().nonnegative(),
    resultAfterTaxCents: cents.nullable(), taxChargeCents: cents.nullable(), resultBeforeTaxCents: cents.nullable(), taxLiabilityCents: cents.nullable(),
    declaredResultCents: cents.nullable(), declaredBox: text.nullable(), differenceCents: cents.nullable() }).strict(),
  bridge: z.object({ status: z.enum(["known", "unknown"]), reason: text.nullable(), basis: z.enum(["after_tax", "before_tax"]), startCents: cents.nullable(), reintegrationsCents: cents, deductionsCents: cents, documentedResultCents: cents.nullable(),
    declaredCents: cents.nullable(), declaredBox: text.nullable(), residualCents: cents.nullable() }).strict(),
  adjustments: z.array(z.object({ id, label: text, category: z.enum(CIT_CATEGORIES), direction: z.enum(["reintegration", "deduction"]), amountCents: cents, treatment: z.enum(CIT_TREATMENTS), citation: resolvedCitationSchema, authorId: id, at: text,
    legalSource: z.object({ sourceId: id, sourceVersionId: id, locator: text, title: text, url: text, coverage: z.enum(["covered", "partially_covered", "not_covered"]), lastVerifiedAt: text }).strict().nullable(), inEngine: z.boolean() }).strict()),
  computation: z.object({ accountingResultCents: cents, reintegrationsConfirmedCents: cents, deductionsConfirmedCents: cents, reintegrationsProposedCents: cents, deductionsProposedCents: cents, taxResultBeforeDeficitsCents: cents,
    deficitOffsetCents: cents, deficitStatus: text, taxableBaseCents: cents, grossTaxCents: cents.nullable(),
    steps: z.array(z.object({ code: id, label: text, kind: text, deltaCents: cents, runningTotalCents: cents, status: text }).strict()),
    brackets: z.array(z.object({ code: id, label: text, rateBasisPoints: z.number().int(), baseCapCents: cents.nullable(), allocatedBaseCents: cents, taxCents: cents, applied: z.boolean(), eligibility: text,
      conditions: z.array(z.object({ code: id, label: text, status: text, observedValue: text.nullable(), expected: text }).strict()), ruleVersionId: text, sourceRefs: z.array(z.object({ sourceId: id, sourceVersionId: id, locator: text }).strict()) }).strict()) }).strict().nullable(),
  comparisons: z.array(z.object({ key: id, label: text, leftCents: cents.nullable(), rightCents: cents.nullable(), rightBox: text.nullable(), differenceCents: cents.nullable(), status: z.enum(["matched", "different", "missing_operand", "not_comparable"]) }).strict()),
  declaration: z.object({ status: z.enum(["available", "absent", "unpublished_vintage", "not_read"]), forms: z.array(z.object({ formNumber: id, importId: id, documentVersionId: id, fileName: text, sha256: text, formVintage: z.number().int(), published: z.boolean() }).strict()),
    lines: z.array(z.object({ formNumber: id, code: id, label: text, amountCents: cents.nullable(), readByEngine: z.boolean(), rowId: id, importId: id, locator: locatorSchema, processingStatus: text }).strict()) }).strict(),
  blockedRules: z.array(blockedRuleSchema), otherTaxes: z.array(z.object({ sourceId: id, title: text, taxTypes: z.array(text) }).strict()),
  exceptions: z.array(z.object({ id, code: z.enum(CIT_EXCEPTION_CODES), label: text, message: text, amount: knownAmountSchema, controlId: text.nullable() }).strict()),
}).strict().superRefine((r, ctx) => {
  const f = r.framing;
  if (f.differenceCents !== (f.declaredResultCents === null || f.resultAfterTaxCents === null ? null : f.resultAfterTaxCents - f.declaredResultCents)) ctx.addIssue({ code: "custom", message: "FX_CIT_FRAMING_INVARIANT" });
  if (f.resultBeforeTaxCents !== (f.taxChargeCents === null || f.resultAfterTaxCents === null ? null : f.resultAfterTaxCents + f.taxChargeCents)) ctx.addIssue({ code: "custom", message: "FX_CIT_BASIS_INVARIANT" });
  const b = r.bridge, documented = r.adjustments.filter(a => a.treatment === "documents_declared");
  if (b.reintegrationsCents !== documented.filter(a => a.direction === "reintegration").reduce((s, a) => s + a.amountCents, 0) || b.deductionsCents !== documented.filter(a => a.direction === "deduction").reduce((s, a) => s + a.amountCents, 0)) ctx.addIssue({ code: "custom", message: "FX_CIT_BRIDGE_SUM_INVARIANT" });
  if (b.documentedResultCents !== (b.startCents === null ? null : b.startCents + b.reintegrationsCents - b.deductionsCents)) ctx.addIssue({ code: "custom", message: "FX_CIT_BRIDGE_INVARIANT" });
  if (b.status === "known" ? b.declaredCents === null || b.documentedResultCents === null || b.residualCents !== b.declaredCents - b.documentedResultCents : b.residualCents !== null) ctx.addIssue({ code: "custom", message: "FX_CIT_BRIDGE_RESIDUAL_INVARIANT" });
  if (new Set(r.exceptions.map(e => e.id)).size !== r.exceptions.length) ctx.addIssue({ code: "custom", message: "FX_EXCEPTION_DUPLICATE" });
});
export type CitResult = z.infer<typeof citResultSchema>;
export function citOutcome(r: CitResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  if (r.engine.status === "blocked") return "inconclusive";
  if (r.exceptions.some(e => !CIT_UNCERTAINTY_CODES.includes(e.code))) return "exceptions_detected";
  if (r.exceptions.length || ["missing_information", "inconclusive"].includes(r.engine.outcome)) return "inconclusive";
  return "no_exception_detected";
}
/** Evidence of a completed IS execution: the declaration cells and the cited pieces of the documented adjustments. */
export function citResultEvidence(r: CitResult, imports: ImportBatch[]): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  const add = (importId: string, rowId: string, purpose: string, precision: EvidenceLink["precision"]) => {
    const b = imports.find(x => x.id === importId), row = b?.rows.find(x => x.id === rowId);
    if (!b || !row) return;
    links.push({ id: "proof-" + stableSha256({ runId: r.runId, rowId }), scope: r.scope, procedureId: r.runId, documentVersionId: b.document.id, rowId, locator: row.locator, precision, status: "verified", purpose });
  };
  for (const l of r.declaration.lines.filter(l => l.readByEngine)) add(l.importId, l.rowId, `${l.formNumber} case ${l.code} lue par le moteur IS`, "cell");
  for (const a of r.adjustments) if (a.citation.rowId) add(a.citation.importId, a.citation.rowId, `Retraitement ${a.id} — pièce citée`, "row");
  return [...new Map(links.map(l => [l.id, l])).values()];
}
