import type { KnownAmount } from "@/lib/canonical-model/money";
import { money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { taxKnowledgeRegistry } from "@/lib/knowledge/tax-registry";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { createTaxPeriod, createTaxProfile } from "@/lib/tax/canonical";
import { computeCorporateTax } from "@/lib/tax/corporate-tax/engine";
import { amountFor, CORPORATE_TAX_FORM_MAPPINGS, DECLARATION_BOXES, DECLARATION_FORM, DEFICIT_BOXES, DEFICIT_FOLLOW_UP_FORM, readDeclarationBoxes } from "@/lib/tax/corporate-tax/liasse";
import { eurosToCents, fecDateToIso } from "@/lib/tax/vat/ledger";
import { CIT_LIMITATIONS, CIT_METHOD_TEXT, citDraftSchema, citResultSchema, citWorkSchema, type CitDraft, type CitResult, type CitWork } from "./fiscal-cit-contract";
import { blockedRules, otherTaxCapabilities, ruleSource } from "./fiscal-rules";
import { declarationSnapshot, fecEntries, type FiscalDeclaration } from "./fiscal-sources";
import { resolveCitation } from "./fiscal-work";
import type { ImportBatch } from "./imports";
import { frozen, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export * from "./fiscal-cit-contract";
/**
 * IS sheet (Mission 13, second sub-lot). The computation is the TAX-05 engine `computeCorporateTax`; this module frames
 * the declared accounting result on the FEC, documents the adjustments with cited pieces and registry sources, and
 * presents the engine snapshot. A missing schedule, vintage or profile blocks; nothing is computed in its place.
 */
/** Internal, documented account table (PCG structure): result accounts, recorded corporate income tax and its liability. Not a tax rule. */
export const CIT_ACCOUNT_MAP = { resultClasses: ["6", "7"], taxCharge: ["695"], taxLiability: ["444"] } as const;
const returnsOf = (imports: ImportBatch[], p: { startDate: string; endDate: string }) =>
  imports.filter(b => b.document.documentType === "fx_cit_return" && b.document.logicalId.endsWith(`:${p.startDate}:${p.endDate}`)).sort((a, b) => a.document.logicalId < b.document.logicalId ? -1 : 1);

export function initialCitWork(input: { period: { startDate: string; endDate: string }; formVintage: number; actor: Principal; at: string }): CitWork {
  return frozen(citWorkSchema.parse({ tax: "cit", schemaVersion: "fiscal-cit-1", period: input.period, frequency: "annual", formVintage: input.formVintage, resultBasis: "after_tax",
    profile: { regime: "unknown", groupStatus: "unknown", turnoverCents: null, capitalPaid: "unknown", ownershipBasisPoints: null, siren: null, status: "draft", confirmedBy: null, confirmedAt: null, evidence: null },
    adjustments: [], accountMap: CIT_ACCOUNT_MAP, configuredBy: input.actor.id, configuredAt: input.at }));
}
export function citDraftFromWork(w: CitWork): CitDraft {
  const cite = (c: { documentVersionId: string; rowId?: string }) => ({ documentId: c.documentVersionId, ...(c.rowId ? { rowId: c.rowId } : {}) });
  const { status: _s, confirmedBy: _b, confirmedAt: _a, evidence, ...profile } = w.profile; void _s; void _b; void _a;
  return citDraftSchema.parse({ formVintage: w.formVintage, resultBasis: w.resultBasis, profile: { ...profile, evidence: evidence ? cite(evidence) : null },
    adjustments: w.adjustments.map(({ authorId: _x, at: _y, citation, ...a }) => { void _x; void _y; return { ...a, citation: cite(citation) }; }) });
}
/**
 * Server-only stamping: the exercise identifies the run; the vintage must be the one of the frozen returns; the profile
 * is confirmed only with a cited piece; a legal source is read from the registry, never typed; a second IS adjustment,
 * or an IS adjustment on a before-tax basis, is refused.
 */
export function stampCitWork(input: { scope: WorkpaperScope; runId: string; imports: ImportBatch[]; draft: CitDraft; actor: Principal; at: string; previous: CitWork }): CitWork {
  authorize(input.actor, input.scope, "prepare");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("FX_TIMESTAMP_INVALID");
  const draft = citDraftSchema.parse(input.draft), previous = citWorkSchema.parse(input.previous);
  for (const b of returnsOf(input.imports, previous.period)) if (declarationSnapshot(b, { id: "check", version: "1" }, true).formVintage !== draft.formVintage) throw new Error("FX_VINTAGE_MISMATCH");
  const tax = draft.adjustments.filter(a => a.category === "accounted_tax");
  if (tax.length > 1 || (tax.length === 1 && (draft.resultBasis === "before_tax" || tax[0].direction !== "reintegration"))) throw new Error("FX_CIT_DOUBLE_TAX_ADJUSTMENT");
  for (const a of draft.adjustments) {
    if (a.treatment === "proposed_correction" && !a.legalSource) throw new Error("FX_CIT_CORRECTION_SOURCE_REQUIRED");
    if (!a.legalSource) continue;
    const source = taxKnowledgeRegistry.sources.find(s => s.id === a.legalSource!.sourceId), version = taxKnowledgeRegistry.sourceVersions.find(v => v.id === a.legalSource!.sourceVersionId && v.sourceId === a.legalSource!.sourceId);
    if (!source || !version || !source.taxTypes.includes("corporate_income_tax")) throw new Error("FX_CIT_SOURCE_UNKNOWN");
    // A correction enters the computation: its legal source must cover the whole exercise. A documenting adjustment shows its coverage instead.
    if (a.treatment === "proposed_correction" && ruleSource(source.id, previous.period.startDate, previous.period.endDate).coverage !== "covered") throw new Error("FX_CIT_SOURCE_NOT_COVERED");
  }
  const evidence = draft.profile.evidence ? resolveCitation(input.imports, draft.profile.evidence) : null;
  const confirmed = !!evidence && draft.profile.regime !== "unknown";
  const { evidence: _e, ...profileFields } = draft.profile; void _e;
  const { status: _ps, confirmedBy: _pb, confirmedAt: _pa, evidence: prevEvidence, ...prevFields } = previous.profile; void _ps; void _pb; void _pa;
  const same = previous.profile.status === "confirmed" && stableSha256(prevFields) === stableSha256(profileFields) && stableSha256(prevEvidence) === stableSha256(evidence);
  const profile = { ...profileFields, status: confirmed ? "confirmed" as const : "draft" as const, confirmedBy: confirmed ? (same ? previous.profile.confirmedBy : input.actor.id) : null, confirmedAt: confirmed ? (same ? previous.profile.confirmedAt : input.at) : null, evidence };
  const adjustments = draft.adjustments.map(a => {
    const cited = { ...a, citation: resolveCitation(input.imports, a.citation) };
    const old = previous.adjustments.find(p => p.id === a.id);
    if (old) { const { authorId, at, ...prior } = old; if (stableSha256(prior) === stableSha256(cited)) return { ...cited, authorId, at }; }
    return { ...cited, authorId: input.actor.id, at: input.at };
  }).sort((a, b) => a.id < b.id ? -1 : 1);
  return frozen(citWorkSchema.parse({ ...previous, formVintage: draft.formVintage, resultBasis: draft.resultBasis, profile, adjustments, configuredBy: input.actor.id, configuredAt: input.at }));
}

const knownCents = (v: number): KnownAmount => ({ kind: "known", value: money(BigInt(v)) });
const na = (reason: string): KnownAmount => ({ kind: "not_applicable", reason });
const signed = (profit: { amountCents: number } | undefined, loss: { amountCents: number } | undefined) =>
  profit && profit.amountCents !== 0 ? profit.amountCents : loss && loss.amountCents !== 0 ? -loss.amountCents : profit || loss ? 0 : null;

/** Deterministic evaluation from frozen inputs: canonical profile and period, one engine call, server-side framing and presentation. */
export function evaluateCit(scope: WorkpaperScope, accountingPeriod: AccountingPeriod, imports: ImportBatch[], runId: string, work: CitWork): CitResult {
  const w = citWorkSchema.parse(work), owned = { organizationId: scope.organizationId, dossierId: scope.dossierId, entityId: scope.dossierId };
  const p = w.profile, fiscalYear = Number(w.period.endDate.slice(0, 4));
  const profile = createTaxProfile({ ...owned, id: `fxprofile:${runId}`, version: stableSha256(p).slice(0, 16), jurisdiction: "FR", status: p.status, corporateIncomeTaxRegime: p.regime, vatRegime: "unknown",
    accountingPeriod: { startDate: accountingPeriod.startDate, endDate: accountingPeriod.closingDate }, corporateIncomeTaxGroupStatus: p.groupStatus, vatGroupStatus: "unknown",
    turnoverAmountCents: p.turnoverCents === null ? null : Number(p.turnoverCents), capitalPaidStatus: p.capitalPaid, ownershipStatus: p.ownershipBasisPoints === null ? "unknown" : "known", qualifyingIndividualOwnershipBasisPoints: p.ownershipBasisPoints,
    vatLiabilityRatioStatus: "unknown", vatLiabilityRatioBasisPoints: null, establishments: [], parameters: [], confirmedBy: p.confirmedBy, confirmedAt: p.confirmedAt, createdAt: w.configuredAt });
  const period = createTaxPeriod({ ...owned, id: `fxperiod:${runId}`, taxType: "corporate_income_tax", startDate: w.period.startDate, endDate: w.period.endDate, fiscalYear, formVintage: w.formVintage,
    frequency: "annual", accountingPeriodId: scope.periodId, status: "unknown", version: "1", sourceRefs: [], createdAt: w.configuredAt });
  const fec = imports.find(b => b.document.documentType === "fx_fec");
  if (!fec) throw new Error("FX_FEC_REQUIRED");
  // FEC framing in exact cents: result accounts (classes 6 and 7), recorded tax (695) and its liability (444), within the exercise.
  const all = fecEntries(fec), lines = all.filter(e => { const d = fecDateToIso(e.ecritureDate); return !!d && d >= w.period.startDate && d <= w.period.endDate; });
  const startsWith = (account: string, prefixes: readonly string[]) => prefixes.some(x => account.startsWith(x));
  const sum = (prefixes: readonly string[], sign: 1 | -1) => { const matched = lines.filter(e => startsWith(e.compteNum, prefixes)); return matched.length ? matched.reduce((s, e) => s + sign * (eurosToCents(e.credit) - eurosToCents(e.debit)), 0) : null; };
  const resultAfterTax = sum(w.accountMap.resultClasses, 1), taxCharge = sum(w.accountMap.taxCharge, -1), liability = sum(w.accountMap.taxLiability, 1);
  const returns: FiscalDeclaration[] = returnsOf(imports, w.period).map(b => declarationSnapshot(b, period, true));
  const active = returns.filter(r => r.published && r.formVintage === w.formVintage).map(r => r.snapshot);
  const regime = p.regime === "standard" || p.regime === "simplified" ? p.regime : null, mapping = regime ? CORPORATE_TAX_FORM_MAPPINGS[regime] : null;
  const declared = mapping ? readDeclarationBoxes({ snapshots: active, formNumber: mapping.formNumber, formVintage: w.formVintage, fieldCodes: [mapping.accountingProfit, mapping.accountingLoss, mapping.resultBeforeDeficitsProfit, mapping.resultBeforeDeficitsDeficit] }) : null;
  const declaredResult = declared ? signed(amountFor(declared, mapping!.accountingProfit), amountFor(declared, mapping!.accountingLoss)) : null;
  const declaredBeforeDeficits = declared ? signed(amountFor(declared, mapping!.resultBeforeDeficitsProfit), amountFor(declared, mapping!.resultBeforeDeficitsDeficit)) : null;
  const corrections = w.adjustments.filter(a => a.treatment === "proposed_correction");
  const { snapshot, reconciliationLines } = computeCorporateTax({ ...owned, executionId: runId, snapshotId: `fxcit:${runId}`, profile, period, documentSnapshots: active,
    confirmedAdjustments: corrections.map(a => ({ id: a.id, category: a.category, direction: a.direction, label: a.label, amountCents: Number(a.amountCents), snapshotId: a.citation.documentVersionId, contentHash: stableSha256(a.citation),
      sourceRefs: [a.legalSource!], evidenceRefs: [a.citation.documentVersionId + (a.citation.rowId ? "#" + a.citation.rowId : "")], reviewEventId: `${a.authorId}@${a.at}` })),
    accountedPositions: taxCharge !== null || liability !== null ? { chargeCents: taxCharge, liabilityCents: liability, snapshotId: fec.document.id, contentHash: fec.document.byteHash } : undefined,
    createdAt: w.configuredAt, createdBy: w.configuredBy });
  const computed = snapshot.status === "computed";
  const comparable = declaredResult !== null && resultAfterTax !== null;
  const framing: CitResult["framing"] = { status: !comparable ? "unknown" : resultAfterTax === declaredResult ? "framed" : "difference",
    reason: comparable ? null : resultAfterTax === null ? "Aucune ligne de classe 6 ou 7 dans l’exercice : résultat comptable du FEC inconnu, jamais nul." : !returns.length ? "Liasse de l’exercice absente : résultat comptable déclaré inconnu, jamais nul." : !mapping ? "Régime d’IS non confirmé : cases de la liasse inconnues." : "Résultat comptable de la liasse non lu (millésime non publié, case absente ou non exploitable).",
    fecLines: all.length, fecLinesInExercise: lines.length, resultAfterTaxCents: resultAfterTax, taxChargeCents: taxCharge, resultBeforeTaxCents: taxCharge === null || resultAfterTax === null ? null : resultAfterTax + taxCharge, taxLiabilityCents: liability,
    declaredResultCents: declaredResult, declaredBox: mapping ? (declaredResult !== null && declaredResult < 0 ? mapping.accountingLoss : mapping.accountingProfit) : null, differenceCents: comparable ? resultAfterTax! - declaredResult! : null };
  const documented = w.adjustments.filter(a => a.treatment === "documents_declared");
  const reint = documented.filter(a => a.direction === "reintegration").reduce((s, a) => s + Number(a.amountCents), 0), ded = documented.filter(a => a.direction === "deduction").reduce((s, a) => s + Number(a.amountCents), 0);
  const start = w.resultBasis === "after_tax" ? resultAfterTax : framing.resultBeforeTaxCents, documentedResult = start === null ? null : start + reint - ded;
  const bridgeKnown = documentedResult !== null && declaredBeforeDeficits !== null;
  const bridge: CitResult["bridge"] = { status: bridgeKnown ? "known" : "unknown", reason: start === null ? (resultAfterTax === null ? "Résultat comptable du FEC inconnu : pont non calculé." : "Charge d’IS non lue dans le FEC (aucune ligne 695) : base avant impôt inconnue.") : declaredBeforeDeficits === null ? "Résultat fiscal avant déficits déclaré non lu : pont arrêté au résultat documenté." : null,
    basis: w.resultBasis, startCents: start, reintegrationsCents: reint, deductionsCents: ded, documentedResultCents: documentedResult, declaredCents: declaredBeforeDeficits,
    declaredBox: mapping ? (declaredBeforeDeficits !== null && declaredBeforeDeficits < 0 ? mapping.resultBeforeDeficitsDeficit : mapping.resultBeforeDeficitsProfit) : null, residualCents: bridgeKnown ? declaredBeforeDeficits! - documentedResult! : null };
  // Boxes the engine reads, as exported by the engine's own mappings (2058-A / 2033-B, 2058-B, 2065).
  const readBoxes = new Set<string>(computed && mapping ? [mapping.accountingProfit, mapping.accountingLoss, ...(mapping.reintegrationsTotal ? [mapping.reintegrationsTotal] : []), ...(mapping.deductionsTotal ? [mapping.deductionsTotal] : []), ...mapping.detailBoxes.map(b => b.code),
    mapping.resultBeforeDeficitsProfit, mapping.resultBeforeDeficitsDeficit, mapping.deficitsOffset, mapping.finalProfit, mapping.finalDeficit].map(c => mapping.formNumber + "|" + c)
    .concat(Object.values(DEFICIT_BOXES).map(c => DEFICIT_FOLLOW_UP_FORM + "|" + c), Object.values(DECLARATION_BOXES).map(c => DECLARATION_FORM + "|" + c)) : []);
  const declaration: CitResult["declaration"] = { status: !returns.length ? "absent" : returns.every(r => !r.published) ? "unpublished_vintage" : !computed ? "not_read" : "available",
    forms: returns.map(r => ({ formNumber: r.formNumber, importId: r.batch.id, documentVersionId: r.batch.document.id, fileName: r.batch.document.fileName, sha256: r.batch.document.byteHash, formVintage: r.formVintage, published: r.published })),
    lines: returns.flatMap(r => r.batch.rows.map(row => ({ formNumber: r.formNumber, code: row.original.fieldCode, label: row.original.label || "Case " + row.original.fieldCode, amountCents: row.normalized ? Number(row.normalized.amount.amount.replace(".", "")) : null,
      readByEngine: readBoxes.has(r.formNumber + "|" + row.original.fieldCode), rowId: row.id, importId: r.batch.id, locator: row.locator, processingStatus: row.original.processingStatus }))) };
  const computation: CitResult["computation"] = !computed ? null : { accountingResultCents: snapshot.accountingResultCents, reintegrationsConfirmedCents: snapshot.reintegrationsConfirmedCents, deductionsConfirmedCents: snapshot.deductionsConfirmedCents,
    reintegrationsProposedCents: snapshot.reintegrationsProposedCents, deductionsProposedCents: snapshot.deductionsProposedCents, taxResultBeforeDeficitsCents: snapshot.taxResultBeforeDeficitsCents,
    deficitOffsetCents: snapshot.deficits.appliedOffsetCents, deficitStatus: snapshot.deficits.status, taxableBaseCents: snapshot.taxableBaseCents, grossTaxCents: snapshot.grossTaxCents,
    steps: snapshot.waterfall.steps.map(s => ({ code: s.code, label: s.label, kind: s.kind, deltaCents: s.deltaCents, runningTotalCents: s.runningTotalCents, status: s.status })),
    brackets: snapshot.brackets.map(b => ({ code: b.code, label: b.label, rateBasisPoints: b.rateBasisPoints, baseCapCents: b.baseCapCents, allocatedBaseCents: b.allocatedBaseCents, taxCents: b.taxCents, applied: b.applied, eligibility: b.eligibility.status,
      conditions: b.eligibility.conditions.map(c => ({ code: c.code, label: c.label, status: c.status, observedValue: c.observedValue, expected: c.expected })), ruleVersionId: b.ruleVersionId, sourceRefs: b.sourceRefs.map(r => ({ sourceId: r.sourceId, sourceVersionId: r.sourceVersionId, locator: r.locator })) })) };
  const comparisons: CitResult["comparisons"] = reconciliationLines.map(l => ({ key: l.lineKey, label: l.label, leftCents: l.leftOperand?.amountCents ?? null, rightCents: l.rightOperand?.amountCents ?? null, rightBox: l.rightOperand?.fieldCode ?? null, differenceCents: l.differenceAmountCents, status: l.status }))
    .sort((a, b) => a.key < b.key ? -1 : 1);
  const rules = blockedRules("corporate_income_tax", snapshot.limitations, { start: w.period.startDate, end: w.period.endDate, fiscalYear, formVintage: w.formVintage, formNumber: mapping?.formNumber ?? null });
  const adjustments: CitResult["adjustments"] = w.adjustments.map(a => {
    const s = a.legalSource ? ruleSource(a.legalSource.sourceId, w.period.startDate, w.period.endDate) : null;
    return { id: a.id, label: a.label, category: a.category, direction: a.direction, amountCents: Number(a.amountCents), treatment: a.treatment, citation: a.citation, authorId: a.authorId, at: a.at,
      legalSource: a.legalSource && s ? { ...a.legalSource, title: s.title, url: s.url, coverage: s.coverage, lastVerifiedAt: s.lastVerifiedAt } : null, inEngine: a.treatment === "proposed_correction" && computed };
  });
  const exceptions: CitResult["exceptions"] = [];
  if (!computed) exceptions.push({ id: "ENGINE:BLOCKED", code: "ENGINE_BLOCKED", label: "Moteur IS bloqué", message: "Condition de périmètre, barème, millésime ou entrée obligatoire manquant : aucun impôt calculé. Voir les règles bloquées.", amount: na("Aucun calcul exécuté"), controlId: null });
  if (p.status !== "confirmed") exceptions.push({ id: "PROFILE", code: "PROFILE_UNCONFIRMED", label: "Profil IS non confirmé", message: "Régime, intégration, chiffre d’affaires, libération et détention du capital doivent être confirmés par une pièce citée.", amount: na("Profil"), controlId: null });
  if (!returns.length) exceptions.push({ id: "LIASSE", code: "LIASSE_ABSENT", label: "Liasse de l’exercice absente", message: "Sans 2058-A / 2033-B, le résultat comptable déclaré reste inconnu et l’impôt n’est pas calculé.", amount: na("Pièce requise"), controlId: null });
  if (framing.status === "difference") exceptions.push({ id: "FRAMING", code: "FRAMING_DIFFERENCE", label: "Résultat comptable non cadré", message: "Résultat des classes 6 et 7 du FEC ≠ résultat comptable déclaré.", amount: knownCents(framing.differenceCents!), controlId: null });
  if (bridge.status === "known" && bridge.residualCents !== 0) exceptions.push({ id: "BRIDGE", code: "BRIDGE_UNEXPLAINED", label: "Écart non expliqué du pont fiscal", message: "Résultat documenté (base " + (w.resultBasis === "after_tax" ? "après" : "avant") + " impôt + retraitements documentés) ≠ résultat fiscal avant déficits déclaré.", amount: knownCents(bridge.residualCents!), controlId: null });
  for (const c of comparisons.filter(c => c.status === "different")) exceptions.push({ id: "ENGINE:" + c.key, code: "ENGINE_DIFFERENCE", label: c.label, message: "Calcul du moteur ≠ valeur déclarée ou comptabilisée.", amount: knownCents(c.differenceCents!), controlId: c.key });
  for (const a of corrections) exceptions.push({ id: "CORRECTION:" + a.id, code: "PROPOSED_CORRECTION", label: "Correction proposée — " + a.label, message: "Retraitement absent de la déclaration, intégré au calcul du moteur avec sa source et sa pièce.", amount: knownCents(Number(a.amountCents) * (a.direction === "reintegration" ? 1 : -1)), controlId: null });
  for (const r of rules.filter(r => r.category === "source")) exceptions.push({ id: "SOURCE:" + r.code, code: "SOURCE_NOT_COVERED", label: r.label, message: r.requiredSource, amount: na("Source requise"), controlId: null });
  if (computed && snapshot.outcome === "missing_information") exceptions.push({ id: "MISSING", code: "MISSING_INFORMATION", label: "Information manquante pour le calcul", message: snapshot.limitations.map(l => l.message).join(" · ") || "Voir les limitations du moteur.", amount: na("Information manquante"), controlId: null });
  return frozen(citResultSchema.parse({
    schemaVersion: "fiscal-cit-result-1", tax: "cit", scope, runId, period: w.period, fiscalYear, formVintage: w.formVintage, resultBasis: w.resultBasis, accountingPeriod: { startDate: accountingPeriod.startDate, closingDate: accountingPeriod.closingDate },
    profile: { id: profile.id, contentHash: profile.contentHash, status: p.status, regime: p.regime, groupStatus: p.groupStatus, turnoverCents: p.turnoverCents, capitalPaid: p.capitalPaid, ownershipBasisPoints: p.ownershipBasisPoints, confirmedBy: p.confirmedBy, confirmedAt: p.confirmedAt, evidence: p.evidence },
    engine: { name: "computeCorporateTax", version: snapshot.engineVersion, calculationVersion: snapshot.calculationVersion, snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash, status: snapshot.status, outcome: snapshot.outcome, taxImpactStatus: snapshot.taxImpactStatus,
      rateScheduleId: snapshot.rateScheduleId, notes: snapshot.notes.map(n => ({ code: n.code, kind: n.kind, message: n.message })), limitations: snapshot.limitations.map(l => ({ code: l.code, message: l.message, scope: l.scope })) },
    method: CIT_METHOD_TEXT, limitations: CIT_LIMITATIONS, framing, bridge, adjustments, computation, comparisons, declaration, blockedRules: rules, otherTaxes: otherTaxCapabilities(), exceptions: exceptions.sort((a, b) => a.id < b.id ? -1 : 1),
  }));
}
