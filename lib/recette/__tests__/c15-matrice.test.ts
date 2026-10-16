import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildPageAggregates } from "@/lib/risk-mapping/aggregate";
import { scoreGravite } from "@/lib/risk-mapping/scoring";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { generateSynthesisNote } from "@/lib/synthesis/note";
import { formatCents } from "@/lib/synthesis/money";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding } from "@/lib/synthesis/__tests__/fixtures";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import type { CalculationContext } from "@/lib/canonical-model/dossier";
import type { Finding } from "@/lib/canonical-model/finding";
import { frameClients } from "@/lib/workpapers/clients";
import type { BalanceLine } from "@/lib/workpapers/cycle-review";
import { recalculateLinearPlan, type DepreciationParameters } from "@/lib/workpapers/fixed-assets";
import { boundedComparison } from "@/lib/workpapers/stock-value-review";
import type { ProcedureView } from "@/lib/workpapers/closing-evaluate";
import { period, scope } from "@/lib/workpapers/__tests__/fixtures";
import { known, proof } from "@/lib/workpapers/__tests__/cutoff-fixtures";
import { sheet, small, source } from "@/lib/workpapers/__tests__/closing-c14-fixtures";
import { createClosingHarness, type ClosingViewBody } from "@/lib/workpapers/__tests__/closing-harness";
import { computeCorporateTax } from "@/lib/tax";
import { coherentLiasse, computationInput, eligibleProfile, period as taxPeriod, profile } from "@/lib/tax/corporate-tax/__tests__/fixtures";
import { buildClientMission } from "@/lib/workpapers/client-mission";
import { clientMissionHtml } from "@/lib/evidence/client-mission-package";
import { clientMissionFixture } from "@/lib/workpapers/__tests__/client-mission-fixture";
import { CAPABILITY_REGISTRY, ENGINE_PROCEDURES, WORKFLOW_ROUTES, WORKSHOPS } from "@/lib/capabilities/registry";

/**
 * Recette finale C15 — matrice du rapport du 12/10/2026 (§ 11) rejouée sur les moteurs livrés.
 *
 * Les attendus ne sont PAS écrits ici : ils sont lus dans docs/recette/c15/attendus.json, produit par attendus.py
 * (Decimal, aucune importation PROBANT) et commité avant ce fichier. Les données d'entrée reprennent celles d'attendus.py.
 * Un cas dont la capacité n'est pas livrée sur cette base reste un échec déclaré (`it.fails`) avec l'attendu exact :
 * il n'est ni retiré ni assoupli, et cessera de « passer » le jour où la capacité arrivera.
 */
const A = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "recette", "c15", "attendus.json"), "utf8"));
const cents = (eur: string) => Math.round(Number(eur) * 100);
const money = (amount: string) => ({ kind: "known", value: { amount, currency: "EUR" } });

describe("C15 · M1 — résidus compensés (Clients)", () => {
  const m1 = A.M1_clients_residus;
  const context = { scope, period, purpose: "synthetic_technical" as const };
  const line = (id: string, party: string, amount: string): BalanceLine => ({ id, key: id, account: "411000", party, value: { amount: known(amount).value, date: period.closingDate, basis: "closing_balance", evidence: [proof] } });
  const r = frameClients(context,
    [line("GL", "TOTAL", m1.gl)],
    [line("C1", "C1", "100.00"), line("C2", "C2", "-20.00")],
    [line("C1", "C1", "90.00"), line("C2", "C2", "-10.00")], []);

  it("agrégats concordants mais résidus par clé visibles et non compensés", () => {
    expect(r.generalToAuxiliary.net).toEqual(money(m1.ecart_gl_auxiliaire));
    expect(r.auxiliaryToAged.net).toEqual(money(m1.ecart_auxiliaire_agee_global));
    expect(Object.fromEntries(r.auxiliaryToAged.rows.map(x => [x.key, x.difference]))).toEqual(
      Object.fromEntries(Object.entries(m1.residus_par_cle as Record<string, string>).map(([k, v]) => [k, money(v)])));
    expect(r.auxiliaryToAged.gross).toEqual(money(m1.residus_bruts_valeur_absolue));
    // « Accord global insuffisant » : un brut non nul malgré un net nul, et la convention le dit.
    expect(m1.accord_global_suffisant).toBe(false);
    expect(r.auxiliaryToAged.convention).toContain("résidus non compensés");
    // Le solde créditeur reste à justifier, jamais une erreur automatique.
    expect(r.creditBalances.map(c => [c.party, c.status])).toEqual([["C2", "à justifier, pas une erreur automatique"]]);
  });
});

describe("C15 · M2 — population absente, vide, contrôles seuls", () => {
  const ctx = (over: Partial<CalculationContext>): CalculationContext => ({ entriesTotal: 100, entriesAnalysed: 100, controlsEligible: 10, controlsExecuted: 10, controlsConcluded: 10, controlsNotConcluded: 0, notes: [], ...over });
  const build = (c: CalculationContext) => buildSynthesisSnapshot(makeDossierSnapshot({ calculationContext: c }), { clock: CLOCK });
  const entries = (s: ReturnType<typeof build>) => s.coverage.populations.find(p => p.id === "entries")!;

  it("absente : source manquante, aucun ratio, couverture non qualifiée", () => {
    const s = build(ctx({ entriesTotal: 0, entriesAnalysed: 0 }));
    expect(entries(s)).toMatchObject({ status: "missing", denominator: null, ratio: A.M2_population.absente.ratio });
    expect(s.coverage.status).toBe("unqualified");
    expect(s.verdict.headline).toBe("Couverture non qualifiée");
  });

  it("absente : la note de synthèse ne présente ni « 0/0 » ni un ratio pour les écritures", () => {
    const note = generateSynthesisNote(build(ctx({ entriesTotal: 0, entriesAnalysed: 0 })), { raisonSociale: "TEST SA", siren: "123456789", exercice: "2024", dateCloture: "20241231" });
    const coverage = note.slice(note.indexOf("## 3. Couverture"), note.indexOf("## 4."));
    for (const never of A.M2_population.absente.jamais as string[]) expect(coverage).not.toContain(never);
    expect(coverage).not.toMatch(/0\/0|ratio 0\b/);
    expect(coverage).toContain("population non dénombrée");
  });

  it("absente : la note téléchargeable de la Synthèse de démonstration ne présente pas « 0/0 » (écran /dashboard/synthese)", () => {
    const demo = buildDemoDossierSnapshot(), s = buildSynthesisSnapshot(demo, { clock: CLOCK });
    expect(entries(s).status).toBe("missing");
    const note = generateSynthesisNote(s, demo.dossier.societe);
    const coverage = note.slice(note.indexOf("## 3. Couverture"), note.indexOf("## 4."));
    expect(coverage).not.toMatch(/0\/0|ratio 0\b/);
    expect(coverage).toContain("Écritures analysées : aucun ratio — population non dénombrée");
  });

  it("vide connue : état explicite, aucun ratio ni assurance", () => {
    const s = build(ctx({ entriesTotal: 0, entriesAnalysed: 0, entriesPopulation: "known_empty" }));
    expect(entries(s)).toMatchObject({ status: "known_empty", ratio: A.M2_population.vide_connue.ratio });
    const d = buildSynthesisDatasets({ synthesis: s, societe: makeDossierSnapshot().dossier.societe, findings: [], admissibilityFindings: [] });
    expect(d.coverage.rows.find(r => r.id === "entries")!.cells).toMatchObject({ statut: "Population connue vide", ratio: null });
  });

  it("24 contrôles conclus sur 24, écritures 0 : aucun niveau d'étendue des écritures déduit", () => {
    const s = build(ctx({ entriesTotal: 0, entriesAnalysed: 0, controlsEligible: 24, controlsExecuted: 24, controlsConcluded: 24 }));
    const controls = s.coverage.populations.find(p => p.id === "controls")!;
    expect(controls.ratio!.toFixed(4)).toBe(A.M2_population.controles_24_sur_24_ecritures_0.ratio_programme);
    expect(entries(s).ratio).toBe(A.M2_population.controles_24_sur_24_ecritures_0.ratio_ecritures);
    expect(s.coverage.status).not.toBe("substantial");
  });
});

describe("C15 · M3 — constat qualitatif sans montant", () => {
  it("assertion conservée, montant inconnu, présent une fois dans la matrice des constats", () => {
    const f = makeFinding("q-1", { ruleId: "R-RAPPRO-lettrage", cloison: "bilan-actif", mesure: { constate: 0, seuil: 0, unite: "EUR", libelle: "existence" } });
    const synthesis = buildSynthesisSnapshot(makeDossierSnapshot({ findings: [f] }), { clock: CLOCK });
    const d = buildSynthesisDatasets({ synthesis, societe: makeDossierSnapshot().dossier.societe, findings: [f], admissibilityFindings: [] });
    const m3 = A.M3_qualitatif;
    expect(synthesis.exposure.findingsWithoutEffect).toEqual(["q-1"]);
    expect(f.financialEffect ?? null).toBe(m3.montant);
    expect(d.riskHeatmap.columns.map(c => c.key)).toContain("solde_" + m3.assertion);
    expect(d.riskHeatmap.rows.find(r => r.id === "bilan-actif")!.cells["solde_" + m3.assertion]).toBe(m3.cellule_compte);
    expect(d.riskHeatmap.title).toContain("Matrice des constats");
    expect(d.riskHeatmap.summary).toContain("une cellule vide signifie « aucun constat », pas « assertion couverte »");
  });
});

describe("C15 · M4 — signal EUR sans effet explicite", () => {
  const MAT = (euros: number): MaterialityThresholds => ({ base: "chiffre_affaires" as MaterialityThresholds["base"], baseMontant: euros * 100, taux: 0.01, significativite: euros, performance: euros * 0.75, trivialite: euros * 0.05, source: "ISA 320" });
  it("aucune incidence comptable inférée du seuil, dans la Synthèse comme dans les risques", () => {
    const m4 = A.M4_signal_eur;
    const f = makeFinding("f-sig", { mesure: { constate: Number(m4.constate), seuil: Number(m4.seuil), unite: "EUR", libelle: "solde" } });
    const snapshot = makeDossierSnapshot({ findings: [f] });
    const synthesis = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
    const shared = projectSnapshotExposure(snapshot).exposure;
    expect(m4.incidence_inferee).toBeNull();
    expect(synthesis.exposure.grossDetectedExposureCents).toBe(0);
    expect(synthesis.exposure.determinedExposureCents).toBe(0);
    expect(synthesis.exposure.findingsWithoutEffect).toEqual(["f-sig"]);
    const risk = buildPageAggregates([], [], snapshot.findings, undefined, shared);
    expect(JSON.stringify(risk)).not.toContain(String(cents(m4.jamais)));
    const g1 = scoreGravite([f], MAT(1), shared), g2 = scoreGravite([f], MAT(50_000), shared);
    expect(g1.drivers.some(d => d.label === "Signaux EUR sans effet explicite (incidence comptable inconnue)")).toBe(true);
    expect(g1.drivers.some(d => d.label.startsWith("Effets financiers explicites"))).toBe(false);
    expect(g1.auto).toBe(g2.auto);
  });
});

describe("C15 · M5 — effets divergents et chevauchement", () => {
  const build = (findings: Finding[]) => buildSynthesisSnapshot(makeDossierSnapshot({ findings }), { clock: CLOCK });
  const m5 = A.M5_effets;
  it("même identité, 100 et 120 : conflit visible, aucun montant retenu en silence", () => {
    const same = (id: string, amount: string) => makeFinding(id, { financialEffect: makeEffect({ amountCents: cents(amount) }), lignesSource: [7] });
    const s = build([same("f-100", "100.00"), same("f-120", "120.00")]);
    expect(s.exposure.clusters).toHaveLength(1);
    expect(s.exposure.clusters[0]).toMatchObject({ status: "conflict", retainedCents: m5.meme_identite_100_120.montant_retenu });
    expect(s.exposure.clusters[0].members).toHaveLength(m5.meme_identite_100_120.membres);
    for (const never of m5.meme_identite_100_120.jamais as string[]) expect(s.exposure.determinedExposureCents).not.toBe(cents(never));
    expect(s.exposure.aggregationStatus).toBe("indeterminate");
  });
  it("même contenu répété : compté une fois", () => {
    const same = (id: string) => makeFinding(id, { financialEffect: makeEffect({ amountCents: cents("100.00") }), lignesSource: [7] });
    const s = build([same("r-1"), same("r-2")]);
    expect(s.exposure.determinedExposureCents).toBe(cents(m5.repetition_meme_contenu.montant));
    expect(s.exposure.clusters[0].members.filter(m => m.role === "retained")).toHaveLength(m5.repetition_meme_contenu.compte);
  });
  it("A = L1/L2 100, B = L2/L3 120 : indéterminé, bornes [120 ; 220]", () => {
    const mk = (id: string, lignes: number[], amount: string) => makeFinding(id, { financialEffect: makeEffect({ amountCents: cents(amount), rootCause: "cause-" + id }), lignesSource: lignes });
    const s = build([mk("A", [1, 2], "100.00"), mk("B", [2, 3], "120.00")]);
    const c = m5.chevauchement_L1L2_L2L3;
    expect(s.exposure.clusters[0]).toMatchObject({ status: "indeterminate", retainedCents: null, boundsCents: { minCents: cents(c.borne_basse), maxCents: cents(c.borne_haute) } });
  });
});

describe("C15 · M6 — net fiscal incomplet", () => {
  it("+1 000 validé, taux absent : brut connu, impôt et net inconnus", () => {
    const m6 = A.M6_net_fiscal;
    const s = buildSynthesisSnapshot(makeDossierSnapshot({ findings: [makeFinding("f", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: cents(m6.brut), taxRatePct: undefined, taxQualification: undefined }), lignesSource: [1] })] }), { clock: CLOCK });
    const r = s.exposure.netByTarget.find(t => t.target === "resultat")!;
    expect(r.proposedSignedCents).toBe(cents(m6.brut));
    expect(r.taxStatus).toBe("unknown");
    expect(r.netAfterKnownTaxCents).toBe(m6.net);
    expect(s.exposure.tax.status).toBe("unknown");
    // « Impôt 0 » n'est jamais présenté comme connu : la part connue vaut 0 mais le statut reste inconnu, avec sa raison.
    expect(s.exposure.tax.unknown.map(u => u.reason)).toEqual(["taux d'impôt absent : incidence fiscale inconnue"]);
    expect(r.netAfterKnownTaxCents).not.toBe(cents(m6.jamais.net));
    const d = buildSynthesisDatasets({ synthesis: s, societe: makeDossierSnapshot().dossier.societe, findings: [], admissibilityFindings: [] });
    const steps = Object.fromEntries(d.waterfall.steps.map(st => [st.id, st.amountCents]));
    expect([steps.tax ?? null, steps.net ?? null]).toEqual([null, null]);
  });
});

describe("C15 · M7 — fin d'amortissement (règle Immobilisations 1.1.0)", () => {
  const m7 = A.M7_fin_de_plan;
  const context = { scope, period, purpose: "synthetic_technical" as const };
  const eur = (amount: string, date = period.closingDate) => ({ amount: { amount, currency: "EUR" as const }, date, basis: "EUR", evidence: [proof] });
  const method = { id: "SYN", version: "1", source: "fixture synthétique C15", from: period.startDate, to: period.closingDate, approvedBy: "SYN", synthetic: true as const };
  const plan = (prior: string, inService: string): DepreciationParameters => ({ method, kind: "linear", cost: eur("12000.00"), residual: eur("0.00"), priorAccumulated: eur(prior, period.startDate),
    inServiceDate: inService, durationMonths: 60, prorata: { numerator: "1", denominator: "1", evidence: [proof] }, rounding: "half_up_cent" });
  // Exercice synthétique 01/07/2023 → 30/06/2024 ; mises en service choisies pour que le cumul d'ouverture soit celui du plan.
  it.each([
    ["12000.00", "2018-07-01", "cumul_ouverture_12000"],
    ["10800.00", "2019-01-01", "cumul_ouverture_10800"],
    ["4800.00", "2021-07-01", "cumul_ouverture_4800"],
  ])("cumul d'ouverture %s : dotation recalculée et cumul de clôture plafonné", (prior, inService, key) => {
    const r = recalculateLinearPlan(context, plan(prior, inService));
    expect(r.amount).toEqual(money(m7[key].dotation));
    expect(r.plan!.annuity.amount).toBe(m7.dotation_annuelle_plan);
    const closing = (Number(prior) + Number(m7[key].dotation)).toFixed(2);
    expect(closing).toBe(m7[key].cumul_cloture);
    if (m7[key].vnc) expect((12000 - Number(closing)).toFixed(2)).toBe(m7[key].vnc);
  });
});

describe("C15 · M8 — valeur de stock négative (règle Stocks 1.1.0)", () => {
  it("écart brut 130 distinct de la perte bornée à 100 ; complément 30 à qualifier ; aucune provision", () => {
    const m8 = A.M8_stock;
    // quantité en centièmes, coût et valeur actuelle en centimes : 10 unités, coût 10,00, prix 2,00 − sortie 5,00.
    const r = boundedComparison(1000n, 1000n, BigInt(cents("2.00") - cents("5.00")));
    expect(Number(BigInt(cents("2.00") - cents("5.00")))).toBe(cents(m8.valeur_actuelle_unitaire));
    expect(r).toEqual({ carrying: BigInt(cents(m8.valeur_comptable)), economic: BigInt(cents(m8.ecart_economique_brut)), asset: BigInt(cents(m8.perte_actif_bornee)), excess: BigInt(cents(m8.complement_a_qualifier)) });
    expect(m8.provision_automatique).toBeNull();
  });
});

describe("C15 · M9 / M10 — IS (moteur livré sur cette base)", () => {
  const m9 = A.M9_is;
  const tax = (profitCents: number, eligible: boolean) => computeCorporateTax(computationInput({ profile: eligible ? eligibleProfile() : profile(), documentSnapshots: [coherentLiasse({ accountingProfitCents: profitCents })] })).snapshot;

  it("annuel, base 50 000 : PME éligible 8 250, non éligible 12 500", () => {
    expect(tax(cents("50000.00"), true).grossTaxCents).toBe(cents(m9.pme_50000));
    expect(tax(cents("50000.00"), false).grossTaxCents).toBe(cents(m9.non_eligible_50000));
  });

  // CGI art. 219 I : le bénéfice est arrondi à l'euro. Échec déclaré tant que le moteur 1.0.0 était seul ; la mission C10
  // relivrée (moteur 1.1.0) le corrige. Attendus inchangés.
  it("base 50 000,49 € arrondie à 50 000 € avant calcul (CGI art. 219, I — C10)", () => {
    const s = tax(cents("50000.49"), true);
    expect(s.taxableBaseCents).toBe(Number(m9.base_50000_49.base_arrondie) * 100);
    expect(s.grossTaxCents).toBe(cents(m9.base_50000_49.impot));
  });
  it("exercice de 18 mois : refus ciblé ou plafond proratisé, jamais 42 500 € sans prorata (C10)", () => {
    const p = { startDate: "2026-01-01", endDate: "2027-06-30" };
    const s = computeCorporateTax(computationInput({ profile: eligibleProfile({ accountingPeriod: p }), period: taxPeriod({ startDate: p.startDate, endDate: p.endDate }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: cents("50000.00") })] })).snapshot;
    const reduced = s.brackets.find(b => b.code === "reduced_sme");
    const capUnprorated = reduced?.applied === true && reduced.allocatedBaseCents === 4_250_000;
    expect(s.status === "blocked" || !capUnprorated).toBe(true);
  });

  it("M10 — millésime 2024 absent : source/version requise, impôt inconnu, aucun repli sur 2026", () => {
    const m10 = A.M10_millesime;
    const p = { startDate: m10.exercice + "-01-01", endDate: m10.exercice + "-12-31" };
    const s = computeCorporateTax(computationInput({ profile: eligibleProfile({ accountingPeriod: p }),
      period: taxPeriod({ startDate: p.startDate, endDate: p.endDate, fiscalYear: m10.exercice, formVintage: m10.exercice }),
      documentSnapshots: [coherentLiasse({ accountingProfitCents: cents("50000.00") })] })).snapshot;
    expect(s.status).toBe("blocked");
    expect(s.grossTaxCents).toBe(m10.impot);
    expect(s.rateScheduleId).toBeNull();
    expect(s.limitations.find(l => l.code === "UNSUPPORTED_RATE_SCHEDULE")).toMatchObject({ requiredInputs: [`rate_schedule:${m10.exercice}:${m10.exercice}`] });
  });
});

describe("C15 · M11 / M12 — dossier de clôture : populations distinctes, invalidation", () => {
  const proc = (v: ClosingViewBody, id: string) => v.evaluation.procedures.find(p => p.procedureId === id) as ProcedureView;
  const indicator = (v: ClosingViewBody, id: string) => { const i = v.evaluation.indicators.find(x => x.id === id)!; return `${i.numerator} / ${i.denominator}`; };

  it("M11 — deux feuilles d'une procédure : rien n'est retenu par avancement ; seule la feuille rattachée compte", async () => {
    const m11 = A.M11_populations;
    const cash = source("cash", [sheet({ id: "B1", state: "locked", outcome: "no_exception_detected", population: ["512-B1"] }), sheet({ id: "B2", state: "executed", outcome: "exceptions_detected", population: ["512-B2"] })]);
    const h = createClosingHarness({ cycles: [cash] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "tresorerie", label: "Deux banques", assertions: ["solde_existence"], assessment: { level: "modere", rationale: "Deux comptes." } });
    let v = (await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "engine", engine: "cash.reconciliation", label: "Pont bancaire", owner: "C15" })).view;
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_a_rattacher", engine: { retained: null } });
    expect(indicator(v, "cycles")).toBe(m11.sans_rattachement.feuilles_verrouillees);
    v = (await h.ok({ command: "bind_sheet", procedureId: "P-02", rootId: "B1", perimeter: "Compte 512-B1" })).view;
    expect(indicator(v, "cycles")).toBe(m11.B1_rattachee.feuilles_verrouillees);
    expect(v.evaluation.sheets.find(s => s.rootId === "B2")!.assignment).toBe("a_rattacher");
  });

  it("M12 — source remplacée après verrouillage : travail courant périmé, version ancienne et export identifiés", async () => {
    const cash = source("cash", [sheet({ id: "B1", state: "locked", outcome: "no_exception_detected", population: ["512-B1"], importIds: ["imp-1"] })], [{ document_type: "cash_statement", import_id: "imp-1" }]);
    const h = createClosingHarness({ cycles: [cash] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "tresorerie", label: "Banque", assertions: ["solde_existence"], assessment: { level: "faible", rationale: "Un compte." } });
    let v = (await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "engine", engine: "cash.reconciliation", label: "Pont bancaire", owner: "C15" })).view;
    expect(proc(v, "P-02").status).toBe("cycle_verrouille");
    const before = v.projection.hash;
    cash.heads_[0].import_id = "imp-2";
    v = await h.view();
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_source_remplacee", done: false, engine: { retained: { runId: "B1", version: 4, state: "locked", sourcesCurrent: false } } });
    expect(v.evaluation.denominators.sheets.sourcesReplaced).toBe(1);
    expect(v.projection.hash).not.toBe(before);
    // L'export porte l'empreinte de l'état lu ; une empreinte antérieure est refusée (409), jamais réécrite.
    const ok = await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=json&snapshot=" + v.projection.hash));
    expect(ok.status).toBe(200);
    const exported = JSON.parse(await ok.text());
    expect(exported.projection.hash).toBe(v.projection.hash);
    expect((await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=json&snapshot=" + before))).status).toBe(409);
  });
});

describe("C15 · contexte d'exécution nommé dans les exports de mission", () => {
  it("le rapport HTML nomme le profil réel (personnel local, recette jetable) et jamais « recette jetable » par défaut", async () => {
    const f = await clientMissionFixture(), m = buildClientMission(f.scope, [f.run], f.imports, f.heads);
    const header = (html: string) => /<header><p>([^<]+)<\/p>/.exec(html)?.[1];
    expect(header(clientMissionHtml(m, f.run, "diagnostic", "2025-02-03T00:00:00Z", "personal_local"))).toBe("Procédures de mission · profil personnel local");
    expect(header(clientMissionHtml(m, f.run, "diagnostic", "2025-02-03T00:00:00Z", "disposable_recipe"))).toBe("Procédures de mission · recette jetable");
    expect(header(clientMissionHtml(m, f.run, "diagnostic", "2025-02-03T00:00:00Z"))).toBe("Procédures de mission · exécution serveur");
  });
});

describe("C15 · liens du registre des capacités", () => {
  // Chaque lien publié par le registre (routes de cycle, synthèses, modes, procédures, flux) mène à une page de l'application.
  const page = (href: string) => { const route = href.split(/[?#]/)[0]; return existsSync(path.join(process.cwd(), "app", ...route.split("/").filter(Boolean), "page.tsx")); };
  it("routes, synthèses, modes, procédures et flux existent comme pages", () => {
    const links = new Set<string>([
      ...CAPABILITY_REGISTRY.flatMap(c => [...c.routes, ...(c.synthesisRoute ? [c.synthesisRoute] : []), ...Object.values(c.modes).flatMap(m => "route" in m && m.route ? [m.route] : [])]),
      ...ENGINE_PROCEDURES.map(p => p.route), ...WORKFLOW_ROUTES.map(r => r.href), ...WORKSHOPS.map(w => w.route),
    ]);
    expect(links.size).toBeGreaterThan(20);
    expect([...links].filter(l => !page(l))).toEqual([]);
  });
});

it("formatCents garde le signe et le centime des attendus (garde de la lecture)", () => {
  expect(formatCents(cents(A.M1_clients_residus.residus_par_cle.C2))).toContain("10,00");
});
