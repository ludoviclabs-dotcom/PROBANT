import { describe, expect, it } from "vitest";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { buildCorporateTaxGoldenInput, runCorporateTaxGoldenCase, type CorporateTaxGoldenCaseId } from "@/lib/tax/release/golden-cases";
import { previewImport, type ImportBatch } from "../imports";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { previewDeclaration, previewFec } from "../fiscal-sources";
import { citOutcome, evaluateCit, initialCitWork, stampCitWork, type CitDraft, type CitResult } from "../fiscal-cit";
import { citText, DECL_2065, FEC_2024, fecText, FX_CSV, fx2024Period, fx2024Scope, fxMapping, fxPeriod, fxPreparer, fxScope, LIASSE_2024, LIASSE_2058A } from "./fiscal-fixtures";

const AT = "2027-02-15T10:00:00.000Z";
const file = (text: string, name: string) => new File([text], name, { type: "text/csv" });
const approve = (b: ImportBatch, actor = fxPreparer): ImportBatch => {
  if (b.report.blocking.length) throw new Error("Aperçu bloqué : " + b.report.blocking.join(" | "));
  return { ...b, approval: { actorId: actor.id, at: AT, previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } };
};
const preparer2024: Principal = { id: "preparer-fx", grants: [{ scope: fx2024Scope, permissions: ["read", "prepare", "download"] }] };
async function sources(scope: WorkpaperScope = fxScope, period: AccountingPeriod = fxPeriod, actor: Principal = fxPreparer, fec = fecText(), forms: { text: string; type: "liasse_2050_2059" | "declaration_2065" }[] = [{ text: citText(LIASSE_2058A), type: "liasse_2050_2059" }, { text: citText(DECL_2065, { documentType: "declaration_2065", formNumber: "2065-SD" }), type: "declaration_2065" }]) {
  const out = [approve(await previewFec(file(fec, "fec.txt"), scope, period, actor), actor)];
  for (const f of forms) out.push(approve(await previewDeclaration(file(f.text, f.type + ".csv"), scope, period, { documentType: f.type }, actor), actor));
  out.push(approve(await previewImport(file(FX_CSV.fx_support, "fx_support.csv"), scope, fxMapping("fx_support"), actor, "fx_support", "is.computation"), actor));
  return out;
}
const fecRow = (imports: ImportBatch[], account: string) => { const fec = imports.find(b => b.document.documentType === "fx_fec")!; return { documentId: fec.document.id, rowId: fec.rows.find(r => r.original.CompteNum === account)!.id }; };
const supportRow = (imports: ImportBatch[], key: string) => { const s = imports.find(b => b.document.documentType === "fx_support")!; return { documentId: s.document.id, rowId: s.rows.find(r => r.normalized?.key === key)!.id }; };
function draft(imports: ImportBatch[], overrides: Partial<CitDraft> = {}): CitDraft {
  return { formVintage: 2026, resultBasis: "after_tax",
    profile: { regime: "standard", groupStatus: "none", turnoverCents: "10240000", capitalPaid: "partially_paid", ownershipBasisPoints: 8000, siren: "123456789", evidence: supportRow(imports, "ATT-REGIME") },
    adjustments: overrides.adjustments ?? [
      { id: "IS", label: "Impôt sur les bénéfices comptabilisé", category: "accounted_tax", direction: "reintegration", amountCents: "1795000", treatment: "documents_declared", legalSource: null, citation: fecRow(imports, "695000") },
      { id: "AMENDE", label: "Pénalité de retard", category: "explicit_non_deductible", direction: "reintegration", amountCents: "100000", treatment: "documents_declared", legalSource: { sourceId: "cgi-art-39", sourceVersionId: "cgi-art-39-v2024-02-23", locator: "article 39, 2" }, citation: fecRow(imports, "671200") },
    ], ...overrides } as CitDraft;
}
function run(imports: ImportBatch[], d: CitDraft, scope = fxScope, period: AccountingPeriod = fxPeriod, actor = fxPreparer, vintage = 2026): CitResult {
  const p = { startDate: period.startDate, endDate: period.closingDate };
  const work = stampCitWork({ scope, runId: "cit-run", imports, draft: d, actor, at: AT, previous: initialCitWork({ period: p, formVintage: vintage, actor, at: AT }) });
  return evaluateCit(scope, period, imports, "cit-run", work);
}

describe("IS — cas de référence 2026 (montants calculés indépendamment du moteur)", () => {
  it("résultat comptable cadré, pont documenté après impôt, impôt du moteur égal à la charge et à la dette comptabilisées", async () => {
    const imports = await sources(), r = run(imports, draft(imports));
    // Hand computation: produits 102 400 − charges 31 600 = 70 800 avant impôt ; IS 17 950 ; après impôt 52 850 = WA.
    expect(r.framing).toMatchObject({ status: "framed", resultAfterTaxCents: 5285000, taxChargeCents: 1795000, resultBeforeTaxCents: 7080000, taxLiabilityCents: 1795000, declaredResultCents: 5285000, declaredBox: "WA", differenceCents: 0 });
    // 52 850 + 17 950 (IS) + 1 000 (pénalité) = 71 800 = XI.
    expect(r.bridge).toMatchObject({ status: "known", basis: "after_tax", startCents: 5285000, reintegrationsCents: 1895000, deductionsCents: 0, documentedResultCents: 7180000, declaredCents: 7180000, declaredBox: "XI", residualCents: 0 });
    // Capital partially paid: the reduced bracket is not eligible; 71 800 × 25 % = 17 950.
    expect(r.engine).toMatchObject({ status: "computed", taxImpactStatus: "computed", rateScheduleId: "is-rate-schedule-2026" });
    expect(r.computation).toMatchObject({ accountingResultCents: 5285000, taxResultBeforeDeficitsCents: 7180000, taxableBaseCents: 7180000, grossTaxCents: 1795000 });
    expect(r.computation!.brackets.map(b => [b.code, b.applied, b.allocatedBaseCents, b.taxCents, b.eligibility])).toEqual([["reduced_sme", false, 0, 0, "not_eligible"], ["normal", true, 7180000, 1795000, "not_applicable"]]);
    expect(Object.fromEntries(r.comparisons.map(c => [c.key, c.status]))).toMatchObject({ accounted_tax_charge: "matched", accounted_tax_liability: "matched", declared_tax_result_before_deficits: "matched", declared_final_tax_result: "matched", declared_normal_rate_base: "matched" });
    expect(r.exceptions).toEqual([]);
    expect(citOutcome(r)).toBe("no_exception_detected");
    // Documenting adjustments explain the declared total; they are never added a second time to the engine.
    expect(r.adjustments.every(a => !a.inEngine)).toBe(true);
    expect(r.adjustments.find(a => a.id === "AMENDE")?.legalSource).toMatchObject({ title: "Code general des impots, article 39", url: expect.stringContaining("legifrance") });
  });
  it("base avant impôt : 70 800 + 1 000 = 71 800 ; tout ajustement d’IS y est refusé comme double ajustement", async () => {
    const imports = await sources(), d = draft(imports);
    const before = run(imports, { ...d, resultBasis: "before_tax", adjustments: d.adjustments.filter(a => a.id !== "IS") });
    expect(before.bridge).toMatchObject({ basis: "before_tax", startCents: 7080000, documentedResultCents: 7180000, residualCents: 0 });
    expect(() => run(imports, { ...d, resultBasis: "before_tax" })).toThrow("FX_CIT_DOUBLE_TAX_ADJUSTMENT");
    expect(() => run(imports, { ...d, adjustments: [...d.adjustments, { ...d.adjustments[0], id: "IS-2" }] })).toThrow("FX_CIT_DOUBLE_TAX_ADJUSTMENT");
    expect(() => run(imports, { ...d, adjustments: [{ ...d.adjustments[0], direction: "deduction" }] })).toThrow("FX_CIT_DOUBLE_TAX_ADJUSTMENT");
  });
  it("retraitement oublié : le pont après impôt laisse un résidu de 1 000 non expliqué", async () => {
    const imports = await sources(), d = draft(imports), r = run(imports, { ...d, adjustments: d.adjustments.filter(a => a.id !== "AMENDE") });
    expect(r.bridge.residualCents).toBe(100000);
    expect(r.exceptions.map(e => e.code)).toEqual(["BRIDGE_UNEXPLAINED"]);
    expect(citOutcome(r)).toBe("exceptions_detected");
  });
  it("correction proposée : source du registre couvrant l’exercice exigée, intégrée au calcul et signalée", async () => {
    const imports = await sources(), d = draft(imports);
    const correction = { id: "DON", label: "Don non réintégré", category: "donations_patronage" as const, direction: "reintegration" as const, amountCents: "200000", treatment: "proposed_correction" as const, citation: supportRow(imports, "NOTE-CREDIT") };
    // A registry version still « review_required » does not cover the exercise: the correction cannot enter the computation.
    expect(() => run(imports, { ...d, adjustments: [...d.adjustments, { ...correction, legalSource: { sourceId: "cgi-art-39", sourceVersionId: "cgi-art-39-v2024-02-23", locator: "article 39" } }] })).toThrow("FX_CIT_SOURCE_NOT_COVERED");
    expect(() => run(imports, { ...d, adjustments: [...d.adjustments, { ...correction, legalSource: null }] })).toThrow("FX_CIT_CORRECTION_SOURCE_REQUIRED");
    expect(() => run(imports, { ...d, adjustments: [...d.adjustments, { ...correction, legalSource: { sourceId: "inventee", sourceVersionId: "inventee-v1", locator: "x" } }] })).toThrow("FX_CIT_SOURCE_UNKNOWN");
    const r = run(imports, { ...d, adjustments: [...d.adjustments, { ...correction, legalSource: { sourceId: "bofip-bic-base", sourceVersionId: "bofip-bic-base-v2013-03-04", locator: "BOI-BIC-BASE" } }] });
    expect(r.computation).toMatchObject({ taxResultBeforeDeficitsCents: 7380000, grossTaxCents: 1845000 });
    expect(r.adjustments.find(a => a.id === "DON")?.inEngine).toBe(true);
    expect(r.exceptions.map(e => e.code).sort()).toEqual(["ENGINE_DIFFERENCE", "ENGINE_DIFFERENCE", "ENGINE_DIFFERENCE", "ENGINE_DIFFERENCE", "ENGINE_DIFFERENCE", "PROPOSED_CORRECTION"]);
  });
});

describe("IS — recette des cas limites", () => {
  it("IS 2024 maintenu bloqué : aucun barème ni millésime publié, aucun barème voisin, source requise affichée", async () => {
    const forms = [{ text: citText(LIASSE_2024, { vintage: 2024, start: "2024-01-01", end: "2024-12-31" }), type: "liasse_2050_2059" as const }];
    const imports = await sources(fx2024Scope, fx2024Period, preparer2024, fecText(FEC_2024), forms);
    expect(imports[1].report.warnings[0]).toMatch(/FX_FORM_VINTAGE_NOT_PUBLISHED:2058-A-SD 2024/);
    const d = draft(imports, { formVintage: 2024, adjustments: [] });
    // Substituting the 2026 vintage to a 2024 return is refused.
    expect(() => run(imports, { ...d, formVintage: 2026 }, fx2024Scope, fx2024Period, preparer2024, 2024)).toThrow("FX_VINTAGE_MISMATCH");
    const r = run(imports, d, fx2024Scope, fx2024Period, preparer2024, 2024);
    expect(r.engine).toMatchObject({ status: "blocked", taxImpactStatus: "not_computed", rateScheduleId: null });
    expect(r.computation).toBeNull();
    expect(r.declaration.status).toBe("unpublished_vintage");
    const rule = r.blockedRules.find(b => b.code === "UNSUPPORTED_RATE_SCHEDULE")!;
    expect(rule.label).toBe("Barème d’IS non publié pour l’exercice 2024");
    expect(rule.requiredSource).toMatch(/seuls les exercices 2026 sont publiés/);
    expect(rule.sources.find(s => s.sourceId === "cgi-art-219")).toMatchObject({ coverage: "not_covered" });
    // Even with a 2026 vintage and no return, the 2024 exercise finds no schedule.
    const noReturn = await sources(fx2024Scope, fx2024Period, preparer2024, fecText(FEC_2024), []);
    expect(run(noReturn, draft(noReturn, { formVintage: 2026, adjustments: [] }), fx2024Scope, fx2024Period, preparer2024).engine).toMatchObject({ status: "blocked", rateScheduleId: null });
    expect(citOutcome(r)).toBe("inconclusive");
  });
  it("profil inconnu : moteur bloqué, impôt non calculé, cadrage toujours présenté", async () => {
    const imports = await sources(), r = run(imports, { ...draft(imports), profile: { regime: "unknown", groupStatus: "unknown", turnoverCents: null, capitalPaid: "unknown", ownershipBasisPoints: null, siren: null, evidence: null } });
    expect(r.engine.status).toBe("blocked");
    expect(r.computation).toBeNull();
    expect(r.framing.status).toBe("unknown");
    expect(r.declaration.status).toBe("not_read");
    expect(r.exceptions.map(e => e.code)).toEqual(expect.arrayContaining(["ENGINE_BLOCKED", "PROFILE_UNCONFIRMED"]));
  });
  it("éligibilité au taux réduit inconnue : impôt estimé au taux normal, information manquante, non concluant", async () => {
    const imports = await sources(), d = draft(imports), r = run(imports, { ...d, profile: { ...d.profile, ownershipBasisPoints: null, capitalPaid: "unknown" } });
    expect(r.engine).toMatchObject({ status: "computed", outcome: "missing_information", taxImpactStatus: "estimated" });
    expect(r.computation!.brackets[0]).toMatchObject({ code: "reduced_sme", applied: false, eligibility: "unknown" });
    expect(r.blockedRules.some(b => b.code === "REDUCED_RATE_ELIGIBILITY_UNKNOWN" && b.category === "profile")).toBe(true);
    expect(citOutcome(r)).toBe("inconclusive");
  });
  it("liasse absente : résultat déclaré inconnu, jamais nul ; impôt non calculé", async () => {
    const imports = await sources(fxScope, fxPeriod, fxPreparer, fecText(), []), r = run(imports, draft(imports, { adjustments: [] }));
    expect(r.framing).toMatchObject({ status: "unknown", declaredResultCents: null, differenceCents: null });
    expect(r.declaration.status).toBe("absent");
    expect(r.exceptions.map(e => e.code)).toContain("LIASSE_ABSENT");
  });
});

/**
 * Independent path check: the release gate feeds TAX-05 canonical objects built in memory; here the same golden returns are written
 * as files, read by the tax document processor, approved and evaluated by the sheet. The engine snapshot must be the same.
 */
const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const CASES: CorporateTaxGoldenCaseId[] = ["is-zero-adjustment", "is-reintegration", "is-deduction", "is-loss", "is-deficit", "is-reduced-rate", "is-reduced-rate-unproven", "is-inconsistent-return", "is-divergent-tax-charge", "is-missing-declaration"];
describe("IS — cas golden de la gate de release rejoués par le chemin fichiers → processeur → feuille", () => {
  for (const id of CASES) it(id, async () => {
    const input = buildCorporateTaxGoldenInput(id), golden = runCorporateTaxGoldenCase(id).snapshot, p = input.period;
    const accounting: AccountingPeriod = { startDate: p.startDate, closingDate: p.endDate, asOfDate: p.endDate, currency: "EUR", validation: "provisional" };
    const scope: WorkpaperScope = { organizationId: "org-golden", dossierId: "88888888-8888-4888-8888-888888888888", periodId: periodId(accounting), mode: "real" };
    const actor: Principal = { id: "preparer-golden", grants: [{ scope, permissions: ["read", "prepare", "download"] }] };
    const fecLines = input.accountedPositions?.chargeCents ? [["OD", "IS1", "20261231", "695000", "IS", "IS", euros(input.accountedPositions.chargeCents), "0,00"], ["OD", "IS1", "20261231", "512000", "Banque", "IS", "0,00", euros(input.accountedPositions.chargeCents)]]
      : [["OD", "X1", "20260630", "512000", "Banque", "X", "1,00", "0,00"], ["OD", "X1", "20260630", "455000", "Associé", "X", "0,00", "1,00"]];
    const fec = ["JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit", ...fecLines.map(([j, n, d, c, l, piece, de, cr]) => [j, "J", n, d, c, l, "", "", piece, d, l, de, cr].join(";"))].join("\n") + "\n";
    const imports = [approve(await previewFec(file(fec, "fec.txt"), scope, accounting, actor), actor)];
    for (const doc of input.documentSnapshots) {
      const type = doc.formNumber === "2065-SD" ? "declaration_2065" : "liasse_2050_2059";
      const text = ["documentType;formNumber;formVintage;periodStart;periodEnd;fiscalYear;fieldCode;rawValue;page;box", ...doc.fields.map(f => [type, doc.formNumber, doc.formVintage, p.startDate, p.endDate, p.fiscalYear, f.fieldCode, euros(f.amountCents ?? 0), "1", f.fieldCode].join(";"))].join("\n") + "\n";
      imports.push(approve(await previewDeclaration(file(text, doc.id + ".csv"), scope, accounting, { documentType: type }, actor), actor));
    }
    const prof = input.profile;
    const work = stampCitWork({ scope, runId: "golden", imports, actor, at: input.createdAt, previous: initialCitWork({ period: { startDate: p.startDate, endDate: p.endDate }, formVintage: p.formVintage, actor, at: input.createdAt }),
      draft: { formVintage: p.formVintage, resultBasis: "after_tax", adjustments: [], profile: { regime: prof.corporateIncomeTaxRegime, groupStatus: prof.corporateIncomeTaxGroupStatus, turnoverCents: prof.turnoverAmountCents === null ? null : String(prof.turnoverAmountCents),
        capitalPaid: prof.capitalPaidStatus, ownershipBasisPoints: prof.qualifyingIndividualOwnershipBasisPoints, siren: null, evidence: null } } });
    const r = evaluateCit(scope, accounting, imports, "golden", work);
    expect({ status: r.engine.status, outcome: r.engine.outcome, impact: r.engine.taxImpactStatus, gross: r.computation?.grossTaxCents ?? null, base: r.computation?.taxableBaseCents ?? null, before: r.computation?.taxResultBeforeDeficitsCents ?? null,
      brackets: r.computation?.brackets.map(b => [b.code, b.allocatedBaseCents, b.taxCents]) ?? [] })
      .toEqual({ status: golden.status, outcome: golden.outcome, impact: golden.taxImpactStatus, gross: golden.grossTaxCents, base: golden.status === "computed" ? golden.taxableBaseCents : null, before: golden.status === "computed" ? golden.taxResultBeforeDeficitsCents : null,
        brackets: golden.status === "computed" ? golden.brackets.map(b => [b.code, b.allocatedBaseCents, b.taxCents]) : [] });
    if (id === "is-divergent-tax-charge") expect(r.comparisons.find(c => c.key === "accounted_tax_charge")?.status).toBe("different");
  });
});
