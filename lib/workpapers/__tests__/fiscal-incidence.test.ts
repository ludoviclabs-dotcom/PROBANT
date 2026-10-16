/**
 * C05 / C10 — base de l'incidence fiscale lue sur la feuille IS (route GET operation=incidence).
 *
 * Feuille de référence du harnais : résultat fiscal 71 800,00 €, société non éligible au taux réduit (capital non
 * entièrement libéré) → 71 800 × 25 % = 17 950 €. Ajustement +1 000 € qualifié déductible : 72 800 × 25 % = 18 200 €,
 * incidence +250 € (calcul à la main). Seule une feuille verrouillée, à jour et reproductible sert de base.
 */
import { describe, expect, it } from "vitest";
import { buildSynthesisSnapshot } from "@/lib/synthesis";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding } from "@/lib/synthesis/__tests__/fixtures";
import { corporateTaxIncidenceProvider } from "@/lib/tax/corporate-tax/scenario";
import type { CitResult } from "../fiscal-cit-contract";
import type { CitIncidenceBase } from "../fiscal-incidence";
import type { WorkpaperRun } from "../model";
import { citText, LIASSE_2058A } from "./fiscal-fixtures";
import { createFiscalHarness, type FiscalHarness } from "./fiscal-harness";

const incidence = async (h: FiscalHarness, session = "preparer") => (await h.read(session, "&operation=incidence"));
async function locked(h: FiscalHarness): Promise<WorkpaperRun> {
  let { run } = await h.citExecuted();
  run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Résultat cadré ; impôt du moteur égal à la charge comptabilisée." });
  run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
  run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante IS." }, "reviewer");
  return h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
}
const plusMille = () => makeDossierSnapshot({ findings: [makeFinding("adj", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxQualification: "deductible" }), lignesSource: [1] })] });

describe("C05 / C10 — base IS de l'incidence fiscale", () => {
  it("aucune feuille IS : indisponible, motif nommé", async () => {
    const h = createFiscalHarness();
    expect(await incidence(h)).toMatchObject({ status: 200, body: { status: "unavailable", reason: "Aucune feuille IS pour cet exercice : incidence fiscale inconnue.", sheet: null } });
  });

  it("feuille exécutée mais non verrouillée : indisponible, la revue n'a pas approuvé le calcul", async () => {
    const h = createFiscalHarness();
    const { run } = await h.citExecuted();
    const { body } = await incidence(h);
    expect(body).toMatchObject({ status: "unavailable", sheet: { runId: run.id, state: "executed" } });
    expect(body.reason).toMatch(/non verrouillée/);
  });

  it("feuille verrouillée : la base reproduit le calcul approuvé ; +1 000 € déductible donne +250 € dans la Synthèse", async () => {
    const h = createFiscalHarness();
    const run = await locked(h);
    const { status, body } = await incidence(h);
    expect(status).toBe(200);
    const base = body as Extract<CitIncidenceBase, { status: "available" }>;
    expect(base).toMatchObject({ status: "available", sheet: { runId: run.id, state: "locked", ruleVersion: "1.1.0", engineVersion: "tax-05-corporate-income-tax-1.1.0", snapshotHash: (run.result!.result as CitResult).engine.snapshotHash } });
    // Transport JSON comme pour le navigateur : la base relue suffit au moteur.
    const provider = corporateTaxIncidenceProvider(JSON.parse(JSON.stringify(base.input)));
    const synthesis = buildSynthesisSnapshot(plusMille(), { clock: CLOCK, taxIncidence: provider });
    expect(synthesis.exposure.tax).toMatchObject({ status: "known", knownCents: 25_000 });
    expect(synthesis.exposure.netByTarget.find((n) => n.target === "resultat")).toMatchObject({ netAfterKnownTaxCents: 75_000 });
    expect(synthesis.exposure.taxIncidence).toMatchObject({ provider: "c10_is_engine", computedFindingIds: ["adj"] });
  });

  it("liasse remplacée après verrouillage : indisponible, révision requise", async () => {
    const h = createFiscalHarness();
    await locked(h);
    await h.accept(await h.previewCit(citText({ ...LIASSE_2058A, WR: "17950,00", XI: "70800,00", XN: "70800,00" })));
    const { body } = await incidence(h);
    expect(body.status).toBe("unavailable");
    expect(body.reason).toMatch(/source de la feuille IS a été remplacée/);
  });

  it("feuille verrouillée sous la règle 1.0.0 : indisponible, révision en 1.1.0 requise", async () => {
    const h = createFiscalHarness();
    const run = await locked(h);
    const list = Object.values(h.db.state.versions).map((v) => v[run.id]).find(Boolean)!;
    const index = list.findIndex((v) => v.version === run.version);
    list[index] = { ...list[index], template: { ...list[index].template, version: "1.0.0", rule: { ...list[index].template.rule!, version: "1.0.0" } } };
    const { body } = await incidence(h);
    expect(body.reason).toBe("Feuille IS établie sous la règle 1.0.0 : une révision en 1.1.0 est requise.");
  });

  it("calcul non reproductible (empreinte approuvée différente) : indisponible, jamais une base approchée", async () => {
    const h = createFiscalHarness();
    const run = await locked(h);
    const list = Object.values(h.db.state.versions).map((v) => v[run.id]).find(Boolean)!;
    const index = list.findIndex((v) => v.version === run.version), stored = list[index], result = stored.result!.result as CitResult;
    list[index] = { ...stored, result: { ...stored.result!, result: { ...result, engine: { ...result.engine, snapshotHash: "0".repeat(64) } } } };
    const { body } = await incidence(h);
    expect(body.reason).toMatch(/ne se reproduit pas à l'identique/);
  });

  it("identité d'une autre organisation : lecture refusée, aucune base", async () => {
    const h = createFiscalHarness();
    await locked(h);
    const { status, body } = await incidence(h, "outsider");
    expect(status).toBeGreaterThanOrEqual(401);
    expect(body.status).toBeUndefined();
  });
});
