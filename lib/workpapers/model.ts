import { z } from "zod";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { Finding } from "@/lib/canonical-model/finding";
import type { CalculationRun, CalculationScope } from "@/lib/canonical-model/calculation";
import { cents, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { isCivilDate, periodIssues, type AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";

export const WORKPAPER_SCHEMA_VERSION = "1.0.0";
export const scopeSchema = z.object({ organizationId: z.string().trim().min(1), dossierId: z.string().trim().min(1), periodId: z.string().min(1), mode: z.enum(["demo", "real"]) }).strict();
export interface WorkpaperScope extends CalculationScope { periodId: string }
export const moneySchema = z.object({ amount: z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/), currency: z.literal("EUR") }).strict();
export const knownAmountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), value: moneySchema }).strict(),
  z.object({ kind: z.literal("unknown"), reason: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal("not_applicable"), reason: z.string().trim().min(1) }).strict(),
]);
export function periodId(period: AccountingPeriod): string {
  return `period-${stableSha256({ start: period.startDate, close: period.closingDate, currency: period.currency })}`;
}
export function assertScope(expected: WorkpaperScope, actual: WorkpaperScope) {
  scopeSchema.parse(expected); scopeSchema.parse(actual);
  if (stableSha256(expected) !== stableSha256(actual)) throw new Error("WORKPAPER_SCOPE_MISMATCH");
}
export function frozen<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (v: unknown): void => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}
export interface RuleReference {
  id: string; version: string; authority: "internal" | "methodology" | "law";
  source: string; effectiveFrom: string; effectiveTo?: string; validation: "provisional" | "validated";
}
export interface ProcedureTemplate {
  id: string; version: string; objective: string; kind: "manual" | "calculated";
  assertions: { label: string; validation: "unknown" | "proposed" | "validated" }[];
  requiredDocumentTypes: string[]; rule?: RuleReference;
}
export interface SourceDocumentVersion {
  id: string; logicalId: string; scope: WorkpaperScope; fileName: string;
  format: "csv" | "xlsx" | "pdf"; documentType: string; byteHash: string;
  storageRef: string; sizeBytes: number; parserVersion: string;
}
export interface SourceLocator { sheet?: string; row?: number; cell?: string; page?: number; zone?: string }
export interface SourceRow {
  id: string; documentVersionId: string; scope: WorkpaperScope; locator: SourceLocator;
  original: Record<string, string>; normalized?: { key: string; amount: Money; date: string }; errors: string[];
}
export interface EvidenceLink {
  id: string; scope: WorkpaperScope; procedureId: string; documentVersionId: string;
  rowId?: string; locator?: SourceLocator; precision: "cell" | "row" | "page" | "zone" | "document";
  status: "verified" | "suggestion"; purpose: string;
}
export interface Population {
  id: string; scope: WorkpaperScope; importIds: string[]; unit: "row" | "invoice" | "third_party";
  items: { id: string; rowIds: string[]; amount: Money }[]; hash: string;
}
export interface SelectionSet {
  id: string; scope: WorkpaperScope; populationHash: string; method: "targeted" | "random";
  criteria: string; exclusions: { id: string; reason: string }[]; requestedSize: number;
  validatedBy: string; seed?: string; algorithm: string; selectedIds: string[];
  selectedAmount: Money; limitations: string[];
}
export type WorkpaperState = "draft" | "ready" | "executed" | "awaiting_review" | "changes_requested" | "approved" | "locked" | "superseded" | "blocked" | "failed";
/** Unquantified observations are notes, never fake zero-valued legacy Findings. */
export interface WorkpaperNote {
  id: string; kind: "observation" | "validated_anomaly" | "missing_evidence" | "limitation" | "judgment";
  text: string; amount: KnownAmount; authorId: string; blocking: boolean;
  resolution?: { text: string; authorId: string; at: string };
}
export interface Approval { actorId: string; snapshotHash: string; note: string; at: string; version: number }
export interface WorkpaperRun {
  id: string; rootId: string; revision: number; version: number; schemaVersion: typeof WORKPAPER_SCHEMA_VERSION;
  scope: WorkpaperScope; period: AccountingPeriod; template: ProcedureTemplate; state: WorkpaperState;
  preparedBy: string; importIds: string[]; population?: Population; selection?: SelectionSet;
  result?: CalculationRun; evidence: EvidenceLink[]; findings: Finding[]; notes: WorkpaperNote[];
  conclusion?: string; submittedHash?: string; approval?: Approval; supersedes?: string; previousLockedId?: string;
  events: { id: string; action: string; actorId: string; at: string; version: number }[];
}
export function contentHash(run: WorkpaperRun): string {
  return stableSha256({ id: run.id, rootId: run.rootId, revision: run.revision, supersedes: run.supersedes, previousLockedId: run.previousLockedId, scope: run.scope, period: run.period, template: run.template, importIds: run.importIds, population: run.population, selection: run.selection, result: run.result, evidence: run.evidence, findings: run.findings, notes: run.notes, conclusion: run.conclusion, preparedBy: run.preparedBy });
}
export function validateRun(run: WorkpaperRun): WorkpaperRun {
  scopeSchema.parse(run.scope);
  if (periodIssues(run.period).length || run.scope.periodId !== periodId(run.period)) throw new Error("WORKPAPER_PERIOD_INVALID");
  if (!run.id || !run.preparedBy || !run.template.id || !run.template.version || !run.template.objective.trim() || !["manual", "calculated"].includes(run.template.kind)) throw new Error("WORKPAPER_TEMPLATE_INVALID");
  if (!Number.isSafeInteger(run.version) || run.version < 1 || !Number.isSafeInteger(run.revision) || run.revision < 1) throw new Error("WORKPAPER_VERSION_INVALID");
  if (run.schemaVersion !== WORKPAPER_SCHEMA_VERSION) throw new Error("WORKPAPER_SCHEMA_UNSUPPORTED");
  if (!["draft","ready","executed","awaiting_review","changes_requested","approved","locked","superseded","blocked","failed"].includes(run.state)) throw new Error("WORKPAPER_STATE_INVALID");
  if (run.template.rule) {
    const r = run.template.rule;
    if (!r.id || !r.version || !r.source || !["internal", "methodology", "law"].includes(r.authority) || !["provisional", "validated"].includes(r.validation) || !isCivilDate(r.effectiveFrom) || (r.effectiveTo && (!isCivilDate(r.effectiveTo) || r.effectiveTo < r.effectiveFrom))) throw new Error("RULE_REFERENCE_INVALID");
  }
  if (run.template.assertions.some((a) => !a.label.trim() || !["unknown", "proposed", "validated"].includes(a.validation))) throw new Error("ASSERTION_INVALID");
  for (const item of run.evidence) { assertScope(run.scope, item.scope); if (item.procedureId !== run.id) throw new Error("EVIDENCE_TARGET_MISMATCH"); }
  if (run.population) { assertScope(run.scope, run.population.scope); run.population.items.forEach((i) => cents(i.amount)); }
  if (run.selection) { assertScope(run.scope, run.selection.scope); if (run.selection.populationHash !== run.population?.hash) throw new Error("SELECTION_POPULATION_STALE"); }
  for (const note of run.notes) {
    knownAmountSchema.parse(note.amount);
    if (!note.id || !note.text.trim() || !note.authorId || typeof note.blocking !== "boolean" || !["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"].includes(note.kind)) throw new Error("NOTE_INVALID");
    if (note.resolution && (!note.resolution.text.trim() || !note.resolution.authorId || !Number.isFinite(Date.parse(note.resolution.at)))) throw new Error("NOTE_RESOLUTION_INVALID");
  }
  if (new Set(run.notes.map((n) => n.id)).size !== run.notes.length) throw new Error("DUPLICATE_NOTE");
  if (run.result && (run.result.scope.organizationId !== run.scope.organizationId || run.result.scope.dossierId !== run.scope.dossierId || run.result.scope.mode !== run.scope.mode || stableSha256(run.result.period) !== stableSha256(run.period))) throw new Error("RESULT_SCOPE_MISMATCH");
  if (run.approval && (run.approval.actorId === run.preparedBy || !run.approval.note.trim() || run.approval.snapshotHash !== contentHash(run) || !Number.isFinite(Date.parse(run.approval.at)))) throw new Error("APPROVAL_INVALID");
  if (["approved", "locked", "superseded"].includes(run.state) && !run.approval) throw new Error("APPROVAL_REQUIRED");
  if (run.result && run.result.execution !== "completed" && run.result.outcome !== "inconclusive") throw new Error("FAILED_RESULT_CANNOT_CONCLUDE");
  if (new Set(run.findings.map((f) => f.id)).size !== run.findings.length) throw new Error("DUPLICATE_FINDING");
  return run;
}
export interface WorkpaperEnvelope { version: "1.0.0"; runs: WorkpaperRun[] }
/** Additive payload migration; no invented historical result or period. */
export function migrateWorkpaperSnapshot(snapshot: DossierSnapshot): DossierSnapshot {
  if (snapshot.workpapers) {
    if (snapshot.workpapers.version !== WORKPAPER_SCHEMA_VERSION) throw new Error("WORKPAPER_SCHEMA_UNSUPPORTED");
    snapshot.workpapers.runs.forEach(validateRun);
    return frozen(snapshot);
  }
  return frozen({ ...snapshot, workpapers: { version: WORKPAPER_SCHEMA_VERSION, runs: [] } });
}
