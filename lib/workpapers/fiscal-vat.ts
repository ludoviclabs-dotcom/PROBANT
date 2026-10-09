import type { TaxControlOutcome } from "@/lib/canonical-model";
import { money, type KnownAmount } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { createTaxPeriod, createTaxProfile } from "@/lib/tax/canonical";
import { creditToCarryCents, readVatDeclaration, vatFormMappingFor } from "@/lib/tax/vat/declaration";
import { reconcileVat } from "@/lib/tax/vat/engine";
import { DEFAULT_VAT_ACCOUNT_MAP } from "@/lib/tax/vat/ledger";
import type { VatRegime } from "@/lib/tax/vat/types";
import type { VatRole } from "./fiscal-labels";
import { blockedRules, otherTaxCapabilities, vatSources, type FiscalRuleSource } from "./fiscal-rules";
import { declarationSnapshot, fecEntries, invoicesOf, paymentsOf, previousVatKey, type FiscalDeclaration } from "./fiscal-sources";
import { periodMatchesFrequency, resolveCitation, type FiscalFrequency } from "./fiscal-work";
import { VAT_COMPARABLE_CONTROLS, VAT_LIMITATIONS, VAT_METHOD_TEXT, VAT_RATE_TEXT, vatDraftSchema, vatResultSchema, vatWorkSchema, type VatDraft, type VatExceptionCode, type VatResult, type VatWork } from "./fiscal-vat-contract";
import type { ImportBatch } from "./imports";
import { frozen, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export * from "./fiscal-vat-contract";
type Role = VatRole;
/**
 * VAT sheet (Mission 13, first sub-lot). The reconciliation is the TAX-06 engine `reconcileVat`: this module only
 * builds its canonical input from frozen, approved sources and presents its snapshot. The comparisons, the
 * explanatory bridge, the payments and the credit continuity are subtractions of engine outputs and declared boxes,
 * computed here on the server; no tax is liquidated and no rate is qualified as legal.
 */
export function initialVatWork(input: { period: { startDate: string; endDate: string }; frequency: FiscalFrequency; formVintage: number; actor: Principal; at: string }): VatWork {
  return frozen(vatWorkSchema.parse({ tax: "vat", schemaVersion: "fiscal-vat-1", period: input.period, frequency: input.frequency, formVintage: input.formVintage,
    profile: { vatRegime: "unknown", vatGroupStatus: "unknown", siren: null, status: "draft", confirmedBy: null, confirmedAt: null, evidence: null },
    explanations: [], accountMap: DEFAULT_VAT_ACCOUNT_MAP, configuredBy: input.actor.id, configuredAt: input.at }));
}
const returnKey = (p: { startDate: string; endDate: string }) => `fx_vat_return:${p.startDate}:${p.endDate}`;
/**
 * Server-only stamping. The declarative period is never changed here (it identifies the run); frequency and
 * vintage are checked against it and against the frozen return; the profile is confirmed only with a cited piece.
 */
export function stampVatWork(input: { scope: WorkpaperScope; runId: string; imports: ImportBatch[]; draft: VatDraft; actor: Principal; at: string; previous: VatWork }): VatWork {
  authorize(input.actor, input.scope, "prepare");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("FX_TIMESTAMP_INVALID");
  const draft = vatDraftSchema.parse(input.draft), previous = vatWorkSchema.parse(input.previous);
  if (!periodMatchesFrequency(previous.period, draft.frequency)) throw new Error("FX_PERIOD_FREQUENCY_INVALID");
  const ret = input.imports.find(b => b.document.logicalId === returnKey(previous.period));
  if (ret) { const d = declarationSnapshot(ret, { id: "check", version: "1" }, true); if (d.formVintage !== draft.formVintage) throw new Error("FX_VINTAGE_MISMATCH"); }
  const evidence = draft.profile.evidence ? resolveCitation(input.imports, draft.profile.evidence) : null;
  const confirmed = !!evidence && draft.profile.vatRegime !== "unknown";
  const sameProfile = previous.profile.status === "confirmed" && previous.profile.vatRegime === draft.profile.vatRegime && previous.profile.vatGroupStatus === draft.profile.vatGroupStatus
    && previous.profile.siren === draft.profile.siren && stableSha256(previous.profile.evidence) === stableSha256(evidence);
  const profile = { vatRegime: draft.profile.vatRegime, vatGroupStatus: draft.profile.vatGroupStatus, siren: draft.profile.siren, status: confirmed ? "confirmed" as const : "draft" as const,
    confirmedBy: confirmed ? (sameProfile ? previous.profile.confirmedBy : input.actor.id) : null, confirmedAt: confirmed ? (sameProfile ? previous.profile.confirmedAt : input.at) : null, evidence };
  const explanations = draft.explanations.map(e => {
    const cited = { id: e.id, label: e.label, kind: e.kind, amountCents: e.amountCents, citation: resolveCitation(input.imports, e.citation) };
    // An explanation unchanged since the previous version keeps its author and date.
    const old = previous.explanations.find(p => p.id === e.id);
    if (old) { const { authorId, at, ...prior } = old; if (stableSha256(prior) === stableSha256(cited)) return { ...cited, authorId, at }; }
    return { ...cited, authorId: input.actor.id, at: input.at };
  }).sort((a, b) => a.id < b.id ? -1 : 1);
  return frozen(vatWorkSchema.parse({ ...previous, frequency: draft.frequency, formVintage: draft.formVintage, profile, explanations, configuredBy: input.actor.id, configuredAt: input.at }));
}

const knownCents = (v: number): KnownAmount => ({ kind: "known", value: money(BigInt(v)) });
const na = (reason: string): KnownAmount => ({ kind: "not_applicable", reason });
const DIFFERENCE_OUTCOMES: Partial<Record<TaxControlOutcome, VatExceptionCode>> = { reconciliation_difference: "ENGINE_DIFFERENCE", potential_tax_risk: "ENGINE_RISK", review_recommendation: "ENGINE_RECOMMENDATION" };

export interface VatEngineFacts { fec: ImportBatch; current: FiscalDeclaration | null; previous: FiscalDeclaration | null; invoices: ImportBatch | null; payments: ImportBatch | null }
/** The frozen sources a VAT run reads: the FEC, its own return, the previous return and the optional inventories. */
export function vatFacts(imports: ImportBatch[], work: VatWork, taxPeriod: { id: string; version: string }): VatEngineFacts {
  const fec = imports.find(b => b.document.documentType === "fx_fec");
  if (!fec) throw new Error("FX_FEC_REQUIRED");
  const ret = imports.find(b => b.document.logicalId === returnKey(work.period));
  const prevKey = previousVatKey(imports.map(b => ({ document_type: b.document.logicalId })), work.period.startDate);
  const prev = prevKey ? imports.find(b => b.document.logicalId === `fx_vat_return:${prevKey.start}:${prevKey.end}`) ?? null : null;
  return { fec, current: ret ? declarationSnapshot(ret, taxPeriod, true) : null, previous: prev ? declarationSnapshot(prev, { id: "fxperiod:previous", version: "1" }, true) : null,
    invoices: imports.find(b => b.document.documentType === "fx_invoices") ?? null, payments: imports.find(b => b.document.documentType === "fx_vat_payments") ?? null };
}

/** Deterministic evaluation from frozen inputs: canonical profile and period, one engine call, server-side presentation. */
export function evaluateVat(scope: WorkpaperScope, accountingPeriod: AccountingPeriod, imports: ImportBatch[], runId: string, work: VatWork): VatResult {
  const w = vatWorkSchema.parse(work), owned = { organizationId: scope.organizationId, dossierId: scope.dossierId, entityId: scope.dossierId };
  const profile = createTaxProfile({ ...owned, id: `fxprofile:${runId}`, version: stableSha256(w.profile).slice(0, 16), jurisdiction: "FR", status: w.profile.status, corporateIncomeTaxRegime: "unknown",
    vatRegime: w.profile.vatRegime, accountingPeriod: { startDate: accountingPeriod.startDate, endDate: accountingPeriod.closingDate }, corporateIncomeTaxGroupStatus: "unknown", vatGroupStatus: w.profile.vatGroupStatus,
    turnoverAmountCents: null, capitalPaidStatus: "unknown", ownershipStatus: "unknown", qualifyingIndividualOwnershipBasisPoints: null, vatLiabilityRatioStatus: "unknown", vatLiabilityRatioBasisPoints: null,
    establishments: [], parameters: [], confirmedBy: w.profile.confirmedBy, confirmedAt: w.profile.confirmedAt, createdAt: w.configuredAt });
  const period = createTaxPeriod({ ...owned, id: `fxperiod:${runId}`, taxType: "vat", startDate: w.period.startDate, endDate: w.period.endDate, fiscalYear: Number(w.period.endDate.slice(0, 4)), formVintage: w.formVintage,
    frequency: w.frequency, accountingPeriodId: scope.periodId, status: "unknown", version: "1", sourceRefs: [], createdAt: w.configuredAt });
  const facts = vatFacts(imports, w, period);
  const allLines = fecEntries(facts.fec), toIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const inPeriod = allLines.filter(e => { const d = toIso(e.ecritureDate); return d >= w.period.startDate && d <= w.period.endDate; });
  const invoices = facts.invoices ? invoicesOf(facts.invoices) : null;
  const usable = facts.current && facts.current.published && facts.current.formVintage === w.formVintage;
  const { snapshot } = reconcileVat({ ...owned, executionId: runId, snapshotId: `fxvat:${runId}`, profile, period, fecEntries: inPeriod, documentSnapshots: usable ? [facts.current!.snapshot] : [],
    availableInvoiceRefs: invoices ? invoices.map(i => i.ref) : undefined, accountMap: w.accountMap, createdAt: w.configuredAt, createdBy: w.configuredBy });
  const regime: VatRegime | null = ["real_normal", "mini_real", "real_simplified"].includes(w.profile.vatRegime) ? w.profile.vatRegime as VatRegime : null;
  const mapping = regime ? vatFormMappingFor(regime) : null;
  const roles = new Map<string, Role>(mapping ? ([[mapping.grossVat, "gross"], [mapping.deductibleVat, "deductible"], [mapping.netDue, "net_due"], [mapping.credit, "credit"], [mapping.creditReceived, "credit_received"],
    [mapping.creditToCarry, "credit_to_carry"], ...(mapping.normalRateBase ? [[mapping.normalRateBase, "normal_rate_base"]] : [])] as [string, Role][]) : []);
  const candidates = snapshot.transactionCandidates;
  const byDirection = (d: "collected" | "deductible") => candidates.filter(c => c.direction === d).map(c => c.id);
  const candidateIdsFor = (role: Role | null) => role === "gross" || role === "normal_rate_base" ? byDirection("collected") : role === "deductible" ? byDirection("deductible") : role === "net_due" || role === "credit" ? candidates.map(c => c.id) : [];
  const read = new Set(snapshot.declaration.boxes.map(b => b.code));
  const declaration: VatResult["declaration"] = facts.current ? {
    // A blocked engine reads nothing: a present return is « not read », never « absent ».
    status: !facts.current.published ? "unpublished_vintage" : snapshot.status === "blocked" ? "not_read" : snapshot.declaration.status, importId: facts.current.batch.id, documentVersionId: facts.current.batch.document.id, fileName: facts.current.batch.document.fileName,
    sha256: facts.current.batch.document.byteHash, formNumber: facts.current.formNumber, formVintage: facts.current.formVintage,
    lines: facts.current.batch.rows.map(r => {
      const code = r.original.fieldCode, role = roles.get(code) ?? null, box = snapshot.declaration.boxes.find(b => b.code === code);
      return { code, label: r.original.label || `Case ${code}`, amountCents: box ? box.amountCents : r.normalized ? Number(r.normalized.amount.amount.replace(".", "")) : null, readByEngine: read.has(code), role, rowId: r.id, locator: r.locator,
        candidateIds: candidateIdsFor(role), processingStatus: r.original.processingStatus, warnings: r.original.warnings ? r.original.warnings.split(",").filter(Boolean) : [] };
    }), issues: snapshot.declaration.issues.map(i => ({ fieldCode: i.fieldCode, status: i.status, reason: i.reason, detail: i.detail })) }
    : { status: "absent", importId: null, documentVersionId: null, fileName: null, sha256: null, formNumber: mapping?.formNumber ?? null, formVintage: w.formVintage, lines: [], issues: [] };
  const control = (cid: string) => snapshot.controls.find(c => c.controlId === cid);
  const credit = control("VAT.CREDIT");
  // A blocked snapshot carries technical zeros: nothing was computed, so every accounted amount is shown as unknown.
  const computed = snapshot.status === "reconciled";
  const comparison: VatResult["comparison"] = [
    ...snapshot.datasets.comparison.rows.map(c => computed ? c : { ...c, theoreticalCents: null, accountedCents: null, declaredCents: null }).map(c => ({ key: c.key as "collected" | "deductible" | "net", label: c.key === "collected" ? "TVA collectée" : c.key === "deductible" ? "TVA déductible" : "TVA nette", theoreticalCents: c.theoreticalCents, accountedCents: c.accountedCents, declaredCents: c.declaredCents,
      differenceCents: c.accountedCents !== null && c.declaredCents !== null ? c.accountedCents - c.declaredCents : null, declaredBox: mapping ? (c.key === "collected" ? mapping.grossVat : c.key === "deductible" ? mapping.deductibleVat : mapping.netDue) : null })),
    { key: "credit", label: "Crédit de TVA", theoreticalCents: null, accountedCents: snapshot.status === "reconciled" ? credit?.observedCents ?? null : null, declaredCents: snapshot.declaration.creditCents,
      differenceCents: snapshot.status === "reconciled" && credit?.observedCents != null && snapshot.declaration.creditCents !== null ? credit.observedCents - snapshot.declaration.creditCents : null, declaredBox: mapping?.credit ?? null },
  ];
  const items = w.explanations.map(e => ({ id: e.id, label: e.label, kind: e.kind, amountCents: Number(e.amountCents), citation: e.citation, authorId: e.authorId, at: e.at }));
  const startCents = computed ? snapshot.netAccountedCents : null, explainedCents = startCents === null ? null : startCents + items.reduce((s, i) => s + i.amountCents, 0), declaredNet = computed ? snapshot.netDeclaredCents : null;
  const bridgeKnown = declaredNet !== null && explainedCents !== null;
  const bridge: VatResult["bridge"] = { status: bridgeKnown ? "known" : "unknown",
    reason: !computed ? "Moteur bloqué : aucun montant comptabilisé ni déclaré n’est calculé." : declaredNet === null ? "Déclaration absente ou non lue : le pont s’arrête au net comptabilisé, sans valeur déclarée réputée nulle." : null,
    startCents, items, explainedCents, declaredCents: declaredNet, residualCents: bridgeKnown ? declaredNet - explainedCents : null, declaredBox: mapping?.netDue ?? null };
  const paymentRows = facts.payments ? paymentsOf(facts.payments).filter(p => p.periodStart === w.period.startDate && p.periodEnd === w.period.endDate) : [];
  const paid = paymentRows.reduce((s, p) => s + Number(p.amountCents), 0);
  const payments: VatResult["payments"] = !facts.payments ? { status: "not_provided", reason: "Paiements au Trésor non fournis : source requise.", declaredDueCents: declaredNet, paidCents: null, differenceCents: null, items: [] }
    : declaredNet === null ? { status: "unknown", reason: "TVA nette due non lue : la comparaison avec les paiements n’est pas calculée.", declaredDueCents: null, paidCents: paid, differenceCents: null, items: paymentRows.map(p => ({ importId: p.importId, rowId: p.rowId, documentVersionId: p.documentVersionId, fileName: p.fileName, locator: p.locator, ref: p.ref, date: p.date, amountCents: Number(p.amountCents), label: p.label })) }
    : { status: "known", reason: null, declaredDueCents: declaredNet, paidCents: paid, differenceCents: paid - declaredNet, items: paymentRows.map(p => ({ importId: p.importId, rowId: p.rowId, documentVersionId: p.documentVersionId, fileName: p.fileName, locator: p.locator, ref: p.ref, date: p.date, amountCents: Number(p.amountCents), label: p.label })) };
  if (payments.status === "unknown") payments.paidCents = null;
  // Credit continuity: credit to carry of the previous return against the credit received on this one (same regime boxes).
  let creditView: VatResult["credit"];
  if (!mapping) creditView = { status: "unknown", reason: "Régime TVA non confirmé : cases de report inconnues.", previous: null, currentBox: null, currentReceivedCents: null, differenceCents: null };
  else if (!facts.previous) creditView = { status: "not_provided", reason: "Déclaration de la période précédente non fournie : continuité du crédit non vérifiée.", previous: null, currentBox: mapping.creditReceived, currentReceivedCents: snapshot.declaration.creditCarriedForwardCents, differenceCents: null };
  else {
    const prevRead = facts.previous.published ? readVatDeclaration({ ...owned, vatPeriodId: "previous", regime: regime!, formVintage: facts.previous.formVintage, snapshots: [facts.previous.snapshot], snapshotId: `fxvat:${runId}:previous` }) : null;
    const toCarry = prevRead ? creditToCarryCents(prevRead, regime!) : null, received = snapshot.declaration.creditCarriedForwardCents;
    const previous = { importId: facts.previous.batch.id, documentVersionId: facts.previous.batch.document.id, fileName: facts.previous.batch.document.fileName, periodStart: facts.previous.periodStart, periodEnd: facts.previous.periodEnd, box: mapping.creditToCarry, creditToCarryCents: toCarry };
    const both = toCarry !== null && received !== null && snapshot.declaration.status === "available";
    creditView = { status: both ? "known" : "unknown", reason: both ? null : "Report reçu ou crédit à reporter non lu : aucun montant réputé nul.", previous, currentBox: mapping.creditReceived, currentReceivedCents: received, differenceCents: both ? received! - toCarry! : null };
  }
  const fecRows = new Map<string, string[]>();
  for (const r of facts.fec.rows) fecRows.set(r.normalized!.key, [...(fecRows.get(r.normalized!.key) ?? []), r.id]);
  const entries: VatResult["entries"] = candidates.map(c => {
    const inv = invoices && c.pieceRef ? invoices.find(i => i.ref === c.pieceRef) : undefined;
    const p: VatResult["entries"][number]["piece"] = !invoices ? { status: "not_provided" } : inv ? { status: "found", importId: inv.importId, rowId: inv.rowId, documentVersionId: inv.documentVersionId, fileName: inv.fileName, locator: inv.locator,
      ref: inv.ref, date: inv.date, vatCents: Number(inv.vatCents), baseCents: inv.baseCents === null ? null : Number(inv.baseCents), label: inv.label } : { status: "missing", ref: c.pieceRef };
    const key = `${c.journalCode}:${c.ecritureNum}`;
    return { id: c.id, itemId: "E:" + key, direction: c.direction, journalCode: c.journalCode, ecritureNum: c.ecritureNum, date: c.ecritureDate, pieceRef: c.pieceRef, pieceDate: c.pieceDate, baseCents: c.baseAmountCents, vatCents: c.vatAmountCents,
      observedRateBasisPoints: c.observedRateBasisPoints, signals: [...c.signals], baseAccounts: [...c.baseAccounts], vatAccounts: [...c.vatAccounts], creditNote: (c.vatAmountCents ?? 0) < 0, rowIds: fecRows.get(key) ?? [], lines: [...c.sourceLineNumbers], piece: p };
  });
  const rates: VatResult["rates"] = snapshot.rateBuckets.map(b => {
    const used = candidates.filter(c => b.transactionIds.includes(c.id)), accounts = [...new Set(used.flatMap(c => [...c.baseAccounts, ...c.vatAccounts]))].sort();
    return { key: b.key, direction: b.direction, rateBasisPoints: b.rateBasisPoints, label: b.label, status: b.status, baseCents: b.baseAmountCents, vatAccountedCents: b.vatAccountedCents, vatTheoreticalCents: b.vatTheoreticalCents, differenceCents: b.differenceCents,
      shareOfBaseBasisPoints: b.shareOfBaseBasisPoints, entryIds: [...b.transactionIds], accounts,
      origin: b.rateBasisPoints === null ? `Taux non dérivable : base ou TVA absente sur ${b.transactionCount} écriture(s).` : `Taux constaté sur ${b.transactionCount} écriture(s) : TVA ${accounts.filter(a => a.startsWith("445")).join(", ") || "—"} ÷ base ${accounts.filter(a => !a.startsWith("445")).join(", ") || "—"}. Constat du dossier, non approuvé comme taux légal.` };
  });
  const controls: VatResult["controls"] = snapshot.controls.map(c => ({ controlId: c.controlId, title: c.title, outcome: c.outcome, evidenceTier: c.evidenceTier, detail: c.detail, observedCents: c.observedCents, comparedCents: c.comparedCents, differenceCents: c.differenceCents, comparable: (VAT_COMPARABLE_CONTROLS as readonly string[]).includes(c.controlId), limitationIds: [...c.limitationIds] }));
  const rules = blockedRules("vat", snapshot.limitations, { start: w.period.startDate, end: w.period.endDate, formNumber: mapping?.formNumber ?? null, formVintage: w.formVintage });
  const exceptions: VatResult["exceptions"] = [];
  if (snapshot.status === "blocked") exceptions.push({ id: "ENGINE:BLOCKED", code: "ENGINE_BLOCKED", label: "Moteur TVA bloqué", message: "Condition de périmètre ou entrée obligatoire manquante : aucun contrôle exécuté. Voir les règles bloquées.", amount: na("Aucun calcul exécuté"), controlId: null });
  if (w.profile.status !== "confirmed") exceptions.push({ id: "PROFILE", code: "PROFILE_UNCONFIRMED", label: "Profil TVA non confirmé", message: "Régime, groupe et SIREN doivent être confirmés par une pièce citée.", amount: na("Profil"), controlId: null });
  if (snapshot.status === "reconciled") {
    if (snapshot.evidenceTier === "ledger_only") exceptions.push({ id: "LEDGER_ONLY", code: "LEDGER_ONLY", label: "FEC seul", message: "Sans déclaration exploitable, les montants sont des signaux reconstruits depuis les écritures, pas une réconciliation.", amount: na("Aucune valeur déclarée"), controlId: null });
    for (const c of snapshot.controls) {
      const code = DIFFERENCE_OUTCOMES[c.outcome];
      if (code) exceptions.push({ id: "ENGINE:" + c.controlId, code, label: `${c.controlId} — ${c.title}`, message: c.detail, amount: c.differenceCents !== null ? knownCents(c.differenceCents) : na("Signal sans montant"), controlId: c.controlId });
      else if (c.outcome === "missing_information" && !(c.controlId === "VAT.DECLARED" && snapshot.evidenceTier === "ledger_only")) exceptions.push({ id: "MISSING:" + c.controlId, code: "MISSING_INFORMATION", label: `${c.controlId} — information manquante`, message: c.detail, amount: na("Information manquante"), controlId: c.controlId });
    }
  }
  for (const r of rules.filter(r => r.code === "VAT_SOURCE_NOT_COVERED" || r.code === "UNSUPPORTED_VAT_FORM_VINTAGE")) exceptions.push({ id: "SOURCE:" + r.code, code: "SOURCE_NOT_COVERED", label: r.label, message: r.requiredSource, amount: na("Source requise"), controlId: null });
  if (bridge.status === "known" && bridge.residualCents !== 0) exceptions.push({ id: "BRIDGE", code: "BRIDGE_UNEXPLAINED", label: "Écart non expliqué du pont", message: "Net comptabilisé + explications citées ≠ net déclaré.", amount: knownCents(bridge.residualCents!), controlId: null });
  if (payments.status === "known" && payments.differenceCents !== 0) exceptions.push({ id: "PAYMENT", code: "PAYMENT_DIFFERENCE", label: "Paiement différent du net déclaré", message: "Paiements rattachés à la période ≠ TVA nette due déclarée.", amount: knownCents(payments.differenceCents!), controlId: null });
  if (creditView.status === "known" && creditView.differenceCents !== 0) exceptions.push({ id: "CREDIT", code: "CREDIT_CONTINUITY_DIFFERENCE", label: "Report de crédit discontinu", message: "Crédit reçu sur cette déclaration ≠ crédit à reporter de la précédente.", amount: knownCents(creditView.differenceCents!), controlId: null });
  const cov = snapshot.period.normativeCoverage;
  return frozen(vatResultSchema.parse({
    schemaVersion: "fiscal-vat-result-1", tax: "vat", scope, runId, period: w.period, frequency: w.frequency, formVintage: w.formVintage, accountingPeriod: { startDate: accountingPeriod.startDate, closingDate: accountingPeriod.closingDate },
    profile: { id: profile.id, contentHash: profile.contentHash, status: w.profile.status, vatRegime: w.profile.vatRegime, vatGroupStatus: w.profile.vatGroupStatus, siren: w.profile.siren, confirmedBy: w.profile.confirmedBy, confirmedAt: w.profile.confirmedAt, evidence: w.profile.evidence },
    engine: { name: "reconcileVat", version: snapshot.engineVersion, calculationVersion: snapshot.calculationVersion, snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash, status: snapshot.status, outcome: snapshot.outcome, evidenceTier: snapshot.evidenceTier, evidenceStrength: snapshot.evidenceStrength,
      expectedForm: snapshot.status === "reconciled" ? snapshot.period.expectedFormNumber : mapping?.formNumber ?? null, coverage: { status: cov.status, coveredThroughDate: cov.coveredThroughDate, uncoveredFromDate: cov.uncoveredFromDate },
      notes: snapshot.notes.map(n => ({ code: n.code, kind: n.kind, message: n.message })), limitations: snapshot.limitations.map(l => ({ code: l.code, message: l.message, scope: l.scope })) },
    method: VAT_METHOD_TEXT, rateMeaning: VAT_RATE_TEXT, limitations: VAT_LIMITATIONS,
    sources: { fecLines: allLines.length, fecLinesInPeriod: inPeriod.length, invoicesProvided: !!facts.invoices, paymentsProvided: !!facts.payments, previousReturnProvided: !!facts.previous },
    declaration, comparison, bridge, payments, credit: creditView, rates, entries, controls, blockedRules: rules, periodSources: vatSources(w.period.startDate, w.period.endDate) satisfies FiscalRuleSource[],
    otherTaxes: otherTaxCapabilities(), exceptions: exceptions.sort((a, b) => a.id < b.id ? -1 : 1),
  }));
}
