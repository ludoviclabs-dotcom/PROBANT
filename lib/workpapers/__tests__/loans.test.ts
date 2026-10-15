import { describe, expect, it } from "vitest";
import { assertContext, assertLoansContext } from "../cycle-context";
import { previewImport } from "../imports";
import { LoanRegistry, LOAN_TEMPLATE } from "../loan-adapter";
import { loanFixture, loanFixtureRows, loanSyntheticFiles, LOAN_PERIOD, type LoanRows } from "../loan-fixture";
import { loanDiagnostic } from "../loan-package";
import { assertLoanBatch, calculateLoanInterest, evaluateLoans, initialLoanDraft, loanFacts, LOAN_MAPPING, stampLoanWork, type LoanResult } from "../loan-review";
import { accountSignal, contractualDays, ratePpm, resolveLoanRules } from "../loan-rules";
import { contentHash, validateRun } from "../model";
import { freezePopulation } from "../selection";
import { observeRuns } from "../closing-cycles";
import { scopedFamilyRuns } from "@/lib/capabilities/store-readers";

/**
 * C13 — attendus fixés AVANT l'implémentation, recalculés indépendamment par docs/recette/c13/attendus.py
 * (fractions exactes Python). Taux, conventions et seuils sont des paramètres des contrats d'exemple.
 */
const eur = (amount: string) => ({ kind: "known", value: { amount, currency: "EUR" } });
const row = (r: LoanResult, id: string) => r.rows.find(x => x.id === id)!;
const due = (r: LoanResult, id: string, date: string) => row(r, id).dues.find(d => d.dueDate === date)!;
const edit = (rows: LoanRows, type: keyof LoanRows, key: string, change: (details: Record<string, unknown>) => void) => change(rows[type].find(r => r.key === key)!.details);

describe("C13 — recette simple préétablie (exemple de contrat, pas une règle générale)", () => {
  it("100 000 − 10 000 = 90 000 ; 3 % pendant 30 jours en 30/360 sur 100 000 = 250", async () => {
    const { result, calculation } = await loanFixture({ scenario: "simple" }), simple = row(result, "C13-SIMPLE");
    expect(calculation).toMatchObject({ execution: "completed", outcome: "no_exception_detected", blockedControls: [] });
    expect(contractualDays("2026-01-01", "2026-02-01", "30/360")).toBe(30);
    expect(simple.expectedClosing).toEqual(eur("90000.00"));
    expect(simple.residual).toEqual(eur("0.00"));
    expect(due(result, "C13-SIMPLE", "2026-02-01").calculatedInterest.amount).toEqual(eur("250.00"));
    expect(due(result, "C13-SIMPLE", "2026-03-01").calculatedInterest.amount).toEqual(eur("225.00"));
    expect(simple.accrued.amount).toEqual(eur("225.00"));
    expect(simple.status).toBe("documented");
    expect(result.framing.status).toBe("complete");
    expect(result.outcome).toBe("no_exception_detected");
  });
  it("la convention est un paramètre : même période, autres conventions, autres montants", async () => {
    const { result } = await loanFixture({ scenario: "simple" });
    const segment = due(result, "C13-SIMPLE", "2026-02-01").calculatedInterest.segments[0];
    expect(segment).toMatchObject({ start: "2026-01-01", end: "2026-02-01", days: 30, dayCount: "30/360", principal: { amount: "100000.00" } });
    expect(contractualDays("2026-01-01", "2026-02-01", "ACT/360")).toBe(31);
    expect(contractualDays("2026-01-01", "2026-01-31", "30E/360")).toBe(29);
    expect(contractualDays("2026-01-01", "2026-01-31", "30/360")).toBe(30);
    expect(contractualDays("2024-02-28", "2024-03-01", "ACT/365F")).toBe(2);
    const actual = await loanFixture({ scenario: "simple", edit: rows => edit(rows, "loan_contracts", "C13-SIMPLE-V1", d => { d.dayCount = "ACT/360"; }) });
    expect(due(actual.result, "C13-SIMPLE", "2026-02-01").calculatedInterest.amount).toEqual(eur("258.33"));
    expect(due(actual.result, "C13-SIMPLE", "2026-02-01").interestDifference).toEqual(eur("-8.33"));
  });
});

describe("C13 — taux absent : aucun taux ni convention par défaut", () => {
  it("index absent pour la révision du 01/10/2026 : intérêts courus bloqués, échéances recalculées", async () => {
    const { result } = await loanFixture(), variable = row(result, "C13-VARIABLE");
    expect(due(result, "C13-VARIABLE", "2026-01-01").calculatedInterest.amount).toEqual(eur("1661.11"));
    expect(due(result, "C13-VARIABLE", "2026-01-01").calculatedInterest.segments[0].kind).toBe("opening_accrued");
    expect(due(result, "C13-VARIABLE", "2026-04-01").calculatedInterest.amount).toEqual(eur("1600.00"));
    expect(due(result, "C13-VARIABLE", "2026-07-01").calculatedInterest.amount).toEqual(eur("1626.63"));
    expect(due(result, "C13-VARIABLE", "2026-10-01").calculatedInterest.amount).toEqual(eur("1626.61"));
    expect(due(result, "C13-VARIABLE", "2026-07-01").calculatedInterest.segments[0].rateLabel).toContain("révision du 2026-04-01");
    expect(variable.accrued.status).toBe("blocked");
    expect(variable.accrued.reason).toMatch(/Taux absent.*Euribor 3 mois.*2026-10-01.*aucun taux par défaut/);
    expect(variable.accruedDifference.kind).toBe("unknown");
    expect(variable.expectedClosing).toEqual(eur("185000.00"));
    expect(variable.status).toBe("inconclusive");
  });
  it("taux fixe ou convention de jours non transcrits : calcul bloqué, jamais un zéro", async () => {
    const noRate = await loanFixture({ scenario: "simple", edit: rows => edit(rows, "loan_contracts", "C13-SIMPLE-V1", d => { d.fixedRatePercent = null; }) });
    const d1 = due(noRate.result, "C13-SIMPLE", "2026-02-01");
    expect(d1.calculatedInterest).toMatchObject({ status: "blocked", amount: { kind: "unknown", reason: "Taux fixe contractuel requis (aucun taux par défaut)" } });
    expect(row(noRate.result, "C13-SIMPLE").status).toBe("inconclusive");
    const noConvention = await loanFixture({ scenario: "simple", edit: rows => edit(rows, "loan_contracts", "C13-SIMPLE-V1", d => { d.dayCount = null; }) });
    expect(due(noConvention.result, "C13-SIMPLE", "2026-02-01").calculatedInterest.reason).toBe("Convention de jours contractuelle requise (aucune convention par défaut)");
    const noSpread = await loanFixture({ edit: rows => edit(rows, "loan_contracts", "C13-VARIABLE-V1", d => { d.spreadPercent = null; }) });
    expect(due(noSpread.result, "C13-VARIABLE", "2026-04-01").calculatedInterest.reason).toBe("Index, marge et dates de révision contractuelles requis");
  });
  it("une révision hors calendrier contractuel n’est pas utilisée ; un plancher d’index est exclu et nommé", async () => {
    const offCalendar = await loanFixture({ edit: rows => { rows.loan_rates.find(r => r.key === "C13-VARIABLE-IDX-20260401")!.date = "2026-04-02"; } });
    expect(due(offCalendar.result, "C13-VARIABLE", "2026-07-01").calculatedInterest.reason).toMatch(/Taux absent.*2026-04-01/);
    expect(row(offCalendar.result, "C13-VARIABLE").issues.map(i => i.text)).toContain("Révision de taux du 2026-04-02 hors calendrier contractuel : valeur non utilisée, à expliquer.");
    const floored = await loanFixture({ edit: rows => edit(rows, "loan_contracts", "C13-VARIABLE-V1", d => { d.indexBounds = true; }) });
    expect(row(floored.result, "C13-VARIABLE")).toMatchObject({ status: "excluded", presentation: { exclusion: { kind: "unsupported" } } });
    expect(ratePpm("2.15") + ratePpm("1.2")).toBe(3_350_000n);
    expect(() => ratePpm("3,5")).toThrow("LOAN_RATE_FORMAT_INVALID");
  });
});

describe("C13 — avenant et échéancier modifié", () => {
  it("l’avenant s’applique à sa date d’effet : 2,00 % puis 2,50 %, sans choix du taux favorable", async () => {
    const { result } = await loanFixture(), atlas = row(result, "C13-ATLAS");
    expect(due(result, "C13-ATLAS", "2026-01-01").calculatedInterest.amount).toEqual(eur("2555.56"));
    expect(due(result, "C13-ATLAS", "2026-04-01").calculatedInterest.amount).toEqual(eur("2450.00"));
    expect(due(result, "C13-ATLAS", "2026-07-01").calculatedInterest.amount).toEqual(eur("2426.67"));
    expect(due(result, "C13-ATLAS", "2026-10-01").calculatedInterest).toMatchObject({ amount: eur("3002.78"), segments: [{ version: "2", ratePpm: "2500000" }] });
    expect(atlas.accrued.amount).toEqual(eur("2938.89"));
    expect(atlas.versionChanges[0]).toMatchObject({ from: "1", to: "2", effective: "2026-07-01" });
    expect(atlas.versionChanges[0].fields).toContainEqual({ field: "fixedRatePercent", before: "\"2\"", after: "\"2.5\"" });
  });
  it("500 − 40 = 460, GL 470 : résidu de 10 000 à expliquer, aucune dette omise affirmée", async () => {
    const { result, run } = await loanFixture(), atlas = row(result, "C13-ATLAS");
    expect(atlas.expectedClosing).toEqual(eur("460000.00"));
    expect(atlas.residual).toEqual(eur("10000.00"));
    expect(atlas.confirmationDifference).toEqual(eur("-10000.00"));
    expect(atlas.status).toBe("explain");
    const residual = run.notes.find(n => n.text.startsWith("Résidu de principal"))!;
    expect(residual.amount).toEqual(eur("10000.00"));
    expect(residual.text).toContain("aucune dette omise affirmée");
    // Only the residual point carries the residual amount.
    expect(run.notes.filter(n => n.amount.kind === "known" && n.amount.value.amount === "10000.00")).toHaveLength(1);
  });
  it("une échéance rattachée à la version remplacée est signalée (échéancier modifié)", async () => {
    const { result } = await loanFixture({ edit: rows => edit(rows, "loan_schedule", "C13-ATLAS-E20261001", d => { d.contractVersion = "1"; }) });
    const d = due(result, "C13-ATLAS", "2026-10-01");
    expect(d.versionInForce).toBe("2");
    expect(d.issues.map(i => i.code)).toContain("schedule_version");
  });
  it("versions chevauchantes : calcul bloqué", async () => {
    const { result } = await loanFixture({ edit: rows => edit(rows, "loan_contracts", "C13-ATLAS-V1", d => { d.effectiveTo = "2026-08-31"; }) });
    expect(row(result, "C13-ATLAS").issues.map(i => i.code)).toContain("versions_overlap");
    expect(due(result, "C13-ATLAS", "2026-10-01").calculatedInterest.reason).toMatch(/chevauchantes/);
  });
});

describe("C13 — frais séparés", () => {
  it("les frais ne sont jamais ajoutés aux intérêts ; un GL qui les fusionne est détecté", async () => {
    const { result } = await loanFixture(), july = due(result, "C13-FRAIS", "2026-07-01"), jan = due(result, "C13-FRAIS", "2026-01-01");
    expect(july.calculatedInterest.amount).toEqual(eur("1428.16"));
    expect(july.interestGLDifference).toEqual(eur("120.00"));
    expect(july.glFees.kind).toBe("unknown");
    expect(july.paidFees).toEqual(eur("120.00"));
    expect(july.feePaymentDifference).toEqual(eur("0.00"));
    expect(jan.calculatedInterest.amount).toEqual(eur("1451.84"));
    expect(jan.feeGLDifference).toEqual(eur("0.00"));
    expect(row(result, "C13-FRAIS").accrued.amount).toEqual(eur("1209.86"));
    expect(row(result, "C13-FRAIS").status).toBe("inconclusive");
  });
  it("aucun frais prévu : absence d’écriture de frais sans objet, pas un inconnu", async () => {
    const { result } = await loanFixture({ scenario: "simple" }), d = due(result, "C13-SIMPLE", "2026-03-01");
    expect(d.glFees.kind).toBe("not_applicable");
    expect(d.glPrincipal.kind).toBe("not_applicable");
    expect(d.issues).toEqual([]);
  });
  it("frais capitalisés ou devise étrangère : exclus et nommés", async () => {
    const fees = await loanFixture({ scenario: "simple", edit: rows => edit(rows, "loan_contracts", "C13-SIMPLE-V1", d => { d.feesTreatment = "capitalised"; }) });
    expect(row(fees.result, "C13-SIMPLE").presentation.exclusion?.reason).toMatch(/Frais non réglés séparément/);
    expect(fees.result.outcome).toBe("inconclusive");
  });
});

describe("C13 — mismatch de périmètre et contrat non identifié", () => {
  it("la balance 168100 n’est pas expliquée par les contrats du pack : 15 000 non couverts", async () => {
    const { result } = await loanFixture();
    const framing = result.framing.rows.find(r => r.account === "168100")!;
    expect(framing).toMatchObject({ balance: eur("95000.00"), ledger: eur("80000.00"), difference: eur("15000.00") });
    expect(result.framing.rows.find(r => r.account === "164800")).toMatchObject({ ledger: eur("6013.75"), difference: eur("0.00") });
    expect(result.framing.status).toBe("mismatch");
    expect(result.framingIssues[0].text).toMatch(/Mismatch de périmètre au compte 168100.*aucune dette omise affirmée/);
    expect(row(result, "REF-INCONNUE")).toMatchObject({ status: "inconclusive", contractRowIds: [] });
    expect(row(result, "REF-INCONNUE").expectedClosing.kind).toBe("unknown");
    expect(result.outcome).toBe("inconclusive");
  });
  it("sans balance, le périmètre n’est pas cadré : non concluant", async () => {
    const { result } = await loanFixture({ scenario: "simple", edit: rows => { rows.loan_balance = []; } });
    expect(result.framing.status).toBe("not_provided");
    expect(result.outcome).toBe("inconclusive");
  });
  it("un compte absent de la balance reste inconnu", async () => {
    const { result } = await loanFixture({ scenario: "simple", edit: rows => { rows.loan_balance = rows.loan_balance.filter(r => r.key !== "164800"); } });
    expect(result.framing.rows.find(r => r.account === "164800")!.difference.kind).toBe("unknown");
  });
});

describe("C13 — instruments et postes de bilan selon le texte applicable", () => {
  it("le texte applicable vient du résolveur C04 et fixe comptes et intérêts courus", () => {
    expect(resolveLoanRules({ startDate: "2024-01-01", closingDate: "2024-12-31" }).textId).toBe("pcg-2024");
    expect(resolveLoanRules({ startDate: "2025-01-01", closingDate: "2025-12-31" }).textId).toBe("anc-2022-06");
    expect(resolveLoanRules({ startDate: "2026-01-01", closingDate: "2026-12-31" }).textId).toBe("pcg-2026-01-01");
    expect(resolveLoanRules({ startDate: "2027-01-01", closingDate: "2027-12-31" })).toMatchObject({ textId: "pcg-2026-01-01", resolvedTextId: "anc-2026-03" });
    expect(accountSignal("pcg-2024", "emprunt_bancaire", "164800", "accrued")).toMatch(/attendu en 16884/);
    expect(accountSignal("anc-2022-06", "emprunt_bancaire", "164800", "accrued")).toBeNull();
    expect(accountSignal("pcg-2026-01-01", "emprunt_participatif", "167500", "principal")).toMatch(/attendu en 1682/);
  });
  it("emprunt bancaire : poste « Emprunts et dettes auprès des établissements de crédit », compte incohérent signalé sans reclassement", async () => {
    const { result } = await loanFixture({ scenario: "simple" });
    expect(row(result, "C13-SIMPLE").presentation).toMatchObject({ rubric: "Emprunts et dettes auprès des établissements de crédit", expectedPrincipal: ["164"], expectedAccrued: ["1648"], signals: [] });
    const moved = await loanFixture({ scenario: "simple", edit: rows => edit(rows, "loan_contracts", "C13-SIMPLE-V1", d => { d.principalAccount = "168100"; }) });
    expect(row(moved.result, "C13-SIMPLE").presentation.signals.join(" ")).toMatch(/attendu en 164.*aucun reclassement/);
    expect(row(moved.result, "C13-SIMPLE").status).toBe("explain");
  });
  it("avance conditionnée : autres fonds propres par le moteur C09, exclue des emprunts sans rendre la feuille non concluante", async () => {
    const full = loanFixtureRows("complete");
    const { result } = await loanFixture({ scenario: "simple", edit: rows => {
      rows.loan_contracts.push(...full.loan_contracts.filter(r => r.key.startsWith("C13-AVANCE")));
      rows.loan_ledger.push(...full.loan_ledger.filter(r => r.key.startsWith("C13-AVANCE")));
      rows.loan_balance.push(...full.loan_balance.filter(r => r.key === "167300"));
    } });
    const avance = row(result, "C13-AVANCE");
    expect(avance.status).toBe("excluded");
    expect(avance.presentation.exclusion?.kind).toBe("other_equity");
    expect(avance.presentation.otherEquity).toMatchObject({ category: "avances_conditionnees", status: "qualifie" });
    expect(avance.presentation.otherEquity!.articles).toContain("PCG art. 316-1");
    expect(result.outcome).toBe("no_exception_detected");
  });
  it("termes contractuels manquants : instrument à qualifier, la feuille reste non concluante", async () => {
    const { result } = await loanFixture({ edit: rows => edit(rows, "loan_contracts", "C13-AVANCE-V1", d => { d.terms = null; }) });
    expect(row(result, "C13-AVANCE").presentation).toMatchObject({ exclusion: { kind: "unsupported" }, otherEquity: { category: "a_qualifier" } });
  });
});

describe("C13 — population, remboursés et covenants", () => {
  it("contrat remboursé dans l’exercice : conservé, remboursement anticipé expliqué, intérêts 1 000", async () => {
    const { result, run } = await loanFixture(), repaid = row(result, "C13-REMBOURSE");
    expect(run.population!.items.some(i => i.id === "contract:C13-REMBOURSE")).toBe(true);
    expect(repaid.closing).toEqual(eur("0.00"));
    expect(due(result, "C13-REMBOURSE", "2026-09-01")).toMatchObject({ kind: "early", calculatedInterest: { amount: eur("1000.00") }, issues: [] });
    expect(due(result, "C13-REMBOURSE", "2026-01-01").calculatedInterest.amount).toEqual(eur("1500.00"));
    expect(repaid.bookedAccrued.kind).toBe("not_applicable");
    expect(repaid.presentation.rubric).toBe("Emprunts et dettes financières diverses");
    expect(repaid.status).toBe("documented");
  });
  it("population : contrats et échéances exigibles pendant l’exercice, échéances futures hors population", async () => {
    const { run } = await loanFixture();
    const dues = run.population!.items.filter(i => i.id.startsWith("due:"));
    expect(dues.some(i => i.id.includes("20270101"))).toBe(false);
    expect(dues).toHaveLength(11 + 4 + 2 + 4 + 2);
    expect(run.population!.items.filter(i => i.id.startsWith("contract:")).map(i => i.id).sort()).toEqual(["contract:C13-ATLAS", "contract:C13-AVANCE", "contract:C13-FRAIS", "contract:C13-REMBOURSE", "contract:C13-SIMPLE", "contract:C13-VARIABLE", "contract:REF-INCONNUE"]);
  });
  it("covenant : définition contractuelle et date reprises, aucun ratio calculé, aucune conformité déduite", async () => {
    const { result } = await loanFixture();
    const atlas = row(result, "C13-ATLAS"), variable = row(result, "C13-VARIABLE");
    expect(atlas.issues.map(i => i.code)).not.toContain("covenant_definition");
    expect(atlas.issues.find(i => i.code === "clause_unread")!.text).toMatch(/Garantie.*Aucun ratio calculé, aucune conformité déduite/);
    expect(variable.issues.find(i => i.code === "clause_unread")!.text).toMatch(/Covenant/);
    expect(JSON.stringify(result)).not.toMatch(/"(ratio|compliant|conforme)"\s*:/);
    const unread = await loanFixture({ edit: rows => edit(rows, "loan_clauses", "C13-ATLAS-COV", d => { d.testDate = null; }) });
    expect(row(unread.result, "C13-ATLAS").issues.map(i => i.code)).toContain("covenant_definition");
  });
});

describe("C13 — sources, versions et intégrité", () => {
  it("les packs CSV sont réellement prévisualisés, hachés et rattachés à leur ligne", async () => {
    const f = await loanFixture();
    expect(f.imports).toHaveLength(8);
    expect(f.facts.every(p => p.proof.rowId && p.hash.length === 64 && p.line)).toBe(true);
    const files = loanSyntheticFiles();
    const batch = await previewImport(files.loan_contracts, f.scope, LOAN_MAPPING, f.actor, "loan_contracts", "loans.review");
    expect(() => assertLoanBatch(batch, LOAN_PERIOD)).not.toThrow();
  });
  it("une écriture postérieure à la date de revue, un montant de clause ou un JSON invalide sont refusés", async () => {
    await expect(loanFixture({ edit: rows => { rows.loan_ledger[0].date = "2027-03-01"; } })).rejects.toThrow();
    await expect(loanFixture({ edit: rows => { rows.loan_clauses[0].amount = "10.00"; } })).rejects.toThrow("LOAN_AMOUNT_NOT_APPLICABLE");
    const f = await loanFixture({ scenario: "simple" });
    const broken = new File(["Key;Amount;Date;Details\nX;0.00;2026-01-01;{oops"], "x.csv", { type: "text/csv" });
    const batch = await previewImport(broken, f.scope, LOAN_MAPPING, f.actor, "loan_clauses", "loans.review");
    expect(() => assertLoanBatch(batch, LOAN_PERIOD)).toThrow("LOAN_DETAILS_JSON_INVALID");
  });
  it("association complète exigée ; autre dossier refusé ; population bornée à la période du scope", async () => {
    const f = await loanFixture({ scenario: "simple" });
    expect(() => stampLoanWork({ ...f.draft, sourceRowIds: ["ancienne-ligne"] }, f.imports, f.scope, LOAN_PERIOD, f.run.id, f.actor.id, "2027-02-15T00:00:00.000Z")).toThrow("LOAN_COMPLETE_SOURCE_ASSOCIATIONS_REQUIRED");
    expect(() => loanFacts({ ...f.scope, dossierId: "autre" }, LOAN_PERIOD, f.imports, f.run.id)).toThrow();
    expect(() => freezePopulation(f.scope, f.imports, "loan_contract_due", f.actor)).toThrow("LOAN_POPULATION_PERIOD_REQUIRED");
    expect(() => freezePopulation(f.scope, f.imports, "loan_contract_due", f.actor, { ...LOAN_PERIOD, startDate: "2026-02-01" })).toThrow("LOAN_POPULATION_PERIOD_REQUIRED");
  });
  it("import non approuvé : calcul bloqué ; sélection partielle : non concluant ; résultat reproductible", async () => {
    const f = await loanFixture({ scenario: "simple" });
    const blocked = new LoanRegistry().execute({ scope: f.scope, period: LOAN_PERIOD, rule: LOAN_TEMPLATE.rule!, imports: f.imports.map(b => ({ ...b, approval: undefined })), population: f.population, selection: f.selection, parameters: { runId: f.run.id, work: f.work } });
    expect(blocked.execution).toBe("blocked");
    const partial = { ...f.selection, selectedIds: f.selection.selectedIds.slice(1) };
    expect(evaluateLoans(f.scope, LOAN_PERIOD, f.imports, f.run.id, f.population, partial, f.work).outcome).toBe("inconclusive");
    expect(evaluateLoans(f.scope, LOAN_PERIOD, f.imports, f.run.id, f.population, f.selection, f.work)).toEqual(f.result);
    expect(initialLoanDraft(f.facts)).toEqual(f.draft);
  });
  it("contexte fermé loans.review ; travail et version entrent dans l’empreinte de la feuille", async () => {
    const f = await loanFixture({ scenario: "simple" });
    const context = { scope: { ...f.scope, mode: "real" as const }, period: LOAN_PERIOD, purpose: "real" as const, procedure: "loans.review" as const };
    expect(() => assertLoansContext(context)).not.toThrow();
    expect(() => assertContext(context)).toThrow();
    expect(() => assertLoansContext({ ...context, procedure: "exceptional.review" })).toThrow("LOAN_CONTEXT_INVALID");
    const next = structuredClone(f.run); next.loanWork!.sourceRowIds[0] = "autre";
    expect(contentHash(next)).not.toBe(contentHash(f.run));
    expect(() => validateRun({ ...f.run, template: { ...f.run.template, id: "autre" } })).toThrow("LOAN_WORK_INVALID");
  });
  it("intervalle hors exercice ou sans principal d’ouverture : bloqué", async () => {
    const f = await loanFixture({ scenario: "simple" }), simple = row(f.result, "C13-SIMPLE");
    const ctx = { period: LOAN_PERIOD, versions: f.facts.filter(x => simple.contractRowIds.includes(x.rowId)), ledger: [], rates: [] };
    expect(calculateLoanInterest(ctx, "2026-01-01", "2026-02-01").reason).toBe("Principal d’ouverture unique requis");
    expect(calculateLoanInterest(ctx, "2026-01-01", "2027-02-01").status).toBe("blocked");
  });
});

describe("C13 — rattachement au dossier (C01) et au dossier de clôture", () => {
  it("la feuille Emprunts est une procédure du registre, observée par le dossier de clôture sans recalcul", async () => {
    const { run, scope } = await loanFixture({ scenario: "simple" });
    const rows = scopedFamilyRuns(scope, [{ family: "clients", run }]);
    expect(observeRuns(rows)).toEqual([expect.objectContaining({ family: "clients", procedure: "loans.review", label: "Emprunts : principal, échéances et intérêts", route: "/emprunts", state: "executed", outcome: "no_exception_detected", contentHash: contentHash(run) })]);
    expect(() => scopedFamilyRuns(scope, [{ family: "cash", run }])).toThrow("CAPABILITY_STORE_PROCEDURE_MISMATCH");
  });
});

describe("C13 — export de la version", () => {
  it("diagnostic : texte applicable, résidu, covenant sans ratio, cadrage et empreinte", async () => {
    const { run, facts } = await loanFixture();
    const { html, json } = loanDiagnostic(run, facts);
    expect(html).toContain("PCG consolidé au 1er janvier 2026");
    expect(html).toContain("Résidu de principal à expliquer");
    expect(html).toContain("Aucun ratio calculé ; aucune conformité de financement déduite.");
    expect(html).toContain("168100");
    expect(html).toContain(contentHash(run));
    expect(html).not.toContain("<script");
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: "loans-diagnostic-1", originalsIncluded: false });
  });
});
