import { beforeEach, describe, expect, it } from "vitest";
import type { CitResult } from "../fiscal-cit-contract";
import type { WorkpaperRun } from "../model";
import { CA3_T2, citText, fxPeriod, fxScope, LIASSE_2058A, T2 } from "./fiscal-fixtures";
import { createFiscalHarness, FX_DOSSIER, type FiscalHarness } from "./fiscal-harness";

let h: FiscalHarness;
beforeEach(() => { h = createFiscalHarness(); });
const resultOf = (run: WorkpaperRun) => run.result!.result as CitResult;
const exportRequest = (session: string, body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/fiscal/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: FX_DOSSIER, periodId: fxScope.periodId, ...body }) });

describe("FX-1311 chaîne serveur IS : exercice → sources → population → moteur TAX-05 → revue distincte → verrouillage", () => {
  it("parcours complet de l’exercice 2026 : résultat cadré, pont documenté, impôt du moteur, revue par une autre identité", async () => {
    const sources = await h.importCit();
    let run = await h.createCit();
    expect(run).toMatchObject({ template: { id: "is.computation" }, fiscalWork: { tax: "cit", period: { startDate: "2026-01-01", endDate: "2026-12-31" }, frequency: "annual" } });
    // The IS run depends on the FEC, its own return forms and the supporting pieces, never on the VAT returns.
    const expected = await h.expected(run.id);
    expect([...expected].sort()).toEqual([sources.fec.id, sources.liasse.id, sources.d2065.id, sources.support.id].sort());
    run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: expected, draft: await h.citDraft(sources) });
    expect(run).toMatchObject({ state: "ready", population: { unit: "result_entry" }, fiscalWork: { profile: { status: "confirmed" }, resultBasis: "after_tax" } });
    expect(run.selection!.exclusions).toEqual([]);
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    const r = resultOf(run);
    expect(run.result!.outcome).toBe("no_exception_detected");
    expect(r).toMatchObject({ framing: { status: "framed", differenceCents: 0 }, bridge: { residualCents: 0 }, computation: { grossTaxCents: 1795000 } });
    expect(run.notes).toEqual([]);
    expect(run.evidence.some(e => e.purpose === "2058-A-SD case WA lue par le moteur IS")).toBe(true);
    expect(run.evidence.some(e => e.purpose === "Retraitement AMENDE — pièce citée")).toBe(true);
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Résultat cadré ; retraitements documentés ; impôt du moteur égal à la charge comptabilisée ; aucune liquidation." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante IS." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    const mission = await h.mission("preparer", "&rootId=" + run.rootId);
    expect(mission.periods).toEqual([expect.objectContaining({ tax: "cit", label: "IS · Exercice 01/01/2026 → 31/12/2026", state: "locked" })]);
    expect(mission.procedure).toMatchObject({ tax: "cit", resultLabel: "Aucun écart sur le périmètre testé — aucune liquidation ni conformité déclarée" });
    const html = await (await h.handlers.exportPOST(exportRequest("reviewer", { rootId: run.rootId, kind: "approved", format: "html", expectedSnapshotHash: mission.hash }))).text();
    expect(html).toContain("Paquet IS approuvé et verrouillé");
    expect(html).toContain("Pont fiscal documenté (base après impôt)");
  });
  it("TVA et IS cohabitent : une déclaration de TVA ne périme pas l’IS, une liasse corrigée le périme", async () => {
    const { run } = await h.citExecuted();
    await h.accept(await h.previewReturn(T2, CA3_T2));
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(true);
    await h.accept(await h.previewCit(citText({ ...LIASSE_2058A, WR: "17950,00", XI: "70800,00", XN: "70800,00" })));
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(false);
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).body.error).toBe("FX_SOURCE_REPLACED_REVISION_REQUIRED");
  });
  it("double ajustement d’IS refusé par le serveur ; base avant impôt cohérente acceptée", async () => {
    const sources = await h.importCit();
    let run = await h.createCit();
    const d = await h.citDraft(sources);
    const refused = await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: await h.expected(run.id), draft: { ...d, resultBasis: "before_tax" } });
    expect(refused).toMatchObject({ status: 422, body: { error: "FX_CIT_DOUBLE_TAX_ADJUSTMENT" } });
    run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: await h.expected(run.id), draft: { ...d, resultBasis: "before_tax", adjustments: d.adjustments.filter(a => a.id !== "IS") } });
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    expect(resultOf(run).bridge).toMatchObject({ basis: "before_tax", startCents: 7080000, residualCents: 0 });
  });
  it("identité de la feuille IS : exercice entier seulement, doublon refusé, liasse jamais déposée comme déclaration de TVA", async () => {
    await h.createCit();
    expect((await h.command({ command: "create", period: fxPeriod, tax: "cit", formVintage: 2026 })).status).toBe(409);
    expect((await h.command({ command: "create", period: fxPeriod, tax: "cit", declarativePeriod: T2, formVintage: 2026 })).body.error).toBe("FX_CIT_PERIOD_IS_THE_EXERCISE");
    expect((await h.command({ command: "create", period: fxPeriod, tax: "vat", formVintage: 2026 })).body.error).toBe("FX_DECLARATIVE_PERIOD_REQUIRED");
    expect((await h.previewCit(citText(LIASSE_2058A), "liasse_2050_2059", "fx_vat_return")).body.error).toBe("FX_DECLARATION_TYPE_MISMATCH");
  });
  it("profil non confirmé : moteur bloqué, notes d’incertitude, Synthèse « moteur bloqué »", async () => {
    const { run } = await h.citExecuted({ profile: { regime: "unknown", groupStatus: "unknown", turnoverCents: null, capitalPaid: "unknown", ownershipBasisPoints: null, siren: null, evidence: null } });
    expect(run.result!.outcome).toBe("inconclusive");
    expect(run.notes.map(n => n.id)).toEqual(expect.arrayContaining(["fx-exception:ENGINE:BLOCKED", "fx-exception:PROFILE"]));
    expect(run.notes.every(n => n.kind === "missing_evidence")).toBe(true);
    expect((await h.mission("preparer", "&rootId=" + run.rootId)).procedure.resultLabel).toBe("Moteur bloqué — règles ou profil requis");
  });
});
