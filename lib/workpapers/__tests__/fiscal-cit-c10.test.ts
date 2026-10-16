import { describe, expect, it } from "vitest";
import { computeCorporateTax } from "@/lib/tax";
import { coherentLiasse, computationInput, eligibleProfile, euros, period as taxPeriod } from "@/lib/tax/corporate-tax/__tests__/fixtures";
import { CIT_RESULT_SCHEMA_VERSION, citResultSchema, type CitResult } from "../fiscal-cit-contract";
import { CIT_RULE } from "../fiscal-adapter";
import { blockedRules } from "../fiscal-rules";
import type { WorkpaperRun } from "../model";
import { createFiscalHarness } from "./fiscal-harness";

/** Shape a result as written before C10: no rounding fields, contract v1. */
function legacyOf(result: CitResult): CitResult {
  const computation = result.computation ? (({ taxableProfitBeforeRoundingCents: _b, liquidatedTaxCents: _l, ...rest }) => { void _b; void _l; return rest; })(result.computation) : null;
  return { ...result, schemaVersion: "fiscal-cit-result-1", engine: { ...result.engine, version: "tax-05-corporate-income-tax-1.0.0" }, computation };
}

describe("C10 — feuille IS : règle 1.1.0, résultat fiscal-cit-result-2, arrondis légaux", () => {
  it("une exécution écrit le contrat v2 avec la base avant / après arrondi et l’impôt arrondi à l’euro", async () => {
    const h = createFiscalHarness();
    const { run } = await h.citExecuted();
    expect(run.template).toMatchObject({ version: "1.1.0", rule: { version: CIT_RULE.version } });
    const r = run.result!.result as CitResult;
    expect(r.schemaVersion).toBe(CIT_RESULT_SCHEMA_VERSION);
    expect(r.engine.version).toBe("tax-05-corporate-income-tax-1.1.0");
    // Cas de référence de la feuille : base 71 800,00 EUR entière, 25 % = 17 950,00 EUR ; aucun arrondi ne la modifie.
    expect(r.computation).toMatchObject({ taxableProfitBeforeRoundingCents: 7_180_000, taxableBaseCents: 7_180_000, grossTaxCents: 1_795_000, liquidatedTaxCents: 1_795_000 });
  });

  it("un résultat fiscal-cit-result-1 reste lisible ; le contrat v2 exige les deux arrondis", async () => {
    const h = createFiscalHarness();
    const { run } = await h.citExecuted();
    const current = run.result!.result as CitResult, legacy = legacyOf(current);
    expect(citResultSchema.safeParse(legacy).success).toBe(true);
    expect(citResultSchema.safeParse({ ...legacy, schemaVersion: CIT_RESULT_SCHEMA_VERSION }).success).toBe(false);
    expect(citResultSchema.safeParse({ ...current, schemaVersion: "fiscal-cit-result-1" }).success).toBe(false);
    expect(citResultSchema.safeParse({ ...current, computation: { ...current.computation!, liquidatedTaxCents: 1_795_025 } }).success).toBe(false);
  });

  it("feuille établie en 1.0.0 : consultable, périmée, rien ne l’avance sans révision ; la révision adopte 1.1.0", async () => {
    const h = createFiscalHarness();
    const { sources, run } = await h.citExecuted();
    const list = Object.values(h.db.state.versions).map(v => v[run.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === Math.max(...list.map(x => x.version))), stored = list[index];
    const legacy: WorkpaperRun = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
      result: { ...stored.result!, ruleVersion: "1.0.0", result: legacyOf(stored.result!.result as CitResult) } };
    list[index] = legacy;
    const read = (await h.read()).body;
    expect(((read.runs as WorkpaperRun[]).find(r => r.id === run.id)!.result!.result as CitResult).schemaVersion).toBe("fiscal-cit-result-1");
    const mission = await h.mission("preparer", "&rootId=" + run.rootId);
    expect(mission.procedure.stale).toBe(true);
    expect(mission.procedure.staleReasons).toContain("La version de règle diffère du programme.");
    for (const command of [
      { command: "execute", id: run.id, expectedVersion: legacy.version },
      { command: "conclude", id: run.id, expectedVersion: legacy.version, text: "Conclusion sur un résultat 1.0.0" },
      { command: "submit", id: run.id, expectedVersion: legacy.version },
    ]) expect(await h.command(command), command.command).toMatchObject({ status: 409, body: { error: "FX_RULE_REPLACED_REVISION_REQUIRED" } });
    for (const command of [{ command: "review", id: run.id, expectedVersion: legacy.version, decision: "approved", text: "x", submittedHash: "a".repeat(64) }, { command: "lock", id: run.id, expectedVersion: legacy.version }])
      expect(await h.command(command, "reviewer"), command.command).toMatchObject({ status: 409, body: { error: "FX_RULE_REPLACED_REVISION_REQUIRED" } });
    let revised = await h.ok({ command: "revise", id: run.id, expectedVersion: legacy.version });
    expect(revised.template).toMatchObject({ version: "1.1.0", rule: { version: "1.1.0" } });
    revised = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: await h.expected(revised.id), draft: await h.citDraft(sources) });
    revised = await h.ok({ command: "execute", id: revised.id, expectedVersion: revised.version });
    expect((revised.result!.result as CitResult).schemaVersion).toBe(CIT_RESULT_SCHEMA_VERSION);
    expect((await h.mission("preparer", "&rootId=" + revised.rootId)).procedure.stale).toBe(false);
  });

  it("exercice de 18 mois : la règle bloquée nomme le périmètre de durée et ses sources, sans plafond annuel", () => {
    const p = { startDate: "2026-01-01", endDate: "2027-06-30" };
    const { snapshot } = computeCorporateTax(computationInput({ profile: eligibleProfile({ accountingPeriod: p }), period: taxPeriod(p), documentSnapshots: [coherentLiasse({ accountingProfitCents: euros(50_000) })] }));
    const rule = blockedRules("corporate_income_tax", snapshot.limitations, { start: p.startDate, end: p.endDate, fiscalYear: 2026, formVintage: 2026, formNumber: "2058-A-SD" })
      .find(r => r.code === "NON_ANNUAL_PERIOD_NOT_SUPPORTED");
    expect(rule).toMatchObject({ category: "scope", label: "Exercice d’une durée différente de douze mois", resolvability: "future_engine" });
    expect(rule!.sources.map(s => s.sourceId)).toEqual(["cgi-art-219", "bofip-is-liq-20-20", "bofip-is-liq-20-10"]);
    expect(rule!.requiredSource).toContain("aucun plafond annuel n’est appliqué");
  });
});
