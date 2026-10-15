import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ClientsSalesResult } from "./clients-sales";
import type { VatResult } from "./fiscal-vat-contract";
import type { buildPayablesFacts, PayablesResult } from "./payables-investigation";
import type { WorkpaperRun, WorkpaperScope } from "./model";
import type { CreditFacts, CutoffEventFacts, EventMapInput, EventMapRun, EventSource, OpenInvoiceFacts, PaymentWindow, SettlementFacts, VatEntryFacts } from "./transversal-events";

/**
 * Raccord des feuilles réelles à la carte des événements (C11). Lecture seule : le candidat et son montant viennent du
 * résultat stocké de chaque feuille ; les dates et faits de qualification sont relus dans les imports figés de cette
 * même feuille (jamais dans une source plus récente). Aucune fonction serveur n'est importée ici.
 */
export interface PayablesObservation { run: WorkpaperRun; result: PayablesResult; facts: ReturnType<typeof buildPayablesFacts> | null; stale: boolean; staleReasons: string[]; href: string }
export interface ClientsSalesObservation { run: WorkpaperRun; result: ClientsSalesResult; stale: boolean; staleReasons: string[]; href: string }
export interface VatObservation { runId: string; rootId: string; version: number; revision: number; state: string; stale: boolean; staleReasons: string[]; href: string; result: Pick<VatResult, "period" | "frequency" | "entries"> }
/** Lecteur des feuilles TVA, fourni par la chaîne fiscale lorsqu'elle est activée. */
export interface VatObservationReader { vatObservations(request: Request, dossierId: string, pid: string): Promise<VatObservation[]> }

const mapRun = (run: Pick<WorkpaperRun, "id" | "rootId" | "version" | "revision" | "state"> & { template: { id: string } }, stale: boolean, staleReasons: string[], href: string): EventMapRun =>
  ({ procedureId: run.template.id, runId: run.id, rootId: run.rootId, version: run.version, revision: run.revision, state: run.state, stale, staleReasons, href });
const iso = (fec: string) => /^\d{8}$/.test(fec) ? `${fec.slice(0, 4)}-${fec.slice(4, 6)}-${fec.slice(6, 8)}` : fec;

export const SUPERSEDED_REASON = "Une révision ou version plus récente existe : cette version ne compte plus.";
/**
 * Feuilles lues par la carte : la dernière version exécutée de chaque racine. Une révision ou version plus récente (même
 * en préparation) la périme sans l'effacer ; deux révisions d'une même feuille ne sont jamais lues comme courantes.
 */
export function latestExecutedPerRoot(versions: readonly WorkpaperRun[]): { run: WorkpaperRun; superseded: boolean }[] {
  const newer = (a: WorkpaperRun, b: WorkpaperRun) => a.revision > b.revision || a.revision === b.revision && a.version > b.version;
  const latest = new Map<string, WorkpaperRun>(), executed = new Map<string, WorkpaperRun>();
  for (const v of versions) {
    const old = latest.get(v.rootId);
    if (!old || newer(v, old)) latest.set(v.rootId, v);
    const done = executed.get(v.rootId);
    if (v.result?.execution === "completed" && (!done || newer(v, done))) executed.set(v.rootId, v);
  }
  return [...executed.values()].sort((a, b) => a.id.localeCompare(b.id)).map((run) => ({ run, superseded: latest.get(run.rootId) !== run }));
}

/**
 * Statut unique de la procédure pour un événement ; des lignes divergentes restent non concluantes. Une ligne RPNE non
 * analysée (fenêtre non documentée, facture absente) n'a pas d'identité d'événement : elle est rattachée par facture et tiers.
 */
function procedureRow(result: PayablesResult, event: { eventId: string; invoiceId: string; party: string }): CutoffEventFacts["procedureRow"] {
  if (result.procedure === "payables.frame") return null;
  const rows = result.rows.filter((r) => r.eventId === event.eventId || (r.eventId === null && r.invoiceId === event.invoiceId && r.party === event.party));
  if (!rows.length) return null;
  const statuses = new Set(rows.map((r) => r.status));
  return statuses.size === 1 ? { status: rows[0].status, reasons: [...new Set(rows.flatMap((r) => r.reasons))] } : { status: "inconclusive", reasons: ["LIGNES_DE_PROCEDURE_DIVERGENTES", ...new Set(rows.flatMap((r) => r.reasons))] };
}

export function eventMapInput(input: { scope: WorkpaperScope; period: AccountingPeriod; payables: PayablesObservation[]; clientsSales: ClientsSalesObservation[]; vat: VatObservation[]; vatChain: EventMapInput["vatChain"] }): EventMapInput {
  const cutoffEvents: CutoffEventFacts[] = [], settlements: SettlementFacts[] = [], credits: CreditFacts[] = [], openInvoices: OpenInvoiceFacts[] = [], vatEntries: VatEntryFacts[] = [], windows: PaymentWindow[] = [];
  for (const p of input.payables) {
    const run = mapRun(p.run, p.stale, p.staleReasons, p.href), procedureId = run.procedureId;
    const src = (batch: { document: { id: string; documentType: string } }, rowId: string, role: string): EventSource => ({ documentVersionId: batch.document.id, rowId, documentType: batch.document.documentType, role, procedureId, runId: run.runId });
    for (const e of p.result.events) {
      const f = p.facts?.events.find((x) => x.key === e.key) ?? null;
      cutoffEvents.push({
        run, economicEventId: e.cutoff.economicEventId, eventKey: e.key, flow: e.flow, party: e.party, invoiceId: e.invoiceId, documentKind: "invoice",
        dates: { invoice: f?.row.normalized?.date ?? e.cutoff.timeline.find((t) => t.label === "Facture")?.date ?? null,
          performance: f?.performance ? { kind: f.input.performance?.kind ?? "point", date: f.performance.row.normalized?.date ?? null } : null,
          booking: f?.input.recognition.bookingDate ?? null, availableAtClosing: f?.input.invoice?.availableAtClosing ?? "unknown" },
        amounts: { net: e.net, tax: e.tax, gross: e.gross },
        qualification: f?.qualification ?? { category: null, debitOption: null, contractDate: null },
        cutoff: e.cutoff, procedureRow: procedureRow(p.result, { eventId: e.cutoff.economicEventId, invoiceId: e.invoiceId, party: e.party }),
        sources: f ? [src(f.batch, f.row.id, "invoice"), ...(f.performance ? [src(f.performance.batch, f.performance.row.id, "performance")] : []), ...f.records.map((r) => src(r.batch, r.row.id, "recognition")), ...f.adjustments.map((r) => src(r.batch, r.row.id, "adjustment"))] : [],
      });
    }
    if (p.result.procedure !== "payables.rpne" || !p.facts) continue;
    windows.push({ procedureId, runId: run.runId, flow: "purchase", startDate: p.result.window.startDate, endDate: p.result.window.endDate, coverage: p.result.window.coverage });
    for (const pay of p.facts.payments) {
      const allocations = p.result.work.allocations.filter((a) => a.paymentId === pay.id);
      const validatedTargets = new Set(allocations.filter((a) => a.status === "validated").map((a) => a.invoiceId));
      settlements.push({ run, id: pay.id, flow: "purchase", party: pay.party, kind: validatedTargets.size > 1 ? "grouped" : "payment", date: pay.value.date, amountTtc: pay.value.amount, cancelledOn: null,
        allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount, status: a.status === "validated" ? "validated" as const : "proposed" as const })),
        sources: [{ documentVersionId: pay.value.source.documentVersionId, rowId: pay.value.source.id, documentType: "payables_payments", role: "payment", procedureId, runId: run.runId }] });
    }
  }
  for (const c of input.clientsSales) {
    const run = mapRun(c.run, c.stale, c.staleReasons, c.href), r = c.result;
    const ev = (proofs: { documentVersionId: string; rowId?: string }[], documentType: string, role: string): EventSource[] => proofs.map((p) => ({ documentVersionId: p.documentVersionId, rowId: p.rowId ?? null, documentType, role, procedureId: "clients.sales", runId: run.runId }));
    windows.push({ procedureId: "clients.sales", runId: run.runId, flow: "sale", startDate: r.window.startDate, endDate: r.window.endDate, coverage: r.window.coverage });
    for (const row of r.rows) openInvoices.push({ run, invoiceId: row.invoiceId, party: row.customerId, issuedOn: row.issuedOn, dueOn: row.dueOn, dueAtClosing: row.dueAtClosing, dueAtReview: row.dueAtReview, sources: ev(row.evidence, "clients_invoices", "open_invoice") });
    for (const pay of r.payments) settlements.push({ run, id: pay.id, flow: "sale", party: pay.customerId, kind: pay.kind, date: pay.paidOn, amountTtc: pay.amount, cancelledOn: pay.cancelledOn,
      allocations: r.allocations.filter((a) => a.paymentId === pay.id).map((a) => ({ invoiceId: a.invoiceId, amount: a.amount, status: a.status })), sources: ev(pay.evidence, "clients_payments", "payment") });
    for (const cr of r.credits) credits.push({ run, id: cr.id, invoiceId: cr.invoiceId, party: cr.customerId, issuedOn: cr.issuedOn, amountTtc: cr.amount, status: cr.status, sources: ev(cr.evidence, "clients_credits", "credit") });
  }
  for (const v of input.vat) {
    const run: EventMapRun = { procedureId: "tva.reconciliation", runId: v.runId, rootId: v.rootId, version: v.version, revision: v.revision, state: v.state, stale: v.stale, staleReasons: v.staleReasons, href: v.href };
    for (const e of v.result.entries) vatEntries.push({ run, period: v.result.period, frequency: v.result.frequency, entryId: e.id, direction: e.direction, pieceRef: e.pieceRef, date: iso(e.date), baseCents: e.baseCents, vatCents: e.vatCents,
      sources: e.piece.status === "found" ? [{ documentVersionId: e.piece.documentVersionId, rowId: e.piece.rowId, documentType: "fx_invoices", role: "vat_entry", procedureId: "tva.reconciliation", runId: v.runId }] : [] });
  }
  // Un même règlement peut être lu par plusieurs versions d'une feuille : seule la plus récente non périmée est gardée.
  const seen = new Set<string>();
  const uniqueSettlements = [...settlements].sort((a, b) => Number(a.run.stale) - Number(b.run.stale) || b.run.version - a.run.version).filter((s) => { const k = `${s.flow}:${s.party}:${s.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { scope: input.scope, period: input.period, framework: { anticipated: [], basis: "aucune option d’anticipation sourcée dans la chaîne réelle" },
    cutoffEvents, settlements: uniqueSettlements, credits, openInvoices, vatEntries,
    vatSheets: input.vat.map((v) => ({ runId: v.runId, period: v.result.period, frequency: v.result.frequency, stale: v.stale })), windows, vatChain: input.vatChain };
}
