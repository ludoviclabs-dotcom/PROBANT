import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { VAT_EXPLANATION_KINDS, VAT_EXPLANATION_LABELS, VAT_GROUP_STATUSES, VAT_REGIMES, VAT_ROLE_LABELS, VAT_ROLES } from "./fiscal-labels";
import { civilDate, declarativePeriodSchema, fiscalCitationInputSchema, FX_FREQUENCIES, periodMatchesFrequency, resolvedCitationSchema } from "./fiscal-work";
import type { ImportBatch } from "./imports";
import { knownAmountSchema, scopeSchema, type EvidenceLink } from "./model";

/**
 * Contract of the VAT sheet (Mission 13): schemas of the human draft, of the stamped work and of the result, the
 * outcome and the evidence. No engine, parser or registry import: the shared workpaper service is also bundled for
 * the browser demonstration. The calculation lives in fiscal-vat.ts.
 */
export const VAT_PROCEDURE = "tva.reconciliation" as const;
const id = z.string().trim().min(1).max(200), text = z.string().trim().max(10000), timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis");
const cents = z.number().int().refine(Number.isSafeInteger, "Centimes entiers sûrs");
const signedCents = z.string().regex(/^-?(0|[1-9]\d{0,12})$/);
/** What the browser sends: the declarative identity is fixed at creation; the profile and the bridge cite frozen pieces. */
export const vatDraftSchema = z.object({
  frequency: z.enum(FX_FREQUENCIES), formVintage: z.number().int().min(2000).max(2200),
  profile: z.object({ vatRegime: z.enum(VAT_REGIMES), vatGroupStatus: z.enum(VAT_GROUP_STATUSES), siren: z.string().regex(/^\d{9}$/).nullable(), evidence: fiscalCitationInputSchema.nullable() }).strict(),
  explanations: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/), label: text.min(1).max(300), kind: z.enum(VAT_EXPLANATION_KINDS), amountCents: signedCents, citation: fiscalCitationInputSchema }).strict()).max(50),
}).strict();
export type VatDraft = z.infer<typeof vatDraftSchema>;
const accountMapSchema = z.object({ collectedVatPrefixes: z.array(id), deductibleVatPrefixes: z.array(id), payableVatPrefixes: z.array(id), salesBasePrefixes: z.array(id), purchaseBasePrefixes: z.array(id), fixedAssetBasePrefixes: z.array(id) }).strict();
export const vatWorkSchema = z.object({
  tax: z.literal("vat"), schemaVersion: z.literal("fiscal-vat-1"), period: declarativePeriodSchema, frequency: z.enum(FX_FREQUENCIES), formVintage: z.number().int().min(2000).max(2200),
  profile: z.object({ vatRegime: z.enum(VAT_REGIMES), vatGroupStatus: z.enum(VAT_GROUP_STATUSES), siren: z.string().regex(/^\d{9}$/).nullable(), status: z.enum(["draft", "confirmed"]),
    confirmedBy: id.nullable(), confirmedAt: timestamp.nullable(), evidence: resolvedCitationSchema.nullable() }).strict(),
  explanations: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/), label: text.min(1).max(300), kind: z.enum(VAT_EXPLANATION_KINDS), amountCents: signedCents, citation: resolvedCitationSchema, authorId: id, at: timestamp }).strict()).max(50),
  accountMap: accountMapSchema, configuredBy: id, configuredAt: timestamp,
}).strict().superRefine((w, ctx) => {
  if (!periodMatchesFrequency(w.period, w.frequency)) ctx.addIssue({ code: "custom", message: "FX_PERIOD_FREQUENCY_INVALID" });
  if ((w.profile.status === "confirmed") !== (!!w.profile.confirmedBy && !!w.profile.confirmedAt && !!w.profile.evidence)) ctx.addIssue({ code: "custom", message: "FX_PROFILE_CONFIRMATION_INVALID" });
  if (w.profile.status === "confirmed" && w.profile.vatRegime === "unknown") ctx.addIssue({ code: "custom", message: "FX_PROFILE_UNKNOWN_CANNOT_BE_CONFIRMED" });
  if (new Set(w.explanations.map(e => e.id)).size !== w.explanations.length) ctx.addIssue({ code: "custom", message: "FX_EXPLANATION_DUPLICATE" });
});
export type VatWork = z.infer<typeof vatWorkSchema>;
export const VAT_METHOD_TEXT = "Le moteur TVA (TAX-06) rapproche les écritures du FEC, la déclaration CA3 ou CA12 et, lorsqu’il est fourni, l’inventaire des pièces. Les comptes 4457 / 4456 et les racines 70-75 / 60-65 / 20-21 repèrent des écritures candidates (table interne documentée) ; ils ne qualifient aucune opération.";
export const VAT_RATE_TEXT = "Taux constaté = TVA comptabilisée ÷ base HT d’une même écriture. Aucun barème légal de TVA n’est publié dans le registre : un taux constaté n’est jamais présenté comme un taux légal approuvé.";
export const VAT_LIMITATIONS = [
  "FEC seul : signal ou estimation, jamais une réconciliation. FEC + déclaration : réconciliation. + inventaire de pièces : contrôle renforcé.",
  "Une déclaration absente n’est jamais une déclaration à zéro ; une pièce absente de PROBANT n’est pas une pièce absente du dossier.",
  "Une source normative non couverte sur la période bloque les contrôles qui en dépendent ; aucune version voisine n’est substituée.",
  "Aucune liquidation, aucune télétransmission, aucun prorata ni coefficient de déduction ; l’autoliquidation reste un candidat à qualifier.",
  "Les autres impôts et taxes sont des capacités séparées : cette feuille ne les couvre pas.",
];

export function vatDraftFromWork(work: VatWork): VatDraft {
  const cite = (c: { documentVersionId: string; rowId?: string }) => ({ documentId: c.documentVersionId, ...(c.rowId ? { rowId: c.rowId } : {}) });
  return vatDraftSchema.parse({ frequency: work.frequency, formVintage: work.formVintage, profile: { vatRegime: work.profile.vatRegime, vatGroupStatus: work.profile.vatGroupStatus, siren: work.profile.siren, evidence: work.profile.evidence ? cite(work.profile.evidence) : null },
    explanations: work.explanations.map(e => ({ id: e.id, label: e.label, kind: e.kind, amountCents: e.amountCents, citation: cite(e.citation) })) });
}
// -- Result ------------------------------------------------------------------
const outcomes = z.enum(["passed", "confirmed_non_compliance", "reconciliation_difference", "potential_tax_risk", "missing_information", "inconclusive", "review_recommendation"]);
const locatorSchema = z.object({ sheet: z.string().optional(), row: z.number().int().positive().optional(), cell: z.string().optional(), page: z.number().int().positive().optional(), zone: z.string().optional() }).strict();
const sourceRowSchema = z.object({ importId: id, rowId: id, documentVersionId: id, fileName: text, locator: locatorSchema }).strict();
const ruleSourceSchema = z.object({ sourceId: id, title: text, publisher: text, url: text, lastVerifiedAt: text, coverage: z.enum(["covered", "partially_covered", "not_covered"]), coveredThroughDate: text.nullable(), uncoveredFromDate: text.nullable(),
  versions: z.array(z.object({ id, label: text, effectiveFrom: text.nullable(), effectiveTo: text.nullable(), status: text, intersectsPeriod: z.boolean() }).strict()) }).strict();
export const blockedRuleSchema = z.object({ code: id, category: z.enum(["source", "profile", "document", "scope", "input"]), label: text, message: text, controls: z.array(id), requiredSource: text, sources: z.array(ruleSourceSchema),
  forms: z.array(z.object({ formNumber: id, vintage: z.number().int(), published: z.boolean(), publishedVintages: z.array(z.number().int()), status: text.nullable(), sourceVersionId: text.nullable() }).strict()),
  resolvability: z.enum(["user_can_supply", "human_review", "future_engine", "not_resolvable"]), capabilityStatus: z.enum(["available", "future", "non_available"]) }).strict();
const VAT_EXCEPTION_CODES = ["ENGINE_DIFFERENCE", "ENGINE_RISK", "ENGINE_RECOMMENDATION", "BRIDGE_UNEXPLAINED", "PAYMENT_DIFFERENCE", "CREDIT_CONTINUITY_DIFFERENCE",
  "ENGINE_BLOCKED", "LEDGER_ONLY", "PROFILE_UNCONFIRMED", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"] as const;
export type VatExceptionCode = typeof VAT_EXCEPTION_CODES[number];
/**
 * Controls whose two engine values measure the same quantity (accounted vs declared, theoretical vs accounted). For the
 * others (gross vs deductible, credit received vs credit to carry, collected vs deductible balances) the engine's
 * arithmetic difference has no meaning and is never presented as a difference.
 */
export const VAT_COMPARABLE_CONTROLS = ["VAT.BASE.BY_RATE", "VAT.THEORETICAL.BY_RATE", "VAT.NET", "VAT.FORM.COHERENCE", "VAT.CREDIT"] as const;
export const VAT_UNCERTAINTY_CODES: VatExceptionCode[] = ["ENGINE_BLOCKED", "LEDGER_ONLY", "PROFILE_UNCONFIRMED", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"];
const ROLES = VAT_ROLES;
const piece = z.discriminatedUnion("status", [
  z.object({ status: z.literal("found"), ...sourceRowSchema.shape, ref: id, date: text, vatCents: cents.nullable(), baseCents: cents.nullable(), label: text }).strict(),
  z.object({ status: z.literal("missing"), ref: text.nullable() }).strict(),
  z.object({ status: z.literal("not_provided") }).strict(),
]);
export const vatResultSchema = z.object({
  schemaVersion: z.literal("fiscal-vat-result-1"), tax: z.literal("vat"), scope: scopeSchema, runId: id, period: declarativePeriodSchema, frequency: z.enum(FX_FREQUENCIES), formVintage: z.number().int(),
  accountingPeriod: z.object({ startDate: civilDate, closingDate: civilDate }).strict(),
  profile: z.object({ id, contentHash: z.string(), status: z.enum(["draft", "confirmed"]), vatRegime: z.enum(VAT_REGIMES), vatGroupStatus: z.enum(VAT_GROUP_STATUSES), siren: z.string().nullable(), confirmedBy: id.nullable(), confirmedAt: text.nullable(), evidence: resolvedCitationSchema.nullable() }).strict(),
  engine: z.object({ name: z.literal("reconcileVat"), version: text, calculationVersion: text, snapshotId: id, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["reconciled", "blocked"]), outcome: outcomes,
    evidenceTier: z.enum(["ledger_only", "ledger_and_declaration", "ledger_declaration_and_invoice", "insufficient"]), evidenceStrength: z.enum(["direct", "derived", "corroborated", "insufficient"]), expectedForm: text.nullable(),
    coverage: z.object({ status: z.enum(["covered", "partially_covered", "not_covered"]), coveredThroughDate: text.nullable(), uncoveredFromDate: text.nullable() }).strict().nullable(),
    notes: z.array(z.object({ code: id, kind: text, message: text }).strict()), limitations: z.array(z.object({ code: id, message: text, scope: text }).strict()) }).strict(),
  method: text, rateMeaning: text, limitations: z.array(text),
  sources: z.object({ fecLines: z.number().int().nonnegative(), fecLinesInPeriod: z.number().int().nonnegative(), invoicesProvided: z.boolean(), paymentsProvided: z.boolean(), previousReturnProvided: z.boolean() }).strict(),
  declaration: z.object({ status: z.enum(["available", "absent", "unreadable", "unpublished_vintage", "not_read"]), importId: id.nullable(), documentVersionId: id.nullable(), fileName: text.nullable(), sha256: text.nullable(), formNumber: text.nullable(), formVintage: z.number().int().nullable(),
    lines: z.array(z.object({ code: id, label: text, amountCents: cents.nullable(), readByEngine: z.boolean(), role: z.enum(ROLES).nullable(), rowId: id, locator: locatorSchema, candidateIds: z.array(id), processingStatus: text, warnings: z.array(text) }).strict()),
    issues: z.array(z.object({ fieldCode: text, status: text, reason: text, detail: text }).strict()) }).strict(),
  comparison: z.array(z.object({ key: z.enum(["collected", "deductible", "net", "credit"]), label: text, theoreticalCents: cents.nullable(), accountedCents: cents.nullable(), declaredCents: cents.nullable(), differenceCents: cents.nullable(), declaredBox: text.nullable() }).strict()),
  bridge: z.object({ status: z.enum(["known", "unknown"]), reason: text.nullable(), startCents: cents.nullable(), items: z.array(z.object({ id, label: text, kind: z.enum(VAT_EXPLANATION_KINDS), amountCents: cents, citation: resolvedCitationSchema, authorId: id, at: text }).strict()),
    explainedCents: cents.nullable(), declaredCents: cents.nullable(), residualCents: cents.nullable(), declaredBox: text.nullable() }).strict(),
  payments: z.object({ status: z.enum(["known", "unknown", "not_provided"]), reason: text.nullable(), declaredDueCents: cents.nullable(), paidCents: cents.nullable(), differenceCents: cents.nullable(),
    items: z.array(z.object({ ...sourceRowSchema.shape, ref: id, date: text, amountCents: cents, label: text }).strict()) }).strict(),
  credit: z.object({ status: z.enum(["known", "unknown", "not_provided"]), reason: text.nullable(), previous: z.object({ importId: id, documentVersionId: id, fileName: text, periodStart: text, periodEnd: text, box: text, creditToCarryCents: cents.nullable() }).strict().nullable(),
    currentBox: text.nullable(), currentReceivedCents: cents.nullable(), differenceCents: cents.nullable() }).strict(),
  rates: z.array(z.object({ key: id, direction: z.enum(["collected", "deductible"]), rateBasisPoints: z.number().int().nullable(), label: text, status: z.enum(["dominant", "secondary", "outlier", "unresolved"]), origin: text,
    baseCents: cents.nullable(), vatAccountedCents: cents, vatTheoreticalCents: cents.nullable(), differenceCents: cents.nullable(), shareOfBaseBasisPoints: z.number().int(), entryIds: z.array(id), accounts: z.array(id) }).strict()),
  entries: z.array(z.object({ id, itemId: id, direction: z.enum(["collected", "deductible"]), journalCode: text, ecritureNum: text, date: text, pieceRef: text.nullable(), pieceDate: text.nullable(), baseCents: cents.nullable(), vatCents: cents.nullable(),
    observedRateBasisPoints: z.number().int().nullable(), signals: z.array(text), baseAccounts: z.array(text), vatAccounts: z.array(text), creditNote: z.boolean(), rowIds: z.array(id), lines: z.array(z.number().int()), piece }).strict()),
  controls: z.array(z.object({ controlId: id, title: text, outcome: outcomes, evidenceTier: text, detail: text, observedCents: cents.nullable(), comparedCents: cents.nullable(), differenceCents: cents.nullable(), comparable: z.boolean(), limitationIds: z.array(text) }).strict()),
  blockedRules: z.array(blockedRuleSchema), periodSources: z.array(ruleSourceSchema), otherTaxes: z.array(z.object({ sourceId: id, title: text, taxTypes: z.array(text) }).strict()),
  exceptions: z.array(z.object({ id, code: z.enum(VAT_EXCEPTION_CODES), label: text, message: text, amount: knownAmountSchema, controlId: text.nullable() }).strict()),
}).strict().superRefine((r, ctx) => {
  const b = r.bridge, sum = b.items.reduce((s, i) => s + i.amountCents, 0);
  if (b.explainedCents !== (b.startCents === null ? null : b.startCents + sum)) ctx.addIssue({ code: "custom", message: "FX_BRIDGE_EXPLAINED_INVARIANT" });
  if (b.status === "known" ? b.declaredCents === null || b.explainedCents === null || b.residualCents !== b.declaredCents - b.explainedCents : b.residualCents !== null) ctx.addIssue({ code: "custom", message: "FX_BRIDGE_RESIDUAL_INVARIANT" });
  for (const c of r.comparison) if (c.differenceCents !== (c.accountedCents !== null && c.declaredCents !== null ? c.accountedCents - c.declaredCents : null)) ctx.addIssue({ code: "custom", message: "FX_COMPARISON_INVARIANT" });
  if (r.payments.status === "known" && (r.payments.paidCents !== r.payments.items.reduce((s, i) => s + i.amountCents, 0) || r.payments.differenceCents !== r.payments.paidCents! - r.payments.declaredDueCents!)) ctx.addIssue({ code: "custom", message: "FX_PAYMENT_INVARIANT" });
  if (new Set(r.exceptions.map(e => e.id)).size !== r.exceptions.length) ctx.addIssue({ code: "custom", message: "FX_EXCEPTION_DUPLICATE" });
});
export type VatResult = z.infer<typeof vatResultSchema>;

const row = (b: ImportBatch, rowId: string) => b.rows.find(r => r.id === rowId)!;
export function vatOutcome(r: VatResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  if (r.engine.status === "blocked") return "inconclusive";
  if (r.exceptions.some(e => !VAT_UNCERTAINTY_CODES.includes(e.code))) return "exceptions_detected";
  if (r.exceptions.length || ["missing_information", "inconclusive"].includes(r.engine.outcome)) return "inconclusive";
  return "no_exception_detected";
}
/** Evidence of a completed execution: the declaration lines read, the FEC lines of the period entries, the pieces and the payments. */
export function vatResultEvidence(r: VatResult, imports: ImportBatch[]): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  const add = (importId: string, rowId: string, purpose: string, precision: EvidenceLink["precision"] = "row") => {
    const b = imports.find(x => x.id === importId); if (!b) return;
    const rw = row(b, rowId); if (!rw) return;
    links.push({ id: "proof-" + stableSha256({ runId: r.runId, rowId }), scope: r.scope, procedureId: r.runId, documentVersionId: b.document.id, rowId, locator: rw.locator, precision, status: "verified", purpose });
  };
  if (r.declaration.importId) for (const l of r.declaration.lines.filter(l => l.readByEngine)) add(r.declaration.importId, l.rowId, `Case ${l.code} lue par le moteur TVA`, "cell");
  const fec = imports.find(b => b.document.documentType === "fx_fec");
  if (fec) for (const e of r.entries) for (const rowId of e.rowIds) add(fec.id, rowId, `Écriture ${e.journalCode} ${e.ecritureNum}`);
  for (const e of r.entries) if (e.piece.status === "found") add(e.piece.importId, e.piece.rowId, `Pièce ${e.piece.ref}`);
  for (const p of r.payments.items) add(p.importId, p.rowId, `Paiement ${p.ref}`);
  return [...new Map(links.map(l => [l.id, l])).values()];
}
export type { BlockedRule } from "./fiscal-rules";
export { VAT_EXPLANATION_KINDS, VAT_EXPLANATION_LABELS, VAT_GROUP_STATUSES, VAT_REGIMES, VAT_ROLE_LABELS };
