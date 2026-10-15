import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { KnownAmount } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { PV_LIMITATIONS, PV_UNCERTAINTY_CODES, provisionResultSchema, type ProvisionExceptionCode, type ProvisionResult } from "./provision-contract";
import { confidentialContext, provisionBatchConfidential, redactProvisionBatch, redactProvisionResult, redactProvisionRun } from "./provision-redaction";
import { PV_SOURCE_LABELS, PV_TYPES, provisionSourcesCurrent } from "./provision-sources";
import type { ProvisionSourceHead } from "./provision-store";

/**
 * Closed programme of the provisions and commitments register: its six controls and their denominators exist before any
 * result. Each control is a comparison the engine (provision-review.ts) really performs, identified by the exception codes
 * it raises; no control is created here and no amount is recomputed.
 */
export const PROVISION_MISSION_PROGRAM = {
  id: "provisions.program", version: "1.0.0", label: "Programme Provisions et engagements : registre relié au grand livre et à l’annexe",
  procedures: [{ id: "provisions.register", version: "1.0.0", label: "Registre des risques et engagements — ponts et comparaisons documentés",
    requiredSources: ["pv_register", "pv_ledger"], conditionalSources: ["pv_movements", "pv_estimates", "pv_annex", "pv_support"],
    tests: [
      { id: "bridge", label: "Pont par événement → clôture déclarée", dimension: "event", codes: ["BRIDGE_DIFFERENCE", "BRIDGE_UNKNOWN", "CLOSED_WITH_BALANCE", "TREATMENT_BALANCE_MISMATCH"] },
      { id: "estimate", label: "Estimation retenue documentée ↔ provision calculée", dimension: "event", codes: ["ESTIMATE_DIFFERENCE", "ESTIMATE_MISSING"] },
      { id: "annex", label: "Événement ↔ annexe publiée", dimension: "event", codes: ["ANNEX_MISSING", "ANNEX_AMOUNT_DIFFERENCE", "ANNEX_RUBRIC_MISMATCH", "ANNEX_EVENT_UNKNOWN", "ANNEX_NOT_PROVIDED", "ANNEX_SOURCE_MISSING"] },
      { id: "framing", label: "Cadrage par compte de provisions ↔ grand livre", dimension: "account", codes: ["OPENING_FRAMING_DIFFERENCE", "FRAMING_DIFFERENCE", "LEDGER_BRIDGE_DIFFERENCE", "FRAMING_INCOMPLETE"] },
      { id: "supports", label: "Mouvements et décisions étayés par une pièce citable", dimension: "movement_or_decision", codes: ["MOVEMENT_UNSUPPORTED", "DECISION_UNSUPPORTED"] },
      { id: "lawyers", label: "Informations des avocats sur les litiges (NEP 501 §§ 07-08)", dimension: "litigation", codes: ["LAWYERS_INFO_MISSING"] },
    ] }],
  outOfScope: ["Qualification de l’obligation, probabilité et issue juridique : décisions humaines citées, jamais déduites", "Événements nés après la clôture : revue des événements postérieurs, distincte",
    "Exhaustivité du registre : non établie, seulement signalée par le cadrage et l’annexe", "Caractère significatif et faible probabilité en annexe (PCG art. 832-13 et 832-14) : jugement humain",
    "Reclassements entre comptes de provisions : non couverts"],
  exclusions: [] as { id: string; reason: string }[],
} as const;
export type ProvisionMissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export type ProvisionMissionSelection = { rootId?: string; id?: string; version?: number };
export type ProvisionSheetTab = "registre" | "pont" | "exceptions" | "pieces" | "revue";
export type ProvisionControlId = typeof PROVISION_MISSION_PROGRAM.procedures[0]["tests"][number]["id"];
export type ProvisionControlOutcome = "no_exception_detected" | "exceptions_detected" | "inconclusive" | "not_applicable";
const CONVENTIONS: Record<ProvisionControlId, string> = {
  bridge: "Pour chaque événement de l’exercice portant une provision : ouverture + dotations − utilisations − reprises non utilisées = clôture calculée, comparée à la clôture déclarée. Sans journal approuvé, la clôture calculée reste inconnue, jamais égale à l’ouverture. Événement sans provision : non applicable.",
  estimate: "Pour les seuls événements traités en provision, hors événement clos dont la provision est soldée : estimation retenue documentée − provision de clôture calculée. Différence à examiner, jamais anomalie validée ni correction ; aucune formule probabilité × montant.",
  annex: "Passifs éventuels, engagements hors bilan et passifs non comptabilisés non clos attendus en annexe ; montant publié comparé à sa référence (provision calculée, engagement au registre ou estimation retenue) et rubrique comparée au traitement retenu. Une ligne sans événement signale un registre peut-être incomplet.",
  framing: "Par compte de provisions : grand livre − registre à l’ouverture et à la clôture, puis pont du grand livre. Un compte absent du grand livre a un solde inconnu, jamais nul ; aucune compensation entre comptes.",
  supports: "Chaque mouvement et chaque décision de traitement rapproché d’une pièce citable approuvée ; une reprise sans pièce laisse son fondement à documenter.",
  lawyers: "Déclaration du préparateur sur les informations des avocats, citant la pièce figée ou son motif ; les conséquences restent au professionnel et aucune issue n’est déduite.",
};
const UNITS: Record<ProvisionControlId, string> = {
  bridge: "ponts comparés à la clôture déclarée / événements de l’exercice portant une provision",
  estimate: "comparaisons estimation / provision réalisées / événements traités en provision, hors clos soldés",
  annex: "événements comparés à une annexe approuvée / événements attendus en annexe ou cités par elle",
  framing: "comptes cadrés à l’ouverture, à la clôture et sur le pont du grand livre / comptes de provisions",
  supports: "mouvements et décisions étayés par une pièce citable / mouvements et décisions des événements de l’exercice",
  lawyers: "litiges de l’exercice couverts par des informations obtenues / litiges de l’exercice",
};
const isUncertainty = (code: ProvisionExceptionCode) => PV_UNCERTAINTY_CODES.includes(code);
const controlOf = (code: ProvisionExceptionCode) => PROVISION_MISSION_PROGRAM.procedures[0].tests.find(t => (t.codes as readonly string[]).includes(code))?.id ?? null;
export function provisionControlOf(code: ProvisionExceptionCode): ProvisionControlId | null { return controlOf(code); }
/** Server amount as text: a known amount keeps its value, an unknown one keeps its reason (never zero). */
export function provisionAmountLabel(amount: KnownAmount | null | undefined) {
  if (!amount) return "Non calculé";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function provisionLocatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page].filter(Boolean).join(", ") || "Document entier";
}
/** Sheet link at the exact version shown, on the tab and the event concerned. */
export function provisionSheetHref(scope: Pick<WorkpaperScope, "dossierId" | "periodId">, run: Pick<WorkpaperRun, "id" | "version"> | null, target: { tab?: ProvisionSheetTab; eventId?: string | null } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(run ? { id: run.id, version: String(run.version) } : {}) });
  if (target.eventId) params.set("item", target.eventId);
  if (target.tab && target.tab !== "registre") params.set("tab", target.tab);
  return "/provisions?" + params;
}
/** Synthesis link of one exact version, or of one lineage, of the same dossier and period. */
export function provisionSynthesisHref(scope: Pick<WorkpaperScope, "dossierId" | "periodId">, target: { rootId?: string; id?: string; version?: number } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(target.rootId ? { rootId: target.rootId } : {}), ...(target.id && target.version ? { id: target.id, version: String(target.version) } : {}) });
  return "/provisions/synthese?" + params;
}
/** Result accepted only if it is the run’s own, for its own scope and exercise. */
export function provisionResultOf(run: WorkpaperRun | undefined | null): ProvisionResult | null {
  if (!run?.result || run.result.execution !== "completed") return null;
  const parsed = provisionResultSchema.safeParse(run.result.result);
  return parsed.success && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && parsed.data.startDate === run.period.startDate && parsed.data.closingDate === run.period.closingDate ? parsed.data : null;
}
/**
 * Coverage of one control, read from the fields the engine produced for each event and account: a count of units,
 * never an amount. Units outside the comparison are listed with their motive, so « non applicable » never reads as zero.
 */
function coverageOf(id: ProvisionControlId, r: ProvisionResult) {
  const inScope = r.events.filter(e => e.inScope);
  const out = (numerator: number, denominator: number, exclusions: { id: string; reason: string }[] = []) => ({ numerator, denominator, unit: UNITS[id], exclusions });
  switch (id) {
    case "bridge": {
      const units = inScope.filter(e => e.bridge);
      return out(units.filter(e => e.bridge!.difference !== null).length, units.length, inScope.filter(e => !e.bridge).map(e => ({ id: e.eventId, reason: "Sans provision ni mouvement : pont non applicable" })));
    }
    case "estimate": {
      const applies = (e: ProvisionResult["events"][number]) => e.treatment === "provision" && !(e.state === "clos" && e.bridge?.computedClosing === "0");
      const units = inScope.filter(applies);
      return out(units.filter(e => e.estimateDifferenceCents !== null).length, units.length, inScope.filter(e => !applies(e)).map(e => ({ id: e.eventId, reason: e.treatment !== "provision" ? "Traitement retenu autre que la provision : comparaison non applicable" : "Événement clos, provision soldée : estimation non requise" })));
    }
    case "annex": {
      const units = inScope.filter(e => e.annex.expected || e.annex.lines.length > 0);
      return out(units.filter(e => e.annex.status !== "not_provided").length, units.length, inScope.filter(e => !e.annex.expected && !e.annex.lines.length).map(e => ({ id: e.eventId, reason: "Ni attendu en annexe ni cité par elle : comparaison non applicable" })));
    }
    case "framing": return out(r.accounts.filter(a => a.ledger !== null && a.closingDifference !== null && a.ledgerBridgeDifference !== null).length, r.accounts.length);
    case "supports": {
      const movements = inScope.flatMap(e => e.movements);
      return out(movements.filter(m => m.supported).length + inScope.filter(e => e.decisionPiece?.supported).length, movements.length + inScope.length);
    }
    case "lawyers": {
      const litigations = inScope.filter(e => e.type === "litige");
      return out(r.lawyers.status === "obtained" ? litigations.length : 0, litigations.length);
    }
  }
}

/**
 * Mission synthesis of the provisions register, at an exact version. Contents follow the reader's confidential capability:
 * without it, the result, notes and source locators pass through the same server masking as the sheet. Hashes, staleness
 * and approval checks are computed on the stored runs, never on the masked projection.
 */
export function buildProvisionMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: ProvisionSourceHead[], selection: ProvisionMissionSelection = {}, baselineAt?: string, options: { confidential?: boolean } = {}) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (v.template.id !== "provisions.register") throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const confidential = options.confidential === true;
  const roots = [...new Set(versions.map(v => v.rootId))].sort(canonicalCompare);
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  // Several lineages: the programme waits for an explicit assignment, never the most advanced state.
  const rootId = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? (roots.length === 1 ? roots[0] : undefined);
  const assigned = versions.filter(v => v.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const definition = PROVISION_MISSION_PROGRAM.procedures[0];
  const real = provisionResultOf(run);
  const show = (v: WorkpaperRun) => confidential ? v : redactProvisionRun(v, imports);
  const shown = real ? (confidential ? real : redactProvisionResult(real)) : null;
  const staleReasons: string[] = [];
  if (run && current && (run.id !== current.id || run.version !== current.version)) staleReasons.push("Une version Provisions plus récente est disponible.");
  if (run && !provisionSourcesCurrent(run.importIds, heads)) staleReasons.push("Une source Provisions approuvée a été remplacée ou ajoutée depuis le gel.");
  if (run && (run.template.version !== definition.version || run.template.rule?.version !== definition.version)) staleReasons.push(`Règle Provisions ${run.template.rule?.version ?? run.template.version} appliquée, programme ${definition.version} : résultat périmé, consultable ; créez une révision pour l’exécuter à nouveau.`);
  const stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash, ...(run.approval.kind ? { kind: run.approval.kind, ...(run.approval.reviewerName ? { reviewerName: run.approval.reviewerName } : {}) } : {}) } : null;
  const resultLabel = !run?.result ? "Non exécuté" : !real ? "Calcul Provisions bloqué ou contrat invalide" : real.exceptions.some(e => !isUncertainty(e.code)) ? "Différences maintenues à examiner — aucune anomalie validée"
    : real.exceptions.length ? "Travaux partiels — non concluant sur une partie" : "Aucune différence sur les comparaisons documentées — exhaustivité du registre non démontrée";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : review ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  // Each control states the rule its outcome was computed with: the run's own, the programme's only without a run.
  const appliedRule = run?.result?.ruleVersion ?? run?.template.rule?.version ?? definition.version;
  const controls = definition.tests.map(test => {
    const found = real?.exceptions.filter(e => (test.codes as readonly string[]).includes(e.code)) ?? [];
    const coverage = real ? coverageOf(test.id, real) : { numerator: 0, denominator: null as number | null, unit: UNITS[test.id], exclusions: [] as { id: string; reason: string }[] };
    const outcome: ProvisionControlOutcome | null = !real ? null : found.some(e => !isUncertainty(e.code)) ? "exceptions_detected" : found.length ? "inconclusive"
      : coverage.denominator === 0 ? "not_applicable" : coverage.numerator === coverage.denominator ? "no_exception_detected" : "inconclusive";
    return { id: test.id, label: test.label, ruleVersion: appliedRule, convention: CONVENTIONS[test.id], conventionValidated: !!real, outcome, coverage, exceptionIds: found.map(e => e.id),
      complete: !!real && coverage.denominator !== null && coverage.denominator > 0 && coverage.numerator === coverage.denominator };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size, denominator: run?.population?.items.length ?? null,
    unit: "événements sélectionnés / événements du registre figé", exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const runShown = run ? show(run) : null, beforeShown = before ? show(before) : null;
  const procedure = { id: definition.id as string, label: definition.label as string, runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null, version: run?.version ?? null,
    contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null, period: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée",
    resultId: run?.result?.id ?? null, resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, controls, notes: runShown?.notes ?? [], evidence: run?.evidence ?? [], provisions: shown,
    beforeReview: before && beforeShown ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: beforeShown.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run && runShown ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: runShown.notes, resultId: run.result?.id ?? null, resultLabel } : null };
  const required: readonly string[] = definition.requiredSources, conditional: readonly string[] = definition.conditionalSources;
  const ctx = confidentialContext(imports);
  const batches = imports.filter(b => run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id));
  const sources = PV_TYPES.flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type);
    if (found.length) return found.map(b => {
      // Rows withheld from this reader (confidential estimates) leave no locator either; the count stays visible, as on the sheet.
      const visible = confidential ? b.rows : redactProvisionBatch(b, ctx).rows;
      return { id: b.document.id, importId: b.id as string | null, type, label: PV_SOURCE_LABELS[type], fileName: b.document.fileName as string | null, sha256: b.document.byteHash as string | null,
        parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
        current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, maskedRows: b.rows.length - visible.length, confidential: provisionBatchConfidential(b, ctx), available: true, required: required.includes(type), binaryInPackage: false as const,
        locators: visible.map(row => ({ rowId: row.id, locator: row.locator })) };
    });
    return required.includes(type) || conditional.includes(type) ? [{ id: "expected:" + type, importId: null, type, label: PV_SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null, mappingVersion: null, mappingHash: null,
      approvedBy: null, approvedAt: null, current: false, rowCount: 0, maskedRows: 0, confidential: false, available: false, required: required.includes(type), binaryInPackage: false as const, locators: [] }] : [];
  });
  const queue: { id: string; category: ProvisionMissionFilter; priority: number; label: string; detail: string; href: string; eventId: string | null }[] = [];
  const add = (id: string, category: ProvisionMissionFilter, priority: number, label: string, detail: string, target: { tab?: ProvisionSheetTab; eventId?: string | null } = {}) =>
    queue.push({ id, category, priority, label, detail, eventId: target.eventId ?? null, href: provisionSheetHref(scope, run ?? null, target) });
  if (!run) add("procedure:pending", "blocked", 1, roots.length > 1 ? "Affecter une feuille Provisions" : "Registre des provisions à préparer", roots.length > 1
    ? roots.length + " feuilles Provisions pour cette période : choisissez celle que le programme restitue ; aucune n’est retenue d’office."
    : "Procédure prévue : pont par événement, estimation / écriture, annexe, cadrage par compte, pièces et informations des avocats — six contrôles.", { tab: "revue" });
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail Provisions périmé", reason, { tab: "revue" }));
  sources.filter(s => s.required && (!s.available || !s.approvedBy)).forEach(s => add("source:" + s.id, "evidence", 2, "Source Provisions approuvée attendue", s.label, { tab: "pieces" }));
  const absent = (type: string) => !sources.some(s => s.type === type && s.available);
  if (absent("pv_movements")) add("source:movements", "evidence", 2, "Journal des mouvements attendu", "Sans journal approuvé, la provision de clôture calculée reste inconnue, jamais égale à l’ouverture.", { tab: "pieces" });
  if (absent("pv_estimates")) add("source:estimates", "evidence", 2, "Estimations documentées attendues", "Sans estimations, la comparaison estimation / écriture n’est pas réalisée.", { tab: "pieces" });
  if (absent("pv_annex")) add("source:annex", "evidence", 2, "Annexe publiée attendue", "Sans annexe approuvée, la comparaison événement / annexe n’est pas réalisée.", { tab: "pieces" });
  if (absent("pv_support")) add("source:support", "evidence", 2, "Pièces citables attendues", "Sans pièces citables, mouvements et décisions restent non étayés.", { tab: "pieces" });
  if (run && !run.result) add("procedure:prepare", "blocked", 2, run.population ? "Calcul à exécuter" : "Sources et déclaration des avocats à figer", "Le programme prévoit cette procédure, même sans différence.", { tab: "revue" });
  if (run?.result && !real) add("result:invalid", "blocked", 1, "Contrat de résultat Provisions invalide", "Le calcul n’est pas restitué comme un résultat exploitable.", { tab: "revue" });
  shown?.exceptions.forEach(e => add(e.id, isUncertainty(e.code) ? "evidence" : "exceptions", 3, e.label, e.message + " · " + provisionAmountLabel(e.amount), { tab: "exceptions", eventId: e.eventId }));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant Provisions" : "Traitement à documenter", n.text, { tab: "exceptions" }));
  if (run && ["executed", "awaiting_review", "changes_requested", "approved"].includes(run.state)) add("review:pending", "review", 4, run.state === "approved" ? "Verrouillage attendu" : run.state === "executed" ? "Soumission à préparer" : run.state === "changes_requested" ? "Correction demandée" : "Revue attendue", "Décision sur cette version ; les différences restent dans le résultat.", { tab: "revue" });
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { schemaVersion: "provisions-mission-1.0.0", stateAsOf: stateDates.at(-1) ?? null, sourceFamily: "mission_procedures", scope, program: PROVISION_MISSION_PROGRAM,
    confidentiality: { access: confidential, maskedEvents: confidential ? 0 : shown?.events.filter(e => e.masked).length ?? 0,
      note: confidential ? "Habilitation confidentielle présente : restitution complète." : "Sans habilitation confidentielle : obligation, contrepartie, méthode, décision, scénarios, estimations, libellés de pièces confidentielles et lignes confidentielles des sources sont retirés par le serveur, comme sur la feuille. Les montants comptabilisés et publiés restent visibles." },
    assignment: { rootId: rootId ?? null, choices: roots, currentRunId: current?.id ?? null, currentVersion: current?.version ?? null,
      options: roots.map(r => { const head = versions.filter(v => v.rootId === r).sort((a, b) => b.revision - a.revision || b.version - a.version)[0]; return { rootId: r, runId: head.id, revision: head.revision, version: head.version, state: head.state }; }) },
    procedure, sources, queue,
    counters: { planned: PROVISION_MISSION_PROGRAM.procedures.length, plannedParts: definition.tests.length, executed: real ? 1 : 0, reviewed: review && !stale ? 1 : 0, locked: run?.state === "locked" && !stale ? 1 : 0, stale: stale ? 1 : 0,
      testedParts: controls.filter(c => c.complete).length, notApplicableParts: controls.filter(c => c.outcome === "not_applicable").length,
      exceptions: real?.exceptions.filter(e => !isUncertainty(e.code)).length ?? 0, uncertainties: real?.exceptions.filter(e => isUncertainty(e.code)).length ?? 0 },
    amountGrouping: { groups: [] as never[], reason: "Aucune somme entre catégories ni total d’exposition : montants conservés par événement, par compte et par ligne d’annexe ; aucune formule probabilité × montant." },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null,
      reviewNotes: show(v).notes.filter(n => n.kind === "judgment"), events: v.events, lawyers: v.provisionWork?.lawyers.status ?? null })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    limitations: [...PV_LIMITATIONS, "Revue documentée ne vaut ni opinion sur les comptes ni conclusion juridique ; aucune opinion automatique.",
      "Pièces binaires absentes du paquet ; leur téléchargement séparé suit les mêmes permissions et, pour une source confidentielle, l’habilitation dédiée.", "SHA-256 = intégrité, sans signature légale ni archivage certifié.",
      ...(confidential ? [] : ["Restitution masquée côté serveur : un montant ou un texte confidentiel retiré reste inconnu ; il n’est jamais remplacé par zéro."])] };
  return frozen({ ...body, hash: stableSha256(body) });
}
export type ProvisionMissionSnapshot = ReturnType<typeof buildProvisionMission>;
