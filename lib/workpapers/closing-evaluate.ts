import { cents, money, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { assertionLabel, CL_CYCLE_LABELS, CL_NATURE_LABELS, CL_NO_OPINION, CL_STEP_LABELS, engineProcedure, isControl, stepsFor, type ClosingAssertion, type ClosingNature, type ClosingStep, type ResolvedCitation } from "./closing-contract";
import { bestObservation, fingerprint, type CycleObservation } from "./closing-cycles";
import { formatCents } from "./stock-contract";
import { currentValidation, isSuperseded, latestPieceVersion, procedureBasis, type ClosingEvent, type ClosingState, type Conclusion, type Contradiction, type ItgcScopeEntry, type Limitation, type Misstatement, type PopulationEntry, type Review, type ReviewPoint, type RiskEntry, type WorkRecord } from "./closing-journal";

/**
 * Derived view of the professional file. Every state is computed here, on the server, from the journal and the observed cycle sheets:
 * no automatic conclusion, no score, no opinion. Every indicator carries its denominator and its exclusions.
 */
export type ProcedureStatus = "non_applicable" | "population_absente" | "perimetre_requis" | "a_faire" | "en_cours" | "conclue" | "changements" | "perimee" | "revue"
  | "cycle_absent" | "cycle_en_cours" | "cycle_bloque" | "cycle_approuve" | "cycle_verrouille";
export const STATUS_LABELS: Record<ProcedureStatus, string> = {
  non_applicable: "Non applicable (motivée)", population_absente: "Population absente", perimetre_requis: "Périmètre et méthode requis", a_faire: "À faire", en_cours: "En cours",
  conclue: "Conclue — revue attendue", changements: "Modifications demandées", perimee: "Conclusion périmée", revue: "Revue",
  cycle_absent: "Aucune feuille de cycle", cycle_en_cours: "Feuille de cycle en cours", cycle_bloque: "Feuille de cycle bloquée", cycle_approuve: "Approuvée, verrouillage attendu", cycle_verrouille: "Feuille verrouillée",
};
export type RefKind = "file" | "risk" | "pair" | "procedure" | "request" | "point" | "misstatement" | "limitation" | "contradiction" | "cycle" | "record";
export interface RemainingItem { code: string; label: string; ref: { kind: RefKind; id: string }; procedureId?: string }
export type StepState = "absent" | "documente" | "sans_preuve" | "preuve_remplacee" | "declaration_seule";
export interface StepView { step: ClosingStep; label: string; state: StepState; recordId?: string; result?: WorkRecord["result"] }
export interface RecordView extends WorkRecord { flags: ("sans_preuve" | "preuve_remplacee" | "declaration_seule")[] }
export interface ProcedureView {
  procedureId: string; label: string; nature: ClosingNature; natureLabel: string; owner: string; riskIds: string[]; assertions: ClosingAssertion[];
  status: ProcedureStatus; statusLabel: string; applicable: boolean; concluded: boolean; done: boolean; blocked: boolean;
  engine?: { id: string; label: string; route: string; best: CycleObservation | null; all: CycleObservation[] };
  applicability?: { applicable: boolean; reason?: string; by: string; at: string; citations: ResolvedCitation[] };
  population?: PopulationEntry; itgcScope?: ItgcScopeEntry; steps: StepView[]; records: RecordView[];
  conclusion?: Conclusion & { stale: boolean }; review?: Review & { current: boolean };
  remaining: RemainingItem[]; limits: string[]; evidence: { citations: number; pieces: number; representationOnly: boolean; superseded: number };
  openPoints: string[]; misstatements: string[]; requests: string[]; updatedBy: string; updatedAt: string;
}
export interface PairView { riskId: string; assertion: ClosingAssertion; procedures: string[]; status: "aucune" | "en_cours" | "revue" | "non_applicable" }
export interface RiskView extends Omit<RiskEntry, "seq"> { cycleLabel: string; pairs: PairView[]; procedures: string[] }
export interface Segment { id: string; state: "done" | "partial" | "todo" | "blocked"; label: string }
export interface Indicator { id: string; label: string; numerator: number; denominator: number; unit: string; excluded?: string; note?: string; segments: Segment[] }
export interface MissingItem { kind: "request" | "sans_preuve" | "population_absente" | "preuve_remplacee" | "declaration_seule"; id: string; procedureId: string; label: string; detail: string; since: string; by: string }
export interface CoherencePoint { code: "CYCLE_OUTSIDE_PROGRAM" | "NA_WITH_WORK" | "MISSTATEMENT_IN_CLEAN_PROCEDURE"; label: string; refs: { kind: RefKind; id: string }[] }
export interface MisstatementSummary { total: number; corrected: number; uncorrected: number; knownCorrected: Money; knownUncorrected: Money; unknownUncorrected: number; unknownCorrected: number }
export interface ClosingEvaluation {
  opened: boolean; period?: AccountingPeriod; entity?: string; risks: RiskView[]; procedures: ProcedureView[]; indicators: Indicator[]; missing: MissingItem[]; coherence: CoherencePoint[];
  misstatements: MisstatementSummary; blockers: RemainingItem[];
  /** Recorded facts, as written in the journal (authors, dates, citations): the browser lists them, it never re-derives them. */
  items: { misstatements: Misstatement[]; limitations: Limitation[]; contradictions: Contradiction[]; reviewPoints: ReviewPoint[] }; closable: boolean; observations: CycleObservation[]; outsideProgram: CycleObservation[];
  validation: { status: "absente" | "validee" | "perimee" | "reouverte"; by?: string; at?: string; text?: string; changed: string[]; reopened?: { by: string; at: string; reason: string } };
  noOpinion: string;
}

const DONE: ProcedureStatus[] = ["revue", "cycle_verrouille"], BLOCKED: ProcedureStatus[] = ["population_absente", "perimetre_requis", "cycle_bloque"];
const add = (items: RemainingItem[], code: string, label: string, kind: RefKind, id: string, procedureId?: string) => items.push({ code, label, ref: { kind, id }, ...(procedureId ? { procedureId } : {}) });
const sum = (values: Money[]) => money(values.reduce((s, v) => s + cents(v), 0n));
const plural = (n: number, one: string, many: string) => n + " " + (n > 1 ? many : one);

function recordFlags(s: ClosingState, r: WorkRecord): RecordView["flags"] {
  const flags: RecordView["flags"] = [];
  if (!r.citations.length) flags.push("sans_preuve");
  if (r.citations.some(c => isSuperseded(s, c))) flags.push("preuve_remplacee");
  if (r.citations.length && r.citations.every(c => c.kind === "declaration_direction")) flags.push("declaration_seule");
  return flags;
}
function stepState(flags: RecordView["flags"]): StepState { return flags.includes("sans_preuve") ? "sans_preuve" : flags.includes("preuve_remplacee") ? "preuve_remplacee" : flags.includes("declaration_seule") ? "declaration_seule" : "documente"; }

function procedureView(s: ClosingState, procedureId: string, observations: CycleObservation[]): ProcedureView {
  const p = s.procedures[procedureId], remaining: RemainingItem[] = [], limits: string[] = [];
  const applicability = s.applicability[procedureId], applicable = applicability?.applicable !== false;
  const records = s.records.filter(r => r.procedureId === procedureId).map(r => ({ ...r, flags: recordFlags(s, r) }));
  const requests = Object.values(s.requests).filter(r => r.procedureId === procedureId), openRequests = requests.filter(r => !r.closed);
  const openPoints = Object.values(s.reviewPoints).filter(r => r.target.kind === "procedure" && r.target.id === procedureId && !r.closed).map(r => r.pointId);
  const misstatements = Object.values(s.misstatements).filter(m => m.procedureId === procedureId).map(m => m.misstatementId);
  const population = s.populations[procedureId], itgcScope = s.itgcScopes[procedureId];
  const conclusion = s.conclusions[procedureId], review = s.reviews[procedureId];
  const stale = !!conclusion && (procedureBasis(s, procedureId) !== conclusion.basisHash || conclusion.citations.some(c => isSuperseded(s, c)));
  const reviewCurrent = !!conclusion && !!review && !stale && review.conclusionSeq === conclusion.seq && review.basisHash === conclusion.basisHash;
  const allCitations = [...records.flatMap(r => r.citations), ...(conclusion?.citations ?? [])];
  const evidence = { citations: allCitations.length, pieces: new Set(allCitations.map(c => c.pieceId)).size, representationOnly: allCitations.length > 0 && allCitations.every(c => c.kind === "declaration_direction"),
    superseded: allCitations.filter(c => isSuperseded(s, c)).length };
  const steps: StepView[] = stepsFor(p.nature).map(step => {
    const last = records.filter(r => r.step === step).at(-1);
    return { step, label: CL_STEP_LABELS[step], state: last ? stepState(last.flags) : "absent", ...(last ? { recordId: last.recordId, result: last.result } : {}) };
  });
  let status: ProcedureStatus, engine: ProcedureView["engine"];
  if (p.nature === "engine") {
    const known = engineProcedure(p.engine!)!, { best, all } = bestObservation(observations, p.engine!);
    engine = { id: known.id, label: known.label, route: known.route, best, all };
    if (!applicable) status = "non_applicable";
    else if (!best) { status = "cycle_absent"; add(remaining, "CYCLE_ABSENT", "Aucune feuille « " + known.label + " » pour cet exercice", "procedure", procedureId, procedureId); }
    else if (best.state === "locked") status = "cycle_verrouille";
    else if (best.state === "approved") { status = "cycle_approuve"; add(remaining, "CYCLE_NOT_LOCKED", "Feuille « " + known.label + " » approuvée : verrouillage attendu", "procedure", procedureId, procedureId); }
    else if (best.state === "blocked" || best.state === "failed") { status = "cycle_bloque"; add(remaining, "CYCLE_BLOCKED", "Feuille « " + known.label + " » bloquée dans son cycle", "procedure", procedureId, procedureId); }
    else { status = "cycle_en_cours"; add(remaining, "CYCLE_IN_PROGRESS", "Feuille « " + known.label + " » à l’état « " + best.state + " » dans son cycle", "procedure", procedureId, procedureId); }
    if (best && best.state !== "locked" && best.openBlockingNotes > 0) add(remaining, "CYCLE_NOTES_OPEN", plural(best.openBlockingNotes, "point bloquant ouvert", "points bloquants ouverts") + " dans la feuille de cycle", "procedure", procedureId, procedureId);
    if (all.length > 1) limits.push(plural(all.length, "feuille", "feuilles") + " de cycle pour cette procédure : la plus avancée est retenue, les autres restent listées.");
  } else if (!applicable) status = "non_applicable";
  else {
    const control = isControl(p.nature), absent = population?.status === "absent";
    const missingSteps = steps.filter(st => st.state === "absent" && (st.step !== "test_fonctionnement" || conclusion?.reach !== "conception_mise_en_oeuvre"));
    if (p.nature === "itgc" && !itgcScope) add(remaining, "ITGC_SCOPE_REQUIRED", "Périmètre (systèmes, processus, période) et méthode ITGC à définir : une checklist ne vaut pas couverture", "procedure", procedureId, procedureId);
    if (absent) add(remaining, "POPULATION_ABSENT", "Population absente : " + (population as { reason: string }).reason, "procedure", procedureId, procedureId);
    else if (!population) add(remaining, "POPULATION_UNDEFINED", "Population à définir : sur quoi porte le travail", "procedure", procedureId, procedureId);
    if (!records.length) add(remaining, "NO_WORK", "Aucun travail documenté", "procedure", procedureId, procedureId);
    else if (control) for (const st of missingSteps) add(remaining, "STEP_MISSING", st.step === "test_fonctionnement" ? "Test de fonctionnement non réalisé" : st.label + " non documentée", "procedure", procedureId, procedureId);
    for (const r of records) {
      if (r.flags.includes("sans_preuve")) add(remaining, "RECORD_NO_EVIDENCE", r.recordId + " · " + CL_STEP_LABELS[r.step] + " sans pièce", "record", r.recordId, procedureId);
      if (r.flags.includes("preuve_remplacee")) add(remaining, "RECORD_SUPERSEDED", r.recordId + " cite une version de pièce remplacée : à réexaminer", "record", r.recordId, procedureId);
    }
    if (evidence.representationOnly) add(remaining, "REPRESENTATION_ONLY", "Preuve limitée à une déclaration de la direction : éléments corroborants requis (NEP 580 §04)", "procedure", procedureId, procedureId);
    for (const r of openRequests) add(remaining, "REQUEST_OPEN", "Pièce attendue : " + r.description + " (" + r.requestedFrom + ")", "request", r.requestId, procedureId);
    if (control && conclusion && !stale && conclusion.reach === "conception_mise_en_oeuvre") limits.push("Fonctionnement non testé : la conclusion ne porte que sur la conception et la mise en œuvre ; aucune confiance dans le fonctionnement du contrôle.");
    if (control && steps.find(st => st.step === "test_fonctionnement")?.state === "absent" && !conclusion) limits.push("Contrôle décrit, non testé : aucune confiance dans son fonctionnement tant que le test n’est pas documenté (NEP 330 §23).");
    if (p.nature === "itgc" && itgcScope) limits.push("ITGC couverts uniquement sur le périmètre déclaré : " + itgcScope.systems.join(", ") + " · " + itgcScope.processes.join(", ") + " · du " + itgcScope.from + " au " + itgcScope.to + ".");
    if (!conclusion) { add(remaining, "NOT_CONCLUDED", "Conclusion du préparateur attendue", "procedure", procedureId, procedureId); status = p.nature === "itgc" && !itgcScope ? "perimetre_requis" : absent ? "population_absente" : records.length ? "en_cours" : "a_faire"; }
    else if (stale) { add(remaining, "CONCLUSION_STALE", "Conclusion périmée : le travail, la population ou une pièce a changé depuis", "procedure", procedureId, procedureId); status = "perimee"; }
    else if (review?.decision === "changes_requested" && reviewCurrent) { add(remaining, "CHANGES_REQUESTED", "Modifications demandées par la revue : " + review.text, "procedure", procedureId, procedureId); status = "changements"; }
    else if (!reviewCurrent) { add(remaining, "NOT_REVIEWED", "Revue par une autre personne attendue", "procedure", procedureId, procedureId); status = "conclue"; }
    else status = "revue";
  }
  if (applicable) for (const id of openPoints) add(remaining, "REVIEW_POINT_OPEN", "Point de revue ouvert " + id, "point", id, procedureId);
  const concluded = p.nature === "engine" ? !!engine?.best && ["awaiting_review", "approved", "locked"].includes(engine.best.state) : !!conclusion && !stale;
  const done = applicable && DONE.includes(status) && remaining.length === 0;
  const updated = [p, applicability, population, itgcScope, conclusion, review, ...records].filter(Boolean).sort((a, b) => b!.seq - a!.seq)[0]!;
  return { procedureId, label: p.label, nature: p.nature, natureLabel: CL_NATURE_LABELS[p.nature], owner: p.owner, riskIds: p.riskIds, assertions: p.assertions, status, statusLabel: STATUS_LABELS[status],
    applicable, concluded: applicable && concluded, done, blocked: applicable && BLOCKED.includes(status), ...(engine ? { engine } : {}),
    ...(applicability ? { applicability: { applicable: applicability.applicable, ...(applicability.reason ? { reason: applicability.reason } : {}), by: applicability.by, at: applicability.at, citations: applicability.citations } } : {}),
    ...(population ? { population } : {}), ...(itgcScope ? { itgcScope } : {}), steps, records, ...(conclusion ? { conclusion: { ...conclusion, stale } } : {}), ...(review ? { review: { ...review, current: reviewCurrent } } : {}),
    remaining: applicable ? remaining : [], limits, evidence, openPoints, misstatements, requests: requests.map(r => r.requestId), updatedBy: updated.by, updatedAt: updated.at };
}

function segment(id: string, state: Segment["state"], label: string): Segment { return { id, state, label }; }
function procedureSegment(v: ProcedureView, doneWhen: (v: ProcedureView) => boolean, partialWhen: (v: ProcedureView) => boolean): Segment {
  return segment(v.procedureId, doneWhen(v) ? "done" : v.blocked ? "blocked" : partialWhen(v) ? "partial" : "todo", v.procedureId + " · " + v.label + " — " + v.statusLabel);
}

export function evaluateClosing(s: ClosingState, observations: CycleObservation[]): ClosingEvaluation {
  const procedures = Object.keys(s.procedures).sort().map(id => procedureView(s, id, observations));
  const byId = new Map(procedures.map(p => [p.procedureId, p]));
  const blockers: RemainingItem[] = [];
  if (!s.opened) add(blockers, "FILE_NOT_OPENED", "Dossier non ouvert : exercice et entité à déclarer", "file", "file");
  const risks: RiskView[] = Object.values(s.risks).sort((a, b) => a.riskId < b.riskId ? -1 : 1).map(r => {
    const linked = procedures.filter(p => p.riskIds.includes(r.riskId));
    const pairs = r.assertions.map(a => {
      const all = linked.filter(p => p.assertions.includes(a)), ps = all.filter(p => p.applicable);
      // Only procedures declared non applicable with their reason: the couple is documented as not applicable, not silently covered.
      const status: PairView["status"] = ps.some(p => p.done) ? "revue" : ps.length ? "en_cours" : all.length ? "non_applicable" : "aucune";
      return { riskId: r.riskId, assertion: a, procedures: all.map(p => p.procedureId), status };
    });
    const { seq: _seq, ...rest } = r; void _seq;
    return { ...rest, cycleLabel: CL_CYCLE_LABELS[r.cycle], pairs, procedures: linked.map(p => p.procedureId) };
  });
  if (s.opened && !risks.length) add(blockers, "PROGRAM_EMPTY", "Aucun risque au programme de travail", "file", "program");
  for (const r of risks) {
    if (!r.assessment) add(blockers, "RISK_UNASSESSED", r.riskId + " · risque non évalué (jugement à documenter)", "risk", r.riskId);
    for (const pair of r.pairs.filter(x => x.status === "aucune")) add(blockers, "PAIR_UNCOVERED", r.riskId + " · " + assertionLabel(pair.assertion) + " : aucune procédure applicable", "pair", r.riskId + ":" + pair.assertion);
  }
  for (const p of procedures) blockers.push(...p.remaining.filter(x => x.code !== "REVIEW_POINT_OPEN"));
  const points = Object.values(s.reviewPoints);
  for (const rp of points.filter(x => !x.closed)) add(blockers, "REVIEW_POINT_OPEN", rp.pointId + " · " + (rp.answers.length ? "réponse à examiner par la revue" : "réponse du préparateur attendue"), "point", rp.pointId, rp.target.kind === "procedure" ? rp.target.id : undefined);
  const contradictions = Object.values(s.contradictions);
  for (const c of contradictions.filter(x => !x.resolution)) add(blockers, "CONTRADICTION_OPEN", c.contradictionId + " · contradiction non résolue : " + c.left.label + " / " + c.right.label, "contradiction", c.contradictionId);
  const misstatements = Object.values(s.misstatements);
  for (const m of misstatements.filter(x => !x.correction && !x.assessment)) add(blockers, "MISSTATEMENT_UNASSESSED", m.misstatementId + " · anomalie non corrigée : évaluation humaine à documenter (NEP 450)", "misstatement", m.misstatementId);
  const limitations = Object.values(s.limitations);
  for (const l of limitations.filter(x => !x.assessment)) add(blockers, "LIMITATION_UNASSESSED", l.limitationId + " · limite d’étendue : incidence à apprécier par le professionnel", "limitation", l.limitationId);

  // Factual inconsistencies: computed, never resolved by the tool. They disappear only when the underlying record changes.
  const coherence: CoherencePoint[] = [];
  const linkedEngines = new Set(procedures.filter(p => p.engine).map(p => p.engine!.id));
  const outsideProgram = observations.filter(o => engineProcedure(o.procedure) && !linkedEngines.has(o.procedure as never));
  for (const o of outsideProgram) coherence.push({ code: "CYCLE_OUTSIDE_PROGRAM", label: "Feuille « " + o.label + " » (" + o.state + ", v" + o.version + ") réalisée hors programme : à rattacher à un risque et une assertion", refs: [{ kind: "cycle", id: o.runId }] });
  for (const p of procedures.filter(x => !x.applicable)) {
    const worked = p.records.length > 0 || (p.engine?.best && p.engine.best.state !== "draft");
    if (worked) coherence.push({ code: "NA_WITH_WORK", label: p.procedureId + " déclarée non applicable alors que des travaux existent", refs: [{ kind: "procedure", id: p.procedureId }] });
  }
  for (const m of misstatements) {
    const p = m.procedureId ? byId.get(m.procedureId) : null;
    if (p?.conclusion && !p.conclusion.stale && p.records.length && p.records.every(r => r.result === "sans_exception"))
      coherence.push({ code: "MISSTATEMENT_IN_CLEAN_PROCEDURE", label: m.misstatementId + " rattachée à " + p.procedureId + ", dont la conclusion repose sur des travaux sans exception relevée", refs: [{ kind: "misstatement", id: m.misstatementId }, { kind: "procedure", id: p.procedureId }] });
  }
  for (const c of coherence) add(blockers, c.code, c.label, c.refs[0].kind, c.refs[0].id);

  // Missing pieces queue, oldest first.
  const missing: MissingItem[] = [];
  for (const r of Object.values(s.requests).filter(x => !x.closed && byId.get(x.procedureId)?.applicable)) missing.push({ kind: "request", id: r.requestId, procedureId: r.procedureId, label: r.description, detail: "Demandée à " + r.requestedFrom, since: r.at, by: r.by });
  for (const p of procedures.filter(x => x.applicable)) {
    if (p.population?.status === "absent") missing.push({ kind: "population_absente", id: p.procedureId + ":population", procedureId: p.procedureId, label: "Population absente", detail: p.population.reason, since: p.population.at, by: p.population.by });
    for (const r of p.records) {
      if (r.flags.includes("sans_preuve")) missing.push({ kind: "sans_preuve", id: r.recordId, procedureId: p.procedureId, label: r.recordId + " · " + CL_STEP_LABELS[r.step] + " sans pièce", detail: r.object, since: r.at, by: r.by });
      for (const c of r.citations.filter(c => isSuperseded(s, c))) missing.push({ kind: "preuve_remplacee", id: r.recordId + ":" + c.pieceVersionId, procedureId: p.procedureId, label: c.label + " v" + c.version + " remplacée par v" + latestPieceVersion(s, c.pieceId)!.version, detail: r.recordId + " à réexaminer", since: latestPieceVersion(s, c.pieceId)!.at, by: r.by });
    }
    if (p.evidence.representationOnly) missing.push({ kind: "declaration_seule", id: p.procedureId + ":representation", procedureId: p.procedureId, label: "Éléments corroborant la déclaration de la direction", detail: "Seule pièce citée : une déclaration de la direction", since: p.records.at(-1)?.at ?? p.updatedAt, by: p.records.at(-1)?.by ?? p.updatedBy });
  }
  missing.sort((a, b) => a.since < b.since ? -1 : a.since > b.since ? 1 : a.id < b.id ? -1 : 1);

  const applicable = procedures.filter(p => p.applicable), na = procedures.length - applicable.length;
  const controls = applicable.filter(p => p.nature === "controle_interne" || p.nature === "itgc"), itgc = applicable.filter(p => p.nature === "itgc"), engines = applicable.filter(p => p.nature === "engine");
  const stepDone = (p: ProcedureView, step: ClosingStep) => p.steps.find(x => x.step === step)?.state === "documente";
  const allPairs = risks.flatMap(r => r.pairs), pairs = allPairs.filter(x => x.status !== "non_applicable"), naPairs = allPairs.length - pairs.length;
  const requests = Object.values(s.requests), activeRequests = requests.filter(r => r.closed?.outcome !== "cancelled"), cancelled = requests.length - activeRequests.length;
  const naNote = na ? plural(na, "procédure non applicable motivée exclue", "procédures non applicables motivées exclues") : undefined;
  const indicators: Indicator[] = [
    { id: "revues", label: "Procédures conclues et revues", numerator: applicable.filter(p => p.done).length, denominator: applicable.length, unit: "procédures applicables", ...(naNote ? { excluded: naNote } : {}),
      segments: applicable.map(p => procedureSegment(p, v => v.done, v => v.concluded)) },
    { id: "conclues", label: "Procédures conclues par le préparateur", numerator: applicable.filter(p => p.concluded).length, denominator: applicable.length, unit: "procédures applicables", ...(naNote ? { excluded: naNote } : {}),
      segments: applicable.map(p => procedureSegment(p, v => v.concluded, v => v.records.length > 0 || v.status === "cycle_en_cours")) },
    { id: "paires", label: "Couples risque × assertion avec une procédure revue", numerator: pairs.filter(x => x.status === "revue").length, denominator: pairs.length, unit: "couples risque × assertion", ...(naPairs ? { excluded: plural(naPairs, "couple couvert seulement par des procédures non applicables motivées", "couples couverts seulement par des procédures non applicables motivées") } : {}),
      note: "N’établit pas que le risque est suffisamment couvert : ce caractère suffisant relève du jugement.", segments: pairs.map(x => segment(x.riskId + ":" + x.assertion, x.status === "revue" ? "done" : x.status === "en_cours" ? "partial" : "blocked", x.riskId + " · " + assertionLabel(x.assertion) + " — " + ({ revue: "procédure revue", en_cours: "procédure en cours", aucune: "aucune procédure", non_applicable: "non applicable" } as const)[x.status])) },
    ...(["description", "mise_en_oeuvre", "test_fonctionnement"] as const).map(step => ({ id: "controles_" + step, label: "Contrôles : " + CL_STEP_LABELS[step].toLowerCase(), numerator: controls.filter(p => stepDone(p, step)).length, denominator: controls.length,
      unit: "contrôles internes et ITGC applicables", segments: controls.map(p => procedureSegment(p, v => stepDone(v, step), v => (v.steps.find(x => x.step === step)?.state ?? "absent") !== "absent")) })),
    { id: "itgc", label: "ITGC avec périmètre et méthode définis", numerator: itgc.filter(p => !!p.itgcScope).length, denominator: itgc.length, unit: "procédures ITGC applicables", segments: itgc.map(p => procedureSegment(p, v => !!v.itgcScope, () => false)) },
    { id: "cycles", label: "Feuilles de cycle verrouillées", numerator: engines.filter(p => p.status === "cycle_verrouille").length, denominator: engines.length, unit: "feuilles outillées au programme",
      note: "Une feuille verrouillée ne couvre que sa procédure : elle ne vaut ni audit du cycle ni dossier complet.", segments: engines.map(p => procedureSegment(p, v => v.status === "cycle_verrouille", v => v.status !== "cycle_absent")) },
    { id: "pieces", label: "Pièces demandées reçues", numerator: activeRequests.filter(r => r.closed?.outcome === "received").length, denominator: activeRequests.length, unit: "demandes de pièces",
      ...(cancelled ? { excluded: plural(cancelled, "demande annulée motivée exclue", "demandes annulées motivées exclues") } : {}), segments: activeRequests.map(r => segment(r.requestId, r.closed ? "done" : "todo", r.requestId + " · " + r.description)) },
    { id: "points", label: "Points de revue clos", numerator: points.filter(x => x.closed).length, denominator: points.length, unit: "points de revue", segments: points.map(x => segment(x.pointId, x.closed ? "done" : x.answers.length ? "partial" : "todo", x.pointId + " · " + x.text)) },
    { id: "contradictions", label: "Contradictions résolues", numerator: contradictions.filter(x => x.resolution).length, denominator: contradictions.length, unit: "contradictions déclarées", segments: contradictions.map(x => segment(x.contradictionId, x.resolution ? "done" : "blocked", x.contradictionId + " · " + x.description)) },
    { id: "anomalies", label: "Anomalies corrigées", numerator: misstatements.filter(m => m.correction).length, denominator: misstatements.length, unit: "anomalies relevées",
      note: "Corrigée = correction documentée par une preuve nouvelle ; une anomalie non corrigée n’est ni acceptée ni jugée par l’outil.", segments: misstatements.map(m => segment(m.misstatementId, m.correction ? "done" : m.assessment ? "partial" : "todo", m.misstatementId + " · " + m.description)) },
    { id: "limites", label: "Limites d’étendue appréciées", numerator: limitations.filter(l => l.assessment).length, denominator: limitations.length, unit: "limites d’étendue", segments: limitations.map(l => segment(l.limitationId, l.assessment ? "done" : "todo", l.limitationId + " · " + l.description)) },
  ];
  const known = (list: typeof misstatements) => list.filter(m => m.amount.kind === "known").map(m => (m.amount as { value: Money }).value);
  const corrected = misstatements.filter(m => m.correction), uncorrected = misstatements.filter(m => !m.correction);
  const summary: MisstatementSummary = { total: misstatements.length, corrected: corrected.length, uncorrected: uncorrected.length, knownCorrected: sum(known(corrected)), knownUncorrected: sum(known(uncorrected)),
    unknownUncorrected: uncorrected.filter(m => m.amount.kind === "unknown").length, unknownCorrected: corrected.filter(m => m.amount.kind === "unknown").length };

  const current = currentValidation(s), last = s.validations.at(-1);
  let validation: ClosingEvaluation["validation"] = { status: "absente", changed: [] };
  if (current) {
    const now = new Map(observations.map(o => [o.runId, fingerprint(o)])), changed: string[] = [];
    for (const f of current.cycles) { const n = now.get(f.runId); if (!n || n.version !== f.version || n.state !== f.state || n.contentHash !== f.contentHash) changed.push(f.procedure + " (" + f.runId + ")"); }
    for (const o of observations.filter(x => engineProcedure(x.procedure))) if (!current.cycles.some(f => f.runId === o.runId)) changed.push(o.procedure + " (" + o.runId + ", nouvelle feuille)");
    validation = { status: changed.length ? "perimee" : "validee", by: current.by, at: current.at, text: current.text, changed };
    if (changed.length) add(blockers, "VALIDATION_STALE", "Validation de clôture périmée : " + changed.join(", ") + " a changé depuis", "file", "validation");
  } else if (last?.reopened) validation = { status: "reouverte", by: last.by, at: last.at, text: last.text, changed: [], reopened: { by: last.reopened.by, at: last.reopened.at, reason: last.reopened.reason } };

  return { opened: !!s.opened, ...(s.opened ? { period: s.opened.period, entity: s.opened.entity } : {}), risks, procedures, indicators, missing, coherence, misstatements: summary, blockers,
    items: { misstatements, limitations, contradictions, reviewPoints: points },
    closable: !!s.opened && blockers.length === 0, observations, outsideProgram, validation, noOpinion: CL_NO_OPINION };
}

/** Euro text of a known amount; an unknown amount is shown as unknown with its reason, never as zero. */
export const amountText = (a: { kind: "known"; value: Money } | { kind: "unknown"; reason: string }) => a.kind === "known" ? formatCents(cents(a.value).toString()) : "Montant inconnu — " + a.reason;
export interface JournalLine { seq: number; at: string; actorId: string; type: ClosingEvent["type"]; label: string; procedureId?: string; hash: string }
/** Who did what, when, on what: one readable line per journal event, with its local chain hash. */
export function journalView(events: ClosingEvent[]): JournalLine[] {
  return events.map(e => {
    const p = e.payload as Record<string, never>, cite = (list: ResolvedCitation[] = []) => list.length ? " — " + list.map(c => c.label + " v" + c.version).join(", ") : " — sans pièce";
    const label = ((): string => {
      switch (e.type) {
        case "open": return "Ouverture du dossier " + p.entity + ", exercice du " + (p.period as AccountingPeriod).startDate + " au " + (p.period as AccountingPeriod).closingDate;
        case "set_risk": return "Risque " + p.riskId + " défini : " + p.label + ((p.assessment as unknown) ? "" : " (non évalué)");
        case "set_procedure": return "Procédure " + p.procedureId + " définie : " + p.label + " — responsable " + p.owner;
        case "set_population": { const pop = p.population as { status: string; description?: string; reason?: string }; return "Population de " + p.procedureId + (pop.status === "absent" ? " absente : " + pop.reason : " : " + pop.description); }
        case "set_applicability": return p.procedureId + (p.applicable ? " déclarée applicable" : " déclarée non applicable : " + p.reason);
        case "set_itgc_scope": return "Périmètre ITGC de " + p.procedureId + " : " + (p.systems as string[]).join(", ") + " · " + (p.processes as string[]).join(", ") + " · du " + p.from + " au " + p.to;
        case "record_work": return p.recordId + " · " + CL_STEP_LABELS[p.step as ClosingStep] + " réalisé le " + p.performedOn + " sur " + p.object + " — " + ({ sans_exception: "sans exception relevée", exceptions: "exceptions relevées", non_concluant: "non concluant" } as Record<string, string>)[p.result] + cite(p.citations);
        case "request_piece": return p.requestId + " · pièce demandée à " + p.requestedFrom + " : " + p.description;
        case "close_piece_request": return p.requestId + (p.outcome === "received" ? " reçue" + cite([p.piece]) : " annulée : " + p.reason);
        case "upload_piece": return "Pièce déposée : " + p.label + " v" + p.version + " (" + p.fileName + ", empreinte " + String(p.sha256).slice(0, 12) + "…)";
        case "conclude_procedure": return p.procedureId + " conclue par le préparateur" + cite(p.citations);
        case "review_procedure": return p.procedureId + " revue : " + (p.decision === "approved" ? "approuvée" : "modifications demandées");
        case "raise_review_point": { const t = p.target as { kind: string; id?: string }; return p.pointId + " levé sur " + (t.kind === "dossier" ? "le dossier" : t.id) + " : " + p.text; }
        case "answer_review_point": return "Réponse au " + p.pointId + cite(p.citations);
        case "close_review_point": return p.pointId + " clos : " + p.text;
        case "record_misstatement": return p.misstatementId + " relevée : " + p.description + " — " + amountText(p.amount) + cite(p.citations);
        case "correct_misstatement": return p.misstatementId + " corrigée" + cite(p.citations);
        case "assess_misstatement": return p.misstatementId + " non corrigée : appréciation documentée";
        case "record_limitation": return p.limitationId + " · limite d’étendue : " + p.description;
        case "assess_limitation": return p.limitationId + " · incidence appréciée";
        case "record_contradiction": return p.contradictionId + " · contradiction : " + (p.left as ResolvedCitation).label + " / " + (p.right as ResolvedCitation).label;
        case "resolve_contradiction": return p.contradictionId + " résolue" + cite(p.citations);
        case "validate_closing": return "Validation de clôture enregistrée par un professionnel habilité (décision humaine, pas une opinion)";
        case "reopen": return "Dossier rouvert : " + p.reason;
      }
    })();
    const procedureId = typeof p.procedureId === "string" ? p.procedureId as string : (p.target as { kind?: string; id?: string } | undefined)?.kind === "procedure" ? (p.target as { id: string }).id : undefined;
    return { seq: e.seq, at: e.at, actorId: e.actorId, type: e.type, label, ...(procedureId ? { procedureId } : {}), hash: e.hash.slice(0, 12) };
  });
}
