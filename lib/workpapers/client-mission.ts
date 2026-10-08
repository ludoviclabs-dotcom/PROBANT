import { z } from "zod";
import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import { cents, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, knownAmountSchema, moneySchema, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";

/** A versioned, closed programme. Its denominator exists before any result or finding. */
export const CLIENT_MISSION_PROGRAM = {
  id: "clients.pilot.program", version: "1.0.0", label: "Programme pilote de cadrage Clients",
  procedures: [{ id: "clients.frame", version: "1.0.0", label: "Cadrage GL / auxiliaire / balance âgée",
    requiredSources: ["clients_general", "clients_auxiliary", "clients_aged"],
    tests: [{ id: "generalToAuxiliary", label: "GL / auxiliaire", dimension: "account" }, { id: "auxiliaryToAged", label: "Auxiliaire / balance âgée", dimension: "party" }] }],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export const SOURCE_LABELS: Record<string, string> = { clients_general: "Grand livre Clients", clients_auxiliary: "Auxiliaire Clients", clients_aged: "Balance âgée" };
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
export function buildClientMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: SourceHead[], selection: MissionSelection = {}, baselineAt?: string) {
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
  const definition = CLIENT_MISSION_PROGRAM.procedures[0];
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
export type ClientMissionSnapshot = ReturnType<typeof buildClientMission>;
