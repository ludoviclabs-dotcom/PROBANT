import { describe, expect, it } from "vitest";
import { linearPlanEnd, recalculateLinearPlan, type DepreciationParameters } from "../fixed-assets";
import { evaluateFixedAssets, FA_RESULT_SCHEMA_VERSION, fixedAssetResultSchema, stampFixedAssetWork, type FixedAssetResult } from "../fixed-asset-review";
import { fixedAssetResultOf } from "../fixed-asset-mission";
import { assertFixedAssetBatch, FixedAssetSourceError } from "../fixed-asset-sources";
import type { WorkpaperRun } from "../model";
import { period, scope } from "./fixtures";
import { proof } from "./cutoff-fixtures";
import { FA_C06_CSV, faDraft, faPeriod, faPreparer, faScope, faSources } from "./fixed-asset-fixtures";
import { createFixedAssetHarness } from "./fixed-asset-harness";

/**
 * C06 — end of an unchanged linear plan. Expected values are computed by hand from PCG 2026 art. 214-4 (montant amortissable
 * = coût − valeur résiduelle), 214-12 (début à la mise en service) and 214-13 (répartition systématique), never read back from the engine.
 * Synthetic period of the engine tests: 01/07/2023 → 30/06/2024 (non-calendar on purpose).
 */
const context = { scope, period, purpose: "synthetic_technical" as const };
const eur = (amount: string, date = period.closingDate) => ({ amount: { amount, currency: "EUR" as const }, date, basis: "EUR", evidence: [proof] });
const method = { id: "SYN", version: "1", source: "fixture synthétique", from: period.startDate, to: period.closingDate, approvedBy: "SYN", synthetic: true as const };
const plan = (o: { cost?: string; residual?: string; prior?: string | null; priorDate?: string; inService: string; months?: number; n?: string; d?: string }): DepreciationParameters => ({
  method, kind: "linear", cost: eur(o.cost ?? "12000.00"), residual: eur(o.residual ?? "0.00"), priorAccumulated: o.prior === null ? null : eur(o.prior ?? "0.00", o.priorDate ?? period.startDate),
  inServiceDate: o.inService, durationMonths: o.months ?? 60, prorata: { numerator: o.n ?? "12", denominator: o.d ?? "12", evidence: [proof] }, rounding: "half_up_cent" });
const charge = (p: DepreciationParameters) => recalculateLinearPlan(context, p);

describe("C06 — moteur : base restante, fin de plan et dernier prorata", () => {
  it("reproduction : 12 000, résiduel 0, 60 mois, cumul d’ouverture 12 000 → dotation 0, pas 2 400", () => {
    // Plan échu le 30/06/2023 (mise en service 01/07/2018 + 60 mois − 1 jour), avant l’ouverture du 01/07/2023.
    const ended = charge(plan({ prior: "12000.00", inService: "2018-07-01" }));
    expect(ended.amount).toEqual({ kind: "known", value: { amount: "0.00", currency: "EUR" } });
    expect(ended.plan).toMatchObject({ end: "2023-06-30", ended: true, remaining: { amount: "0.00" }, annuity: { amount: "2400.00" }, capApplied: false, inconsistency: null });
    // Plan encore en cours mais déjà soldé : plafond au restant 0, incohérence signalée.
    const early = charge(plan({ prior: "12000.00", inService: "2020-07-01" }));
    expect(early.amount).toEqual({ kind: "known", value: { amount: "0.00", currency: "EUR" } });
    expect(early.plan).toMatchObject({ end: "2025-06-30", capApplied: true, inconsistency: { code: "FULLY_AMORTIZED_BEFORE_END" } });
  });
  it("fin du plan : début + durée en mois − 1 jour, jour manquant ramené au dernier jour du mois", () => {
    expect(linearPlanEnd("2019-07-01", 60)).toBe("2024-06-30");
    expect(linearPlanEnd("2024-04-01", 60)).toBe("2029-03-31");
    expect(linearPlanEnd("2020-01-31", 1)).toBe("2020-02-28");
  });
  it("actif neuf : mise en service 01/10/2023, 9/12 → 12 000 × 12 ÷ 60 × 9 ÷ 12 = 1 800", () => {
    const r = charge(plan({ inService: "2023-10-01", n: "9" }));
    expect(r.amount).toEqual({ kind: "known", value: { amount: "1800.00", currency: "EUR" } });
    expect(r.plan).toMatchObject({ startsInPeriod: true, endsInPeriod: false, remaining: { amount: "12000.00" }, capApplied: false });
  });
  it("dernière annuité partielle : cumul 10 800, fin 31/12/2023 ; 6/12 → 1 200 ; 12/12 → 2 400 plafonnée à 1 200", () => {
    const partial = charge(plan({ prior: "10800.00", inService: "2019-01-01", n: "6" }));
    expect(partial.amount).toEqual({ kind: "known", value: { amount: "1200.00", currency: "EUR" } });
    expect(partial.plan).toMatchObject({ end: "2023-12-31", endsInPeriod: true, capApplied: false });
    const full = charge(plan({ prior: "10800.00", inService: "2019-01-01" }));
    expect(full.amount).toEqual({ kind: "known", value: { amount: "1200.00", currency: "EUR" } });
    expect(full.plan).toMatchObject({ annuity: { amount: "2400.00" }, remaining: { amount: "1200.00" }, capApplied: true });
  });
  it("résiduel positif : coût 12 000, résiduel 2 000, cumul 5 500 → annuité 2 000, restant 4 500", () => {
    const r = charge(plan({ residual: "2000.00", prior: "5500.00", inService: "2020-10-01" }));
    expect(r.amount).toEqual({ kind: "known", value: { amount: "2000.00", currency: "EUR" } });
    expect(r.plan).toMatchObject({ amortizable: { amount: "10000.00" }, remaining: { amount: "4500.00" }, end: "2025-09-30" });
  });
  it("cumul invalide : supérieur au montant amortissable, ou non nul pour un plan qui commence dans l’exercice → dotation inconnue", () => {
    const above = charge(plan({ prior: "13000.00", inService: "2020-07-01" }));
    expect(above.amount.kind).toBe("unknown");
    expect(above.plan?.inconsistency).toMatchObject({ code: "ACCUMULATED_ABOVE_AMORTIZABLE", amount: { kind: "known", value: { amount: "1000.00" } } });
    const early = charge(plan({ prior: "500.00", inService: "2023-10-01", n: "9" }));
    expect(early.amount.kind).toBe("unknown");
    expect(early.plan?.inconsistency).toMatchObject({ code: "ACCUMULATED_BEFORE_START", amount: { kind: "known", value: { amount: "500.00" } } });
  });
  it("plan échu non soldé : dotation 0 sur l’exercice, reliquat 2 000 signalé, jamais rattrapé en silence", () => {
    const r = charge(plan({ prior: "10000.00", inService: "2018-07-01" }));
    expect(r.amount).toEqual({ kind: "known", value: { amount: "0.00", currency: "EUR" } });
    expect(r.plan?.inconsistency).toMatchObject({ code: "ENDED_NOT_FULLY_AMORTIZED", amount: { kind: "known", value: { amount: "2000.00" } } });
  });
  it("cumul inconnu ou mal daté, début post-clôture : inconnu, jamais zéro", () => {
    expect(charge(plan({ prior: null, inService: "2020-07-01" })).amount).toMatchObject({ kind: "unknown", reason: expect.stringContaining("cumul d’amortissement d’ouverture") });
    expect(charge(plan({ prior: "4800.00", priorDate: period.closingDate, inService: "2020-07-01" })).amount).toMatchObject({ kind: "unknown", reason: expect.stringContaining("non daté de l’ouverture") });
    expect(charge(plan({ inService: "2024-08-01" })).amount).toMatchObject({ kind: "unknown", reason: "Mise en service postérieure à clôture" });
  });
});

const RUN = "workpaper-fa-c06";
async function evaluateC06() {
  const imports = await faSources(FA_C06_CSV);
  const work = stampFixedAssetWork({ scope: faScope, period: faPeriod, runId: RUN, imports, draft: faDraft(), actor: faPreparer, at: "2025-04-02T10:00:00Z" });
  return evaluateFixedAssets(faScope, faPeriod, imports, RUN, work);
}
const unitOf = (r: FixedAssetResult, id: string) => r.units.find(u => u.unitId === id)!.recalculation;
const amount = (value: string) => ({ kind: "known", value: { amount: value, currency: "EUR" } });

describe("C06 — recette sur sources qualifiées (exercice 2024, méthode LIN-2024)", () => {
  it("plans inchangés : neuf, échu, dernière annuité, plafond, résiduel, composant", async () => {
    const r = await evaluateC06();
    expect(r.schemaVersion).toBe(FA_RESULT_SCHEMA_VERSION);
    const expected: Record<string, [string, string, string]> = {
      // unité : [dotation recalculée, dotation comptabilisée, écart comptabilisé − recalculé]
      "N-01": ["1800.00", "1800.00", "0.00"], "E-01": ["0.00", "2400.00", "2400.00"], "L-01": ["1200.00", "1200.00", "0.00"],
      "L-02": ["1200.00", "1200.00", "0.00"], "R-01": ["2000.00", "2000.00", "0.00"], "B-01/TOITURE": ["3000.00", "3000.00", "0.00"],
    };
    for (const [id, [recalculated, booked, difference]] of Object.entries(expected)) {
      const x = unitOf(r, id);
      expect(x.status, id).toBe("computed");
      expect([x.recalculated, x.booked, x.difference], id).toEqual([amount(recalculated), amount(booked), amount(difference)]);
      expect(x.plan?.state, id).toBe("unchanged");
    }
    expect(unitOf(r, "N-01").plan).toMatchObject({ segment: { start: "2024-04-01", end: "2029-03-31", origin: "in_service", methodId: "LIN-2024" }, priorAccumulated: { amount: "0.00" }, startsInPeriod: true });
    expect(unitOf(r, "E-01").plan).toMatchObject({ segment: { end: "2023-12-31" }, ended: true, priorAccumulated: { amount: "12000.00" }, remaining: { amount: "0.00" }, inconsistency: null });
    expect(unitOf(r, "E-01").reason).toContain("Plan échu le 2023-12-31");
    expect(unitOf(r, "L-01").plan).toMatchObject({ segment: { end: "2024-06-30" }, endsInPeriod: true, annuity: { amount: "1200.00" }, capApplied: false });
    expect(unitOf(r, "L-02").plan).toMatchObject({ annuity: { amount: "2400.00" }, remaining: { amount: "1200.00" }, capApplied: true });
    expect(unitOf(r, "L-02").reason).toBe("Dotation plafonnée au montant amortissable restant (1200.00 EUR) : dernière annuité du plan.");
    expect(unitOf(r, "R-01").plan).toMatchObject({ amortizable: { amount: "10000.00" }, remaining: { amount: "2500.00" }, segment: { end: "2025-03-31" } });
    // The register's opening line is the source of the prior accumulated amount.
    expect(r.units.find(u => u.unitId === "E-01")!.evidence.map(p => p.id)).toContain(unitOf(r, "E-01").plan!.priorAccumulatedProofId);
    expect(r.exceptions.filter(e => e.code === "RECALCULATION_DIFFERENCE").map(e => [e.unitId, e.amount])).toEqual([["E-01", amount("2400.00")]]);
  });
  it("cas isolés : cumul invalide, début post-clôture, plan révisé sans base validée, dépréciation, cession", async () => {
    const r = await evaluateC06();
    expect(unitOf(r, "I-01")).toMatchObject({ status: "blocked", recalculated: { kind: "unknown" }, plan: { state: "unchanged", inconsistency: { code: "ACCUMULATED_ABOVE_AMORTIZABLE" } } });
    expect(r.exceptions.filter(e => e.unitId === "I-01").map(e => [e.code, e.amount])).toEqual([["PLAN_ACCUMULATED_INCONSISTENT", amount("1000.00")]]);
    expect(unitOf(r, "P-01")).toMatchObject({ status: "not_applicable", reason: "Mise en service postérieure à clôture" });
    expect(unitOf(r, "M-01")).toMatchObject({ status: "blocked", plan: { state: "revised", segment: { start: "2024-01-01", origin: "declared_revision", end: null } } });
    expect(unitOf(r, "M-01").reason).toContain("montant amortissable restant à cette date non validé");
    expect(unitOf(r, "D-01")).toMatchObject({ status: "blocked", plan: { state: "impaired", remaining: null } });
    expect(unitOf(r, "D-01").reason).toContain("la VNC n’en tient pas lieu");
    expect(r.units.find(u => u.unitId === "D-01")!.vnc).toEqual(amount("3800.00"));
    expect(unitOf(r, "X-01")).toMatchObject({ status: "not_applicable", plan: null });
    expect(r.exceptions.filter(e => e.code === "RECALCULATION_BLOCKED").map(e => e.unitId).sort()).toEqual(["D-01", "M-01"]);
  });
  it("tableaux, cadrage et VNC inchangés : trois ponts par actif, registre = GL compte par compte", async () => {
    const r = await evaluateC06();
    expect(r.framing.rows.map(x => [x.account, x.difference])).toEqual([["2154", amount("0.00")], ["2315", amount("0.00")], ["28154", amount("0.00")], ["2915", amount("0.00")]]);
    expect(r.units.every(u => u.tables.gross.status === "computed" && u.tables.amortization.status === "computed" && u.tables.impairment.status === "computed")).toBe(true);
    expect(r.units.find(u => u.unitId === "E-01")!.vnc).toEqual(amount("-2400.00"));
    const recalculation = r.controls.find(c => c.id === "recalculation")!;
    expect([recalculation.outcome, recalculation.numerator, recalculation.denominator]).toEqual(["exceptions_detected", 6, 9]);
  });
  it("début de segment déclaré avant la mise en service : refusé à l’import avec son localisateur", async () => {
    const [batch] = await faSources({ fa_parameters: FA_C06_CSV.fa_parameters.replace(";LIN-2024;48;12;12;2024-01-01", ";LIN-2024;48;12;12;2021-12-31") }, ["fa_parameters"]);
    let refusal: unknown = null;
    try { assertFixedAssetBatch(batch, faPeriod); } catch (e) { refusal = e; }
    expect(refusal).toBeInstanceOf(FixedAssetSourceError);
    expect(refusal).toMatchObject({ code: "FA_SEGMENT_START_INVALID", locator: { row: 9, column: "debut_segment", value: "2021-12-31" } });
  });
  it("aucun seuil de 500 € ni durée par défaut : un paramètre vide reste « source requise »", async () => {
    const imports = await faSources({ ...FA_C06_CSV, fa_parameters: FA_C06_CSV.fa_parameters.replace("PN-01;0.00;2024-04-01;N-01;;LIN-2024;60;9;12;", "PN-01;0.00;2024-04-01;N-01;;LIN-2024;;9;12;") });
    const work = stampFixedAssetWork({ scope: faScope, period: faPeriod, runId: RUN, imports, draft: faDraft(), actor: faPreparer, at: "2025-04-02T10:00:00Z" });
    expect(unitOf(evaluateFixedAssets(faScope, faPeriod, imports, RUN, work), "N-01")).toMatchObject({ status: "blocked", reason: "SOURCE REQUISE : durée d’amortissement absente." });
  });
});

describe("C06 — nouvelle version de calcul : feuilles 1.0.0 consultables, résultats périmés, révision", () => {
  it("un résultat fixed-assets-result-1 reste lisible ; le contrat courant exige l’état du plan", async () => {
    const current = await evaluateC06();
    const legacy = { ...current, schemaVersion: "fixed-assets-result-1", units: current.units.map(u => { const { plan: _plan, ...recalculation } = u.recalculation; void _plan; return { ...u, recalculation }; }) };
    expect(fixedAssetResultSchema.safeParse(legacy).success).toBe(true);
    expect(fixedAssetResultSchema.safeParse({ ...legacy, schemaVersion: FA_RESULT_SCHEMA_VERSION }).success).toBe(false);
  });
  it("feuille établie en 1.0.0 : consultable, périmée dans la synthèse, exécution refusée, révision en 1.1.0", async () => {
    const h = createFixedAssetHarness();
    const { run } = await h.executed();
    // Shape a version stored before C06: rule 1.0.0 and a result without plan state.
    const list = Object.values(h.db.state.versions).map(v => v[run.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === Math.max(...list.map(x => x.version))), stored = list[index];
    const result = stored.result!.result as FixedAssetResult;
    const latest: WorkpaperRun = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
      result: { ...stored.result!, ruleVersion: "1.0.0", result: { ...result, schemaVersion: "fixed-assets-result-1", units: result.units.map(u => { const { plan: _plan, ...recalculation } = u.recalculation; void _plan; return { ...u, recalculation }; }) } } };
    list[index] = latest;
    const read = (await h.read()).body;
    expect(fixedAssetResultOf(read.runs.find((r: WorkpaperRun) => r.id === run.id))?.schemaVersion).toBe("fixed-assets-result-1");
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true);
    expect(mission.procedure.staleReasons.join(" ")).toMatch(/Règle Immobilisations 1\.0\.0 appliquée, programme 1\.1\.0 : résultat périmé/);
    // Controls keep the rule their outcome was computed with; the legacy result can neither advance nor be finalized.
    expect(mission.procedure.controls.map(c => c.ruleVersion)).toEqual(["1.0.0", "1.0.0", "1.0.0", "1.0.0"]);
    for (const command of [
      { command: "execute", id: run.id, expectedVersion: latest.version },
      { command: "conclude", id: run.id, expectedVersion: latest.version, text: "Conclusion sur un résultat 1.0.0" },
      { command: "note", id: run.id, expectedVersion: latest.version, note: { id: "legacy-note", kind: "observation", text: "x", amount: { kind: "not_applicable", reason: "x" }, blocking: false } },
      { command: "submit", id: run.id, expectedVersion: latest.version },
    ]) expect(await h.command(command), command.command).toMatchObject({ status: 409, body: { error: "FA_RULE_REPLACED_REVISION_REQUIRED" } });
    for (const command of [{ command: "review", id: run.id, expectedVersion: latest.version, decision: "approved", text: "x", submittedHash: "a".repeat(64) }, { command: "lock", id: run.id, expectedVersion: latest.version }])
      expect(await h.command(command, "reviewer"), command.command).toMatchObject({ status: 409, body: { error: "FA_RULE_REPLACED_REVISION_REQUIRED" } });
    let revised = await h.ok({ command: "revise", id: run.id, expectedVersion: latest.version });
    expect(revised.template).toMatchObject({ version: "1.1.0", rule: { version: "1.1.0" } });
    const heads = (await h.read()).body.sourceHeads as { import_id: string }[];
    revised = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: heads.map(x => x.import_id), draft: faDraft() });
    revised = await h.ok({ command: "execute", id: revised.id, expectedVersion: revised.version });
    expect(fixedAssetResultOf(revised)?.schemaVersion).toBe(FA_RESULT_SCHEMA_VERSION);
    const current = await h.mission();
    expect(current.procedure.stale).toBe(false);
    expect(current.procedure.controls.map(c => c.ruleVersion)).toEqual(["1.1.0", "1.1.0", "1.1.0", "1.1.0"]);
  });
});
