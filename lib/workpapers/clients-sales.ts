import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { clientReceivables, clientImpairment, clientEvidence, type ClientInvoice } from "./clients";
import { assertWindow, type CycleContext } from "./cycle-context";
import { dateSchema, proofSchema, type ClientsDocumentedMethod } from "./cycle-review";
import { frozen, assertScope, moneySchema, knownAmountSchema, type EvidenceLink, type SourceLocator, type WorkpaperScope, scopeSchema } from "./model";
import { authorize, type Principal } from "./policy";
import type { ImportBatch, ImportMapping } from "./imports";
import { validateConfirmation, type ConfirmationRecord } from "./confirmations";

export const SALES_TYPES = ["clients_invoices", "clients_payments", "clients_credits", "clients_support"] as const;
export type ClientsSalesSourceType = typeof SALES_TYPES[number];
const id = z.string().trim().min(1).max(200), note = z.string().trim().max(10000);
const refs = z.array(z.object({ importId: id, rowId: id }).strict()).max(20);
export const clientsSalesMappingSchema = z.object({
  version: z.literal("clients-sales-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.literal(1), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
  sales: z.object({ basis: z.enum(["open_at_closing", "subsequent_payment", "subsequent_credit", "support"]), customerColumn: id, currencyColumn: id,
    dueOnColumn: id.optional(), cancelledOnColumn: id.optional(), kindColumn: id.optional(), invoiceColumn: id.optional(), bookedImpairmentColumn: id.optional() }).strict(),
}).strict();
export type ClientsSalesMapping = z.infer<typeof clientsSalesMappingSchema>;
export type ClientsSalesSourceRef = z.infer<typeof refs>[number];
export const clientsFramingReferenceSchema = z.object({ runId: id, rootId: id, version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type ClientsFramingReference = z.infer<typeof clientsFramingReferenceSchema>;
export const clientsSalesWindowSchema = z.object({ startDate: dateSchema, endDate: dateSchema, coverage: z.enum(["documented", "incomplete"]), note, evidenceRefs: refs }).strict();
export const clientsCreditsAbsenceSchema = z.object({ note: note.refine(v => !!v), evidenceRefs: refs }).strict();
const allocationSchema = z.object({ id, paymentId: id, invoiceId: id, amount: moneySchema, status: z.enum(["proposed", "validated"]), evidenceRefs: refs }).strict();
const methodSchema = z.object({ id, version: id, source: note.refine(v => !!v), basis: id, from: dateSchema, to: dateSchema }).strict();
const estimateSchema = z.object({ id, invoiceId: id, method: methodSchema.nullable(), base: moneySchema, amount: moneySchema, rationale: note, dispute: note, evidenceRefs: refs }).strict();
const requestSchema = z.object({ date: dateSchema, channel: id, evidenceRefs: refs }).strict();
const responseSchema = z.object({ date: dateSchema, confirmedAt: dateSchema, origin: z.enum(["direct_documented", "client_provided", "unknown"]), channel: id, evidenceRefs: refs, originEvidenceRefs: refs }).strict();
const confirmationSchema = z.object({ id, invoiceIds: z.array(id).min(1).max(500), request: requestSchema.nullable(), response: responseSchema.nullable(),
  reconciliation: z.object({ status: z.enum(["not_tested", "agrees_on_tested_items", "differences"]), note, evidenceRefs: refs }).strict(),
  alternative: z.object({ performedOn: dateSchema, note: note.refine(v => !!v), evidenceRefs: refs }).strict().nullable() }).strict();
export const clientsSalesDraftSchema = z.object({ window: clientsSalesWindowSchema, creditsAbsence: clientsCreditsAbsenceSchema.nullable(),
  allocations: z.array(allocationSchema).max(1000), estimates: z.array(estimateSchema).max(500), confirmations: z.array(confirmationSchema).max(500) }).strict();
export type ClientsSalesDraft = z.infer<typeof clientsSalesDraftSchema>;
const stamp = { authorId: id, authoredAt: z.string().refine(v => Number.isFinite(Date.parse(v))) };
export const clientsSalesWorkSchema = clientsSalesDraftSchema.extend({ schemaVersion: z.literal("clients-sales-1"), framing: clientsFramingReferenceSchema,
  window: clientsSalesWindowSchema.extend({ documentVersionIds: z.array(id).max(20) }).strict(),
  allocations: z.array(allocationSchema.extend(stamp).strict()).max(1000), estimates: z.array(estimateSchema.extend(stamp).strict()).max(500),
  confirmations: z.array(confirmationSchema.extend({ ...stamp, version: z.number().int().positive() }).strict()).max(500) }).strict();
export type ClientsSalesWork = z.infer<typeof clientsSalesWorkSchema>;
export interface ClientsSalesFacts {
  invoices: (ClientInvoice & { cancelledOn?: string })[];
  payments: { id: string; customerId: string; amount: Money; paidOn: string; cancelledOn?: string; kind: "payment" | "grouped" | "advance"; evidence: EvidenceLink[] }[];
  credits: { id: string; invoiceId: string; customerId: string; amount: Money; issuedOn: string; evidence: EvidenceLink[] }[];
  sourceOptions: { importId: string; rowId: string; documentVersionId: string; fileName: string; label: string; locator: SourceLocator; kind: ClientsSalesSourceType }[];
}
function originalDate(value: string, mapping: ClientsSalesMapping) {
  const v = value.trim(), d = mapping.dateFormat === "ISO" ? v : /^\d{2}\/\d{2}\/\d{4}$/.test(v) ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}` : "";
  if (!isCivilDate(d)) throw new Error("CLIENT_SALES_DATE_INVALID"); return d;
}
function originalMoney(value: string, mapping: ClientsSalesMapping) {
  const v = value.trim(), pattern = mapping.decimal === "," ? /^\d+(,\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(v)) throw new Error("CLIENT_SALES_AMOUNT_INVALID");
  const [whole, fraction = ""] = v.replace(",", ".").split("."); return money(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export function assertClientsSalesBatch(batch: ImportBatch, period: AccountingPeriod) {
  const m = clientsSalesMappingSchema.parse(batch.mapping), type = batch.document.documentType;
  const bases: Record<ClientsSalesSourceType, ClientsSalesMapping["sales"]["basis"]> = { clients_invoices: "open_at_closing", clients_payments: "subsequent_payment", clients_credits: "subsequent_credit", clients_support: "support" };
  if (!SALES_TYPES.includes(type as ClientsSalesSourceType) || m.sales.basis !== bases[type as ClientsSalesSourceType]) throw new Error("CLIENT_SALES_SOURCE_TYPE_INVALID");
  if (batch.rows.length > (type === "clients_invoices" ? 500 : 1000)) throw new Error("CLIENT_SALES_ROWS_LIMIT");
  const keys = new Set<string>();
  for (const row of batch.rows) {
    if (!row.normalized || row.errors.length || keys.has(row.normalized.key.trim())) throw new Error("CLIENT_SALES_ROW_INVALID_OR_DUPLICATE");
    id.parse(row.normalized.key.trim()); keys.add(row.normalized.key.trim()); const f = m.sales;
    if (!row.original[f.customerColumn]?.trim()) throw new Error("CLIENT_SALES_PARTY_REQUIRED");
    id.parse(row.original[f.customerColumn]?.trim());
    if (row.original[f.currencyColumn]?.trim() !== "EUR") throw new Error("CLIENT_SALES_CURRENCY_UNSUPPORTED");
    if (cents(row.normalized.amount) < 0n || (type === "clients_invoices" && cents(row.normalized.amount) === 0n)) throw new Error("CLIENT_SALES_OPEN_POSITIVE_REQUIRED");
    const date = row.normalized.date;
    if (type === "clients_invoices" && date > period.closingDate) throw new Error("CLIENT_SALES_INVOICE_OUTSIDE_CLOSING");
    if (["clients_payments", "clients_credits"].includes(type) && (date <= period.closingDate || date > period.asOfDate)) throw new Error("CLIENT_SALES_SUBSEQUENT_DATE_REQUIRED");
    if (f.dueOnColumn && row.original[f.dueOnColumn]?.trim()) originalDate(row.original[f.dueOnColumn], m);
    if (f.cancelledOnColumn && row.original[f.cancelledOnColumn]?.trim()) { const cancelled = originalDate(row.original[f.cancelledOnColumn], m); if (cancelled < date) throw new Error("CLIENT_SALES_CANCELLATION_BEFORE_EVENT"); if (type === "clients_invoices" && cancelled <= period.closingDate) throw new Error("CLIENT_SALES_CANCELLED_INVOICE_NOT_OPEN_AT_CLOSING"); }
    if (f.bookedImpairmentColumn && row.original[f.bookedImpairmentColumn]?.trim()) originalMoney(row.original[f.bookedImpairmentColumn], m);
    if (type === "clients_credits" && (!f.invoiceColumn || !row.original[f.invoiceColumn]?.trim())) throw new Error("CLIENT_SALES_CREDIT_INVOICE_REQUIRED");
    if (type === "clients_payments" && f.kindColumn && !["payment", "grouped", "advance"].includes(row.original[f.kindColumn]?.trim())) throw new Error("CLIENT_SALES_PAYMENT_KIND_INVALID");
  }
}
function proofFor(batch: ImportBatch, rowId: string, runId: string): EvidenceLink {
  const row = batch.rows.find(r => r.id === rowId); if (!row?.normalized || row.errors.length) throw new Error("CLIENT_SALES_PROOF_ROW_INVALID");
  return { id: `proof-${stableSha256({ runId, rowId })}`, scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId,
    locator: row.locator, precision: "row", status: "verified", purpose: batch.document.documentType === "clients_support" ? "Ligne du registre de pièces importé ; original externe à fournir séparément" : "Fait importé Clients et ventes" };
}
export function buildClientsSalesFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): ClientsSalesFacts {
  const facts: ClientsSalesFacts = { invoices: [], payments: [], credits: [], sourceOptions: [] };
  if (imports.filter(b => b.document.documentType === "clients_invoices").length !== 1 || imports.filter(b => b.document.documentType === "clients_payments").length !== 1 || imports.filter(b => b.document.documentType === "clients_credits").length > 1 || imports.filter(b => b.document.documentType === "clients_support").length > 1) throw new Error("CLIENT_SALES_SOURCES_REQUIRED");
  imports.forEach(batch => {
    assertScope(scope, batch.scope); assertClientsSalesBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new Error("CLIENT_SALES_IMPORT_NOT_APPROVED");
    const m = clientsSalesMappingSchema.parse(batch.mapping), f = m.sales;
    batch.rows.forEach(row => {
      const normalized = row.normalized!, common = { id: normalized.key.trim(), customerId: row.original[f.customerColumn].trim(), amount: normalized.amount, evidence: [proofFor(batch, row.id, runId)] };
      const cancelledOn = f.cancelledOnColumn && row.original[f.cancelledOnColumn]?.trim() ? originalDate(row.original[f.cancelledOnColumn], m) : undefined;
      facts.sourceOptions.push({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, label: `${batch.document.fileName} — ${common.id}`, locator: row.locator, kind: batch.document.documentType as ClientsSalesSourceType });
      if (batch.document.documentType === "clients_invoices") facts.invoices.push({ ...common, issuedOn: normalized.date, cancelledOn, dueOn: f.dueOnColumn && row.original[f.dueOnColumn]?.trim() ? originalDate(row.original[f.dueOnColumn], m) : undefined,
        letteringStatus: "unknown", bookedImpairment: f.bookedImpairmentColumn && row.original[f.bookedImpairmentColumn]?.trim() ? { kind: "known", value: originalMoney(row.original[f.bookedImpairmentColumn], m) } : { kind: "unknown", reason: "Dépréciation comptabilisée non fournie" } });
      if (batch.document.documentType === "clients_payments") facts.payments.push({ ...common, paidOn: normalized.date, cancelledOn, kind: f.kindColumn ? row.original[f.kindColumn].trim() as "payment" | "grouped" | "advance" : "payment" });
      if (batch.document.documentType === "clients_credits") facts.credits.push({ ...common, issuedOn: normalized.date, invoiceId: row.original[f.invoiceColumn!].trim() });
    });
  }); return frozen(facts);
}
function resolveProofs(scope: WorkpaperScope, imports: ImportBatch[], runId: string, references: ClientsSalesSourceRef[]) {
  if (new Set(references.map(r => r.importId + ":" + r.rowId)).size !== references.length) throw new Error("CLIENT_SALES_DUPLICATE_PROOF");
  return references.map(ref => { const batch = imports.find(b => b.id === ref.importId); if (!batch) throw new Error("CLIENT_SALES_PROOF_IMPORT_UNKNOWN");
    assertScope(scope, batch.scope); if (!batch.approval || !batch.report.calculationAllowed) throw new Error("CLIENT_SALES_PROOF_NOT_APPROVED"); return proofFor(batch, ref.rowId, runId); });
}
export function makeInitialClientsSalesWork(framing: ClientsFramingReference, period: AccountingPeriod, actorId: string, at: string): ClientsSalesWork {
  if (!actorId || !Number.isFinite(Date.parse(at))) throw new Error("CLIENT_SALES_AUTHOR_REQUIRED");
  const day = new Date(period.closingDate + "T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1);
  return frozen(clientsSalesWorkSchema.parse({ schemaVersion: "clients-sales-1", framing, window: { startDate: day.toISOString().slice(0, 10), endDate: period.asOfDate, coverage: "incomplete", note: "Fenêtre à documenter", evidenceRefs: [], documentVersionIds: [] }, creditsAbsence: null, allocations: [], estimates: [], confirmations: [] }));
}
export function stampClientsSalesWork(input: { scope: WorkpaperScope; period: AccountingPeriod; runId: string; imports: ImportBatch[]; draft: ClientsSalesDraft; framing: ClientsFramingReference; actor: Principal; at: string; previous?: ClientsSalesWork }): ClientsSalesWork {
  authorize(input.actor, input.scope, "prepare"); const draft = clientsSalesDraftSchema.parse(input.draft), framing = clientsFramingReferenceSchema.parse(input.framing);
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("CLIENT_SALES_TIMESTAMP_INVALID");
  const resolve = (r: ClientsSalesSourceRef[]) => resolveProofs(input.scope, input.imports, input.runId, r), documentVersionIds = [...new Set(resolve(draft.window.evidenceRefs).map(p => p.documentVersionId))];
  assertWindow({ scope: input.scope, period: input.period, purpose: "real", procedure: "clients.sales" }, { ...draft.window, documentVersionIds });
  if (draft.creditsAbsence) resolve(draft.creditsAbsence.evidenceRefs);
  const stamped = <T extends { id: string }>(records: T[], previous: (T & { authorId: string; authoredAt: string })[] | undefined) => records.map(record => {
    const old = previous?.find(p => p.id === record.id); if (old) { const { authorId, authoredAt, ...prior } = old; if (stableSha256(prior) === stableSha256(record)) return { ...record, authorId, authoredAt }; }
    return { ...record, authorId: input.actor.id, authoredAt: input.at }; });
  for (const list of [draft.allocations, draft.estimates, draft.confirmations]) if (new Set(list.map(r => r.id)).size !== list.length) throw new Error("CLIENT_SALES_DUPLICATE_RECORD");
  draft.allocations.forEach(a => resolve(a.evidenceRefs)); draft.estimates.forEach(e => resolve(e.evidenceRefs));
  draft.confirmations.forEach(c => { if (c.request) resolve(c.request.evidenceRefs); if (c.response) { resolve(c.response.evidenceRefs); resolve(c.response.originEvidenceRefs); } resolve(c.reconciliation.evidenceRefs); if (c.alternative) resolve(c.alternative.evidenceRefs); });
  const work = clientsSalesWorkSchema.parse({ ...draft, schemaVersion: "clients-sales-1", framing, window: { ...draft.window, documentVersionIds }, allocations: stamped(draft.allocations, input.previous?.allocations), estimates: stamped(draft.estimates, input.previous?.estimates), confirmations: draft.confirmations.map(record => { const old = input.previous?.confirmations.find(c => c.id === record.id); if (old) { const { authorId, authoredAt, version, ...prior } = old; if (stableSha256(prior) === stableSha256(record)) return { ...record, authorId, authoredAt, version }; } return { ...record, authorId: input.actor.id, authoredAt: input.at, version: (old?.version ?? 0) + 1 }; }) });
  evaluateClientsSales(input.scope, input.period, input.imports, input.runId, work); return frozen(work);
}
export function clientsSalesDraftFromWork(work: ClientsSalesWork): ClientsSalesDraft {
  const { documentVersionIds: _versions, ...window } = work.window; void _versions;
  const strip = <T extends { authorId: string; authoredAt: string; version?: number }>(x: T) => { const { authorId: _author, authoredAt: _at, version: _version, ...rest } = x; void _author; void _at; void _version; return rest; };
  return clientsSalesDraftSchema.parse({ window, creditsAbsence: work.creditsAbsence, allocations: work.allocations.map(strip), estimates: work.estimates.map(strip), confirmations: work.confirmations.map(strip) });
}
export function isClientsSalesMapping(mapping: ImportMapping): boolean { return clientsSalesMappingSchema.safeParse(mapping).success; }
export const CLIENT_SALES_TYPES = SALES_TYPES;
const exceptionSchema = z.object({ id, controlId: z.enum(["cashCredit", "impairment", "confirmations"]), code: id, label: note, targetId: id, message: note, amount: knownAmountSchema, proofIds: z.array(id) });
const timelineSchema = z.object({ id, date: dateSchema, kind: id, label: note, amount: knownAmountSchema, proofIds: z.array(id), effect: z.enum(["closing", "review", "none"]) });
const confirmationRecordSchema = z.object({ id, version: z.number().int().positive(), scope: scopeSchema, subject: z.literal("customer"), subjectIds: z.array(id).min(1).max(500),
  request: z.object({date:dateSchema, channel:id,evidence:proofSchema}).strict().nullable(),
  response: z.object({date:dateSchema,confirmedAt:dateSchema,origin:z.enum(["direct_documented","client_provided","unknown"]),channel:id,evidence:proofSchema,originEvidence:proofSchema.optional()}).strict().nullable(),
  reconciliation:z.object({status:z.enum(["not_tested","agrees_on_tested_items","differences"]),evidence:z.array(proofSchema),note}).strict(),
  powers:z.object({status:z.enum(["not_requested","missing","received_unreviewed","reviewed"]),evidence:z.array(proofSchema),note}).strict(),
  commitments:z.object({status:z.enum(["not_requested","missing","received_unreviewed","reviewed"]),evidence:z.array(proofSchema),note}).strict(),
  alternative:z.object({performedOn:dateSchema,note,evidence:z.array(proofSchema)}).strict().optional()
}).strict().refine(record=>{try{validateConfirmation(record);return true;}catch{return false;}}, "Confirmation et preuves non valides");
export const clientsSalesResultSchema = z.object({ schemaVersion: z.literal("clients-sales-result-1"), scope: scopeSchema, runId: id, mode: z.enum(["real", "demo"]), framing: clientsFramingReferenceSchema,
  window: clientsSalesWindowSchema.extend({ documentVersionIds: z.array(id), evidence: z.array(proofSchema) }).strict(), creditsAbsence: clientsCreditsAbsenceSchema.extend({ evidence: z.array(proofSchema) }).strict().nullable(), closingDate: dateSchema, reviewDate: dateSchema,
  rows: z.array(z.object({ invoiceId: id, customerId: id, issuedOn: dateSchema, dueOn: dateSchema.nullable(), cancelledOn: dateSchema.nullable(),
    dueAtClosing: moneySchema, subsequentPayments: moneySchema, subsequentCredits: moneySchema, dueAtReview: moneySchema,
    aging: z.object({ from: dateSchema, label: note, days: z.number(), basis: z.enum(["invoice", "due"]) }), overdueDays: z.number().nullable(),
    uncertainties: z.array(note), evidence: z.array(proofSchema), confirmationIds: z.array(id), timeline: z.array(timelineSchema) })),
  payments: z.array(z.object({ id, customerId: id, amount: moneySchema, paidOn: dateSchema, cancelledOn: dateSchema.nullable(), kind: z.enum(["payment", "grouped", "advance"]),
    validatedAllocated: moneySchema, proposedAmount: moneySchema, residualUnallocated: moneySchema, availableToAllocate: moneySchema, status: z.enum(["active", "cancelled"]), evidence: z.array(proofSchema) })),
  credits: z.array(z.object({ id, invoiceId:id, customerId:id, amount:moneySchema, issuedOn:dateSchema, status:z.enum(["applied","unmatched"]), evidence:z.array(proofSchema) }).strict()).max(1000),
  allocations: z.array(allocationSchema.extend({ ...stamp, evidence: z.array(proofSchema) })),
  estimates: z.array(estimateSchema.extend({ ...stamp, difference: knownAmountSchema, status: z.enum(["documented", "inconclusive"]), evidence: z.array(proofSchema) })),
  confirmations: z.array(z.object({ id, invoiceIds: z.array(id), record: confirmationRecordSchema, ...stamp, status: id, declaredOrigin: z.enum(["direct_documented", "client_provided", "unknown"]).nullable(), evidence: z.array(proofSchema) })),
  exceptions: z.array(exceptionSchema), controls: z.array(z.object({ id: z.enum(["cashCredit", "impairment", "confirmations"]), label: note,
    outcome: z.enum(["no_exception_detected", "exceptions_detected", "inconclusive"]), numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), exclusions: z.array(z.object({ id, reason: note }).strict()) }).strict()), conclusion: z.null() }).strict().superRefine((r, context) => {
  const issue = (message: string) => context.addIssue({code:"custom",message});
  if (r.mode !== r.scope.mode || r.reviewDate < r.closingDate || r.window.startDate <= r.closingDate || r.window.endDate > r.reviewDate || r.window.endDate < r.window.startDate) issue("Période ou portée du résultat incohérente");
  if (r.controls.length !== 3 || new Set(r.controls.map(c=>c.id)).size !== 3 || r.controls.some(c=>c.numerator > c.denominator || c.denominator !== r.rows.length)) issue("Programme ou dénominateur incohérent");
  const allProofs = [...r.window.evidence,...(r.creditsAbsence?.evidence ?? []),...r.rows.flatMap(x=>x.evidence),...r.payments.flatMap(x=>x.evidence),...r.credits.flatMap(x=>x.evidence),...r.allocations.flatMap(x=>x.evidence),...r.estimates.flatMap(x=>x.evidence),...r.confirmations.flatMap(x=>[...x.evidence,...x.record.reconciliation.evidence,...x.record.powers.evidence,...x.record.commitments.evidence,...(x.record.alternative?.evidence??[]),...(x.record.request?[x.record.request.evidence]:[]),...(x.record.response?[x.record.response.evidence,...(x.record.response.originEvidence?[x.record.response.originEvidence]:[])]:[])])];
  if(r.confirmations.some(c=>stableSha256(c.record.scope)!==stableSha256(r.scope)))issue("Confirmation hors portée du résultat");
  const proofVersions=new Map<string,string>();for(const proof of allProofs){const hash=stableSha256(proof),previous=proofVersions.get(proof.id);if(previous&&previous!==hash)issue("Versions de preuve contradictoires");proofVersions.set(proof.id,hash);}
  if (allProofs.some(p=>p.procedureId !== r.runId || stableSha256(p.scope) !== stableSha256(r.scope))) issue("Preuve hors portée du résultat");
  const proofIds=new Set(allProofs.map(p=>p.id)); if([...r.exceptions.flatMap(e=>e.proofIds),...r.rows.flatMap(i=>i.timeline.flatMap(t=>t.proofIds))].some(id=>!proofIds.has(id)))issue("Référence de preuve non résolue");
  for (const records of [r.rows.map(x=>x.invoiceId),r.payments.map(x=>x.id),r.credits.map(x=>x.id),r.allocations.map(x=>x.id),r.estimates.map(x=>x.id),r.confirmations.map(x=>x.id),r.exceptions.map(x=>x.id)]) if(new Set(records).size!==records.length) issue("Identité de résultat dupliquée");
  if (r.rows.some(x=>cents(x.dueAtClosing)<=0n || cents(x.subsequentPayments)<0n || cents(x.subsequentCredits)<0n || cents(x.dueAtReview)<0n || cents(x.dueAtClosing)-cents(x.subsequentPayments)-cents(x.subsequentCredits)!==cents(x.dueAtReview) || (!x.dueOn && (x.overdueDays!==null || x.aging.basis!=="invoice")))) issue("Solde ou ancienneté du résultat incohérent");
});
export type ClientsSalesResult = z.infer<typeof clientsSalesResultSchema>;

const exceptionLabels: Record<string,string> = { WINDOW_INCOMPLETE:"Fenêtre incomplète", CREDITS_SOURCE_MISSING:"Source des avoirs attendue", CREDIT_PARTY_MISMATCH:"Avoir à rattacher", ALLOCATION_REFERENCE_UNKNOWN:"Référence d’allocation inconnue", ALLOCATION_PARTY_MISMATCH:"Tiers d’allocation incohérent", ALLOCATION_AMOUNT_INVALID:"Montant d’allocation invalide", ALLOCATION_EVIDENCE_MISSING:"Preuve d’allocation attendue", PAYMENT_OVERALLOCATED:"Paiement suraffecté", ALLOCATION_PROPOSAL_OVERALLOCATED:"Appariement au-delà du solde disponible", CONFIRMATION_PERIOD_MISMATCH:"Période de confirmation incohérente", ALLOCATION_PROPOSED:"Appariement proposé", ESTIMATE_METHOD_OR_BASE_MISSING:"Estimation non étayée", ESTIMATE_BOOKED_DIFFERENCE:"Écart d’estimation à expliquer", ESTIMATE_NOT_DOCUMENTED:"Jugement de recouvrabilité attendu", CONFIRMATION_RESPONSE_MISSING:"Réponse de confirmation attendue", CONFIRMATION_ORIGIN_UNCERTAIN:"Origine de confirmation à établir", CONFIRMATION_DIFFERENCES:"Différence de confirmation", CONFIRMATION_RECONCILIATION_PENDING:"Rapprochement de confirmation attendu", INVOICE_CANCELLATION_UNCERTAIN:"Annulation de facture à qualifier", PAYMENT_CANCELLED:"Paiement annulé", ADVANCE_UNALLOCATED:"Acompte non affecté", PAYMENT_UNALLOCATED:"Paiement non affecté" };
export function evaluateClientsSales(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, input: ClientsSalesWork): ClientsSalesResult {
  const work = clientsSalesWorkSchema.parse(input), facts = buildClientsSalesFacts(scope, period, imports, runId);
  const context: CycleContext = { scope, period, purpose: scope.mode === "real" ? "real" : "synthetic_technical", procedure: "clients.sales" };
  const proofs = (r: ClientsSalesSourceRef[]) => resolveProofs(scope, imports, runId, r);
  const windowProofs = proofs(work.window.evidenceRefs), windowDocuments = [...new Set(windowProofs.map(p => p.documentVersionId))];
  if (stableSha256([...work.window.documentVersionIds].sort()) !== stableSha256(windowDocuments.sort())) throw new Error("CLIENT_SALES_WINDOW_PROOF_CHANGED");
  assertWindow(context, work.window);
  const exceptions: ClientsSalesResult["exceptions"] = [];
  const add = (code: string, targetId: string, message: string, links: EvidenceLink[] = [], amount: KnownAmount = { kind: "unknown", reason: "Traitement à documenter" }) => exceptions.push({ id: `${code}:${stableSha256({ runId, targetId }).slice(0, 24)}`, controlId: code.startsWith("ESTIMATE") ? "impairment" : code.startsWith("CONFIRMATION") ? "confirmations" : "cashCredit", code, label: exceptionLabels[code] ?? "Point Clients à expliquer", targetId, message, amount, proofIds: [...new Set(links.map(p => p.id))] });
  if (work.window.coverage !== "documented" || work.window.endDate !== period.asOfDate) add("WINDOW_INCOMPLETE", runId, "La fenêtre documentée ne couvre pas toute la période clôture–revue.", windowProofs);
  for (const p of facts.payments) if (p.paidOn < work.window.startDate || p.paidOn > work.window.endDate) throw new Error("CLIENT_SALES_PAYMENT_OUTSIDE_WINDOW");
  for (const c of facts.credits) if (c.issuedOn < work.window.startDate || c.issuedOn > work.window.endDate) throw new Error("CLIENT_SALES_CREDIT_OUTSIDE_WINDOW");
  if (!imports.some(b => b.document.documentType === "clients_credits") && (!work.creditsAbsence?.note.trim() || !proofs(work.creditsAbsence.evidenceRefs).length)) add("CREDITS_SOURCE_MISSING", runId, "Source des avoirs absente ; documenter explicitement leur absence sur la fenêtre.");
  const allocations = work.allocations.map(a => ({ ...a, evidence: proofs(a.evidenceRefs) }));
  const valid = allocations.filter(a => a.status === "validated"), used = new Map<string, bigint>(), candidates = new Map<string, bigint>();
  valid.forEach(a => candidates.set(a.paymentId,(candidates.get(a.paymentId)??0n)+cents(a.amount)));
  const credits = facts.credits.filter(c => {
    const invoice = facts.invoices.find(i => i.id === c.invoiceId);
    if (!invoice || invoice.customerId !== c.customerId) { add("CREDIT_PARTY_MISMATCH", c.id, "L’avoir ne correspond pas au tiers et à la facture importés ; il ne réduit aucun solde.", c.evidence, { kind: "known", value: c.amount }); return false; }
    return true;
  });
  for (const a of allocations) {
    const p = facts.payments.find(p => p.id === a.paymentId), i = facts.invoices.find(i => i.id === a.invoiceId);
    let error: string | null = !p || !i ? "ALLOCATION_REFERENCE_UNKNOWN" : p.customerId !== i.customerId ? "ALLOCATION_PARTY_MISMATCH" : cents(a.amount) <= 0n ? "ALLOCATION_AMOUNT_INVALID" : !a.evidence.length ? "ALLOCATION_EVIDENCE_MISSING" : null;
    if (a.status === "validated" && !error) { const sum = (used.get(p!.id) ?? 0n) + cents(a.amount); if (sum > cents(p!.amount)) error = "PAYMENT_OVERALLOCATED"; else used.set(p!.id, sum); }
    if (a.status === "proposed" && !error) { const sum=(candidates.get(p!.id)??0n)+cents(a.amount); candidates.set(p!.id,sum); if(sum>cents(p!.amount))error="ALLOCATION_PROPOSAL_OVERALLOCATED"; }
    if (error) { if (a.status === "validated") throw new Error("CLIENT_SALES_" + error); add(error, a.id, "Proposition non validable : vérifier tiers, référence, montant et preuve.", a.evidence, { kind: "known", value: a.amount }); }
    else if (a.status === "proposed") add("ALLOCATION_PROPOSED", a.id, "Proposition d’appariement conservée ; aucun effet sur les soldes.", a.evidence, { kind: "known", value: a.amount });
  }
  // Every effective date is checked, including a payment cancelled later: the cancellation cannot erase an earlier over-allocation.
  for (const i of facts.invoices) {
    const events = [...valid.filter(a => a.invoiceId === i.id).flatMap(a => { const p = facts.payments.find(p => p.id === a.paymentId)!;
      return [{ date: p.paidOn, amount: cents(a.amount) }, ...(p.cancelledOn && p.cancelledOn <= period.asOfDate ? [{ date: p.cancelledOn, amount: -cents(a.amount) }] : [])];
    }), ...credits.filter(c => c.invoiceId === i.id).map(c => ({ date: c.issuedOn, amount: cents(c.amount) }))].sort((a, b) => a.date.localeCompare(b.date) || (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0));
    let reduction = 0n; for (const event of events) { reduction += event.amount; if (reduction > cents(i.amount)) throw new Error("CLIENT_SALES_INVOICE_OVERALLOCATED_AT_DATE"); }
  }
  const receivables = clientReceivables({ context, invoices: facts.invoices, payments: facts.payments, allocations: valid, credits, window: work.window });
  const estimates = work.estimates.map(e => {
    const invoice = facts.invoices.find(i => i.id === e.invoiceId); if (!invoice) throw new Error("CLIENT_SALES_ESTIMATE_INVOICE_UNKNOWN");
    const evidence = proofs(e.evidenceRefs);
    const method: ClientsDocumentedMethod | null = e.method ? { ...e.method, authorId: e.authorId, evidence, synthetic: false } : null;
    const eligible = !!e.method && evidence.length > 0 && !!e.rationale.trim() && cents(e.base) === cents(invoice.amount) && cents(e.amount) >= 0n && cents(e.amount) <= cents(e.base);
    const booked = invoice.bookedImpairment.kind === "known" ? { amount: invoice.bookedImpairment.value, date: period.closingDate, basis: e.method?.basis ?? "unknown", evidence: invoice.evidence } : null;
    const difference = clientImpairment(context, booked, eligible ? { amount: e.amount, date: period.closingDate, basis: e.method!.basis, evidence } : null, method);
    if (difference.kind !== "known") add("ESTIMATE_METHOD_OR_BASE_MISSING", e.id, "Estimation non comparable : méthode, base, auteur, pièces ou dépréciation comptabilisée manquants.", evidence);
    else if (cents(difference.value) !== 0n) add("ESTIMATE_BOOKED_DIFFERENCE", e.id, "Écart entre estimation documentée et dépréciation comptabilisée ; jugement à expliquer.", evidence, difference);
    return { ...e, evidence, difference, status: difference.kind === "known" ? "documented" as const : "inconclusive" as const };
  });
  for (const i of facts.invoices) if (!estimates.some(e => e.invoiceId === i.id)) add("ESTIMATE_NOT_DOCUMENTED", i.id, "Recouvrabilité et estimation non documentées ; le reste dû et l’ancienneté ne constituent pas une perte.", i.evidence);
  const confirmations = work.confirmations.map(c => {
    const invoices = c.invoiceIds.map(id => facts.invoices.find(i => i.id === id)); if (invoices.some(i => !i) || new Set(c.invoiceIds).size !== c.invoiceIds.length) throw new Error("CLIENT_SALES_CONFIRMATION_INVOICE_UNKNOWN");
    const requestProofs = c.request ? proofs(c.request.evidenceRefs) : [], responseProofs = c.response ? proofs(c.response.evidenceRefs) : [], originProofs = c.response ? proofs(c.response.originEvidenceRefs) : [], reconciliationProofs = proofs(c.reconciliation.evidenceRefs), alternativeProofs = c.alternative ? proofs(c.alternative.evidenceRefs) : [];
    if (c.request && !requestProofs.length || c.response && !responseProofs.length) throw new Error("CLIENT_SALES_CONFIRMATION_PROOF_REQUIRED");
    // Tabular support registers identify references; they do not authenticate an external direct response.
    const origin = c.response?.origin === "direct_documented" ? "unknown" as const : c.response?.origin;
    if (new Set(invoices.map(i=>i!.customerId)).size !== 1) throw new Error("CLIENT_SALES_CONFIRMATION_PARTY_MISMATCH");
    const record: ConfirmationRecord = { id: c.id, version: c.version, scope, subject: "customer", subjectIds: [...new Set(invoices.map(i => i!.customerId))],
      request: c.request ? { date: c.request.date, channel: c.request.channel, evidence: requestProofs[0] } : null,
      response: c.response ? { date: c.response.date, confirmedAt: c.response.confirmedAt, channel: c.response.channel, origin: origin!, evidence: responseProofs[0], ...(originProofs[0] ? { originEvidence: originProofs[0] } : {}) } : null,
      reconciliation: { status: c.reconciliation.status, note: c.reconciliation.note, evidence: reconciliationProofs },
      powers: { status: "not_requested", evidence: [], note: "Sans objet de cette procédure Clients" }, commitments: { status: "not_requested", evidence: [], note: "Sans objet de cette procédure Clients" },
      ...(c.alternative ? { alternative: { performedOn: c.alternative.performedOn, note: c.alternative.note, evidence: alternativeProofs } } : {}) };
    clientEvidence(context, [record], []);
    const evidence = [...requestProofs, ...responseProofs, ...originProofs, ...reconciliationProofs, ...alternativeProofs];
    if (c.request && c.request.date > period.asOfDate || c.response && c.response.date > period.asOfDate || c.alternative && c.alternative.performedOn > period.asOfDate) throw new Error("CLIENT_SALES_CONFIRMATION_OUTSIDE_REVIEW");
    if (record.response && record.response.confirmedAt !== period.closingDate) add("CONFIRMATION_PERIOD_MISMATCH",c.id,"La date du solde confirmé diffère de la clôture ; comparaison non concluante.",evidence);
    if (!record.response && !record.alternative) add("CONFIRMATION_RESPONSE_MISSING", c.id, "Confirmation sans réponse documentée ni procédure alternative.", evidence);
    if (record.response && record.response.origin !== "direct_documented") add("CONFIRMATION_ORIGIN_UNCERTAIN", c.id, "Origine de réponse non authentifiée par le registre tabulaire ; document original et revue attendus.", evidence);
    if (record.reconciliation.status === "differences") add("CONFIRMATION_DIFFERENCES", c.id, "Différences de confirmation maintenues après revue.", evidence);
    if (record.reconciliation.status === "not_tested" && !record.alternative) add("CONFIRMATION_RECONCILIATION_PENDING", c.id, "Rapprochement de confirmation non testé.", evidence);
    return { id: c.id, invoiceIds: c.invoiceIds, record, authorId: c.authorId, authoredAt: c.authoredAt, status: record.alternative ? "alternative_documented" : record.response ? record.reconciliation.status : "response_pending", declaredOrigin: c.response?.origin ?? null, evidence };
  });
  const rows = receivables.rows.map(r => {
    const i = facts.invoices.find(i => i.id === r.invoiceId)!, a = allocations.filter(a => a.invoiceId === i.id), linkedPayments = facts.payments.filter(p => a.some(a => a.paymentId === p.id)), invoiceCredits = credits.filter(c => c.invoiceId === i.id);
    const uncertainties = ["Le reste dû ne constitue ni une perte estimée ni une créance entièrement sûre."];
    if (!i.dueOn) uncertainties.push("Échéance inconnue : âge depuis facture ; aucun retard inventé.");
    if (i.cancelledOn && i.cancelledOn <= period.asOfDate) { uncertainties.push("Annulation de facture à qualifier ; aucun effet automatique sur les soldes."); add("INVOICE_CANCELLATION_UNCERTAIN", i.id, "Annulation documentée de facture ; vérifier le traitement et l’avoir associé avant toute réduction.", i.evidence); }
    const timeline: ClientsSalesResult["rows"][number]["timeline"] = [{ id: i.id + ":issued", date: i.issuedOn, kind: "invoice", label: "Facture", amount: { kind: "not_applicable", reason: "Solde historique de facture non reconstitué" }, proofIds: i.evidence.map(p => p.id), effect: "none" }, { id: i.id + ":closing", date: period.closingDate, kind: "closing", label: "Solde ouvert à clôture", amount: { kind: "known", value: r.dueAtClosing }, proofIds: i.evidence.map(p => p.id), effect: "closing" }];
    for (const allocation of a) {
      const p = linkedPayments.find(p => p.id === allocation.paymentId); if (!p) continue;
      timeline.push({ id: allocation.id, date: p.paidOn, kind: allocation.status === "validated" ? "payment" : "proposal", label: allocation.status === "validated" ? "Encaissement affecté" : "Appariement proposé", amount: { kind: "known", value: allocation.amount }, proofIds: allocation.evidence.map(p => p.id), effect: allocation.status === "validated" ? "review" : "none" });
      if (p.cancelledOn && p.cancelledOn <= period.asOfDate) timeline.push({ id: allocation.id + ":cancelled", date: p.cancelledOn, kind: "cancelled_payment", label: "Annulation de paiement", amount: { kind: "known", value: allocation.amount }, proofIds: p.evidence.map(p => p.id), effect: allocation.status === "validated" ? "review" : "none" });
    }
    invoiceCredits.forEach(c => timeline.push({ id: c.id, date: c.issuedOn, kind: "credit", label: "Avoir postérieur", amount: { kind: "known", value: c.amount }, proofIds: c.evidence.map(p => p.id), effect: "review" }));
    if (i.cancelledOn) timeline.push({ id: i.id + ":cancelled", date: i.cancelledOn, kind: "cancelled_invoice", label: "Annulation de facture à qualifier", amount: { kind: "unknown", reason: "Effet comptable à qualifier" }, proofIds: i.evidence.map(p => p.id), effect: "none" });
    timeline.push({ id: i.id + ":review", date: period.asOfDate, kind: "review", label: "Reste à la revue", amount: { kind: "known", value: r.dueAtReview }, proofIds: [], effect: "review" });
    return { invoiceId: i.id, customerId: i.customerId, issuedOn: i.issuedOn, dueOn: i.dueOn ?? null, cancelledOn: i.cancelledOn ?? null,
      dueAtClosing: r.dueAtClosing, subsequentPayments: r.subsequentPayments, subsequentCredits: r.subsequentCredits, dueAtReview: r.dueAtReview,
      aging: { ...r.aging, basis: i.dueOn ? "due" as const : "invoice" as const }, overdueDays: i.dueOn ? Math.max(0, r.aging.days) : null, uncertainties,
      evidence: i.evidence, confirmationIds: confirmations.filter(c => c.invoiceIds.includes(i.id)).map(c => c.id), timeline: timeline.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
  });
  const payments = facts.payments.map(p => {
    const allocated = valid.filter(a => a.paymentId === p.id).reduce((s, a) => s + cents(a.amount), 0n), proposed = allocations.filter(a => a.paymentId === p.id && a.status === "proposed").reduce((s, a) => s + cents(a.amount), 0n), cancelled = !!p.cancelledOn && p.cancelledOn <= period.asOfDate;
    if (cancelled) add("PAYMENT_CANCELLED", p.id, "Paiement annulé à la revue ; les affectations historiques demeurent tracées et le solde clôture reste fixe.", p.evidence, { kind: "known", value: p.amount });
    if (allocated < cents(p.amount) && !cancelled) add(p.kind === "advance" ? "ADVANCE_UNALLOCATED" : "PAYMENT_UNALLOCATED", p.id, "Solde du paiement non affecté ; aucune imputation automatique.", p.evidence, { kind: "known", value: money(cents(p.amount) - allocated) });
    return { ...p, cancelledOn: p.cancelledOn ?? null, validatedAllocated: money(allocated), proposedAmount: money(proposed), residualUnallocated: money(cents(p.amount) - allocated), availableToAllocate: money(cancelled ? 0n : cents(p.amount) - allocated), status: cancelled ? "cancelled" as const : "active" as const };
  });
  const count = rows.length;
  const cashComplete = work.window.coverage === "documented" && work.window.endDate === period.asOfDate && !exceptions.some(e => ["CREDITS_SOURCE_MISSING", "CREDIT_PARTY_MISMATCH", "INVOICE_CANCELLATION_UNCERTAIN"].includes(e.code));
  const controls: ClientsSalesResult["controls"] = [
    { id: "cashCredit", label: "Encaissements, allocations et avoirs", numerator: cashComplete ? count : 0, denominator: count, exclusions: [], outcome: exceptions.some(e => e.controlId === "cashCredit") ? "exceptions_detected" : cashComplete ? "no_exception_detected" : "inconclusive" },
    { id: "impairment", label: "Estimation et jugement documentés", numerator: new Set(estimates.filter(e => e.status === "documented").map(e => e.invoiceId)).size, denominator: count, exclusions: [], outcome: exceptions.some(e => e.code === "ESTIMATE_BOOKED_DIFFERENCE") ? "exceptions_detected" : new Set(estimates.filter(e => e.status === "documented").map(e => e.invoiceId)).size === count ? "no_exception_detected" : "inconclusive" },
    { id: "confirmations", label: "Suivi, preuves et revue des confirmations", numerator: new Set(confirmations.filter(c => c.record.alternative || c.record.response && c.record.response.origin === "direct_documented" && c.record.reconciliation.status !== "not_tested").flatMap(c => c.invoiceIds)).size, denominator: count, exclusions: [], outcome: exceptions.some(e => e.code === "CONFIRMATION_DIFFERENCES") ? "exceptions_detected" : "inconclusive" },
  ];
  return frozen(clientsSalesResultSchema.parse({ schemaVersion: "clients-sales-result-1", scope, runId, mode: scope.mode, framing: work.framing, window: { ...work.window, evidence: windowProofs }, creditsAbsence: work.creditsAbsence ? { ...work.creditsAbsence, evidence: proofs(work.creditsAbsence.evidenceRefs) } : null,
    closingDate: period.closingDate, reviewDate: period.asOfDate, rows, payments, credits: facts.credits.map(c=>({...c,status:credits.some(applied=>applied.id===c.id)?"applied":"unmatched"})), allocations, estimates, confirmations, exceptions, controls, conclusion: null }));
}
