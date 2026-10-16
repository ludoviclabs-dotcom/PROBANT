import { cents, money, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { assertionLabel, CL_CYCLE_LABELS, CL_MILESTONE_LABELS, CL_NATURE_LABELS, CL_NO_OPINION, CL_PERSONAL_NOTICE, CL_STEP_LABELS, CL_THRESHOLD_LABELS, CL_THRESHOLD_NOTICE, CL_THRESHOLD_SOURCES, engineProcedure, isControl, stepsFor,
  type ClosingAssertion, type ClosingMilestone, type ClosingNature, type ClosingStep, type ClosingThreshold, type ResolvedCitation } from "./closing-contract";
import { fingerprintChanged, sheetLineages, type CycleObservation, type SheetLineage } from "./closing-cycles";
import { formatCents } from "./stock-contract";
import { correctionCurrent, currentValidation, exclusionKey, isSuperseded, resolutionCurrent, latestPieceVersion, procedureBasis, type Attribution, type ClosingEvent, type ClosingState, type Conclusion, type Contradiction, type ItgcScopeEntry, type Limitation, type Misstatement, type PopulationEntry, type Review, type ReviewPoint, type RiskEntry, type WorkRecord } from "./closing-journal";

/**
 * Derived view of the professional file. Every state is computed here, on the server, from the journal and the observed cycle sheets:
 * no automatic conclusion, no score, no opinion. Every indicator carries its denominator and its exclusions.
 * C14: one sheet lineage per programme procedure (explicit binding, implicit only for a single lineage), one set of denominators shared by the matrix,
 * the cockpit and the export, a named personal review kept apart from a review by another person, and misstatement stages in the C05 vocabulary.
 */
export type ProcedureStatus = "non_applicable" | "population_absente" | "perimetre_requis" | "a_faire" | "en_cours" | "conclue" | "changements" | "perimee" | "revue" | "revue_personnelle"
  | "cycle_absent" | "cycle_a_rattacher" | "cycle_en_cours" | "cycle_bloque" | "cycle_source_remplacee" | "cycle_approuve" | "cycle_verrouille";
export const STATUS_LABELS: Record<ProcedureStatus, string> = {
  non_applicable: "Non applicable (motivée)", population_absente: "Population absente", perimetre_requis: "Périmètre et méthode requis", a_faire: "À faire", en_cours: "En cours",
  conclue: "Conclue — revue attendue", changements: "Modifications demandées", perimee: "Conclusion périmée", revue: "Revue", revue_personnelle: "Relue — relecture personnelle nommée",
  cycle_absent: "Aucune feuille de cycle", cycle_a_rattacher: "Feuille à rattacher", cycle_en_cours: "Feuille de cycle en cours", cycle_bloque: "Feuille de cycle bloquée",
  cycle_source_remplacee: "Source remplacée depuis le gel", cycle_approuve: "Approuvée, verrouillage attendu", cycle_verrouille: "Feuille verrouillée",
};
export type RefKind = "file" | "risk" | "pair" | "procedure" | "request" | "point" | "misstatement" | "limitation" | "contradiction" | "cycle" | "record" | "threshold";
export interface RemainingItem { code: string; label: string; ref: { kind: RefKind; id: string }; procedureId?: string }
export type StepState = "absent" | "documente" | "sans_preuve" | "preuve_remplacee" | "declaration_seule";
export interface StepView { step: ClosingStep; label: string; state: StepState; recordId?: string; result?: WorkRecord["result"] }
export interface RecordView extends WorkRecord { flags: ("sans_preuve" | "preuve_remplacee" | "declaration_seule")[] }
/** Who the review rests on: another identity, a named personal review (solo), a simulation (never a review), or nothing yet. */
export type ReviewBasis = "autre_personne" | "personnelle" | "simulation" | null;
export type LineageAssignment = "retenue" | "a_rattacher" | "ecartee" | "hors_programme";
export interface LineageView { procedure: string; label: string; route: string | null; rootId: string; current: CycleObservation; previous: CycleObservation[]; assignment: LineageAssignment; procedureId?: string;
  binding?: "explicite" | "implicite"; exclusion?: { reason: string; by: string; at: string; revision: number } }
export interface BindingView { mode: "explicite" | "implicite" | "aucun"; rootId?: string; perimeter?: string; by?: string; at?: string;
  recorded?: { runId: string; revision: number; version: number; contentHash: string; populationHash: string | null; populationSize: number | null; period: { startDate: string; closingDate: string }; entity: string; exercise: { startDate: string; closingDate: string } };
  drift: null | "revisee" | "population" | "introuvable" }
export interface ProcedureView {
  procedureId: string; label: string; nature: ClosingNature; natureLabel: string; owner: string; riskIds: string[]; assertions: ClosingAssertion[];
  status: ProcedureStatus; statusLabel: string; applicable: boolean; concluded: boolean;
  /** Concluded and reviewed by another person (or a sheet locked after such a review), nothing remaining: the professional count. */
  done: boolean;
  /** Same, a named personal review being accepted (solo mode): never counted as `done`. */
  donePersonal: boolean; reviewBasis: ReviewBasis; blocked: boolean;
  engine?: { id: string; label: string; route: string; retained: CycleObservation | null; binding: BindingView; lineages: LineageView[]; resultLabel: string | null };
  applicability?: { applicable: boolean; reason?: string; by: string; at: string; citations: ResolvedCitation[] };
  population?: PopulationEntry; itgcScope?: ItgcScopeEntry; steps: StepView[]; records: RecordView[];
  results: { sans_exception: number; exceptions: number; non_concluant: number };
  conclusion?: Conclusion & { stale: boolean }; review?: Review & { current: boolean };
  remaining: RemainingItem[]; limits: string[]; evidence: { citations: number; pieces: number; representationOnly: boolean; superseded: number };
  openPoints: string[]; misstatements: string[]; contradictions: string[]; requests: string[]; updatedBy: string; updatedAt: string;
}
export type PairStatus = "aucune" | "en_cours" | "relue" | "revue" | "non_applicable";
export interface PairView { riskId: string; assertion: ClosingAssertion; procedures: string[]; status: PairStatus }
export interface RiskView extends Omit<RiskEntry, "seq"> { cycleLabel: string; pairs: PairView[]; procedures: string[] }
export interface Segment { id: string; state: "done" | "partial" | "todo" | "blocked"; label: string }
export interface Indicator { id: string; label: string; numerator: number; denominator: number; unit: string; excluded?: string; note?: string; segments: Segment[] }
export interface MissingItem { kind: "request" | "sans_preuve" | "population_absente" | "preuve_remplacee" | "declaration_seule"; id: string; procedureId: string; label: string; detail: string; since: string; by: string }
export interface CoherencePoint { code: "CYCLE_OUTSIDE_PROGRAM" | "SHEET_UNASSIGNED" | "NA_WITH_WORK" | "MISSTATEMENT_IN_CLEAN_PROCEDURE" | "THRESHOLD_ORDER"; label: string; refs: { kind: RefKind; id: string }[] }
export interface MisstatementSummary { total: number; corrected: number; uncorrected: number; partial: number; knownCorrected: Money; knownUncorrected: Money; knownResidual: Money; unknownUncorrected: number; unknownCorrected: number }
/** C05 vocabulary: pending, corrected (full or partial, with new evidence), residual; a correction resting on a replaced piece is to be re-examined. */
export type MisstatementStage = "en_attente" | "appreciee" | "corrigee" | "corrigee_partiellement" | "correction_a_reexaminer";
export const MISSTATEMENT_STAGE_LABELS: Record<MisstatementStage, string> = { en_attente: "Non corrigée — appréciation attendue", appreciee: "Non corrigée — appréciée (anomalie résiduelle)", corrigee: "Corrigée — preuve nouvelle",
  corrigee_partiellement: "Corrigée partiellement — reste résiduel", correction_a_reexaminer: "Correction à réexaminer — pièce remplacée" };
export interface MisstatementView { misstatementId: string; procedureId?: string; cycle: string; description: string; amount: Misstatement["amount"]; stage: MisstatementStage; stageLabel: string;
  detected: Money | null; corrected: Money | null; residual: Money | null; residualUnknown: boolean; freshEvidence: ResolvedCitation[]; originalEvidence: ResolvedCitation[]; assessedBy: ReviewBasis }
export type ContradictionStatus = "ouverte" | "resolue" | "resolution_a_reexaminer";
export interface ContradictionView { contradictionId: string; description: string; status: ContradictionStatus; procedureIds: string[]; representationSide: boolean;
  /** Management representations received after the contradiction: listed, they never resolve it on their own. */
  laterRepresentations: string[] }
export interface DateItem { id: string; label: string; date: string; source: "exercice" | "journal" | "feuille" | "declaree"; by?: string; detail?: string }
export interface ThresholdView { threshold: ClosingThreshold; label: string; source: string; amount: Misstatement["amount"]; basis?: string; rate?: string; rationale: string; citations: ResolvedCitation[]; by: string; at: string }
/** The single set of counts: indicators, the coverage matrix, the cockpit and the export all read it (C14). */
export interface Denominators {
  procedures: { declared: number; applicable: number; notApplicable: number; done: number; donePersonal: number; concluded: number };
  pairs: { declared: number; counted: number; excludedNotApplicable: number; reviewed: number; reviewedPersonal: number; inProgress: number; uncovered: number };
  engines: { applicable: number; locked: number; lockedPersonal: number; toBind: number };
  sheets: { lineages: number; retained: number; toAssign: number; excluded: number; outsideProgram: number; previousRevisions: number; inconclusiveRetained: number; sourcesReplaced: number };
}
export interface ClosingEvaluation {
  opened: boolean; period?: AccountingPeriod; entity?: string; risks: RiskView[]; procedures: ProcedureView[]; indicators: Indicator[]; denominators: Denominators; missing: MissingItem[]; coherence: CoherencePoint[];
  misstatements: MisstatementSummary; blockers: RemainingItem[];
  /** Items satisfied only by a named personal review (solo): the conditions of a professional review stay distinct and unmet. */
  professionalGaps: RemainingItem[];
  /** Recorded facts, as written in the journal (authors, dates, citations): the browser lists them, it never re-derives them. */
  items: { misstatements: Misstatement[]; limitations: Limitation[]; contradictions: Contradiction[]; reviewPoints: ReviewPoint[]; staleCorrections: string[]; staleResolutions: string[]; cancelledRequests: { requestId: string; description: string; reason: string }[] };
  findings: { misstatements: MisstatementView[]; contradictions: ContradictionView[] };
  closable: boolean; observations: CycleObservation[]; sheets: LineageView[]; outsideProgram: CycleObservation[];
  validation: { status: "absente" | "validee" | "perimee" | "reouverte"; by?: string; at?: string; text?: string; changed: string[]; reopened?: { by: string; at: string; reason: string } };
  personal: { status: "absent" | "marque" | "perime"; by?: string; at?: string; reviewerName?: string; text?: string; limits: { code: string; label: string }[]; changed: string[]; notice: string };
  dates: DateItem[]; thresholds: ThresholdView[]; thresholdNotice: string;
  noOpinion: string;
}

const BLOCKED: ProcedureStatus[] = ["population_absente", "perimetre_requis", "cycle_bloque", "cycle_a_rattacher", "cycle_source_remplacee"];
const add = (items: RemainingItem[], code: string, label: string, kind: RefKind, id: string, procedureId?: string) => items.push({ code, label, ref: { kind, id }, ...(procedureId ? { procedureId } : {}) });
const sum = (values: Money[]) => money(values.reduce((s, v) => s + cents(v), 0n));
const plural = (n: number, one: string, many: string) => n + " " + (n > 1 ? many : one);
const basisOf = (a: Attribution | undefined | null): ReviewBasis => !a ? null : a.kind === "personal" ? "personnelle" : a.kind === "simulated_second_identity" ? "simulation" : "autre_personne";
const OUTCOME_LABELS: Record<string, string> = { no_exception_detected: "Aucune exception sur le périmètre testé", exceptions_detected: "Exceptions relevées et conservées", inconclusive: "Résultat non concluant" };

function recordFlags(s: ClosingState, r: WorkRecord): RecordView["flags"] {
  const flags: RecordView["flags"] = [];
  if (!r.citations.length) flags.push("sans_preuve");
  if (r.citations.some(c => isSuperseded(s, c))) flags.push("preuve_remplacee");
  if (r.citations.length && r.citations.every(c => c.kind === "declaration_direction")) flags.push("declaration_seule");
  return flags;
}
function stepState(flags: RecordView["flags"]): StepState { return flags.includes("sans_preuve") ? "sans_preuve" : flags.includes("preuve_remplacee") ? "preuve_remplacee" : flags.includes("declaration_seule") ? "declaration_seule" : "documente"; }

/**
 * Which sheet lineage a programme procedure covers. An explicit binding names a root; without one, a single lineage observed by a single procedure is taken implicitly.
 * Several lineages (populations, perimeters) are never resolved by picking the most advanced state: the binding is required.
 */
function selectLineage(s: ClosingState, procedureId: string, engine: string, lineages: SheetLineage[], sharing: number): { lineage: SheetLineage | null; binding: BindingView } {
  const b = s.bindings[procedureId];
  if (b && b.engine === engine) {
    const lineage = lineages.find(l => l.rootId === b.rootId) ?? null;
    const drift = !lineage ? "introuvable" as const : lineage.current.runId !== b.runId ? "revisee" as const : lineage.current.populationHash !== b.populationHash ? "population" as const : null;
    return { lineage, binding: { mode: "explicite", rootId: b.rootId, perimeter: b.perimeter, by: b.by, at: b.at, drift,
      recorded: { runId: b.runId, revision: b.revision, version: b.version, contentHash: b.contentHash, populationHash: b.populationHash, populationSize: b.populationSize, period: { startDate: b.period.startDate, closingDate: b.period.closingDate }, entity: b.entity, exercise: b.exercise } } };
  }
  if (lineages.length === 1 && sharing === 1) return { lineage: lineages[0], binding: { mode: "implicite", rootId: lineages[0].rootId, drift: null } };
  return { lineage: null, binding: { mode: "aucun", drift: null } };
}

function procedureView(s: ClosingState, procedureId: string, lineages: SheetLineage[], sharingByEngine: Map<string, number>): ProcedureView {
  const p = s.procedures[procedureId], remaining: RemainingItem[] = [], limits: string[] = [];
  const applicability = s.applicability[procedureId], applicable = applicability?.applicable !== false;
  const records = s.records.filter(r => r.procedureId === procedureId).map(r => ({ ...r, flags: recordFlags(s, r) }));
  const requests = Object.values(s.requests).filter(r => r.procedureId === procedureId), openRequests = requests.filter(r => !r.closed);
  const openPoints = Object.values(s.reviewPoints).filter(r => r.target.kind === "procedure" && r.target.id === procedureId && !r.closed).map(r => r.pointId);
  const misstatements = Object.values(s.misstatements).filter(m => m.procedureId === procedureId).map(m => m.misstatementId);
  const contradictions = Object.values(s.contradictions).filter(c => c.procedureIds.includes(procedureId)).map(c => c.contradictionId);
  const population = s.populations[procedureId], itgcScope = s.itgcScopes[procedureId];
  const conclusion = s.conclusions[procedureId], review = s.reviews[procedureId];
  const stale = !!conclusion && (procedureBasis(s, procedureId) !== conclusion.basisHash || conclusion.citations.some(c => isSuperseded(s, c)));
  const reviewCurrent = !!conclusion && !!review && !stale && review.conclusionSeq === conclusion.seq && review.basisHash === conclusion.basisHash;
  const allCitations = [...records.flatMap(r => r.citations), ...(conclusion?.citations ?? [])];
  const evidence = { citations: allCitations.length, pieces: new Set(allCitations.map(c => c.pieceId)).size, representationOnly: allCitations.length > 0 && allCitations.every(c => c.kind === "declaration_direction"),
    superseded: allCitations.filter(c => isSuperseded(s, c)).length };
  const results = { sans_exception: records.filter(r => r.result === "sans_exception").length, exceptions: records.filter(r => r.result === "exceptions").length, non_concluant: records.filter(r => r.result === "non_concluant").length };
  const steps: StepView[] = stepsFor(p.nature).map(step => {
    const last = records.filter(r => r.step === step).at(-1);
    return { step, label: CL_STEP_LABELS[step], state: last ? stepState(last.flags) : "absent", ...(last ? { recordId: last.recordId, result: last.result } : {}) };
  });
  let status: ProcedureStatus, engine: ProcedureView["engine"], reviewBasis: ReviewBasis = null;
  if (p.nature === "engine") {
    const known = engineProcedure(p.engine!)!, mine = lineages.filter(l => l.procedure === p.engine);
    const { lineage, binding } = selectLineage(s, procedureId, p.engine!, mine, sharingByEngine.get(p.engine!) ?? 0);
    const retained = lineage && !binding.drift ? lineage.current : null;
    const resultLabel = retained ? (retained.outcome ? OUTCOME_LABELS[retained.outcome] ?? retained.outcome : retained.execution === "blocked" ? "Calcul bloqué" : "Non exécutée") : null;
    engine = { id: known.id, label: known.label, route: known.route, retained, binding, lineages: [], resultLabel };
    if (!applicable) status = "non_applicable";
    else if (binding.drift === "introuvable") { status = "cycle_a_rattacher"; add(remaining, "SHEET_BOUND_MISSING", "Feuille rattachée (racine " + binding.rootId + ") introuvable dans le cycle : rattacher la feuille courante", "procedure", procedureId, procedureId); }
    else if (binding.drift === "revisee") { status = "cycle_a_rattacher"; add(remaining, "SHEET_REVISED", "Feuille « " + known.label + " » révisée depuis le rattachement (r" + binding.recorded!.revision + " → r" + lineage!.current.revision + ") : confirmer le rattachement de la nouvelle révision et de sa population", "procedure", procedureId, procedureId); }
    else if (binding.drift === "population") { status = "cycle_a_rattacher"; add(remaining, "SHEET_POPULATION_CHANGED", "Population de la feuille « " + known.label + " » modifiée depuis le rattachement : confirmer le périmètre couvert", "procedure", procedureId, procedureId); }
    else if (!retained && !mine.length) { status = "cycle_absent"; add(remaining, "CYCLE_ABSENT", "Aucune feuille « " + known.label + " » pour cet exercice", "procedure", procedureId, procedureId); }
    else if (!retained) { status = "cycle_a_rattacher"; add(remaining, "SHEET_BINDING_REQUIRED", plural(mine.length, "feuille", "feuilles") + " « " + known.label + " »" + ((sharingByEngine.get(p.engine!) ?? 0) > 1 ? " observée(s) par plusieurs procédures du programme" : "") + " : rattacher celle que couvre cette procédure (l’état le plus avancé ne sélectionne pas une population)", "procedure", procedureId, procedureId); }
    else if (retained.sourcesCurrent === false) { status = "cycle_source_remplacee"; add(remaining, "CYCLE_SOURCE_REPLACED", "Source de la feuille « " + known.label + " » remplacée ou ajoutée depuis le gel : révision requise dans le cycle", "procedure", procedureId, procedureId); }
    else if (retained.state === "locked") status = "cycle_verrouille";
    else if (retained.state === "approved") { status = "cycle_approuve"; add(remaining, "CYCLE_NOT_LOCKED", "Feuille « " + known.label + " » approuvée : verrouillage attendu", "procedure", procedureId, procedureId); }
    else if (retained.state === "blocked" || retained.state === "failed") { status = "cycle_bloque"; add(remaining, "CYCLE_BLOCKED", "Feuille « " + known.label + " » bloquée dans son cycle", "procedure", procedureId, procedureId); }
    else { status = "cycle_en_cours"; add(remaining, "CYCLE_IN_PROGRESS", "Feuille « " + known.label + " » à l’état « " + retained.state + " » dans son cycle", "procedure", procedureId, procedureId); }
    if (retained && retained.state !== "locked" && retained.openBlockingNotes > 0) add(remaining, "CYCLE_NOTES_OPEN", plural(retained.openBlockingNotes, "point bloquant ouvert", "points bloquants ouverts") + " dans la feuille de cycle", "procedure", procedureId, procedureId);
    if (retained && ["locked", "approved"].includes(retained.state)) {
      reviewBasis = basisOf(retained.approval);
      if (reviewBasis === "simulation") add(remaining, "CYCLE_SIMULATED_REVIEW", "Feuille « " + known.label + " » approuvée par une seconde identité simulée : ne vaut pas relecture", "procedure", procedureId, procedureId);
    }
    if (retained?.outcome === "inconclusive") limits.push("Feuille " + (retained.state === "locked" ? "verrouillée" : "courante") + " avec un résultat non concluant : le verrouillage ne le rend pas concluant.");
    if (binding.mode === "implicite") limits.push("Rattachement implicite : une seule feuille « " + known.label + " » observée ; une nouvelle population exigera un rattachement explicite.");
    const lockedBefore = lineage?.previous.filter(o => o.state === "locked") ?? [];
    if (lockedBefore.length) limits.push(plural(lockedBefore.length, "révision antérieure verrouillée conservée", "révisions antérieures verrouillées conservées") + " (" + lockedBefore.map(o => "r" + o.revision).join(", ") + ") : elle ne couvre pas la révision courante.");
    if (mine.length > 1) limits.push(plural(mine.length, "feuille", "feuilles") + " de cycle pour cette procédure : seule la feuille rattachée compte, les autres restent listées.");
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
    if (results.non_concluant) limits.push(plural(results.non_concluant, "travail non concluant conservé", "travaux non concluants conservés") + " : une conclusion ne les efface pas.");
    if (!conclusion) { add(remaining, "NOT_CONCLUDED", "Conclusion du préparateur attendue", "procedure", procedureId, procedureId); status = p.nature === "itgc" && !itgcScope ? "perimetre_requis" : absent ? "population_absente" : records.length ? "en_cours" : "a_faire"; }
    else if (stale) { add(remaining, "CONCLUSION_STALE", "Conclusion périmée : le travail, la population ou une pièce a changé depuis", "procedure", procedureId, procedureId); status = "perimee"; }
    else if (review?.decision === "changes_requested" && reviewCurrent) { add(remaining, "CHANGES_REQUESTED", "Modifications demandées par la revue : " + review.text, "procedure", procedureId, procedureId); status = "changements"; }
    else if (!reviewCurrent || review!.kind === "simulated_second_identity") { add(remaining, "NOT_REVIEWED", reviewCurrent ? "Approbation d’une seconde identité simulée : ne vaut pas revue" : "Revue par une autre personne attendue", "procedure", procedureId, procedureId); status = "conclue"; }
    else { reviewBasis = basisOf(review); status = reviewBasis === "personnelle" ? "revue_personnelle" : "revue"; }
  }
  if (applicable) for (const id of openPoints) add(remaining, "REVIEW_POINT_OPEN", "Point de revue ouvert " + id, "point", id, procedureId);
  const concluded = p.nature === "engine" ? !!engine?.retained && ["awaiting_review", "approved", "locked"].includes(engine.retained.state) : !!conclusion && !stale;
  const finished = status === "revue" || status === "revue_personnelle" || status === "cycle_verrouille";
  const done = applicable && finished && remaining.length === 0 && reviewBasis === "autre_personne";
  const donePersonal = applicable && finished && remaining.length === 0 && (reviewBasis === "autre_personne" || reviewBasis === "personnelle");
  const updated = [p, applicability, population, itgcScope, conclusion, review, s.bindings[procedureId], ...records].filter(Boolean).sort((a, b) => b!.seq - a!.seq)[0]!;
  return { procedureId, label: p.label, nature: p.nature, natureLabel: CL_NATURE_LABELS[p.nature], owner: p.owner, riskIds: p.riskIds, assertions: p.assertions, status, statusLabel: STATUS_LABELS[status],
    applicable, concluded: applicable && concluded, done, donePersonal, reviewBasis, blocked: applicable && BLOCKED.includes(status), ...(engine ? { engine } : {}),
    ...(applicability ? { applicability: { applicable: applicability.applicable, ...(applicability.reason ? { reason: applicability.reason } : {}), by: applicability.by, at: applicability.at, citations: applicability.citations } } : {}),
    ...(population ? { population } : {}), ...(itgcScope ? { itgcScope } : {}), steps, records, results, ...(conclusion ? { conclusion: { ...conclusion, stale } } : {}), ...(review ? { review: { ...review, current: reviewCurrent } } : {}),
    remaining: applicable ? remaining : [], limits, evidence, openPoints, misstatements, contradictions, requests: requests.map(r => r.requestId), updatedBy: updated.by, updatedAt: updated.at };
}

function segment(id: string, state: Segment["state"], label: string): Segment { return { id, state, label }; }
function procedureSegment(v: ProcedureView, doneWhen: (v: ProcedureView) => boolean, partialWhen: (v: ProcedureView) => boolean): Segment {
  return segment(v.procedureId, doneWhen(v) ? "done" : v.blocked ? "blocked" : partialWhen(v) ? "partial" : "todo", v.procedureId + " · " + v.label + " — " + v.statusLabel);
}

function misstatementView(s: ClosingState, m: Misstatement): MisstatementView {
  const current = correctionCurrent(s, m), original = new Set(m.citations.map(c => c.pieceVersionId));
  const fresh = m.correction ? m.correction.citations.filter(c => !original.has(c.pieceVersionId) && (s.pieces.find(x => x.pieceVersionId === c.pieceVersionId)?.seq ?? 0) > m.seq) : [];
  const known = m.amount.kind === "known" ? m.amount.value : null;
  const stage: MisstatementStage = m.correction && !current ? "correction_a_reexaminer" : current ? (m.correction!.correctedAmount ? "corrigee_partiellement" : "corrigee") : m.assessment ? "appreciee" : "en_attente";
  const corrected = !current ? null : m.correction!.correctedAmount ?? known;
  const residual = known === null ? null : !current ? known : m.correction!.correctedAmount ? money(cents(known) - cents(m.correction!.correctedAmount)) : null;
  return { misstatementId: m.misstatementId, ...(m.procedureId ? { procedureId: m.procedureId } : {}), cycle: CL_CYCLE_LABELS[m.cycle], description: m.description, amount: m.amount, stage, stageLabel: MISSTATEMENT_STAGE_LABELS[stage],
    detected: known, corrected, residual, residualUnknown: known === null && !current, freshEvidence: fresh, originalEvidence: m.citations, assessedBy: basisOf(m.assessment) };
}

export function evaluateClosing(s: ClosingState, observations: CycleObservation[]): ClosingEvaluation {
  const lineages = sheetLineages(observations);
  const sharingByEngine = new Map<string, number>();
  for (const p of Object.values(s.procedures)) if (p.nature === "engine" && p.engine) sharingByEngine.set(p.engine, (sharingByEngine.get(p.engine) ?? 0) + 1);
  const procedures = Object.keys(s.procedures).sort().map(id => procedureView(s, id, lineages, sharingByEngine));
  const byId = new Map(procedures.map(p => [p.procedureId, p]));
  const blockers: RemainingItem[] = [], professionalGaps: RemainingItem[] = [];
  if (!s.opened) add(blockers, "FILE_NOT_OPENED", "Dossier non ouvert : exercice et entité à déclarer", "file", "file");

  // Sheet lineages: retained by one procedure, deliberately excluded with a reason, to assign (the engine is in the programme), or outside the programme.
  // A lineage whose binding drifted (new revision or population) stays to assign, named by the procedure that must confirm it: never counted as retained.
  const sheets: LineageView[] = lineages.map(l => {
    const bound = procedures.find(p => p.engine && p.engine.id === l.procedure && p.engine.binding.rootId === l.rootId && p.engine.binding.mode !== "aucun");
    const owner = bound && !bound.engine!.binding.drift ? bound : undefined;
    const exclusion = s.exclusions[exclusionKey(l.procedure, l.rootId)];
    const known = engineProcedure(l.procedure);
    const base = { procedure: l.procedure, label: known?.label ?? l.current.label, route: known?.route ?? null, rootId: l.rootId, current: l.current, previous: l.previous };
    if (owner) return { ...base, assignment: "retenue" as const, procedureId: owner.procedureId, binding: owner.engine!.binding.mode === "explicite" ? "explicite" as const : "implicite" as const };
    if (bound) return { ...base, assignment: "a_rattacher" as const, procedureId: bound.procedureId, binding: "explicite" as const };
    if (exclusion) return { ...base, assignment: "ecartee" as const, exclusion: { reason: exclusion.reason, by: exclusion.by, at: exclusion.at, revision: exclusion.revision } };
    return { ...base, assignment: sharingByEngine.has(l.procedure) ? "a_rattacher" as const : "hors_programme" as const };
  });
  for (const p of procedures) if (p.engine) p.engine.lineages = sheets.filter(x => x.procedure === p.engine!.id);

  const risks: RiskView[] = Object.values(s.risks).sort((a, b) => a.riskId < b.riskId ? -1 : 1).map(r => {
    const linked = procedures.filter(p => p.riskIds.includes(r.riskId));
    const pairs = r.assertions.map(a => {
      const all = linked.filter(p => p.assertions.includes(a)), ps = all.filter(p => p.applicable);
      // Only procedures declared non applicable with their reason: the couple is documented as not applicable, not silently covered.
      const status: PairStatus = ps.some(p => p.done) ? "revue" : ps.some(p => p.donePersonal) ? "relue" : ps.length ? "en_cours" : all.length ? "non_applicable" : "aucune";
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
  for (const p of procedures) {
    blockers.push(...p.remaining.filter(x => x.code !== "REVIEW_POINT_OPEN"));
    if (p.donePersonal && !p.done) add(professionalGaps, "PERSONAL_REVIEW_ONLY", p.procedureId + " · " + (p.nature === "engine" ? "feuille approuvée" : "procédure relue") + " sous relecture personnelle nommée : une revue par une autre personne reste requise pour une revue professionnelle", "procedure", p.procedureId, p.procedureId);
  }
  const points = Object.values(s.reviewPoints);
  for (const rp of points.filter(x => !x.closed)) add(blockers, "REVIEW_POINT_OPEN", rp.pointId + " · " + (rp.answers.length ? "réponse à examiner par la revue" : "réponse du préparateur attendue"), "point", rp.pointId, rp.target.kind === "procedure" ? rp.target.id : undefined);
  for (const rp of points.filter(x => x.closed && basisOf(x.closed) !== "autre_personne")) (basisOf(rp.closed) === "simulation" ? blockers : professionalGaps).push({ code: "REVIEW_POINT_CLOSED_PERSONALLY", label: rp.pointId + " · clos " + (basisOf(rp.closed) === "simulation" ? "par une seconde identité simulée : ne vaut pas clôture" : "sous relecture personnelle nommée"), ref: { kind: "point", id: rp.pointId } });
  const contradictions = Object.values(s.contradictions);
  for (const c of contradictions.filter(x => x.resolution && !resolutionCurrent(s, x))) add(blockers, "CONTRADICTION_RESOLUTION_STALE", c.contradictionId + " · résolution appuyée sur une pièce remplacée : à réexaminer", "contradiction", c.contradictionId);
  for (const c of contradictions.filter(x => !x.resolution)) add(blockers, "CONTRADICTION_OPEN", c.contradictionId + " · contradiction non résolue : " + c.left.label + " / " + c.right.label, "contradiction", c.contradictionId);
  const misstatements = Object.values(s.misstatements);
  for (const m of misstatements.filter(x => x.correction && !correctionCurrent(s, x))) add(blockers, "MISSTATEMENT_CORRECTION_STALE", m.misstatementId + " · correction appuyée sur une pièce remplacée : à réexaminer", "misstatement", m.misstatementId);
  for (const m of misstatements.filter(x => !x.correction && !x.assessment)) add(blockers, "MISSTATEMENT_UNASSESSED", m.misstatementId + " · anomalie non corrigée : évaluation humaine à documenter (NEP 450)", "misstatement", m.misstatementId);
  for (const m of misstatements.filter(x => !correctionCurrent(s, x) && x.assessment && basisOf(x.assessment) !== "autre_personne")) (basisOf(m.assessment) === "simulation" ? blockers : professionalGaps).push({ code: "MISSTATEMENT_ASSESSED_PERSONALLY", label: m.misstatementId + " · appréciée " + (basisOf(m.assessment) === "simulation" ? "par une seconde identité simulée : à apprécier" : "sous relecture personnelle nommée"), ref: { kind: "misstatement", id: m.misstatementId } });
  const limitations = Object.values(s.limitations);
  for (const l of limitations.filter(x => !x.assessment)) add(blockers, "LIMITATION_UNASSESSED", l.limitationId + " · limite d’étendue : incidence à apprécier par le professionnel", "limitation", l.limitationId);
  for (const l of limitations.filter(x => x.assessment && basisOf(x.assessment) !== "autre_personne")) (basisOf(l.assessment) === "simulation" ? blockers : professionalGaps).push({ code: "LIMITATION_ASSESSED_PERSONALLY", label: l.limitationId + " · appréciée " + (basisOf(l.assessment) === "simulation" ? "par une seconde identité simulée : à apprécier" : "sous relecture personnelle nommée"), ref: { kind: "limitation", id: l.limitationId } });

  // Factual inconsistencies: computed, never resolved by the tool. They disappear only when the underlying record changes.
  const coherence: CoherencePoint[] = [];
  const outsideProgram = sheets.filter(x => x.assignment === "hors_programme").map(x => x.current);
  for (const x of sheets.filter(y => y.assignment === "hors_programme")) coherence.push({ code: "CYCLE_OUTSIDE_PROGRAM", label: "Feuille « " + x.label + " » (" + x.current.state + ", v" + x.current.version + ") réalisée hors programme : à rattacher à un risque et une assertion, ou à écarter avec son motif", refs: [{ kind: "cycle", id: x.current.runId }] });
  const retainedEngines = new Set(sheets.filter(x => x.assignment === "retenue").map(x => x.procedure));
  // A new population of an engine whose programme already retains another sheet: an older lock never covers it silently.
  for (const x of sheets.filter(y => y.assignment === "a_rattacher" && !y.procedureId && retainedEngines.has(y.procedure))) coherence.push({ code: "SHEET_UNASSIGNED", label: "Feuille « " + x.label + " » (racine " + x.rootId + ", r" + x.current.revision + ", " + (x.current.populationSize === null ? "population non figée" : plural(x.current.populationSize, "élément", "éléments")) + ") ni rattachée ni écartée : le verrouillage d’une autre feuille ne couvre pas cette population", refs: [{ kind: "cycle", id: x.current.runId }] });
  for (const p of procedures.filter(x => !x.applicable)) {
    const worked = p.records.length > 0 || (p.engine?.retained && p.engine.retained.state !== "draft");
    if (worked) coherence.push({ code: "NA_WITH_WORK", label: p.procedureId + " déclarée non applicable alors que des travaux existent", refs: [{ kind: "procedure", id: p.procedureId }] });
  }
  for (const m of misstatements) {
    const p = m.procedureId ? byId.get(m.procedureId) : null;
    if (p?.conclusion && !p.conclusion.stale && p.records.length && p.records.every(r => r.result === "sans_exception"))
      coherence.push({ code: "MISSTATEMENT_IN_CLEAN_PROCEDURE", label: m.misstatementId + " rattachée à " + p.procedureId + ", dont la conclusion repose sur des travaux sans exception relevée", refs: [{ kind: "misstatement", id: m.misstatementId }, { kind: "procedure", id: p.procedureId }] });
  }
  // NEP 450 §07 defines the planning threshold as lower than the materiality threshold: a documented reverse order is a factual inconsistency of the file.
  const ts = s.thresholds, sig = ts.signification?.amount, plan = ts.planification?.amount;
  if (sig?.kind === "known" && plan?.kind === "known" && cents(plan.value) >= cents(sig.value)) coherence.push({ code: "THRESHOLD_ORDER", label: "Seuil de planification documenté supérieur ou égal au seuil de signification (NEP 450 §07 : montant inférieur)", refs: [{ kind: "threshold", id: "planification" }] });
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

  // The single set of denominators (C14): every count below, and every view, reads it.
  const applicable = procedures.filter(p => p.applicable), na = procedures.length - applicable.length;
  const controls = applicable.filter(p => p.nature === "controle_interne" || p.nature === "itgc"), itgc = applicable.filter(p => p.nature === "itgc"), engines = applicable.filter(p => p.nature === "engine");
  const stepDone = (p: ProcedureView, step: ClosingStep) => p.steps.find(x => x.step === step)?.state === "documente";
  const allPairs = risks.flatMap(r => r.pairs), pairs = allPairs.filter(x => x.status !== "non_applicable"), naPairs = allPairs.length - pairs.length;
  const requests = Object.values(s.requests), activeRequests = requests.filter(r => r.closed?.outcome !== "cancelled"), cancelled = requests.length - activeRequests.length;
  const retainedSheets = sheets.filter(x => x.assignment === "retenue");
  const denominators: Denominators = {
    procedures: { declared: procedures.length, applicable: applicable.length, notApplicable: na, done: applicable.filter(p => p.done).length, donePersonal: applicable.filter(p => p.donePersonal).length, concluded: applicable.filter(p => p.concluded).length },
    pairs: { declared: allPairs.length, counted: pairs.length, excludedNotApplicable: naPairs, reviewed: pairs.filter(x => x.status === "revue").length, reviewedPersonal: pairs.filter(x => x.status === "relue").length,
      inProgress: pairs.filter(x => x.status === "en_cours").length, uncovered: pairs.filter(x => x.status === "aucune").length },
    engines: { applicable: engines.length, locked: engines.filter(p => p.status === "cycle_verrouille").length, lockedPersonal: engines.filter(p => p.status === "cycle_verrouille" && p.reviewBasis === "personnelle").length, toBind: engines.filter(p => p.status === "cycle_a_rattacher").length },
    sheets: { lineages: sheets.length, retained: retainedSheets.length, toAssign: sheets.filter(x => x.assignment === "a_rattacher").length, excluded: sheets.filter(x => x.assignment === "ecartee").length,
      outsideProgram: outsideProgram.length, previousRevisions: sheets.reduce((n, x) => n + x.previous.length, 0), inconclusiveRetained: retainedSheets.filter(x => x.current.outcome === "inconclusive").length,
      sourcesReplaced: sheets.filter(x => x.current.sourcesCurrent === false).length },
  };
  const D = denominators;
  const naNote = na ? plural(na, "procédure non applicable motivée exclue", "procédures non applicables motivées exclues") : undefined;
  const personalUsed = procedures.some(p => p.reviewBasis === "personnelle") || s.personalCompletions.length > 0;
  const indicators: Indicator[] = [
    { id: "revues", label: "Procédures conclues et revues", numerator: D.procedures.done, denominator: D.procedures.applicable, unit: "procédures applicables", ...(naNote ? { excluded: naNote } : {}),
      ...(personalUsed ? { note: "Revue par une autre personne ; une relecture personnelle nommée est comptée à part." } : {}), segments: applicable.map(p => procedureSegment(p, v => v.done, v => v.concluded)) },
    ...(personalUsed ? [{ id: "relues", label: "Procédures relues (relecture personnelle nommée incluse)", numerator: D.procedures.donePersonal, denominator: D.procedures.applicable, unit: "procédures applicables", ...(naNote ? { excluded: naNote } : {}),
      note: "Mode solo : la relecture personnelle ne vaut pas revue par une autre personne.", segments: applicable.map(p => procedureSegment(p, v => v.donePersonal, v => v.concluded)) }] : []),
    { id: "conclues", label: "Procédures conclues par le préparateur", numerator: D.procedures.concluded, denominator: D.procedures.applicable, unit: "procédures applicables", ...(naNote ? { excluded: naNote } : {}),
      segments: applicable.map(p => procedureSegment(p, v => v.concluded, v => v.records.length > 0 || v.status === "cycle_en_cours")) },
    { id: "paires", label: "Couples risque × assertion avec une procédure revue", numerator: D.pairs.reviewed, denominator: D.pairs.counted, unit: "couples risque × assertion", ...(naPairs ? { excluded: plural(naPairs, "couple couvert seulement par des procédures non applicables motivées", "couples couverts seulement par des procédures non applicables motivées") } : {}),
      note: "N’établit pas que le risque est suffisamment couvert : ce caractère suffisant relève du jugement.", segments: pairs.map(x => segment(x.riskId + ":" + x.assertion, x.status === "revue" ? "done" : x.status === "en_cours" || x.status === "relue" ? "partial" : "blocked", x.riskId + " · " + assertionLabel(x.assertion) + " — " + ({ revue: "procédure revue", relue: "relecture personnelle seulement", en_cours: "procédure en cours", aucune: "aucune procédure", non_applicable: "non applicable" } as const)[x.status])) },
    ...(["description", "mise_en_oeuvre", "test_fonctionnement"] as const).map(step => ({ id: "controles_" + step, label: "Contrôles : " + CL_STEP_LABELS[step].toLowerCase(), numerator: controls.filter(p => stepDone(p, step)).length, denominator: controls.length,
      unit: "contrôles internes et ITGC applicables", segments: controls.map(p => procedureSegment(p, v => stepDone(v, step), v => (v.steps.find(x => x.step === step)?.state ?? "absent") !== "absent")) })),
    { id: "itgc", label: "ITGC avec périmètre et méthode définis", numerator: itgc.filter(p => !!p.itgcScope).length, denominator: itgc.length, unit: "procédures ITGC applicables", segments: itgc.map(p => procedureSegment(p, v => !!v.itgcScope, () => false)) },
    { id: "cycles", label: "Feuilles de cycle verrouillées", numerator: D.engines.locked, denominator: D.engines.applicable, unit: "feuilles outillées au programme",
      ...(D.sheets.excluded ? { excluded: plural(D.sheets.excluded, "feuille écartée du programme avec motif", "feuilles écartées du programme avec motif") } : {}),
      note: "Une feuille verrouillée ne couvre que sa procédure et sa population rattachée : elle ne vaut ni audit du cycle ni dossier complet.", segments: engines.map(p => procedureSegment(p, v => v.status === "cycle_verrouille", v => v.status !== "cycle_absent")) },
    { id: "pieces", label: "Pièces demandées reçues", numerator: activeRequests.filter(r => r.closed?.outcome === "received").length, denominator: activeRequests.length, unit: "demandes de pièces",
      ...(cancelled ? { excluded: plural(cancelled, "demande annulée motivée exclue", "demandes annulées motivées exclues") } : {}), segments: activeRequests.map(r => segment(r.requestId, r.closed ? "done" : "todo", r.requestId + " · " + r.description)) },
    { id: "points", label: "Points de revue clos", numerator: points.filter(x => x.closed).length, denominator: points.length, unit: "points de revue", segments: points.map(x => segment(x.pointId, x.closed ? "done" : x.answers.length ? "partial" : "todo", x.pointId + " · " + x.text)) },
    { id: "contradictions", label: "Contradictions résolues", numerator: contradictions.filter(x => resolutionCurrent(s, x)).length, denominator: contradictions.length, unit: "contradictions déclarées", segments: contradictions.map(x => segment(x.contradictionId, resolutionCurrent(s, x) ? "done" : "blocked", x.contradictionId + " · " + x.description)) },
    { id: "anomalies", label: "Anomalies corrigées", numerator: misstatements.filter(m => correctionCurrent(s, m)).length, denominator: misstatements.length, unit: "anomalies relevées",
      note: "Corrigée = correction documentée par une preuve nouvelle ; une correction partielle laisse un reste résiduel ; une anomalie non corrigée n’est ni acceptée ni jugée par l’outil.", segments: misstatements.map(m => segment(m.misstatementId, correctionCurrent(s, m) ? (m.correction!.correctedAmount ? "partial" : "done") : m.correction ? "blocked" : m.assessment ? "partial" : "todo", m.misstatementId + " · " + m.description)) },
    { id: "limites", label: "Limites d’étendue appréciées", numerator: limitations.filter(l => l.assessment).length, denominator: limitations.length, unit: "limites d’étendue", segments: limitations.map(l => segment(l.limitationId, l.assessment ? "done" : "todo", l.limitationId + " · " + l.description)) },
  ];
  const mviews = misstatements.map(m => misstatementView(s, m));
  const known = (list: Money[]) => sum(list);
  const corrected = mviews.filter(m => m.stage === "corrigee" || m.stage === "corrigee_partiellement"), uncorrected = mviews.filter(m => !corrected.includes(m));
  const summary: MisstatementSummary = { total: mviews.length, corrected: corrected.length, uncorrected: uncorrected.length, partial: mviews.filter(m => m.stage === "corrigee_partiellement").length,
    knownCorrected: known(corrected.flatMap(m => m.corrected ? [m.corrected] : [])), knownUncorrected: known(uncorrected.flatMap(m => m.detected ? [m.detected] : [])),
    knownResidual: known(mviews.flatMap(m => m.residual ? [m.residual] : [])), unknownUncorrected: uncorrected.filter(m => m.amount.kind === "unknown").length, unknownCorrected: corrected.filter(m => m.amount.kind === "unknown").length };
  const cviews: ContradictionView[] = contradictions.map(c => ({ contradictionId: c.contradictionId, description: c.description, status: !c.resolution ? "ouverte" : resolutionCurrent(s, c) ? "resolue" : "resolution_a_reexaminer", procedureIds: c.procedureIds,
    representationSide: c.left.kind === "declaration_direction" || c.right.kind === "declaration_direction",
    laterRepresentations: s.pieces.filter(x => x.kind === "declaration_direction" && x.seq > c.seq && !(c.resolution?.citations ?? []).some(r => r.pieceVersionId === x.pieceVersionId)).map(x => x.pieceVersionId) }));

  const engineObservations = observations.filter(x => engineProcedure(x.procedure)), now = new Map(observations.map(o => [o.runId, o]));
  const changedSince = (cycles: { procedure: string; runId: string; version: number; state: string; contentHash: string; sourcesCurrent?: boolean | null }[]) => {
    const changed: string[] = [];
    for (const f of cycles) if (fingerprintChanged(f as never, now.get(f.runId))) changed.push(f.procedure + " (" + f.runId + (now.get(f.runId)?.sourcesCurrent === false ? ", source remplacée" : "") + ")");
    for (const o of engineObservations) if (!cycles.some(f => f.runId === o.runId)) changed.push(o.procedure + " (" + o.runId + ", nouvelle feuille)");
    return changed;
  };
  const current = currentValidation(s), last = s.validations.at(-1);
  let validation: ClosingEvaluation["validation"] = { status: "absente", changed: [] };
  if (current) {
    const changed = changedSince(current.cycles);
    validation = { status: changed.length ? "perimee" : "validee", by: current.by, at: current.at, text: current.text, changed };
    if (changed.length) add(blockers, "VALIDATION_STALE", "Validation de clôture périmée : " + changed.join(", ") + " a changé depuis", "file", "validation");
  } else if (last?.reopened) validation = { status: "reouverte", by: last.by, at: last.at, text: last.text, changed: [], reopened: { by: last.reopened.by, at: last.reopened.at, reason: last.reopened.reason } };
  const mark = s.personalCompletions.at(-1);
  let personal: ClosingEvaluation["personal"] = { status: "absent", limits: [], changed: [], notice: CL_PERSONAL_NOTICE };
  if (mark) {
    const changed = [...(s.seq !== mark.seq ? [plural(s.seq - mark.seq, "événement du journal postérieur au marquage", "événements du journal postérieurs au marquage")] : []), ...changedSince(mark.cycles)];
    personal = { status: changed.length ? "perime" : "marque", by: mark.by, at: mark.at, reviewerName: mark.reviewerName, text: mark.text, limits: mark.limits, changed, notice: CL_PERSONAL_NOTICE };
  }

  // Useful dates: exercise, journal and observed sheets as recorded; declared dates with their author. No legal deadline is computed.
  const dates: DateItem[] = [];
  if (s.opened) dates.push({ id: "exercice_debut", label: "Début d’exercice", date: s.opened.period.startDate, source: "exercice" }, { id: "exercice_cloture", label: "Clôture de l’exercice", date: s.opened.period.closingDate, source: "exercice" },
    { id: "date_revue", label: "Date de revue déclarée à l’ouverture", date: s.opened.period.asOfDate, source: "exercice" }, { id: "ouverture", label: "Ouverture du dossier", date: s.opened.at, source: "journal", by: s.opened.by });
  const performed = s.records.map(r => r.performedOn).sort();
  if (performed.length) dates.push({ id: "premier_travail", label: "Premier travail réalisé (date déclarée)", date: performed[0], source: "journal" }, { id: "dernier_travail", label: "Dernier travail réalisé (date déclarée)", date: performed.at(-1)!, source: "journal" });
  const lastPiece = [...s.pieces].sort((a, b) => a.seq - b.seq).at(-1);
  if (lastPiece) dates.push({ id: "derniere_piece", label: "Dernière pièce déposée", date: lastPiece.at, source: "journal", by: lastPiece.by, detail: lastPiece.label + " v" + lastPiece.version });
  const approvals = retainedSheets.flatMap(x => x.current.approval ? [{ at: x.current.approval.at, label: x.label }] : []).sort((a, b) => a.at < b.at ? -1 : 1);
  if (approvals.length) dates.push({ id: "derniere_approbation_feuille", label: "Dernière approbation d’une feuille retenue", date: approvals.at(-1)!.at, source: "feuille", detail: approvals.at(-1)!.label });
  for (const m of Object.values(s.milestones).sort((a, b) => a.date < b.date ? -1 : 1)) dates.push({ id: "jalon_" + m.milestone, label: m.milestone === "autre" ? m.label! : CL_MILESTONE_LABELS[m.milestone as ClosingMilestone], date: m.date, source: "declaree", by: m.by, ...(m.citations.length ? { detail: m.citations.map(c => c.label + " v" + c.version).join(", ") } : {}) });
  if (mark) dates.push({ id: "marquage_personnel", label: "Dossier personnel marqué terminé", date: mark.at, source: "journal", by: mark.by });
  if (current) dates.push({ id: "validation", label: "Validation de clôture professionnelle", date: current.at, source: "journal", by: current.by });
  const thresholds: ThresholdView[] = (["signification", "planification", "insignifiance"] as const).flatMap(k => { const t = ts[k]; return t ? [{ threshold: k, label: CL_THRESHOLD_LABELS[k], source: CL_THRESHOLD_SOURCES[k], amount: t.amount, ...(t.basis ? { basis: t.basis } : {}), ...(t.rate ? { rate: t.rate } : {}), rationale: t.rationale, citations: t.citations, by: t.by, at: t.at }] : []; });

  return { opened: !!s.opened, ...(s.opened ? { period: s.opened.period, entity: s.opened.entity } : {}), risks, procedures, indicators, denominators, missing, coherence, misstatements: summary, blockers, professionalGaps,
    items: { misstatements, limitations, contradictions, reviewPoints: points, staleCorrections: misstatements.filter(m => m.correction && !correctionCurrent(s, m)).map(m => m.misstatementId), staleResolutions: contradictions.filter(c => c.resolution && !resolutionCurrent(s, c)).map(c => c.contradictionId),
      cancelledRequests: requests.flatMap(r => r.closed?.outcome === "cancelled" ? [{ requestId: r.requestId, description: r.description, reason: r.closed.reason }] : []) },
    findings: { misstatements: mviews, contradictions: cviews },
    closable: !!s.opened && blockers.length === 0 && professionalGaps.length === 0, observations, sheets, outsideProgram, validation, personal, dates, thresholds, thresholdNotice: CL_THRESHOLD_NOTICE, noOpinion: CL_NO_OPINION };
}

/** Euro text of a known amount; an unknown amount is shown as unknown with its reason, never as zero. */
export const amountText = (a: { kind: "known"; value: Money } | { kind: "unknown"; reason: string }) => a.kind === "known" ? formatCents(cents(a.value).toString()) : "Montant inconnu — " + a.reason;
export interface JournalLine { seq: number; at: string; actorId: string; type: ClosingEvent["type"]; label: string; procedureId?: string; hash: string }
const who = (p: Record<string, never>) => p.kind === "personal" ? " (relecture personnelle nommée : " + p.reviewerName + ")" : p.kind === "simulated_second_identity" ? " (seconde identité simulée)" : "";
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
        case "review_procedure": return p.procedureId + " revue : " + (p.decision === "approved" ? "approuvée" : "modifications demandées") + who(p);
        case "raise_review_point": { const t = p.target as { kind: string; id?: string }; return p.pointId + " levé sur " + (t.kind === "dossier" ? "le dossier" : t.id) + " : " + p.text; }
        case "answer_review_point": return "Réponse au " + p.pointId + cite(p.citations);
        case "close_review_point": return p.pointId + " clos : " + p.text + who(p);
        case "record_misstatement": return p.misstatementId + " relevée : " + p.description + " — " + amountText(p.amount) + cite(p.citations);
        case "correct_misstatement": return p.misstatementId + (p.correctedAmount ? " corrigée partiellement (" + amountText({ kind: "known", value: p.correctedAmount }) + ")" : " corrigée") + cite(p.citations);
        case "assess_misstatement": return p.misstatementId + " non corrigée : appréciation documentée" + who(p);
        case "record_limitation": return p.limitationId + " · limite d’étendue : " + p.description;
        case "assess_limitation": return p.limitationId + " · incidence appréciée" + who(p);
        case "record_contradiction": return p.contradictionId + " · contradiction : " + (p.left as ResolvedCitation).label + " / " + (p.right as ResolvedCitation).label;
        case "resolve_contradiction": return p.contradictionId + " résolue" + cite(p.citations);
        case "validate_closing": return "Validation de clôture enregistrée par un professionnel habilité (décision humaine, pas une opinion)";
        case "reopen": return "Dossier rouvert : " + p.reason;
        case "bind_sheet": return p.procedureId + " rattachée à la feuille « " + (engineProcedure(p.engine)?.label ?? p.engine) + " » racine " + p.rootId + " (r" + p.revision + " v" + p.version + ", empreinte " + String(p.contentHash).slice(0, 12) + "…) — périmètre : " + p.perimeter;
        case "exclude_sheet": return "Feuille « " + (engineProcedure(p.engine)?.label ?? p.engine) + " » racine " + p.rootId + " écartée du programme : " + p.reason;
        case "set_milestone": return "Date déclarée — " + (p.milestone === "autre" ? p.label : CL_MILESTONE_LABELS[p.milestone as ClosingMilestone]) + " : " + p.date + (((p.citations as ResolvedCitation[]) ?? []).length ? cite(p.citations) : "");
        case "set_threshold": return CL_THRESHOLD_LABELS[p.threshold as ClosingThreshold] + " documenté : " + amountText(p.amount) + (p.rate ? " (" + p.rate + " % déclaré, méthode interne)" : "");
        case "mark_personal_complete": return "Dossier personnel marqué terminé — relecture personnelle nommée : " + p.reviewerName + " ; " + plural((p.limits as unknown[]).length, "limite visible", "limites visibles");
      }
    })();
    const procedureId = typeof p.procedureId === "string" ? p.procedureId as string : (p.target as { kind?: string; id?: string } | undefined)?.kind === "procedure" ? (p.target as { id: string }).id : undefined;
    return { seq: e.seq, at: e.at, actorId: e.actorId, type: e.type, label, ...(procedureId ? { procedureId } : {}), hash: e.hash.slice(0, 12) };
  });
}
