import { periodIssues } from "@/lib/canonical-model/period";
import { engineProcedure, isControl, stepsFor, type CitationInput, type ClosingCommand, type PieceKind, type ResolvedCitation } from "./closing-contract";
import { fingerprint, type CycleObservation } from "./closing-cycles";
import { evaluateClosing } from "./closing-evaluate";
import { currentValidation, isSuperseded, latestPieceVersion, nextId, procedureBasis, type ClosingEventType, type ClosingState } from "./closing-journal";

/**
 * Decision rules of the professional file: one command, checked against the folded journal, becomes one event.
 * Identifiers, authors, dates, citations (file name, hash, kind) and dependency hashes are set here by the server, never by the browser.
 */
export interface DecideContext { actorId: string; at: string; closingAuthority: boolean; observations: CycleObservation[] }
export interface Decision { type: ClosingEventType; payload: Record<string, unknown> }

export function resolveCitation(s: ClosingState, c: CitationInput): ResolvedCitation {
  const piece = s.pieces.find(p => p.pieceVersionId === c.pieceVersionId);
  if (!piece) throw new Error("CL_PIECE_UNKNOWN");
  return { pieceVersionId: piece.pieceVersionId, pieceId: piece.pieceId, version: piece.version, fileName: piece.fileName, label: piece.label, sha256: piece.sha256, kind: piece.kind,
    ...(c.page !== undefined ? { page: c.page } : {}), ...(c.zone ? { zone: c.zone } : {}) };
}
const resolveAll = (s: ClosingState, list: CitationInput[]) => {
  const resolved = list.map(c => resolveCitation(s, c));
  if (new Set(resolved.map(c => c.pieceVersionId + "|" + (c.page ?? "") + "|" + (c.zone ?? ""))).size !== resolved.length) throw new Error("CL_CITATION_DUPLICATE");
  // A new decision always cites the current version of a piece: an older version stays readable but cannot found new work.
  if (resolved.some(c => isSuperseded(s, c))) throw new Error("CL_PIECE_VERSION_SUPERSEDED");
  return resolved;
};
/** NEP 580 §04 read as an internal method: a management representation is corroborated by other evidence, never used alone. */
const corroborated = (list: ResolvedCitation[]) => list.some(c => c.kind !== "declaration_direction");
const procedureOf = (s: ClosingState, id: string) => { const p = s.procedures[id]; if (!p) throw new Error("CL_PROCEDURE_UNKNOWN"); return p; };
const applicableOf = (s: ClosingState, id: string) => s.applicability[id]?.applicable !== false;

export function decide(s: ClosingState, command: ClosingCommand, ctx: DecideContext): Decision {
  if (command.expectedSeq !== s.seq) throw new Error("CL_STALE_SEQ");
  if (command.command === "open") {
    if (s.opened) throw new Error("CL_FILE_ALREADY_OPENED");
    if (periodIssues(command.period).length) throw new Error("CL_PERIOD_INVALID");
    return { type: "open", payload: { period: command.period, entity: command.entity } };
  }
  if (!s.opened) throw new Error("CL_FILE_NOT_OPENED");
  const closed = currentValidation(s);
  if (command.command === "reopen") {
    if (!closed) throw new Error("CL_FILE_NOT_CLOSED");
    if (!ctx.closingAuthority) throw new Error("CL_CLOSING_AUTHORITY_FORBIDDEN");
    return { type: "reopen", payload: { reason: command.reason } };
  }
  // A validated file is frozen: any change goes through a recorded reopening by an authorised professional.
  if (closed) throw new Error("CL_FILE_CLOSED");
  const today = ctx.at.slice(0, 10);
  switch (command.command) {
    case "set_risk": {
      const existing = s.risks[command.riskId];
      if (existing) for (const p of Object.values(s.procedures).filter(p => p.riskIds.includes(command.riskId))) {
        const allowed = new Set(p.riskIds.flatMap(r => r === command.riskId ? command.assertions : s.risks[r].assertions));
        if (p.assertions.some(a => !allowed.has(a))) throw new Error("CL_RISK_ASSERTION_IN_USE");
      }
      return { type: "set_risk", payload: { riskId: command.riskId, cycle: command.cycle, label: command.label, assertions: [...new Set(command.assertions)], assessment: command.assessment } };
    }
    case "set_procedure": {
      if (command.riskIds.some(r => !s.risks[r])) throw new Error("CL_RISK_UNKNOWN");
      const allowed = new Set(command.riskIds.flatMap(r => s.risks[r].assertions));
      if (command.assertions.some(a => !allowed.has(a))) throw new Error("CL_ASSERTION_NOT_IN_RISK");
      if ((command.nature === "engine") !== !!command.engine) throw new Error(command.nature === "engine" ? "CL_ENGINE_REQUIRED" : "CL_ENGINE_ONLY_FOR_ENGINE");
      if (command.engine && Object.values(s.procedures).some(p => p.engine === command.engine && p.procedureId !== command.procedureId)) throw new Error("CL_ENGINE_ALREADY_LINKED");
      const existing = s.procedures[command.procedureId];
      if (existing && existing.nature !== command.nature && (s.records.some(r => r.procedureId === command.procedureId) || s.conclusions[command.procedureId])) throw new Error("CL_NATURE_LOCKED");
      return { type: "set_procedure", payload: { procedureId: command.procedureId, riskIds: [...new Set(command.riskIds)], assertions: [...new Set(command.assertions)], nature: command.nature, label: command.label, owner: command.owner,
        ...(command.engine ? { engine: command.engine } : {}) } };
    }
    case "set_population": {
      const p = procedureOf(s, command.procedureId);
      if (p.nature === "engine") throw new Error("CL_ENGINE_POPULATION_FROM_CYCLE");
      const population = command.population.status === "defined" ? { ...command.population, citations: resolveAll(s, command.population.citations) } : command.population;
      return { type: "set_population", payload: { procedureId: p.procedureId, population } };
    }
    case "set_applicability": {
      const p = procedureOf(s, command.procedureId);
      if (!command.applicable && !command.reason) throw new Error("CL_NA_REASON_REQUIRED");
      if (command.applicable && command.reason) throw new Error("CL_NA_REASON_UNEXPECTED");
      return { type: "set_applicability", payload: { procedureId: p.procedureId, applicable: command.applicable, ...(command.reason ? { reason: command.reason } : {}), citations: resolveAll(s, command.citations) } };
    }
    case "set_itgc_scope": {
      const p = procedureOf(s, command.procedureId);
      if (p.nature !== "itgc") throw new Error("CL_ITGC_ONLY");
      if (command.from > command.to) throw new Error("CL_DATES_INVALID");
      return { type: "set_itgc_scope", payload: { procedureId: p.procedureId, systems: command.systems, processes: command.processes, from: command.from, to: command.to, method: command.method, citations: resolveAll(s, command.citations) } };
    }
    case "record_work": {
      const p = procedureOf(s, command.procedureId);
      if (p.nature === "engine") throw new Error("CL_ENGINE_WORK_IN_CYCLE");
      if (!applicableOf(s, p.procedureId)) throw new Error("CL_PROCEDURE_NOT_APPLICABLE");
      if (!stepsFor(p.nature).includes(command.step)) throw new Error("CL_STEP_INVALID");
      if (command.performedOn > today) throw new Error("CL_DATE_FUTURE");
      // ITGC are not covered by a checklist: no work is recorded before a scope (systems, processes, period) and a method exist.
      if (p.nature === "itgc" && !s.itgcScopes[p.procedureId]) throw new Error("CL_ITGC_SCOPE_REQUIRED");
      const records = s.records.filter(r => r.procedureId === p.procedureId);
      if (command.step === "test_fonctionnement" && !(["description", "mise_en_oeuvre"] as const).every(step => records.some(r => r.step === step))) throw new Error("CL_CONTROL_DESIGN_REQUIRED");
      // What the work bears on: execution and operating tests need a defined population; design and implementation do not.
      if (command.step === "execution" || command.step === "test_fonctionnement") {
        const population = s.populations[p.procedureId];
        if (!population) throw new Error("CL_POPULATION_REQUIRED");
        if (population.status === "absent") throw new Error("CL_POPULATION_ABSENT");
      }
      return { type: "record_work", payload: { recordId: nextId.record(s), procedureId: p.procedureId, step: command.step, performedOn: command.performedOn, object: command.object, done: command.done,
        itemsExamined: command.itemsExamined, result: command.result, citations: resolveAll(s, command.citations) } };
    }
    case "request_piece": {
      const p = procedureOf(s, command.procedureId);
      return { type: "request_piece", payload: { requestId: nextId.request(s), procedureId: p.procedureId, description: command.description, requestedFrom: command.requestedFrom } };
    }
    case "close_piece_request": {
      const r = s.requests[command.requestId];
      if (!r) throw new Error("CL_REQUEST_UNKNOWN");
      if (r.closed) throw new Error("CL_REQUEST_CLOSED");
      if (command.outcome === "received") {
        if (!command.pieceVersionId || command.reason) throw new Error("CL_REQUEST_CLOSURE_INVALID");
        const piece = resolveCitation(s, { pieceVersionId: command.pieceVersionId });
        if (s.pieces.find(x => x.pieceVersionId === piece.pieceVersionId)!.seq < r.seq) throw new Error("CL_PIECE_NOT_NEW");
        return { type: "close_piece_request", payload: { requestId: r.requestId, outcome: "received", piece } };
      }
      if (!command.reason || command.pieceVersionId) throw new Error("CL_REQUEST_CLOSURE_INVALID");
      return { type: "close_piece_request", payload: { requestId: r.requestId, outcome: "cancelled", reason: command.reason } };
    }
    case "conclude_procedure": {
      const p = procedureOf(s, command.procedureId);
      if (p.nature === "engine") throw new Error("CL_ENGINE_CONCLUDED_IN_CYCLE");
      if (!applicableOf(s, p.procedureId)) throw new Error("CL_PROCEDURE_NOT_APPLICABLE");
      const control = isControl(p.nature), records = s.records.filter(r => r.procedureId === p.procedureId);
      if (control !== !!command.reach) throw new Error(control ? "CL_REACH_REQUIRED" : "CL_REACH_UNEXPECTED");
      if (p.nature === "itgc" && !s.itgcScopes[p.procedureId]) throw new Error("CL_ITGC_SCOPE_REQUIRED");
      const population = s.populations[p.procedureId];
      if (!population) throw new Error("CL_POPULATION_REQUIRED");
      if (population.status === "absent") throw new Error("CL_POPULATION_ABSENT");
      const needed = control ? (command.reach === "fonctionnement" ? ["description", "mise_en_oeuvre", "test_fonctionnement"] : ["description", "mise_en_oeuvre"]) : ["execution"];
      if (needed.some(step => !records.some(r => r.step === step))) throw new Error("CL_WORK_INCOMPLETE");
      if (records.some(r => r.citations.some(c => isSuperseded(s, c)))) throw new Error("CL_EVIDENCE_SUPERSEDED");
      if (records.some(r => !r.citations.length)) throw new Error("CL_EVIDENCE_REQUIRED");
      if (Object.values(s.requests).some(r => r.procedureId === p.procedureId && !r.closed)) throw new Error("CL_PIECE_REQUEST_OPEN");
      const citations = resolveAll(s, command.citations);
      if (!corroborated([...records.flatMap(r => r.citations), ...citations])) throw new Error("CL_REPRESENTATION_ONLY");
      return { type: "conclude_procedure", payload: { procedureId: p.procedureId, text: command.text, ...(command.reach ? { reach: command.reach } : {}), citations, basisHash: procedureBasis(s, p.procedureId) } };
    }
    case "review_procedure": {
      const p = procedureOf(s, command.procedureId), conclusion = s.conclusions[p.procedureId];
      if (!conclusion) throw new Error("CL_CONCLUSION_REQUIRED");
      if (procedureBasis(s, p.procedureId) !== conclusion.basisHash || conclusion.citations.some(c => isSuperseded(s, c))) throw new Error("CL_CONCLUSION_STALE");
      // Review by another person (NEP 230 §08): neither the author of the conclusion nor of any work it rests on.
      if (conclusion.by === ctx.actorId || s.records.some(r => r.procedureId === p.procedureId && r.by === ctx.actorId)) throw new Error("CL_SELF_REVIEW_FORBIDDEN");
      if (command.decision === "approved" && Object.values(s.reviewPoints).some(r => r.target.kind === "procedure" && r.target.id === p.procedureId && !r.closed)) throw new Error("CL_REVIEW_POINT_OPEN");
      return { type: "review_procedure", payload: { procedureId: p.procedureId, decision: command.decision, text: command.text, conclusionSeq: conclusion.seq, basisHash: conclusion.basisHash } };
    }
    case "raise_review_point": {
      const t = command.target;
      if ((t.kind === "procedure" && !s.procedures[t.id]) || (t.kind === "misstatement" && !s.misstatements[t.id]) || (t.kind === "contradiction" && !s.contradictions[t.id])) throw new Error("CL_TARGET_UNKNOWN");
      return { type: "raise_review_point", payload: { pointId: nextId.point(s), target: t, text: command.text } };
    }
    case "answer_review_point": {
      const rp = s.reviewPoints[command.pointId];
      if (!rp) throw new Error("CL_REVIEW_POINT_UNKNOWN");
      if (rp.closed) throw new Error("CL_REVIEW_POINT_CLOSED");
      return { type: "answer_review_point", payload: { pointId: rp.pointId, text: command.text, citations: resolveAll(s, command.citations) } };
    }
    case "close_review_point": {
      const rp = s.reviewPoints[command.pointId];
      if (!rp) throw new Error("CL_REVIEW_POINT_UNKNOWN");
      if (rp.closed) throw new Error("CL_REVIEW_POINT_CLOSED");
      if (!rp.answers.length) throw new Error("CL_ANSWER_REQUIRED");
      if (rp.answers.at(-1)!.by === ctx.actorId) throw new Error("CL_SELF_CLOSE_FORBIDDEN");
      return { type: "close_review_point", payload: { pointId: rp.pointId, text: command.text } };
    }
    case "record_misstatement": {
      if (command.procedureId) procedureOf(s, command.procedureId);
      return { type: "record_misstatement", payload: { misstatementId: nextId.misstatement(s), ...(command.procedureId ? { procedureId: command.procedureId } : {}), cycle: command.cycle, description: command.description,
        amount: command.amount, citations: resolveAll(s, command.citations) } };
    }
    case "correct_misstatement": {
      const m = s.misstatements[command.misstatementId];
      if (!m) throw new Error("CL_MISSTATEMENT_UNKNOWN");
      if (m.correction) throw new Error("CL_MISSTATEMENT_ALREADY_CORRECTED");
      const citations = resolveAll(s, command.citations), original = new Set(m.citations.map(c => c.pieceVersionId));
      // A correction rests on new evidence: a piece version recorded after the misstatement, other than the pieces that revealed it, and not a representation alone.
      const fresh = citations.filter(c => !original.has(c.pieceVersionId) && s.pieces.find(x => x.pieceVersionId === c.pieceVersionId)!.seq > m.seq);
      if (!fresh.length) throw new Error("CL_NEW_EVIDENCE_REQUIRED");
      if (!corroborated(fresh)) throw new Error("CL_REPRESENTATION_ONLY");
      return { type: "correct_misstatement", payload: { misstatementId: m.misstatementId, text: command.text, citations } };
    }
    case "assess_misstatement": {
      const m = s.misstatements[command.misstatementId];
      if (!m) throw new Error("CL_MISSTATEMENT_UNKNOWN");
      if (m.correction) throw new Error("CL_MISSTATEMENT_ALREADY_CORRECTED");
      if (m.by === ctx.actorId) throw new Error("CL_SELF_REVIEW_FORBIDDEN");
      return { type: "assess_misstatement", payload: { misstatementId: m.misstatementId, text: command.text } };
    }
    case "record_limitation": {
      command.procedureIds.forEach(id => procedureOf(s, id));
      return { type: "record_limitation", payload: { limitationId: nextId.limitation(s), cycle: command.cycle, description: command.description, procedureIds: [...new Set(command.procedureIds)] } };
    }
    case "assess_limitation": {
      const l = s.limitations[command.limitationId];
      if (!l) throw new Error("CL_LIMITATION_UNKNOWN");
      if (l.by === ctx.actorId) throw new Error("CL_SELF_REVIEW_FORBIDDEN");
      return { type: "assess_limitation", payload: { limitationId: l.limitationId, text: command.text } };
    }
    case "record_contradiction": {
      command.procedureIds.forEach(id => procedureOf(s, id));
      const left = resolveCitation(s, command.left), right = resolveCitation(s, command.right);
      if (left.pieceId === right.pieceId) throw new Error("CL_CONTRADICTION_SAME_PIECE");
      return { type: "record_contradiction", payload: { contradictionId: nextId.contradiction(s), left, right, description: command.description, procedureIds: [...new Set(command.procedureIds)] } };
    }
    case "resolve_contradiction": {
      const c = s.contradictions[command.contradictionId];
      if (!c) throw new Error("CL_CONTRADICTION_UNKNOWN");
      if (c.resolution) throw new Error("CL_CONTRADICTION_RESOLVED");
      const citations = resolveAll(s, command.citations);
      if (!corroborated(citations)) throw new Error("CL_REPRESENTATION_ONLY");
      return { type: "resolve_contradiction", payload: { contradictionId: c.contradictionId, text: command.text, citations } };
    }
    case "validate_closing": {
      if (!ctx.closingAuthority) throw new Error("CL_CLOSING_AUTHORITY_FORBIDDEN");
      const evaluation = evaluateClosing(s, ctx.observations);
      if (!evaluation.closable) throw new Error("CL_CLOSING_BLOCKED");
      // The validation records what it rests on: the journal head and the observed cycle sheets. It is a human decision, not an audit opinion.
      return { type: "validate_closing", payload: { text: command.text, headHash: s.headHash, headSeq: s.seq, cycles: ctx.observations.filter(o => engineProcedure(o.procedure)).map(fingerprint) } };
    }
  }
}

/** A piece version: a new piece, or the next version of an existing one. Older versions stay readable; work citing them becomes « à réexaminer ». */
export function decideUpload(s: ClosingState, input: { expectedSeq: number; label: string; kind: PieceKind; pieceId?: string; fileName: string; sha256: string; size: number }): Decision {
  if (input.expectedSeq !== s.seq) throw new Error("CL_STALE_SEQ");
  if (!s.opened) throw new Error("CL_FILE_NOT_OPENED");
  if (currentValidation(s)) throw new Error("CL_FILE_CLOSED");
  const previous = input.pieceId ? latestPieceVersion(s, input.pieceId) : null;
  if (input.pieceId && !previous) throw new Error("CL_PIECE_UNKNOWN");
  if (previous && previous.kind !== input.kind) throw new Error("CL_PIECE_KIND_LOCKED");
  if (previous?.sha256 === input.sha256) throw new Error("CL_PIECE_UNCHANGED");
  const pieceId = previous?.pieceId ?? nextId.piece(s), version = (previous?.version ?? 0) + 1;
  return { type: "upload_piece", payload: { pieceVersionId: pieceId + "-v" + version, pieceId, version, fileName: input.fileName, label: input.label, sha256: input.sha256, size: input.size, kind: input.kind } };
}
