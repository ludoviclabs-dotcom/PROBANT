import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { FA_UNCERTAINTY_CODES, FIXED_ASSET_LIMITATIONS, fixedAssetResultSchema, type FixedAssetResult } from "./fixed-asset-review";
import { FA_SOURCE_LABELS, FA_TYPES, type FaTable } from "./fixed-asset-sources";
import type { FixedAssetSourceHead } from "./fixed-asset-store";

/** Closed programme: its denominators exist before any result or exception. */
export const FIXED_ASSET_MISSION_PROGRAM = {
  id: "fixed_assets.program", version: "1.0.0", label: "Programme Immobilisations : mouvements, cadrage et recalcul documenté",
  procedures: [{ id: "fixed_assets.review", version: "1.0.0", label: "Mouvements, cadrage registre → GL et recalcul documenté",
    requiredSources: ["fa_register", "fa_ledger"], conditionalSources: ["fa_parameters", "fa_support"],
    tests: [{ id: "movements", label: "Ponts Brut / Amortissements / Dépréciations", dimension: "table" }, { id: "frame", label: "Cadrage registre → GL", dimension: "account" },
      { id: "supports", label: "Entrées et sorties appuyées par une pièce", dimension: "movement" }, { id: "recalculation", label: "Recalcul documenté de la dotation", dimension: "asset" }] }],
  outOfScope: ["Existence physique et état des biens (inventaire physique)", "Indices de perte de valeur et valeur actuelle", "Recherche de dépenses à immobiliser", "Méthodes non linéaires, sorties de l’exercice et sorties partielles au recalcul", "Crédit-bail, actifs réévalués, financiers ou en devise : exclus avec motif"],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export type FixedAssetMissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export type FixedAssetMissionSelection = { rootId?: string; id?: string; version?: number };
const CONVENTIONS: Record<string, string> = {
  movements: "Pour chaque actif et chaque tableau : clôture observée − (ouverture + entrées − sorties − reprises ± reclassements) ; les trois tableaux ne sont jamais additionnés.",
  frame: "Registre (sens de chaque tableau) converti en débit positif, comparé au solde GL compte par compte ; aucune compensation entre comptes.",
  supports: "Entrées et sorties brutes rapprochées d’une pièce de même actif et de nature attendue ; montant et date comparés séparément.",
  recalculation: "Dotation recalculée sur paramètres et méthode documentés ; écart = comptabilisé − recalculé ; aucun paramètre implicite.",
};
export function fixedAssetAmountLabel(amount: KnownAmount | Money | null | undefined) {
  if (!amount) return "Non calculé";
  if ("amount" in amount) return amount.amount + " EUR";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function fixedAssetLocatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page].filter(Boolean).join(", ") || "Document entier";
}
export function fixedAssetSheetHref(scope: Pick<WorkpaperScope, "dossierId" | "periodId">, run: Pick<WorkpaperRun, "id" | "version"> | null, filter: FixedAssetMissionFilter, target: { unitId?: string | null; table?: FaTable | null; noteId?: string } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(run ? { id: run.id, version: String(run.version) } : {}), filter });
  if (target.unitId) params.set("asset", target.unitId);
  if (target.table) params.set("table", target.table);
  if (target.noteId) params.set("noteId", target.noteId);
  return "/immobilisations?" + params;
}
/** Result accepted only if it is the run’s own, for its own scope and period. */
export function fixedAssetResultOf(run: WorkpaperRun | undefined | null): FixedAssetResult | null {
  if (!run?.result || run.result.execution !== "completed") return null;
  const parsed = fixedAssetResultSchema.safeParse(run.result.result);
  return parsed.success && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && parsed.data.closingDate === run.period.closingDate && parsed.data.reviewDate === run.period.asOfDate ? parsed.data : null;
}
const isUncertainty = (code: FixedAssetResult["exceptions"][number]["code"]) => FA_UNCERTAINTY_CODES.includes(code);

export function buildFixedAssetMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: FixedAssetSourceHead[], selection: FixedAssetMissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (v.template.id !== "fixed_assets.review") throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const roots = [...new Set(versions.map(v => v.rootId))].sort(canonicalCompare);
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  const rootId = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(v => v.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition = FIXED_ASSET_MISSION_PROGRAM.procedures[0];
  const assets = fixedAssetResultOf(run);
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version Immobilisations plus récente est disponible.");
  if (run?.importIds.some(id => !heads.some(h => h.import_id === id))) staleReasons.push("Une source Immobilisations approuvée a été remplacée.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push("La version de règle Immobilisations diffère du programme.");
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  const resultLabel = !run?.result ? "Non exécuté" : !assets ? "Calcul Immobilisations bloqué ou contrat invalide" : assets.exceptions.some(e => !isUncertainty(e.code)) ? "Exceptions maintenues" : assets.controls.some(c => c.outcome === "inconclusive") ? "Travaux partiels — non concluant sur une partie" : "Aucun écart sur le périmètre testé — existence et valeur non démontrées";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  const controls = definition.tests.map(test => {
    const control = assets?.controls.find(c => c.id === test.id);
    return { id: test.id, label: test.label, ruleVersion: definition.version, convention: CONVENTIONS[test.id], conventionValidated: !!assets, outcome: control?.outcome ?? null,
      coverage: { numerator: control?.numerator ?? 0, denominator: control?.denominator ?? null, unit: control?.unit ?? test.label, exclusions: control?.exclusions ?? [] },
      complete: !!control && control.denominator > 0 && control.numerator === control.denominator };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size, denominator: run?.population?.items.length ?? null,
    unit: "actifs ou composants sélectionnés / actifs ou composants du registre figé", exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const procedure = { id: definition.id as string, label: definition.label as string, runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null, version: run?.version ?? null,
    contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null, period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée",
    resultId: run?.result?.id ?? null, resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, controls, notes: run?.notes ?? [], evidence: run?.evidence ?? [], assets,
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null };
  const required: readonly string[] = definition.requiredSources, conditional: readonly string[] = definition.conditionalSources;
  const batches = imports.filter(b => run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id));
  const sources = FA_TYPES.flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type);
    if (found.length) return found.map(b => ({ id: b.document.id, importId: b.id as string | null, type, label: FA_SOURCE_LABELS[type], fileName: b.document.fileName as string | null, sha256: b.document.byteHash as string | null,
      parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
      current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, available: true, required: required.includes(type), binaryInPackage: false as const, locators: b.rows.map(row => ({ rowId: row.id, locator: row.locator })) }));
    return required.includes(type) || conditional.includes(type) ? [{ id: "expected:" + type, importId: null, type, label: FA_SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null, mappingVersion: null, mappingHash: null,
      approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false, required: required.includes(type), binaryInPackage: false as const, locators: [] }] : [];
  });
  const queue: { id: string; category: FixedAssetMissionFilter; priority: number; label: string; detail: string; href: string; proofIds: string[]; noteId?: string }[] = [];
  const add = (id: string, category: FixedAssetMissionFilter, priority: number, label: string, detail: string, proofIds: string[] = [], target: { unitId?: string | null; table?: FaTable | null; noteId?: string } = {}) =>
    queue.push({ id, category, priority, label, detail, proofIds, ...(target.noteId ? { noteId: target.noteId } : {}), href: fixedAssetSheetHref(scope, run ?? null, category, target) });
  if (!run) add("procedure:pending", "blocked", 1, roots.length > 1 ? "Affecter une feuille Immobilisations" : "Revue des immobilisations à préparer", "Procédure prévue : ponts des mouvements, cadrage registre → GL, pièces et recalcul documenté, quatre contrôles.");
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail Immobilisations périmé", reason));
  sources.filter(s => s.required && (!s.available || !s.approvedBy)).forEach(s => add("source:" + s.id, "evidence", 2, "Source Immobilisations approuvée attendue", s.label));
  if (!sources.some(s => s.type === "fa_parameters" && s.available)) add("source:parameters", "evidence", 2, "Paramètres d’amortissement attendus", "Sans paramètres documentés, le recalcul reste bloqué ; aucune durée ni résiduel implicite.");
  if (!sources.some(s => s.type === "fa_support" && s.available)) add("source:support", "evidence", 2, "Pièces de mouvement attendues", "Sans pièces, les entrées et sorties ne sont pas rapprochées et la mise en service n’est pas établie.");
  if (run && !run.result) add("procedure:prepare", "blocked", 2, run.population ? "Revue à exécuter" : "Sources et méthodes à figer", "Le programme prévoit cette procédure, même sans exception.");
  if (run?.result && !assets) add("result:invalid", "blocked", 1, "Contrat de résultat Immobilisations invalide", "Le calcul n’est pas restitué comme un résultat exploitable.");
  assets?.exceptions.forEach(e => add(e.id, isUncertainty(e.code) ? "evidence" : "exceptions", 3, e.label, e.message + " · " + fixedAssetAmountLabel(e.amount), e.proofIds, { unitId: e.unitId, table: e.table }));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant Immobilisations" : "Traitement à documenter", n.text, [], { noteId: n.id }));
  if (run && ["executed", "awaiting_review", "changes_requested", "approved"].includes(run.state)) add("review:pending", "review", 4, run.state === "approved" ? "Verrouillage attendu" : run.state === "executed" ? "Soumission à préparer" : run.state === "changes_requested" ? "Correction demandée" : "Revue attendue", "Décision sur cette version ; les exceptions restent dans le résultat.");
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { schemaVersion: "fixed-assets-mission-1.0.0", stateAsOf: stateDates.at(-1) ?? null, sourceFamily: "mission_procedures", scope, program: FIXED_ASSET_MISSION_PROGRAM,
    assignment: { rootId: rootId ?? null, choices: roots, currentRunId: current?.id ?? null, currentVersion: current?.version ?? null },
    procedure, sources, queue,
    counters: { planned: FIXED_ASSET_MISSION_PROGRAM.procedures.length, plannedParts: definition.tests.length, executed: assets ? 1 : 0, reviewed: review && !stale ? 1 : 0, locked: run?.state === "locked" && !stale ? 1 : 0, stale: stale ? 1 : 0,
      testedParts: controls.filter(c => c.complete).length, exceptions: assets?.exceptions.filter(e => !isUncertainty(e.code)).length ?? 0, uncertainties: assets?.exceptions.filter(e => isUncertainty(e.code)).length ?? 0 },
    amountGrouping: { groups: [] as never[], reason: "Aucun regroupement d’exposition : écarts conservés par actif, par tableau et par compte, sans total ni compensation." },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events,
      methods: v.fixedAssetWork?.methods.map(m => ({ id: m.id, version: m.version, kind: m.kind, authorId: m.authorId, authoredAt: m.authoredAt })) ?? [] })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    limitations: [...FIXED_ASSET_LIMITATIONS, "Revue documentée ne signifie pas conformité des comptes ; aucune opinion automatique.", "Pièces binaires absentes du paquet ; téléchargement séparé soumis aux mêmes permissions.", "SHA-256 = intégrité, sans signature légale ni archivage certifié."] };
  return frozen({ ...body, hash: stableSha256(body) });
}
export type FixedAssetMissionSnapshot = ReturnType<typeof buildFixedAssetMission>;
