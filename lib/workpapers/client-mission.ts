import { z } from "zod";
import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import { cents, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, knownAmountSchema, moneySchema, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { clientsSalesResultSchema, type ClientsSalesResult } from "./clients-sales";

/** A versioned, closed programme. Its denominator exists before any result or finding. */
export const CLIENT_MISSION_PROGRAM = {
  id: "clients.pilot.program", version: "2.0.0", label: "Programme Clients : cadrage, encaissements et jugement",
  procedures: [{ id: "clients.frame", version: "1.0.0", label: "Cadrage GL / auxiliaire / balance âgée",
    requiredSources: ["clients_general", "clients_auxiliary", "clients_aged"],
    tests: [{ id: "generalToAuxiliary", label: "GL / auxiliaire", dimension: "account" }, { id: "auxiliaryToAged", label: "Auxiliaire / balance âgée", dimension: "party" }] },
    { id: "clients.sales", version: "1.0.0", label: "Clients et ventes : encaissements, avoirs et jugement", requiredSources: ["clients_invoices", "clients_payments"], conditionalSources: ["clients_credits", "clients_support"], tests: [{ id: "cashCredit", label: "Encaissements et avoirs", dimension: "invoice" }, { id: "impairment", label: "Estimation documentée", dimension: "invoice" }, { id: "confirmations", label: "Confirmations et pièces", dimension: "invoice" }] }],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export const SOURCE_LABELS: Record<string, string> = { clients_general: "Grand livre Clients", clients_auxiliary: "Auxiliaire Clients", clients_aged: "Balance âgée", clients_invoices: "Factures ouvertes à la clôture", clients_payments: "Encaissements ultérieurs", clients_credits: "Avoirs", clients_support: "Pièces de jugement et confirmations" };
export type MissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export type MissionSelection = { rootId?: string; id?: string; version?: number };
export type SourceHead = { document_type: string; import_id: string };
const proof = z.object({ id: z.string(), documentVersionId: z.string(), rowId: z.string().optional(), locator: z.object({ sheet: z.string().optional(), row: z.number().optional(), cell: z.string().optional(), page: z.number().optional(), zone: z.string().optional() }).optional() });
const comparisonSchema = z.object({ rows: z.array(z.object({ key: z.string(), left: moneySchema, right: moneySchema, difference: knownAmountSchema,
  sourceLines: z.array(z.object({ id: z.string(), value: z.object({ evidence: z.array(proof) }) })) })), net: knownAmountSchema, gross: knownAmountSchema, convention: z.string(), inputHash: z.string() });
export function amountLabel(amount: KnownAmount | Money | undefined) {
  if (!amount) return "Non calculé";
  if ("amount" in amount) return amount.amount + " EUR";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function locatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page, locator.zone && "zone " + locator.zone].filter(Boolean).join(", ") || "Document entier";
}
export function missionSheetHref(scope: WorkpaperScope, run: Pick<WorkpaperRun, "id" | "version">, filter: MissionFilter, noteId?: string) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, id: run.id, version: String(run.version), filter });
  if (noteId) params.set("noteId", noteId);
  return "/clients-framing?" + params;
}
function buildFrameProjection(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: SourceHead[], selection: MissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(r => { validateRun(r); assertScope(scope, r.scope); if (r.template.id !== "clients.frame") throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const roots = [...new Set(versions.map(r => r.rootId))].sort(canonicalCompare);
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  const rootId = selection.rootId ?? (selection.id ? versions.find(r => r.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(r => r.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(r => r.id === selection.id && (selection.version === undefined || r.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition: { id: string; version: string; label: string; requiredSources: readonly string[]; tests: readonly { id: string; label: string; dimension: string }[] } = CLIENT_MISSION_PROGRAM.procedures[0];
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version plus récente est disponible.");
  if (run?.importIds.some(id => !heads.some(h => h.import_id === id))) staleReasons.push("Une source approuvée a été remplacée.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push("La version de règle diffère du programme courant.");
  const requiredIds = run?.importIds.length ? run.importIds : heads.map(h => h.import_id);
  const batches = imports.filter(b => requiredIds.includes(b.id));
  const sources = definition.requiredSources.flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type);
    return found.length ? found.map(b => ({ id: b.document.id, importId: b.id as string | null, type, label: SOURCE_LABELS[type], fileName: b.document.fileName as string | null,
      sha256: b.document.byteHash as string | null, parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null,
      approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null, current: heads.some(h => h.import_id === b.id),
      rowCount: b.rows.length, available: true, binaryInPackage: false as const,
      locators: b.rows.map(row => ({ rowId: row.id, locator: row.locator })),
    })) : [{ id: "expected:" + type, importId: null, type, label: SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null,
      mappingVersion: null, mappingHash: null, approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false, binaryInPackage: false as const, locators: [] }];
  });
  const comparisons = definition.tests.map(test => {
    const candidate = run?.result?.result && typeof run.result.result === "object" ? (run.result.result as Record<string, unknown>)[test.id] : null;
    const parsed = comparisonSchema.safeParse(candidate);
    const expectedConvention = `gauche moins droite ; clé ${test.dimension} ; crédits négatifs ; résidus non compensés`;
    const valid = parsed.success && parsed.data.convention === expectedConvention;
    const data = valid ? parsed.data : undefined;
    const rows = data?.rows.map((row, index) => ({ id: `${run!.result!.id}:${test.id}:${index}`, key: row.key, left: row.left, right: row.right,
      difference: row.difference, exception: row.difference.kind === "known" && cents(row.difference.value) !== 0n,
      proofs: row.sourceLines.flatMap(line => line.value.evidence.map(p => ({ ...p, sourceLineId: line.id }))),
      economicEvent: { validation: "unknown" as const, reason: "Résidu de cadrage : événement économique non validé, aucune exposition agrégée." },
    })) ?? [];
    return { id: test.id, label: test.label, ruleVersion: definition.version, convention: expectedConvention, conventionValidated: valid,
      inputHash: data?.inputHash ?? null, rows, net: data?.net ?? null, gross: data?.gross ?? null,
      coverage: { numerator: rows.filter(r => r.difference.kind === "known").length, denominator: rows.length || null, unit: "clés comparables / clés rapprochées", exclusions: [] as { id: string; reason: string }[] },
      complete: !!rows.length && rows.every(r => r.difference.kind === "known"),
    };
  });
  const exceptionCount = comparisons.reduce((sum, c) => sum + c.rows.filter(r => r.exception).length, 0);
  const incomplete = comparisons.some(c => !c.complete);
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  const resultLabel = !run?.result ? "Non exécuté" : run.result.execution !== "completed" ? "Calcul bloqué ou en échec" : exceptionCount ? "Exceptions maintenues" : incomplete ? "Cadrage partiel — incertitudes" : "Aucun écart détecté sur le périmètre testé";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  const before = run ? versions.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const selected = run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? [];
  const coverage = { numerator: new Set(selected).size, denominator: run?.population?.items.length ?? null, unit: "unités sélectionnées / population figée",
    exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const procedure = { id: definition.id, label: definition.label, runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null,
    version: run?.version ?? null, contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null,
    period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée", resultId: run?.result?.id ?? null,
    resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, comparisons,
    notes: run?.notes ?? [], evidence: run?.evidence ?? [],
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null,
  };
  const queue: { id: string; category: MissionFilter; priority: number; label: string; detail: string; href: string; noteId?: string; proofIds: string[] }[] = [];
  const enqueue = (id: string, category: MissionFilter, priority: number, label: string, detail: string, noteId?: string, proofIds: string[] = []) => {
    queue.push({ id, category, priority, label, detail, ...(noteId ? { noteId } : {}), proofIds, href: run ? missionSheetHref(scope, run, category, noteId) : "/clients-framing?" + new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId }) });
  };
  if (!run) enqueue("programme:pending", "blocked", 1, roots.length > 1 ? "Choisir la feuille du programme" : "Procédure à préparer", "Une procédure prévue ; aucun résultat affecté à cette synthèse.");
  staleReasons.forEach((reason, i) => enqueue("stale:" + i, "stale", 0, "Travail périmé", reason));
  procedure.notes.filter(n => n.blocking && !n.resolution).forEach(n => enqueue("note:" + n.id, "blocked", 1, "Point bloquant", n.text, n.id));
  procedure.notes.filter(n => n.kind === "missing_evidence" && !n.resolution).forEach(n => enqueue("evidence:" + n.id, "evidence", 2, "Pièce attendue", n.text, n.id));
  if (run && !run.result) enqueue("procedure:prepare", "blocked", 2, run.state === "ready" ? "Cadrage à exécuter" : "Population à figer", "Le programme prévoit cette procédure, même sans exception détectée.");
  if (run?.state === "executed") enqueue("procedure:submit", "review", 4, "Soumission à préparer", "Documenter les traitements et la conclusion avant soumission.");
  if (run?.state === "approved") enqueue("procedure:lock", "review", 4, "Verrouillage attendu", "La décision de revue doit être verrouillée sur cette version.");
  sources.filter(s => !s.available || !s.approvedBy).forEach(s => enqueue("source:" + s.id, "evidence", 2, "Pièce approuvée attendue", s.label));
  if (run?.result && run.result.execution !== "completed") enqueue("calculation:blocked", "blocked", 1, "Calcul non conclu", "Reprendre les entrées et les contrôles bloqués.");
  comparisons.forEach(c => c.rows.filter(row => row.exception || row.difference.kind !== "known").forEach(row => enqueue(row.id, "exceptions", 3, row.exception ? "Exception de cadrage" : "Clé non comparable",
    c.label + " — " + row.key + " : " + amountLabel(row.difference), undefined, row.proofs.map(p => p.id))));
  if (run?.state === "awaiting_review" || run?.state === "changes_requested") enqueue("review:pending", "review", 4, run.state === "awaiting_review" ? "Revue attendue" : "Correction demandée", "Décision attendue sur cette identité et cette version.");
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { stateAsOf: stateDates.at(-1) ?? null, schemaVersion: "clients-mission-1.0.0", sourceFamily: "mission_procedures", scope, program: CLIENT_MISSION_PROGRAM,
    assignment: { rootId: rootId ?? null, choices: roots, currentRunId: current?.id ?? null, currentVersion: current?.version ?? null },
    procedure, sources, queue,
    counters: { planned: CLIENT_MISSION_PROGRAM.procedures.length, executed: run?.result?.execution === "completed" ? 1 : 0,
      reviewed: review && !stale ? 1 : 0, locked: run?.state === "locked" && !stale ? 1 : 0, stale: stale ? 1 : 0,
      testedParts: comparisons.filter(c => c.complete).length, plannedParts: definition.tests.length, exceptions: exceptionCount },
    amountGrouping: { groups: [] as never[], reason: "Aucun événement économique validé : montants conservés par rapprochement et par clé, sans total d’exposition." },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    limitations: ["Cadrage Clients uniquement ; programme de deux rapprochements, sans opinion automatique.", "Les constats historiques DEMO SA et l’atelier synthétique appartiennent à des sources séparées.", "Revue documentée ne signifie pas conformité des comptes.", "Pièces binaires absentes du paquet ; téléchargement séparé soumis aux mêmes permissions.", "SHA-256 = intégrité, sans signature légale ni archivage certifié."],
  };
  return frozen({ ...body, hash: stableSha256(body) });
}


type FrameProjection = ReturnType<typeof buildFrameProjection>;
type FramingReference = { runId: string; rootId: string; version: number; contentHash: string };
function latestPerRoot(versions: WorkpaperRun[]) {
  const roots = [...new Set(versions.map(v => v.rootId))];
  return roots.map(root => versions.filter(v => v.rootId === root).sort((a, b) => b.revision - a.revision || b.version - a.version)[0]);
}
function framingOf(run?: WorkpaperRun, versions: WorkpaperRun[] = []): FramingReference | undefined {
  if (!run) return undefined;
  const work = (run as WorkpaperRun & { clientsWork?: { framing?: FramingReference } }).clientsWork;
  if (work?.framing) return work.framing;
  const parsed = clientsSalesResultSchema.safeParse(run.result?.result);
  if (parsed.success) return parsed.data.framing;
  // A revision keeps its earlier framing context, without borrowing a future decision.
  const ancestors = versions.filter(v => v.template.id === "clients.sales" && v.rootId === run.rootId &&
    (v.revision < run.revision || v.revision === run.revision && v.id === run.id && v.version < run.version))
    .sort((a, b) => b.revision - a.revision || b.version - a.version);
  for (const ancestor of ancestors) { const reference = framingOf(ancestor); if (reference) return reference; }
  return undefined;
}
function salesSources(imports: ImportBatch[], heads: SourceHead[], run?: WorkpaperRun): FrameProjection["sources"] {
  const required = CLIENT_MISSION_PROGRAM.procedures[1].requiredSources;
  const batches = imports.filter(b => run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id) && (required as readonly string[]).includes(b.document.documentType));
  const available: FrameProjection["sources"] = batches.map(b => ({
    id: b.document.id, importId: b.id, type: b.document.documentType, label: SOURCE_LABELS[b.document.documentType] ?? b.document.documentType,
    fileName: b.document.fileName, sha256: b.document.byteHash, parserVersion: b.document.parserVersion, mappingVersion: b.mapping.version,
    mappingHash: b.mappingHash, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
    current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, available: true, binaryInPackage: false,
    locators: b.rows.map(row => ({ rowId: row.id, locator: row.locator })),
  }));
  for (const type of required) if (!available.some(s => s.type === type)) available.push({
    id: "expected:" + type, importId: null, type, label: SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null,
    mappingVersion: null, mappingHash: null, approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false,
    binaryInPackage: false, locators: [],
  });
  return available;
}
function buildSalesProjection(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: SourceHead[], selection: MissionSelection, frames: WorkpaperRun[], baselineAt?: string) {
  const base = buildFrameProjection(scope, [], [], [], {}, baselineAt);
  const roots = [...new Set(versions.map(v => v.rootId))];
  const root = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(v => v.rootId === root).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || selection.version === v.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition = CLIENT_MISSION_PROGRAM.procedures[1];
  const parsed = clientsSalesResultSchema.safeParse(run?.result?.result);
  const sales = parsed.success && parsed.data.mode === "real" && run && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && parsed.data.closingDate === run.period.closingDate && parsed.data.reviewDate === run.period.asOfDate && (!run.clientsWork || stableSha256(parsed.data.framing) === stableSha256(run.clientsWork.framing)) ? parsed.data : null;
  const reference = framingOf(run, versions);
  const linked = reference ? frames.find(v => v.id === reference.runId && v.version === reference.version && v.rootId === reference.rootId) : undefined;
  const currentFrame = reference ? latestPerRoot(frames).find(v => v.rootId === reference.rootId) : undefined;
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version Clients et ventes plus récente est disponible.");
  if (run?.importIds.some(id => !heads.some(h => h.import_id === id))) staleReasons.push("Une source Clients et ventes approuvée a été remplacée.");
  if (run && (!reference || !linked || contentHash(linked) !== reference.contentHash)) staleReasons.push("La référence au cadrage figé est absente ou incohérente.");
  if (linked && linked.state !== "locked") staleReasons.push("Le cadrage référencé ne porte pas une décision verrouillée.");
  if (reference && currentFrame && (currentFrame.id !== reference.runId || currentFrame.version !== reference.version || contentHash(currentFrame) !== reference.contentHash)) staleReasons.push("Le cadrage lié a une nouvelle version ; les travaux Clients doivent être repris.");
  if (linked?.importIds.some(id => !heads.some(h => h.import_id === id))) staleReasons.push("Une source du cadrage lié a été remplacée.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push("La version de règle Clients et ventes diffère du programme.");
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  const resultLabel = !run?.result ? "Non exécuté" : !sales || run.result.execution !== "completed" ? "Calcul Clients bloqué ou contrat invalide" : sales.exceptions.length ? "Exceptions maintenues" : "Travaux documentés sur le périmètre testé — incertitudes à apprécier";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  const comparisons: FrameProjection["procedure"]["comparisons"] = definition.tests.map(test => {
    const control = sales?.controls.find(c => c.id === test.id);
    return { id: test.id, label: test.label, ruleVersion: definition.version,
      convention: test.id === "cashCredit" ? "Solde de clôture figé ; seuls les événements ultérieurs validés affectent le solde de revue." : test.id === "impairment" ? "Estimation justifiée par méthode, base, auteur et pièces ; ancienneté seule insuffisante." : "Suivi et revue des confirmations, sans envoi externe automatique.",
      conventionValidated: !!sales, inputHash: run?.result?.inputHash ?? null, rows: [], net: null, gross: null,
      coverage: { numerator: control?.numerator ?? 0, denominator: control?.denominator ?? null, unit: "factures documentées / factures de la population", exclusions: control?.exclusions ?? [] },
      complete: !!control && control.denominator > 0 && control.numerator === control.denominator && control.exclusions.length === 0,
    };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size,
    denominator: run?.population?.items.length ?? null, unit: "unités sélectionnées / population figée", exclusions: run?.selection?.exclusions ?? [],
    criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const procedure = { ...base.procedure, id: definition.id as string, label: definition.label as string, runId: run?.id ?? null, rootId: run?.rootId ?? null,
    revision: run?.revision ?? null, version: run?.version ?? null, contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started",
    preparedBy: run?.preparedBy ?? null, period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée", resultId: run?.result?.id ?? null,
    resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, comparisons, notes: run?.notes ?? [],
    evidence: run?.evidence ?? [], sales,
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null,
  };
  const sources = salesSources(imports, heads, run);
  const queue: FrameProjection["queue"] = [];
  const add = (id: string, category: MissionFilter, priority: number, label: string, detail: string, proofIds: string[] = [], noteId?: string) => queue.push({
    id, category, priority, label, detail, proofIds, ...(noteId ? { noteId } : {}),
    href: run ? missionSheetHref(scope, run, category, noteId) : "/clients-framing?" + new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, procedure: "clients.sales" }),
  });
  if (!run) add("procedure:pending", "blocked", 1, roots.length > 1 ? "Affecter une feuille Clients et ventes" : "Clients et ventes à préparer", "Procédure prévue : encaissements/avoirs, estimation et confirmations, trois contrôles.");
  if (run && !run.result) add("procedure:prepare", "blocked", 2, "Travaux Clients à documenter et exécuter", "Figer les sources puis documenter allocations, estimations et confirmations.");
  if (run?.result && !sales) add("result:invalid", "blocked", 1, "Contrat de résultat Clients invalide", "Le détail ne peut pas être restitué comme un résultat exploitable.");
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail Clients périmé", reason));
  sources.filter(s => !s.available || !s.approvedBy).forEach(s => add("source:" + s.id, "evidence", 2, "Source Clients approuvée attendue", s.label));
  sales?.exceptions.forEach(exception => add(exception.id, exception.proofIds.length ? "exceptions" : "evidence", 3, exception.label,
    exception.message + " · " + amountLabel(exception.amount) + " · " + exception.targetId, exception.proofIds));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant Clients" : "Traitement à documenter", n.text, [], n.id));
  if (run?.state === "executed" || run?.state === "awaiting_review" || run?.state === "changes_requested" || run?.state === "approved") add("review:pending", "review", 4,
    run.state === "approved" ? "Verrouillage Clients attendu" : run.state === "executed" ? "Soumission Clients à préparer" : "Revue Clients attendue", "Décision sur cette version ; les exceptions restent dans le résultat.");
  return { ...base, procedure, sources, queue, versionIndex: assigned.map(v => ({
    id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy,
    approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events,
  })) };
}

export function buildClientMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: SourceHead[], selection: MissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (!["clients.frame", "clients.sales"].includes(v.template.id)) throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const frames = versions.filter(v => v.template.id === "clients.frame"), salesVersions = versions.filter(v => v.template.id === "clients.sales");
  const currentFrames = latestPerRoot(frames), currentSales = latestPerRoot(salesVersions);
  const choices = [...new Set(versions.map(v => v.rootId))].sort(canonicalCompare);
  if (selection.rootId && !choices.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  let selectedRoot = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined);
  if (!selectedRoot && currentFrames.length === 1) {
    const related = currentSales.filter(v => framingOf(v, salesVersions)?.rootId === currentFrames[0].rootId);
    if (related.length <= 1 && currentSales.length === related.length) selectedRoot = currentFrames[0].rootId;
  } else if (!selectedRoot && choices.length === 1) selectedRoot = choices[0];
  const selectedFamily = versions.filter(v => v.rootId === selectedRoot).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const selectedCurrent = selectedFamily[0];
  const selected = selection.id ? selectedFamily.find(v => v.rootId === selectedRoot && v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : selectedCurrent;
  if (selection.id && !selected) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const isSales = selected?.template.id === "clients.sales";
  const reference = isSales ? framingOf(selected, salesVersions) : undefined;
  const linkedFrame = reference ? frames.find(v => v.id === reference.runId && v.version === reference.version) : selected?.template.id === "clients.frame" ? selected : undefined;
  const relatedSales = linkedFrame ? currentSales.filter(v => framingOf(v, salesVersions)?.rootId === linkedFrame.rootId) : [];
  const salesRun = isSales ? selected : relatedSales.length === 1 ? relatedSales[0] : undefined;
  const frame = buildFrameProjection(scope, linkedFrame ? frames : [], imports, heads, linkedFrame ? { id: linkedFrame.id, version: linkedFrame.version } : {}, baselineAt);
  const sales = buildSalesProjection(scope, salesRun ? salesVersions.filter(v => v.rootId === salesRun.rootId) : [], imports, heads,
    salesRun ? { id: salesRun.id, version: salesRun.version } : {}, frames, baselineAt);
  const frameProjection = { ...frame, procedure: { ...frame.procedure, sales: null as ClientsSalesResult | null } };
  const projections = [frameProjection, sales];
  const active = isSales ? sales : frameProjection;
  const sources = projections.flatMap(p => p.sources).filter((source, index, all) => all.findIndex(s => s.id === source.id) === index);
  const queue = projections.flatMap(p => p.queue.map(q => ({ ...q, id: p.procedure.id + ":" + q.id, procedureId: p.procedure.id })))
    .sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])]
    .filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { ...active, schemaVersion: "clients-mission-2.0.0", stateAsOf: stateDates.at(-1) ?? null, program: CLIENT_MISSION_PROGRAM,
    assignment: { rootId: selectedRoot ?? null, choices, currentRunId: selectedCurrent?.id ?? null, currentVersion: selectedCurrent?.version ?? null,
      options: latestPerRoot(versions).map(v => ({ rootId: v.rootId, procedureId: v.template.id, label: CLIENT_MISSION_PROGRAM.procedures.find(p => p.id === v.template.id)!.label })) },
    procedures: projections.map(p => p.procedure), sources, queue,
    amountGrouping: { groups: [] as never[], reason: "Aucun regroupement par événement économique validé : les montants restent propres aux clés du cadrage, factures et événements documentés, sans total d’exposition." },
    counters: { planned: CLIENT_MISSION_PROGRAM.procedures.length, plannedParts: CLIENT_MISSION_PROGRAM.procedures.reduce((sum, p) => sum + p.tests.length, 0),
      executed: projections.filter(p => p.procedure.resultId && (p.procedure.id === "clients.sales" ? p.procedure.sales : p.procedure.comparisons.some(c => c.conventionValidated))).length,
      reviewed: projections.filter(p => p.procedure.review && !p.procedure.stale).length,
      locked: projections.filter(p => p.procedure.state === "locked" && !p.procedure.stale).length,
      stale: projections.filter(p => p.procedure.stale).length,
      testedParts: projections.reduce((sum, p) => sum + p.procedure.comparisons.filter(c => c.complete).length, 0),
      exceptions: projections.reduce((sum, p) => sum + (p.procedure.sales?.exceptions.length ?? p.procedure.comparisons.reduce((n, c) => n + c.rows.filter(r => r.exception).length, 0)), 0) },
    limitations: ["Programme Clients fermé : cadrage (deux rapprochements), encaissements/avoirs, estimation et confirmations (trois contrôles). Aucune opinion automatique.",
      "L’export approuvé porte uniquement sur la procédure sélectionnée ; les autres travaux sont présentés avec leur propre état et version.",
      "Les constats historiques DEMO SA et l’atelier synthétique appartiennent à des sources séparées.",
      "Revue documentée ne signifie pas conformité des comptes. Un reste à encaisser ne constitue ni une perte automatique ni une créance entièrement sûre.",
      "Pièces binaires absentes du paquet ; téléchargement séparé soumis aux mêmes permissions.",
      "SHA-256 = intégrité, sans signature légale ni archivage certifié."],
  };
  const { hash: previousHash, ...withoutPreviousHash } = body;
  void previousHash;
  return frozen({ ...withoutPreviousHash, hash: stableSha256(withoutPreviousHash) });
}
export type ClientMissionSnapshot = ReturnType<typeof buildClientMission>;
