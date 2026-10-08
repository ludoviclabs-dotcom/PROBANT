import { beforeEach, describe, expect, it } from "vitest";
import { fixedAssetFailureStatus, requireDisposableFixedAssets } from "../fixed-asset-http";
import type { FixedAssetResult } from "../fixed-asset-review";
import type { WorkpaperRun } from "../model";
import { FA_CSV, faDraft, faPeriod, faScope, LINEAR_2024 } from "./fixed-asset-fixtures";
import { FA_DOSSIER, createFixedAssetHarness, type FixedAssetHarness } from "./fixed-asset-harness";

let h: FixedAssetHarness;
beforeEach(() => { h = createFixedAssetHarness(); });
const exportRequest = (session: string, body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/immobilisations/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: FA_DOSSIER, periodId: faScope.periodId, ...body }) });
const resultOf = (run: WorkpaperRun) => run.result!.result as FixedAssetResult;

describe("FA-1004 chaîne serveur : import → population figée → exécution → revue → verrouillage", () => {
  it("parcours complet : écart −1 expliqué par un traitement documenté, revue distincte, paquet approuvé", async () => {
    const { run: frozen } = await h.frozenRun();
    expect(frozen).toMatchObject({ state: "ready", population: { unit: "asset" } });
    expect(frozen.selection!.selectedIds).toEqual(["A-001", "A-002", "A-003", "A-004", "A-005"]);
    expect(frozen.selection!.exclusions).toEqual([{ id: "T-001", reason: expect.stringContaining("Actif réévalué") }]);
    expect(frozen.fixedAssetWork).toMatchObject({ convention: { version: "fa-sign-1", validatedBy: "preparer-fa" }, methods: [{ id: "LIN-2024", authorId: "preparer-fa" }] });
    let run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    expect(run.result!.outcome).toBe("exceptions_detected");
    const blocking = run.notes.filter(n => n.blocking);
    expect(blocking.map(n => n.kind + ":" + n.text.split(" — ")[0])).toEqual(["observation:Écart du pont des mouvements à expliquer", "missing_evidence:Recalcul bloqué : source ou paramètre requis", "missing_evidence:Recalcul bloqué : source ou paramètre requis"]);
    const movement = blocking[0];
    expect(movement.amount).toEqual({ kind: "known", value: { amount: "-1.00", currency: "EUR" } });
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: movement.id, text: "Écart −1,00 : mise au rebut d’un accessoire non saisie en sortie (PV R-17) ; écriture de régularisation proposée au client." });
    for (const n of run.notes.filter(x => x.blocking && !x.resolution)) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Paramètres demandés au client ; recalcul non concluant pour cet actif." });
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Ponts calculés ; écart −1 expliqué ; recalcul partiel (2 actifs bloqués). Aucune conclusion sur la valeur ni l’existence physique." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-approbation" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue des ponts, des pièces et du recalcul : traitements documentés." }, "reviewer");
    let mission = await h.mission();
    expect(await h.json(await h.handlers.exportPOST(exportRequest("preparer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash })))).toMatchObject({ status: 422, body: { error: "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED" } });
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    mission = await h.mission("reviewer");
    expect(mission.counters).toMatchObject({ planned: 1, plannedParts: 4, executed: 1, reviewed: 1, locked: 1, stale: 0, exceptions: 1, uncertainties: 2 });
    const exported = await h.handlers.exportPOST(exportRequest("reviewer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash }));
    expect(exported.status).toBe(200); expect(exported.headers.get("X-Probant-Snapshot")).toBe(mission.hash);
    const html = await exported.text();
    for (const text of ["Paquet Immobilisations approuvé", "pas une conclusion de valeur", "Aucune conclusion d’existence physique", "-1.00 EUR", "PV R-17", "Valeur résiduelle 50.00 EUR supérieure au coût 45.00 EUR"]) expect(html).toContain(text);
    const csv = await (await h.handlers.exportPOST(exportRequest("reviewer", { id: run.id, version: run.version, kind: "approved", format: "exceptions_csv", expectedSnapshotHash: mission.hash }))).text();
    expect(csv).toContain("MOVEMENT_DIFFERENCE"); expect(csv).toContain("RECALCULATION_BLOCKED");
  }, 60_000);
  it("source manquante bloquante : sans GL, le gel est refusé ; sources affichées obsolètes refusées", async () => {
    const ids = await h.importAll({}, ["fa_register", "fa_parameters", "fa_support"]);
    const run = await h.ok({ command: "create", period: faPeriod });
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft: faDraft() })).toMatchObject({ status: 422, body: { error: "FA_SOURCES_REQUIRED" } });
    const view = (await h.read()).body;
    expect(view.facts[run.id]).toBeNull();
    const ledger = await h.importSource("fa_ledger");
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft: faDraft() })).toMatchObject({ status: 422, body: { error: "FA_CURRENT_SOURCES_REQUIRED" } });
    expect((await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: [...Object.values(ids), ledger.id], draft: faDraft() })).state).toBe("ready");
  });
  it("refuse les sources invalides avec code et localisateur ; actif inconnu refusé au gel", async () => {
    expect(await h.preview("fa_register", FA_CSV.fa_register.replace("L02;20.00", "L02;-20.00"))).toMatchObject({ status: 422, body: { error: "FA_MOVEMENT_SIGN_INVALID", locator: { row: 3, column: "montant" } } });
    expect(await h.preview("fa_register", FA_CSV.fa_register.replace("L18;30.00;2024-01-01;A-003;;Logiciels;brut;ouverture;en_service;2051;standard", "L18;30.00;2024-01-01;A-003;;Logiciels;brut;ouverture;en_service;2051;leasing"))).toMatchObject({ status: 422, body: { error: "FA_TREATMENT_INVALID", locator: { row: 19, column: "traitement", value: "leasing" } } });
    const ids = await h.importAll({ fa_parameters: FA_CSV.fa_parameters + "\nP-999;0.00;2020-01-01;Z-999;;LIN-2024;60;12;12" });
    const run = await h.ok({ command: "create", period: faPeriod });
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft: faDraft() })).toMatchObject({ status: 422, body: { error: "FA_ASSET_UNKNOWN", locator: { row: 6, value: "Z-999" } } });
    expect((await h.read()).body.factsIssues[run.id]).toMatchObject({ code: "FA_ASSET_UNKNOWN" });
  });
  it("aucune autorité du navigateur : auteur de méthode, rôle ou approbation transmis sont refusés", async () => {
    const { run } = await h.frozenRun();
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { methods: [{ ...LINEAR_2024, authorId: "forged" }] } })).status).toBe(400);
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: faDraft(), actorId: "forged" })).status).toBe(400);
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: "a".repeat(64), text: "x", role: "reviewer" })).status).toBe(400);
    expect(await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { methods: [LINEAR_2024, LINEAR_2024] } })).toMatchObject({ status: 422, body: { error: "FA_METHOD_DUPLICATE" } });
  });
  it("changement de méthode : résultat retiré, nouvelle exécution exigée, comparaison versionnée affichée", async () => {
    const { run: executed } = await h.executed();
    let run = await h.ok({ command: "configure", id: executed.id, expectedVersion: executed.version, draft: faDraft({ methods: [{ ...LINEAR_2024, version: "2", kind: "not_covered", label: "Méthode par unités d’œuvre (non couverte)" }] }) });
    expect(run.result).toBeUndefined(); expect(run.state).toBe("ready");
    let view = (await h.read()).body;
    expect(view.pendingChanges[run.id]).toMatchObject({ from: { version: executed.version }, methods: ["LIN-2024"] });
    expect(view.comparisons[run.id]).toBeNull();
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    view = (await h.read()).body;
    const rows = view.comparisons[run.id].rows as { unitId: string; before: { status: string }; after: { status: string } }[];
    expect(view.comparisons[run.id].from.version).toBe(executed.version);
    expect(rows.map(r => r.unitId + ":" + r.before.status + "→" + r.after.status)).toEqual(["A-002:computed→excluded", "A-004:not_applicable→excluded", "A-005:blocked→excluded"]);
    expect(view.pendingChanges[run.id]).toBeNull();
  });
  it("source remplacée : travail périmé, commande refusée, révision puis comparaison entre révisions", async () => {
    const { run } = await h.executed();
    await h.importSource("fa_parameters", FA_CSV.fa_parameters.replace("P-002;0.00;2022-01-01;A-002;;LIN-2024;60", "P-002;0.00;2022-01-01;A-002;;LIN-2024;48"));
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).toMatchObject({ status: 409, body: { error: "FA_SOURCE_REPLACED_REVISION_REQUIRED" } });
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true); expect(mission.procedure.staleReasons.join(" ")).toMatch(/source Immobilisations approuvée a été remplacée/);
    expect((await h.handlers.exportPOST(exportRequest("preparer", { id: run.id, version: run.version, kind: "diagnostic", format: "json", expectedSnapshotHash: mission.hash }))).status).toBe(200);
    let revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ id: run.rootId + ":r2", revision: 2, state: "draft", importIds: [] }); expect(revised.fixedAssetWork).toBeUndefined();
    const heads = (await h.read()).body.sourceHeads as { import_id: string }[];
    revised = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: heads.map(x => x.import_id), draft: faDraft() });
    revised = await h.ok({ command: "execute", id: revised.id, expectedVersion: revised.version });
    expect(resultOf(revised).units.find(u => u.unitId === "A-002")!.recalculation.recalculated).toEqual({ kind: "known", value: { amount: "15.00", currency: "EUR" } });
    const view = (await h.read()).body;
    expect(view.comparisons[revised.id]).toMatchObject({ from: { id: run.id, revision: 1 }, to: { id: revised.id, revision: 2 }, rows: [{ unitId: "A-002", change: { kind: "known", value: { amount: "3.00" } } }] });
    const history = (await h.read("preparer", "&operation=history&id=" + encodeURIComponent(run.id))).body.history as WorkpaperRun[];
    expect(resultOf(history.at(-1)!).units.find(u => u.unitId === "A-002")!.recalculation.recalculated).toEqual({ kind: "known", value: { amount: "12.00", currency: "EUR" } });
  });
  it("idempotence, conflit de version, session expirée, accès transversal et reprise par un nouveau runtime", async () => {
    const created = await h.command({ command: "create", period: faPeriod }, "preparer", "same-key-fa-0001");
    expect(await h.command({ command: "create", period: faPeriod }, "preparer", "same-key-fa-0001")).toEqual(created);
    expect((await h.command({ command: "conclude", id: created.body.run.id, expectedVersion: 1, text: "x" }, "preparer", "same-key-fa-0001")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    const run = created.body.run as WorkpaperRun;
    await h.ok({ command: "conclude", id: run.id, expectedVersion: 1, text: "Première conclusion" });
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: 1, text: "Concurrente" })).toMatchObject({ status: 409, body: { error: "STALE_WORKPAPER_VERSION", current: { version: 2 } } });
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: 2, text: "x" }, "expired")).status).toBe(401);
    expect((await h.json(await h.handlers.GET(h.request("outsider")))).status).toBe(403);
    h.restart();
    expect((await h.read()).body.runs[0]).toMatchObject({ id: run.id, version: 2 });
  });
});
describe("FA-1005 activation et codes d’erreur", () => {
  it("reste fermé hors recette jetable et en production", () => {
    expect(() => requireDisposableFixedAssets({})).toThrow(); expect(() => requireDisposableFixedAssets({ PROBANT_FIXED_ASSETS_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableFixedAssets({ PROBANT_FIXED_ASSETS_DURABLE: "disposable", VERCEL_ENV: "preview" })).not.toThrow();
    expect(() => requireDisposableFixedAssets({ PROBANT_CASH_DURABLE: "disposable" })).toThrow();
  });
  it("traduit les refus métier en 422, les conflits en 409, sans masquer une panne", () => {
    expect([fixedAssetFailureStatus("FA_SOURCES_REQUIRED"), fixedAssetFailureStatus("FA_ASSET_UNKNOWN"), fixedAssetFailureStatus("DEPRECIATION_PARAMETERS_INVALID")]).toEqual([422, 422, 422]);
    expect([fixedAssetFailureStatus("STALE_WORKPAPER_VERSION"), fixedAssetFailureStatus("FA_SOURCE_REPLACED_REVISION_REQUIRED"), fixedAssetFailureStatus("SELF_APPROVAL_FORBIDDEN"), fixedAssetFailureStatus("TypeError: x")]).toEqual([409, 409, 403, 503]);
  });
});
