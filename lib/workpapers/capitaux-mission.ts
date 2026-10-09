import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { EQ_LEGAL_TEXT, EQ_UNCERTAINTY_CODES, EQUITY_LIMITATIONS, equityResultSchema, type EquityResult } from "./capitaux-review";
import { EQ_SOURCE_LABELS, EQ_TABULAR_TYPES, equitySourcesCurrent, type EqComponent, type EquitySourceType } from "./capitaux-sources";
import type { EquitySourceHead } from "./capitaux-store";

/** Closed programme: its denominators exist before any result or exception. */
export const EQUITY_MISSION_PROGRAM = {
  id: "capitaux_propres.program", version: "1.0.0", label: "Programme Capitaux propres : décisions, mouvements et tableau de variation",
  procedures: [{ id: "capitaux_propres.review", version: "1.0.0", label: "Décisions, mouvements, transferts internes et tableau de variation",
    requiredSources: ["eq_balances", "eq_entries"], conditionalSources: ["eq_variation", "eq_decisions", "eq_payments", "eq_minutes"],
    tests: [{ id: "bridge", label: "Pont par composante", dimension: "component" }, { id: "statement", label: "Tableau de variation fourni ↔ reconstitué", dimension: "cell" },
      { id: "decisions", label: "Décisions ↔ comptabilisation", dimension: "decision" }, { id: "entries", label: "Écritures ↔ décisions", dimension: "movement" },
      { id: "minutes", label: "Décisions appuyées par le PV lu", dimension: "decision" }] }],
  outOfScope: ["Régularité juridique des décisions (convocation, quorum, majorité, pouvoirs)", "Règles propres à la forme sociale : réserve légale, capitaux propres inférieurs à la moitié du capital, conditions de distribution", "Autres fonds propres et leur qualification", "Traitement comptable des événements postérieurs à la clôture", "Capital souscrit non appelé, actions propres et instruments composés"],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export type EquityMissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export type EquityMissionSelection = { rootId?: string; id?: string; version?: number };
const CONVENTIONS: Record<string, string> = {
  bridge: "Pour chaque composante : clôture observée − (ouverture + mouvements de l’exercice) ; aucune compensation entre composantes ; une composante incomplète reste inconnue.",
  statement: "Chaque cellule du tableau fourni (composante × colonne) comparée à la cellule reconstituée depuis la balance et les écritures ; une cellule absente n’est pas lue comme nulle.",
  decisions: "Ligne de décision à effet dans l’exercice comparée aux écritures qui la citent (même composante, même nature) après lecture validée du PV ; écart = comptabilisé − voté ; paiement présenté à part.",
  entries: "Écriture d’une nature appelant une décision rapprochée de la ligne citée ; effet hors période signalé ; aucune décision déduite d’un montant.",
  minutes: "Lecture humaine de la transcription à la page citée du PV versionné ; elle cite la pièce, la version et la page.",
};
export function equityAmountLabel(amount: KnownAmount | Money | null | undefined) {
  if (!amount) return "Non calculé";
  if ("amount" in amount) return amount.amount + " EUR";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function equityLocatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page].filter(Boolean).join(", ") || "Document entier";
}
export function equitySheetHref(scope: Pick<WorkpaperScope, "dossierId" | "periodId">, run: Pick<WorkpaperRun, "id" | "version"> | null, filter: EquityMissionFilter, target: { component?: EqComponent | null; item?: string | null; noteId?: string } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(run ? { id: run.id, version: String(run.version) } : {}), filter });
  if (target.component) params.set("component", target.component);
  if (target.item) params.set("item", target.item);
  if (target.noteId) params.set("noteId", target.noteId);
  return "/capitaux-propres?" + params;
}
/** Result accepted only if it is the run’s own, for its own scope and period. */
export function equityResultOf(run: WorkpaperRun | undefined | null): EquityResult | null {
  if (!run?.result || run.result.execution !== "completed") return null;
  const parsed = equityResultSchema.safeParse(run.result.result);
  return parsed.success && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && parsed.data.closingDate === run.period.closingDate && parsed.data.reviewDate === run.period.asOfDate ? parsed.data : null;
}
const isUncertainty = (code: EquityResult["exceptions"][number]["code"]) => EQ_UNCERTAINTY_CODES.includes(code);
/** Exception target → sheet item: a decision line (« D: »), a movement (« M: ») or a component. */
function itemOf(e: EquityResult["exceptions"][number]) {
  return ["DECISION_WITHOUT_ENTRY", "AMOUNT_DIVERGENT", "PV_MISSING", "READING_PENDING"].includes(e.code) ? "D:" + e.targetId : ["ENTRY_WITHOUT_DECISION", "ENTRY_DECISION_MISMATCH", "EFFECT_OUTSIDE_PERIOD"].includes(e.code) ? "M:" + e.targetId : null;
}

export function buildEquityMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: EquitySourceHead[], selection: EquityMissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (v.template.id !== "capitaux_propres.review") throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const roots = [...new Set(versions.map(v => v.rootId))].sort(canonicalCompare);
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  const rootId = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(v => v.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition = EQUITY_MISSION_PROGRAM.procedures[0];
  const equity = equityResultOf(run);
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version Capitaux propres plus récente est disponible.");
  if (run && !equitySourcesCurrent(run.importIds, heads)) staleReasons.push("Une source Capitaux propres approuvée (y compris un PV) a été remplacée ou ajoutée depuis le gel.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push("La version de règle Capitaux propres diffère du programme.");
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  // No label can read as a legal green light: the best case is « aucun écart sur le périmètre testé ».
  const resultLabel = !run?.result ? "Non exécuté" : !equity ? "Calcul Capitaux propres bloqué ou contrat invalide" : equity.exceptions.some(e => !isUncertainty(e.code)) ? "Exceptions maintenues" : equity.controls.some(c => c.outcome === "inconclusive") ? "Travaux partiels — non concluant sur une partie" : "Aucun écart sur le périmètre testé — aucune conclusion juridique";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  const controls = definition.tests.map(test => {
    const control = equity?.controls.find(c => c.id === test.id);
    return { id: test.id, label: test.label, ruleVersion: definition.version, convention: CONVENTIONS[test.id], conventionValidated: !!equity, outcome: control?.outcome ?? null,
      coverage: { numerator: control?.numerator ?? 0, denominator: control?.denominator ?? null, unit: control?.unit ?? test.label, exclusions: control?.exclusions ?? [] },
      complete: !!control && control.denominator > 0 && control.numerator === control.denominator };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size, denominator: run?.population?.items.length ?? null,
    unit: "décisions et mouvements sélectionnés / décisions et mouvements des sources figées", exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const procedure = { id: definition.id as string, label: definition.label as string, runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null, version: run?.version ?? null,
    contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null, period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée",
    resultId: run?.result?.id ?? null, resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, controls, notes: run?.notes ?? [], evidence: run?.evidence ?? [], equity,
    legal: { conclusion: "Aucune conclusion juridique", meaning: EQ_LEGAL_TEXT },
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null };
  const required: readonly string[] = definition.requiredSources, conditional: readonly string[] = definition.conditionalSources;
  const batches = imports.filter(b => run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id));
  const sourceRow = (b: ImportBatch, type: EquitySourceType) => ({ id: b.document.id, importId: b.id as string | null, type, label: EQ_SOURCE_LABELS[type] + (type === "eq_minutes" ? " — " + (b.mapping.capitaux?.pieceRef ?? "") : ""), fileName: b.document.fileName as string | null, sha256: b.document.byteHash as string | null,
    parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
    current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, available: true, required: required.includes(type), binaryInPackage: false as const, locators: b.rows.map(row => ({ rowId: row.id, locator: row.locator as EvidenceLink["locator"] })) });
  const expected = (type: EquitySourceType) => ({ id: "expected:" + type, importId: null, type, label: EQ_SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null, mappingVersion: null, mappingHash: null,
    approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false, required: required.includes(type), binaryInPackage: false as const, locators: [] as { rowId: string; locator: EvidenceLink["locator"] }[] });
  const sources = ([...EQ_TABULAR_TYPES, "eq_minutes"] as EquitySourceType[]).flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type).sort((a, b) => canonicalCompare(a.document.logicalId, b.document.logicalId));
    return found.length ? found.map(b => sourceRow(b, type)) : required.includes(type) || conditional.includes(type) ? [expected(type)] : [];
  });
  const queue: { id: string; category: EquityMissionFilter; priority: number; label: string; detail: string; href: string; proofIds: string[]; noteId?: string }[] = [];
  const add = (id: string, category: EquityMissionFilter, priority: number, label: string, detail: string, proofIds: string[] = [], target: { component?: EqComponent | null; item?: string | null; noteId?: string } = {}) =>
    queue.push({ id, category, priority, label, detail, proofIds, ...(target.noteId ? { noteId: target.noteId } : {}), href: equitySheetHref(scope, run ?? null, category, target) });
  if (!run) add("procedure:pending", "blocked", 1, roots.length > 1 ? "Affecter une feuille Capitaux propres" : "Revue des capitaux propres à préparer", "Procédure prévue : pont par composante, tableau de variation, décisions ↔ écritures, PV lus ; cinq contrôles.");
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail Capitaux propres périmé", reason));
  sources.filter(s => s.required && (!s.available || !s.approvedBy)).forEach(s => add("source:" + s.id, "evidence", 2, "Source Capitaux propres approuvée attendue", s.label));
  if (!sources.some(s => s.type === "eq_decisions" && s.available)) add("source:decisions", "evidence", 2, "Registre des décisions attendu", "Sans registre, les écritures ne sont pas rapprochées d’une décision ; aucune « écriture sans décision » n’est inventée.");
  if (!sources.some(s => s.type === "eq_minutes" && s.available)) add("source:minutes", "evidence", 2, "PV et actes attendus", "Sans PV versionné, aucune lecture ne peut être validée : les décisions restent non appuyées.");
  if (!sources.some(s => s.type === "eq_variation" && s.available)) add("source:variation", "evidence", 2, "Tableau de variation fourni attendu", "Sans tableau fourni, seul le tableau reconstitué est présenté ; aucune cellule n’est comparée.");
  if (run && !run.result) add("procedure:prepare", "blocked", 2, run.population ? "Revue à exécuter" : "Sources à figer", "Le programme prévoit cette procédure, même sans exception.");
  if (run?.result && !equity) add("result:invalid", "blocked", 1, "Contrat de résultat Capitaux propres invalide", "Le calcul n’est pas restitué comme un résultat exploitable.");
  equity?.exceptions.forEach(e => add(e.id, isUncertainty(e.code) ? "evidence" : "exceptions", 3, e.label, e.message + " · " + equityAmountLabel(e.amount), e.proofIds, { component: e.component, item: itemOf(e) }));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant Capitaux propres" : "Traitement à documenter", n.text, [], { noteId: n.id }));
  if (run && ["executed", "awaiting_review", "changes_requested", "approved"].includes(run.state)) add("review:pending", "review", 4, run.state === "approved" ? "Verrouillage attendu" : run.state === "executed" ? "Soumission à préparer" : run.state === "changes_requested" ? "Correction demandée" : "Revue attendue", "Décision sur cette version ; les exceptions restent dans le résultat ; aucune conclusion juridique.");
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { schemaVersion: "equity-mission-1.0.0", stateAsOf: stateDates.at(-1) ?? null, sourceFamily: "mission_procedures", scope, program: EQUITY_MISSION_PROGRAM,
    assignment: { rootId: rootId ?? null, choices: roots, currentRunId: current?.id ?? null, currentVersion: current?.version ?? null },
    procedure, sources, queue,
    counters: { planned: EQUITY_MISSION_PROGRAM.procedures.length, plannedParts: definition.tests.length, executed: equity ? 1 : 0, reviewed: review && !stale ? 1 : 0, locked: run?.state === "locked" && !stale ? 1 : 0, stale: stale ? 1 : 0,
      testedParts: controls.filter(c => c.complete).length, exceptions: equity?.exceptions.filter(e => !isUncertainty(e.code)).length ?? 0, uncertainties: equity?.exceptions.filter(e => isUncertainty(e.code)).length ?? 0 },
    amountGrouping: { groups: [] as never[], reason: "Aucun regroupement d’exposition : écarts conservés par composante, par décision et par écriture, sans total ni compensation." },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events,
      readings: v.capitauxWork?.readings.map(r => ({ lineId: r.lineId, pieceRef: r.pieceRef, documentVersionId: r.documentVersionId, page: r.page, authorId: r.authorId, authoredAt: r.authoredAt })) ?? [] })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    limitations: [...EQUITY_LIMITATIONS, EQ_LEGAL_TEXT, "Revue documentée ne signifie pas conformité des comptes ni régularité juridique ; aucune opinion automatique.", "PV et pièces binaires absents du paquet ; téléchargement séparé soumis aux mêmes permissions.", "SHA-256 = intégrité, sans signature légale ni archivage certifié."] };
  return frozen({ ...body, hash: stableSha256(body) });
}
export type EquityMissionSnapshot = ReturnType<typeof buildEquityMission>;
