import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { CASH_LIMITATIONS, cashResultSchema, type CashResult } from "./cash-reconciliation";
import { CASH_SOURCE_LABELS, CASH_TYPES } from "./cash-sources";
import type { CashSourceHead } from "./cash-store";

/** Closed programme: its denominators exist before any result or exception. */
export const CASH_MISSION_PROGRAM = {
  id: "cash.program", version: "1.0.0", label: "Programme Trésorerie : pont bancaire et apurement des suspens",
  procedures: [{ id: "cash.reconciliation", version: "1.0.0", label: "Pont bancaire et apurement des suspens",
    requiredSources: ["cash_ledger", "cash_statement", "cash_erb"], conditionalSources: ["cash_settlements", "cash_support"],
    tests: [{ id: "bridge", label: "Pont relevé + suspens → GL", dimension: "account" }, { id: "sources", label: "Concordance ERB / relevé / GL", dimension: "account" }, { id: "clearance", label: "Apurement postérieur des suspens", dimension: "item" }] }],
  outOfScope: ["Caisse : procédure distincte", "VMP : procédure distincte", "Confirmations bancaires, pouvoirs et engagements", "Comptes en devises autres que l’EUR"],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export type CashMissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export type CashMissionSelection = { rootId?: string; id?: string; version?: number };
const CONVENTIONS: Record<string, string> = {
  bridge: "Relevé + suspens signés = solde reconstitué ; écart du pont = GL − reconstitué ; aucune compensation entre comptes.",
  sources: "Écarts de source calculés séparément (ERB comptable − GL, ERB banque − relevé, arithmétique de l’ERB) ; jamais additionnés à l’écart du pont.",
  clearance: "Suspens à la clôture rapprochés des relevés postérieurs de la fenêtre documentée ; la clôture n’est jamais réécrite.",
};
export function cashAmountLabel(amount: KnownAmount | Money | null | undefined) {
  if (!amount) return "Non calculé";
  if ("amount" in amount) return amount.amount + " EUR";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function cashLocatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page].filter(Boolean).join(", ") || "Document entier";
}
export function cashSheetHref(scope: Pick<WorkpaperScope, "dossierId" | "periodId">, run: Pick<WorkpaperRun, "id" | "version"> | null, filter: CashMissionFilter, target: { accountId?: string | null; itemId?: string; noteId?: string } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(run ? { id: run.id, version: String(run.version) } : {}), filter });
  if (target.accountId) params.set("account", target.accountId);
  if (target.itemId) params.set("item", target.itemId);
  if (target.noteId) params.set("noteId", target.noteId);
  return "/tresorerie?" + params;
}
/** Result accepted only if it is the run’s own, for its own scope and period. */
export function cashResultOf(run: WorkpaperRun | undefined | null): CashResult | null {
  if (!run?.result || run.result.execution !== "completed") return null;
  const parsed = cashResultSchema.safeParse(run.result.result);
  return parsed.success && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && parsed.data.closingDate === run.period.closingDate && parsed.data.reviewDate === run.period.asOfDate ? parsed.data : null;
}

export function buildCashMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: CashSourceHead[], selection: CashMissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (v.template.id !== "cash.reconciliation") throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const roots = [...new Set(versions.map(v => v.rootId))].sort(canonicalCompare);
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  const rootId = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(v => v.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition = CASH_MISSION_PROGRAM.procedures[0];
  const cash = cashResultOf(run);
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version Trésorerie plus récente est disponible.");
  if (run?.importIds.some(id => !heads.some(h => h.import_id === id))) staleReasons.push("Une source Trésorerie approuvée a été remplacée.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push("La version de règle Trésorerie diffère du programme.");
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  const resultLabel = !run?.result ? "Non exécuté" : !cash ? "Calcul Trésorerie bloqué ou contrat invalide" : cash.exceptions.some(e => e.code !== "WINDOW_INCOMPLETE" && e.code !== "BRIDGE_SOURCE_MISSING") ? "Exceptions maintenues" : cash.controls.some(c => c.outcome === "inconclusive") ? "Travaux partiels — non concluant sur une partie" : "Aucun écart sur le périmètre testé — authenticité non démontrée";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  const controls = definition.tests.map(test => {
    const control = cash?.controls.find(c => c.id === test.id);
    return { id: test.id, label: test.label, ruleVersion: definition.version, convention: CONVENTIONS[test.id], conventionValidated: !!cash, outcome: control?.outcome ?? null,
      coverage: { numerator: control?.numerator ?? 0, denominator: control?.denominator ?? null, unit: control?.unit ?? (test.dimension === "account" ? "comptes bancaires EUR" : "suspens"), exclusions: control?.exclusions ?? [] },
      complete: !!control && control.denominator > 0 && control.numerator === control.denominator };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size, denominator: run?.population?.items.length ?? null,
    unit: "comptes sélectionnés / comptes de trésorerie du GL figé", exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const procedure = { id: definition.id as string, label: definition.label as string, runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null, version: run?.version ?? null,
    contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null, period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée",
    resultId: run?.result?.id ?? null, resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, controls, notes: run?.notes ?? [], evidence: run?.evidence ?? [], cash,
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null };
  const required: readonly string[] = definition.requiredSources, conditional: readonly string[] = definition.conditionalSources;
  const batches = imports.filter(b => run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id));
  const sources = CASH_TYPES.flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type);
    if (found.length) return found.map(b => ({ id: b.document.id, importId: b.id as string | null, type, label: CASH_SOURCE_LABELS[type], fileName: b.document.fileName as string | null, sha256: b.document.byteHash as string | null,
      parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
      current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, available: true, required: required.includes(type), binaryInPackage: false as const, locators: b.rows.map(row => ({ rowId: row.id, locator: row.locator })) }));
    return required.includes(type) || conditional.includes(type) ? [{ id: "expected:" + type, importId: null, type, label: CASH_SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null, mappingVersion: null, mappingHash: null,
      approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false, required: required.includes(type), binaryInPackage: false as const, locators: [] }] : [];
  });
  const queue: { id: string; category: CashMissionFilter; priority: number; label: string; detail: string; href: string; proofIds: string[]; noteId?: string }[] = [];
  const add = (id: string, category: CashMissionFilter, priority: number, label: string, detail: string, proofIds: string[] = [], target: { accountId?: string | null; itemId?: string; noteId?: string } = {}) =>
    queue.push({ id, category, priority, label, detail, proofIds, ...(target.noteId ? { noteId: target.noteId } : {}), href: cashSheetHref(scope, run ?? null, category, target) });
  if (!run) add("procedure:pending", "blocked", 1, roots.length > 1 ? "Affecter une feuille Trésorerie" : "Pont bancaire à préparer", "Procédure prévue : pont, concordance ERB et apurement, trois contrôles.");
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail Trésorerie périmé", reason));
  sources.filter(s => s.required && (!s.available || !s.approvedBy)).forEach(s => add("source:" + s.id, "evidence", 2, "Source Trésorerie approuvée attendue", s.label));
  if (!sources.some(s => s.type === "cash_settlements" && s.available)) add("source:settlements", "evidence", 2, "Relevés postérieurs attendus", "Sans relevés postérieurs, l’apurement des suspens reste non testé.");
  if (run && !run.result) add("procedure:prepare", "blocked", 2, run.population ? "Pont à exécuter" : "Sources et fenêtre à figer", "Le programme prévoit cette procédure, même sans exception.");
  if (run?.result && !cash) add("result:invalid", "blocked", 1, "Contrat de résultat Trésorerie invalide", "Le calcul n’est pas restitué comme un résultat exploitable.");
  cash?.exceptions.forEach(e => add(e.id, e.code === "WINDOW_INCOMPLETE" || e.code === "BRIDGE_SOURCE_MISSING" ? "evidence" : "exceptions", 3, e.label, e.message + " · " + cashAmountLabel(e.amount), e.proofIds, { accountId: e.accountId, itemId: e.code.startsWith("SUSPENSE") ? e.targetId : undefined }));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant Trésorerie" : "Traitement à documenter", n.text, [], { noteId: n.id }));
  if (run && ["executed", "awaiting_review", "changes_requested", "approved"].includes(run.state)) add("review:pending", "review", 4, run.state === "approved" ? "Verrouillage attendu" : run.state === "executed" ? "Soumission à préparer" : run.state === "changes_requested" ? "Correction demandée" : "Revue attendue", "Décision sur cette version ; les exceptions restent dans le résultat.");
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { schemaVersion: "cash-mission-1.0.0", stateAsOf: stateDates.at(-1) ?? null, sourceFamily: "mission_procedures", scope, program: CASH_MISSION_PROGRAM,
    assignment: { rootId: rootId ?? null, choices: roots, currentRunId: current?.id ?? null, currentVersion: current?.version ?? null },
    procedure, sources, queue,
    counters: { planned: CASH_MISSION_PROGRAM.procedures.length, plannedParts: definition.tests.length, executed: cash ? 1 : 0, reviewed: review && !stale ? 1 : 0, locked: run?.state === "locked" && !stale ? 1 : 0, stale: stale ? 1 : 0,
      testedParts: controls.filter(c => c.complete).length, exceptions: cash?.exceptions.filter(e => e.code !== "WINDOW_INCOMPLETE" && e.code !== "BRIDGE_SOURCE_MISSING").length ?? 0, uncertainties: cash?.exceptions.filter(e => e.code === "WINDOW_INCOMPLETE" || e.code === "BRIDGE_SOURCE_MISSING").length ?? 0 },
    amountGrouping: { groups: [] as never[], reason: "Aucun regroupement par événement économique : écarts conservés par compte et par suspens, sans total d’exposition ni compensation entre comptes." },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    limitations: [...CASH_LIMITATIONS, "Revue documentée ne signifie pas conformité des comptes ; aucune opinion automatique.", "Pièces binaires absentes du paquet ; téléchargement séparé soumis aux mêmes permissions.", "SHA-256 = intégrité, sans signature légale ni archivage certifié."] };
  return frozen({ ...body, hash: stableSha256(body) });
}
export type CashMissionSnapshot = ReturnType<typeof buildCashMission>;
