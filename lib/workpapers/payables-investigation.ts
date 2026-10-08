import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { moneySchema, assertScope, frozen, type EvidenceLink, type WorkpaperScope, type Population, type SelectionSet, type SourceRow } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";
import { dateSchema } from "./cycle-review";
import { assertWindow, type CycleContext } from "./cycle-context";
import { framePayables, searchUnrecordedLiabilities, type RpneStatus } from "./payables";
import { testPurchases } from "./purchases";
import { analyzeCutoff, uniqueEconomicExposures, type CutoffInput, type CutoffResult } from "./cutoff";
import { PAYABLE_TYPES, STATUS_LABELS, type PayableProcedure } from "./payables-program";
export { PAYABLE_TYPES, PAYABLE_PROCEDURES, PAYABLE_LABELS, STATUS_LABELS, type PayableProcedure } from "./payables-program";
const text = z.string().trim().min(1).max(500);
const rowIds = z.array(text).max(100);
export const payablesMappingSchema = z.object({ version: z.literal("payables-investigation-1"), headerRow: z.number().int().positive(), sheet: text.optional(), columns: z.object({ key: text, amount: text, date: text }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]), dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(), payables: z.object({ partyColumn: text, currencyColumn: text, accountColumn: text.optional(), eventColumn: text.optional(), invoiceColumn: text.optional(), flowColumn: text.optional(), kindColumn: text.optional(), taxColumn: text.optional(), grossColumn: text.optional(), availabilityColumn: text.optional() }).strict() }).strict();
export const payablesDraftSchema = z.object({ accounts: z.array(z.string().regex(/^\d{3,10}$/)).min(1).max(100), method: z.object({ id: text, version: text, source: text, proofRowIds: rowIds.min(1), note: z.string().trim().min(1).max(10000) }).strict(), window: z.object({ startDate: dateSchema, endDate: dateSchema, coverage: z.enum(["documented", "incomplete"]), proofRowIds: rowIds, note: z.string().trim().min(1).max(10000) }).strict(), purchases: z.array(z.object({ ledgerRowId: text, invoiceId: text, allocated: moneySchema, proofRowIds: rowIds.min(1) }).strict()).max(2000), allocations: z.array(z.object({ id: text, paymentId: text, invoiceId: text, amount: moneySchema, status: z.enum(["proposal", "validated"]), proofRowIds: rowIds.min(1) }).strict()).max(2000) }).strict();
export type PayablesDraft = z.infer<typeof payablesDraftSchema>;
export type PayablesWork = PayablesDraft & {
    schemaVersion: "payables-investigation-1";
    authorId: string;
    authoredAt: string;
};
export const payablesWorkSchema = payablesDraftSchema.extend({ schemaVersion: z.literal("payables-investigation-1"), authorId: text, authoredAt: z.string().datetime() }).strict();
function field(batch: ImportBatch, row: SourceRow, name: keyof NonNullable<ImportMapping["payables"]>, required = true) { const column = batch.mapping.payables?.[name]; const value = column ? row.original[column]?.trim() : undefined; if (required && !value)
    throw new Error("PAYABLE_SOURCE_COLUMN_REQUIRED:" + name); return value; }
function exact(raw: string | undefined, mapping: ImportMapping): KnownAmount { if (!raw?.trim())
    return { kind: "unknown", reason: "Montant source absent" }; const value = raw.trim(); const re = mapping.decimal === "," ? /^-?\d+(,\d{1,2})?$/ : /^-?\d+(\.\d{1,2})?$/; if (!re.test(value))
    throw new Error("PAYABLE_AMOUNT_INVALID"); const [integer, fraction = ""] = value.replace(",", ".").split("."); const sign = integer.startsWith("-") ? -1n : 1n; return { kind: "known", value: money((BigInt(integer.replace("-", "")) * 100n + BigInt(fraction.padEnd(2, "0"))) * sign) }; }
export function assertPayablesBatch(batch: ImportBatch, period: AccountingPeriod) {
    const mapping = payablesMappingSchema.parse(batch.mapping);
    if (!PAYABLE_TYPES.includes(batch.document.documentType as typeof PAYABLE_TYPES[number]))
        throw new Error("PAYABLE_DOCUMENT_TYPE_INVALID");
    for (const row of batch.rows) {
        if (!row.normalized || row.errors.length)
            throw new Error("PAYABLE_SOURCE_ROW_INVALID");
        field(batch, row, "partyColumn");
        if (field(batch, row, "currencyColumn") !== "EUR")
            throw new Error("PAYABLE_CURRENCY_UNSUPPORTED");
        const type = batch.document.documentType;
        if (["payables_general", "payables_auxiliary", "payables_aged"].includes(type) && row.normalized.date !== period.closingDate)
            throw new Error("PAYABLE_CLOSING_REQUIRED");
        if (["payables_general", "payables_auxiliary", "payables_aged", "purchases_ledger", "payables_recognition", "payables_adjustments", "payables_payments"].includes(type)) {
            const account = field(batch, row, "accountColumn")!;
            if (!/^\d{3,10}$/.test(account))
                throw new Error("PAYABLE_ACCOUNT_INVALID");
        }
        if (!["payables_general", "payables_auxiliary", "payables_aged", "payables_support", "payables_payments"].includes(type))
            field(batch, row, "eventColumn");
        if (!["payables_general", "payables_auxiliary", "payables_aged"].includes(type) && mapping.sign !== 1)
            throw new Error("PAYABLE_SIGN_INVALID");
        const flow = field(batch, row, "flowColumn", false);
        if (flow && !["purchase", "sale"].includes(flow))
            throw new Error("PAYABLE_FLOW_INVALID");
        if (type === "payables_invoices" && flow !== "purchase" || type === "cutoff_sales" && flow !== "sale")
            throw new Error("PAYABLE_FLOW_INVALID");
        if (["payables_invoices", "cutoff_sales"].includes(type)) {
            if (mapping.sign !== 1)
                throw new Error("PAYABLE_INVOICE_SIGN_INVALID");
            exact(field(batch, row, "taxColumn", false), mapping);
            exact(field(batch, row, "grossColumn", false), mapping);
            const available = field(batch, row, "availabilityColumn", false);
            if (available && !['yes', 'no', 'unknown'].includes(available))
                throw new Error("PAYABLE_AVAILABILITY_INVALID");
        }
        if (["payables_payments", "payables_invoices", "cutoff_sales"].includes(type) && cents(row.normalized.amount) <= 0n)
            throw new Error("PAYABLE_POSITIVE_AMOUNT_REQUIRED");
        if (type === "payables_adjustments") {
            const kind = field(batch, row, "kindColumn");
            if (!["none", "FNP", "CCA", "FAE", "PCA"].includes(kind!))
                throw new Error("PAYABLE_ADJUSTMENT_KIND_INVALID");
            if (kind === "none" && cents(row.normalized.amount) !== 0n)
                throw new Error("PAYABLE_ABSENCE_AMOUNT_INVALID");
        }
        if (type === "payables_performance" && !["point", "spread"].includes(field(batch, row, "kindColumn")!))
            throw new Error("PERFORMANCE_KIND_INVALID");
        if (type === "purchases_ledger" && (row.normalized.date < period.startDate || row.normalized.date > period.closingDate))
            throw new Error("PURCHASE_OUTSIDE_PERIOD");
        if (row.normalized.date > period.asOfDate)
            throw new Error("PAYABLE_DATE_AFTER_REVIEW");
    }
}
export function proofFor(batch: ImportBatch, row: SourceRow, runId: string, purpose: string): EvidenceLink { return { id: "proof-" + runId + ":" + row.id, scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose }; }
export function proofsFor(imports: ImportBatch[], ids: string[], runId: string, purpose: string) { return ids.map(id => { const batch = imports.find(b => b.rows.some(r => r.id === id)); const row = batch?.rows.find(r => r.id === id); if (!batch?.approval || !row)
    throw new Error("PAYABLE_PROOF_REQUIRED"); return proofFor(batch, row, runId, purpose); }); }
export function stampPayablesWork(draft: PayablesDraft, imports: ImportBatch[], scope: WorkpaperScope, period: AccountingPeriod, runId: string, actorId: string, at: string): PayablesWork {
    const d = payablesDraftSchema.parse(draft);
    if (new Set(d.accounts).size !== d.accounts.length)
        throw new Error("PAYABLE_ACCOUNTS_DUPLICATE");
    imports.forEach(b => { assertScope(scope, b.scope); if (!b.approval)
        throw new Error("IMPORT_NOT_APPROVED"); assertPayablesBatch(b, period); });
    const windowProof = proofsFor(imports, d.window.proofRowIds, runId, "Fenêtre de paiements documentée");
    assertWindow({ scope, period, purpose: "real", procedure: "payables.rpne" }, { ...d.window, documentVersionIds: windowProof.map(p => p.documentVersionId) });
    proofsFor(imports, d.method.proofRowIds, runId, "Méthode de mission");
    [...d.purchases, ...d.allocations].forEach(a => proofsFor(imports, a.proofRowIds, runId, "Rapprochement documenté"));
    if (new Set(d.allocations.map(a => a.id)).size !== d.allocations.length || new Set(d.purchases.map(a => a.ledgerRowId)).size !== d.purchases.length)
        throw new Error("PAYABLE_ALLOCATION_DUPLICATE");
    return frozen({ ...d, schemaVersion: "payables-investigation-1", authorId: actorId, authoredAt: at });
}
export function buildPayablesFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, procedure: PayableProcedure) {
    const context: CycleContext = { scope, period, purpose: "real", procedure };
    imports.forEach(b => { assertScope(scope, b.scope); assertPayablesBatch(b, period); if (!b.approval || !b.report.calculationAllowed)
        throw new Error("IMPORT_NOT_APPROVED"); });
    const byType = (type: string) => imports.filter(b => b.document.documentType === type).flatMap(batch => batch.rows.map(row => ({ batch, row })));
    for (const type of PAYABLE_TYPES)
        if (imports.filter(b => b.document.documentType === type).length > 1)
            throw new Error("PAYABLE_SOURCE_TYPE_DUPLICATE");
    const invoices = [...byType("payables_invoices"), ...byType("cutoff_sales")].map(({ batch, row }) => ({ id: row.normalized!.key, party: field(batch, row, "partyColumn")!, key: (batch.document.documentType === "cutoff_sales" ? "sale" : "purchase") + ":" + field(batch, row, "partyColumn") + ":" + field(batch, row, "eventColumn"), flow: batch.document.documentType === "cutoff_sales" ? "sale" as const : "purchase" as const, batch, row, net: { kind: "known" as const, value: row.normalized!.amount }, tax: exact(field(batch, row, "taxColumn", false), batch.mapping), gross: exact(field(batch, row, "grossColumn", false), batch.mapping) }));
    if (new Set(invoices.map(i => i.id)).size !== invoices.length || new Set(invoices.map(i => i.key)).size !== invoices.length)
        throw new Error("PAYABLE_INVOICE_OR_EVENT_DUPLICATE");
    const matching = (type: string, invoice: typeof invoices[number]) => byType(type).filter(({ batch, row }) => field(batch, row, "partyColumn") === invoice.party && field(batch, row, "eventColumn", false) === field(invoice.batch, invoice.row, "eventColumn") && (!field(batch, row, "invoiceColumn", false) || field(batch, row, "invoiceColumn", false) === invoice.id) && ((field(batch, row, "flowColumn", false) ?? "purchase") === invoice.flow));
    const events = invoices.map(invoice => {
        const performances = matching("payables_performance", invoice), records = matching("payables_recognition", invoice), adjustments = matching("payables_adjustments", invoice);
        const before = records.filter(r => r.row.normalized!.date <= period.closingDate), regularizations = adjustments.filter(r => r.row.normalized!.date <= period.closingDate && field(r.batch, r.row, "kindColumn", false) !== "none");
        const amount = money(before.reduce((n, r) => n + cents(r.row.normalized!.amount), 0n));
        const existing = regularizations.map(({ batch, row }) => { const kind = field(batch, row, "kindColumn")!; if (!["FNP", "CCA", "FAE", "PCA"].includes(kind))
            throw new Error("PAYABLE_ADJUSTMENT_KIND_INVALID"); return { id: row.normalized!.key, kind: kind as "FNP" | "CCA" | "FAE" | "PCA", amount: { kind: "known" as const, value: row.normalized!.amount }, evidence: [proofFor(batch, row, runId, "Régularisation existante HT")] }; });
        const perf = performances.length === 1 ? performances[0] : null;
        const input: CutoffInput = { context, economicEventKey: invoice.key, flow: invoice.flow, documentKind: "invoice", invoice: { id: invoice.id, date: invoice.row.normalized!.date, availableAtClosing: (field(invoice.batch, invoice.row, "availabilityColumn", false) ?? "unknown") as "yes" | "no" | "unknown", evidence: [proofFor(invoice.batch, invoice.row, runId, "Facture HT / TVA / TTC")] }, performance: perf ? { date: perf.row.normalized!.date, kind: field(perf.batch, perf.row, "kindColumn", false) === "spread" ? "spread" : "point", verified: true, evidence: [proofFor(perf.batch, perf.row, runId, "Réception ou prestation déclarée, original à corroborer")] } : null, basis: { net: invoice.net, tax: invoice.tax, gross: invoice.gross, evidence: [proofFor(invoice.batch, invoice.row, runId, "Bases monétaires de la facture")] }, recognition: { searched: records.some(r => r.row.normalized!.date === period.closingDate) && adjustments.some(r => r.row.normalized!.date === period.closingDate), alreadyRecognizedAmount: records.length ? { kind: "known", value: amount } : { kind: "unknown", reason: "Recherche comptable absente" }, bookingDate: before.filter(r => cents(r.row.normalized!.amount) !== 0n).map(r => r.row.normalized!.date).sort().at(-1), evidence: [...records, ...adjustments].map(({ batch, row }) => proofFor(batch, row, runId, "Recherche de comptabilisation et FNP / CCA à clôture")), existingAdjustments: existing } };
        return { ...invoice, input, cutoff: analyzeCutoff(input), performanceCount: performances.length };
    });
    const payments = byType("payables_payments").map(({ batch, row }) => ({ id: row.normalized!.key, party: field(batch, row, "partyColumn")!, bankAccountId: field(batch, row, "accountColumn")!, value: { amount: row.normalized!.amount, date: row.normalized!.date, source: row }, evidence: [proofFor(batch, row, runId, "Paiement TTC ultérieur")] }));
    if (new Set(payments.map(p => p.id)).size !== payments.length)
        throw new Error("PAYABLE_PAYMENT_DUPLICATE");
    return { context, events, payments, ledger: byType("purchases_ledger"), byType };
}
export interface InvestigationRow {
    id: string;
    unitId: string;
    eventId: string | null;
    invoiceId: string | null;
    party: string;
    status: RpneStatus;
    paidTTC: Money | null;
    unallocatedTTC: Money | null;
    differenceHT: KnownAmount;
    reasons: string[];
    cutoff: CutoffResult | null;
    evidence: EvidenceLink[];
    timeline: {
        label: string;
        date: string | null;
        verified: boolean;
    }[];
}
export function evaluatePayables(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, procedure: PayableProcedure, population: Population, selection: SelectionSet, work: PayablesWork) {
    payablesWorkSchema.parse(work);
    const facts = buildPayablesFacts(scope, period, imports, runId, procedure), { context } = facts;
    const windowProof = proofsFor(imports, work.window.proofRowIds, runId, "Fenêtre de paiements");
    const window = { ...work.window, documentVersionIds: [...new Set([...windowProof.map(p => p.documentVersionId), ...imports.filter(b => b.document.documentType === "payables_payments").map(b => b.document.id)])] };
    assertWindow(context, window);
    const statusFor = (cutoff: CutoffResult, event: CutoffInput): RpneStatus => cutoff.status === "already_treated" ? (event.recognition.existingAdjustments.some(a => a.kind === "FNP") ? "existing_accrual" : "booked_in_period") : cutoff.status === "candidate"&&cutoff.candidate === "FNP" ? "omission_candidate" : cutoff.status === "no_difference_on_tested_items" ? "outside_period_justified" : "inconclusive";
    let rows: InvestigationRow[] = [], technical: unknown;
    const exposures: {
        procedureId: string;
        result: CutoffResult;
    }[] = [];
    if (procedure === "payables.frame") {
        const balances = (type: string) => facts.byType(type).map(({ batch, row }) => ({ id: row.id, account: field(batch, row, "accountColumn")!, supplierId: field(batch, row, "partyColumn"), value: { amount: row.normalized!.amount, date: row.normalized!.date, source: row } }));
        technical = framePayables({ context, accounts: work.accounts, convention: { name: "credits_negative", version: "1", validatedBy: work.authorId }, general: balances("payables_general"), auxiliary: balances("payables_auxiliary"), aged: balances("payables_aged"), adjustments: [] });
    }
    else if (procedure === "payables.purchases") {
        if (facts.ledger.some(l => !work.accounts.includes(field(l.batch, l.row, "accountColumn")!)))
            throw new Error("PURCHASE_ACCOUNT_OUT_OF_SCOPE");
        const tests = work.purchases.map(test => { const source = facts.ledger.find(l => l.row.id === test.ledgerRowId), event = facts.events.find(e => e.id === test.invoiceId && e.flow === "purchase"); if (!source || !event || !selection.selectedIds.includes(test.ledgerRowId))
            throw new Error("PURCHASE_SOURCE_OR_SELECTION_REQUIRED"); const account = field(source.batch, source.row, "accountColumn")!; if (!work.accounts.includes(account) || !account.startsWith("6"))
            throw new Error("PURCHASE_ACCOUNT_OUT_OF_SCOPE"); if (field(source.batch, source.row, "partyColumn") !== event.party || field(source.batch, source.row, "eventColumn") !== field(event.batch, event.row, "eventColumn") || field(source.batch, source.row, "invoiceColumn") !== event.id)
            throw new Error("PURCHASE_EVENT_PARTY_MISMATCH"); return { id: test.ledgerRowId, line: { amount: source.row.normalized!.amount, date: source.row.normalized!.date, source: source.row }, invoiceId: event.id, allocated: test.allocated, basis: "HT", evidence: proofsFor(imports, test.proofRowIds, runId, "Écriture → facture → réception/prestation"), cutoff: event.input }; });
        const purchase = testPurchases({ context, imports, population, selection, invoices: facts.events.filter(e => e.flow === "purchase").map(e => ({ id: e.id, amount: { amount: e.net.value, date: e.row.normalized!.date, basis: "HT", evidence: e.input.invoice!.evidence } })), tests });
        technical = purchase;
        rows = population.items.map(item => { const row = purchase.rows.find(r => r.line.source.id === item.id), source = facts.ledger.find(l => l.row.id === item.id)!; if (!row)
            return { id: item.id, unitId: item.id, eventId: null, invoiceId: null, party: field(source.batch, source.row, "partyColumn")!, status: selection.selectedIds.includes(item.id) ? "inconclusive" : "not_tested", paidTTC: null, unallocatedTTC: null, differenceHT: { kind: "unknown", reason: "Rapprochement écriture/facture non documenté" }, reasons: ["ECRITURE_FACTURE_PRESTATION_REQUISES"], cutoff: null, evidence: [proofFor(source.batch, source.row, runId, "Écriture d’achats HT")], timeline: [] }; const event = facts.events.find(e => e.id === row.invoiceId)!; const cutoff = row.cutoffResult; const status = row.difference.kind !== "known" || cents(row.difference.value) !== 0n ? "inconclusive" : statusFor(cutoff, event.input); if (status === "omission_candidate")
            exposures.push({ procedureId: procedure, result: cutoff }); return { id: row.id, unitId: item.id, eventId: cutoff.economicEventId, invoiceId: row.invoiceId, party: event.party, status, paidTTC: null, unallocatedTTC: null, differenceHT: row.difference, reasons: [...cutoff.reasons, ...(row.difference.kind === "known" && cents(row.difference.value) !== 0n ? ["ECART_ECRITURE_FACTURE_HT"] : [])], cutoff, evidence: [proofFor(source.batch, source.row, runId, "Écriture d’achats HT"), ...row.evidence, ...cutoff.evidence], timeline: cutoff.timeline }; });
    }
    else {
        const allocations = work.allocations.filter(a => a.status === "validated").map(a => { const payment = facts.payments.find(p => p.id === a.paymentId), event = facts.events.find(e => e.id === a.invoiceId && e.flow === "purchase"); if (!payment || !event)
            throw new Error("RPNE_PAYMENT_INVOICE_REQUIRED"); if (payment.party !== event.party)
            throw new Error("RPNE_ALLOCATION_PARTY_MISMATCH"); return { paymentId: a.paymentId, economicEventKey: event.key, amount: a.amount, evidence: proofsFor(imports, a.proofRowIds, runId, "Paiement → allocation → facture")[0] }; });
        const paymentBatch = imports.find(b => b.document.documentType === "payables_payments")!;
        const rpne = searchUnrecordedLiabilities({ context, window, imports, population, selection, paymentAccountColumn: paymentBatch.mapping.payables!.accountColumn!, payments: facts.payments, events: facts.events.filter(e => e.flow === "purchase").map(e => e.input), allocations });
        technical = rpne;
        rows = rpne.rows.flatMap(payment => { const p = facts.payments.find(p => p.id === payment.paymentId)!; const items = payment.items.length ? payment.items : [null]; return items.map((item, index) => { const event = item ? facts.events.find(e => e.key === item.economicEventKey)! : null; const status = payment.status === "inconclusive" || payment.status === "not_tested" ? payment.status : item!.status; const cutoff = item?.cutoff ?? null; if (status === "omission_candidate" && cutoff)
            exposures.push({ procedureId: procedure, result: cutoff }); return { id: payment.paymentId + ":" + index, unitId: p.value.source.id, eventId: cutoff?.economicEventId ?? null, invoiceId: event?.id ?? null, party: p.party, status, paidTTC: payment.paidAmount, unallocatedTTC: payment.unallocated, differenceHT: status === "omission_candidate" && cutoff ? cutoff.amount : { kind: "unknown" as const, reason: status === "inconclusive" ? "Allocation ou preuve incomplète ; pas d’omission quantifiée" : STATUS_LABELS[status] }, reasons: [...payment.reasons, ...(item?.reasons ?? [])], cutoff, evidence: [...p.evidence, ...work.allocations.filter(a => a.status === "validated" && a.paymentId === p.id && a.invoiceId === event?.id).flatMap(a => proofsFor(imports, a.proofRowIds, runId, "Allocation validée TTC")), ...(cutoff?.evidence ?? [])], timeline: [{ label: "Paiement TTC", date: p.value.date, verified: true }, ...(cutoff?.timeline ?? [])] }; }); });
    }
    const selected = new Set(selection.selectedIds), tested = new Set(rows.filter(r => selected.has(r.unitId) && !["inconclusive", "not_tested"].includes(r.status)).map(r => r.unitId));
    const exceptions = rows.filter(r => r.status === "omission_candidate" || r.status === "inconclusive" || r.differenceHT.kind === "known" && cents(r.differenceHT.value) !== 0n).map(r => ({ id: r.id, targetId: r.eventId ?? r.unitId, message: STATUS_LABELS[r.status] + " : " + r.reasons.join(" ; "), amount: r.status === "omission_candidate" && r.cutoff ? r.cutoff.amount : r.differenceHT }));
    const frame = procedure === "payables.frame" ? technical as ReturnType<typeof framePayables> : null;
    const controls = frame ? [frame.generalToAuxiliary, frame.auxiliaryToAged].map((c, i) => ({ label: i === 0 ? "GL / auxiliaire" : "Auxiliaire / balance âgée", numerator: c.metrics.matchedCount, denominator: c.metrics.eligibleCount, unit: "clé rapprochée", exclusions: selection.exclusions })) : [{ label: procedure === "payables.purchases" ? "Écriture / facture / prestation" : "Paiement / allocation / facture", numerator: new Set(rows.filter(r => selected.has(r.unitId) && r.invoiceId && (procedure === "payables.purchases" ? r.differenceHT.kind === "known" && cents(r.differenceHT.value) === 0n && r.cutoff?.timeline.some(t=>t.label==="Fait générateur"&&t.verified&&t.date) : r.unallocatedTTC && cents(r.unallocatedTTC) === 0n)).map(r => r.unitId)).size, denominator: population.items.length, unit: population.unit, exclusions: selection.exclusions }, { label: "Rattachement à la clôture", numerator: tested.size, denominator: population.items.length, unit: population.unit, exclusions: selection.exclusions }];
    return frozen({ schemaVersion: "payables-result-1" as const, scope, runId, procedure, period, work, window, methodEvidence: proofsFor(imports, work.method.proofRowIds, runId, "Méthode documentée"), windowEvidence: windowProof, rows, technical, controls, events: facts.events.map(e => ({ key: e.key, invoiceId: e.id, party: e.party, flow: e.flow, net: e.net, tax: e.tax, gross: e.gross, cutoff: e.cutoff })), exposures: uniqueEconomicExposures(exposures), exceptions, coverage: { numerator: frame ? controls.reduce((n, c) => n + c.numerator, 0) : tested.size, denominator: frame ? controls.reduce((n, c) => n + c.denominator, 0) : population.items.length, selected: selected.size, exclusions: selection.exclusions, unit: population.unit }, limitations: ["Investigation technique interne ; aucune opinion ni écriture automatique.", "La fenêtre de paiements ne prouve jamais l’exhaustivité des dettes.", "HT, TVA, TTC et résiduel de paiement sont distincts, sans conversion déduite.", "Prestation inconnue ou allocation incomplète : non concluant.", "Les preuves importées établissent la provenance ; les originaux restent à corroborer.", "Les événements identiques sont regroupés une seule fois, par identité et base HT ; les décisions restent par procédure.", ...selection.limitations], inputHash: stableSha256({ imports: imports.map(b => b.id), work, population, selection }) });
}
export type PayablesResult = ReturnType<typeof evaluatePayables>;
