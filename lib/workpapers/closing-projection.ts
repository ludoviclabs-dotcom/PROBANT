import { stableSha256 } from "@/lib/synthesis/canonical";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { reviewAuthor } from "@/lib/auth/review-kind";
import { assertionLabel, CL_CYCLE_LABELS, CL_CYCLES, engineProcedure, type ClosingCycle } from "./closing-contract";
import type { DossierEventEffect, DossierEventSource } from "./closing-events";
import { amountText, type ClosingEvaluation, type Denominators, type JournalLine, type LineageAssignment, type ProcedureView, type ReviewBasis } from "./closing-evaluate";

/**
 * C14 — single projection of the professional file: what the matrix, the cockpit and the export read, from the server evaluation only.
 * It regroups, per cycle, the programme procedures with the sheet each one covers (entity, exercise, period, perimeter, run, root, version, fingerprint)
 * or the manual work, results, pieces, notes, misstatements and contradictions; the other sheets stay listed. No engine is recalculated, no opinion is generated.
 * 1.1.0: the effects of the transversal events map (C11) are listed beside the misstatements, at their C05 stage, with their source sheets placed in their lineage.
 */
export const CLOSING_PROJECTION_SCHEMA = "closing-dossier-1.1.0";
export const ASSIGNMENT_LABELS: Record<LineageAssignment, string> = { retenue: "Retenue au programme", a_rattacher: "À rattacher ou écarter", ecartee: "Écartée avec motif", hors_programme: "Hors programme" };
/** C05 stage of an event effect after the file's review decision (residual = the part of a corrected effect left uncorrected), in the vocabulary of the misstatements. */
export function effectStageLabel(x: Pick<DossierEventEffect, "status" | "stage" | "bridge" | "decisions">): string {
  if (x.status !== "determined") return x.status === "absent" ? "Aucun groupe C05" : "Indéterminé — aucun montant retenu (bornes conservées)";
  if (x.stage === "corrected") return x.bridge && x.bridge.residualCents > 0 ? "Corrigé partiellement — reste résiduel" : "Corrigé — preuve du dossier";
  if (x.stage === "proposed") return "Non corrigé — apprécié (anomalie résiduelle)";
  if (x.stage === "dismissed") return "Écarté en revue";
  return x.decisions.some(v => v.state === "a_reexaminer") ? "En attente — décision à réexaminer" : "En attente — correction ou appréciation à documenter";
}
export const OBSERVATION_LABELS: Record<string, string> = { candidate: "candidat", already_treated: "déjà rattaché", no_difference_on_tested_items: "aucune différence", inconclusive: "non concluant", not_tested: "non testé", observed: "solde ouvert observé" };
const READ_LABELS = { courante: "version courante de la lignée", version_anterieure: "version antérieure de la feuille", revision_anterieure: "révision antérieure de la lignée" } as const;
/** One source sheet of an event, at its exact version, placed in its dossier lineage (one lineage per root). */
export function eventSourceText(x: DossierEventSource): string {
  const where = !x.lineage ? "feuille non observée par le dossier" : READ_LABELS[x.lineage.read] + (x.lineage.read === "courante" ? "" : " (courante : " + x.lineage.currentRunId + " r" + x.lineage.currentRevision + " v" + x.lineage.currentVersion + ")")
    + " · " + ASSIGNMENT_LABELS[x.lineage.assignment] + (x.lineage.procedureId ? " par " + x.lineage.procedureId : "") + (x.lineage.sourcesCurrent === false ? " · source remplacée" : "");
  return (engineProcedure(x.procedure)?.label ?? x.procedure) + " · " + x.runId + (x.lineage ? " r" + x.lineage.revision : "") + " v" + x.version + " — " + (OBSERVATION_LABELS[x.observation] ?? x.observation)
    + (x.counted ? " compté dans l’effet" : "") + (x.stale ? " · périmée dans la carte : " + x.staleReasons.join(" ") : "") + " · " + where + (x.freshness === "discordante" ? " · lecture discordante entre la carte et le dossier" : "");
}
export const REVIEW_BASIS_LABELS: Record<Exclude<ReviewBasis, null>, string> = { autre_personne: "Revue par une autre personne", personnelle: "Relecture personnelle nommée", simulation: "Seconde identité simulée (ne vaut pas revue)" };

export interface ProjectionSheet { procedure: string; label: string; rootId: string; runId: string; revision: number; version: number; state: string; contentHash: string; family: string;
  period: { startDate: string; closingDate: string }; populationSize: number | null; populationHash: string | null; result: string | null; inconclusive: boolean; sourcesCurrent: boolean | null; openBlockingNotes: number;
  approval: string | null; assignment: LineageAssignment; assignmentLabel: string; procedureId: string | null; binding: "explicite" | "implicite" | null; exclusion: { reason: string; by: string; at: string } | null; previousRevisions: { runId: string; revision: number; version: number; state: string }[] }
export interface ProjectionRow {
  procedureId: string; label: string; cycle: ClosingCycle; nature: string; natureLabel: string; owner: string; risks: string[]; assertions: string[]; applicable: boolean;
  status: string; statusLabel: string; done: boolean; donePersonal: boolean; reviewBasis: string | null;
  sheet: (ProjectionSheet & { perimeter: string | null; boundBy: string | null; boundAt: string | null; recorded: NonNullable<ProcedureView["engine"]>["binding"]["recorded"] | null; drift: string | null }) | null;
  manual: { records: number; results: ProcedureView["results"]; steps: { label: string; state: string }[]; population: string | null;
    conclusion: { text: string; by: string; at: string; stale: boolean; reach: string | null } | null; review: { decision: string; by: string; at: string; current: boolean; basis: string } | null } | null;
  notApplicable: { reason: string; by: string; at: string } | null;
  evidence: ProcedureView["evidence"]; misstatements: string[]; contradictions: string[]; openPoints: string[]; remaining: string[]; limits: string[];
}
export interface ProjectionExclusion { kind: "procedure_non_applicable" | "couple_non_applicable" | "demande_annulee" | "feuille_ecartee" | "capacite_cycle"; id: string; label: string; reason: string }
export interface DossierProjection {
  schemaVersion: typeof CLOSING_PROJECTION_SCHEMA; dossierId: string; periodId: string; entity: string | null; period: { startDate: string; closingDate: string; asOfDate: string } | null;
  journal: { seq: number; headHash: string }; stateAsOf: string | null;
  denominators: Denominators; indicators: { id: string; label: string; numerator: number; denominator: number; unit: string; excluded: string | null; note: string | null }[];
  cycles: { cycle: ClosingCycle; label: string; risks: { riskId: string; label: string; level: string | null; pairs: { assertion: string; status: string }[] }[]; rows: ProjectionRow[]; otherSheets: ProjectionSheet[] }[];
  findings: {
    misstatements: { id: string; procedureId: string | null; cycle: string; description: string; amount: string; stage: string; stageLabel: string; corrected: string | null; residual: string | null; freshEvidence: string[]; originalEvidence: string[]; assessedBy: string | null }[];
    contradictions: { id: string; description: string; status: string; procedureIds: string[]; representationSide: boolean; laterRepresentations: string[] }[];
    limitations: { id: string; cycle: string; description: string; assessed: boolean; assessedBy: string | null }[];
    totals: ClosingEvaluation["misstatements"];
    /** Effects of the transversal events map (C11) at their C05 stage, beside the journaled misstatements: never added to `totals`. */
    events: ClosingEvaluation["events"];
  };
  dates: ClosingEvaluation["dates"]; thresholds: { label: string; source: string; amount: string; basis: string | null; rate: string | null; rationale: string; by: string; at: string }[]; thresholdNotice: string;
  completion: { closable: boolean; blockers: string[]; professionalGaps: string[]; professional: ClosingEvaluation["validation"]; personal: ClosingEvaluation["personal"] };
  exclusions: ProjectionExclusion[]; noOpinion: string; limitations: string[]; hash: string;
}

const sheetOf = (x: ClosingEvaluation["sheets"][number]): ProjectionSheet => ({ procedure: x.procedure, label: x.label, rootId: x.rootId, runId: x.current.runId, revision: x.current.revision, version: x.current.version, state: x.current.state,
  contentHash: x.current.contentHash, family: x.current.family, period: { startDate: x.current.period.startDate, closingDate: x.current.period.closingDate }, populationSize: x.current.populationSize, populationHash: x.current.populationHash,
  result: x.current.outcome, inconclusive: x.current.outcome === "inconclusive", sourcesCurrent: x.current.sourcesCurrent, openBlockingNotes: x.current.openBlockingNotes, approval: x.current.approval ? reviewAuthor(x.current.approval) + " · " + x.current.approval.at : null,
  assignment: x.assignment, assignmentLabel: ASSIGNMENT_LABELS[x.assignment], procedureId: x.procedureId ?? null, binding: x.binding ?? null, exclusion: x.exclusion ? { reason: x.exclusion.reason, by: x.exclusion.by, at: x.exclusion.at } : null,
  previousRevisions: x.previous.map(o => ({ runId: o.runId, revision: o.revision, version: o.version, state: o.state })) });

function cycleOf(e: ClosingEvaluation, p: ProcedureView): ClosingCycle {
  if (p.engine) return engineProcedure(p.engine.id)!.cycle;
  return e.risks.find(r => p.riskIds.includes(r.riskId))?.cycle ?? "transversal";
}

export function projectDossier(input: { dossierId: string; periodId: string; seq: number; headHash: string; evaluation: ClosingEvaluation; journal: JournalLine[] }): DossierProjection {
  const e = input.evaluation;
  const rows: ProjectionRow[] = e.procedures.map(p => {
    const lineage = p.engine?.retained ? e.sheets.find(x => x.procedure === p.engine!.id && x.rootId === p.engine!.retained!.rootId) : p.engine?.binding.rootId ? e.sheets.find(x => x.procedure === p.engine!.id && x.rootId === p.engine!.binding.rootId) : undefined;
    return { procedureId: p.procedureId, label: p.label, cycle: cycleOf(e, p), nature: p.nature, natureLabel: p.natureLabel, owner: p.owner, risks: p.riskIds, assertions: p.assertions.map(assertionLabel), applicable: p.applicable,
      status: p.status, statusLabel: p.statusLabel, done: p.done, donePersonal: p.donePersonal, reviewBasis: p.reviewBasis ? REVIEW_BASIS_LABELS[p.reviewBasis] : null,
      sheet: p.engine && lineage ? { ...sheetOf(lineage), perimeter: p.engine.binding.perimeter ?? null, boundBy: p.engine.binding.by ?? null, boundAt: p.engine.binding.at ?? null, recorded: p.engine.binding.recorded ?? null, drift: p.engine.binding.drift } : null,
      manual: p.engine ? null : { records: p.records.length, results: p.results, steps: p.steps.map(s => ({ label: s.label, state: s.state })), population: p.population ? (p.population.status === "absent" ? "Absente : " + p.population.reason : p.population.description + (p.population.size !== null ? " (" + p.population.size + ")" : "")) : null,
        conclusion: p.conclusion ? { text: p.conclusion.text, by: p.conclusion.by, at: p.conclusion.at, stale: p.conclusion.stale, reach: p.conclusion.reach ?? null } : null,
        review: p.review ? { decision: p.review.decision, by: p.review.by, at: p.review.at, current: p.review.current, basis: REVIEW_BASIS_LABELS[p.review.kind === "personal" ? "personnelle" : p.review.kind === "simulated_second_identity" ? "simulation" : "autre_personne"] } : null },
      notApplicable: p.applicability && !p.applicability.applicable ? { reason: p.applicability.reason ?? "", by: p.applicability.by, at: p.applicability.at } : null,
      evidence: p.evidence, misstatements: p.misstatements, contradictions: p.contradictions, openPoints: p.openPoints, remaining: p.remaining.map(r => r.label), limits: p.limits };
  });
  const present = new Set<ClosingCycle>([...rows.map(r => r.cycle), ...e.risks.map(r => r.cycle), ...e.sheets.map(x => engineProcedure(x.procedure)!.cycle)]);
  const cycles = CL_CYCLES.filter(c => present.has(c)).map(c => ({ cycle: c, label: CL_CYCLE_LABELS[c],
    risks: e.risks.filter(r => r.cycle === c).map(r => ({ riskId: r.riskId, label: r.label, level: r.assessment?.level ?? null, pairs: r.pairs.map(x => ({ assertion: assertionLabel(x.assertion), status: x.status })) })),
    rows: rows.filter(r => r.cycle === c),
    // Every lineage not retained by a procedure, and every earlier revision, stays listed with the cycle: never merged into the retained sheet.
    otherSheets: e.sheets.filter(x => engineProcedure(x.procedure)!.cycle === c && !x.procedureId).map(x => sheetOf(x)) }));
  const exclusions: ProjectionExclusion[] = [
    ...e.procedures.filter(p => !p.applicable).map(p => ({ kind: "procedure_non_applicable" as const, id: p.procedureId, label: p.procedureId + " · " + p.label, reason: p.applicability?.reason ?? "" })),
    ...e.risks.flatMap(r => r.pairs.filter(x => x.status === "non_applicable").map(x => ({ kind: "couple_non_applicable" as const, id: r.riskId + ":" + x.assertion, label: r.riskId + " · " + assertionLabel(x.assertion), reason: "Couvert seulement par " + x.procedures.join(", ") + ", non applicable(s) motivée(s)" }))),
    ...e.items.cancelledRequests.map(r => ({ kind: "demande_annulee" as const, id: r.requestId, label: r.requestId + " · " + r.description, reason: r.reason })),
    ...e.sheets.filter(x => x.assignment === "ecartee").map(x => ({ kind: "feuille_ecartee" as const, id: x.procedure + "|" + x.rootId, label: x.label + " · racine " + x.rootId, reason: x.exclusion!.reason })),
    // Capability exclusions of the cycles present in the file: what no sheet of PROBANT establishes, still relevant whatever the state of the sheets.
    ...CAPABILITY_REGISTRY.filter(c => present.has(c.id as ClosingCycle)).flatMap(c => c.exclusions.map((reason, i) => ({ kind: "capacite_cycle" as const, id: c.id + ":" + i, label: c.label, reason }))),
  ];
  const stateAsOf = input.journal.map(l => l.at).sort().at(-1) ?? null;
  const body = {
    schemaVersion: CLOSING_PROJECTION_SCHEMA as typeof CLOSING_PROJECTION_SCHEMA, dossierId: input.dossierId, periodId: input.periodId, entity: e.entity ?? null,
    period: e.period ? { startDate: e.period.startDate, closingDate: e.period.closingDate, asOfDate: e.period.asOfDate } : null, journal: { seq: input.seq, headHash: input.headHash }, stateAsOf,
    denominators: e.denominators, indicators: e.indicators.map(i => ({ id: i.id, label: i.label, numerator: i.numerator, denominator: i.denominator, unit: i.unit, excluded: i.excluded ?? null, note: i.note ?? null })),
    cycles,
    findings: {
      misstatements: e.findings.misstatements.map(m => ({ id: m.misstatementId, procedureId: m.procedureId ?? null, cycle: m.cycle, description: m.description, amount: amountText(m.amount), stage: m.stage, stageLabel: m.stageLabel,
        corrected: m.corrected ? amountText({ kind: "known", value: m.corrected }) : null, residual: m.residual ? amountText({ kind: "known", value: m.residual }) : m.residualUnknown ? "Inconnu" : null,
        freshEvidence: m.freshEvidence.map(c => c.label + " v" + c.version), originalEvidence: m.originalEvidence.map(c => c.label + " v" + c.version), assessedBy: m.assessedBy ? REVIEW_BASIS_LABELS[m.assessedBy] : null })),
      contradictions: e.findings.contradictions.map(c => ({ id: c.contradictionId, description: c.description, status: c.status, procedureIds: c.procedureIds, representationSide: c.representationSide, laterRepresentations: c.laterRepresentations })),
      limitations: e.items.limitations.map(l => ({ id: l.limitationId, cycle: CL_CYCLE_LABELS[l.cycle], description: l.description, assessed: !!l.assessment, assessedBy: l.assessment ? REVIEW_BASIS_LABELS[l.assessment.kind === "personal" ? "personnelle" : l.assessment.kind === "simulated_second_identity" ? "simulation" : "autre_personne"] : null })),
      totals: e.misstatements,
      events: e.events,
    },
    dates: e.dates, thresholds: e.thresholds.map(t => ({ label: t.label, source: t.source, amount: amountText(t.amount), basis: t.basis ?? null, rate: t.rate ?? null, rationale: t.rationale, by: t.by, at: t.at })), thresholdNotice: e.thresholdNotice,
    completion: { closable: e.closable, blockers: e.blockers.map(b => b.label), professionalGaps: e.professionalGaps.map(b => b.label), professional: e.validation, personal: e.personal },
    exclusions, noOpinion: e.noOpinion,
    limitations: ["Projection du journal et des feuilles observées à leur version courante : aucun moteur n’est recalculé ici.", "Une feuille verrouillée ne couvre que la procédure et la population rattachées ; les autres feuilles restent listées.",
      "La relecture personnelle nommée (mode solo) ne vaut pas revue par une autre personne ; la validation professionnelle reste distincte.", "Montants inconnus comptés à part, jamais pour zéro ; aucune comparaison aux seuils documentés.",
      e.events.status === "lue" ? "Effets des événements transversaux lus dans la carte C11 (empreinte " + e.events.map!.hash.slice(0, 12) + "…) : catégorie distincte des anomalies journalisées, sans total commun. Étape C05 de chaque effet issue des décisions journalisées par le dossier (corrections et appréciations) : "
        + e.denominators.events.decided + " effet(s) avec une décision qui s’applique, " + e.denominators.events.toReexamine + " décision(s) à réexaminer" + (e.denominators.events.orphanDecisions ? ", " + e.denominators.events.orphanDecisions + " décision(s) sans effet dans la carte" : "") + " ; aucun effet n’est recalculé."
        : "Effets des événements transversaux non établis (" + e.events.reason + ") : inconnus, jamais comptés pour zéro.",
      "Le chaînage d’empreintes est un contrôle d’intégrité local : ni signature ni archivage à valeur probante."],
  };
  return { ...body, hash: stableSha256(body) };
}
