import { stableSha256 } from "@/lib/synthesis/canonical";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { CalculationRegistry } from "./calculations";
import { linkImportedEvidence } from "./evidence";
import type { MemoryImportRepository } from "./imports";
import { assertScope, contentHash, validateRun, type ProcedureTemplate, type Population, type SelectionSet, type WorkpaperRun, type WorkpaperScope, type WorkpaperState, type WorkpaperNote } from "./model";
import { authorize, assertTransition, type Permission, type Principal } from "./policy";
import type { WorkpaperRepository } from "./repository";
import { validateSelectionSources } from "./selection";
import { projectLockedWorkpaper } from "./projection";

/** No production session provider exists yet. Never derive identity from a request body. */
export type TrustedSession = () => Promise<Principal | null>;
export const disabledSession: TrustedSession = async () => null;
export class WorkpaperService {
  constructor(private readonly repository: WorkpaperRepository, private readonly imports: MemoryImportRepository,
    private readonly calculations: CalculationRegistry, private readonly session: TrustedSession = disabledSession,
    private readonly clock: () => string = () => new Date().toISOString()) {}
  private async actor(scope: WorkpaperScope, permission: Permission) {
    const actor = await this.session(); authorize(actor, scope, permission);
    if (scope.mode !== "demo") throw new Error("REAL_WORKPAPER_DISABLED_AUTH_AND_DURABLE_STORAGE_REQUIRED");
    return actor!;
  }
  private stamp(run: WorkpaperRun, actor: Principal, action: string): WorkpaperRun {
    const at = this.clock(); if (!Number.isFinite(Date.parse(at))) throw new Error("EVENT_TIMESTAMP_INVALID");
    return { ...run, events: [...run.events, { id: `${run.id}:${run.version}`, action, actorId: actor.id, at, version: run.version }] };
  }
  async get(scope: WorkpaperScope, id: string) { await this.actor(scope, "read"); return this.repository.get(scope, id); }
  async history(scope: WorkpaperScope, id: string) { await this.actor(scope, "read"); return this.repository.history(scope, id); }
  async download(scope: WorkpaperScope, documentId: string) { const actor = await this.actor(scope, "download"); return this.imports.download(scope, documentId, actor); }
  async create(scope: WorkpaperScope, period: AccountingPeriod, template: ProcedureTemplate, instanceKey: string) {
    const actor = await this.actor(scope, "prepare"); if (!instanceKey.trim()) throw new Error("INSTANCE_KEY_REQUIRED");
    const id = `workpaper-${stableSha256({ scope, template: { id: template.id, version: template.version }, instanceKey })}`;
    return this.repository.create(this.stamp(validateRun({ id, rootId: id, revision: 1, version: 1, schemaVersion: "1.0.0", scope, period, template,
      state: "draft", preparedBy: actor.id, importIds: [], evidence: [], findings: [], notes: [], events: [] }), actor, "create"));
  }
  private async edit(scope: WorkpaperScope, id: string, version: number, action: string, update: (run: WorkpaperRun, actor: Principal) => WorkpaperRun) {
    const actor = await this.actor(scope, "prepare");
    return this.repository.compareAndSwap(scope, id, version, (run) => {
      if (!["draft", "executed"].includes(run.state) || run.preparedBy !== actor.id) throw new Error("PREPARATION_EDIT_FORBIDDEN");
      return this.stamp({ ...update(run, actor), version: version + 1 }, actor, action);
    });
  }
  async attachInputs(scope: WorkpaperScope, id: string, version: number, population: Population, selection: SelectionSet) {
    return this.edit(scope, id, version, "inputs", (run, actor) => {
      if (run.state !== "draft") throw new Error("INPUTS_ALREADY_FROZEN");
      assertScope(scope, population.scope); assertScope(scope, selection.scope);
      if (selection.validatedBy !== actor.id) throw new Error("SELECTION_VALIDATOR_MISMATCH");
      const imports = population.importIds.map((i) => this.imports.get(scope, i, actor));
      validateSelectionSources(population, selection, imports);
      if (run.template.requiredDocumentTypes.some((t) => !imports.some((b) => b.document.documentType === t))) throw new Error("REQUIRED_DOCUMENT_MISSING");
      return { ...run, importIds: [...population.importIds], population, selection };
    });
  }
  async addEvidence(scope: WorkpaperScope, id: string, version: number, importId: string, rowId: string, purpose: string, cell?: string) {
    return this.edit(scope, id, version, "evidence", (run, actor) => {
      const link = linkImportedEvidence(run, this.imports.get(scope, importId, actor), rowId, purpose, actor, cell);
      return { ...run, evidence: [...run.evidence.filter((e) => e.id !== link.id), link] };
    });
  }
  async conclude(scope: WorkpaperScope, id: string, version: number, text: string) {
    if (!text.trim()) throw new Error("CONCLUSION_REQUIRED");
    return this.edit(scope, id, version, "conclusion", (run) => ({ ...run, conclusion: text }));
  }
  async addNote(scope: WorkpaperScope, id: string, version: number, note: Omit<WorkpaperNote, "authorId" | "resolution">) {
    return this.edit(scope, id, version, "note", (run, actor) => {
      if (!note.id || run.notes.some((n) => n.id === note.id)) throw new Error("NOTE_ID_INVALID");
      return { ...run, notes: [...run.notes, { ...note, authorId: actor.id }] };
    });
  }
  async resolveNote(scope: WorkpaperScope, id: string, version: number, noteId: string, text: string) {
    return this.edit(scope, id, version, "resolve_note", (run, actor) => {
      if (!text.trim() || !run.notes.some((n) => n.id === noteId && !n.resolution)) throw new Error("NOTE_RESOLUTION_INVALID");
      return { ...run, notes: run.notes.map((n) => n.id === noteId ? { ...n, resolution: { text, authorId: actor.id, at: this.clock() } } : n) };
    });
  }
  async execute(scope: WorkpaperScope, id: string, version: number, parameters: unknown) {
    const actor = await this.actor(scope, "prepare");
    return this.repository.compareAndSwap(scope, id, version, (run) => {
      if (run.state !== "ready" || run.preparedBy !== actor.id || run.template.kind !== "calculated" || !run.template.rule || !run.population || !run.selection) throw new Error("CALCULATION_NOT_READY");
      const result = this.calculations.execute({ scope, period: run.period, rule: run.template.rule, imports: run.importIds.map((i) => this.imports.get(scope, i, actor)), population: run.population, selection: run.selection, parameters });
      const state = result.execution === "completed" ? "executed" : result.execution;
      assertTransition({ ...run, result }, state, actor);
      return this.stamp({ ...run, result, findings: result.findings, state, version: version + 1 }, actor, "execute");
    });
  }
  async recordManual(scope: WorkpaperScope, id: string, version: number, observation: string, outcome: "no_exception_detected" | "exceptions_detected" | "inconclusive") {
    const actor = await this.actor(scope, "prepare");
    return this.repository.compareAndSwap(scope, id, version, (run) => {
      if (run.state !== "ready" || run.template.kind !== "manual" || run.preparedBy !== actor.id || !observation.trim()) throw new Error("MANUAL_RESULT_INVALID");
      if (!["no_exception_detected", "exceptions_detected", "inconclusive"].includes(outcome)) throw new Error("MANUAL_OUTCOME_INVALID");
      const input = { scope, period: run.period, template: run.template, observation, outcome, evidence: run.evidence };
      const inputHash = stableSha256(input);
      const result = { id: `manual-${inputHash}`, calculationKey: run.template.id, ruleVersion: run.template.version, inputHash, scope, period: run.period,
        execution: "completed" as const, outcome, sourceRefs: [], input, result: { observation }, findings: [], warnings: ["Observation humaine, pas une assurance sur les comptes"], blockedControls: [] };
      assertTransition({ ...run, result }, "executed", actor);
      return this.stamp({ ...run, result, state: "executed", version: version + 1 }, actor, "manual_result");
    });
  }
  async transition(scope: WorkpaperScope, id: string, version: number, target: WorkpaperState, note = "", expectedHash?: string) {
    const actor = await this.actor(scope, ["approved", "changes_requested", "locked"].includes(target) ? "review" : "prepare");
    if (["executed", "blocked", "failed", "superseded", "locked"].includes(target)) throw new Error("USE_DEDICATED_COMMAND");
    return this.repository.compareAndSwap(scope, id, version, (run) => {
      assertTransition(run, target, actor, expectedHash);
      if (["approved", "changes_requested"].includes(target) && !note.trim()) throw new Error("REVIEW_NOTE_REQUIRED");
      if (["ready", "awaiting_review"].includes(target) && actor.id !== run.preparedBy) throw new Error("PREPARER_REQUIRED");
      if (target === "changes_requested" && expectedHash !== run.submittedHash) throw new Error("STALE_REVIEW");
      const next: WorkpaperRun = { ...run, state: target, version: version + 1 };
      if (target === "awaiting_review") next.submittedHash = contentHash(run);
      if (target === "changes_requested") next.notes = [...run.notes, { id: `${run.id}:review:${version}`, kind: "judgment", text: note, amount: { kind: "not_applicable", reason: "Note de revue" }, authorId: actor.id, blocking: true }];
      if (target === "approved") next.approval = { actorId: actor.id, snapshotHash: contentHash(run), note, at: this.clock(), version: next.version };
      return this.stamp(next, actor, target);
    });
  }
  async revise(scope: WorkpaperScope, id: string, version: number) {
    const actor = await this.actor(scope, "prepare");
    return this.repository.revise(scope, id, version, (old) => {
      const nextId = `${old.rootId}:r${old.revision + 1}`;
      return this.stamp({ ...old, id: nextId, revision: old.revision + 1, version: 1, state: "draft", preparedBy: actor.id, supersedes: old.id,
        previousLockedId: old.state === "locked" ? old.id : old.previousLockedId,
        result: undefined, findings: [], approval: undefined, submittedHash: undefined, conclusion: undefined,
        evidence: old.evidence.map((e) => ({ ...e, id: `${e.id}:r${old.revision + 1}`, procedureId: nextId })), events: [] }, actor, "revise");
    });
  }
  async projection(scope: WorkpaperScope) { await this.actor(scope, "read"); return this.repository.projection(scope); }
  async lockAndProject(scope: WorkpaperScope, id: string, version: number, baseline: DossierSnapshot) {
    const actor = await this.actor(scope, "review"); authorize(actor, scope, "read");
    return this.repository.lockAndProject(scope, id, version, baseline, (run) => {
      assertTransition(run, "locked", actor);
      return this.stamp({ ...run, state: "locked", version: version + 1 }, actor, "locked");
    }, (snapshot, run) => projectLockedWorkpaper(snapshot, run, actor));
  }
}
