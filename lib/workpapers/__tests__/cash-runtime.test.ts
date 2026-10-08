import { beforeEach, describe, expect, it } from "vitest";
import { cashFailureStatus, requireDisposableCash } from "../cash-http";
import type { CashResult } from "../cash-reconciliation";
import type { WorkpaperRun } from "../model";
import { CASH_CSV, cashPeriod, cashScope } from "./cash-reconciliation-fixtures";
import { CASH_DOSSIER, createCashHarness, type CashHarness } from "./cash-harness";

let h: CashHarness;
beforeEach(() => { h = createCashHarness(); });
const exportRequest = (session: string, body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/cash/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: CASH_DOSSIER, periodId: cashScope.periodId, ...body }) });

describe("CASH-904 chaîne serveur : import → population figée → exécution → revue → verrouillage", () => {
  it("parcours nominal : 90 + 15 − 5 = 100, suspens 5 ouvert, revue distincte et paquet approuvé", async () => {
    const { ids, run: frozen } = await h.frozenRun();
    expect(frozen).toMatchObject({ state: "ready", population: { unit: "account" } });
    expect(frozen.selection!.selectedIds).toHaveLength(1);
    expect(frozen.selection!.exclusions.map(e => e.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/Devise du compte non gérée/), expect.stringMatching(/Caisse/), expect.stringMatching(/VMP/)]));
    expect(frozen.cashWork!.convention.validatedBy).toBe("preparer-cash");
    let run = await h.ok({ command: "configure", id: frozen.id, expectedVersion: frozen.version, draft: h.draft(ids) });
    expect(run.cashWork!.allocations[0]).toMatchObject({ authorId: "preparer-cash" });
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    const result = run.result!.result as CashResult;
    expect(run.result!.outcome).toBe("exceptions_detected");
    expect(result.accounts[0].bridge).toMatchObject({ status: "computed", statement: { amount: { amount: "90.00" } }, reconstructed: { amount: "100.00" }, difference: { amount: "0.00" } });
    expect(result.accounts[0].items.map(i => [i.itemId, i.status])).toEqual([["R1", "cleared"], ["P1", "open"]]);
    expect(run.notes.filter(n => n.blocking).map(n => n.text)).toEqual([expect.stringMatching(/^Suspens ouvert à expliquer — Suspens P1/)]);
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Pont concordant ; le chèque 1045 (5 EUR) reste non débité au 28/02 : relance documentée." });
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: run.notes[0].id, text: "Chèque remis au fournisseur, débit attendu en mars ; aucune anomalie validée." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-approbation" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue du pont et des suspens : traitement documenté." }, "reviewer");
    let mission = await h.mission();
    expect(await h.json(await h.handlers.exportPOST(exportRequest("preparer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash })))).toMatchObject({ status: 422, body: { error: "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED" } });
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    expect(run.state).toBe("locked");
    mission = await h.mission("reviewer");
    expect(mission.counters).toMatchObject({ planned: 1, plannedParts: 3, executed: 1, reviewed: 1, locked: 1, stale: 0, exceptions: 1 });
    expect(mission.procedure.cash!.exceptions.map(e => e.code)).toEqual(["SUSPENSE_OPEN"]);
    const exported = await h.handlers.exportPOST(exportRequest("reviewer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash }));
    expect(exported.status).toBe(200); expect(exported.headers.get("X-Probant-Snapshot")).toBe(mission.hash);
    const html = await exported.text();
    expect(html).toContain("Paquet du pont bancaire approuvé"); expect(html).toContain("aucune assurance d’authenticité"); expect(html).toContain("Ouvert — Suspens expliqué par l’ERB"); expect(html).toContain("100.00 EUR");
  });
  it("refuse les sources qualifiées invalides avec code et localisateur : devise, signe, mauvaise banque", async () => {
    expect(await h.preview("cash_statement", CASH_CSV.cash_statement.replace("FR76-0001;EUR", "FR76-0001;USD"))).toMatchObject({ status: 422, body: { error: "CASH_CURRENCY_UNSUPPORTED", locator: { row: 2, column: "devise", value: "USD" } } });
    expect(await h.preview("cash_erb", CASH_CSV.cash_erb.replace("R1;15.00", "R1;-15.00"))).toMatchObject({ status: 422, body: { error: "CASH_ITEM_SIGN_INCONSISTENT", locator: { row: 4 } } });
    const ids = await h.importAll({ cash_settlements: CASH_CSV.cash_settlements + "\nS9;20.00;2025-01-12;BNK-Z;FR76-0009;EUR;Virement autre banque;VIR-9" });
    const run = await h.ok({ command: "create", period: cashPeriod });
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), window: h.documented(ids.cash_settlements) })).toMatchObject({ status: 422, body: { error: "CASH_ACCOUNT_UNKNOWN", locator: { row: 4, value: "BNK-Z / FR76-0009" } } });
    expect((await h.read()).body.factsIssues[run.id]).toMatchObject({ code: "CASH_ACCOUNT_UNKNOWN" });
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids).slice(0, 3), window: h.documented(ids.cash_settlements) })).toMatchObject({ status: 422, body: { error: "CASH_CURRENT_SOURCES_REQUIRED" } });
  });
  it("refuse la double allocation ; la fenêtre incomplète laisse les suspens non testés", async () => {
    const { ids, run } = await h.frozenRun({ cash_erb: CASH_CSV.cash_erb + "\nR2;15.00;2024-12-30;BNK-A;FR76-0001;EUR;remise_non_creditee;Seconde remise;BRD-1231" });
    const twice = h.draft(ids, { allocations: [{ id: "A1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }, { id: "A2", itemId: "R2", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }] });
    expect(await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: twice })).toMatchObject({ status: 422, body: { error: "CASH_OVERALLOCATION" } });
    let next = await h.ok({ command: "configure", id: run.id, expectedVersion: run.version, draft: h.draft(ids, { window: { ...h.documented(ids.cash_settlements), coverage: "incomplete", evidenceImportIds: [] }, allocations: [] }) });
    next = await h.ok({ command: "execute", id: next.id, expectedVersion: next.version });
    const result = next.result!.result as CashResult;
    expect(result.accounts[0].items.every(i => i.status === "not_tested")).toBe(true);
    expect(result.controls.find(c => c.id === "clearance")).toMatchObject({ outcome: "inconclusive", numerator: 0, denominator: 3 });
    expect(next.notes.find(n => n.kind === "missing_evidence")!.text).toMatch(/^Fenêtre d’apurement incomplète/);
  });
  it("aucune autorité du navigateur : rôle, auteur ou approbation transmis sont refusés", async () => {
    const { ids, run } = await h.frozenRun();
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: h.draft(ids), actorId: "forged" })).status).toBe(400);
    const forged = h.draft(ids); (forged.allocations[0] as Record<string, unknown>).authorId = "forged";
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: forged })).status).toBe(400);
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: "a".repeat(64), text: "x", role: "reviewer" })).status).toBe(400);
  });
  it("idempotence, conflit de version, session expirée et accès transversal", async () => {
    const created = await h.command({ command: "create", period: cashPeriod }, "preparer", "same-key-0001");
    expect(await h.command({ command: "create", period: cashPeriod }, "preparer", "same-key-0001")).toEqual(created);
    expect((await h.command({ command: "conclude", id: created.body.run.id, expectedVersion: 1, text: "x" }, "preparer", "same-key-0001")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await h.command({ command: "create", period: cashPeriod })).status).toBe(409);
    const run = created.body.run as WorkpaperRun;
    await h.ok({ command: "conclude", id: run.id, expectedVersion: 1, text: "Première conclusion" });
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: 1, text: "Conclusion concurrente" })).toMatchObject({ status: 409, body: { error: "STALE_WORKPAPER_VERSION", expectedVersion: 1, current: { version: 2, conclusion: "Première conclusion" } } });
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: 2, text: "x" }, "expired")).status).toBe(401);
    expect((await h.json(await h.handlers.GET(h.request("outsider")))).status).toBe(403);
    expect((await h.json(await h.handlers.GET(h.request("nobody")))).status).toBe(401);
  });
  it("source remplacée : travail périmé, commande refusée, diagnostic permis, ancienne décision intacte, révision possible", async () => {
    const { run } = await h.executed();
    await h.importSource("cash_statement", CASH_CSV.cash_statement.replace("REL-A-1231;90.00", "REL-A-1231B;90.00"));
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).toMatchObject({ status: 409, body: { error: "CASH_SOURCE_REPLACED_REVISION_REQUIRED" } });
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true); expect(mission.procedure.staleReasons.join(" ")).toMatch(/source Trésorerie approuvée a été remplacée/);
    expect((await h.handlers.exportPOST(exportRequest("preparer", { id: run.id, version: run.version, kind: "diagnostic", format: "json", expectedSnapshotHash: mission.hash }))).status).toBe(200);
    expect(await h.json(await h.handlers.exportPOST(exportRequest("preparer", { id: run.id, version: run.version, kind: "diagnostic", format: "json", expectedSnapshotHash: "0".repeat(64) })))).toMatchObject({ status: 409, body: { error: "EXPORT_SNAPSHOT_CONFLICT" } });
    const revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ id: run.rootId + ":r2", revision: 2, state: "draft", importIds: [] }); expect(revised.cashWork).toBeUndefined();
    const history = (await h.read("preparer", "&operation=history&id=" + encodeURIComponent(run.id))).body.history as WorkpaperRun[];
    expect(history.at(-1)!.result!.outcome).toBe("exceptions_detected");
  });
  it("l’état vit dans le stockage, pas dans l’instance : un nouveau runtime reprend versions et sources", async () => {
    const { run } = await h.frozenRun();
    h.restart();
    const view = (await h.read()).body;
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "ready" }); expect(view.sourceHeads).toHaveLength(5);
    expect(view.facts[run.id].accounts[0].items.map((i: { itemId: string }) => i.itemId)).toEqual(["R1", "P1"]);
    expect((await h.handlers.GET(h.request("preparer", "GET", undefined, CASH_DOSSIER, "&operation=download&id=" + encodeURIComponent(view.imports[0].document.id)))).status).toBe(200);
  });
});
describe("CASH-905 bornes des requêtes", () => {
  it("refuse champ multipart inattendu, type de pièce inconnu et corps d’export surdimensionné", async () => {
    const form = (type: string, extra = false) => { const f = new FormData(); f.set("file", new File([CASH_CSV.cash_ledger], "gl.csv", { type: "text/csv" })); f.set("mapping", "{}"); f.set("period", JSON.stringify(cashPeriod)); f.set("documentType", type); if (extra) f.set("actorId", "forged"); return f; };
    expect(await h.json(await h.handlers.importsPOST(h.request("preparer", "POST", form("cash_ledger", true))))).toMatchObject({ status: 422, body: { error: "CASH_IMPORT_FIELDS_INVALID" } });
    expect((await h.json(await h.handlers.importsPOST(h.request("preparer", "POST", form("clients_general"))))).status).toBe(400);
    expect((await h.json(await h.handlers.exportPOST(exportRequest("preparer", { kind: "diagnostic", format: "html", expectedSnapshotHash: "0".repeat(64), padding: "x".repeat(5000) })))).status).toBe(413);
  });
});
describe("CASH-905 activation et codes d’erreur", () => {
  it("reste fermé hors recette jetable et en production", () => {
    expect(() => requireDisposableCash({})).toThrow(); expect(() => requireDisposableCash({ PROBANT_CASH_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableCash({ PROBANT_CASH_DURABLE: "disposable", VERCEL_ENV: "preview" })).not.toThrow();
  });
  it("traduit les refus métier en 422, les conflits en 409, sans masquer une panne", () => {
    expect([cashFailureStatus("CASH_OVERALLOCATION"), cashFailureStatus("SETTLEMENT_OUTSIDE_DOCUMENTED_WINDOW"), cashFailureStatus("CASH_ALLOCATION_ACCOUNT_MISMATCH")]).toEqual([422, 422, 422]);
    expect([cashFailureStatus("STALE_WORKPAPER_VERSION"), cashFailureStatus("CASH_SOURCE_REPLACED_REVISION_REQUIRED"), cashFailureStatus("SELF_APPROVAL_FORBIDDEN"), cashFailureStatus("TypeError: x")]).toEqual([409, 409, 403, 503]);
  });
});
