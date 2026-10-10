import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { CycleFingerprint } from "./closing-cycles";
import type { ClosingAmount, ClosingAssertion, ClosingCommandName, ClosingCycle, ClosingNature, ClosingStep, EngineProcedureId, PieceKind, ResolvedCitation } from "./closing-contract";

/**
 * Append-only journal of the professional file. Every event carries its author and server time; the state is a pure fold of the journal.
 * The hash chain only detects an altered or reordered journal locally: it is neither a signature nor a tamper-proof record.
 */
export type ClosingEventType = ClosingCommandName | "upload_piece";
export interface ClosingEvent { seq: number; id: string; type: ClosingEventType; actorId: string; at: string; payload: Record<string, unknown>; prevHash: string; hash: string }
export const GENESIS_HASH = "0".repeat(64);
export const eventHash = (e: Omit<ClosingEvent, "hash">) => stableSha256({ seq: e.seq, id: e.id, type: e.type, actorId: e.actorId, at: e.at, payload: e.payload, prevHash: e.prevHash });

export interface Stamp { by: string; at: string; seq: number }
export interface RiskEntry extends Stamp { riskId: string; cycle: ClosingCycle; label: string; assertions: ClosingAssertion[]; assessment: { level: "eleve" | "modere" | "faible"; rationale: string } | null; revision: number }
export interface ProcedureEntry extends Stamp { procedureId: string; riskIds: string[]; assertions: ClosingAssertion[]; nature: ClosingNature; label: string; owner: string; engine?: EngineProcedureId; revision: number }
export type PopulationEntry = Stamp & ({ status: "defined"; description: string; size: number | null; citations: ResolvedCitation[] } | { status: "absent"; reason: string });
export interface ApplicabilityEntry extends Stamp { applicable: boolean; reason?: string; citations: ResolvedCitation[] }
export interface ItgcScopeEntry extends Stamp { systems: string[]; processes: string[]; from: string; to: string; method: string; citations: ResolvedCitation[] }
export interface WorkRecord extends Stamp { recordId: string; procedureId: string; step: ClosingStep; performedOn: string; object: string; done: string; itemsExamined: number | null; result: "sans_exception" | "exceptions" | "non_concluant"; citations: ResolvedCitation[] }
export type RequestClosure = Stamp & ({ outcome: "received"; piece: ResolvedCitation } | { outcome: "cancelled"; reason: string });
export interface PieceRequest extends Stamp { requestId: string; procedureId: string; description: string; requestedFrom: string; closed?: RequestClosure }
export interface PieceVersion extends Stamp { pieceVersionId: string; pieceId: string; version: number; fileName: string; label: string; sha256: string; size: number; kind: PieceKind }
export interface Conclusion extends Stamp { text: string; reach?: "conception_mise_en_oeuvre" | "fonctionnement"; citations: ResolvedCitation[]; basisHash: string }
export interface Review extends Stamp { decision: "approved" | "changes_requested"; text: string; conclusionSeq: number; basisHash: string }
export type ReviewTarget = { kind: "procedure"; id: string } | { kind: "misstatement"; id: string } | { kind: "contradiction"; id: string } | { kind: "dossier" };
export interface ReviewPoint extends Stamp { pointId: string; target: ReviewTarget; text: string; answers: (Stamp & { text: string; citations: ResolvedCitation[] })[]; closed?: Stamp & { text: string } }
export interface Misstatement extends Stamp { misstatementId: string; procedureId?: string; cycle: ClosingCycle; description: string; amount: ClosingAmount; citations: ResolvedCitation[];
  correction?: Stamp & { text: string; citations: ResolvedCitation[] }; assessment?: Stamp & { text: string } }
export interface Limitation extends Stamp { limitationId: string; cycle: ClosingCycle; description: string; procedureIds: string[]; assessment?: Stamp & { text: string } }
export interface Contradiction extends Stamp { contradictionId: string; left: ResolvedCitation; right: ResolvedCitation; description: string; procedureIds: string[]; resolution?: Stamp & { text: string; citations: ResolvedCitation[] } }
export interface ClosingValidation extends Stamp { text: string; headHash: string; headSeq: number; cycles: CycleFingerprint[]; reopened?: Stamp & { reason: string } }
export interface ClosingState {
  seq: number; headHash: string; opened?: Stamp & { period: AccountingPeriod; entity: string };
  risks: Record<string, RiskEntry>; procedures: Record<string, ProcedureEntry>; populations: Record<string, PopulationEntry>; applicability: Record<string, ApplicabilityEntry>;
  itgcScopes: Record<string, ItgcScopeEntry>; records: WorkRecord[]; requests: Record<string, PieceRequest>; pieces: PieceVersion[];
  conclusions: Record<string, Conclusion>; reviews: Record<string, Review>; reviewPoints: Record<string, ReviewPoint>; misstatements: Record<string, Misstatement>;
  limitations: Record<string, Limitation>; contradictions: Record<string, Contradiction>; validations: ClosingValidation[];
}
export const emptyState = (): ClosingState => ({ seq: 0, headHash: GENESIS_HASH, risks: {}, procedures: {}, populations: {}, applicability: {}, itgcScopes: {}, records: [], requests: {}, pieces: [],
  conclusions: {}, reviews: {}, reviewPoints: {}, misstatements: {}, limitations: {}, contradictions: {}, validations: [] });

/** Identifiers generated by the server, in journal order: two concurrent writers can never pick the same one. */
export const nextId = {
  record: (s: ClosingState) => "W-" + String(s.records.length + 1).padStart(2, "0"),
  request: (s: ClosingState) => "D-" + String(Object.keys(s.requests).length + 1).padStart(2, "0"),
  point: (s: ClosingState) => "RP-" + String(Object.keys(s.reviewPoints).length + 1).padStart(2, "0"),
  misstatement: (s: ClosingState) => "A-" + String(Object.keys(s.misstatements).length + 1).padStart(2, "0"),
  limitation: (s: ClosingState) => "L-" + String(Object.keys(s.limitations).length + 1).padStart(2, "0"),
  contradiction: (s: ClosingState) => "C-" + String(Object.keys(s.contradictions).length + 1).padStart(2, "0"),
  piece: (s: ClosingState) => "PC-" + String(new Set(s.pieces.map(p => p.pieceId)).size + 1).padStart(2, "0"),
};
export const currentValidation = (s: ClosingState) => { const last = s.validations.at(-1); return last && !last.reopened ? last : null; };
export const latestPieceVersion = (s: ClosingState, pieceId: string) => s.pieces.filter(p => p.pieceId === pieceId).sort((a, b) => b.version - a.version)[0] ?? null;
export const isSuperseded = (s: ClosingState, c: ResolvedCitation) => latestPieceVersion(s, c.pieceId)?.pieceVersionId !== c.pieceVersionId;
/** A correction or a resolution holds only while every piece it cites is still the current version; otherwise it is to be re-examined. */
export const correctionCurrent = (s: ClosingState, m: Misstatement) => !!m.correction && !m.correction.citations.some(c => isSuperseded(s, c));
export const resolutionCurrent = (s: ClosingState, c: Contradiction) => !!c.resolution && !c.resolution.citations.some(x => isSuperseded(s, x));

/**
 * What a conclusion rests on: the procedure and its risks, population, applicability, ITGC scope, every work record and the latest version of each cited piece.
 * Any change after the conclusion makes it stale; the review follows the conclusion it approved.
 */
export function procedureBasis(s: ClosingState, procedureId: string) {
  const p = s.procedures[procedureId];
  if (!p) throw new Error("CL_PROCEDURE_UNKNOWN");
  const strip = <T extends Stamp>(v: T | undefined) => { if (!v) return null; const { by: _b, at: _a, seq: _s, ...rest } = v; void _b; void _a; void _s; return rest; };
  const records = s.records.filter(r => r.procedureId === procedureId);
  const cited = new Set([...records.flatMap(r => r.citations), ...(s.populations[procedureId]?.status === "defined" ? (s.populations[procedureId] as { citations: ResolvedCitation[] }).citations : [])].map(c => c.pieceId));
  return stableSha256({ procedure: strip(p), risks: p.riskIds.map(r => strip(s.risks[r])), population: strip(s.populations[procedureId]), applicability: strip(s.applicability[procedureId]),
    itgc: strip(s.itgcScopes[procedureId]), records: records.map(r => ({ id: r.recordId, seq: r.seq })), latest: [...cited].sort().map(id => latestPieceVersion(s, id)?.pieceVersionId ?? null) });
}

/** Pure fold; refuses a journal whose chain, order or author is broken. */
export function fold(events: ClosingEvent[]): ClosingState {
  const s = emptyState();
  for (const e of events) {
    if (e.seq !== s.seq + 1 || e.prevHash !== s.headHash || eventHash(e) !== e.hash || !e.actorId || !Number.isFinite(Date.parse(e.at))) throw new Error("CL_JOURNAL_CORRUPTED");
    apply(s, e);
    s.seq = e.seq; s.headHash = e.hash;
  }
  return s;
}
function apply(s: ClosingState, e: ClosingEvent) {
  const stamp: Stamp = { by: e.actorId, at: e.at, seq: e.seq }, p = e.payload as Record<string, never>;
  switch (e.type) {
    case "open": s.opened = { ...stamp, period: p.period, entity: p.entity }; break;
    case "set_risk": s.risks[p.riskId] = { ...stamp, riskId: p.riskId, cycle: p.cycle, label: p.label, assertions: p.assertions, assessment: p.assessment, revision: (s.risks[p.riskId]?.revision ?? 0) + 1 }; break;
    case "set_procedure": s.procedures[p.procedureId] = { ...stamp, procedureId: p.procedureId, riskIds: p.riskIds, assertions: p.assertions, nature: p.nature, label: p.label, owner: p.owner,
      ...(p.engine ? { engine: p.engine } : {}), revision: (s.procedures[p.procedureId]?.revision ?? 0) + 1 }; break;
    case "set_population": s.populations[p.procedureId] = { ...stamp, ...(p.population as object) } as PopulationEntry; break;
    case "set_applicability": s.applicability[p.procedureId] = { ...stamp, applicable: p.applicable, ...(p.reason ? { reason: p.reason } : {}), citations: p.citations }; break;
    case "set_itgc_scope": s.itgcScopes[p.procedureId] = { ...stamp, systems: p.systems, processes: p.processes, from: p.from, to: p.to, method: p.method, citations: p.citations }; break;
    case "record_work": s.records.push({ ...stamp, recordId: p.recordId, procedureId: p.procedureId, step: p.step, performedOn: p.performedOn, object: p.object, done: p.done, itemsExamined: p.itemsExamined, result: p.result, citations: p.citations }); break;
    case "request_piece": s.requests[p.requestId] = { ...stamp, requestId: p.requestId, procedureId: p.procedureId, description: p.description, requestedFrom: p.requestedFrom }; break;
    case "close_piece_request": s.requests[p.requestId] = { ...s.requests[p.requestId], closed: { ...stamp, ...(p.outcome === "received" ? { outcome: "received", piece: p.piece } : { outcome: "cancelled", reason: p.reason }) } as RequestClosure }; break;
    case "upload_piece": s.pieces.push({ ...stamp, pieceVersionId: p.pieceVersionId, pieceId: p.pieceId, version: p.version, fileName: p.fileName, label: p.label, sha256: p.sha256, size: p.size, kind: p.kind }); break;
    case "conclude_procedure": s.conclusions[p.procedureId] = { ...stamp, text: p.text, ...(p.reach ? { reach: p.reach } : {}), citations: p.citations, basisHash: p.basisHash }; break;
    case "review_procedure": s.reviews[p.procedureId] = { ...stamp, decision: p.decision, text: p.text, conclusionSeq: p.conclusionSeq, basisHash: p.basisHash }; break;
    case "raise_review_point": s.reviewPoints[p.pointId] = { ...stamp, pointId: p.pointId, target: p.target, text: p.text, answers: [] }; break;
    case "answer_review_point": s.reviewPoints[p.pointId].answers.push({ ...stamp, text: p.text, citations: p.citations }); break;
    case "close_review_point": s.reviewPoints[p.pointId].closed = { ...stamp, text: p.text }; break;
    case "record_misstatement": s.misstatements[p.misstatementId] = { ...stamp, misstatementId: p.misstatementId, ...(p.procedureId ? { procedureId: p.procedureId } : {}), cycle: p.cycle, description: p.description, amount: p.amount, citations: p.citations }; break;
    case "correct_misstatement": s.misstatements[p.misstatementId].correction = { ...stamp, text: p.text, citations: p.citations }; break;
    case "assess_misstatement": s.misstatements[p.misstatementId].assessment = { ...stamp, text: p.text }; break;
    case "record_limitation": s.limitations[p.limitationId] = { ...stamp, limitationId: p.limitationId, cycle: p.cycle, description: p.description, procedureIds: p.procedureIds }; break;
    case "assess_limitation": s.limitations[p.limitationId].assessment = { ...stamp, text: p.text }; break;
    case "record_contradiction": s.contradictions[p.contradictionId] = { ...stamp, contradictionId: p.contradictionId, left: p.left, right: p.right, description: p.description, procedureIds: p.procedureIds }; break;
    case "resolve_contradiction": s.contradictions[p.contradictionId].resolution = { ...stamp, text: p.text, citations: p.citations }; break;
    case "validate_closing": s.validations.push({ ...stamp, text: p.text, headHash: p.headHash, headSeq: p.headSeq, cycles: p.cycles }); break;
    case "reopen": s.validations[s.validations.length - 1].reopened = { ...stamp, reason: p.reason }; break;
    default: throw new Error("CL_JOURNAL_CORRUPTED");
  }
}
