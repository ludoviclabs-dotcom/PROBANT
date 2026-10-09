import { canonicalCompare, stableSha256 } from "@/lib/synthesis/canonical";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import { assertScope, contentHash, frozen, validateRun, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { otherTaxCapabilities } from "./fiscal-rules";
import { fiscalPeriodLabel, fiscalSheetHref, fxCents, type FiscalMissionFilter } from "./fiscal-labels";
export { fiscalPeriodLabel, fiscalSheetHref, fxCents };
export type { FiscalMissionFilter };
import { fiscalRelevance, fiscalSourcesCurrent, FX_SOURCE_LABELS, type FiscalSourceType } from "./fiscal-sources";
import type { FiscalSourceHead } from "./fiscal-store";
import { VAT_LIMITATIONS, VAT_PROCEDURE, VAT_UNCERTAINTY_CODES, vatResultSchema, type VatResult } from "./fiscal-vat";

/** Closed programme: one VAT procedure per declarative period; its denominators exist before any result or exception. */
export const FISCAL_MISSION_PROGRAM = {
  id: "fiscal.program", version: "1.0.0", label: "Programme fiscal : TVA par période déclarative (sous-lot 1), IS de l’exercice (sous-lot 2)",
  procedures: [{ id: VAT_PROCEDURE, version: "1.0.0", label: "TVA — écritures, déclaration, pièces, paiements et crédit reporté d’une période déclarative", unit: "période déclarative",
    requiredSources: ["fx_fec"], conditionalSources: ["fx_vat_return", "fx_invoices", "fx_vat_payments", "fx_support"],
    tests: [{ id: "comparison", label: "Comptabilisé ↔ déclaré (collectée, déductible, nette, crédit)" }, { id: "bridge", label: "Pont explicatif : net comptabilisé → net déclaré" },
      { id: "pieces", label: "Écritures ↔ pièces de l’inventaire" }, { id: "payments", label: "Net déclaré ↔ paiements au Trésor" }, { id: "credit", label: "Continuité du crédit reporté" }, { id: "engine", label: "Contrôles du moteur TVA (TAX-06)" }] }],
  outOfScope: ["Liquidation, dépôt, télétransmission, intérêts et pénalités", "Prorata et coefficients de déduction, régimes sectoriels, groupes TVA, franchise", "Qualification légale d’un taux de TVA : aucun barème n’est publié dans le registre",
    "Autres impôts et taxes (CFE, CVAE, C3S, taxe sur les salaires…) : capacités séparées, non couvertes par cette feuille", "IS : sous-lot suivant de la mission"],
} as const;
export type FiscalMissionSelection = { rootId?: string; id?: string; version?: number };
const CONVENTIONS: Record<string, string> = {
  comparison: "Écart = comptabilisé (écritures du FEC datées dans la période) − déclaré (cases de la CA3 / CA12) ; une valeur absente reste inconnue, jamais zéro.",
  bridge: "Net comptabilisé + explications humaines citant une pièce figée = net expliqué ; résidu = net déclaré − net expliqué.",
  pieces: "Chaque écriture de TVA est cherchée par sa référence de pièce dans l’inventaire fourni ; une pièce absente de PROBANT n’est pas une pièce absente du dossier.",
  payments: "Paiements au Trésor rattachés exactement à la période déclarative, comparés à la TVA nette due déclarée.",
  credit: "Crédit à reporter de la déclaration précédente comparé au crédit antérieur reçu sur la déclaration de la période.",
  engine: "Seize contrôles du moteur TVA ; un contrôle dont la source n’est pas couverte est bloqué, sans version voisine substituée.",
};
export function fiscalAmountLabel(amount: KnownAmount | Money | null | undefined) {
  if (!amount) return "Non calculé";
  if ("amount" in amount) return amount.amount + " EUR";
  return amount.kind === "known" ? amount.value.amount + " EUR" : amount.reason;
}
export function fiscalLocatorLabel(locator?: EvidenceLink["locator"]) {
  if (!locator) return "Document entier";
  return [locator.sheet && "Feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page, locator.zone].filter(Boolean).join(", ") || "Document entier";
}
/** Result accepted only if it is the run’s own, for its own scope and declarative period. */
export function fiscalResultOf(run: WorkpaperRun | undefined | null): VatResult | null {
  if (!run?.result || run.result.execution !== "completed" || !run.fiscalWork) return null;
  const parsed = vatResultSchema.safeParse(run.result.result);
  return parsed.success && parsed.data.runId === run.id && stableSha256(parsed.data.scope) === stableSha256(run.scope) && stableSha256(parsed.data.period) === stableSha256(run.fiscalWork.period) ? parsed.data : null;
}
const isUncertainty = (code: VatResult["exceptions"][number]["code"]) => VAT_UNCERTAINTY_CODES.includes(code);
type Outcome = "no_exception_detected" | "exceptions_detected" | "inconclusive";
const fromEngine = (o: string | undefined): Outcome | null => !o ? null : o === "passed" ? "no_exception_detected" : ["reconciliation_difference", "potential_tax_risk", "review_recommendation", "confirmed_non_compliance"].includes(o) ? "exceptions_detected" : "inconclusive";
function testsOf(r: VatResult | null) {
  if (!r) return {} as Record<string, { outcome: Outcome | null; numerator: number; denominator: number | null; unit: string }>;
  const known = (status: string, diff: number | null | undefined): Outcome => status !== "known" ? "inconclusive" : diff === 0 ? "no_exception_detected" : "exceptions_detected";
  const cmp = r.comparison.filter(c => c.key !== "credit"), withPiece = r.entries.filter(e => e.piece.status === "found").length;
  return {
    comparison: { outcome: cmp.some(c => c.differenceCents === null) ? "inconclusive" as Outcome : cmp.some(c => c.differenceCents !== 0) ? "exceptions_detected" as Outcome : "no_exception_detected" as Outcome, numerator: cmp.filter(c => c.differenceCents !== null).length, denominator: cmp.length, unit: "lignes comparées" },
    bridge: { outcome: known(r.bridge.status, r.bridge.residualCents), numerator: r.bridge.status === "known" ? 1 : 0, denominator: 1, unit: "pont" },
    pieces: { outcome: r.entries.some(e => e.piece.status === "not_provided") ? "inconclusive" as Outcome : fromEngine(r.controls.find(c => c.controlId === "VAT.PIECE.MISSING")?.outcome) ?? "inconclusive", numerator: withPiece, denominator: r.entries.length, unit: "écritures avec pièce trouvée" },
    payments: { outcome: known(r.payments.status, r.payments.differenceCents), numerator: r.payments.status === "known" ? 1 : 0, denominator: 1, unit: "rapprochement" },
    credit: { outcome: known(r.credit.status, r.credit.differenceCents), numerator: r.credit.status === "known" ? 1 : 0, denominator: 1, unit: "report" },
    engine: { outcome: r.engine.status === "blocked" ? "inconclusive" as Outcome : fromEngine(r.engine.outcome), numerator: r.controls.filter(c => !["inconclusive", "missing_information"].includes(c.outcome)).length, denominator: r.engine.status === "blocked" ? null : r.controls.length, unit: "contrôles conclus" },
  };
}
function labels(run: WorkpaperRun | undefined, r: VatResult | null) {
  // No label can read as a legal green light: the best case is « aucun écart sur le périmètre testé ».
  const resultLabel = !run?.result ? "Non exécuté" : !r ? "Calcul fiscal bloqué ou contrat invalide" : r.engine.status === "blocked" ? "Moteur bloqué — règles ou profil requis"
    : r.exceptions.some(e => !isUncertainty(e.code)) ? "Exceptions maintenues" : r.exceptions.length || ["missing_information", "inconclusive"].includes(r.engine.outcome) ? "Travaux partiels — non concluant sur une partie" : "Aucun écart sur le périmètre testé — aucune liquidation ni conformité déclarée";
  const reviewLabel = run?.state === "locked" ? "Revue documentée et version verrouillée" : run?.approval ? "Revue documentée" : run?.state === "awaiting_review" ? "Revue attendue" : run?.state === "changes_requested" ? "Correction demandée" : "Non revu";
  return { resultLabel, reviewLabel };
}

export function buildFiscalMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: FiscalSourceHead[], selection: FiscalMissionSelection = {}, baselineAt?: string) {
  if (scope.mode !== "real") throw new Error("MISSION_REAL_SCOPE_REQUIRED");
  versions.forEach(v => { validateRun(v); assertScope(scope, v.scope); if (v.template.id !== VAT_PROCEDURE || !v.fiscalWork) throw new Error("MISSION_PROCEDURE_OUT_OF_SCOPE"); });
  imports.forEach(b => assertScope(scope, b.scope));
  const roots = [...new Set(versions.map(v => v.rootId))];
  if (selection.rootId && !roots.includes(selection.rootId)) throw new Error("WORKPAPER_NOT_FOUND");
  if (selection.id && !versions.some(v => v.id === selection.id)) throw new Error("WORKPAPER_NOT_FOUND");
  const definition = FISCAL_MISSION_PROGRAM.procedures[0];
  const latest = (root: string) => versions.filter(v => v.rootId === root).sort((a, b) => b.revision - a.revision || b.version - a.version)[0];
  const staleOf = (run: WorkpaperRun, current: WorkpaperRun) => {
    const reasons: string[] = [];
    if (run.id !== current.id || run.version !== current.version) reasons.push("Une version plus récente de cette feuille est disponible.");
    if (!fiscalSourcesCurrent(run.importIds, heads, fiscalRelevance(run, heads))) reasons.push("Une source dont dépend cette période (FEC, déclaration de la période ou de la période précédente, inventaires) a été remplacée ou ajoutée depuis le gel.");
    if (run.template.version !== definition.version || run.template.rule?.version !== definition.version) reasons.push("La version de règle diffère du programme.");
    return reasons;
  };
  // Navigation by tax and period: one line per declarative period, in calendar order.
  const periods = roots.map(root => {
    const current = latest(root), w = current.fiscalWork!, r = fiscalResultOf(current), reasons = staleOf(current, current), { resultLabel, reviewLabel } = labels(current, r);
    return { rootId: root, tax: w.tax, label: "TVA · " + fiscalPeriodLabel(w.period, w.frequency), period: w.period, frequency: w.frequency, runId: current.id, version: current.version, revision: current.revision, state: current.state,
      resultLabel, reviewLabel, stale: reasons.length > 0, staleReasons: reasons, exceptions: r?.exceptions.filter(e => !isUncertainty(e.code)).length ?? 0, uncertainties: r?.exceptions.filter(e => isUncertainty(e.code)).length ?? 0,
      blockedRules: r?.blockedRules.filter(b => b.code !== "VAT_RATE_SCHEDULE_NOT_PUBLISHED").length ?? 0, engine: r ? { status: r.engine.status, outcome: r.engine.outcome, tier: r.engine.evidenceTier, coverage: r.engine.coverage?.status ?? null } : null,
      href: fiscalSheetHref(scope, current, "all", { tax: w.tax, period: w.period }) };
  }).sort((a, b) => canonicalCompare(a.period.startDate + a.period.endDate, b.period.startDate + b.period.endDate));
  const rootId = selection.rootId ?? (selection.id ? versions.find(v => v.id === selection.id)?.rootId : undefined) ?? periods[0]?.rootId;
  const assigned = versions.filter(v => v.rootId === rootId).sort((a, b) => b.revision - a.revision || b.version - a.version);
  const current = assigned[0];
  const run = selection.id ? assigned.find(v => v.id === selection.id && (selection.version === undefined || v.version === selection.version)) : current;
  if (selection.id && !run) throw new Error("WORKPAPER_VERSION_NOT_FOUND");
  const vat = fiscalResultOf(run), staleReasons = run && current ? staleOf(run, current) : [], stale = staleReasons.length > 0;
  const review = run?.approval ? { actorId: run.approval.actorId, at: run.approval.at, note: run.approval.note, approvedVersion: run.approval.version, snapshotHash: run.approval.snapshotHash } : null;
  const { resultLabel, reviewLabel } = labels(run, vat), tests = testsOf(vat);
  const controls = definition.tests.map(test => {
    const t = tests[test.id];
    return { id: test.id, label: test.label, ruleVersion: definition.version, convention: CONVENTIONS[test.id], outcome: t?.outcome ?? null,
      coverage: { numerator: t?.numerator ?? 0, denominator: t?.denominator ?? null, unit: t?.unit ?? test.label, exclusions: [] as { id: string; reason: string }[] }, complete: !!t && t.denominator !== null && t.denominator > 0 && t.numerator === t.denominator };
  });
  const populationIds = new Set(run?.population?.items.map(i => i.id) ?? []);
  const coverage = { numerator: new Set(run?.selection?.selectedIds.filter(id => populationIds.has(id)) ?? []).size, denominator: run?.population?.items.length ?? null,
    unit: "écritures de TVA de la période / écritures de TVA du FEC figé", exclusions: run?.selection?.exclusions ?? [], criteria: run?.selection?.criteria ?? "Population non figée", limitations: run?.selection?.limitations ?? [] };
  const before = run ? assigned.filter(v => v.id === run.id && v.version <= run.version && v.state === "awaiting_review").sort((a, b) => b.version - a.version)[0] : undefined;
  const w = run?.fiscalWork ?? null;
  const procedure = { id: definition.id as string, label: definition.label as string, tax: w?.tax ?? null, period: w?.period ?? null, frequency: w?.frequency ?? null, periodLabel: w ? "TVA · " + fiscalPeriodLabel(w.period, w.frequency) : null,
    runId: run?.id ?? null, rootId: run?.rootId ?? null, revision: run?.revision ?? null, version: run?.version ?? null,
    contentHash: run ? contentHash(run) : null, state: run?.state ?? "not_started", preparedBy: run?.preparedBy ?? null, accountingPeriod: run?.period ?? null, conclusion: run?.conclusion ?? "Conclusion non renseignée",
    resultId: run?.result?.id ?? null, resultInputHash: run?.result?.inputHash ?? null, resultLabel, reviewLabel, review, stale, staleReasons, coverage, controls, notes: run?.notes ?? [], evidence: run?.evidence ?? [], vat,
    legal: { conclusion: "Aucune liquidation, aucune conformité déclarée", meaning: "La feuille rapproche et explique ; elle ne liquide pas l’impôt, ne télétransmet rien et ne qualifie aucun taux de légal." },
    beforeReview: before ? { id: before.id, version: before.version, contentHash: contentHash(before), conclusion: before.conclusion ?? "", notes: before.notes, resultId: before.result?.id ?? null, resultLabel } : null,
    afterReview: review && run ? { id: run.id, version: run.version, contentHash: contentHash(run), conclusion: run.conclusion ?? "", notes: run.notes, resultId: run.result?.id ?? null, resultLabel } : null };
  const required: readonly string[] = definition.requiredSources, conditional: readonly string[] = definition.conditionalSources;
  const relevant = run ? fiscalRelevance(run, heads) : () => true;
  const batches = imports.filter(b => b.approval && (run?.importIds.length ? run.importIds.includes(b.id) : heads.some(h => h.import_id === b.id && relevant(h.document_type))));
  const sourceRow = (b: ImportBatch) => { const type = b.document.documentType as FiscalSourceType; return { id: b.document.id, importId: b.id as string | null, type, key: b.document.logicalId, label: FX_SOURCE_LABELS[type] + (b.document.logicalId.includes(":") ? " — " + b.document.logicalId.split(":").slice(1).join(" → ") : ""), fileName: b.document.fileName as string | null, sha256: b.document.byteHash as string | null,
    parserVersion: b.document.parserVersion as string | null, mappingVersion: b.mapping.version as string | null, mappingHash: b.mappingHash as string | null, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null,
    current: heads.some(h => h.import_id === b.id), rowCount: b.rows.length, available: true, required: required.includes(type), binaryInPackage: false as const,
    locators: b.document.documentType === "fx_fec" ? [] : b.rows.slice(0, 500).map(row => ({ rowId: row.id, locator: row.locator as EvidenceLink["locator"] })) }; };
  const expected = (type: FiscalSourceType) => ({ id: "expected:" + type, importId: null, type, key: type, label: FX_SOURCE_LABELS[type], fileName: null, sha256: null, parserVersion: null, mappingVersion: null, mappingHash: null,
    approvedBy: null, approvedAt: null, current: false, rowCount: 0, available: false, required: required.includes(type), binaryInPackage: false as const, locators: [] as { rowId: string; locator: EvidenceLink["locator"] }[] });
  const types: FiscalSourceType[] = ["fx_fec", "fx_vat_return", "fx_invoices", "fx_vat_payments", "fx_support"];
  const sources = types.flatMap(type => {
    const found = batches.filter(b => b.document.documentType === type).sort((a, b) => canonicalCompare(a.document.logicalId, b.document.logicalId));
    return found.length ? found.map(sourceRow) : required.includes(type) || conditional.includes(type) ? [expected(type)] : [];
  });
  // Replaced versions stay listed with their hash: a corrected return never silently overwrites the one a review relied on.
  const replaced = imports.filter(b => b.approval && !heads.some(h => h.import_id === b.id)).map(b => ({ key: b.document.logicalId, importId: b.id, documentVersionId: b.document.id, fileName: b.document.fileName, sha256: b.document.byteHash, approvedAt: b.approval!.at, usedByRun: !!run?.importIds.includes(b.id) }))
    .sort((a, b) => canonicalCompare(a.key + a.approvedAt, b.key + b.approvedAt));
  const queue: { id: string; category: FiscalMissionFilter; priority: number; label: string; detail: string; href: string; noteId?: string }[] = [];
  const add = (id: string, category: FiscalMissionFilter, priority: number, label: string, detail: string, target: { item?: string | null; noteId?: string } = {}) =>
    queue.push({ id, category, priority, label, detail, ...(target.noteId ? { noteId: target.noteId } : {}), href: fiscalSheetHref(scope, run ?? null, category, { ...(w ? { tax: w.tax, period: w.period } : {}), ...target }) });
  if (!run) add("procedure:pending", "blocked", 1, "Feuille TVA à créer pour une période déclarative", "Procédure prévue par période : comparaison, pont, pièces, paiements, crédit reporté et contrôles du moteur.");
  staleReasons.forEach((reason, i) => add("stale:" + i, "stale", 0, "Travail TVA périmé", reason));
  for (const p of periods.filter(p => p.rootId !== rootId && p.stale)) add("stale:" + p.rootId, "stale", 0, "Autre période périmée : " + p.label, p.staleReasons.join(" "));
  sources.filter(s => s.required && (!s.available || !s.approvedBy)).forEach(s => add("source:" + s.id, "evidence", 2, "Source fiscale approuvée attendue", s.label));
  if (run && !sources.some(s => s.type === "fx_vat_return" && s.available && w && s.key === `fx_vat_return:${w.period.startDate}:${w.period.endDate}`)) add("source:return", "evidence", 2, "Déclaration de la période attendue", "Sans CA3 / CA12 de la période, la feuille reste au niveau « FEC seul » : signal, jamais réconciliation.");
  if (run && !run.result) add("procedure:prepare", "blocked", 2, run.population ? "Feuille à exécuter" : "Sources à figer", "Le programme prévoit cette procédure, même sans exception.");
  if (run?.result && !vat) add("result:invalid", "blocked", 1, "Contrat de résultat fiscal invalide", "Le calcul n’est pas restitué comme un résultat exploitable.");
  vat?.blockedRules.filter(b => b.code !== "VAT_RATE_SCHEDULE_NOT_PUBLISHED").forEach(b => add("rule:" + b.code, "blocked", 1, "Règle bloquée : " + b.label, b.requiredSource));
  vat?.exceptions.forEach(e => add(e.id, isUncertainty(e.code) ? "evidence" : "exceptions", 3, e.label, e.message + " · " + fiscalAmountLabel(e.amount), { item: e.controlId }));
  procedure.notes.filter(n => !n.resolution).forEach(n => add("note:" + n.id, n.blocking ? "blocked" : n.kind === "missing_evidence" ? "evidence" : "exceptions", n.blocking ? 1 : 2, n.blocking ? "Point bloquant TVA" : "Traitement à documenter", n.text, { noteId: n.id }));
  if (run && ["executed", "awaiting_review", "changes_requested", "approved"].includes(run.state)) add("review:pending", "review", 4, run.state === "approved" ? "Verrouillage attendu" : run.state === "executed" ? "Soumission à préparer" : run.state === "changes_requested" ? "Correction demandée" : "Revue attendue", "Décision sur cette version ; les exceptions restent dans le résultat ; aucune conformité déclarée.");
  queue.sort((a, b) => a.priority - b.priority || canonicalCompare(a.id, b.id));
  const stateDates = [...versions.flatMap(v => v.events.map(e => e.at)), ...imports.filter(b => heads.some(h => h.import_id === b.id)).flatMap(b => b.approval ? [b.approval.at] : []), ...(baselineAt ? [baselineAt] : [])].filter(at => Number.isFinite(Date.parse(at))).sort();
  const body = { schemaVersion: "fiscal-mission-1.0.0", stateAsOf: stateDates.at(-1) ?? null, sourceFamily: "mission_procedures", scope, program: FISCAL_MISSION_PROGRAM, periods,
    assignment: { rootId: rootId ?? null, choices: periods.map(p => p.rootId), currentRunId: current?.id ?? null, currentVersion: current?.version ?? null },
    procedure, sources, replaced, queue,
    counters: { planned: periods.length, plannedParts: definition.tests.length, executed: periods.filter(p => p.engine).length, reviewed: periods.filter(p => ["approved", "locked"].includes(p.state) && !p.stale).length, locked: periods.filter(p => p.state === "locked" && !p.stale).length, stale: periods.filter(p => p.stale).length,
      testedParts: controls.filter(c => c.complete).length, exceptions: vat?.exceptions.filter(e => !isUncertainty(e.code)).length ?? 0, uncertainties: vat?.exceptions.filter(e => isUncertainty(e.code)).length ?? 0 },
    versionIndex: assigned.map(v => ({ id: v.id, revision: v.revision, version: v.version, state: v.state, contentHash: contentHash(v), actorId: v.events.at(-1)?.actorId ?? v.preparedBy, approval: v.approval ?? null, reviewNotes: v.notes.filter(n => n.kind === "judgment"), events: v.events,
      profile: v.fiscalWork ? { status: v.fiscalWork.profile.status, vatRegime: v.fiscalWork.profile.vatRegime, confirmedBy: v.fiscalWork.profile.confirmedBy, evidence: v.fiscalWork.profile.evidence?.fileName ?? null } : null,
      explanations: v.fiscalWork?.explanations.map(e => ({ id: e.id, label: e.label, amountCents: e.amountCents, documentVersionId: e.citation.documentVersionId, row: e.citation.row ?? null, authorId: e.authorId, at: e.at })) ?? [] })),
    sourceHeads: [...heads].sort((a, b) => canonicalCompare(a.document_type, b.document_type)),
    otherTaxes: otherTaxCapabilities(),
    limitations: [...VAT_LIMITATIONS, "Revue documentée ne signifie ni conformité fiscale ni liquidation ; aucune opinion automatique.", "Pièces binaires absentes du paquet ; téléchargement séparé soumis aux mêmes permissions.", "SHA-256 = intégrité, sans signature légale ni archivage certifié.", "Une suite verte sur données synthétiques n’autorise aucune mission réelle."] };
  return frozen({ ...body, hash: stableSha256(body) });
}
export type FiscalMissionSnapshot = ReturnType<typeof buildFiscalMission>;
