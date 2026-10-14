import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { knownAmountSchema, moneySchema, type WorkpaperRun } from "./model";
import { equityResultOf } from "./capitaux-mission";
import { CAPITAUX_RESULT_SCHEMA_VERSION, CAPITAUX_RULE_VERSION, EQ_DECISION_TEXT, type EquityResult } from "./capitaux-review";
import { EQ_COMPONENT_LABELS, EQ_DECISION_TYPE_LABELS, EQ_DECISION_TYPES, type EqComponent, type EqDecisionType } from "./capitaux-sources";
import { PAYMENT_STATUS_LABELS, paymentState, paymentStateSchema, type PaymentState } from "./capitaux-payment";
import { presentationSchema } from "./capitaux-presentation";
import { legalMarkersSchema } from "./capitaux-legal";
import { EQUITY_FAMILY_LABELS, EQUITY_STATUS } from "./equity-program";

/**
 * Parcours Capitaux propres unique (C09). One read-only view over the two historical procedures:
 *  - `capitaux_propres.review` (/capitaux-propres, tables eq_*, rule 1.1.0 for new work; 1.0.0 results read as they are);
 *  - `equity.review` (/equity, shared clients_* tables, rule 1.0.0, kept readable and continuable).
 * Nothing is recomputed from the sources and no review is rewritten: the adapter reads the frozen results
 * of each sheet at its exact version. An economic decision linked to both procedures counts once:
 * two traces are the same decision only when they cite the same PV (identical bytes, SHA-256) at the
 * same page, one decision per sheet. Any ambiguity is listed « à rapprocher » and left out of the totals,
 * never added twice nor decided from an amount.
 */
export const PARCOURS_SCHEMA_VERSION = "capitaux-parcours-1" as const;
export const PARCOURS_PROCEDURES = ["capitaux_propres.review", "equity.review"] as const;
export type ParcoursProcedure = typeof PARCOURS_PROCEDURES[number];
export const PARCOURS_PROCEDURE_LABELS: Record<ParcoursProcedure, string> = {
  "capitaux_propres.review": "Feuille décisions et PV versionnés (/capitaux-propres)",
  "equity.review": "Dossier de décisions et mouvements (/equity, parcours historique)",
};
export const FAMILIES = ["capital", "primes", "reserves", "report", "result", "revaluation", "subventions", "regulated", "other"] as const;
export type Family = typeof FAMILIES[number];
/** Common vocabulary of both procedures: the PCG rubrics of /capitaux-propres grouped into the families declared by /equity. */
export const COMPONENT_FAMILY: Record<Exclude<EqComponent, "autres_fonds_propres">, Family> = {
  capital: "capital", primes: "primes", ecarts_reevaluation: "revaluation", ecart_equivalence: "other", reserve_legale: "reserves", reserves_statutaires: "reserves",
  reserves_reglementees: "reserves", autres_reserves: "reserves", report_a_nouveau: "report", resultat: "result", subventions_investissement: "subventions", provisions_reglementees: "regulated",
};

export interface JourneyRun {
  run: WorkpaperRun;
  /** False when a source of the sheet was replaced after freezing (revision required). */
  sourcesCurrent: boolean;
  /** True for the latest revision of its lineage; false for an exact earlier version requested by link. */
  lineageCurrent: boolean;
  /** PV identity by document version, for the legacy procedure (its result cites the version, not the bytes). */
  pvIndex?: Record<string, { sha256: string; fileName: string }>;
  /** Legacy procedure only: a payments source was frozen with the sheet. */
  paymentsSourcePresent?: boolean;
}
export type JourneyAvailability = "ready" | "disabled" | "unavailable";
export interface ParcoursInput {
  scope: { dossierId: string; periodId: string };
  journeys: Record<ParcoursProcedure, { availability: JourneyAvailability; code?: string; runs: JourneyRun[] }>;
}

const pvSchema = z.object({ sha256: z.string().min(1), page: z.number().int().positive(), fileName: z.string(), pieceRef: z.string().nullable() }).strict();
const traceSchema = z.object({
  id: z.string(), procedure: z.enum(PARCOURS_PROCEDURES), runId: z.string(), rootId: z.string(), revision: z.number().int(), version: z.number().int(), ruleVersion: z.string(), resultSchema: z.string(),
  stale: z.boolean(), staleReasons: z.array(z.string()), decisionRefs: z.array(z.string()), label: z.string(), organ: z.string(), type: z.union([z.enum(EQ_DECISION_TYPES), z.literal("non_typee")]), typeLabel: z.string(),
  decisionDate: z.string(), effectDates: z.array(z.string()), pv: pvSchema.nullable(), reading: z.string(), statusLabel: z.string(),
  effects: z.array(z.object({ family: z.enum(FAMILIES), familyLabel: z.string(), componentLabel: z.string(), voted: moneySchema, booked: knownAmountSchema, direction: z.enum(["signed", "transfer"]) }).strict()),
  magnitude: knownAmountSchema, booked: knownAmountSchema, payment: paymentStateSchema.nullable(), paymentNote: z.string(),
  amendments: z.array(z.object({ lineId: z.string(), decisionDate: z.string(), voted: moneySchema, pieceRef: z.string() }).strict()),
  href: z.string(),
}).strict();
export type ParcoursTrace = z.infer<typeof traceSchema>;
const decisionSchema = z.object({
  key: z.string(), correspondence: z.enum(["single", "linked_concordant", "linked_divergent", "to_reconcile"]), counted: z.boolean(), reason: z.string(),
  type: z.union([z.enum(EQ_DECISION_TYPES), z.literal("non_typee")]), typeLabel: z.string(), organ: z.string(), decisionDate: z.string(), effectDates: z.array(z.string()), pv: pvSchema.nullable(),
  magnitude: knownAmountSchema, booked: knownAmountSchema, payment: paymentStateSchema.nullable(), effects: traceSchema.shape.effects, amendments: traceSchema.shape.amendments, reference: z.string(), traces: z.array(traceSchema).min(1),
}).strict();
export type ParcoursDecision = z.infer<typeof decisionSchema>;
const runSchema = z.object({ runId: z.string(), rootId: z.string(), revision: z.number().int(), version: z.number().int(), state: z.string(), ruleVersion: z.string(), ruleCurrent: z.boolean(), lineageCurrent: z.boolean(),
  sourcesCurrent: z.boolean(), executed: z.boolean(), resultSchema: z.string().nullable(), decisions: z.number().int(), href: z.string(), synthesisHref: z.string() }).strict();
export const parcoursViewSchema = z.object({
  schemaVersion: z.literal(PARCOURS_SCHEMA_VERSION), scope: z.object({ dossierId: z.string(), periodId: z.string() }).strict(),
  journeys: z.array(z.object({ procedure: z.enum(PARCOURS_PROCEDURES), label: z.string(), role: z.enum(["cible", "historique"]), availability: z.enum(["ready", "disabled", "unavailable"]), code: z.string().nullable(), note: z.string(), runs: z.array(runSchema) }).strict()),
  decisions: z.array(decisionSchema),
  totals: z.object({
    counted: z.number().int(), linked: z.number().int(), toReconcile: z.number().int(), divergent: z.number().int(), traces: z.number().int(),
    byType: z.array(z.object({ type: z.string(), label: z.string(), count: z.number().int(), magnitude: knownAmountSchema }).strict()),
    effectsByFamily: z.array(z.object({ family: z.enum(FAMILIES), label: z.string(), voted: knownAmountSchema, decisions: z.number().int() }).strict()),
    settlements: z.object({ decisions: z.number().int(), voted: knownAmountSchema, paidAtReview: knownAmountSchema, remainingAtReview: knownAmountSchema, unpaid: z.number().int() }).strict(),
    exclusions: z.array(z.object({ reason: z.string(), count: z.number().int() }).strict()),
  }).strict(),
  framing: z.object({ runId: z.string(), version: z.number().int(), socialFormLabel: z.string(), presentation: presentationSchema, legal: legalMarkersSchema }).strict().nullable(),
  framingReason: z.string(),
  transition: z.array(z.string()),
  limitations: z.array(z.string()),
}).strict();
export type ParcoursView = z.infer<typeof parcoursViewSchema>;

const known = (value: Money): KnownAmount => ({ kind: "known", value });
/** Magnitude of a decision whose lines carry signed equity effects: the larger of the credits and the debits (a neutral transfer counts its moved amount once). */
function magnitudeOf(values: Money[]): Money {
  const pos = values.reduce((s, m) => s + (cents(m) > 0n ? cents(m) : 0n), 0n), neg = values.reduce((s, m) => s + (cents(m) < 0n ? -cents(m) : 0n), 0n);
  return money(pos > neg ? pos : neg);
}
function bookedOf(values: KnownAmount[]): KnownAmount {
  if (values.every(v => v.kind === "not_applicable")) return { kind: "not_applicable", reason: "Aucune écriture rattachée" };
  if (values.some(v => v.kind === "unknown")) return { kind: "unknown", reason: "Comptabilisation non établie pour une ligne" };
  return known(magnitudeOf(values.filter((v): v is { kind: "known"; value: Money } => v.kind === "known").map(v => v.value)));
}
const query = (scope: ParcoursInput["scope"], extra: Record<string, string>) => new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...extra }).toString();
const capitauxHref = (scope: ParcoursInput["scope"], run: WorkpaperRun, item?: string) => "/capitaux-propres?" + query(scope, { id: run.id, version: String(run.version), ...(item ? { item } : {}) });
const equityHref = (scope: ParcoursInput["scope"], run: WorkpaperRun, event?: string) => "/equity?" + query(scope, { id: run.id, version: String(run.version), tab: "tests", ...(event ? { event } : {}) });
const staleOf = (jr: JourneyRun, ruleCurrent: boolean) => [...(!jr.sourcesCurrent ? ["Source remplacée ou ajoutée depuis le gel : révision requise."] : []), ...(!jr.lineageCurrent ? ["Version antérieure demandée par lien : une version plus récente existe."] : []), ...(!ruleCurrent ? ["Règle remplacée : version consultable, révision requise pour poursuivre."] : [])];

const SEVERITY = ["without_entry", "amount_divergent", "effect_outside_period", "reading_required", "matched", "not_expected", "prior_period", "excluded", "superseded"];
/** /capitaux-propres: decision lines in force grouped by decision and resolution (or type), superseded lines carried as amendment history. */
function capitauxTraces(scope: ParcoursInput["scope"], jr: JourneyRun): { traces: ParcoursTrace[]; excluded: { reason: string; count: number }[] } {
  const r: EquityResult | null = equityResultOf(jr.run);
  if (!r || !r.decisions) return { traces: [], excluded: [] };
  const v2 = r.schemaVersion === CAPITAUX_RESULT_SCHEMA_VERSION, ruleVersion = jr.run.template.rule?.version ?? jr.run.template.version;
  // Post-closing amendments are signals of the sheet, not decisions of the period: the decision they target stays the one counted.
  const postClosing = (d: NonNullable<EquityResult["decisions"]>[number]) => !!d.amends && d.decisionDate > r.closingDate;
  const lines = r.decisions.filter(d => d.inScope && d.status !== "superseded" && !postClosing(d));
  const key = (d: typeof lines[number]) => d.paymentGroup ?? d.decisionId + " · " + (d.pv.resolution ? "résolution " + d.pv.resolution : EQ_DECISION_TYPE_LABELS[d.type]);
  const groups = [...new Set(lines.map(key))];
  const traces = groups.map(k => {
    const members = lines.filter(d => key(d) === k), first = members[0], pvLine = members.find(d => d.pv.status === "available" && d.pv.sha256 && d.pv.page);
    const types = [...new Set(members.map(d => d.type))] as EqDecisionType[];
    const settled = members.filter(d => d.type === "distribution" || d.type === "augmentation_capital");
    const worst = [...members].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status))[0];
    const amendments = v2 ? members.flatMap(d => (d.chain ?? []).map(id => r.decisions!.find(x => x.lineId === id)!).map(x => ({ lineId: x.lineId, decisionDate: x.decisionDate, voted: x.voted, pieceRef: x.pv.pieceRef }))) : [];
    return {
      id: "capitaux:" + jr.run.id + ":" + k, procedure: "capitaux_propres.review" as const, runId: jr.run.id, rootId: jr.run.rootId, revision: jr.run.revision, version: jr.run.version, ruleVersion, resultSchema: r.schemaVersion,
      stale: false, staleReasons: [], decisionRefs: members.map(d => d.lineId), label: [...new Set(members.map(d => d.label).filter(Boolean))].join(" · ") || k, organ: first.organ, type: types.length === 1 ? types[0] : "autre_decision" as EqDecisionType,
      typeLabel: types.map(t => EQ_DECISION_TYPE_LABELS[t]).join(" · "), decisionDate: [...members.map(d => d.decisionDate)].sort()[0], effectDates: [...new Set(members.map(d => d.effectDate))].sort(),
      pv: pvLine ? { sha256: pvLine.pv.sha256!, page: pvLine.pv.page!, fileName: pvLine.pv.fileName ?? "", pieceRef: pvLine.pv.pieceRef || null } : null,
      reading: members.every(d => d.reading.status === "validated") ? "Lecture du PV validée" : members.some(d => d.pv.status !== "available") ? "PV absent ou page introuvable" : "Lecture du PV à valider",
      statusLabel: EQ_DECISION_TEXT[worst.status].label,
      effects: members.map(d => ({ family: COMPONENT_FAMILY[d.component as Exclude<EqComponent, "autres_fonds_propres">], familyLabel: EQUITY_FAMILY_LABELS[COMPONENT_FAMILY[d.component as Exclude<EqComponent, "autres_fonds_propres">]], componentLabel: EQ_COMPONENT_LABELS[d.component], voted: d.voted, booked: d.booked, direction: "signed" as const })),
      magnitude: known(magnitudeOf(members.map(d => d.voted))), booked: bookedOf(members.map(d => d.booked)),
      payment: v2 ? first.paymentState ?? null : null,
      paymentNote: v2 ? (settled.length ? "Paiement de la décision en vigueur, à la date de revue." : "Décision sans paiement attendu selon son type.") : "Règle 1.0.0 : paiement présenté sans comparaison au vote.",
      amendments, href: capitauxHref(scope, jr.run, "D:" + first.lineId),
    };
  });
  const excludedAfp = r.decisions.filter(d => !d.inScope).length, superseded = r.decisions.filter(d => d.status === "superseded").length, late = r.decisions.filter(d => d.inScope && postClosing(d)).length;
  return { traces, excluded: [...(excludedAfp ? [{ reason: "Lignes de décision des autres fonds propres (hors capitaux propres)", count: excludedAfp }] : []), ...(superseded ? [{ reason: "Lignes remplacées par une décision ultérieure (historique d’amendement, non comptées)", count: superseded }] : []),
    ...(late ? [{ reason: "Modifications décidées après la clôture (signal postérieur, non comptées pour l’exercice)", count: late }] : [])] };
}

/** /equity result (rule 1.0.0, « equity-result-1 » of equity-dossier): only the fields read here are validated. */
const legacyResultSchema = z.object({
  schemaVersion: z.literal("equity-result-1"), runId: z.string(),
  work: z.object({ components: z.array(z.object({ id: z.string(), label: z.string(), family: z.enum(FAMILIES) }).passthrough()) }).passthrough(),
  decisions: z.array(z.object({ id: z.string(), description: z.string(), component: z.string(), kind: z.enum(["increase", "decrease", "transfer", "none"]), decisionDate: z.string(), effectiveDate: z.string(), amount: moneySchema,
    booked: knownAmountSchema, payments: z.array(z.object({ id: z.string(), amount: moneySchema, date: z.string() }).passthrough()), statuses: z.array(z.string()),
    pv: z.object({ documentVersionId: z.string(), page: z.number().int().positive(), fileName: z.string() }).passthrough().nullable() }).passthrough()),
}).passthrough();
const KIND_LABELS = { increase: "Hausse déclarée", decrease: "Baisse déclarée", transfer: "Transfert interne déclaré", none: "Sans effet déclaré" } as const;
function equityTraces(scope: ParcoursInput["scope"], jr: JourneyRun): { traces: ParcoursTrace[]; excluded: { reason: string; count: number }[] } {
  if (!jr.run.result || jr.run.result.execution !== "completed") return { traces: [], excluded: [] };
  const parsed = legacyResultSchema.safeParse(jr.run.result.result);
  if (!parsed.success || parsed.data.runId !== jr.run.id) return { traces: [], excluded: [] };
  const r = parsed.data, period = jr.run.period;
  const traces = r.decisions.map(d => {
    const component = r.work.components.find(c => c.id === d.component), family: Family = component?.family ?? "other", pv = d.pv ? jr.pvIndex?.[d.pv.documentVersionId] : undefined;
    const signed = d.kind === "decrease" ? money(-cents(d.amount)) : d.amount;
    const payment = paymentState({ voted: d.amount, payments: d.payments.map(p => ({ id: p.id, amount: p.amount, date: p.date })), sourcePresent: !!jr.paymentsSourcePresent, applies: d.payments.length > 0, closingDate: period.closingDate, asOfDate: period.asOfDate });
    return {
      id: "equity:" + jr.run.id + ":" + d.id, procedure: "equity.review" as const, runId: jr.run.id, rootId: jr.run.rootId, revision: jr.run.revision, version: jr.run.version, ruleVersion: jr.run.template.rule?.version ?? jr.run.template.version, resultSchema: r.schemaVersion,
      stale: false, staleReasons: [], decisionRefs: [d.id], label: d.description || d.id, organ: "", type: "non_typee" as const, typeLabel: KIND_LABELS[d.kind] + " (type non qualifié par ce parcours)",
      decisionDate: d.decisionDate, effectDates: [d.effectiveDate], pv: pv && d.pv ? { sha256: pv.sha256, page: d.pv.page, fileName: pv.fileName, pieceRef: null } : null,
      reading: d.pv ? "Lecture humaine citée (pièce, version, page)" : "Aucune lecture de PV", statusLabel: d.statuses.map(s => EQUITY_STATUS[s] ?? s).join(" · ") || "Sans statut",
      effects: [{ family, familyLabel: EQUITY_FAMILY_LABELS[family], componentLabel: component?.label ?? d.component, voted: d.kind === "transfer" ? d.amount : signed, booked: d.booked, direction: d.kind === "transfer" ? "transfer" as const : "signed" as const }],
      magnitude: known(d.amount), booked: d.booked, payment,
      paymentNote: d.payments.length ? "Règlements rattachés à la décision, comparés au montant déclaré." : "Aucun règlement rattaché ; le type de décision n’est pas qualifié par ce parcours.",
      amendments: [], href: equityHref(scope, jr.run, "decision:" + d.id),
    };
  });
  return { traces, excluded: [] };
}

const PRIORITY = (t: ParcoursTrace) => (t.procedure === "capitaux_propres.review" ? (t.resultSchema === CAPITAUX_RESULT_SCHEMA_VERSION ? 0 : 1) : 2);
const byReference = (a: ParcoursTrace, b: ParcoursTrace) => PRIORITY(a) - PRIORITY(b) || (a.stale === b.stale ? 0 : a.stale ? 1 : -1) || b.revision - a.revision || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
const sameMoney = (a: KnownAmount, b: KnownAmount) => a.kind === "known" && b.kind === "known" && cents(a.value) === cents(b.value);

function decisionOf(traces: ParcoursTrace[], correspondence: ParcoursDecision["correspondence"], reason: string): ParcoursDecision {
  const sorted = [...traces].sort(byReference), ref = sorted[0], counted = correspondence !== "to_reconcile";
  const amountKnown = correspondence === "single" || correspondence === "linked_concordant";
  const notKnown: KnownAmount = correspondence === "to_reconcile" ? { kind: "unknown", reason: "Correspondance à établir : non comptée" } : { kind: "unknown", reason: "Montants ou dates divergents entre parcours : à rapprocher" };
  return { key: "decision:" + stableSha256(sorted.map(t => t.id)).slice(0, 24), correspondence, counted, reason, type: ref.type, typeLabel: ref.typeLabel, organ: ref.organ, decisionDate: ref.decisionDate,
    effectDates: [...new Set(sorted.flatMap(t => t.effectDates))].sort(), pv: ref.pv, magnitude: amountKnown ? ref.magnitude : notKnown,
    booked: amountKnown ? ref.booked : notKnown, payment: amountKnown ? ref.payment : null, effects: ref.effects, amendments: ref.amendments, reference: ref.id, traces: sorted };
}

export const PARCOURS_TRANSITION = [
  "Entrée unique du cycle : /capitaux-propres/parcours. Les deux feuilles d’origine restent accessibles à leur version exacte depuis chaque décision, avec le contexte du dossier.",
  "Travaux nouveaux : feuille /capitaux-propres (règle 1.1.0). Elle porte le registre typé des décisions (organe, résolution, PV par pièce), les amendements, le paiement par décision, la présentation des autres fonds propres et les repères légaux.",
  "Parcours historique /equity : lisible et poursuivable à sa règle 1.0.0 ; ses revues, versions et pièces restent dans ses tables (clients_*). Aucune revue n’est réécrite ni migrée.",
  "Migration éventuelle (lot ultérieur, non réalisée) : correspondance documentée equity_balances → eq_balances, equity_ledger → eq_entries, equity_variation → eq_variation, equity_decisions → eq_decisions, equity_payments → eq_payments, equity_minutes / equity_acts → eq_minutes ; identifiants et versions d’origine conservés en référence, nouvelle feuille créée en révision, jamais par écrasement.",
];

/** Minimal read response of either procedure (server state, never browser input). */
export interface JourneyReadResponse {
  runs: WorkpaperRun[]; sourcesCurrent: Record<string, boolean>; lineageCurrent?: Record<string, { id: string; version: number; revision: number }>; currentVersions?: Record<string, number>;
  imports?: { id: string; document: { id: string; documentType: string; byteHash: string; fileName: string } }[];
}
/** Sheets kept for the view: the current version of each lineage, or the exact version requested by link (flagged when not current). */
export function journeyRuns(procedure: ParcoursProcedure, read: JourneyReadResponse, exact: boolean): JourneyRun[] {
  const lineage = read.lineageCurrent ?? {};
  const runs = read.runs.filter(r => r.template.id === procedure && (exact || !lineage[r.rootId] || lineage[r.rootId].id === r.id));
  const pdfTypes = ["equity_minutes", "equity_acts"];
  const pvIndex = Object.fromEntries((read.imports ?? []).filter(b => pdfTypes.includes(b.document.documentType)).map(b => [b.document.id, { sha256: b.document.byteHash, fileName: b.document.fileName }]));
  return runs.map(run => ({ run, sourcesCurrent: read.sourcesCurrent[run.id] !== false,
    lineageCurrent: !exact || (lineage[run.rootId]?.id === run.id && (read.currentVersions?.[run.id] ?? run.version) === run.version),
    ...(procedure === "equity.review" ? { pvIndex, paymentsSourcePresent: (read.imports ?? []).some(b => run.importIds.includes(b.id) && b.document.documentType === "equity_payments") } : {}) }));
}

/** Builds the single read view. Pure and deterministic over the frozen results it receives. */
export function buildParcours(input: ParcoursInput): ParcoursView {
  const scope = input.scope, exclusions: { reason: string; count: number }[] = [];
  const all: ParcoursTrace[] = [];
  const journeys = PARCOURS_PROCEDURES.map(procedure => {
    const j = input.journeys[procedure];
    const runs = j.runs.map(jr => {
      const ruleVersion = jr.run.template.rule?.version ?? jr.run.template.version, ruleCurrent = procedure === "equity.review" || ruleVersion === CAPITAUX_RULE_VERSION;
      const extracted = procedure === "capitaux_propres.review" ? capitauxTraces(scope, jr) : equityTraces(scope, jr);
      const staleReasons = staleOf(jr, ruleCurrent);
      extracted.traces.forEach(t => all.push({ ...t, stale: staleReasons.length > 0, staleReasons }));
      exclusions.push(...extracted.excluded);
      const resultSchema = jr.run.result?.execution === "completed" ? String((jr.run.result.result as { schemaVersion?: unknown })?.schemaVersion ?? "inconnu") : null;
      return { runId: jr.run.id, rootId: jr.run.rootId, revision: jr.run.revision, version: jr.run.version, state: jr.run.state, ruleVersion, ruleCurrent, lineageCurrent: jr.lineageCurrent, sourcesCurrent: jr.sourcesCurrent,
        executed: !!resultSchema, resultSchema, decisions: extracted.traces.length,
        href: procedure === "capitaux_propres.review" ? capitauxHref(scope, jr.run) : equityHref(scope, jr.run),
        synthesisHref: procedure === "capitaux_propres.review" ? "/capitaux-propres/synthese?" + query(scope, { rootId: jr.run.rootId, id: jr.run.id, version: String(jr.run.version) }) : "/equity/synthesis?" + query(scope, { id: jr.run.id, version: String(jr.run.version) }) };
    }).sort((a, b) => a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : b.revision - a.revision);
    return { procedure, label: PARCOURS_PROCEDURE_LABELS[procedure], role: procedure === "capitaux_propres.review" ? "cible" as const : "historique" as const, availability: j.availability, code: j.code ?? null,
      note: procedure === "capitaux_propres.review" ? "Parcours cible des travaux nouveaux (règle 1.1.0)." : "Parcours historique : lisible et poursuivable, sans migration.", runs };
  });

  // Correspondence by PV identity: same bytes (SHA-256) and same page, at most one decision per sheet.
  const decisions: ParcoursDecision[] = [], used = new Set<string>();
  const clusters = new Map<string, ParcoursTrace[]>();
  for (const t of all) if (t.pv) clusters.set(t.pv.sha256 + "#" + t.pv.page, [...(clusters.get(t.pv.sha256 + "#" + t.pv.page) ?? []), t]);
  for (const traces of clusters.values()) {
    const runs = [...new Set(traces.map(t => t.runId))];
    if (runs.length === 1) continue;
    traces.forEach(t => used.add(t.id));
    if (runs.every(r => traces.filter(t => t.runId === r).length === 1)) {
      const ref = [...traces].sort(byReference)[0];
      const concordant = traces.every(t => sameMoney(t.magnitude, ref.magnitude) && t.effectDates.some(d => ref.effectDates.includes(d)));
      decisions.push(decisionOf(traces, concordant ? "linked_concordant" : "linked_divergent", concordant ? "Même PV (empreinte identique) à la même page dans plusieurs feuilles : une seule décision économique, comptée une fois."
        : "Même PV et même page, mais montant ou date d’effet différents entre feuilles : comptée une fois, montant à rapprocher."));
    } else decisions.push(decisionOf(traces, "to_reconcile", "Même PV et même page citée par plusieurs décisions d’une même feuille et par une autre feuille : correspondance à établir, aucune décision comptée."));
  }
  // A decision without a PV identity may duplicate a decision of another sheet with the same effect date: both are left to reconcile, never added twice.
  const rest = all.filter(t => !used.has(t.id));
  // Decisions without PV identity are examined first, so that a candidate of another sheet is never counted before the doubt is raised.
  for (const t of rest.filter(x => !x.pv)) {
    if (used.has(t.id)) continue;
    const candidates = rest.filter(o => o.runId !== t.runId && !used.has(o.id) && o.effectDates.some(d => t.effectDates.includes(d)));
    if (!candidates.length) continue;
    [t, ...candidates].forEach(x => used.add(x.id));
    decisions.push(decisionOf([t, ...candidates], "to_reconcile", "Décision sans PV commun et décision d’une autre feuille à la même date d’effet : doublon possible, correspondance à établir, aucune décision comptée."));
  }
  for (const t of rest) {
    if (used.has(t.id)) continue;
    used.add(t.id);
    decisions.push(decisionOf([t], "single", t.pv ? "Décision présente dans une seule feuille." : "Décision sans PV commun, sans décision d’une autre feuille à la même date d’effet."));
  }
  // Reading order: decision date, then the reference line of the decision; independent of hashes.
  decisions.sort((a, b) => a.decisionDate.localeCompare(b.decisionDate) || a.traces[0].decisionRefs[0].localeCompare(b.traces[0].decisionRefs[0]) || a.key.localeCompare(b.key));

  const counted = decisions.filter(d => d.counted);
  const sumKnown = (values: KnownAmount[], reason: string): KnownAmount => values.some(v => v.kind !== "known") ? { kind: "unknown", reason } : known(money(values.reduce((s, v) => s + cents((v as { value: Money }).value), 0n)));
  const TYPE_ORDER: string[] = [...EQ_DECISION_TYPES, "non_typee"];
  const types = [...new Set(counted.map(d => d.type))].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  const byType = types.map(type => { const members = counted.filter(d => d.type === type);
    return { type, label: type === "non_typee" ? "Non typées (parcours historique)" : EQ_DECISION_TYPE_LABELS[type as EqDecisionType], count: members.length, magnitude: sumKnown(members.map(d => d.magnitude), "Montant d’une décision à rapprocher") }; });
  const effectsByFamily = FAMILIES.map(family => { const members = counted.filter(d => d.effects.some(e => e.family === family && e.direction === "signed"));
    const unknown = members.some(d => d.correspondence === "linked_divergent");
    return { family, label: EQUITY_FAMILY_LABELS[family], decisions: members.length,
      voted: unknown ? { kind: "unknown" as const, reason: "Effet d’une décision à rapprocher" } : known(money(members.flatMap(d => d.effects.filter(e => e.family === family && e.direction === "signed")).reduce((s, e) => s + cents(e.voted), 0n))) }; })
    .filter(f => f.decisions > 0);
  const settledDecisions = counted.filter(d => d.payment && d.payment.status !== "not_applicable");
  const settlements = { decisions: settledDecisions.length, voted: sumKnown(settledDecisions.map(d => d.payment!.voted), "Vote non établi pour une décision"),
    paidAtReview: sumKnown(settledDecisions.map(d => d.payment!.paidAtReview), "Paiement inconnu pour une décision (source de règlements absente)"),
    remainingAtReview: sumKnown(settledDecisions.map(d => d.payment!.remainingAtReview), "Reste à payer inconnu pour une décision"), unpaid: settledDecisions.filter(d => d.payment!.status === "unpaid").length };
  const merged = new Map<string, number>(); exclusions.forEach(e => merged.set(e.reason, (merged.get(e.reason) ?? 0) + e.count));

  // Framing, other-equity presentation and legal markers: from the reference /capitaux-propres sheet of rule 1.1.0.
  const framingRun = input.journeys["capitaux_propres.review"].runs.filter(jr => equityResultOf(jr.run)?.schemaVersion === CAPITAUX_RESULT_SCHEMA_VERSION)
    .sort((a, b) => Number(b.lineageCurrent) - Number(a.lineageCurrent) || Number(b.sourcesCurrent) - Number(a.sourcesCurrent) || b.run.revision - a.run.revision)[0];
  const framingResult = framingRun ? equityResultOf(framingRun.run) : null;
  const framing = framingRun && framingResult?.presentation && framingResult.legal && framingResult.framing
    ? { runId: framingRun.run.id, version: framingRun.run.version, socialFormLabel: framingResult.framing.socialFormLabel, presentation: framingResult.presentation, legal: framingResult.legal } : null;

  return parcoursViewSchema.parse({
    schemaVersion: PARCOURS_SCHEMA_VERSION, scope, journeys, decisions,
    totals: { counted: counted.length, linked: decisions.filter(d => d.correspondence.startsWith("linked")).length, toReconcile: decisions.filter(d => d.correspondence === "to_reconcile").length,
      divergent: decisions.filter(d => d.correspondence === "linked_divergent").length, traces: all.length, byType, effectsByFamily, settlements,
      exclusions: [...merged].map(([reason, count]) => ({ reason, count })) },
    framing, framingReason: framing ? "Cadre, présentation et repères de la feuille /capitaux-propres en règle 1.1.0." : "Aucune feuille /capitaux-propres exécutée en règle 1.1.0 : présentation des autres fonds propres et repères légaux non établis.",
    transition: PARCOURS_TRANSITION,
    limitations: [
      "Vue en lecture seule : chaque montant provient du résultat figé d’une feuille à sa version ; aucun calcul n’est refait depuis les sources et aucune revue n’est réécrite.",
      "Deux feuilles ne désignent la même décision que si elles citent le même PV (empreinte SHA-256 identique) à la même page ; une décision n’est jamais rapprochée d’une autre par son montant.",
      "Une correspondance ambiguë est listée « à rapprocher » et exclue des totaux, plutôt que comptée deux fois.",
      "Le parcours historique ne qualifie pas le type des décisions : ses décisions seules restent « non typées ».",
      "Aucune conclusion juridique ; les repères légaux et la présentation des autres fonds propres viennent de la feuille de règle 1.1.0.",
    ],
  });
}
export { PAYMENT_STATUS_LABELS };
export type { PaymentState, AccountingPeriod };
