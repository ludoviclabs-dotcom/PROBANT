import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { classifyInstrument, instrumentTermsSchema, presentationResolution, type ClassifiedInstrument, type PresentationResolution } from "./capitaux-presentation";
import { assertLoansContext, type CycleContext } from "./cycle-context";
import { dateSchema, known, reconcileLoanBalances, unknown, type BalanceLine } from "./cycle-review";
import type { ImportBatch, ImportMapping } from "./imports";
import {
  accountSignal, C09_NATURES, contractualDays, DAY_COUNTS, dayBase, expectedAccounts, formatRatePpm, INTERVAL_CONVENTION, isC09Nature, LOAN_EXCLUSIONS, LOAN_NATURES,
  LOAN_RULE_VERSION, RATE_PATTERN, ratePpm, resolveLoanRules, SIMPLE_NATURES, type DayCount, type LoanNature, type LoanRuleResolution,
} from "./loan-rules";
import { assertScope, frozen, moneySchema, periodId, type EvidenceLink, type Population, type SelectionSet, type WorkpaperScope } from "./model";

/**
 * Emprunts (C13) — procédure spécialisée au-dessus du rapprochement générique, portée du chantier local Mission 14
 * et complétée : taux fixes / variables sourcés (index, marge, dates de révision), conventions de jours nommées au
 * contrat, frais séparés, cadrage du périmètre sur la balance, présentation par le texte applicable et, pour les
 * instruments proches des fonds propres, par le moteur C09 (termes contractuels déclarés). Un montant inconnu reste
 * inconnu ; aucun taux, aucune convention ni aucun seuil de covenant n'est supposé.
 */
export const LOAN_TYPES = ["loan_contracts", "loan_schedule", "loan_ledger", "loan_payments", "loan_confirmations", "loan_clauses", "loan_rates", "loan_balance"] as const;
export type LoanType = typeof LOAN_TYPES[number];
export const LOAN_LABELS: Record<LoanType, string> = {
  loan_contracts: "Contrats et avenants", loan_schedule: "Échéanciers", loan_ledger: "Grand livre des emprunts", loan_payments: "Paiements",
  loan_confirmations: "Confirmations des prêteurs", loan_clauses: "Garanties et covenants", loan_rates: "Révisions de taux (index)", loan_balance: "Balance des comptes de dettes financières",
};
export const LOAN_SCHEMA = "loans-review-1" as const;

const text = z.string().trim().min(1).max(12000), short = z.string().trim().min(1).max(300);
const account = z.string().trim().regex(/^\d{2,12}$/, "Numéro de compte en chiffres");
const rate = z.string().regex(RATE_PATTERN, "Taux en pourcentage, 6 décimales au plus");
export const loanSourceSchema = z.object({ title: text, pack: text, date: dateSchema, page: z.number().int().positive().nullable(), clause: text, excerpt: text }).strict();
const common = { contractId: short, source: loanSourceSchema };
/** Version d'un contrat (contrat initial ou avenant). Montant de la ligne : nominal emprunté ; date : date d'effet de la version. */
export const contractSchema = z.object({
  ...common, version: short, name: text, lender: text, nature: z.enum(LOAN_NATURES), principalAccount: account.nullable(), accruedAccount: account.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/), startDate: dateSchema, maturity: dateSchema, effectiveFrom: dateSchema, effectiveTo: dateSchema,
  dayCount: z.enum([...DAY_COUNTS, "autre"]).nullable(), rateKind: z.enum(["fixed", "variable"]).nullable(), fixedRatePercent: rate.nullable(),
  indexName: short.nullable(), spreadPercent: rate.nullable(), revisionDates: z.array(dateSchema).max(600).nullable(), indexBounds: z.boolean().nullable(),
  feesTreatment: z.enum(["separate_cash", "capitalised", "other"]).nullable(), movementsComplete: z.boolean().nullable(), scheduleComplete: z.boolean().nullable(),
  lastInterestPaidThrough: dateSchema.nullable(), intervalConvention: z.literal(INTERVAL_CONVENTION).nullable(), terms: instrumentTermsSchema.nullable(),
}).strict();
/** Échéance. Montant : principal remboursé à l'échéance (0.00 si intérêts seuls) ; date : date d'exigibilité. */
const scheduleSchema = z.object({ ...common, contractVersion: short, start: dateSchema, end: dateSchema, dueDate: dateSchema, kind: z.enum(["scheduled", "early"]),
  interest: moneySchema.nullable(), fees: moneySchema.nullable(), explanation: text.nullable() }).strict();
const ledgerSchema = z.object({ ...common, account, basis: z.enum(["opening_principal", "closing_principal", "draw", "principal_repayment", "interest", "opening_accrued_interest", "accrued_interest", "fee"]), dueId: short.nullable() }).strict();
const paymentSchema = z.object({ ...common, basis: z.enum(["principal", "interest", "fee"]), dueId: short.nullable() }).strict();
const confirmationSchema = z.object({ ...common, basis: z.literal("closing_principal") }).strict();
const clauseSchema = z.object({ ...common, kind: z.enum(["guarantee", "covenant"]), reading: z.enum(["unread", "read", "qualified"]), reader: short.nullable(), qualification: text.nullable(),
  definition: text.nullable(), threshold: text.nullable(), testDate: dateSchema.nullable() }).strict();
/** Révision de taux : date de la ligne = date de révision contractuelle ; valeur de l'index publiée à la date de fixation. */
const rateSchema = z.object({ ...common, indexName: short, indexPercent: rate, fixingDate: dateSchema }).strict();
/** Balance des comptes de dettes financières à la clôture : clé = compte ; montant = solde créditeur. */
const balanceSchema = z.object({ account, label: text, basis: z.literal("account_closing"), source: loanSourceSchema }).strict();
const SCHEMAS: Record<LoanType, z.ZodTypeAny> = { loan_contracts: contractSchema, loan_schedule: scheduleSchema, loan_ledger: ledgerSchema, loan_payments: paymentSchema,
  loan_confirmations: confirmationSchema, loan_clauses: clauseSchema, loan_rates: rateSchema, loan_balance: balanceSchema };
export type Contract = z.infer<typeof contractSchema>;
export type Due = z.infer<typeof scheduleSchema>;
export type Clause = z.infer<typeof clauseSchema>;
export type LoanSource = z.infer<typeof loanSourceSchema>;

export const LOAN_MAPPING: ImportMapping = { version: LOAN_SCHEMA, headerRow: 1, delimiter: ";", decimal: ".", dateFormat: "ISO", currency: "EUR", sign: 1, columns: { key: "Key", amount: "Amount", date: "Date" } };
export const loanMappingSchema = z.object({ version: z.literal(LOAN_SCHEMA), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(), delimiter: z.literal(";"), decimal: z.literal("."),
  dateFormat: z.literal("ISO"), currency: z.literal("EUR"), sign: z.literal(1), columns: z.object({ key: z.literal("Key"), amount: z.literal("Amount"), date: z.literal("Date") }).strict() }).strict();

export interface LoanFact {
  rowId: string; documentVersionId: string; importId: string; id: string; type: LoanType; amount: Money; date: string; details: Record<string, unknown>;
  proof: EvidenceLink; fileName: string; hash: string; line?: number; sheet?: string;
}
const parseDetails = (raw: string | undefined) => { try { return JSON.parse(raw ?? ""); } catch { throw new Error("LOAN_DETAILS_JSON_INVALID"); } };

/** Contrôle d'une source approuvable : schéma fermé par type, dates civiles, rien après la date de revue. */
export function assertLoanBatch(batch: ImportBatch, period: AccountingPeriod) {
  loanMappingSchema.parse(batch.mapping);
  const type = batch.document.documentType as LoanType;
  if (!LOAN_TYPES.includes(type)) throw new Error("LOAN_SOURCE_TYPE_INVALID");
  const keys = new Set<string>();
  for (const row of batch.rows) {
    assertScope(batch.scope, row.scope);
    if (!row.normalized || row.errors.length || keys.has(row.normalized.key)) throw new Error("LOAN_SOURCE_ROW_INVALID");
    keys.add(row.normalized.key);
    const d = SCHEMAS[type].parse(parseDetails(row.original.Details)), value = cents(row.normalized.amount);
    if (d.source.date > period.asOfDate) throw new Error("LOAN_SOURCE_AFTER_REVIEW");
    if (type !== "loan_schedule" && row.normalized.date > period.asOfDate) throw new Error("LOAN_EVENT_AFTER_REVIEW");
    if (type === "loan_contracts") {
      if (d.startDate > d.maturity || d.effectiveFrom > d.effectiveTo || row.normalized.date !== d.effectiveFrom || value <= 0n) throw new Error("LOAN_CONTRACT_DATES_INVALID");
      if (d.revisionDates && d.revisionDates.some((r: string, i: number) => i > 0 && r <= d.revisionDates[i - 1])) throw new Error("LOAN_REVISION_DATES_INVALID");
    }
    if (type === "loan_schedule" && (d.start >= d.end || d.dueDate < d.end || row.normalized.date !== d.dueDate)) throw new Error("LOAN_SCHEDULE_DATES_INVALID");
    if ((type === "loan_schedule" || type === "loan_payments") && value < 0n) throw new Error("LOAN_MAGNITUDE_INVALID");
    if ((type === "loan_clauses" || type === "loan_rates") && value !== 0n) throw new Error("LOAN_AMOUNT_NOT_APPLICABLE");
    // An index value is usable only once fixed: at the latest on the revision date and on the notice date (itself not after the review date).
    if (type === "loan_rates" && (d.fixingDate > row.normalized.date || d.fixingDate > d.source.date)) throw new Error("LOAN_RATE_FIXING_DATE_INVALID");
    if (type === "loan_clauses" && d.reading !== "unread" && (!d.reader || !d.qualification)) throw new Error("LOAN_CLAUSE_READING_EVIDENCE_REQUIRED");
    if (type === "loan_balance" && (row.normalized.date !== period.closingDate || row.normalized.key !== d.account)) throw new Error("LOAN_BALANCE_ROW_INVALID");
  }
}

export function loanFacts(scope: WorkpaperScope, period: AccountingPeriod, batches: ImportBatch[], runId: string): LoanFact[] {
  return batches.flatMap(batch => {
    assertScope(scope, batch.scope); assertLoanBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed) throw new Error("LOAN_IMPORT_UNAPPROVED");
    const type = batch.document.documentType as LoanType;
    return batch.rows.map(row => ({
      rowId: row.id, documentVersionId: batch.document.id, importId: batch.id, id: row.normalized!.key, type, amount: row.normalized!.amount, date: row.normalized!.date,
      details: SCHEMAS[type].parse(parseDetails(row.original.Details)),
      proof: { id: "loan-proof-" + stableSha256({ runId, row: row.id, document: batch.document.id }), scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id,
        locator: row.locator, precision: "row" as const, status: "verified" as const, purpose: LOAN_LABELS[type] },
      fileName: batch.document.fileName, hash: batch.document.byteHash, line: row.locator.row, sheet: row.locator.sheet,
    }));
  });
}
const contractOf = (f: LoanFact) => typeof f.details.contractId === "string" ? f.details.contractId : null;

export const loanDraftSchema = z.object({ schemaVersion: z.literal(LOAN_SCHEMA), contractIds: z.array(short).min(1).max(2000), sourceRowIds: z.array(z.string().min(1).max(250)).min(1).max(50000) }).strict();
export type LoanDraft = z.infer<typeof loanDraftSchema>;
export const loanWorkSchema = loanDraftSchema.extend({ authorId: short, authoredAt: z.string().datetime() }).strict();
export type LoanWork = z.infer<typeof loanWorkSchema>;
/** Toutes les lignes approuvées et tous les contrats cités sont associés : aucune ligne n'est écartée en silence. */
export function initialLoanDraft(facts: LoanFact[]): LoanDraft {
  return { schemaVersion: LOAN_SCHEMA, contractIds: [...new Set(facts.flatMap(f => contractOf(f) ?? []))].sort(), sourceRowIds: facts.map(f => f.rowId).sort() };
}
export function stampLoanWork(draft: LoanDraft, batches: ImportBatch[], scope: WorkpaperScope, period: AccountingPeriod, runId: string, authorId: string, authoredAt: string): LoanWork {
  loanDraftSchema.parse(draft);
  const expected = initialLoanDraft(loanFacts(scope, period, batches, runId));
  if (stableSha256({ ...draft, contractIds: [...draft.contractIds].sort(), sourceRowIds: [...draft.sourceRowIds].sort() }) !== stableSha256(expected)) throw new Error("LOAN_COMPLETE_SOURCE_ASSOCIATIONS_REQUIRED");
  return loanWorkSchema.parse({ ...draft, authorId, authoredAt });
}

/**
 * Population : un contrat (toutes ses versions, ou les lignes qui citent une référence sans contrat) et une échéance
 * exigible pendant l'exercice. Les échéances futures restent dans l'import, hors population. Aucune somme des
 * montants de la population : contrats (nominal) et échéances (principal) ne s'additionnent pas.
 */
export function isLoanPopulation(imports: ImportBatch[]) { return imports.length > 0 && imports.every(b => b.mapping.version === LOAN_SCHEMA) && imports.some(b => b.document.documentType === "loan_ledger"); }
export function loanPopulationItems(imports: ImportBatch[], period: AccountingPeriod) {
  const rows = imports.flatMap(b => b.rows.map(r => ({ r, type: b.document.documentType as LoanType, d: parseDetails(r.original.Details) as Record<string, unknown> })));
  const ids = [...new Set(rows.flatMap(x => typeof x.d.contractId === "string" ? [x.d.contractId] : []))].sort();
  const contracts = ids.map(contractId => {
    const versions = rows.filter(x => x.type === "loan_contracts" && x.d.contractId === contractId).sort((a, b) => String(a.d.effectiveFrom).localeCompare(String(b.d.effectiveFrom)));
    const anchors = versions.length ? versions : rows.filter(x => x.d.contractId === contractId);
    return { id: "contract:" + contractId, rowIds: anchors.map(x => x.r.id), amount: anchors[0].r.normalized!.amount };
  });
  const dues = rows.filter(x => x.type === "loan_schedule" && x.r.normalized!.date >= period.startDate && x.r.normalized!.date <= period.closingDate)
    .map(x => ({ id: "due:" + x.r.normalized!.key, rowIds: [x.r.id], amount: x.r.normalized!.amount }));
  return [...contracts, ...dues].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function assertLoanPopulationPeriod(scope: WorkpaperScope, period: AccountingPeriod | undefined): AccountingPeriod {
  if (!period || periodId(period) !== scope.periodId) throw new Error("LOAN_POPULATION_PERIOD_REQUIRED");
  return period;
}

/* ── Calculs ───────────────────────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / DAY;
export const nextDay = (date: string) => new Date((dayNumber(date) + 1) * DAY).toISOString().slice(0, 10);
export const previousDay = (date: string) => new Date((dayNumber(date) - 1) * DAY).toISOString().slice(0, 10);
/** Arrondi au centime une seule fois, demi-centime éloigné de zéro. */
const rounded = (n: bigint, d: bigint) => n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d;
const sum = (facts: LoanFact[]) => money(facts.reduce((n, f) => n + cents(f.amount), 0n));
const isZero = (a: KnownAmount) => a.kind === "known" && cents(a.value) === 0n;
/** Différence a − b ; sans objet si l'un l'est, inconnue si l'un l'est. */
function diff(a: KnownAmount, b: KnownAmount): KnownAmount {
  if (a.kind === "not_applicable" || b.kind === "not_applicable") return { kind: "not_applicable", reason: a.kind === "not_applicable" ? a.reason : (b as { reason: string }).reason };
  if (a.kind === "unknown" || b.kind === "unknown") return unknown(a.kind === "unknown" ? a.reason : (b as { reason: string }).reason);
  return known(money(cents(a.value) - cents(b.value)));
}
const DENOMINATOR = 100_000_000n * 360n * 365n;

export interface InterestSegment {
  kind: "calculated" | "opening_accrued"; start: string; end: string; principal: Money | null; days: number | null; ratePpm: string | null; rateLabel: string;
  version: string | null; contractRowId: string | null; fixingRowId: string | null; dayCount: string | null; amount: Money | null;
}
export interface InterestReview { amount: KnownAmount; segments: InterestSegment[]; status: "calculated" | "blocked" | "not_applicable"; reason: string }
interface ContractContext { period: AccountingPeriod; versions: LoanFact[]; ledger: LoanFact[]; rates: LoanFact[] }

/** Version en vigueur à une date ; null si aucune ou plusieurs (chevauchement). */
function versionAt(versions: LoanFact[], date: string): LoanFact | null | "overlap" {
  const active = versions.filter(v => String(v.details.effectiveFrom) <= date && String(v.details.effectiveTo) >= date);
  return active.length === 1 ? active[0] : active.length > 1 ? "overlap" : null;
}

/** Taux d'un segment [from, …) d'une version : fixe, ou index de la révision contractuelle applicable + marge. */
function segmentRate(c: Contract, ctx: ContractContext, from: string): { ppm: bigint; label: string; fixingRowId: string | null } | string {
  if (c.rateKind === "fixed") return c.fixedRatePercent ? { ppm: ratePpm(c.fixedRatePercent), label: "taux fixe " + formatRatePpm(ratePpm(c.fixedRatePercent)), fixingRowId: null } : "Taux fixe contractuel requis (aucun taux par défaut)";
  if (c.rateKind !== "variable") return "Nature du taux (fixe ou variable) requise";
  if (!c.indexName || c.spreadPercent === null || !c.revisionDates?.length) return "Index, marge et dates de révision contractuelles requis";
  if (c.indexBounds !== false) return c.indexBounds === true ? LOAN_EXCLUSIONS.bounds : "Présence d’un plancher ou plafond d’index à documenter";
  const revision = [...c.revisionDates].filter(r => r <= from).pop();
  if (!revision) return "Aucune date de révision contractuelle au plus tard le " + from;
  const fixings = ctx.rates.filter(r => r.date === revision && r.details.indexName === c.indexName);
  if (fixings.length !== 1) return fixings.length ? "Plusieurs valeurs d’index pour la révision du " + revision : "Taux absent : index « " + c.indexName + " » non fourni pour la révision du " + revision + " (aucun taux par défaut)";
  const index = ratePpm(String(fixings[0].details.indexPercent)), spread = ratePpm(c.spreadPercent);
  return { ppm: index + spread, label: c.indexName + " " + formatRatePpm(index) + " (révision du " + revision + ") + marge " + formatRatePpm(spread), fixingRowId: fixings[0].rowId };
}

/**
 * Intérêt d'un intervalle [start, end). La part antérieure à l'ouverture n'est pas recalculée (principal non
 * documenté par le GL de l'exercice) : elle est reprise des intérêts courus d'ouverture du GL, attribuables à une
 * seule échéance. La part de l'exercice est découpée aux mouvements de principal, aux dates d'effet des versions et
 * aux révisions de taux ; intérêt simple, fractions exactes, arrondi une seule fois.
 */
export function calculateLoanInterest(ctx: ContractContext, start: string, end: string, openingShare: "allowed" | "refused" = "allowed"): InterestReview {
  const fail = (reason: string): InterestReview => ({ amount: unknown(reason), segments: [], status: "blocked", reason });
  const { period } = ctx;
  if (!(start < end) || end > nextDay(period.closingDate)) return fail("Intervalle hors de l’exercice documenté");
  const segments: InterestSegment[] = [];
  let openingCents = 0n;
  if (start < period.startDate) {
    if (openingShare === "refused") return fail("Intérêts courus d’ouverture déjà attribués à une autre échéance");
    const opening = ctx.ledger.filter(f => f.details.basis === "opening_accrued_interest" && f.date === period.startDate);
    if (opening.length !== 1) return fail("Part antérieure à l’ouverture : intérêts courus d’ouverture (GL) requis, principal antérieur non documenté");
    openingCents = cents(opening[0].amount);
    const until = end < period.startDate ? end : period.startDate;
    segments.push({ kind: "opening_accrued", start, end: until, principal: null, days: null, ratePpm: null, rateLabel: "Intérêts courus d’ouverture (GL)", version: null, contractRowId: null, fixingRowId: opening[0].rowId, dayCount: null, amount: opening[0].amount });
  }
  const from0 = start < period.startDate ? period.startDate : start;
  if (from0 >= end) return { amount: known(money(openingCents)), segments, status: "calculated", reason: "Intervalle antérieur à l’ouverture : intérêts courus d’ouverture du GL" };
  const openingPrincipal = ctx.ledger.filter(f => f.details.basis === "opening_principal" && f.date === period.startDate);
  if (openingPrincipal.length !== 1) return fail("Principal d’ouverture unique requis");
  const events = ctx.ledger.filter(f => (f.details.basis === "draw" || f.details.basis === "principal_repayment") && f.date >= period.startDate && f.date <= period.closingDate);
  if (events.some(f => cents(f.amount) < 0n)) return fail("Mouvements de principal en montants positifs requis");
  const revisionDates = ctx.versions.flatMap(v => (v.details.revisionDates as string[] | null) ?? []);
  const boundaries = [...new Set([from0, end, ...events.map(e => e.date), ...ctx.versions.map(v => String(v.details.effectiveFrom)), ...ctx.versions.map(v => nextDay(String(v.details.effectiveTo))), ...revisionDates])]
    .filter(d => d >= from0 && d <= end).sort();
  let numerator = 0n;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i], to = boundaries[i + 1], active = versionAt(ctx.versions, from);
    if (!active || active === "overlap") return fail(active === "overlap" ? "Versions contractuelles chevauchantes au " + from : "Aucune version contractuelle en vigueur au " + from);
    const c = contractSchema.parse(active.details);
    if (from < c.startDate || to > nextDay(c.maturity)) return fail("Intervalle hors des dates du contrat");
    if (c.currency !== "EUR") return fail(LOAN_EXCLUSIONS.currency);
    if (c.feesTreatment !== "separate_cash") return fail(c.feesTreatment === null ? "Traitement des frais à documenter" : LOAN_EXCLUSIONS.fees);
    if (c.movementsComplete !== true) return fail("Exhaustivité des mouvements de principal non documentée");
    if (!c.intervalConvention) return fail("Convention de bornes (départ inclus, fin exclue) à documenter");
    if (!c.dayCount) return fail("Convention de jours contractuelle requise (aucune convention par défaut)");
    if (c.dayCount === "autre") return fail(LOAN_EXCLUSIONS.day_count);
    const r = segmentRate(c, ctx, from);
    if (typeof r === "string") return fail(r);
    if (r.ppm < 0n) return fail("Taux négatif : non couvert");
    const principal = cents(openingPrincipal[0].amount) + events.filter(e => e.date <= from).reduce((n, e) => n + (e.details.basis === "draw" ? 1n : -1n) * cents(e.amount), 0n);
    if (principal < 0n) return fail("Principal négatif à expliquer avant calcul");
    const dayCount: DayCount = c.dayCount, days = contractualDays(from, to, dayCount);
    numerator += principal * r.ppm * BigInt(days) * (dayBase(dayCount) === 360 ? 365n : 360n);
    segments.push({ kind: "calculated", start: from, end: to, principal: money(principal), days, ratePpm: r.ppm.toString(), rateLabel: r.label, version: c.version, contractRowId: active.rowId, fixingRowId: r.fixingRowId, dayCount, amount: null });
  }
  const total = openingCents + rounded(numerator, DENOMINATOR);
  return { amount: known(money(total)), segments, status: "calculated", reason: "Intérêt simple sur paramètres sourcés ; segments aux mouvements, avenants et révisions ; arrondi au centime en fin d’intervalle" };
}

/* ── Résultat ──────────────────────────────────────────────────────────────────────────────────────────── */

export interface LoanIssue { code: string; text: string; amount: KnownAmount | null }
export interface DueReview {
  id: string; rowId: string; contractId: string; contractVersion: string; versionInForce: string | null; start: string; end: string; dueDate: string; kind: "scheduled" | "early";
  principal: Money; glPrincipal: KnownAmount; paidPrincipal: KnownAmount; principalDifference: KnownAmount; paymentDifference: KnownAmount;
  providedInterest: KnownAmount; calculatedInterest: InterestReview; interestDifference: KnownAmount; glInterest: KnownAmount; paidInterest: KnownAmount; interestGLDifference: KnownAmount; interestPaymentDifference: KnownAmount;
  fees: KnownAmount; glFees: KnownAmount; paidFees: KnownAmount; feeGLDifference: KnownAmount; feePaymentDifference: KnownAmount;
  dateMatches: boolean; sourceRowIds: string[]; issues: LoanIssue[];
}
export interface LoanPresentation {
  nature: LoanNature | null; rubric: string | null; expectedPrincipal: string[]; expectedAccrued: string[]; declaredPrincipalAccount: string | null; declaredAccruedAccount: string | null;
  signals: string[]; otherEquity: ClassifiedInstrument | null; exclusion: { kind: "other_equity" | "outside_cycle" | "unsupported"; reason: string } | null;
}
export interface LoanReview {
  id: string; name: string; lender: string; status: "documented" | "explain" | "inconclusive" | "excluded";
  contractRowIds: string[]; factRowIds: string[]; presentation: LoanPresentation;
  opening: KnownAmount; draws: KnownAmount; repaid: KnownAmount; expectedClosing: KnownAmount; closing: KnownAmount; residual: KnownAmount; confirmation: KnownAmount; confirmationDifference: KnownAmount;
  openingAccrued: KnownAmount; accrued: InterestReview; bookedAccrued: KnownAmount; accruedDifference: KnownAmount;
  dues: DueReview[]; clauseRowIds: string[]; issues: LoanIssue[];
  versionChanges: { from: string; to: string; effective: string; fields: { field: string; before: string; after: string }[] }[];
}
export interface FramingRow { account: string; label: string | null; balance: KnownAmount; ledger: KnownAmount; difference: KnownAmount; contractIds: string[]; balanceRowId: string | null; ledgerRowIds: string[] }
export interface LoanFraming { status: "complete" | "mismatch" | "not_provided"; rows: FramingRow[]; net: KnownAmount; convention: string }
export interface LoanResult {
  schemaVersion: "loans-result-1"; ruleVersion: string; runId: string; work: LoanWork; rules: LoanRuleResolution; presentationRegime: PresentationResolution;
  /** Proof links of every frozen row; the rows themselves are re-derived from the frozen sources (never copied into each version). */
  rows: LoanReview[]; framing: LoanFraming; framingIssues: LoanIssue[]; evidence: EvidenceLink[];
  outcome: "exceptions_detected" | "inconclusive" | "no_exception_detected";
  coverage: { selected: number; denominator: number; contracts: number; dues: number; exclusions: SelectionSet["exclusions"] };
  limitations: string[];
}

const issue = (code: string, text: string, amount: KnownAmount | null = null): LoanIssue => ({ code, text, amount });
const OTHER_EQUITY: readonly string[] = ["capitaux_propres", "fonds_non_remboursables", "avances_conditionnees", "droits_concedant", "autres_fonds_propres_declares"];
const slug = (id: string) => ("loan-" + id.normalize("NFD").replace(/[^A-Za-z0-9._-]/g, "-")).slice(0, 80);
/** French reading of an exact amount in point texts (thousands grouped, true minus sign); never through floating point. */
const fmt = (m: Money) => { const negative = m.amount.startsWith("-"), [whole, decimals] = m.amount.replace("-", "").split("."); return (negative ? "−" : "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + decimals + " EUR"; };

function presentationOf(id: string, terms: Contract[], versions: LoanFact[], closingRows: LoanFact[], accruedRows: LoanFact[], rules: LoanRuleResolution, regime: PresentationResolution, work: LoanWork): LoanPresentation {
  const base: LoanPresentation = { nature: null, rubric: null, expectedPrincipal: [], expectedAccrued: [], declaredPrincipalAccount: null, declaredAccruedAccount: null, signals: [], otherEquity: null, exclusion: null };
  if (!terms.length) return base;
  const natures = [...new Set(terms.map(t => t.nature))];
  if (natures.length > 1) return { ...base, exclusion: { kind: "unsupported", reason: "Nature d’instrument modifiée entre versions (" + natures.join(", ") + ") : à qualifier." } };
  const nature = natures[0], current = terms[terms.length - 1], expected = expectedAccounts(rules.textId, nature);
  const signals = [
    accountSignal(rules.textId, nature, current.principalAccount, "principal"), accountSignal(rules.textId, nature, current.accruedAccount, "accrued"),
    ...closingRows.map(f => accountSignal(rules.textId, nature, String(f.details.account), "principal")), ...accruedRows.map(f => accountSignal(rules.textId, nature, String(f.details.account), "accrued")),
    ...closingRows.filter(f => current.principalAccount && f.details.account !== current.principalAccount).map(f => `GL : principal de clôture au compte ${String(f.details.account)}, contrat déclaré au compte ${current.principalAccount} — à rapprocher.`),
  ].filter((s): s is string => !!s);
  const out: LoanPresentation = { ...base, nature, rubric: expected?.rubric ?? null, expectedPrincipal: expected?.principal ?? [], expectedAccrued: expected?.accrued ?? [],
    declaredPrincipalAccount: current.principalAccount, declaredAccruedAccount: current.accruedAccount, signals: [...new Set(signals)] };
  if (isC09Nature(nature)) {
    const closingByAccount = new Map<string, Money>();
    for (const f of closingRows) closingByAccount.set(String(f.details.account), money((closingByAccount.has(String(f.details.account)) ? cents(closingByAccount.get(String(f.details.account))!) : 0n) + cents(f.amount)));
    const cited = versions[versions.length - 1];
    const classified = classifyInstrument(regime.regime, {
      id: slug(id), label: current.name, kind: C09_NATURES[nature], accounts: current.principalAccount ? [current.principalAccount] : [],
      terms: current.terms ?? { capitauxPropres: "inconnu", remboursementImposable: "inconnu", partsFixes: "inconnu", partNonRemboursable: null, avanceFondsPublics: "inconnu", remboursementConditionneSucces: "inconnu", abandonEnCasEchec: "inconnu", interetsConditionnes: "inconnu", presentationDeclaree: null },
      note: current.terms ? "" : "Termes contractuels non transcrits dans la version du contrat.",
      citation: { documentVersionId: cited.documentVersionId, importId: cited.importId, fileName: cited.fileName, sha256: cited.hash, ...(current.source.page ? { page: current.source.page } : {}) },
      authorId: work.authorId, authoredAt: work.authoredAt,
    }, closingByAccount);
    out.otherEquity = classified;
    out.exclusion = OTHER_EQUITY.includes(classified.category)
      ? { kind: "other_equity", reason: "Présenté hors dettes (" + classified.reasons.join(" ") + ") — hors du calcul des emprunts ; la composition des autres fonds propres relève de la feuille Capitaux propres." }
      : { kind: "unsupported", reason: (LOAN_EXCLUSIONS[nature] ?? "Hors calcul simple.") + (classified.category === "a_qualifier" ? " Classement à qualifier : " + (classified.missing.join(" ; ") || classified.reasons.join(" ")) : " Classement : " + classified.category + ".") };
    return out;
  }
  if (!SIMPLE_NATURES.includes(nature)) out.exclusion = { kind: nature === "concours_bancaires" || nature === "credit_bail" ? "outside_cycle" : "unsupported", reason: LOAN_EXCLUSIONS[nature] ?? "Hors calcul simple." };
  else if (terms.some(t => t.currency !== "EUR")) out.exclusion = { kind: "unsupported", reason: LOAN_EXCLUSIONS.currency };
  else if (terms.some(t => t.feesTreatment === "capitalised" || t.feesTreatment === "other")) out.exclusion = { kind: "unsupported", reason: LOAN_EXCLUSIONS.fees };
  else if (terms.some(t => t.rateKind === "variable" && t.indexBounds === true)) out.exclusion = { kind: "unsupported", reason: LOAN_EXCLUSIONS.bounds };
  else if (terms.some(t => t.dayCount === "autre")) out.exclusion = { kind: "unsupported", reason: LOAN_EXCLUSIONS.day_count };
  return out;
}

function framingOf(context: CycleContext, facts: LoanFact[], period: AccountingPeriod): { framing: LoanFraming; issues: LoanIssue[] } {
  const convention = "Balance − GL des contrats du pack, par compte (principal et intérêts courus à la clôture) ; aucun écart compensé entre comptes.";
  const balance = facts.filter(f => f.type === "loan_balance");
  if (!balance.length) return { framing: { status: "not_provided", rows: [], net: unknown("Balance des comptes de dettes financières non fournie"), convention },
    issues: [issue("framing_missing", "Balance des comptes de dettes financières non fournie : périmètre non cadré, exhaustivité de la population non établie.")] };
  const ledger = facts.filter(f => f.type === "loan_ledger" && (f.details.basis === "closing_principal" || f.details.basis === "accrued_interest") && f.date === period.closingDate);
  const accounts = [...new Set([...balance.map(f => f.id), ...ledger.map(f => String(f.details.account))])].sort();
  const line = (f: LoanFact, key: string): BalanceLine => ({ id: f.rowId, key, account: key, value: { amount: f.amount, date: period.closingDate, basis: "account_closing", evidence: [f.proof] } });
  const both = accounts.filter(a => balance.some(f => f.id === a) && ledger.some(f => f.details.account === a));
  const generic = both.length ? reconcileLoanBalances(context, balance.filter(f => both.includes(f.id)).map(f => line(f, f.id)), ledger.filter(f => both.includes(String(f.details.account))).map(f => line(f, String(f.details.account))), "account") : null;
  const rows: FramingRow[] = accounts.map(account => {
    const b = balance.find(f => f.id === account), l = ledger.filter(f => f.details.account === account), g = generic?.rows.find(r => r.key === account);
    const contractIds = [...new Set(l.flatMap(f => contractOf(f) ?? []))].sort();
    const balanceAmount: KnownAmount = b ? known(b.amount) : unknown("Compte absent de la balance fournie");
    const ledgerAmount: KnownAmount = l.length ? known(sum(l)) : known(money(0n));
    const difference: KnownAmount = !b ? unknown("Compte du GL absent de la balance fournie") : g ? g.difference : known(b.amount);
    return { account, label: b ? String(b.details.label) : null, balance: balanceAmount, ledger: ledgerAmount, difference, contractIds, balanceRowId: b?.rowId ?? null, ledgerRowIds: l.map(f => f.rowId) };
  });
  const issues = rows.flatMap(r => r.difference.kind === "unknown" ? [issue("framing_unknown:" + r.account, `Cadrage du compte ${r.account} non établi : ${r.difference.reason}.`)]
    : r.difference.kind === "known" && cents(r.difference.value) !== 0n ? [issue("framing_mismatch:" + r.account, `Mismatch de périmètre au compte ${r.account} : balance − GL des contrats du pack = ${fmt(r.difference.value)} (${r.contractIds.length ? "contrats " + r.contractIds.join(", ") : "aucun contrat du pack"}). Population incomplète ou contrat hors pack : aucune dette omise affirmée.`, r.difference)] : []);
  const complete = rows.every(r => r.difference.kind === "known");
  const net = complete ? known(money(rows.reduce((n, r) => n + (r.difference.kind === "known" ? cents(r.difference.value) : 0n), 0n))) : unknown("Cadrage partiel");
  return { framing: { status: issues.length ? "mismatch" : "complete", rows, net, convention }, issues };
}

/** Points of review created at execution: one per issue, each with its own amount only (never a zero for an unknown). */
export function loanReviewPoints(result: LoanResult): { key: string; issue: LoanIssue }[] {
  return [
    ...result.rows.flatMap(r => [...r.issues.map((issue, i) => ({ key: r.id + ":" + i, issue })),
      ...r.dues.flatMap(d => d.issues.map((issue, i) => ({ key: r.id + ":" + d.id + ":" + i, issue: { ...issue, text: d.id + " · " + issue.text } })))]),
    ...result.framingIssues.map((issue, i) => ({ key: "cadrage:" + i, issue })),
  ];
}

export function evaluateLoans(scope: WorkpaperScope, period: AccountingPeriod, batches: ImportBatch[], runId: string, population: Population, selection: SelectionSet, work: LoanWork): LoanResult {
  const context: CycleContext = { scope, period, purpose: scope.mode === "demo" ? "synthetic_technical" : "real", procedure: "loans.review" };
  assertLoansContext(context); loanWorkSchema.parse(work); assertScope(scope, population.scope); assertScope(scope, selection.scope);
  const facts = loanFacts(scope, period, batches, runId);
  if (stableSha256(initialLoanDraft(facts)) !== stableSha256({ schemaVersion: work.schemaVersion, contractIds: work.contractIds, sourceRowIds: work.sourceRowIds })) throw new Error("LOAN_WORK_SOURCES_STALE");
  const rules = resolveLoanRules(period), regime = presentationResolution(period, false);
  const selectedIds = new Set(selection.selectedIds);
  const selectedRows = new Set(population.items.filter(i => selectedIds.has(i.id)).flatMap(i => i.rowIds));
  const ids = work.contractIds.filter(id => selectedIds.has("contract:" + id));
  const inPeriod = (f: LoanFact) => f.date >= period.startDate && f.date <= period.closingDate;
  const at = (ls: LoanFact[], basis: string, date: string, label: string): KnownAmount => { const rows = ls.filter(f => f.details.basis === basis && f.date === date); return rows.length === 1 ? known(rows[0].amount) : unknown(rows.length ? "Plusieurs lignes : " + label : "Source requise : " + label); };

  const rows: LoanReview[] = ids.map(id => {
    const fs = facts.filter(f => contractOf(f) === id);
    const versions = fs.filter(f => f.type === "loan_contracts").sort((a, b) => String(a.details.effectiveFrom).localeCompare(String(b.details.effectiveFrom)));
    const terms = versions.map(f => contractSchema.parse(f.details)), ledger = fs.filter(f => f.type === "loan_ledger"), payments = fs.filter(f => f.type === "loan_payments"), rates = fs.filter(f => f.type === "loan_rates");
    const clauses = fs.filter(f => f.type === "loan_clauses"), issues: LoanIssue[] = [];
    const closingRows = ledger.filter(f => f.details.basis === "closing_principal" && f.date === period.closingDate), accruedRows = ledger.filter(f => f.details.basis === "accrued_interest" && f.date === period.closingDate);
    // Presentation reads the versions in force up to the closing date: an amendment effective after closing (known by the review date)
    // stays in the version history, never applied to the closing balance. A contract with no version yet in force keeps its first one.
    const inForce = terms.filter(t => t.effectiveFrom <= period.closingDate).length || Math.min(1, terms.length);
    const presentation = presentationOf(id, terms.slice(0, inForce), versions.slice(0, inForce), closingRows, accruedRows, rules, regime, work);
    const name = terms[inForce - 1]?.name ?? id + " · contrat à identifier", lender = terms[inForce - 1]?.lender ?? "Prêteur non identifié";
    const opening = at(ledger, "opening_principal", period.startDate, "principal d’ouverture"), closing = at(ledger, "closing_principal", period.closingDate, "principal de clôture");
    const versionChanges = terms.slice(1).map((t, i) => ({ from: terms[i].version, to: t.version, effective: t.effectiveFrom,
      fields: (["maturity", "dayCount", "rateKind", "fixedRatePercent", "indexName", "spreadPercent", "revisionDates", "feesTreatment", "principalAccount"] as const)
        .filter(k => JSON.stringify(terms[i][k]) !== JSON.stringify(t[k])).map(field => ({ field, before: JSON.stringify(terms[i][field]), after: JSON.stringify(t[field]) })) }));
    const empty = (reason: string): KnownAmount => unknown(reason);
    const base = { id, name, lender, contractRowIds: versions.map(f => f.rowId), factRowIds: fs.map(f => f.rowId), presentation, opening, closing, clauseRowIds: clauses.map(f => f.rowId), versionChanges };
    if (!terms.length) {
      issues.push(issue("unidentified", "Contrat non identifié : lignes GL conservées, pont, échéances et intérêts non concluants (aucun paramètre supposé)."));
      return { ...base, status: "inconclusive", draws: empty("Contrat non identifié"), repaid: empty("Contrat non identifié"), expectedClosing: empty("Contrat non identifié"), residual: empty("Contrat non identifié"),
        confirmation: unknown("Contrat non identifié"), confirmationDifference: unknown("Contrat non identifié"), openingAccrued: unknown("Contrat non identifié"),
        accrued: { amount: unknown("Contrat non identifié"), segments: [], status: "blocked", reason: "Contrat non identifié" }, bookedAccrued: unknown("Contrat non identifié"), accruedDifference: unknown("Contrat non identifié"), dues: [], issues };
    }
    if (presentation.exclusion) {
      issues.push(issue("excluded:" + presentation.exclusion.kind, presentation.exclusion.reason));
      const na = (reason: string): KnownAmount => ({ kind: "not_applicable", reason });
      return { ...base, status: "excluded", draws: na("Hors calcul"), repaid: na("Hors calcul"), expectedClosing: na("Hors calcul"), residual: na("Hors calcul"),
        confirmation: na("Hors calcul"), confirmationDifference: na("Hors calcul"), openingAccrued: na("Hors calcul"), accrued: { amount: na("Hors calcul"), segments: [], status: "not_applicable", reason: presentation.exclusion.reason },
        bookedAccrued: na("Hors calcul"), accruedDifference: na("Hors calcul"), dues: [], issues };
    }
    for (const s of presentation.signals) issues.push(issue("account_signal", s));
    // Versions: dates d'effet sans chevauchement ni trou pendant l'exercice.
    const overlaps = versions.some((v, i) => i > 0 && String(v.details.effectiveFrom) <= String(versions[i - 1].details.effectiveTo));
    if (overlaps) issues.push(issue("versions_overlap", "Versions contractuelles chevauchantes : avenant à rapprocher, calcul bloqué sur la période concernée."));
    if (terms.some(t => t.movementsComplete !== true)) issues.push(issue("movements_incomplete", "Exhaustivité des mouvements de principal non documentée : pont non concluant."));
    const movements = ledger.filter(f => (f.details.basis === "draw" || f.details.basis === "principal_repayment") && inPeriod(f));
    const complete = terms.every(t => t.movementsComplete === true) && !movements.some(f => cents(f.amount) < 0n);
    const draws = complete ? known(sum(movements.filter(f => f.details.basis === "draw"))) : unknown("Mouvements de principal incomplets"),
      repaid = complete ? known(sum(movements.filter(f => f.details.basis === "principal_repayment"))) : unknown("Mouvements de principal incomplets");
    const expectedClosing = complete && opening.kind === "known" && draws.kind === "known" && repaid.kind === "known" ? known(money(cents(opening.value) + cents(draws.value) - cents(repaid.value))) : unknown(opening.kind === "unknown" ? opening.reason : "Pont de principal non calculable");
    const bridgeLine = (amount: Money, ls: LoanFact[], key: string): BalanceLine => ({ id: id + ":" + key, key: id, value: { amount, date: period.closingDate, basis: "contract_principal", evidence: ls.map(f => f.proof) } });
    const framed = expectedClosing.kind === "known" && closing.kind === "known"
      ? reconcileLoanBalances(context, [bridgeLine(closing.value, closingRows, "gl")], [bridgeLine(expectedClosing.value, [...versions, ...ledger.filter(f => f.details.basis === "opening_principal"), ...movements], "bridge")], "key") : null;
    const residual = framed?.net ?? unknown(expectedClosing.kind === "unknown" ? expectedClosing.reason : closing.kind === "unknown" ? closing.reason : "Pont non calculable");
    if (residual.kind === "known" && cents(residual.value) !== 0n) issues.push(issue("residual", `Résidu de principal à expliquer : GL de clôture − principal attendu = ${fmt(residual.value)} ; aucune dette omise affirmée.`, residual));
    if (expectedClosing.kind === "unknown") issues.push(issue("bridge_unknown", "Pont de principal non concluant : " + expectedClosing.reason + "."));
    else if (closing.kind === "unknown") issues.push(issue("closing_unknown", "Principal de clôture du GL : " + closing.reason + "."));

    // Échéances exigibles pendant l'exercice, sélectionnées dans la population.
    const dueFacts = fs.filter(f => f.type === "loan_schedule" && inPeriod(f) && selectedRows.has(f.rowId)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    if (terms.some(t => t.scheduleComplete !== true)) issues.push(issue("schedule_incomplete", "Exhaustivité de l’échéancier non documentée : concordance des échéances non concluante."));
    if (!dueFacts.length && movements.length) issues.push(issue("schedule_missing", "Mouvements de principal sans échéance dans l’échéancier de l’exercice."));
    const allDues = fs.filter(f => f.type === "loan_schedule").map(f => ({ f, d: scheduleSchema.parse(f.details) })).sort((a, b) => a.d.start.localeCompare(b.d.start));
    if (allDues.some((x, i) => i > 0 && x.d.start < allDues[i - 1].d.end)) issues.push(issue("schedule_overlap", "Intervalles d’intérêts chevauchants dans l’échéancier : à expliquer (échéancier modifié ou doublon)."));
    const dueIds = new Set(dueFacts.map(f => f.id));
    const unlinked = fs.filter(f => (f.type === "loan_ledger" || f.type === "loan_payments") && inPeriod(f) && ["principal_repayment", "interest", "fee", "principal"].includes(String(f.details.basis)) && !dueIds.has(String(f.details.dueId)));
    if (unlinked.length) issues.push(issue("unlinked", `${unlinked.length} mouvement(s) GL ou paiement(s) sans échéance de l’exercice identifiée : concordance non concluante.`));
    const straddling = dueFacts.filter(f => String(f.details.start) < period.startDate).map(f => f.id);
    const ctx: ContractContext = { period, versions, ledger, rates };
    const dues: DueReview[] = dueFacts.map(f => {
      const d = scheduleSchema.parse(f.details), ds: LoanIssue[] = [];
      const linked = (ls: LoanFact[], basis: string) => ls.filter(p => p.details.dueId === f.id && p.details.basis === basis);
      const linkedAmount = (rows: LoanFact[], expected: KnownAmount, label: string): KnownAmount => rows.length ? known(sum(rows)) : isZero(expected) ? { kind: "not_applicable", reason: "Aucun " + label + " prévu à l’échéance" } : unknown(label.charAt(0).toUpperCase() + label.slice(1) + " : ligne à relier");
      const principal = known(f.amount);
      const glPrincipal = linkedAmount(linked(ledger, "principal_repayment"), principal, "remboursement de principal au GL"), paidPrincipal = linkedAmount(linked(payments, "principal"), principal, "paiement de principal");
      const providedInterest = d.interest ? known(d.interest) : unknown("Intérêt de l’échéancier non fourni");
      const calculatedInterest = calculateLoanInterest(ctx, d.start, d.end, straddling[0] === f.id || !straddling.includes(f.id) ? "allowed" : "refused");
      const glInterest = linkedAmount(linked(ledger, "interest"), calculatedInterest.amount.kind === "known" ? calculatedInterest.amount : providedInterest, "intérêt au GL");
      const paidInterest = linkedAmount(linked(payments, "interest"), providedInterest, "paiement d’intérêts");
      const fees = d.fees ? known(d.fees) : unknown("Frais contractuels de l’échéance non fournis");
      const glFees = linkedAmount(linked(ledger, "fee"), fees, "frais au GL"), paidFees = linkedAmount(linked(payments, "fee"), fees, "paiement de frais");
      const principalDifference = diff(glPrincipal, principal), paymentDifference = diff(paidPrincipal, principal), interestDifference = diff(providedInterest, calculatedInterest.amount);
      const interestGLDifference = diff(glInterest, calculatedInterest.amount), interestPaymentDifference = diff(paidInterest, providedInterest), feeGLDifference = diff(glFees, fees), feePaymentDifference = diff(paidFees, fees);
      const sourceRows = [f, ...ledger.filter(p => p.details.dueId === f.id), ...payments.filter(p => p.details.dueId === f.id)];
      const dateMatches = sourceRows.slice(1).every(p => p.date === d.dueDate);
      if (!dateMatches) ds.push(issue("due_date", "Date d’écriture ou de paiement différente de l’échéance : à expliquer."));
      const inForce = versionAt(versions, previousDay(d.end));
      const versionInForce = inForce && inForce !== "overlap" ? String(inForce.details.version) : null;
      if (versionInForce && versionInForce !== d.contractVersion) ds.push(issue("schedule_version", `Échéancier modifié : échéance rattachée à la version ${d.contractVersion}, version en vigueur à la fin de l’intervalle : ${versionInForce} — ligne remplacée à retirer ou expliquer.`));
      if (d.kind === "early" && !d.explanation) ds.push(issue("early_explanation", "Remboursement anticipé : clause et explication requises."));
      for (const [label, value] of [["Principal GL", principalDifference], ["Principal payé", paymentDifference], ["Intérêts échéancier − recalculés", interestDifference], ["Intérêts GL − recalculés", interestGLDifference],
        ["Intérêts payés − échéancier", interestPaymentDifference], ["Frais GL − échéancier", feeGLDifference], ["Frais payés − échéancier", feePaymentDifference]] as const) {
        if (value.kind === "unknown") ds.push(issue("due_unknown", label + " : " + value.reason));
        else if (value.kind === "known" && cents(value.value) !== 0n) ds.push(issue("due_difference", label + " : différence de " + fmt(value.value) + " à expliquer.", value));
      }
      return { id: f.id, rowId: f.rowId, contractId: id, contractVersion: d.contractVersion, versionInForce, start: d.start, end: d.end, dueDate: d.dueDate, kind: d.kind, principal: f.amount,
        glPrincipal, paidPrincipal, principalDifference, paymentDifference, providedInterest, calculatedInterest, interestDifference, glInterest, paidInterest, interestGLDifference, interestPaymentDifference,
        fees, glFees, paidFees, feeGLDifference, feePaymentDifference, dateMatches, sourceRowIds: sourceRows.map(s => s.rowId), issues: ds };
    });

    // Intérêts courus : de la dernière borne de règlement documentée au lendemain de la clôture.
    const closingVersion = versionAt(versions, period.closingDate), closingTerms = closingVersion && closingVersion !== "overlap" ? contractSchema.parse(closingVersion.details) : null;
    const paidThrough = closingTerms?.lastInterestPaidThrough ?? null;
    const openingAccrued = at(ledger, "opening_accrued_interest", period.startDate, "intérêts courus d’ouverture");
    const accrued: InterestReview = !closingTerms ? { amount: unknown("Aucune version unique en vigueur à la clôture"), segments: [], status: "blocked", reason: "Aucune version unique en vigueur à la clôture" }
      : !paidThrough ? { amount: unknown("Dernière borne de règlement des intérêts documentée requise"), segments: [], status: "blocked", reason: "Borne de règlement des intérêts non documentée (aucune borne déduite d’un calendrier)" }
        : paidThrough > period.closingDate ? { amount: unknown("Intérêts réglés au-delà de la clôture : non couvert"), segments: [], status: "blocked", reason: "Intérêts payés d’avance : non couvert" }
          : calculateLoanInterest(ctx, paidThrough, nextDay(period.closingDate), straddling.length ? "refused" : "allowed");
    const bookedRows = accruedRows;
    const bookedAccrued: KnownAmount = bookedRows.length === 1 ? known(bookedRows[0].amount) : bookedRows.length > 1 ? unknown("Plusieurs lignes d’intérêts courus à la clôture")
      : isZero(accrued.amount) ? { kind: "not_applicable", reason: "Aucun intérêt couru attendu ni comptabilisé" } : unknown("Intérêts courus de clôture : ligne GL requise");
    const accruedDifference = diff(bookedAccrued, accrued.amount);
    if (accruedDifference.kind === "unknown") issues.push(issue("accrued_unknown", "Intérêts courus non concluants : " + (accrued.status === "blocked" ? accrued.reason : accruedDifference.reason) + "."));
    else if (accruedDifference.kind === "known" && cents(accruedDifference.value) !== 0n) issues.push(issue("accrued_difference", `Intérêts courus : GL − recalculé = ${fmt(accruedDifference.value)} à expliquer.`, accruedDifference));

    const confirmation = at(fs.filter(f => f.type === "loan_confirmations"), "closing_principal", period.closingDate, "confirmation datée de la clôture");
    const confirmationDifference = diff(confirmation, closing);
    if (confirmationDifference.kind === "unknown") issues.push(issue("confirmation_unknown", "Confirmation du prêteur : " + confirmationDifference.reason + "."));
    else if (confirmationDifference.kind === "known" && cents(confirmationDifference.value) !== 0n) issues.push(issue("confirmation_difference", `Confirmation − GL = ${fmt(confirmationDifference.value)} à expliquer.`, confirmationDifference));

    // A rate value is used only at a contractual revision date and for the contractual index; any other value is reported, never applied.
    const revisionSet = new Set(terms.flatMap(t => t.revisionDates ?? []));
    for (const r of rates) {
      if (!revisionSet.has(r.date)) issues.push(issue("rate_off_calendar", `Révision de taux du ${r.date} hors calendrier contractuel : valeur non utilisée, à expliquer.`));
      else if (!terms.some(t => t.indexName === r.details.indexName)) issues.push(issue("rate_index_mismatch", `Index « ${String(r.details.indexName)} » différent de l’index contractuel : valeur non utilisée.`));
    }
    for (const c of clauses) {
      const k = clauseSchema.parse(c.details), label = k.kind === "guarantee" ? "Garantie" : "Covenant";
      if (k.reading === "unread") issues.push(issue("clause_unread", `${label} « ${k.source.clause} » non lu${k.kind === "guarantee" ? "e" : ""} : lecture requise. Aucun ratio calculé, aucune conformité déduite.`));
      else if (k.kind === "covenant" && (!k.definition || !k.testDate)) issues.push(issue("covenant_definition", `Covenant « ${k.source.clause} » lu sans définition contractuelle ou date de test transcrite : citer la clause.`));
    }

    // Without an applicable text read for the period, accounts and balance-sheet line are not checked: never a clean result.
    if (!rules.textId) issues.push(issue("rules_unresolved", "Texte applicable non déterminé pour cet exercice : comptes et poste de bilan non vérifiés."));
    const unknownDue = dues.some(d => [d.principalDifference, d.paymentDifference, d.interestDifference, d.interestGLDifference, d.interestPaymentDifference, d.feeGLDifference, d.feePaymentDifference].some(v => v.kind === "unknown"));
    const inconclusive = unlinked.length > 0 || overlaps || expectedClosing.kind === "unknown" || closing.kind === "unknown" || accruedDifference.kind === "unknown" || confirmationDifference.kind === "unknown"
      || terms.some(t => t.scheduleComplete !== true) || unknownDue || !rules.textId;
    const status: LoanReview["status"] = inconclusive ? "inconclusive" : issues.length || dues.some(d => d.issues.length) ? "explain" : "documented";
    return { ...base, status, draws, repaid, expectedClosing, residual, confirmation, confirmationDifference, openingAccrued, accrued, bookedAccrued, accruedDifference, dues, issues };
  });

  const { framing, issues: framingIssues } = framingOf(context, facts, period);
  const contractUnits = population.items.filter(i => i.id.startsWith("contract:")).length, dueUnits = population.items.length - contractUnits;
  const coverage = { selected: selection.selectedIds.length, denominator: population.items.length, contracts: contractUnits, dues: dueUnits, exclusions: selection.exclusions };
  const affectsOutcome = rows.some(r => r.status === "inconclusive" || (r.status === "excluded" && r.presentation.exclusion?.kind === "unsupported"));
  const outcome: LoanResult["outcome"] = affectsOutcome || !rules.textId || coverage.selected < coverage.denominator || framing.status !== "complete" ? "inconclusive"
    : rows.some(r => r.status === "explain") ? "exceptions_detected" : "no_exception_detected";
  return frozen({
    schemaVersion: "loans-result-1", ruleVersion: LOAN_RULE_VERSION, runId, work, rules, presentationRegime: regime, rows, framing, framingIssues, evidence: facts.map(f => f.proof), outcome, coverage,
    limitations: [
      "Emprunts simples en euros (établissements de crédit ou autres prêteurs) : intérêt simple sur paramètres transcrits et cités ; ni taux effectif, ni valorisation, ni actualisation.",
      "Taux, index, marge, dates de révision et convention de jours viennent du contrat et des avis de révision fournis : aucun taux ni aucune convention par défaut.",
      "Covenants et garanties : définition contractuelle et date reprises telles que transcrites ; aucun ratio calculé, aucune conformité de financement déduite.",
      "Instruments proches des fonds propres classés par le moteur C09 sur termes contractuels déclarés ; ils sortent du calcul des emprunts.",
      "Résidu, différences et écarts de cadrage sont arithmétiques : ni dette omise, ni anomalie validée, ni opinion sur les comptes.",
      "Exclus et nommés : emprunts obligataires, obligations convertibles ou remboursables en actions, prêts participatifs, devises, frais capitalisés, planchers et plafonds d’index, dérivés de couverture, crédit-bail, concours bancaires courants, DCF et LBO.",
    ],
  });
}
