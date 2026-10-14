import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { Finding } from "@/lib/canonical-model/finding";
import type { FrenchGaapTextId } from "@/lib/knowledge/french-gaap";
import { resolveProcedure, type ProcedureProposal } from "@/lib/audit/procedures";
import { projectExposure } from "@/lib/synthesis/exposure";
import type { EffectStage } from "@/lib/synthesis/types";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { qualifyVatExigibility, VAT_CATEGORY_LABELS, VAT_EXIGIBILITY_SOURCES, type ReadVatSource, type VatOperationCategory, type VatQualification, type VatSettlement } from "@/lib/tax/vat/exigibility";
import { CUTOFF_METHOD_TEXT, resolveCutoffRule, type CutoffRule } from "./cutoff-rule";
import type { CutoffCandidate, CutoffResult } from "./cutoff";
import { frozen, type WorkpaperScope } from "./model";

/**
 * Carte des événements transversaux (Mission C11).
 *
 * Projection en lecture seule des feuilles existantes — Clients et ventes, Achats et RPNE, cut-off des ventes, TVA par
 * période — autour d'une identité économique unique. Rien n'y est recalculé : les candidats et montants viennent des
 * résultats versionnés des feuilles ; la carte distingue les dates (facture, livraison ou prestation, comptabilisation,
 * paiements, clôture, période de TVA), cite le texte applicable, qualifie l'exigibilité pour les seules catégories
 * couvertes, garde les résidus par clé et les règlements globaux sans les répartir, et compte une seule fois l'effet
 * d'un événement observé par plusieurs procédures (projection C05).
 */
export const EVENT_MAP_VERSION = "1.0.0" as const;

export type EventPart = "accounting" | "vat" | "settlement";
export interface EventSource { documentVersionId: string; rowId: string | null; documentType: string; role: string; procedureId: string; runId: string }
export interface EventMapRun { procedureId: string; runId: string; rootId: string; version: number; revision: number; state: string; stale: boolean; staleReasons: string[]; href: string }
export interface CutoffEventFacts {
  run: EventMapRun;
  economicEventId: string; eventKey: string; flow: "purchase" | "sale"; party: string; invoiceId: string;
  documentKind: "invoice" | "credit_note";
  dates: { invoice: string | null; performance: { kind: "point" | "spread"; date: string | null } | null; booking: string | null; availableAtClosing: "yes" | "no" | "unknown" };
  amounts: { net: KnownAmount; tax: KnownAmount; gross: KnownAmount };
  qualification: { category: VatOperationCategory | null; debitOption: "yes" | "no" | "unknown" | null; contractDate: string | null };
  /** Résultat versionné de la feuille : autorité du candidat. */
  cutoff: CutoffResult;
  /** Statut de la ligne de la procédure qui teste l'événement (écriture d'achat, paiement ultérieur), s'il en existe une. */
  procedureRow: { status: "booked_in_period" | "existing_accrual" | "omission_candidate" | "inconclusive" | "outside_period_justified" | "not_tested"; reasons: string[] } | null;
  sources: EventSource[];
}
export interface SettlementFacts {
  run: EventMapRun; id: string; flow: "purchase" | "sale"; party: string; kind: "payment" | "grouped" | "advance";
  date: string; amountTtc: Money; cancelledOn: string | null;
  allocations: { invoiceId: string; amount: Money; status: "validated" | "proposed" }[];
  sources: EventSource[];
}
export interface CreditFacts { run: EventMapRun; id: string; invoiceId: string; party: string; issuedOn: string; amountTtc: Money; status: "applied" | "unmatched"; sources: EventSource[] }
export interface OpenInvoiceFacts { run: EventMapRun; invoiceId: string; party: string; issuedOn: string; dueOn: string | null; dueAtClosing: Money; dueAtReview: Money; sources: EventSource[] }
export interface VatEntryFacts { run: EventMapRun; period: { startDate: string; endDate: string }; frequency: string; entryId: string; direction: "collected" | "deductible"; pieceRef: string | null; date: string; baseCents: number | null; vatCents: number | null; sources: EventSource[] }
export interface PaymentWindow { procedureId: string; runId: string; flow: "purchase" | "sale"; startDate: string; endDate: string; coverage: "documented" | "incomplete" }
export interface EventMapInput {
  scope: WorkpaperScope; period: AccountingPeriod;
  /** Options d'anticipation déclarées pour le dossier ; aucune source ne les porte aujourd'hui dans la chaîne réelle. */
  framework: { anticipated: FrenchGaapTextId[]; basis: string };
  cutoffEvents: CutoffEventFacts[]; settlements: SettlementFacts[]; credits: CreditFacts[]; openInvoices: OpenInvoiceFacts[];
  vatEntries: VatEntryFacts[]; vatSheets: { runId: string; period: { startDate: string; endDate: string }; frequency: string; stale: boolean }[];
  windows: PaymentWindow[];
  vatChain: "read" | "disabled" | "unavailable";
}

export interface EventObservation { procedureId: string; runId: string; version: number; stale: boolean; staleReasons: string[]; href: string; status: CutoffResult["status"] | "not_tested" | "observed"; basis: "procedure_row" | "event_analysis" | "open_balance"; candidate: CutoffCandidate | null; amount: KnownAmount; reasons: string[]; ruleVersion: string }
const ROW_STATUS: Record<NonNullable<CutoffEventFacts["procedureRow"]>["status"], EventObservation["status"]> = {
  omission_candidate: "candidate", booked_in_period: "already_treated", existing_accrual: "already_treated", outside_period_justified: "no_difference_on_tested_items", inconclusive: "inconclusive", not_tested: "not_tested",
};
export interface EventDependency { part: EventPart; kind: "source" | "run" | "framework" | "vat_sheet"; ref: string; label: string; stale: boolean }
export interface TransversalEvent {
  eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; documentKind: "invoice" | "credit_note";
  dates: {
    invoice: string | null; performance: { kind: "point" | "spread"; date: string | null } | null; booking: string | null;
    payments: { id: string; date: string; amountTtc: Money; kind: string; cancelledOn: string | null; procedureId: string }[];
    credits: { id: string; date: string; amountTtc: Money; status: string }[];
    closing: string; review: string;
    vat: { exigibility: VatQualification; exigibilityPeriod: { startDate: string; endDate: string; basis: "vat_sheet" | "calendar_month_unconfirmed" } | null;
      observedPeriods: { startDate: string; endDate: string; runId: string; entryIds: string[] }[]; shift: "same" | "earlier" | "later" | "not_comparable" };
    /** Frise ordonnée par date (les dates non sourcées en fin) : chaque date garde son rôle de raisonnement. */
    timeline: { key: string; role: "accounting" | "vat" | "settlement" | "period"; label: string; date: string | null }[];
  };
  rule: CutoffRule;
  accounting: { status: "candidate" | "already_treated" | "no_difference_on_tested_items" | "inconclusive" | "divergent" | "not_evaluated"; candidate: CutoffCandidate | null;
    amountHt: KnownAmount; balanceSheet: { account: string; amountTtc: KnownAmount } | null; vatAccount: string | null };
  settlement: { invoiceTtc: KnownAmount; allocatedTtc: Money; creditsTtc: Money; residualTtc: KnownAmount; dueAtClosing: Money | null; dueAtReview: Money | null; partial: boolean; groupedPaymentIds: string[] };
  observations: EventObservation[];
  effect: { economicIdentity: string; amountCents: number; direction: "increase" | "decrease"; target: "resultat"; contributors: number } | null;
  procedure: ProcedureProposal | null;
  sources: (EventSource & { parts: EventPart[] })[];
  dependencies: EventDependency[];
  information: string[];
}
export interface GlobalSettlement { id: string; procedureId: string; runId: string; flow: "purchase" | "sale"; party: string; kind: string; date: string; amountTtc: Money; allocated: { eventId: string | null; invoiceId: string; amount: Money }[]; unallocatedTtc: Money; cancelled: boolean; reason: string }
export interface TransversalEventMap {
  schemaVersion: "transversal-events-1"; version: typeof EVENT_MAP_VERSION; scope: WorkpaperScope;
  period: { startDate: string; closingDate: string; asOfDate: string };
  framework: { anticipated: FrenchGaapTextId[]; basis: string };
  vatChain: EventMapInput["vatChain"];
  events: TransversalEvent[];
  globalSettlements: GlobalSettlement[];
  bridge: { observations: number; candidateObservations: number; countedEffects: number; divergentEvents: number; staleObservations: number; aggregationStatus: string; stages: EffectStage[] };
  invalidation: { sourceType: string; parts: EventPart[]; effect: string }[];
  /** Méthode et sources lues, transmises au navigateur pour la section « Méthode » (aucun registre côté client). */
  method: { grid: string; vatSources: ReadVatSource[]; vatCategories: Record<VatOperationCategory, string> };
  limitations: string[];
  hash: string;
}

const ZERO = money(0n);
const known = (value: Money): KnownAmount => ({ kind: "known", value });
const unknown = (reason: string): KnownAmount => ({ kind: "unknown", reason });
const sumMoney = (values: Money[]) => money(values.reduce((n, v) => n + cents(v), 0n));

/** Comptes et sens d'un candidat technique ; le bilan est TTC pour 408, 418, 4098, 4198 (PCG 1214-40, 1214-41), HT pour 486, 487. */
export const CANDIDATE_ACCOUNTING: Record<CutoffCandidate, { label: string; balanceAccount: string; ttc: boolean; vatAccount: string | null; direction: "increase" | "decrease"; ruleId: string; silo: string }> = {
  FAE: { label: "Produit à recevoir — facture à établir", balanceAccount: "418", ttc: true, vatAccount: "44587", direction: "increase", ruleId: "R-ME-003", silo: "chiffre-affaires" },
  PCA: { label: "Produit constaté d’avance", balanceAccount: "487", ttc: false, vatAccount: null, direction: "decrease", ruleId: "R-PCG-PCA", silo: "chiffre-affaires" },
  FNP: { label: "Charge à payer — facture non parvenue", balanceAccount: "408", ttc: true, vatAccount: "44586", direction: "decrease", ruleId: "R-PCG-FNP", silo: "achats-charges-externes" },
  CCA: { label: "Charge constatée d’avance", balanceAccount: "486", ttc: false, vatAccount: null, direction: "increase", ruleId: "R-PCG-CCA", silo: "achats-charges-externes" },
  AAE: { label: "Avoir à établir (réduction de prix accordée)", balanceAccount: "4198", ttc: true, vatAccount: "44587", direction: "decrease", ruleId: "R-PCG-AAE", silo: "chiffre-affaires" },
  AAR: { label: "Avoir à recevoir (réduction de prix obtenue)", balanceAccount: "4098", ttc: true, vatAccount: "44586", direction: "increase", ruleId: "R-PCG-AAR", silo: "achats-charges-externes" },
};

function addDays(date: string, days: number) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function monthOf(date: string) { const start = date.slice(0, 8) + "01"; const next = new Date(start + "T00:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0); return { startDate: start, endDate: next.toISOString().slice(0, 10) }; }

/** Constat technique projeté pour C05 et C03 : une observation non périmée porteuse d'un candidat. */
function candidateFinding(event: { eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string }, o: EventObservation, rule: CutoffRule, closing: string): Finding | null {
  if (o.stale || o.status !== "candidate" || !o.candidate || o.amount.kind !== "known") return null;
  const a = CANDIDATE_ACCOUNTING[o.candidate], amount = cents(o.amount.value), abs = amount < 0n ? -amount : amount;
  return {
    id: `C11-${o.runId}-v${o.version}-${event.eventId}`, family: "internal", domain: "accounting", severity: "mineur",
    ruleId: a.ruleId, ruleVersion: o.ruleVersion, cloison: "resultat", siloId: a.silo,
    titre: `${a.label} — ${event.invoiceId}`, constat: `Candidat technique ${o.candidate} sur l’événement ${event.invoiceId} (${event.party}), observé par ${o.procedureId} v${o.version}.`,
    explication: "Candidat issu de la grille interne de cut-off ; aucune écriture, aucune conclusion : revue humaine requise.",
    mesure: { constate: Number(abs) / 100, seuil: 0, unite: "EUR", libelle: "Montant HT du candidat" },
    source: { ref: rule.status === "resolved" ? `${rule.label} — ${rule.articles}` : "Texte applicable à déterminer", citation: rule.reasons.join(" "), effectiveDate: rule.status === "resolved" ? closing : "" },
    comptesConcernes: [a.balanceAccount], lignesSource: [], faisceau: o.reasons,
    preuve: [{ etape: "Résultat de feuille", detail: `${o.procedureId} v${o.version} (${o.runId})` }],
    statutRevue: "en_attente", qualification: "cutoff",
    financialEffect: { amountCents: Number(abs), direction: a.direction, target: "resultat", assertion: "rattachement", rootCause: `cutoff:${o.candidate}`, period: closing, basis: "measured", economicIdentity: event.eventId, taxQualification: "unknown" },
  };
}

export function buildTransversalEventMap(input: EventMapInput): TransversalEventMap {
  const { scope, period } = input, close = period.closingDate, review = period.asOfDate;
  const groups = new Map<string, CutoffEventFacts[]>();
  for (const f of input.cutoffEvents) groups.set(f.economicEventId, [...(groups.get(f.economicEventId) ?? []), f]);
  type Shell = { eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; facts: CutoffEventFacts[]; open: OpenInvoiceFacts[] };
  const shells: Shell[] = [...groups.entries()].map(([eventId, facts]) => ({ eventId, flow: facts[0].flow, party: facts[0].party, invoiceId: facts[0].invoiceId, facts, open: [] }));
  const information = new Map<string, string[]>();
  // Facture ouverte à la clôture (clients.sales) : rattachée à l'événement de vente de même tiers et même facture, sinon événement propre.
  for (const o of input.openInvoices) {
    const matches = shells.filter((s) => s.flow === "sale" && s.party === o.party && s.invoiceId === o.invoiceId);
    if (matches.length === 1) matches[0].open.push(o);
    else {
      const eventId = `event-${stableSha256({ scope, key: `clients-open:${o.party}:${o.invoiceId}` })}`;
      const existing = shells.find((s) => s.eventId === eventId);
      if (existing) existing.open.push(o); else shells.push({ eventId, flow: "sale", party: o.party, invoiceId: o.invoiceId, facts: [], open: [o] });
      if (matches.length > 1) information.set(eventId, ["Plusieurs événements de vente portent cette facture : rattachement à documenter."]);
    }
  }
  const eventOfInvoice = (flow: "purchase" | "sale", party: string, invoiceId: string) => shells.filter((s) => s.flow === flow && s.party === party && s.invoiceId === invoiceId);
  const globalSettlements: GlobalSettlement[] = [];
  // Un règlement lu dans une feuille périmée ne réduit aucun reste et ne date aucune exigibilité ; il est seulement signalé.
  const liveSettlements = input.settlements.filter((p) => !p.run.stale), staleSettlements = input.settlements.filter((p) => p.run.stale);
  for (const p of liveSettlements) {
    const validated = p.allocations.filter((a) => a.status === "validated");
    const allocated = sumMoney(validated.map((a) => a.amount)), unallocated = money(cents(p.amountTtc) - cents(allocated));
    const cancelled = !!p.cancelledOn && p.cancelledOn <= review;
    const targets = new Set(validated.map((a) => a.invoiceId));
    if (targets.size > 1 || cents(unallocated) !== 0n || p.kind !== "payment" || cancelled)
      globalSettlements.push({ id: p.id, procedureId: p.run.procedureId, runId: p.run.runId, flow: p.flow, party: p.party, kind: p.kind, date: p.date, amountTtc: p.amountTtc, cancelled,
        allocated: validated.map((a) => ({ eventId: eventOfInvoice(p.flow, p.party, a.invoiceId)[0]?.eventId ?? null, invoiceId: a.invoiceId, amount: a.amount })), unallocatedTtc: cancelled ? ZERO : unallocated,
        reason: cancelled ? "Paiement annulé : ses affectations historiques restent tracées et ne réduisent plus aucun solde." : targets.size > 1 ? "Règlement global affecté à plusieurs clés : résidus suivis par clé, sans répartition linéaire." : cents(unallocated) !== 0n ? "Reliquat non affecté : aucune imputation automatique." : p.kind === "advance" ? "Acompte : affectation documentée requise." : "Règlement groupé." });
  }
  const sheets = [...input.vatSheets].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  const events: TransversalEvent[] = shells.map((s) => {
    const lead = s.facts.find((f) => !f.run.stale) ?? s.facts[0] ?? null;
    const contractDate = s.facts.map((f) => f.qualification.contractDate).find(Boolean) ?? null;
    const rule = resolveCutoffRule({ startDate: period.startDate, closingDate: close, flow: s.flow, anticipated: input.framework.anticipated, contractDate });
    // Une ligne de procédure (écriture testée, paiement alloué) prime sur l'analyse de l'événement ; sans ligne, l'analyse vaut observation.
    const observations: EventObservation[] = s.facts.map((f) => {
      const row = f.procedureRow, status = row ? ROW_STATUS[row.status] : f.cutoff.status;
      return { procedureId: f.run.procedureId, runId: f.run.runId, version: f.run.version, stale: f.run.stale, staleReasons: f.run.staleReasons, href: f.run.href, status, basis: row ? "procedure_row" as const : "event_analysis" as const,
        candidate: status === "candidate" ? f.cutoff.candidate : null, amount: status === "candidate" ? f.cutoff.amount : row ? { kind: "unknown" as const, reason: row.reasons.join(" ; ") || "Ligne de procédure sans candidat" } : f.cutoff.amount,
        reasons: row ? [...new Set([...row.reasons, ...f.cutoff.reasons])] : f.cutoff.reasons, ruleVersion: f.cutoff.version };
    });
    for (const o of s.open) observations.push({ procedureId: o.run.procedureId, runId: o.run.runId, version: o.run.version, stale: o.run.stale, staleReasons: o.run.staleReasons, href: o.run.href,
      status: "observed", basis: "open_balance", candidate: null, amount: { kind: "not_applicable", reason: "Solde ouvert observé ; aucun candidat de rattachement dans cette procédure" }, reasons: [], ruleVersion: "clients-sales-result-1" });
    // Un seul effet par événement. Si une procédure a testé l'événement (ligne d'écriture ou de paiement), ses lignes
    // concluent : une ligne non concluante (fenêtre incomplète, paiement groupé non ventilé) suspend l'effet, comme dans la
    // synthèse Achats. Sinon (vente de cut-off, facture hors population testée), l'analyse de l'événement vaut candidat
    // technique. Un « déjà rattaché » ou « hors période » face à un candidat rend l'événement divergent.
    const current = observations.filter((o) => !o.stale && o.status !== "observed");
    const deciding = current.some((o) => o.basis === "procedure_row") ? current.filter((o) => o.basis === "procedure_row") : current;
    const candidates = deciding.some((o) => o.status === "candidate") ? current.filter((o) => o.status === "candidate") : [];
    let accounting: TransversalEvent["accounting"];
    if (!current.length) accounting = { status: "not_evaluated", candidate: null, amountHt: unknown(s.facts.length ? "Seules des observations périmées existent : relancer la feuille" : "Aucune source de livraison ou de prestation : rattachement non évalué"), balanceSheet: null, vatAccount: null };
    else if (candidates.length) {
      const kinds = new Set(candidates.map((c) => c.candidate)), amounts = new Set(candidates.map((c) => stableSha256(c.amount)));
      const divergent = kinds.size > 1 || amounts.size > 1 || current.some((o) => o.status === "already_treated" || o.status === "no_difference_on_tested_items");
      const kind = candidates[0].candidate!, a = CANDIDATE_ACCOUNTING[kind];
      if (divergent) accounting = { status: "divergent", candidate: null, amountHt: unknown("Observations divergentes du même événement : revue requise avant tout montant"), balanceSheet: null, vatAccount: null };
      else {
        const amountHt = candidates[0].amount;
        const full = lead && amountHt.kind === "known" && lead.amounts.net.kind === "known" && cents(amountHt.value) === cents(lead.amounts.net.value);
        const ttc = !a.ttc ? amountHt : full && lead!.amounts.gross.kind === "known" ? lead!.amounts.gross : unknown("TTC de la seule part non rattachée non sourcé : aucune proportion déduite");
        accounting = { status: "candidate", candidate: kind, amountHt, balanceSheet: { account: a.balanceAccount, amountTtc: ttc }, vatAccount: a.vatAccount };
      }
    } else {
      const decided = new Set(current.filter((o) => o.status === "already_treated" || o.status === "no_difference_on_tested_items").map((o) => o.status));
      const suspended = current.some((o) => o.status === "candidate");
      accounting = decided.size > 1 ? { status: "divergent", candidate: null, amountHt: unknown("Statuts divergents entre procédures"), balanceSheet: null, vatAccount: null }
        : decided.size === 1 && !suspended ? { status: [...decided][0] as "already_treated" | "no_difference_on_tested_items", candidate: null, amountHt: current.find((o) => o.status === [...decided][0])!.amount, balanceSheet: null, vatAccount: null }
        : decided.size === 1 ? { status: "divergent", candidate: null, amountHt: unknown("Analyse de l’événement et procédure divergentes : revue requise"), balanceSheet: null, vatAccount: null }
        : { status: "inconclusive", candidate: null, amountHt: unknown(suspended ? "Candidat technique de l’événement suspendu : la procédure qui le teste n’a pas conclu" : "Aucune observation concluante"), balanceSheet: null, vatAccount: null };
    }
    // Règlements par clé : seules les affectations validées et non annulées réduisent le reste ; une proposition n'affecte rien.
    const payments = liveSettlements.flatMap((p) => p.flow === s.flow && p.party === s.party ? p.allocations.filter((a) => a.invoiceId === s.invoiceId && a.status === "validated").map((a) => ({ id: p.id, date: p.date, amountTtc: a.amount, kind: p.kind, cancelledOn: p.cancelledOn, procedureId: p.run.procedureId, multi: new Set(p.allocations.filter((x) => x.status === "validated").map((x) => x.invoiceId)).size > 1 })) : []);
    const active = payments.filter((p) => !p.cancelledOn || p.cancelledOn > review);
    const credits = input.credits.filter((c) => c.party === s.party && c.invoiceId === s.invoiceId && s.flow === "sale").map((c) => ({ id: c.id, date: c.issuedOn, amountTtc: c.amountTtc, status: c.status }));
    const applied = credits.filter((c) => c.status === "applied");
    const allocatedTtc = sumMoney(active.map((p) => p.amountTtc)), creditsTtc = sumMoney(applied.map((c) => c.amountTtc));
    const gross = lead?.amounts.gross ?? (s.open[0] ? unknown("TTC d’origine de la facture non reconstitué : seul le solde ouvert à la clôture est sourcé") : unknown("Facture non sourcée"));
    const residualTtc = s.open[0] ? known(s.open[0].dueAtReview) : gross.kind === "known" ? known(money(cents(gross.value) - cents(allocatedTtc) - cents(creditsTtc))) : unknown("TTC de la facture inconnu");
    const settlement = { invoiceTtc: gross, allocatedTtc, creditsTtc, residualTtc, dueAtClosing: s.open[0]?.dueAtClosing ?? null, dueAtReview: s.open[0]?.dueAtReview ?? null,
      partial: residualTtc.kind === "known" && cents(residualTtc.value) !== 0n && cents(allocatedTtc) + cents(creditsTtc) > 0n, groupedPaymentIds: [...new Set(payments.filter((p) => p.multi || p.kind === "grouped").map((p) => p.id))] };
    // Encaissements « complets » seulement si la facture est soldée par des affectations validées : les sources ultérieures
    // (fenêtre après clôture) ne disent rien des acomptes antérieurs.
    const invoiceDate = lead?.dates.invoice ?? s.open[0]?.issuedOn ?? null;
    const settledAll = gross.kind === "known" && cents(gross.value) > 0n && cents(allocatedTtc) === cents(gross.value);
    const settlementStatus: "complete" | "partial" | "unknown" = settledAll ? "complete" : active.length || s.open.length ? "partial" : "unknown";
    const incompleteWindows = input.windows.filter((w) => w.flow === s.flow && (w.coverage !== "documented" || w.endDate !== review || w.startDate > addDays(close, 1)));
    const vatSettlements: VatSettlement[] = active.map((p) => ({ id: p.id, date: p.date, amountTtc: p.amountTtc, kind: p.kind === "advance" ? "advance" : "payment", source: p.procedureId }));
    const exigibility = qualifyVatExigibility({ flow: s.flow, documentKind: lead?.documentKind ?? "invoice", category: lead?.qualification.category ?? null, debitOption: lead?.qualification.debitOption ?? null,
      performance: lead?.dates.performance ?? null, debitDate: s.flow === "sale" ? lead?.dates.booking ?? null : null,
      net: lead?.amounts.net ?? unknown("HT non sourcé"), tax: lead?.amounts.tax ?? unknown("TVA non sourcée"), gross, settlements: { status: settlementStatus, items: vatSettlements, reviewDate: review } });
    const sheet = exigibility.firstDate ? sheets.find((v) => v.period.startDate <= exigibility.firstDate! && exigibility.firstDate! <= v.period.endDate) : undefined;
    const exigibilityPeriod = !exigibility.firstDate ? null : sheet ? { ...sheet.period, basis: "vat_sheet" as const } : { ...monthOf(exigibility.firstDate), basis: "calendar_month_unconfirmed" as const };
    const entries = input.vatEntries.filter((v) => v.pieceRef === s.invoiceId && v.direction === (s.flow === "sale" ? "collected" : "deductible"));
    const observedPeriods = [...new Map(entries.map((e) => [e.run.runId + e.period.startDate, { startDate: e.period.startDate, endDate: e.period.endDate, runId: e.run.runId, entryIds: entries.filter((x) => x.run.runId === e.run.runId).map((x) => x.entryId) }])).values()];
    // Décalage : comparé seulement pour une qualification complète ; une qualification partielle ne dit qu'un retard
    // (un acompte inconnu ne pourrait qu'avancer l'exigibilité).
    const shift: TransversalEvent["dates"]["vat"]["shift"] = !exigibilityPeriod || observedPeriods.length !== 1 ? "not_comparable"
      : exigibility.status === "qualified" ? observedPeriods[0].startDate === exigibilityPeriod.startDate ? "same" : observedPeriods[0].startDate > exigibilityPeriod.startDate ? "later" : "earlier"
      : exigibility.status === "partially_qualified" && exigibility.tranches[0]?.basis !== "payment" && observedPeriods[0].startDate > exigibilityPeriod.startDate ? "later" : "not_comparable";
    const representative = candidates.find((o) => !o.stale) ?? null;
    const finding = representative && accounting.status === "candidate" ? candidateFinding(s, representative, rule, close) : null;
    const contributors = accounting.status === "candidate" ? candidates.length : 0;
    const effect = finding?.financialEffect ? { economicIdentity: s.eventId, amountCents: finding.financialEffect.amountCents, direction: finding.financialEffect.direction, target: "resultat" as const, contributors } : null;
    const procedure = finding ? resolveProcedure(finding) : null;
    // Sources et dépendances : chaque partie de l'événement ne se périme qu'avec ses propres sources.
    const sourceMap = new Map<string, EventSource & { parts: EventPart[] }>();
    const addSource = (src: EventSource, parts: EventPart[]) => { const k = `${src.documentVersionId}:${src.rowId ?? ""}:${src.role}`; const old = sourceMap.get(k); sourceMap.set(k, old ? { ...old, parts: [...new Set([...old.parts, ...parts])] } : { ...src, parts }); };
    for (const f of s.facts) for (const src of f.sources) addSource(src, src.role === "invoice" ? ["accounting", "vat", "settlement"] : src.role === "performance" ? ["accounting", "vat"] : ["accounting"]);
    for (const o of s.open) for (const src of o.sources) addSource(src, ["settlement", "vat"]);
    for (const p of input.settlements.filter((p) => p.flow === s.flow && p.party === s.party && p.allocations.some((a) => a.invoiceId === s.invoiceId))) for (const src of p.sources) addSource(src, ["settlement", "vat"]);
    for (const c of input.credits.filter((c) => c.party === s.party && c.invoiceId === s.invoiceId && s.flow === "sale")) for (const src of c.sources) addSource(src, ["settlement", "accounting"]);
    for (const e of entries) for (const src of e.sources) addSource(src, ["vat"]);
    const dependencies: EventDependency[] = [
      ...[...new Map([...s.facts.map((f) => f.run), ...s.open.map((o) => o.run), ...input.settlements.filter((p) => p.flow === s.flow && p.party === s.party && p.allocations.some((a) => a.invoiceId === s.invoiceId)).map((p) => p.run)].map((r) => [r.runId + ":" + r.version, r])).values()]
        .map((r) => ({ part: r.procedureId === "clients.sales" || r.procedureId === "payables.rpne" ? "settlement" as const : "accounting" as const, kind: "run" as const, ref: `${r.procedureId} · ${r.runId} v${r.version}`, label: r.stale ? `Feuille périmée : ${r.staleReasons.join(" ")}` : "Feuille courante", stale: r.stale })),
      ...entries.map((e) => e.run).filter((r, i, all) => all.findIndex((x) => x.runId === r.runId) === i).map((r) => ({ part: "vat" as const, kind: "vat_sheet" as const, ref: `tva.reconciliation · ${r.runId} v${r.version}`, label: r.stale ? "Feuille TVA périmée" : "Période TVA observée", stale: r.stale })),
      { part: "accounting", kind: "framework", ref: `Référentiel C04 · ${rule.textId ?? "texte à déterminer"}`, label: `Options d’anticipation : ${input.framework.anticipated.length ? input.framework.anticipated.join(", ") : "aucune déclarée"} (${input.framework.basis})`, stale: false },
    ];
    const info = [...(information.get(s.eventId) ?? [])];
    if (rule.status !== "resolved") info.push(...rule.reasons.slice(-1));
    if (accounting.status === "inconclusive" || accounting.status === "divergent") info.push(...(accounting.amountHt.kind === "unknown" ? [accounting.amountHt.reason] : []), ...new Set(current.filter((o) => o.status !== "candidate").flatMap((o) => o.reasons)));
    info.push(...exigibility.missing);
    const staleHere = staleSettlements.filter((p) => p.flow === s.flow && p.party === s.party && p.allocations.some((a) => a.invoiceId === s.invoiceId));
    if (staleHere.length) info.push(`Règlements lus dans une feuille périmée (${[...new Set(staleHere.map((p) => p.id))].join(", ")}) : non retenus tant que la feuille n’est pas relancée.`);
    for (const w of incompleteWindows) info.push(`Source ultérieure incomplète (${w.procedureId}, ${w.startDate} → ${w.endDate}, ${w.coverage === "documented" ? "fenêtre ne couvrant pas la période clôture–revue" : "couverture non documentée"}) : règlements non tous documentés.`);
    if (s.flow === "sale" && credits.length && !s.facts.some((f) => f.documentKind === "credit_note")) info.push("Avoir postérieur à la clôture : date de sa cause (retour, défaut, accord) requise pour décider d’un avoir à établir.");
    const performance = lead?.dates.performance ?? null, documentKind = lead?.documentKind ?? "invoice";
    const timeline: TransversalEvent["dates"]["timeline"] = [
      { key: "invoice", role: "accounting" as const, label: documentKind === "credit_note" ? "Avoir" : "Facture", date: invoiceDate },
      { key: "performance", role: "accounting" as const, label: documentKind === "credit_note" ? "Cause de l’avoir" : s.flow === "sale" ? "Livraison ou prestation réalisée" : "Réception ou prestation reçue", date: performance?.date ?? null },
      { key: "booking", role: "accounting" as const, label: "Comptabilisation avant clôture", date: lead?.dates.booking ?? null },
      { key: "closing", role: "period" as const, label: "Clôture", date: close },
      ...payments.map((p) => ({ key: "payment:" + p.id, role: "settlement" as const, label: `${p.kind === "advance" ? "Acompte" : s.flow === "sale" ? "Encaissement" : "Paiement"} ${p.id}${p.cancelledOn && p.cancelledOn <= review ? " (annulé)" : ""}`, date: p.date })),
      ...credits.map((c) => ({ key: "credit:" + c.id, role: "settlement" as const, label: `Avoir ${c.id}`, date: c.date })),
      ...exigibility.tranches.map((t, i) => ({ key: "vat:" + i, role: "vat" as const, label: `${s.flow === "sale" ? "Exigibilité TVA" : "Droit à déduction"} — ${t.label}`, date: t.date })),
      ...observedPeriods.map((p) => ({ key: "vat-observed:" + p.runId, role: "vat" as const, label: `TVA observée (période ${p.startDate} → ${p.endDate})`, date: p.startDate })),
      { key: "review", role: "period" as const, label: "Revue", date: review },
    ].sort((a, b) => (a.date === null ? 1 : 0) - (b.date === null ? 1 : 0) || (a.date ?? "").localeCompare(b.date ?? "") || a.key.localeCompare(b.key));
    return { eventId: s.eventId, flow: s.flow, party: s.party, invoiceId: s.invoiceId, documentKind,
      dates: { invoice: invoiceDate, performance, booking: lead?.dates.booking ?? null, payments: payments.map(({ multi: _multi, ...p }) => { void _multi; return p; }), credits, closing: close, review,
        vat: { exigibility, exigibilityPeriod, observedPeriods, shift }, timeline },
      rule, accounting, settlement, observations, effect, procedure,
      sources: [...sourceMap.values()].sort((a, b) => a.documentVersionId.localeCompare(b.documentVersionId) || (a.rowId ?? "").localeCompare(b.rowId ?? "") || a.role.localeCompare(b.role)),
      dependencies, information: [...new Set(info)] };
  }).sort((a, b) => a.flow.localeCompare(b.flow) || a.party.localeCompare(b.party) || a.invoiceId.localeCompare(b.invoiceId) || a.eventId.localeCompare(b.eventId));
  // Pont : pour un événement retenu, chaque observation courante porteuse du candidat devient un constat ; C05 compte une
  // fois les répétitions exactes. Un événement suspendu ou divergent n'alimente aucun effet (compté à part).
  const findings = events.filter((e) => e.accounting.status === "candidate").flatMap((e) => e.observations.map((o) => candidateFinding(e, o, e.rule, close)).filter((f): f is Finding => !!f));
  const projection = projectExposure(findings, `cutoff-map:${scope.dossierId}:${scope.periodId}`);
  const observations = events.flatMap((e) => e.observations);
  const body = {
    schemaVersion: "transversal-events-1" as const, version: EVENT_MAP_VERSION, scope, period: { startDate: period.startDate, closingDate: close, asOfDate: review },
    framework: input.framework, vatChain: input.vatChain, events, globalSettlements: globalSettlements.sort((a, b) => a.id.localeCompare(b.id)),
    bridge: { observations: observations.length, candidateObservations: findings.length, countedEffects: events.filter((e) => e.effect).length, divergentEvents: events.filter((e) => e.accounting.status === "divergent").length,
      staleObservations: observations.filter((o) => o.stale).length, aggregationStatus: projection.exposure.aggregationStatus, stages: projection.exposure.stages },
    invalidation: INVALIDATION_MAP,
    method: { grid: CUTOFF_METHOD_TEXT, vatSources: Object.values(VAT_EXIGIBILITY_SOURCES), vatCategories: VAT_CATEGORY_LABELS },
    limitations: [
      "Projection en lecture seule : candidats et montants viennent des résultats versionnés des feuilles, jamais d’un recalcul.",
      "Une observation périmée reste visible mais ne compte pas dans l’effet ; la feuille doit être relancée.",
      "Exigibilité qualifiée pour deux catégories seulement (biens, services en France) ; tout autre cas = information requise. Aucune TVA calculée, aucun taux légal.",
      "Échéance absente : l’ancienneté depuis facture n’est ni un retard contractuel ni un taux de dépréciation.",
      "CFE, CVAE et cotisations : aucun taux générique ; l’incidence fiscale des candidats reste inconnue (qualification non établie).",
      ...(input.vatChain === "read" ? [] : ["Feuilles TVA non lues (chaîne fiscale " + (input.vatChain === "disabled" ? "non activée" : "indisponible") + ") : période TVA observée inconnue."]),
    ],
  };
  return frozen({ ...body, hash: stableSha256(body) });
}

/** Dépendances d'invalidation : quelle source périme quelle partie, et rien d'autre. */
export const INVALIDATION_MAP: TransversalEventMap["invalidation"] = [
  { sourceType: "payables_invoices / cutoff_sales (facture)", parts: ["accounting", "vat", "settlement"], effect: "Périme les feuilles Achats / RPNE qui l’ont figée ; base HT/TVA/TTC, nature, option et date de contrat relues." },
  { sourceType: "payables_performance (livraison / prestation)", parts: ["accounting", "vat"], effect: "Change le fait générateur : candidat et exigibilité des biens à reprendre ; règlements inchangés." },
  { sourceType: "payables_recognition / payables_adjustments", parts: ["accounting"], effect: "Change le montant déjà rattaché : candidat à reprendre ; TVA et règlements inchangés." },
  { sourceType: "payables_payments + allocations validées (RPNE)", parts: ["settlement", "vat"], effect: "Change les paiements : résidu TTC et droit à déduction des services ; candidat HT inchangé." },
  { sourceType: "clients_invoices / clients_payments / clients_credits + allocations", parts: ["settlement", "vat"], effect: "Change le solde ouvert et les encaissements : résidu par clé et exigibilité des services ; le solde à la clôture reste fixe." },
  { sourceType: "fx_fec / fx_vat_return (feuille TVA de la période)", parts: ["vat"], effect: "Change la période TVA observée ; candidat comptable et règlements inchangés." },
  { sourceType: "Référentiel C04 (texte, option d’anticipation, date de contrat)", parts: ["accounting"], effect: "Change le texte cité ; pour une vente sous ANC 2026-03 sans contrat daté, le candidat devient non concluant à la prochaine exécution." },
];
