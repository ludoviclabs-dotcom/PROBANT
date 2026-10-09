import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import { previewDeclaration, previewFec, type FiscalTabularType } from "../fiscal-sources";
import { evaluateVat, initialVatWork, stampVatWork, vatOutcome, type VatDraft, type VatResult } from "../fiscal-vat";
import { CA3_T1, CA3_T2, CA3_T3, ca3Text, fecText, FEC_LINES, FX_CSV, FX_SIREN, fxMapping, fxPeriod, fxPreparer, fxScope, SEPT, T1, T2, T3 } from "./fiscal-fixtures";

const AT = "2027-02-01T10:00:00.000Z";
const approve = (b: ImportBatch): ImportBatch => {
  if (b.report.blocking.length) throw new Error("Aperçu bloqué : " + b.report.blocking.join(" | "));
  return { ...b, approval: { actorId: fxPreparer.id, at: AT, previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } };
};
const file = (text: string, name: string) => new File([text], name, { type: "text/csv" });
const fec = async (text = fecText()) => approve(await previewFec(file(text, "fec.txt"), fxScope, fxPeriod, fxPreparer));
const ret = async (period: { startDate: string; endDate: string }, boxes: Record<string, string>, options: Parameters<typeof ca3Text>[2] = {}) =>
  approve(await previewDeclaration(file(ca3Text(period, boxes, options), "ca3.csv"), fxScope, fxPeriod, { documentType: "declaration_tva_ca3", expectedSiren: FX_SIREN }, fxPreparer));
const tab = async (type: FiscalTabularType) => approve(await previewImport(file(FX_CSV[type], type + ".csv"), fxScope, fxMapping(type), fxPreparer, type, "tva.reconciliation"));
const rowOf = (b: ImportBatch, code: string) => b.rows.find(r => r.original.fieldCode === code || r.normalized?.key === code)!;

async function run(period: { startDate: string; endDate: string }, imports: ImportBatch[], draft: Partial<VatDraft> = {}, frequency: "monthly" | "quarterly" = "quarterly"): Promise<VatResult> {
  const work = initialVatWork({ period, frequency, formVintage: 2026, actor: fxPreparer, at: AT });
  const support = imports.find(b => b.document.documentType === "fx_support");
  const stamped = stampVatWork({ scope: fxScope, runId: "run-test", imports, actor: fxPreparer, at: AT, previous: work, draft: {
    frequency, formVintage: 2026, explanations: [],
    profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: FX_SIREN, evidence: support ? { documentId: support.document.id, rowId: rowOf(support, "ATT-REGIME").id } : null }, ...draft } });
  return evaluateVat(fxScope, fxPeriod, imports, "run-test", stamped);
}
const comparison = (r: VatResult, key: string) => r.comparison.find(c => c.key === key)!;

describe("TVA — cas de référence T2 2026 (montants calculés indépendamment du moteur)", () => {
  it("FEC + CA3 + pièces + paiements + déclaration précédente : comparaison, pont, paiement et continuité du crédit", async () => {
    const t1 = await ret(T1, CA3_T1), t2 = await ret(T2, CA3_T2), support = await tab("fx_support");
    const imports = [await fec(), t1, t2, await tab("fx_invoices"), await tab("fx_vat_payments"), support];
    const r = await run(T2, imports, { explanations: [{ id: "CREDIT-T1", label: "Crédit du T1 reporté en case 22", kind: "credit_carried", amountCents: "-10000", citation: { documentId: t2.document.id, rowId: rowOf(t2, "22").id } }] });
    // Hand computation from the fixture: collected 200 + 50 − 20 = 230 ; deductible 80 + 30 = 110 ; net 120.
    expect(comparison(r, "collected")).toMatchObject({ accountedCents: 23000, declaredCents: 23000, differenceCents: 0 });
    expect(comparison(r, "deductible")).toMatchObject({ accountedCents: 11000, declaredCents: 21000, differenceCents: -10000 });
    expect(comparison(r, "net")).toMatchObject({ accountedCents: 12000, declaredCents: 2000, differenceCents: 10000 });
    expect(r.bridge).toMatchObject({ status: "known", startCents: 12000, explainedCents: 2000, declaredCents: 2000, residualCents: 0 });
    expect(r.payments).toMatchObject({ status: "known", declaredDueCents: 2000, paidCents: 2000, differenceCents: 0 });
    expect(r.credit).toMatchObject({ status: "known", previous: { box: "27", creditToCarryCents: 10000 }, currentBox: "22", currentReceivedCents: 10000, differenceCents: 0 });
    expect(r.engine).toMatchObject({ name: "reconcileVat", status: "reconciled", evidenceTier: "ledger_declaration_and_invoice", coverage: { status: "covered" } });
    expect(r.sources).toMatchObject({ fecLinesInPeriod: 17, invoicesProvided: true, paymentsProvided: true, previousReturnProvided: true });
    // The engine reports the net difference; the human bridge explains it with a cited piece but does not erase it.
    expect(r.exceptions.map(e => e.id)).toEqual(["ENGINE:VAT.NET"]);
    expect(vatOutcome(r)).toBe("exceptions_detected");
  });
  it("contrôles du moteur : un écart n’est présenté que pour deux grandeurs de même nature", async () => {
    const r = await run(T2, [await fec(), await ret(T2, CA3_T2), await tab("fx_invoices")]);
    const c = (id: string) => r.controls.find(x => x.controlId === id)!;
    expect(c("VAT.NET")).toMatchObject({ comparable: true, observedCents: 12000, comparedCents: 2000, differenceCents: 10000 });
    // Gross vs deductible (VAT.DECLARED) or collected vs deductible balances are read side by side, never subtracted for the reviewer.
    expect(c("VAT.DECLARED").comparable).toBe(false);
    expect(c("VAT.ACCOUNT.ABNORMAL_BALANCE").comparable).toBe(false);
    expect(c("VAT.CREDIT.CARRYFORWARD").comparable).toBe(false);
  });
  it("taux constatés : origine affichée, jamais présentés comme taux légaux ; avoir conservé en négatif", async () => {
    const r = await run(T2, [await fec(), await ret(T2, CA3_T2), await tab("fx_invoices")]);
    const collected = r.rates.filter(x => x.direction === "collected").map(x => [x.rateBasisPoints, x.baseCents, x.vatAccountedCents, x.status]);
    expect(collected).toEqual([[1000, 50000, 5000, "secondary"], [2000, 90000, 18000, "dominant"]]);
    expect(r.rates.every(x => /non approuvé comme taux légal|non dérivable/.test(x.origin))).toBe(true);
    expect(r.rateMeaning).toMatch(/jamais présenté comme un taux légal/);
    expect(r.blockedRules.find(b => b.code === "VAT_RATE_SCHEDULE_NOT_PUBLISHED")).toBeTruthy();
    const avoir = r.entries.find(e => e.pieceRef === "AV-2003")!;
    expect(avoir).toMatchObject({ direction: "collected", baseCents: -10000, vatCents: -2000, creditNote: true, piece: { status: "found", ref: "AV-2003" } });
  });
  it("ligne de déclaration → écritures → pièce : la case 16 ouvre les écritures collectées, chacune sa pièce et ses lignes FEC", async () => {
    const r = await run(T2, [await fec(), await ret(T2, CA3_T2), await tab("fx_invoices")]);
    const box16 = r.declaration.lines.find(l => l.code === "16")!;
    expect(box16).toMatchObject({ role: "gross", readByEngine: true, amountCents: 23000, locator: { page: 1, zone: "case-16" } });
    const entries = r.entries.filter(e => box16.candidateIds.includes(e.id));
    expect(entries.map(e => e.pieceRef).sort()).toEqual(["AV-2003", "F-2001", "F-2002"]);
    expect(entries.every(e => e.rowIds.length === 3 && e.piece.status === "found")).toBe(true);
  });
});

describe("TVA — recette des cas limites", () => {
  it("FEC seul : signal sans réconciliation, déclaration absente jamais lue comme zéro", async () => {
    const r = await run(T2, [await fec()]);
    expect(r.engine.evidenceTier).toBe("ledger_only");
    expect(r.declaration.status).toBe("absent");
    expect(comparison(r, "net")).toMatchObject({ accountedCents: 12000, declaredCents: null, differenceCents: null });
    expect(r.bridge).toMatchObject({ status: "unknown", declaredCents: null, residualCents: null });
    expect(r.payments.status).toBe("not_provided");
    expect(r.exceptions.map(e => e.code)).toContain("LEDGER_ONLY");
    expect(vatOutcome(r)).toBe("inconclusive");
  });
  it("profil inconnu : moteur bloqué, montants inconnus (jamais 0), règle « profil » listée", async () => {
    const r = await run(T2, [await fec(), await ret(T2, CA3_T2)], { profile: { vatRegime: "unknown", vatGroupStatus: "unknown", siren: null, evidence: null } });
    expect(r.engine.status).toBe("blocked");
    // The return exists but a blocked engine reads nothing: « not read », never « absent ».
    expect(r.declaration.status).toBe("not_read");
    expect(r.comparison.every(c => c.accountedCents === null && c.declaredCents === null)).toBe(true);
    expect(r.bridge).toMatchObject({ status: "unknown", startCents: null, explainedCents: null });
    expect(r.blockedRules.filter(b => b.category === "profile").map(b => b.code).sort()).toEqual(["UNSUPPORTED_VAT_REGIME", "VAT_GROUP_OUT_OF_SCOPE"]);
    expect(r.exceptions.map(e => e.code)).toEqual(expect.arrayContaining(["ENGINE_BLOCKED", "PROFILE_UNCONFIRMED"]));
    expect(vatOutcome(r)).toBe("inconclusive");
  });
  it("source expirée : T3 2026 partiellement couvert, contrôles dépendants bloqués avec la source requise", async () => {
    const r = await run(T3, [await fec(), await ret(T3, CA3_T3), await tab("fx_invoices")]);
    expect(r.engine.coverage).toMatchObject({ status: "partially_covered", coveredThroughDate: "2026-08-31", uncoveredFromDate: "2026-09-01" });
    const rule = r.blockedRules.find(b => b.code === "VAT_SOURCE_NOT_COVERED")!;
    expect(rule.controls).toEqual(["VAT.ENTRY.NO_REFERENCE", "VAT.PERIOD.SHIFT", "VAT.PIECE.MISSING"]);
    const art269 = rule.sources.find(s => s.sourceId === "cgi-art-269")!;
    expect(art269).toMatchObject({ coverage: "partially_covered", uncoveredFromDate: "2026-09-01", url: expect.stringContaining("legifrance.gouv.fr") });
    expect(art269.versions.find(v => v.effectiveTo === "2026-08-31")).toBeTruthy();
    expect(rule.requiredSource).toMatch(/à compter du 01\/09\/2026 non publiée dans le registre/);
    expect(r.exceptions.map(e => e.code)).toContain("SOURCE_NOT_COVERED");
  });
  it("période non couverte : septembre 2026 mensuel, aucune version voisine substituée", async () => {
    const r = await run(SEPT, [await fec()], {}, "monthly");
    expect(r.engine.coverage?.status).toBe("not_covered");
    const rule = r.blockedRules.find(b => b.code === "VAT_SOURCE_NOT_COVERED")!;
    expect(rule.sources.find(s => s.sourceId === "cgi-art-289")).toMatchObject({ coverage: "not_covered" });
    expect(rule.requiredSource).toMatch(/version applicable à la période non publiée/);
  });
  it("millésime non publié : CA3 2027 conservée comme pièce, moteur bloqué, millésimes publiés cités", async () => {
    const t2 = await previewDeclaration(file(ca3Text(T2, CA3_T2, { vintage: 2027 }), "ca3-2027.csv"), fxScope, fxPeriod, { documentType: "declaration_tva_ca3" }, fxPreparer);
    expect(t2.report.blocking).toEqual([]);
    expect(t2.report.warnings[0]).toMatch(/FX_FORM_VINTAGE_NOT_PUBLISHED:3310-CA3-SD 2027/);
    const work = initialVatWork({ period: T2, frequency: "quarterly", formVintage: 2027, actor: fxPreparer, at: AT });
    const imports = [await fec(), approve(t2)];
    expect(() => stampVatWork({ scope: fxScope, runId: "r", imports, actor: fxPreparer, at: AT, previous: work, draft: { frequency: "quarterly", formVintage: 2026, explanations: [], profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: null, evidence: null } } })).toThrow("FX_VINTAGE_MISMATCH");
    const stamped = stampVatWork({ scope: fxScope, runId: "r", imports, actor: fxPreparer, at: AT, previous: work, draft: { frequency: "quarterly", formVintage: 2027, explanations: [], profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: null, evidence: null } } });
    const r = evaluateVat(fxScope, fxPeriod, imports, "r", stamped);
    expect(r.engine.status).toBe("blocked");
    expect(r.declaration.status).toBe("unpublished_vintage");
    expect(r.blockedRules.find(b => b.code === "UNSUPPORTED_VAT_FORM_VINTAGE")?.forms[0]).toMatchObject({ formNumber: "3310-CA3-SD", vintage: 2027, published: false, publishedVintages: [2026] });
  });
  it("crédit reporté discontinu : case 22 du T2 ≠ case 27 du T1", async () => {
    const r = await run(T2, [await fec(), await ret(T1, { ...CA3_T1, "27": "90,00" }), await ret(T2, CA3_T2)]);
    expect(r.credit).toMatchObject({ status: "known", previous: { creditToCarryCents: 9000 }, currentReceivedCents: 10000, differenceCents: 1000 });
    expect(r.exceptions.find(e => e.code === "CREDIT_CONTINUITY_DIFFERENCE")?.amount).toEqual({ kind: "known", value: { amount: "10.00", currency: "EUR" } });
  });
  it("pièce manquante dans l’inventaire : risque potentiel, jamais « facture absente du dossier »", async () => {
    const invoices = await previewImport(file(FX_CSV.fx_invoices.split("\n").filter(l => !l.startsWith("FA-2002")).join("\n"), "fx_invoices.csv"), fxScope, fxMapping("fx_invoices"), fxPreparer, "fx_invoices", "tva.reconciliation");
    const r = await run(T2, [await fec(), await ret(T2, CA3_T2), approve(invoices)]);
    expect(r.entries.find(e => e.pieceRef === "FA-2002")?.piece).toEqual({ status: "missing", ref: "FA-2002" });
    expect(r.controls.find(c => c.controlId === "VAT.PIECE.MISSING")?.outcome).toBe("potential_tax_risk");
  });
  it("FEC illisible ou déséquilibré : import bloqué, aucun montant réputé nul", async () => {
    const broken = await previewFec(file(fecText(FEC_LINES.map((l, i) => i === 2 ? [l[0], l[1], l[2], l[3], l[4], l[5], l[6], "abc"] as typeof l : l)), "fec.txt"), fxScope, fxPeriod, fxPreparer);
    expect(broken.report.blocking.join(" ")).toMatch(/FX_FEC_ROWS_REJECTED/);
    const unbalanced = await previewFec(file(fecText(FEC_LINES.map((l, i) => i === 2 ? [l[0], l[1], l[2], l[3], l[4], l[5], l[6], "99,00"] as typeof l : l)), "fec.txt"), fxScope, fxPeriod, fxPreparer);
    expect(unbalanced.report.blocking.join(" ")).toMatch(/FX_FEC_ENTRY_UNBALANCED:VE:VE1001/);
  });
  it("déterminisme : même entrée, même résultat haché", async () => {
    const imports = [await fec(), await ret(T2, CA3_T2), await tab("fx_invoices")];
    expect((await run(T2, imports)).engine.snapshotHash).toBe((await run(T2, imports)).engine.snapshotHash);
  });
});
